import { Router } from 'express';
import { getWorldProfile, getCanonFacts } from '../world/worldService.js';
import { buildGenerationContext } from '../world/contextBuilder.js';
import { getFeatureFlags } from '../world/featureFlags.js';
import { getRecentRuns, getRecentTravelRequests, getSpecForLocation } from '../generation/specStore.js';
import { db } from '../db.js';
import { generateLocationLayout } from '../mapgen.js';

export const worldRouter = Router();

worldRouter.get('/profile', (req: any, res: any) => {
  const profile = getWorldProfile();
  if (!profile) return res.status(404).json({ message: 'World profile not found.' });
  res.json(profile);
});

worldRouter.post('/generate-map', (req: any, res: any) => {
  const options = req.body;
  try {
    const map = generateLocationLayout(options);
    res.json(map);
  } catch (error) {
    console.error('[world/generate-map] error:', error);
    res.status(500).json({ message: 'Failed to generate map.' });
  }
});

worldRouter.get('/locations', (req: any, res: any) => {
  const locations = db.prepare(`
    SELECT id, name, description, region_id, stable_id 
    FROM locations
  `).all();
  res.json({ locations });
});

worldRouter.get('/perks', (req: any, res: any) => {
  const perks = db.prepare('SELECT * FROM perks').all();
  res.json({ perks });
});

/** 
 * GET /api/world/inspect 
 * Debug endpoint for high-level world and generation state.
 */
worldRouter.get('/inspect', (req: any, res: any) => {
  const world = getWorldProfile();
  const regions = db.prepare('SELECT * FROM regions').all();
  const recentFacts = getCanonFacts(undefined, undefined, 10);
  const recentRuns = getRecentRuns(10);
  const recentTravelRequests = getRecentTravelRequests(10);
  
  // Includes trace_id from updated version
  const recentSpecs = db.prepare(`
    SELECT id, stable_id, location_id, run_id, trace_id, admission_status, schema_version, created_at 
    FROM location_specs 
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  
  // Includes trace_id and realization metadata from updated version
  const recentRealizedLocations = db.prepare(`
    SELECT id, name, region_id, stable_id, run_id, spec_stable_id, trace_id, realization_id, realization_version, creation_mode
    FROM locations
    ORDER BY id DESC
    LIMIT 10
  `).all();

  res.json({
    world,
    regions,
    recent_facts: recentFacts,
    recent_generation_runs: recentRuns,
    recent_travel_requests: recentTravelRequests,
    recent_specs: recentSpecs,
    recent_realized_locations: recentRealizedLocations,
    feature_flags: getFeatureFlags(), // Uses the helper to get all flags
  });
});

/** 
 * GET /api/world/trace/:traceId 
 * Follow one generation/realization trace across all persisted tables.
 * This is the primary tool for debugging why a specific location was generated or realized.
 */
worldRouter.get('/trace/:traceId', (req: any, res: any) => {
  const traceId = typeof req.params.traceId === 'string' ? req.params.traceId.trim() : '';
  if (!traceId) {
    return res.status(400).json({ message: 'Invalid trace id.' });
  }

  const request = db.prepare('SELECT * FROM travel_requests WHERE trace_id = ? ORDER BY created_at DESC LIMIT 1').get(traceId);
  const generationRuns = db.prepare('SELECT * FROM generation_runs WHERE trace_id = ? ORDER BY created_at ASC').all(traceId);
  const specs = db.prepare('SELECT * FROM location_specs WHERE trace_id = ? ORDER BY created_at ASC').all(traceId);
  const locations = db.prepare('SELECT * FROM locations WHERE trace_id = ? ORDER BY id ASC').all(traceId);
  const npcs = db.prepare('SELECT * FROM npcs WHERE trace_id = ? ORDER BY id ASC').all(traceId);
  const npcItems = db.prepare('SELECT * FROM npc_items WHERE trace_id = ? ORDER BY npc_id ASC, item_id ASC').all(traceId);

  if (!request && generationRuns.length === 0 && specs.length === 0 && locations.length === 0 && npcs.length === 0 && npcItems.length === 0) {
    return res.status(404).json({ message: 'No persisted records found for this trace id.' });
  }

  return res.json({
    trace_id: traceId,
    travel_request: request ?? null,
    generation_runs: generationRuns,
    specs,
    locations,
    npcs,
    npc_items: npcItems,
    counts: {
      generation_runs: generationRuns.length,
      specs: specs.length,
      locations: locations.length,
      npcs: npcs.length,
      npc_items: npcItems.length,
    },
  });
});
