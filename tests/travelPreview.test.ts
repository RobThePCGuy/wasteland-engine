import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyTravelPreview } from '../server/generation/travelPreview.js';

describe('buildLegacyTravelPreview', () => {
  it('is deterministic for the same request context', () => {
    const first = buildLegacyTravelPreview({
      request_id: 'travel-test-123',
      current_location_name: 'Vault 17',
      region_id: 4,
      region_name: 'Outer Wastes',
      biome_tags: ['desert'],
      hazard_tags: ['radiation', 'bandits'],
      resource_tags: ['scrap', 'tech'],
    });
    const second = buildLegacyTravelPreview({
      request_id: 'travel-test-123',
      current_location_name: 'Vault 17',
      region_id: 4,
      region_name: 'Outer Wastes',
      biome_tags: ['desert'],
      hazard_tags: ['radiation', 'bandits'],
      resource_tags: ['scrap', 'tech'],
    });

    assert.deepEqual(first, second);
  });

  it('changes output when the request id changes', () => {
    const first = buildLegacyTravelPreview({
      request_id: 'travel-alpha',
      current_location_name: 'Dustown',
      region_name: 'Outer Wastes',
      biome_tags: ['desert'],
      hazard_tags: ['radiation'],
      resource_tags: ['scrap'],
    });
    const second = buildLegacyTravelPreview({
      request_id: 'travel-beta',
      current_location_name: 'Dustown',
      region_name: 'Outer Wastes',
      biome_tags: ['desert'],
      hazard_tags: ['radiation'],
      resource_tags: ['scrap'],
    });

    assert.notDeepEqual(first, second);
  });

  it('preserves the source region id and references the source context in the description', () => {
    const preview = buildLegacyTravelPreview({
      request_id: 'travel-context-check',
      current_location_name: 'Junktown Gate',
      region_id: 7,
      region_name: 'Scablands',
      biome_tags: ['scrubland'],
      hazard_tags: ['bandits'],
      resource_tags: ['water_scarce'],
    });

    assert.equal(preview.region_id, 7);
    assert.match(preview.description, /Junktown Gate/);
    assert.match(preview.description, /Scablands/);
  });

  it('still produces a usable preview when no tags are present', () => {
    const preview = buildLegacyTravelPreview({
      request_id: 'travel-fallback-preview',
      current_location_name: 'Unknown Camp',
    });

    assert.ok(preview.name.length > 0);
    assert.ok(preview.description.length > 0);
    assert.equal(preview.region_id, null);
  });
});