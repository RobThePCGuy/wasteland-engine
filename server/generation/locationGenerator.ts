import { randomUUID } from 'node:crypto';
import { buildGenerationContext } from '../world/contextBuilder.js';
import { getWorldProfile, getRegionForLocation } from '../world/worldService.js';
import { isEnabled } from '../world/featureFlags.js';
import { normalizeLocationSpec, admitLocationSpec } from './admission.js';
import { buildFallbackLocationSpec, LOCATION_SPEC_VERSION } from './contracts.js';
import type { LocationSpec } from './contracts.js';
import type { AdmissionResult } from './admission.js';
import { repairLocationSpec } from './repair.js';
import {
  validateBiomeConsistency,
  validateResourcePlausibility,
  validateNameUniqueness,
  validateMotifBans,
} from '../validators/worldRules.js';
import { buildValidationReport, ValidationSeverity } from '../validators/types.js';
import type { ValidationReport } from '../validators/types.js';
import {
  createGenerationRun,
  completeGenerationRun,
  insertLocationSpec,
} from './specStore.js';
import { db } from '../db.js';

// Lazy-cached AI SDK import - resolves once per server lifecycle
let _genaiModule: typeof import('@google/genai') | null = null;
async function getGenaiModule() {
  if (!_genaiModule) {
    _genaiModule = await import('@google/genai');
  }
  return _genaiModule;
}

const PROMPT_VERSION = 'location-v1';
const MAX_RETRIES = 1;
const AI_TIMEOUT_MS = 8000;

export interface GenerationResult {
  spec: LocationSpec;
  admission: AdmissionResult;
  run_id: string;
  trace_id: string; // Included from the updated version
  used_fallback: boolean;
  repairs_applied: string[];
}

/** Build the prompt for structured location generation. */
function buildLocationPrompt(context: {
  world_name: string;
  world_tone: string;
  world_climate: string;
  world_biome: string;
  world_scarcity: string;
  region_name: string;
  region_biome_tags: string[];
  region_hazard_tags: string[];
  region_resource_tags: string[];
  region_faction_tags: string[];
  player_level: number;
  player_karma: number;
  nearby_names: string[];
  active_quest_titles: string[];
  banned_motifs: string[];
}): string {
  return `You are a world builder for a post-apocalyptic RPG called "${context.world_name}".
Tone: ${context.world_tone}. Climate: ${context.world_climate}. Biome: ${context.world_biome}. Scarcity: ${context.world_scarcity}.

The player is exploring the "${context.region_name}" region.
Region biomes: ${context.region_biome_tags.join(', ') || 'unspecified'}.
Region hazards: ${context.region_hazard_tags.join(', ') || 'none known'}.
Region resources: ${context.region_resource_tags.join(', ') || 'unspecified'}.
Region factions: ${context.region_faction_tags.join(', ') || 'none known'}.

Player level: ${context.player_level}. Karma: ${context.player_karma}.
Nearby locations already discovered: ${context.nearby_names.join(', ') || 'none'}.
Active quests: ${context.active_quest_titles.join(', ') || 'none'}.

BANNED themes (do NOT use): ${context.banned_motifs.join(', ') || 'none'}.

Generate a new location for the player to discover. It must fit the region's biome and tone.
Return a structured JSON object with these exact fields:
- identity: { name, summary, tags (array of 2-4 descriptive tags) }
- environment: { biome (must match region), climate_notes, hazard_tags (array), resource_tags (array) }
- placement: { faction_presence (array of faction names present) }
- gameplay: { threat_level (one of: low, medium, high, extreme), encounter_tone, exploration_hooks (array of 1-3 hooks) }
- content_hints: { npc_archetypes (array), quest_hook_seeds (array), loot_themes (array) }

Keep names gritty and setting-appropriate. No generic fantasy names.`;
}

/** Run all validators against a spec and return the report. */
function validateSpec(spec: LocationSpec, regionBiomeTags: string[], regionResourceTags: string[], existingNames: string[], bannedMotifs: string[]): ValidationReport {
  const results = [
    ...validateBiomeConsistency(spec.environment.biome, regionBiomeTags),
    ...validateResourcePlausibility(spec.environment.resource_tags, regionResourceTags),
    ...validateNameUniqueness(spec.identity.name, existingNames),
    ...validateMotifBans(spec.identity.tags, bannedMotifs),
  ];
  return buildValidationReport(results);
}

/** Get existing location names for uniqueness checks. */
function getExistingLocationNames(): string[] {
  const rows = db.prepare('SELECT name FROM locations').all() as any[];
  return rows.map(r => r.name);
}

/** Build a prompt addendum describing validation failures so the AI can correct itself on retry. */
function buildRetryAddendum(report: ValidationReport): string {
  const issues = report.results
    .filter(r => r.severity === ValidationSeverity.Block || r.severity === ValidationSeverity.Repairable)
    .map(r => `- ${r.rule}: ${r.message}${r.suggestion ? ` Suggestion: ${r.suggestion}` : ''}`)
    .join('\n');
  return `\n\nYour previous attempt had these issues:\n${issues}\nPlease fix these problems in your next response.`;
}

/**
 * Attempt one round of AI generation. Returns the raw response text or null on failure.
 */
async function callAiGeneration(prompt: string): Promise<unknown | null> {
  try {
    const { GoogleGenAI } = await getGenaiModule();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      console.error('[locationGenerator] GEMINI_API_KEY is missing or using placeholder value.');
      return null;
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      },
    });

    if (!response.text) return null;

    const cleaned = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[locationGenerator] AI call failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate a structured LocationSpec for a new location.
 * Full pipeline: context -> AI -> normalize -> validate -> repair -> retry -> fallback -> admit -> persist.
 */
export async function generateLocationSpec(
  playerId: number,
  currentLocationId: number,
  options?: {
    trace_id?: string;
  },
): Promise<GenerationResult> {
  const world = getWorldProfile();
  const region = getRegionForLocation(currentLocationId);
  const context = buildGenerationContext(playerId, currentLocationId);

  const regionBiomeTags = region?.biome_tags ?? ['desert'];
  const regionHazardTags = region?.hazard_tags ?? [];
  const regionResourceTags = region?.resource_tags ?? [];
  const regionFactionTags = region?.faction_tags ?? [];
  const bannedMotifs = world?.banned_motifs ?? [];
  const existingNames = getExistingLocationNames();

  // Create a generation run record with trace support
  const run_id = createGenerationRun({
    run_type: 'location_spec',
    context_snapshot: context ?? {},
    trace_id: options?.trace_id,
    model_name: 'gemini-3-flash-preview',
    prompt_version: PROMPT_VERSION,
  });
  const trace_id = options?.trace_id ?? run_id;

  let spec: LocationSpec | null = null;
  let report: ValidationReport | null = null;
  let usedFallback = false;
  let repairsApplied: string[] = [];
  let retryCount = 0;

  if (isEnabled('structured_generation')) {
    const prompt = buildLocationPrompt({
      world_name: world?.name ?? 'The Wasteland',
      world_tone: world?.tone ?? 'gritty',
      world_climate: world?.climate ?? 'arid',
      world_biome: world?.biome ?? 'desert',
      world_scarcity: world?.scarcity_profile ?? 'scarce',
      region_name: region?.name ?? 'Unknown Region',
      region_biome_tags: regionBiomeTags,
      region_hazard_tags: regionHazardTags,
      region_resource_tags: regionResourceTags,
      region_faction_tags: regionFactionTags,
      player_level: context?.player.level ?? 1,
      player_karma: context?.player.karma ?? 0,
      nearby_names: context?.nearby_locations.map(l => l.name) ?? [],
      active_quest_titles: context?.active_quests.map(q => q.title) ?? [],
      banned_motifs: bannedMotifs,
    });

    let currentPrompt = prompt;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      retryCount = attempt;
      const rawOutput = await callAiGeneration(currentPrompt);
      if (!rawOutput) continue;

      const normalized = normalizeLocationSpec(rawOutput);
      normalized.identity.stable_id = normalized.identity.stable_id || `loc-${randomUUID()}`;
      if (!normalized.placement.region_stable_id) {
        normalized.placement.region_stable_id = region?.stable_id ?? '';
      }
      if (normalized.placement.nearby_location_ids.length === 0) {
        normalized.placement.nearby_location_ids = context?.nearby_locations.map(l => String(l.id)) ?? [];
      }

      report = validateSpec(normalized, regionBiomeTags, regionResourceTags, existingNames, bannedMotifs);

      if (report.passed && report.repairable_count === 0) {
        spec = normalized;
        break;
      }

      if (report.passed && report.repairable_count > 0) {
        const repairResult = repairLocationSpec(normalized, report, {
          biome_tags: regionBiomeTags,
          resource_tags: regionResourceTags,
        });
        if (repairResult.repaired) {
          spec = repairResult.spec;
          repairsApplied = repairResult.fixes_applied;
          report = validateSpec(spec, regionBiomeTags, regionResourceTags, existingNames, bannedMotifs);
          if (report.passed) break;
        }
      }

      if (report && attempt < MAX_RETRIES) {
        currentPrompt = prompt + buildRetryAddendum(report);
      }
      spec = null;
    }
  }

  if (!spec) {
    usedFallback = true;
    spec = buildFallbackLocationSpec({
      regionStableId: region?.stable_id ?? 'region-starter',
      regionBiomeTags,
      regionHazardTags,
      nearbyLocationIds: context?.nearby_locations.map(l => String(l.id)) ?? [],
      factionTags: regionFactionTags,
    });
    report = validateSpec(spec, regionBiomeTags, regionResourceTags, existingNames, bannedMotifs);
  }

  const admission = admitLocationSpec(spec, report!);

  completeGenerationRun({
    run_id,
    result_status: usedFallback ? 'fallback' : (admission.decision === 'admit' || admission.decision === 'repair_needed' ? 'success' : 'failed'),
    result_data: spec,
    validation_report: report!,
    retry_count: retryCount,
  });

  insertLocationSpec({
    spec,
    run_id,
    trace_id,
    admission_status: usedFallback ? 'admitted' : (admission.decision === 'admit' ? 'admitted' : admission.decision === 'repair_needed' ? 'repaired' : 'rejected'),
  });

  return {
    spec,
    admission,
    run_id,
    trace_id,
    used_fallback: usedFallback,
    repairs_applied: repairsApplied,
  };
}