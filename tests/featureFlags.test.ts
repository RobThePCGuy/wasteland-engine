import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getFeatureFlags, isEnabled, setFlags, resetFlags } from '../server/world/featureFlags.js';

describe('featureFlags', () => {
  beforeEach(() => {
    resetFlags();
  });

  it('all flags default to false', () => {
    const flags = getFeatureFlags();
    assert.equal(flags.structured_generation, false);
    assert.equal(flags.shadow_generation, false);
    assert.equal(flags.canon_promotion, false);
    assert.equal(flags.world_inspection, false);
    assert.equal(flags.asset_activation, false);
  });

  it('isEnabled returns false for disabled flags', () => {
    assert.equal(isEnabled('structured_generation'), false);
  });

  it('setFlags overrides specific flags', () => {
    setFlags({ structured_generation: true });
    assert.equal(isEnabled('structured_generation'), true);
    assert.equal(isEnabled('shadow_generation'), false);
    assert.equal(isEnabled('canon_promotion'), false);
  });

  it('resetFlags restores defaults', () => {
    setFlags({ structured_generation: true, shadow_generation: true, canon_promotion: true, asset_activation: true });
    resetFlags();
    assert.equal(isEnabled('structured_generation'), false);
    assert.equal(isEnabled('shadow_generation'), false);
    assert.equal(isEnabled('canon_promotion'), false);
    assert.equal(isEnabled('asset_activation'), false);
  });

  it('getFeatureFlags returns a copy (not mutable reference)', () => {
    const flags = getFeatureFlags();
    flags.structured_generation = true;
    assert.equal(isEnabled('structured_generation'), false);
  });
});
