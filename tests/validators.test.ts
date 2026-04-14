import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBiomeConsistency,
  validateResourcePlausibility,
  validateNameUniqueness,
  validateMotifBans,
} from '../server/validators/worldRules.js';
import { ValidationSeverity, buildValidationReport } from '../server/validators/types.js';

describe('validateBiomeConsistency', () => {
  it('passes when biome matches region tags', () => {
    const results = validateBiomeConsistency('desert', ['desert', 'scrubland']);
    assert.equal(results.length, 0);
  });

  it('flags mismatch as repairable', () => {
    const results = validateBiomeConsistency('forest', ['desert', 'scrubland']);
    assert.equal(results.length, 1);
    assert.equal(results[0].severity, ValidationSeverity.Repairable);
    assert.equal(results[0].rule, 'biome_consistency');
  });

  it('passes when region has no biome tags', () => {
    const results = validateBiomeConsistency('forest', []);
    assert.equal(results.length, 0);
  });
});

describe('validateResourcePlausibility', () => {
  it('passes for compatible resources', () => {
    const results = validateResourcePlausibility(['scrap', 'salvage'], ['water_scarce', 'scrap']);
    assert.equal(results.length, 0);
  });

  it('flags water abundance in water-scarce region', () => {
    const results = validateResourcePlausibility(['water_abundant'], ['water_scarce']);
    assert.equal(results.length, 1);
    assert.equal(results[0].severity, ValidationSeverity.Repairable);
  });
});

describe('validateNameUniqueness', () => {
  it('passes for unique names', () => {
    const results = validateNameUniqueness('New Settlement', ['Old Town', 'Dusty Ridge']);
    assert.equal(results.length, 0);
  });

  it('blocks duplicate names (case-insensitive)', () => {
    const results = validateNameUniqueness('old town', ['Old Town', 'Dusty Ridge']);
    assert.equal(results.length, 1);
    assert.equal(results[0].severity, ValidationSeverity.Block);
  });
});

describe('validateMotifBans', () => {
  it('passes for allowed tags', () => {
    const results = validateMotifBans(['desert', 'ruins'], ['tropical', 'underwater']);
    assert.equal(results.length, 0);
  });

  it('blocks banned motifs', () => {
    const results = validateMotifBans(['tropical', 'desert'], ['tropical', 'underwater']);
    assert.equal(results.length, 1);
    assert.equal(results[0].severity, ValidationSeverity.Block);
    assert.equal(results[0].rule, 'motif_ban');
  });
});

describe('buildValidationReport', () => {
  it('reports passed when no blockers', () => {
    const report = buildValidationReport([
      { severity: ValidationSeverity.WarnOnly, rule: 'test', message: 'minor' },
    ]);
    assert.equal(report.passed, true);
    assert.equal(report.warn_count, 1);
    assert.equal(report.blocked, 0);
  });

  it('reports not passed when blockers exist', () => {
    const report = buildValidationReport([
      { severity: ValidationSeverity.Block, rule: 'test', message: 'bad' },
      { severity: ValidationSeverity.WarnOnly, rule: 'test2', message: 'minor' },
    ]);
    assert.equal(report.passed, false);
    assert.equal(report.blocked, 1);
    assert.equal(report.warn_count, 1);
  });
});
