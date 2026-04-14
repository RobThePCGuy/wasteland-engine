import { db } from '../db.js';
import { getWorldProfile, getRegionForLocation, getCanonFacts } from './worldService.js';
import type { GenerationContext, PlayerSummary, QuestSummary, NearbyLocation } from './types.js';

const CONTEXT_SCHEMA_VERSION = 1;
const NEARBY_LOCATION_LIMIT = 5;
const SALIENT_FACT_LIMIT = 20;
const QUEST_CONTEXT_LIMIT = 3;

function buildPlayerSummary(playerId: number): PlayerSummary | null {
  const row = db.prepare('SELECT id, name, level, karma, reputation, current_location_id FROM players WHERE id = ?').get(playerId) as any;
  if (!row) return null;

  let reputation: Record<string, number> = {};
  try {
    reputation = JSON.parse(row.reputation || '{}');
  } catch {
    reputation = {};
  }

  return {
    id: row.id,
    name: row.name,
    level: row.level,
    karma: row.karma,
    reputation,
    current_location_id: row.current_location_id,
  };
}

function scoreQuestRelevance(
  quest: QuestSummary,
  currentLocationName: string | null,
  regionName: string | null,
  nearbyLocationNames: string[],
): number {
  let score = 0;
  const searchText = `${quest.title} ${quest.objectives.map(o => `${o.text} ${o.target}`).join(' ')}`.toLowerCase();

  // Highest priority: quest mentions current location
  if (currentLocationName && searchText.includes(currentLocationName.toLowerCase())) {
    score += 10;
  }

  // High priority: quest mentions the region
  if (regionName && searchText.includes(regionName.toLowerCase())) {
    score += 5;
  }

  // Medium priority: quest mentions a nearby location
  for (const nearby of nearbyLocationNames) {
    if (searchText.includes(nearby.toLowerCase())) {
      score += 3;
      break; // Only count once
    }
  }

  // Low priority: incomplete objectives (more to do = more relevant)
  const incomplete = quest.objectives.filter(o => !o.completed).length;
  score += incomplete;

  return score;
}

function buildQuestSummaries(
  playerId: number,
  currentLocationName: string | null,
  regionName: string | null,
  nearbyLocationNames: string[],
): QuestSummary[] {
  const rows = db.prepare(`
    SELECT q.id, q.title, pq.status, q.objectives, pq.progress
    FROM quests q
    JOIN player_quests pq ON q.id = pq.quest_id
    WHERE pq.player_id = ? AND pq.status = 'active'
  `).all(playerId) as any[];

  const summaries = rows.map(row => {
    let objectives: any[] = [];
    let progress: any[] = [];
    try { objectives = JSON.parse(row.objectives); } catch { objectives = []; }
    try { progress = JSON.parse(row.progress); } catch { progress = []; }

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      objectives: objectives.map((obj: any, i: number) => ({
        text: obj.text,
        type: obj.type,
        target: obj.target,
        completed: progress[i]?.completed ?? false,
      })),
    };
  });

  const scored = summaries.map(q => ({
    quest: q,
    score: scoreQuestRelevance(q, currentLocationName, regionName, nearbyLocationNames),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, QUEST_CONTEXT_LIMIT).map(s => s.quest);
}

function buildNearbyLocations(currentLocationId: number, regionId: number | null): NearbyLocation[] {
  let query: string;
  let params: any[];

  if (regionId) {
    // Prefer locations in the same region, most recent first
    query = 'SELECT id, name, description, region_id FROM locations WHERE id != ? AND region_id = ? ORDER BY id DESC LIMIT ?';
    params = [currentLocationId, regionId, NEARBY_LOCATION_LIMIT];
  } else {
    query = 'SELECT id, name, description, region_id FROM locations WHERE id != ? ORDER BY id DESC LIMIT ?';
    params = [currentLocationId, NEARBY_LOCATION_LIMIT];
  }

  return (db.prepare(query).all(...params) as any[]).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    region_id: row.region_id,
  }));
}

/**
 * Build a compact, relevance-gated generation context for AI calls.
 * Assembles world profile, region, player summary, active quests,
 * nearby locations, and salient canon facts.
 */
export function buildGenerationContext(playerId: number, locationId: number): GenerationContext | null {
  const world = getWorldProfile();
  if (!world) return null;

  const player = buildPlayerSummary(playerId);
  if (!player) return null;

  const region = getRegionForLocation(locationId);
  const nearbyLocations = buildNearbyLocations(locationId, region?.id ?? null);
  const currentLocationRow = db.prepare('SELECT name FROM locations WHERE id = ?').get(locationId) as any;
  const activeQuests = buildQuestSummaries(
    playerId,
    currentLocationRow?.name ?? null,
    region?.name ?? null,
    nearbyLocations.map(l => l.name),
  );

  // Relevance-gated fact retrieval: get regional + global facts
  const salientFacts = getCanonFacts(undefined, region?.id, SALIENT_FACT_LIMIT);

  return {
    world,
    region,
    player,
    active_quests: activeQuests,
    nearby_locations: nearbyLocations,
    salient_facts: salientFacts,
    schema_version: CONTEXT_SCHEMA_VERSION,
  };
}
