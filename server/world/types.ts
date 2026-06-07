/**
 * Core world model types for the AI world generation foundation.
 * All interfaces include schema_version for migration safety.
 */

export enum CanonLevel {
  /** Exists only at runtime, never persisted as canon */
  RuntimeOnly = 'runtime_only',
  /** Persisted as a regional fact */
  RegionalFact = 'regional_fact',
  /** Persisted as a global canon fact */
  GlobalCanon = 'global_canon',
}

export interface WorldProfile {
  id: number;
  stable_id: string;
  name: string;
  climate: string;
  biome: string;
  tone: string;
  scarcity_profile: string;
  tech_level: string;
  banned_motifs: string[];
  schema_version: number;
}

export interface Region {
  id: number;
  stable_id: string;
  name: string;
  description: string | null;
  biome_tags: string[];
  hazard_tags: string[];
  resource_tags: string[];
  faction_tags: string[];
  world_id: number;
  schema_version: number;
}

export interface WorldFact {
  id: number;
  stable_id: string;
  fact_type: string;
  scope: 'global' | 'regional' | 'local';
  subject: string;
  body: string;
  region_id: number | null;
  canon_level: CanonLevel;
  source: string | null;
  promoted_by: string | null;
  promoted_reason: string | null;
  schema_version: number;
  created_at: string;
}

export interface PlayerSummary {
  id: number;
  name: string;
  level: number;
  karma: number;
  reputation: Record<string, number>;
  current_location_id: number | null;
}

export interface QuestSummary {
  id: number;
  title: string;
  status: string;
  objectives: Array<{
    text: string;
    type: string;
    target: string;
    completed: boolean;
  }>;
}

export interface NearbyLocation {
  id: number;
  name: string;
  description: string | null;
  region_id: number | null;
}

export interface GenerationContext {
  world: WorldProfile;
  region: Region | null;
  player: PlayerSummary;
  active_quests: QuestSummary[];
  nearby_locations: NearbyLocation[];
  salient_facts: WorldFact[];
  schema_version: number;
}

export interface WorldDelta {
  id: number;
  stable_id: string;
  delta_type: string;
  target_type: string;
  target_id: string;
  payload: any;
  player_id: number | null;
  run_id: string | null;
  created_at: string;
}