import type { LocationSpec } from './contracts.js';
import { insertWorldFact } from '../world/worldService.js';
import { CanonLevel } from '../world/types.js';
import { canPromote, recordPromotion } from '../world/canonPolicy.js';
import type { LayoutGenerationOptions } from '../mapgen.js';
import { createSeededRng } from '../utils/seededRng.js';

/**
 * Realizer: translates an admitted LocationSpec into concrete game data.
 *
 * The AI (or fallback) produces a LocationSpec with content_hints and gameplay
 * fields describing *what* should exist at a location. The realizer turns those
 * hints into deterministic NPC selections, loot lists, and encounter parameters
 * that the travel route can spawn.
 *
 * Determinism comes from a seeded PRNG keyed on the spec's stable_id, so
 * regenerating from the same spec always produces the same results.
 */

export { createSeededRng } from '../utils/seededRng.js';

export const RUNTIME_REALIZATION_VERSION = 'runtime-realizer-v2';

// ---------------------------------------------------------------------------
// NPC Template Registry
// ---------------------------------------------------------------------------

export interface NpcTemplate {
  name: string;
  description: string;
  type: string;
  hostile: boolean;
  base_hp: number;
  archetype_tags: string[];
}

const NPC_TEMPLATES: NpcTemplate[] = [
  {
    name: 'Scavenger',
    description: 'A lone wanderer picking through the ruins for anything useful.',
    type: 'human',
    hostile: false,
    base_hp: 20,
    archetype_tags: ['scavenger', 'drifter', 'trader'],
  },
  {
    name: 'Raider',
    description: 'A violent opportunist who takes what they want by force.',
    type: 'human',
    hostile: true,
    base_hp: 25,
    archetype_tags: ['raider', 'bandit', 'thug'],
  },
  {
    name: 'Ghoul',
    description: 'A radiation-scarred mutant driven by hunger and rage.',
    type: 'mutant',
    hostile: true,
    base_hp: 15,
    archetype_tags: ['ghoul', 'mutant', 'feral'],
  },
  {
    name: 'Guard',
    description: 'A disciplined sentry keeping watch over a settlement.',
    type: 'human',
    hostile: false,
    base_hp: 30,
    archetype_tags: ['guard', 'militia', 'patrol'],
  },
  {
    name: 'Wasteland Beast',
    description: 'A feral creature adapted to the irradiated wastes.',
    type: 'animal',
    hostile: true,
    base_hp: 20,
    archetype_tags: ['beast', 'hound', 'creature', 'animal'],
  },
  {
    name: 'Merchant',
    description: 'A shrewd trader hauling goods between settlements.',
    type: 'human',
    hostile: false,
    base_hp: 15,
    archetype_tags: ['merchant', 'trader', 'vendor'],
  },
];

// ---------------------------------------------------------------------------
// Threat Level -> NPC Count
// ---------------------------------------------------------------------------

const THREAT_NPC_COUNTS: Record<string, { min: number; max: number }> = {
  low: { min: 1, max: 2 },
  medium: { min: 1, max: 3 },
  high: { min: 2, max: 4 },
  extreme: { min: 3, max: 5 },
};

// ---------------------------------------------------------------------------
// Loot Theme -> Item Selection
// ---------------------------------------------------------------------------

const LOOT_THEMES: Record<string, string[]> = {
  junk: ['Scrap Metal'],
  salvage: ['Scrap Metal'],
  tech: ['Stimpak'],
  medical: ['Stimpak', 'RadAway'],
  ammo: ['10mm Ammo'],
  weapons: ['10mm Pistol'],
  armor: ['Leather Armor'],
};

// ---------------------------------------------------------------------------
// Archetype Matching
// ---------------------------------------------------------------------------

/**
 * Find the best NPC template for a given spec archetype string.
 *
 * Uses fuzzy substring matching: a template matches if any of its
 * archetype_tags is a substring of the spec archetype, or vice versa.
 * When multiple templates match, one is chosen via the seeded RNG.
 * Falls back to a random template if nothing matches.
 */
function matchArchetype(archetype: string, rng: () => number): NpcTemplate {
  const lower = archetype.toLowerCase();

  const matches = NPC_TEMPLATES.filter((t) =>
    t.archetype_tags.some(
      (tag) => lower.includes(tag) || tag.includes(lower),
    ),
  );

  if (matches.length > 0) {
    return matches[Math.floor(rng() * matches.length)];
  }

  // No match - pick a random template
  return NPC_TEMPLATES[Math.floor(rng() * NPC_TEMPLATES.length)];
}

// ---------------------------------------------------------------------------
// Loot Determination
// ---------------------------------------------------------------------------

/**
 * Collect loot item names from the spec's loot_themes.
 * Deduplicates so the same item isn't listed twice.
 */
function determineLoot(lootThemes: string[], rng: () => number): string[] {
  const items = new Set<string>();

  for (const theme of lootThemes) {
    const pool = LOOT_THEMES[theme.toLowerCase()];
    if (pool) {
      // Pick one item from the theme's pool
      items.add(pool[Math.floor(rng() * pool.length)]);
    }
  }

  return Array.from(items);
}

// ---------------------------------------------------------------------------
// Main Realizer
// ---------------------------------------------------------------------------

export interface RealizationPlan {
  npcs: Array<{
    template: NpcTemplate;
    position_index: number;
  }>;
  loot_item_names: string[];
  npc_count: number;
}

export function buildLayoutGenerationOptionsFromSpec(spec: LocationSpec): LayoutGenerationOptions {
  return {
    stable_id: spec.identity.stable_id,
    biome: spec.environment.biome,
    threat_level: spec.gameplay.threat_level,
    hazard_tags: spec.environment.hazard_tags,
    site_tags: spec.identity.tags,
    faction_presence: spec.placement.faction_presence,
  };
}

/**
 * Translate an admitted LocationSpec into a concrete RealizationPlan.
 *
 * The plan describes which NPC templates to spawn, where to place them,
 * and which loot items to distribute - all deterministically derived from
 * the spec's stable_id so repeated calls produce identical results.
 */
export function realizeFromSpec(spec: LocationSpec): RealizationPlan {
  const rng = createSeededRng(spec.identity.stable_id);

  // 1. Determine NPC count from threat level
  const range =
    THREAT_NPC_COUNTS[spec.gameplay.threat_level] ?? THREAT_NPC_COUNTS.medium;
  const npc_count =
    range.min + Math.floor(rng() * (range.max - range.min + 1));

  // 2. Select NPC templates based on archetypes
  const npcs: RealizationPlan['npcs'] = [];
  for (let i = 0; i < npc_count; i++) {
    const archetypes = spec.content_hints.npc_archetypes;
    const archetype =
      archetypes.length > 0 ? archetypes[i % archetypes.length] : '';
    const template = matchArchetype(archetype, rng);
    npcs.push({ template, position_index: i });
  }

  // 3. Determine loot from themes
  const loot_item_names = determineLoot(spec.content_hints.loot_themes, rng);

  return { npcs, loot_item_names, npc_count };
}

// ---------------------------------------------------------------------------
// Canon Fact Recording
// ---------------------------------------------------------------------------

/**
 * Record a canon fact for a newly discovered location.
 * Called after the location is persisted, so the fact links to real data.
 */
export function recordLocationDiscovery(spec: LocationSpec, regionId: number | null): void {
  const stableId = `fact-discovered-${spec.identity.stable_id}`;

  const factId = insertWorldFact({
    stable_id: stableId,
    fact_type: 'location_discovered',
    scope: regionId ? 'regional' : 'local',
    subject: spec.identity.name,
    body: `${spec.identity.summary} Biome: ${spec.environment.biome}. Tags: ${spec.identity.tags.join(', ')}.`,
    region_id: regionId,
    canon_level: CanonLevel.RuntimeOnly,
    source: 'generation_pipeline',
  });

  // Auto-promote if the canon policy allows it
  if (canPromote('location_discovered', CanonLevel.RegionalFact, true)) {
    recordPromotion(factId, CanonLevel.RegionalFact, 'generation_pipeline', 'Auto-promoted on discovery');
  }
}
