import { randomUUID } from 'node:crypto';
import type { LocationSpec } from './contracts.js';
import type { ValidationReport } from '../validators/types.js';

/**
 * Admission decisions for generated content.
 * Separates runtime persistence from canon promotion.
 */

export type AdmissionDecision = 'admit' | 'repair_needed' | 'reject';

export interface AdmissionResult {
  decision: AdmissionDecision;
  spec: LocationSpec;
  validation: ValidationReport;
  admitted_at?: string;
}

/**
 * Normalize raw AI output into engine vocabulary.
 * This is a thin scaffold - future phases will add tag mapping,
 * enum alignment, and vocabulary translation.
 */
/**
 * Attempt to coerce raw input into a usable object.
 * LLMs commonly return JSON as a string, often wrapped in markdown code fences.
 */
function coerceToObject(raw: unknown): Record<string, any> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }

  if (typeof raw === 'string') {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (cleaned) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, any>;
        }
      } catch {
        // Not valid JSON - fall through to empty object
      }
    }
  }

  return {};
}

export function normalizeLocationSpec(rawOutput: unknown): LocationSpec {
  const obj = coerceToObject(rawOutput);

  return {
    schema_version: obj.schema_version ?? 1,
    identity: {
      name: String(obj.identity?.name ?? obj.name ?? 'Unknown Location'),
      summary: String(obj.identity?.summary ?? obj.summary ?? obj.description ?? ''),
      tags: Array.isArray(obj.identity?.tags) ? obj.identity.tags : [],
      stable_id: String(obj.identity?.stable_id ?? obj.stable_id ?? `loc-${randomUUID()}`),
    },
    environment: {
      biome: String(obj.environment?.biome ?? obj.biome ?? 'desert'),
      climate_notes: String(obj.environment?.climate_notes ?? ''),
      hazard_tags: Array.isArray(obj.environment?.hazard_tags) ? obj.environment.hazard_tags : [],
      resource_tags: Array.isArray(obj.environment?.resource_tags) ? obj.environment.resource_tags : [],
    },
    placement: {
      region_stable_id: String(obj.placement?.region_stable_id ?? ''),
      nearby_location_ids: Array.isArray(obj.placement?.nearby_location_ids) ? obj.placement.nearby_location_ids : [],
      faction_presence: Array.isArray(obj.placement?.faction_presence) ? obj.placement.faction_presence : [],
    },
    gameplay: {
      threat_level: (['low', 'medium', 'high', 'extreme'].includes(obj.gameplay?.threat_level) ? obj.gameplay.threat_level : 'medium') as LocationSpec['gameplay']['threat_level'],
      encounter_tone: String(obj.gameplay?.encounter_tone ?? 'neutral'),
      exploration_hooks: Array.isArray(obj.gameplay?.exploration_hooks) ? obj.gameplay.exploration_hooks : [],
    },
    content_hints: {
      npc_archetypes: Array.isArray(obj.content_hints?.npc_archetypes) ? obj.content_hints.npc_archetypes : [],
      quest_hook_seeds: Array.isArray(obj.content_hints?.quest_hook_seeds) ? obj.content_hints.quest_hook_seeds : [],
      loot_themes: Array.isArray(obj.content_hints?.loot_themes) ? obj.content_hints.loot_themes : [],
    },
  };
}

/**
 * Decide whether to admit a spec based on its validation report.
 * Separates runtime persistence from canon promotion.
 */
export function admitLocationSpec(
  spec: LocationSpec,
  report: ValidationReport,
): AdmissionResult {
  if (!report.passed) {
    return {
      decision: 'reject',
      spec,
      validation: report,
    };
  }

  if (report.repairable_count > 0) {
    return {
      decision: 'repair_needed',
      spec,
      validation: report,
    };
  }

  return {
    decision: 'admit',
    spec,
    validation: report,
    admitted_at: new Date().toISOString(),
  };
}
