import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { db } from '../db.js';
import { assignExplorationPositions, generateLocationLayout } from '../mapgen.js';
import { updateQuestProgress } from '../quests.js';
import { createSeededRng } from '../utils/seededRng.js';
import { isEnabled } from '../world/featureFlags.js';
import { getRegionForLocation } from '../world/worldService.js';
import { generateLocationSpec } from '../generation/locationGenerator.js';
import type { LocationSpec } from '../generation/contracts.js';
import {
  attachGeneratedPayloadToTravelRequest,
  attachGenerationToTravelRequest,
  completeTravelRequest,
  createTravelRequest,
  failTravelRequest,
  getGenerationRun,
  getLocationSpec,
  getTravelRequestGeneratedPayload,
  getTravelRequest,
  linkSpecToLocation,
} from '../generation/specStore.js';
import {
  buildLayoutGenerationOptionsFromSpec,
  realizeFromSpec,
  recordLocationDiscovery,
  RUNTIME_REALIZATION_VERSION,
} from '../generation/realizer.js';
import { buildLegacyTravelPreview } from '../generation/travelPreview.js';

export const travelRouter = Router();

type RuntimeCreationMode = 'legacy' | 'structured_ai' | 'fallback';

const legacyNpcTypes = [
  { name: 'Wasteland Drifter', desc: 'A weary traveler.', type: 'human', hostile: 0 },
  { name: 'Feral Ghoul', desc: 'A mindless, irradiated zombie.', type: 'mutant', hostile: 1 },
  { name: 'Raider Scum', desc: 'A violent raider.', type: 'human', hostile: 1 },
  { name: 'Mutated Hound', desc: 'A vicious, mutated dog.', type: 'animal', hostile: 1 },
  { name: 'Scrap Merchant', desc: 'Looking to trade.', type: 'human', hostile: 0 },
];

function parseStoredSpec(specJson: string): LocationSpec | null {
  try {
    return JSON.parse(specJson) as LocationSpec;
  } catch {
    return null;
  }
}

function resolveRegionId(params: {
  spec?: LocationSpec | null;
  explicitRegionId?: number;
  fallbackLocationId: number;
}): number {
  if (params.spec?.placement.region_stable_id) {
    const specRegion = db.prepare('SELECT id FROM regions WHERE stable_id = ?').get(params.spec.placement.region_stable_id) as any;
    if (specRegion?.id) return specRegion.id;
  }
  if (params.explicitRegionId !== undefined) return params.explicitRegionId;
  const fallbackLocation = db.prepare('SELECT region_id FROM locations WHERE id = ?').get(params.fallbackLocationId) as any;
  return fallbackLocation?.region_id ?? 1;
}

function resolveCreationMode(runId: string | null | undefined): RuntimeCreationMode {
  if (!runId) return 'structured_ai';
  const run = getGenerationRun(runId);
  return run?.result_status === 'fallback' ? 'fallback' : 'structured_ai';
}

function getDeterministicLegacyNpcCount(seed: string): number {
  const rng = createSeededRng(`legacy-npc-count:${seed}`);
  return Math.floor(rng() * 3) + 1;
}

/**
 * Transactional helper to persist the new location, move the player, and spawn content.
 */
function persistTravel(params: {
  playerId: number;
  sourceLocationId: number;
  name: string;
  description: string;
  layout: unknown;
  stableId: string;
  positions: ReturnType<typeof assignExplorationPositions>;
  numNpcs: number;
  plan: ReturnType<typeof realizeFromSpec> | null;
  creationMode: RuntimeCreationMode;
  runId?: string | null;
  traceId?: string | null;
  spec?: LocationSpec | null;
  explicitRegionId?: number;
  requestId?: string | null;
  realizationId?: string | null;
  realizationVersion?: string | null;
}) {
  const doTravel = db.transaction((inner: typeof params) => {
    const regionId = resolveRegionId({
      spec: inner.spec,
      explicitRegionId: inner.explicitRegionId,
      fallbackLocationId: inner.sourceLocationId,
    });

    const realizationId = inner.realizationId
      ?? (inner.requestId ? `realization-${inner.requestId}` : `realization-${randomUUID()}`);
    const realizationVersion = inner.realizationVersion ?? RUNTIME_REALIZATION_VERSION;
    const traceId = inner.traceId ?? realizationId;

    // 1. Idempotency Check
    const existingLocation = db.prepare(`
      SELECT id, region_id FROM locations WHERE realization_id = ? LIMIT 1
    `).get(realizationId) as any;

    if (existingLocation?.id) {
      db.prepare('UPDATE players SET current_location_id = ?, tile_x = ?, tile_y = ? WHERE id = ?').run(
        existingLocation.id,
        inner.positions.player.x,
        inner.positions.player.y,
        inner.playerId,
      );
      if (inner.requestId) {
        completeTravelRequest({
          request_id: inner.requestId,
          target_location_id: existingLocation.id,
          run_id: inner.runId ?? null,
          spec_stable_id: inner.spec?.identity.stable_id ?? null,
        });
      }
      return { locationId: Number(existingLocation.id), regionId: existingLocation.region_id, realizationId, replayed: true };
    }

    const legacyRng = createSeededRng(`legacy:${realizationId}`);

    // 2. Insert Location
    const info = db.prepare(`
      INSERT INTO locations (
        name, description, layout_json, region_id, stable_id, 
        run_id, spec_stable_id, trace_id, realization_id, realization_version, creation_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inner.name,
      inner.description,
      JSON.stringify(inner.layout),
      regionId,
      inner.stableId,
      inner.runId ?? null,
      inner.spec?.identity.stable_id ?? null,
      traceId,
      realizationId,
      realizationVersion,
      inner.creationMode,
    );
    const newLocId = Number(info.lastInsertRowid);

    // 3. Move Player
    db.prepare('UPDATE players SET current_location_id = ?, tile_x = ?, tile_y = ? WHERE id = ?').run(
      newLocId,
      inner.positions.player.x,
      inner.positions.player.y,
      inner.playerId,
    );
    updateQuestProgress(inner.playerId, 'explore', inner.name);

    // 4. Spawn NPCs
    if (inner.plan) {
      // Structured path
      for (let i = 0; i < inner.numNpcs; i++) {
        const entry = inner.plan.npcs[i];
        const t = entry.template;
        const pos = inner.positions.npcs[i];
        const npcInfo = db.prepare(`
          INSERT INTO npcs (
            name, description, type, is_hostile, current_location_id, 
            hit_points, max_hit_points, tile_x, tile_y, 
            run_id, spec_stable_id, trace_id, realization_id, realization_version, creation_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          t.name, t.description, t.type, t.hostile ? 1 : 0, newLocId,
          t.base_hp, t.base_hp, pos.x, pos.y,
          inner.runId ?? null, inner.spec?.identity.stable_id ?? null,
          traceId, realizationId, realizationVersion, inner.creationMode,
        );

        for (const itemName of inner.plan.loot_item_names) {
          const item = db.prepare('SELECT id FROM items WHERE name = ?').get(itemName) as any;
          if (item) {
            db.prepare(`
              INSERT INTO npc_items (npc_id, item_id, quantity, run_id, spec_stable_id, trace_id, realization_id, realization_version, creation_mode)
              VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
            `).run(npcInfo.lastInsertRowid, item.id, inner.runId, inner.spec?.identity.stable_id, traceId, realizationId, realizationVersion, inner.creationMode);
          }
        }
      }
    } else {
      // Legacy path
      for (let i = 0; i < inner.numNpcs; i++) {
        const template = legacyNpcTypes[Math.floor(legacyRng() * legacyNpcTypes.length)];
        const pos = inner.positions.npcs[i];
        const npcInfo = db.prepare(`
          INSERT INTO npcs (name, description, type, is_hostile, current_location_id, hit_points, max_hit_points, tile_x, tile_y, trace_id, realization_id, realization_version, creation_mode)
          VALUES (?, ?, ?, ?, ?, 20, 20, ?, ?, ?, ?, ?, ?)
        `).run(template.name, template.desc, template.type, template.hostile, newLocId, pos.x, pos.y, traceId, realizationId, 'legacy-runtime-v1', 'legacy');

        if (legacyRng() > 0.5) {
          const stim = db.prepare("SELECT id FROM items WHERE name = 'Stimpak'").get() as any;
          if (stim) {
            db.prepare(`INSERT INTO npc_items (npc_id, item_id, quantity, trace_id, realization_id, realization_version, creation_mode) VALUES (?, ?, 1, ?, ?, ?, ?)`).run(npcInfo.lastInsertRowid, stim.id, traceId, realizationId, 'legacy-runtime-v1', 'legacy');
          }
        }
      }
    }

    if (inner.spec) {
      linkSpecToLocation(inner.spec.identity.stable_id, newLocId);
      recordLocationDiscovery(inner.spec, regionId);
    }

    if (inner.requestId) {
      completeTravelRequest({
        request_id: inner.requestId,
        target_location_id: newLocId,
        run_id: inner.runId ?? null,
        spec_stable_id: inner.spec?.identity.stable_id ?? null,
      });
    }

    return { locationId: newLocId, regionId, realizationId, replayed: false };
  });

  return doTravel(params);
}

/**
 * POST /
 * Start travel: creates a request record and generates a destination preview.
 */
travelRouter.post('/', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  if (!player) return res.status(404).json({ message: 'Player not found.' });

  const currentLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (!currentLocation) return res.status(404).json({ message: 'No active location found.' });

  const { target_location_id } = req.body;

  if (target_location_id) {
    const targetLoc = db.prepare('SELECT * FROM locations WHERE id = ?').get(target_location_id) as any;
    if (!targetLoc) return res.status(404).json({ message: 'Target location not found.' });

    const request = createTravelRequest({
      player_id: player.id,
      source_location_id: player.current_location_id,
      request_mode: 'legacy', // Reusing legacy mode for simple move
      realization_version: targetLoc.realization_version || 'legacy-runtime-v1',
    });

    // Attach target location info to request
    db.prepare('UPDATE travel_requests SET target_location_id = ? WHERE request_id = ?').run(target_location_id, request.request_id);

    return res.json({
      authority_mode: 'server_generated',
      request_id: request.request_id,
      trace_id: request.trace_id,
      realization_id: request.realization_id,
      preview_location: { name: targetLoc.name, description: targetLoc.description },
    });
  }

  if (isEnabled('structured_generation')) {
    const request = createTravelRequest({
      player_id: player.id,
      source_location_id: player.current_location_id,
      request_mode: 'structured_server',
      realization_version: RUNTIME_REALIZATION_VERSION,
    });

    try {
      const result = await generateLocationSpec(player.id, player.current_location_id, {
        trace_id: request.trace_id ?? undefined,
      });
      attachGenerationToTravelRequest({
        request_id: request.request_id,
        run_id: result.run_id,
        spec_stable_id: result.spec.identity.stable_id,
      });

      if (result.admission.decision === 'reject') {
        failTravelRequest(request.request_id);
        return res.status(422).json({ message: 'Generation failed validation.', request_id: request.request_id });
      }

      return res.json({
        authority_mode: 'server_generated',
        request_id: request.request_id,
        trace_id: request.trace_id,
        realization_id: request.realization_id,
        run_id: result.run_id,
        used_fallback: result.used_fallback,
        preview_location: { name: result.spec.identity.name, description: result.spec.identity.summary },
      });
    } catch (error) {
      failTravelRequest(request.request_id);
      return res.status(500).json({ message: 'Failed to generate travel destination.' });
    }
  }

  // Legacy Path
  const request = createTravelRequest({
    player_id: player.id,
    source_location_id: player.current_location_id,
    request_mode: 'legacy',
    realization_version: 'legacy-runtime-v1',
  });

  const region = getRegionForLocation(player.current_location_id);
  const preview = buildLegacyTravelPreview({
    request_id: request.request_id,
    current_location_name: currentLocation.name,
    region_id: currentLocation.region_id ?? region?.id ?? 1,
    region_name: region?.name ?? 'The Wasteland',
    biome_tags: region?.biome_tags ?? [],
    hazard_tags: region?.hazard_tags ?? [],
    resource_tags: region?.resource_tags ?? [],
  });

  attachGeneratedPayloadToTravelRequest({ request_id: request.request_id, generated_payload: preview });

  return res.json({
    authority_mode: 'server_generated',
    generation_mode: 'legacy_server',
    request_id: request.request_id,
    trace_id: request.trace_id,
    realization_id: request.realization_id,
    preview_location: { name: preview.name, description: preview.description },
  });
});

/**
 * POST /confirm
 * Confirm travel: realizes the generated destination and moves the player.
 */
travelRouter.post('/confirm', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  if (!player) return res.status(404).json({ message: 'Player not found.' });

  const requestId = req.body?.request_id;
  const request = requestId ? getTravelRequest(requestId) : null;

  if (requestId && !request) return res.status(404).json({ message: 'Travel request not found.' });
  if (request && request.player_id !== player.id) return res.status(403).json({ message: 'Request mismatch.' });
  if (request?.status === 'failed') return res.status(409).json({ message: 'Request no longer valid.' });

  // Handle replayed request
  if (request?.status === 'completed' && request.target_location_id) {
    const loc = db.prepare('SELECT name FROM locations WHERE id = ?').get(request.target_location_id) as any;
    return res.json({
      message: `Travel replayed to ${loc?.name}`,
      location_id: request.target_location_id,
      replayed: true,
      request_id: request.request_id,
      trace_id: request.trace_id,
    });
  }

  try {
    if (request?.target_location_id) {
      // Simple move to existing location
      const targetLoc = db.prepare('SELECT * FROM locations WHERE id = ?').get(request.target_location_id) as any;
      const layout = parseStoredSpec(targetLoc.layout_json) || generateLocationLayout(); // Fallback if layout missing
      const positions = assignExplorationPositions(layout as any, 0); // No new NPCs for simple move back

      db.prepare('UPDATE players SET current_location_id = ?, tile_x = ?, tile_y = ? WHERE id = ?').run(
        targetLoc.id,
        positions.player.x,
        positions.player.y,
        player.id
      );

      completeTravelRequest({
        request_id: request.request_id,
        target_location_id: targetLoc.id,
        run_id: request.run_id,
        spec_stable_id: request.spec_stable_id,
      });

      return res.json({ 
        locationId: targetLoc.id, 
        location_name: targetLoc.name,
        message: `Traveled back to ${targetLoc.name}`, 
        request_id: request.request_id 
      });
    }

    if (request?.request_mode === 'structured_server') {
      const storedSpec = getLocationSpec(request.spec_stable_id!);
      const spec = storedSpec ? parseStoredSpec(storedSpec.spec_json) : null;
      if (!spec) throw new Error('Spec missing');

      const plan = realizeFromSpec(spec);
      const layout = generateLocationLayout(buildLayoutGenerationOptionsFromSpec(spec));
      const positions = assignExplorationPositions(layout, plan.npc_count, request.realization_id!);

      const result = persistTravel({
        playerId: player.id,
        sourceLocationId: request.source_location_id,
        name: spec.identity.name,
        description: spec.identity.summary,
        layout,
        stableId: spec.identity.stable_id,
        positions,
        numNpcs: plan.npc_count,
        plan,
        creationMode: resolveCreationMode(request.run_id),
        runId: request.run_id,
        traceId: request.trace_id,
        spec,
        requestId: request.request_id,
        realizationId: request.realization_id,
        realizationVersion: request.realization_version,
      });

      return res.json({ ...result, message: `Traveled to ${spec.identity.name}`, request_id: request.request_id });
    }

    if (request) {
      // Legacy Server Mode
      const preview = getTravelRequestGeneratedPayload(request);
      if (!preview) throw new Error('Preview missing');

      const sourceRegion = getRegionForLocation(request.source_location_id);
      const seed = request.realization_id ?? request.request_id;
      const layout = generateLocationLayout({
        stable_id: seed,
        biome: sourceRegion?.biome_tags?.[0] ?? null,
      });
      const numNpcs = getDeterministicLegacyNpcCount(seed);
      const positions = assignExplorationPositions(layout, numNpcs, seed);

      const result = persistTravel({
        playerId: player.id,
        sourceLocationId: request.source_location_id,
        name: preview.name,
        description: preview.description,
        layout,
        stableId: `loc-${request.request_id}`,
        positions,
        numNpcs,
        plan: null,
        creationMode: 'legacy',
        traceId: request.trace_id,
        requestId: request.request_id,
        realizationId: request.realization_id,
        realizationVersion: request.realization_version,
      });

      return res.json({ ...result, message: `Traveled to ${preview.name}`, request_id: request.request_id });
    }

    // Deprecated Fallback
    return res.status(400).json({ message: 'Request ID required for travel confirmation.' });
  } catch (err) {
    if (request) failTravelRequest(request.request_id);
    console.error('[travel/confirm] error:', err);
    return res.status(500).json({ message: 'Failed to confirm travel.' });
  }
});