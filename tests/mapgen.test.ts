import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExplorationPositions,
  buildLayoutTuning,
  generateLocationLayout,
} from '../server/mapgen.js';
import { buildLayoutGenerationOptionsFromSpec } from '../server/generation/realizer.js';
import type { LocationSpec } from '../server/generation/contracts.js';

function makeSpec(overrides?: Partial<LocationSpec>): LocationSpec {
  return {
    schema_version: 1,
    identity: {
      name: 'Vault Relay',
      summary: 'A fortified relay bunker.',
      tags: ['vault', 'relay', 'settlement'],
      stable_id: 'loc-layout-seed-1',
    },
    environment: {
      biome: 'underground',
      climate_notes: 'Dry and stale.',
      hazard_tags: ['radiation', 'bandits'],
      resource_tags: ['tech'],
    },
    placement: {
      region_stable_id: 'region-starter',
      nearby_location_ids: [],
      faction_presence: ['scavengers'],
    },
    gameplay: {
      threat_level: 'high',
      encounter_tone: 'tense',
      exploration_hooks: ['sealed door'],
    },
    content_hints: {
      npc_archetypes: ['guard'],
      quest_hook_seeds: ['power restore'],
      loot_themes: ['tech'],
    },
    ...overrides,
  };
}

describe('buildLayoutTuning', () => {
  it('raises obstruction pressure for high-threat fortified sites', () => {
    const baseline = buildLayoutTuning({ biome: 'desert', threat_level: 'low' });
    const fortified = buildLayoutTuning({
      biome: 'underground',
      threat_level: 'extreme',
      hazard_tags: ['radiation', 'bandits'],
      site_tags: ['vault', 'settlement'],
      faction_presence: ['raiders'],
    });

    assert.ok(fortified.rubble_chance > baseline.rubble_chance);
    assert.ok(fortified.cluster_count_min > baseline.cluster_count_min);
    assert.ok(fortified.wall_bias > baseline.wall_bias);
  });
});

describe('generateLocationLayout', () => {
  it('is deterministic for the same stable_id and layout inputs', () => {
    const options = {
      stable_id: 'loc-repeatable-layout',
      biome: 'underground',
      threat_level: 'high' as const,
      hazard_tags: ['radiation', 'bandits'],
      site_tags: ['vault'],
      faction_presence: ['raiders'],
    };

    const first = generateLocationLayout(options);
    const second = generateLocationLayout(options);

    assert.deepEqual(first, second);
  });

  it('assignExplorationPositions is deterministic when seeded', () => {
    const layout = generateLocationLayout({ stable_id: 'loc-position-layout' });
    const first = assignExplorationPositions(layout, 3, 'seeded-positions');
    const second = assignExplorationPositions(layout, 3, 'seeded-positions');

    assert.deepEqual(first, second);
  });
});

describe('buildLayoutGenerationOptionsFromSpec', () => {
  it('maps spec semantics into layout generation inputs', () => {
    const spec = makeSpec();
    const options = buildLayoutGenerationOptionsFromSpec(spec);

    assert.equal(options.stable_id, spec.identity.stable_id);
    assert.equal(options.biome, spec.environment.biome);
    assert.equal(options.threat_level, spec.gameplay.threat_level);
    assert.deepEqual(options.hazard_tags, spec.environment.hazard_tags);
    assert.deepEqual(options.site_tags, spec.identity.tags);
    assert.deepEqual(options.faction_presence, spec.placement.faction_presence);
  });
});