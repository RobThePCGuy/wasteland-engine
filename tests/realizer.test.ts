import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRng, realizeFromSpec } from '../server/generation/realizer.js';
import type { LocationSpec } from '../server/generation/contracts.js';

function makeSpec(overrides?: Partial<LocationSpec>): LocationSpec {
  return {
    schema_version: 1,
    identity: { name: 'Test Outpost', summary: 'A test.', tags: ['desert'], stable_id: 'loc-test-seed-abc' },
    environment: { biome: 'desert', climate_notes: 'Dry.', hazard_tags: [], resource_tags: ['scrap'] },
    placement: { region_stable_id: 'region-1', nearby_location_ids: [], faction_presence: [] },
    gameplay: { threat_level: 'medium', encounter_tone: 'cautious', exploration_hooks: ['search'] },
    content_hints: { npc_archetypes: ['raider', 'scavenger'], quest_hook_seeds: ['supply run'], loot_themes: ['junk', 'medical'] },
    ...overrides,
  };
}

describe('createSeededRng', () => {
  it('produces deterministic output for the same seed', () => {
    const rng1 = createSeededRng('test-seed-123');
    const rng2 = createSeededRng('test-seed-123');
    const vals1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
    const vals2 = [rng2(), rng2(), rng2(), rng2(), rng2()];
    assert.deepEqual(vals1, vals2);
  });

  it('produces different output for different seeds', () => {
    const rng1 = createSeededRng('seed-alpha');
    const rng2 = createSeededRng('seed-beta');
    const vals1 = [rng1(), rng1(), rng1()];
    const vals2 = [rng2(), rng2(), rng2()];
    assert.notDeepEqual(vals1, vals2);
  });

  it('returns values in [0, 1)', () => {
    const rng = createSeededRng('range-check');
    for (let i = 0; i < 100; i++) {
      const val = rng();
      assert.ok(val >= 0, `Value ${val} is below 0`);
      assert.ok(val < 1, `Value ${val} is >= 1`);
    }
  });
});

describe('realizeFromSpec', () => {
  it('produces a plan with NPCs within threat level bounds', () => {
    const spec = makeSpec({ gameplay: { threat_level: 'low', encounter_tone: 'calm', exploration_hooks: [] } });
    const plan = realizeFromSpec(spec);
    assert.ok(plan.npc_count >= 1 && plan.npc_count <= 2, `low threat should give 1-2 NPCs, got ${plan.npc_count}`);
    assert.equal(plan.npcs.length, plan.npc_count);
  });

  it('extreme threat produces more NPCs than low', () => {
    const low = makeSpec({
      identity: { name: 'A', summary: '', tags: [], stable_id: 'loc-low-threat' },
      gameplay: { threat_level: 'low', encounter_tone: '', exploration_hooks: [] },
    });
    const extreme = makeSpec({
      identity: { name: 'B', summary: '', tags: [], stable_id: 'loc-extreme-threat' },
      gameplay: { threat_level: 'extreme', encounter_tone: '', exploration_hooks: [] },
    });
    const planLow = realizeFromSpec(low);
    const planExtreme = realizeFromSpec(extreme);
    // Extreme min (3) > low max (2)
    assert.ok(planExtreme.npc_count >= 3, `extreme should have at least 3 NPCs, got ${planExtreme.npc_count}`);
    assert.ok(planLow.npc_count <= 2, `low should have at most 2 NPCs, got ${planLow.npc_count}`);
  });

  it('matches raider archetype to hostile NPC template', () => {
    const spec = makeSpec({
      content_hints: { npc_archetypes: ['raider'], quest_hook_seeds: [], loot_themes: [] },
      gameplay: { threat_level: 'medium', encounter_tone: '', exploration_hooks: [] },
    });
    const plan = realizeFromSpec(spec);
    // At least one NPC should be hostile and match raider
    const hasRaider = plan.npcs.some(n => n.template.hostile && n.template.archetype_tags.includes('raider'));
    assert.ok(hasRaider, 'Should have matched a raider-tagged hostile NPC');
  });

  it('deterministic: same spec produces same plan', () => {
    const spec = makeSpec();
    const plan1 = realizeFromSpec(spec);
    const plan2 = realizeFromSpec(spec);
    assert.equal(plan1.npc_count, plan2.npc_count);
    assert.equal(plan1.npcs.length, plan2.npcs.length);
    for (let i = 0; i < plan1.npcs.length; i++) {
      assert.equal(plan1.npcs[i].template.name, plan2.npcs[i].template.name);
    }
    assert.deepEqual(plan1.loot_item_names, plan2.loot_item_names);
  });

  it('different stable_id produces different RNG sequence', () => {
    // Test the underlying PRNG divergence rather than plan equality (which can collide)
    const rngA = createSeededRng('loc-completely-different-alpha-seed-12345');
    const rngB = createSeededRng('loc-totally-other-beta-seed-67890');
    const seqA = [rngA(), rngA(), rngA(), rngA(), rngA()];
    const seqB = [rngB(), rngB(), rngB(), rngB(), rngB()];
    assert.notDeepEqual(seqA, seqB, 'Different seeds must produce different RNG sequences');
  });

  it('maps medical loot theme to Stimpak or RadAway', () => {
    const spec = makeSpec({
      content_hints: { npc_archetypes: ['scavenger'], quest_hook_seeds: [], loot_themes: ['medical'] },
    });
    const plan = realizeFromSpec(spec);
    const hasMedical = plan.loot_item_names.some(n => n === 'Stimpak' || n === 'RadAway');
    assert.ok(hasMedical, `medical theme should produce Stimpak or RadAway, got: ${plan.loot_item_names}`);
  });

  it('handles empty archetypes without crashing', () => {
    const spec = makeSpec({
      content_hints: { npc_archetypes: [], quest_hook_seeds: [], loot_themes: [] },
    });
    const plan = realizeFromSpec(spec);
    assert.ok(plan.npc_count >= 1, 'Should still spawn NPCs even with empty archetypes');
    assert.ok(plan.npcs.length === plan.npc_count);
  });
});
