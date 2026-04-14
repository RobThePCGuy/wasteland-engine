import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { repairLocationSpec } from '../server/generation/repair.js';
import { normalizeLocationSpec, admitLocationSpec } from '../server/generation/admission.js';
import { ValidationSeverity, buildValidationReport } from '../server/validators/types.js';
import type { LocationSpec } from '../server/generation/contracts.js';

function makeSpec(overrides?: Partial<LocationSpec>): LocationSpec {
  return {
    schema_version: 1,
    identity: { name: 'Test Place', summary: 'A test.', tags: ['desert', 'ruins'], stable_id: 'loc-test-1' },
    environment: { biome: 'desert', climate_notes: 'Dry.', hazard_tags: ['radiation'], resource_tags: ['scrap'] },
    placement: { region_stable_id: 'region-1', nearby_location_ids: [], faction_presence: [] },
    gameplay: { threat_level: 'medium', encounter_tone: 'cautious', exploration_hooks: ['search'] },
    content_hints: { npc_archetypes: ['scavenger'], quest_hook_seeds: ['supply run'], loot_themes: ['junk'] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// repairLocationSpec
// ---------------------------------------------------------------------------

describe('repairLocationSpec', () => {
  it('returns repaired: false when there are no repairable issues (empty results)', () => {
    const spec = makeSpec();
    const report = buildValidationReport([]);
    const regionContext = { biome_tags: ['forest'], resource_tags: ['wood'] };

    const result = repairLocationSpec(spec, report, regionContext);

    assert.equal(result.repaired, false);
    assert.deepEqual(result.fixes_applied, []);
  });

  it('returns repaired: false when only Block issues exist', () => {
    const spec = makeSpec();
    const report = buildValidationReport([
      { severity: ValidationSeverity.Block, rule: 'schema_check', message: 'missing fields' },
    ]);
    const regionContext = { biome_tags: ['forest'], resource_tags: ['wood'] };

    const result = repairLocationSpec(spec, report, regionContext);

    assert.equal(result.repaired, false);
    assert.deepEqual(result.fixes_applied, []);
  });

  it('returns repaired: false when only WarnOnly issues exist', () => {
    const spec = makeSpec();
    const report = buildValidationReport([
      { severity: ValidationSeverity.WarnOnly, rule: 'tone_check', message: 'mild tone mismatch' },
    ]);
    const regionContext = { biome_tags: ['forest'], resource_tags: ['wood'] };

    const result = repairLocationSpec(spec, report, regionContext);

    assert.equal(result.repaired, false);
    assert.deepEqual(result.fixes_applied, []);
  });

  it('fixes biome mismatch using the region first biome tag', () => {
    const spec = makeSpec({
      environment: { biome: 'tundra', climate_notes: 'Cold.', hazard_tags: [], resource_tags: [] },
    });
    const report = buildValidationReport([
      { severity: ValidationSeverity.Repairable, rule: 'biome_consistency', message: 'biome does not match region' },
    ]);
    const regionContext = { biome_tags: ['forest', 'swamp'], resource_tags: ['wood'] };

    const result = repairLocationSpec(spec, report, regionContext);

    assert.equal(result.repaired, true);
    assert.equal(result.spec.environment.biome, 'forest');
    assert.ok(result.fixes_applied.some(f => f.includes('forest')));
  });

  it('fixes resource contradiction by removing water tags', () => {
    const spec = makeSpec({
      environment: {
        biome: 'desert',
        climate_notes: 'Dry.',
        hazard_tags: [],
        resource_tags: ['scrap', 'water_abundant', 'water_plentiful', 'metal'],
      },
    });
    const report = buildValidationReport([
      { severity: ValidationSeverity.Repairable, rule: 'resource_plausibility', message: 'water in desert' },
    ]);
    const regionContext = { biome_tags: ['desert'], resource_tags: [] };

    const result = repairLocationSpec(spec, report, regionContext);

    assert.equal(result.repaired, true);
    assert.deepEqual(result.spec.environment.resource_tags, ['scrap', 'metal']);
    assert.ok(result.fixes_applied.some(f => f.includes('water')));
  });

  it('does not mutate the original spec', () => {
    const spec = makeSpec({
      environment: {
        biome: 'tundra',
        climate_notes: 'Cold.',
        hazard_tags: [],
        resource_tags: ['water_abundant'],
      },
    });
    const originalBiome = spec.environment.biome;
    const originalResources = [...spec.environment.resource_tags];

    const report = buildValidationReport([
      { severity: ValidationSeverity.Repairable, rule: 'biome_consistency', message: 'biome mismatch' },
      { severity: ValidationSeverity.Repairable, rule: 'resource_plausibility', message: 'water contradiction' },
    ]);
    const regionContext = { biome_tags: ['forest'], resource_tags: [] };

    repairLocationSpec(spec, report, regionContext);

    assert.equal(spec.environment.biome, originalBiome);
    assert.deepEqual(spec.environment.resource_tags, originalResources);
  });

  it('handles multiple repairs in one pass', () => {
    const spec = makeSpec({
      environment: {
        biome: 'tundra',
        climate_notes: 'Cold.',
        hazard_tags: [],
        resource_tags: ['water_plentiful', 'scrap'],
      },
    });
    const report = buildValidationReport([
      { severity: ValidationSeverity.Repairable, rule: 'biome_consistency', message: 'biome mismatch' },
      { severity: ValidationSeverity.Repairable, rule: 'resource_plausibility', message: 'water contradiction' },
    ]);
    const regionContext = { biome_tags: ['swamp'], resource_tags: [] };

    const result = repairLocationSpec(spec, report, regionContext);

    assert.equal(result.repaired, true);
    assert.equal(result.spec.environment.biome, 'swamp');
    assert.deepEqual(result.spec.environment.resource_tags, ['scrap']);
    assert.equal(result.fixes_applied.length, 2);
  });
});

// ---------------------------------------------------------------------------
// normalizeLocationSpec - edge cases
// ---------------------------------------------------------------------------

describe('normalizeLocationSpec edge cases', () => {
  it('handles deeply nested valid input and preserves all fields', () => {
    const raw = {
      schema_version: 1,
      identity: { name: 'Deep Bunker', summary: 'Underground vault.', tags: ['bunker', 'underground'], stable_id: 'loc-deep-1' },
      environment: { biome: 'underground', climate_notes: 'Damp.', hazard_tags: ['collapse'], resource_tags: ['metal', 'water'] },
      placement: { region_stable_id: 'region-2', nearby_location_ids: ['loc-a', 'loc-b'], faction_presence: ['vault_dwellers'] },
      gameplay: { threat_level: 'high', encounter_tone: 'tense', exploration_hooks: ['hidden passage', 'old terminal'] },
      content_hints: { npc_archetypes: ['engineer', 'guard'], quest_hook_seeds: ['power restore'], loot_themes: ['tech', 'medical'] },
    };

    const spec = normalizeLocationSpec(raw);

    assert.equal(spec.schema_version, 1);
    assert.equal(spec.identity.name, 'Deep Bunker');
    assert.equal(spec.identity.summary, 'Underground vault.');
    assert.deepEqual(spec.identity.tags, ['bunker', 'underground']);
    assert.equal(spec.identity.stable_id, 'loc-deep-1');
    assert.equal(spec.environment.biome, 'underground');
    assert.equal(spec.environment.climate_notes, 'Damp.');
    assert.deepEqual(spec.environment.hazard_tags, ['collapse']);
    assert.deepEqual(spec.environment.resource_tags, ['metal', 'water']);
    assert.equal(spec.placement.region_stable_id, 'region-2');
    assert.deepEqual(spec.placement.nearby_location_ids, ['loc-a', 'loc-b']);
    assert.deepEqual(spec.placement.faction_presence, ['vault_dwellers']);
    assert.equal(spec.gameplay.threat_level, 'high');
    assert.equal(spec.gameplay.encounter_tone, 'tense');
    assert.deepEqual(spec.gameplay.exploration_hooks, ['hidden passage', 'old terminal']);
    assert.deepEqual(spec.content_hints.npc_archetypes, ['engineer', 'guard']);
    assert.deepEqual(spec.content_hints.quest_hook_seeds, ['power restore']);
    assert.deepEqual(spec.content_hints.loot_themes, ['tech', 'medical']);
  });

  it('handles input with name at top level (not nested in identity)', () => {
    const raw = { name: 'Surface Camp' };
    const spec = normalizeLocationSpec(raw);

    assert.equal(spec.identity.name, 'Surface Camp');
  });

  it('handles input with description mapped to identity.summary', () => {
    const raw = { description: 'Ruins of a hospital.' };
    const spec = normalizeLocationSpec(raw);

    assert.equal(spec.identity.summary, 'Ruins of a hospital.');
  });

  it('handles numeric input and returns default spec structure', () => {
    const spec = normalizeLocationSpec(42 as unknown);

    assert.equal(spec.identity.name, 'Unknown Location');
    assert.equal(spec.environment.biome, 'desert');
    assert.equal(spec.schema_version, 1);
    assert.ok(Array.isArray(spec.identity.tags));
    assert.ok(Array.isArray(spec.environment.hazard_tags));
  });

  it('handles boolean input and returns default spec structure', () => {
    const spec = normalizeLocationSpec(true as unknown);

    assert.equal(spec.identity.name, 'Unknown Location');
    assert.equal(spec.environment.biome, 'desert');
    assert.equal(spec.schema_version, 1);
    assert.ok(Array.isArray(spec.identity.tags));
    assert.ok(Array.isArray(spec.content_hints.npc_archetypes));
  });
});

// ---------------------------------------------------------------------------
// admitLocationSpec - additional cases
// ---------------------------------------------------------------------------

describe('admitLocationSpec additional', () => {
  it('admits when report has only warn_only issues', () => {
    const spec = makeSpec();
    const report = buildValidationReport([
      { severity: ValidationSeverity.WarnOnly, rule: 'tone_check', message: 'tone is slightly off' },
      { severity: ValidationSeverity.WarnOnly, rule: 'naming_style', message: 'name could be improved' },
    ]);

    const result = admitLocationSpec(spec, report);

    assert.equal(result.decision, 'admit');
    assert.ok(result.admitted_at);
    assert.equal(result.validation.warn_count, 2);
  });

  it('returns repair_needed when repairable_count > 0 even with warn_only present', () => {
    const spec = makeSpec();
    const report = buildValidationReport([
      { severity: ValidationSeverity.WarnOnly, rule: 'tone_check', message: 'tone mismatch' },
      { severity: ValidationSeverity.Repairable, rule: 'biome_consistency', message: 'biome mismatch' },
    ]);

    const result = admitLocationSpec(spec, report);

    assert.equal(result.decision, 'repair_needed');
    assert.equal(result.validation.repairable_count, 1);
    assert.equal(result.validation.warn_count, 1);
    assert.equal(result.admitted_at, undefined);
  });
});
