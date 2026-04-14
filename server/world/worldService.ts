import { db } from '../db.js';
import type { WorldProfile, Region, WorldFact } from './types.js';
import { CanonLevel } from './types.js';

function parseJsonColumn(value: string | null | undefined): any {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function rowToWorldProfile(row: any): WorldProfile {
  return {
    id: row.id,
    stable_id: row.stable_id,
    name: row.name,
    climate: row.climate,
    biome: row.biome,
    tone: row.tone,
    scarcity_profile: row.scarcity_profile,
    tech_level: row.tech_level,
    banned_motifs: parseJsonColumn(row.banned_motifs),
    schema_version: row.schema_version,
  };
}

function rowToRegion(row: any): Region {
  return {
    id: row.id,
    stable_id: row.stable_id,
    name: row.name,
    description: row.description,
    biome_tags: parseJsonColumn(row.biome_tags),
    hazard_tags: parseJsonColumn(row.hazard_tags),
    resource_tags: parseJsonColumn(row.resource_tags),
    faction_tags: parseJsonColumn(row.faction_tags),
    world_id: row.world_id,
    schema_version: row.schema_version,
  };
}

function rowToWorldFact(row: any): WorldFact {
  return {
    id: row.id,
    stable_id: row.stable_id,
    fact_type: row.fact_type,
    scope: row.scope,
    subject: row.subject,
    body: row.body,
    region_id: row.region_id,
    canon_level: row.canon_level as CanonLevel,
    source: row.source,
    promoted_by: row.promoted_by,
    promoted_reason: row.promoted_reason,
    schema_version: row.schema_version,
    created_at: row.created_at,
  };
}

/** Fetch the singleton world profile. Returns null if not yet seeded. */
export function getWorldProfile(): WorldProfile | null {
  const row = db.prepare('SELECT * FROM world_state LIMIT 1').get() as any;
  if (!row) return null;
  return rowToWorldProfile(row);
}

/** Fetch a region by its integer id. */
export function getRegion(id: number): Region | null {
  const row = db.prepare('SELECT * FROM regions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToRegion(row);
}

/** Fetch the region associated with a location. */
export function getRegionForLocation(locationId: number): Region | null {
  const loc = db.prepare('SELECT region_id FROM locations WHERE id = ?').get(locationId) as any;
  if (!loc || !loc.region_id) return null;
  return getRegion(loc.region_id);
}

/** Fetch canon facts filtered by scope and optionally by region. */
export function getCanonFacts(
  scope?: 'global' | 'regional' | 'local',
  regionId?: number,
  limit: number = 50,
): WorldFact[] {
  let query = 'SELECT * FROM world_facts WHERE 1=1';
  const params: any[] = [];

  if (scope) {
    query += ' AND scope = ?';
    params.push(scope);
  }

  if (regionId !== undefined) {
    query += ' AND (region_id = ? OR scope = ?)';
    params.push(regionId, 'global');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToWorldFact);
}

/** Fetch world deltas for a target or player. */
export function getWorldDeltas(params: {
  targetType?: string;
  targetId?: string;
  playerId?: number;
  limit?: number;
}): any[] {
  let query = 'SELECT * FROM world_deltas WHERE 1=1';
  const sqlParams: any[] = [];

  if (params.targetType) {
    query += ' AND target_type = ?';
    sqlParams.push(params.targetType);
  }
  if (params.targetId) {
    query += ' AND target_id = ?';
    sqlParams.push(params.targetId);
  }
  if (params.playerId) {
    query += ' AND player_id = ?';
    sqlParams.push(params.playerId);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  sqlParams.push(params.limit ?? 50);

  const rows = db.prepare(query).all(...sqlParams) as any[];
  return rows.map(row => ({
    ...row,
    payload: parseJsonColumn(row.payload_json)
  }));
}

/** Insert a new world delta and return its id. */
export function insertWorldDelta(delta: {
  stable_id: string;
  delta_type: string;
  target_type: string;
  target_id: string;
  payload: any;
  player_id?: number | null;
  run_id?: string | null;
}): number {
  const result = db.prepare(`
    INSERT INTO world_deltas (stable_id, delta_type, target_type, target_id, payload_json, player_id, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    delta.stable_id,
    delta.delta_type,
    delta.target_type,
    delta.target_id,
    JSON.stringify(delta.payload),
    delta.player_id ?? null,
    delta.run_id ?? null,
  );
  return Number(result.lastInsertRowid);
}

/** Explicitly promote a canon fact with provenance tracking. */
export function promoteCanonFact(
  factId: number,
  level: CanonLevel,
  source: string,
  reason: string,
): void {
  db.prepare(
    'UPDATE world_facts SET canon_level = ?, promoted_by = ?, promoted_reason = ? WHERE id = ?',
  ).run(level, source, reason, factId);
}

/** Insert a new world fact and return its id. */
export function insertWorldFact(fact: {
  stable_id: string;
  fact_type: string;
  scope: 'global' | 'regional' | 'local';
  subject: string;
  body: string;
  region_id?: number | null;
  canon_level?: CanonLevel;
  source?: string;
}): number {
  const result = db.prepare(`
    INSERT INTO world_facts (stable_id, fact_type, scope, subject, body, region_id, canon_level, source, schema_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    fact.stable_id,
    fact.fact_type,
    fact.scope,
    fact.subject,
    fact.body,
    fact.region_id ?? null,
    fact.canon_level ?? CanonLevel.RuntimeOnly,
    fact.source ?? null,
  );
  return Number(result.lastInsertRowid);
}
