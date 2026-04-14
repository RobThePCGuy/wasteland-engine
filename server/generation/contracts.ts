import { randomUUID } from 'node:crypto';

/**
 * Generation output contracts.
 * Both AI-generated and deterministic fallback outputs must conform
 * to these interfaces for validation and admission.
 */

export const LOCATION_SPEC_VERSION = 1;

export interface LocationSpecIdentity {
  name: string;
  summary: string;
  tags: string[];
  stable_id: string;
}

export interface LocationSpecEnvironment {
  biome: string;
  climate_notes: string;
  hazard_tags: string[];
  resource_tags: string[];
}

export interface LocationSpecPlacement {
  region_stable_id: string;
  nearby_location_ids: string[];
  faction_presence: string[];
}

export interface LocationSpecGameplay {
  threat_level: 'low' | 'medium' | 'high' | 'extreme';
  encounter_tone: string;
  exploration_hooks: string[];
}

export interface LocationSpecContentHints {
  npc_archetypes: string[];
  quest_hook_seeds: string[];
  loot_themes: string[];
}

export interface LocationSpec {
  schema_version: number;
  identity: LocationSpecIdentity;
  environment: LocationSpecEnvironment;
  placement: LocationSpecPlacement;
  gameplay: LocationSpecGameplay;
  content_hints: LocationSpecContentHints;
}

/**
 * Generate a deterministic fallback LocationSpec.
 * This produces the exact same contract shape as AI-generated specs,
 * ensuring the pipeline works even when AI is unavailable.
 */
export function buildFallbackLocationSpec(context: {
  regionStableId: string;
  regionBiomeTags: string[];
  regionHazardTags: string[];
  nearbyLocationIds: string[];
  factionTags: string[];
}): LocationSpec {
  const uuid = randomUUID();
  const stableId = `loc-fallback-${uuid}`;
  const suffix = uuid.slice(0, 4).toUpperCase();
  const biome = context.regionBiomeTags[0] ?? 'desert';

  return {
    schema_version: LOCATION_SPEC_VERSION,
    identity: {
      name: `Unmarked Settlement ${suffix}`,
      summary: 'A small cluster of makeshift shelters and scavenged materials.',
      tags: ['settlement', 'small', biome],
      stable_id: stableId,
    },
    environment: {
      biome,
      climate_notes: 'Dry and windswept.',
      hazard_tags: context.regionHazardTags.slice(0, 2),
      resource_tags: ['scrap', 'scavenge'],
    },
    placement: {
      region_stable_id: context.regionStableId,
      nearby_location_ids: context.nearbyLocationIds,
      faction_presence: context.factionTags.slice(0, 1),
    },
    gameplay: {
      threat_level: 'medium',
      encounter_tone: 'cautious',
      exploration_hooks: ['scavenging opportunity', 'possible survivors'],
    },
    content_hints: {
      npc_archetypes: ['scavenger', 'drifter'],
      quest_hook_seeds: ['supply run'],
      loot_themes: ['junk', 'salvage'],
    },
  };
}
