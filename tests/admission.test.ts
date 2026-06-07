import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocationSpec, admitLocationSpec } from '../server/generation/admission.js';
import { buildFallbackLocationSpec, LOCATION_SPEC_VERSION } from '../server/generation/contracts.js';
import { buildValidationReport } from '../server/validators/types.js';
import { ValidationSeverity } from '../server/validators/types.js';

describe('normalizeLocationSpec', () => {
  it('normalizes minimal raw output into full spec shape', () => {
    const raw = { name: 'Test Place', description: 'A test.' };
    const spec = normalizeLocationSpec(raw);

    assert.equal(spec.identity.name, 'Test Place');
    assert.equal(spec.identity.summary, 'A test.');
    assert.equal(typeof spec.identity.stable_id, 'string');
    assert.ok(spec.identity.stable_id.startsWith('loc-'));
    assert.equal(spec.environment.biome, 'desert');
    assert.equal(spec.gameplay.threat_level, 'medium');
    assert.ok(Array.isArray(spec.content_hints.npc_archetypes));
  });

  it('handles null input without crashing', () => {
    const spec = normalizeLocationSpec(null);
    assert.equal(spec.identity.name, 'Unknown Location');
    assert.equal(spec.environment.biome, 'desert');
    assert.ok(spec.identity.stable_id.startsWith('loc-'));
  });

  it('parses JSON string input from LLM', () => {
    const jsonString = JSON.stringify({ name: 'Scrapyard', description: 'Piles of junk.' });
    const spec = normalizeLocationSpec(jsonString);
    assert.equal(spec.identity.name, 'Scrapyard');
    assert.equal(spec.identity.summary, 'Piles of junk.');
  });

  it('parses markdown-wrapped JSON string from LLM', () => {
    const markdownJson = '```json\n{"name": "Rad Crater", "description": "Glowing pit."}\n```';
    const spec = normalizeLocationSpec(markdownJson);
    assert.equal(spec.identity.name, 'Rad Crater');
    assert.equal(spec.identity.summary, 'Glowing pit.');
  });

  it('falls back gracefully for unparseable string input', () => {
    const spec = normalizeLocationSpec('some raw text from LLM that is not JSON');
    assert.equal(spec.identity.name, 'Unknown Location');
    assert.equal(spec.environment.biome, 'desert');
  });

  it('handles array input without crashing', () => {
    const spec = normalizeLocationSpec([1, 2, 3] as any);
    assert.equal(spec.identity.name, 'Unknown Location');
  });

  it('preserves structured AI output when provided', () => {
    const raw = {
      schema_version: 1,
      identity: { name: 'Rad Pit', summary: 'Irradiated hole.', tags: ['hazard'], stable_id: 'loc-test-1' },
      environment: { biome: 'wasteland', climate_notes: 'Hot.', hazard_tags: ['radiation'], resource_tags: [] },
      placement: { region_stable_id: 'region-starter', nearby_location_ids: [], faction_presence: ['raiders'] },
      gameplay: { threat_level: 'high', encounter_tone: 'hostile', exploration_hooks: ['radiation zone'] },
      content_hints: { npc_archetypes: ['ghoul'], quest_hook_seeds: ['cleanup'], loot_themes: ['tech'] },
    };
    const spec = normalizeLocationSpec(raw);

    assert.equal(spec.identity.name, 'Rad Pit');
    assert.equal(spec.environment.biome, 'wasteland');
    assert.equal(spec.gameplay.threat_level, 'high');
    assert.deepEqual(spec.content_hints.npc_archetypes, ['ghoul']);
  });
});

describe('buildFallbackLocationSpec', () => {
  it('produces a valid spec matching the contract shape', () => {
    const spec = buildFallbackLocationSpec({
      regionStableId: 'region-starter',
      regionBiomeTags: ['desert'],
      regionHazardTags: ['radiation'],
      nearbyLocationIds: ['loc-1'],
      factionTags: ['raiders'],
    });

    assert.equal(spec.schema_version, LOCATION_SPEC_VERSION);
    assert.equal(typeof spec.identity.name, 'string');
    assert.equal(typeof spec.identity.stable_id, 'string');
    assert.equal(spec.environment.biome, 'desert');
    assert.ok(Array.isArray(spec.gameplay.exploration_hooks));
  });
});

describe('admitLocationSpec', () => {
  it('admits clean specs', () => {
    const spec = buildFallbackLocationSpec({
      regionStableId: 'region-starter',
      regionBiomeTags: ['desert'],
      regionHazardTags: [],
      nearbyLocationIds: [],
      factionTags: [],
    });
    const report = buildValidationReport([]);
    const result = admitLocationSpec(spec, report);

    assert.equal(result.decision, 'admit');
    assert.ok(result.admitted_at);
  });

  it('rejects specs with blocking issues', () => {
    const spec = buildFallbackLocationSpec({
      regionStableId: 'region-starter',
      regionBiomeTags: ['desert'],
      regionHazardTags: [],
      nearbyLocationIds: [],
      factionTags: [],
    });
    const report = buildValidationReport([
      { severity: ValidationSeverity.Block, rule: 'test', message: 'blocked' },
    ]);
    const result = admitLocationSpec(spec, report);

    assert.equal(result.decision, 'reject');
  });

  it('flags repairable specs', () => {
    const spec = buildFallbackLocationSpec({
      regionStableId: 'region-starter',
      regionBiomeTags: ['desert'],
      regionHazardTags: [],
      nearbyLocationIds: [],
      factionTags: [],
    });
    const report = buildValidationReport([
      { severity: ValidationSeverity.Repairable, rule: 'test', message: 'fixable' },
    ]);
    const result = admitLocationSpec(spec, report);

    assert.equal(result.decision, 'repair_needed');
  });
});
