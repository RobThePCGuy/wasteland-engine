import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db.js';
import type { LocationSpec } from './contracts.js';
import type { ValidationReport } from '../validators/types.js';

const DEFAULT_RUNTIME_REALIZATION_VERSION = 'runtime-realizer-v2';

export interface GenerationRunRecord {
  run_id: string;
  trace_id: string | null;
  run_type: string;
  context_snapshot: string;
  model_name: string | null;
  prompt_version: string | null;
  result_status: 'pending' | 'success' | 'failed' | 'fallback';
  result_data: string | null;
  validation_report: string | null;
  retry_count: number;
}

export interface LocationSpecRecord {
  id: number;
  stable_id: string;
  location_id: number | null;
  run_id: string | null;
  trace_id: string | null;
  spec_json: string;
  admission_status: 'pending' | 'admitted' | 'rejected' | 'repaired';
  schema_version: number;
  created_at: string;
}

export type TravelRequestMode = 'legacy' | 'structured_server';
export type TravelRequestStatus = 'pending' | 'generated' | 'completed' | 'failed';

export interface TravelRequestGeneratedPayload {
  name: string;
  description: string;
  region_id: number | null;
}

export interface TravelRequestRecord {
  id: number;
  request_id: string;
  trace_id: string | null;
  player_id: number;
  source_location_id: number;
  request_mode: TravelRequestMode;
  parameter_fingerprint: string;
  realization_id: string | null;
  realization_version: string | null;
  generated_payload_json: string | null;
  run_id: string | null;
  spec_stable_id: string | null;
  status: TravelRequestStatus;
  target_location_id: number | null;
  created_at: string;
  consumed_at: string | null;
}

function isTravelRequestGeneratedPayload(value: unknown): value is TravelRequestGeneratedPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return typeof payload.name === 'string'
    && typeof payload.description === 'string'
    && (typeof payload.region_id === 'number' || payload.region_id === null || payload.region_id === undefined);
}

/** Parse a stored server-authored travel payload from the request table. */
export function getTravelRequestGeneratedPayload(
  request: Pick<TravelRequestRecord, 'generated_payload_json'>,
): TravelRequestGeneratedPayload | null {
  if (!request.generated_payload_json) {
    return null;
  }

  try {
    const parsed = JSON.parse(request.generated_payload_json);
    if (!isTravelRequestGeneratedPayload(parsed)) {
      return null;
    }

    return {
      name: parsed.name,
      description: parsed.description,
      region_id: parsed.region_id ?? null,
    };
  } catch {
    return null;
  }
}

/** Build a stable travel fingerprint for idempotency/debugging. */
export function buildTravelFingerprint(params: {
  player_id: number;
  source_location_id: number;
  request_mode: TravelRequestMode;
}): string {
  const normalized = JSON.stringify({
    player_id: params.player_id,
    source_location_id: params.source_location_id,
    request_mode: params.request_mode,
  });

  return createHash('sha256').update(normalized).digest('hex');
}

/** Create a new generation run record and return its run_id. */
export function createGenerationRun(params: {
  run_type: string;
  context_snapshot: object;
  trace_id?: string;
  model_name?: string;
  prompt_version?: string;
}): string {
  const run_id = `run-${randomUUID()}`;
  const trace_id = params.trace_id ?? run_id;
  db.prepare(`
    INSERT INTO generation_runs (run_id, trace_id, run_type, context_snapshot, model_name, prompt_version, result_status, schema_version)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 1)
  `).run(
    run_id,
    trace_id,
    params.run_type,
    JSON.stringify(params.context_snapshot),
    params.model_name ?? null,
    params.prompt_version ?? null,
  );
  return run_id;
}

/** Update a generation run with its final result. */
export function completeGenerationRun(params: {
  run_id: string;
  result_status: 'success' | 'failed' | 'fallback';
  result_data?: object;
  validation_report?: ValidationReport;
  retry_count?: number;
}): void {
  db.prepare(`
    UPDATE generation_runs
    SET result_status = ?, result_data = ?, validation_report = ?, retry_count = ?
    WHERE run_id = ?
  `).run(
    params.result_status,
    params.result_data ? JSON.stringify(params.result_data) : null,
    params.validation_report ? JSON.stringify(params.validation_report) : null,
    params.retry_count ?? 0,
    params.run_id,
  );
}

/** Store an admitted LocationSpec and return its record id. */
export function insertLocationSpec(params: {
  spec: LocationSpec;
  run_id: string | null;
  trace_id?: string | null;
  admission_status: 'admitted' | 'rejected' | 'repaired';
  location_id?: number;
}): number {
  const stable_id = params.spec.identity.stable_id;
  const result = db.prepare(`
    INSERT INTO location_specs (stable_id, location_id, run_id, trace_id, spec_json, admission_status, schema_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    stable_id,
    params.location_id ?? null,
    params.run_id,
    params.trace_id ?? params.run_id ?? stable_id,
    JSON.stringify(params.spec),
    params.admission_status,
    params.spec.schema_version,
  );
  return Number(result.lastInsertRowid);
}

/** Link a spec to a realized location after creation. */
export function linkSpecToLocation(specStableId: string, locationId: number): void {
  db.prepare('UPDATE location_specs SET location_id = ? WHERE stable_id = ?').run(locationId, specStableId);
}

/** Retrieve a spec by its stable_id. */
export function getLocationSpec(stableId: string): LocationSpecRecord | null {
  const row = db.prepare('SELECT * FROM location_specs WHERE stable_id = ?').get(stableId) as any;
  return row ?? null;
}

/** Retrieve a spec linked to a location. */
export function getSpecForLocation(locationId: number): LocationSpecRecord | null {
  const row = db.prepare('SELECT * FROM location_specs WHERE location_id = ? ORDER BY created_at DESC LIMIT 1').get(locationId) as any;
  return row ?? null;
}

/** Retrieve recent generation runs for inspection. */
export function getRecentRuns(limit: number = 10): GenerationRunRecord[] {
  return db.prepare('SELECT * FROM generation_runs ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
}

/** Retrieve a generation run by id. */
export function getGenerationRun(runId: string): GenerationRunRecord | null {
  const row = db.prepare('SELECT * FROM generation_runs WHERE run_id = ?').get(runId) as any;
  return row ?? null;
}

/** Create a new server-issued travel request and return its record. */
export function createTravelRequest(params: {
  player_id: number;
  source_location_id: number;
  request_mode: TravelRequestMode;
  realization_version?: string;
}): TravelRequestRecord {
  const request_id = `travel-${randomUUID()}`;
  const trace_id = `trace-${randomUUID()}`;
  const parameter_fingerprint = buildTravelFingerprint(params);
  const realization_id = `realization-${request_id}`;

  db.prepare(`
    INSERT INTO travel_requests (
      request_id,
      trace_id,
      player_id,
      source_location_id,
      request_mode,
      parameter_fingerprint,
      realization_id,
      realization_version,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    request_id,
    trace_id,
    params.player_id,
    params.source_location_id,
    params.request_mode,
    parameter_fingerprint,
    realization_id,
    params.realization_version ?? DEFAULT_RUNTIME_REALIZATION_VERSION,
  );

  return getTravelRequest(request_id)!;
}

/** Retrieve a server-issued travel request. */
export function getTravelRequest(requestId: string): TravelRequestRecord | null {
  const row = db.prepare('SELECT * FROM travel_requests WHERE request_id = ?').get(requestId) as any;
  return row ?? null;
}

/** Persist generation linkage for a travel request before realization. */
export function attachGenerationToTravelRequest(params: {
  request_id: string;
  run_id: string | null;
  spec_stable_id: string | null;
}): void {
  db.prepare(`
    UPDATE travel_requests
    SET run_id = ?, spec_stable_id = ?, status = 'generated'
    WHERE request_id = ?
  `).run(
    params.run_id,
    params.spec_stable_id,
    params.request_id,
  );
}

/** Persist a server-authored legacy preview for a travel request. */
export function attachGeneratedPayloadToTravelRequest(params: {
  request_id: string;
  generated_payload: TravelRequestGeneratedPayload;
}): void {
  db.prepare(`
    UPDATE travel_requests
    SET generated_payload_json = ?, status = 'generated'
    WHERE request_id = ?
  `).run(
    JSON.stringify(params.generated_payload),
    params.request_id,
  );
}

/** Mark a travel request as completed and bind it to the realized location. */
export function completeTravelRequest(params: {
  request_id: string;
  target_location_id: number;
  run_id?: string | null;
  spec_stable_id?: string | null;
}): void {
  db.prepare(`
    UPDATE travel_requests
    SET
      target_location_id = ?,
      run_id = COALESCE(?, run_id),
      spec_stable_id = COALESCE(?, spec_stable_id),
      status = 'completed',
      consumed_at = CURRENT_TIMESTAMP
    WHERE request_id = ?
  `).run(
    params.target_location_id,
    params.run_id ?? null,
    params.spec_stable_id ?? null,
    params.request_id,
  );
}

/** Mark a travel request as failed without deleting the request record. */
export function failTravelRequest(requestId: string): void {
  db.prepare(`
    UPDATE travel_requests
    SET status = 'failed'
    WHERE request_id = ? AND status != 'completed'
  `).run(requestId);
}

/** Retrieve recent travel requests for inspection/debugging. */
export function getRecentTravelRequests(limit: number = 10): TravelRequestRecord[] {
  return db.prepare('SELECT * FROM travel_requests ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
}
