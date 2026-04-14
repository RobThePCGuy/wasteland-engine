import { createSeededRng, shuffleWithRng } from './utils/seededRng.js';

export interface Tile {
  x: number;
  y: number;
  kind: 'floor' | 'rubble' | 'wall' | 'rock' | 'dirt' | 'grass' | 'pavement' | 'cracked_pavement' | 'sand' | 'wasteland' | 'water' | 'toxic_sludge' | 'metal_floor';
  object_kind?: 'none' | 'barrel' | 'crate' | 'debris' | 'ruined_wall' | 'cactus' | 'terminal' | 'pipe' | 'radioactive_barrel' | 'computer_console' | 'power_generator' | 'ruined_car' | 'skeleton' | 'scrap_heap' | 'vending_machine';
  ap_cost: number;
  is_highlighted?: boolean;
  is_poi?: boolean;
  poi_description?: string;
  resource_type?: 'scrap' | 'water' | 'tech' | 'none';
  resource_amount?: number;
  animation?: 'flicker' | 'glow' | 'pulse' | 'none';
  hazard?: 'radiation' | 'toxic_gas' | 'none';
}

export type BiomeType = 'desert' | 'urban' | 'forest' | 'scrubland' | 'wasteland' | 'industrial' | 'vault';

export interface BiomeConfig {
  base_terrain: Tile['kind'];
  variety_terrain: { kind: Tile['kind'], chance: number }[];
  common_objects: NonNullable<Tile['object_kind']>[];
  rare_objects: NonNullable<Tile['object_kind']>[];
  rubble_chance_modifier: number;
  object_chance: number;
}

export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  desert: {
    base_terrain: 'sand',
    variety_terrain: [{ kind: 'dirt', chance: 0.1 }],
    common_objects: ['cactus', 'debris', 'skeleton'],
    rare_objects: ['barrel', 'ruined_car'],
    rubble_chance_modifier: 0.05,
    object_chance: 0.06,
  },
  urban: {
    base_terrain: 'pavement',
    variety_terrain: [{ kind: 'cracked_pavement', chance: 0.3 }, { kind: 'rubble', chance: 0.1 }],
    common_objects: ['debris', 'ruined_wall', 'barrel'],
    rare_objects: ['terminal', 'vending_machine', 'ruined_car'],
    rubble_chance_modifier: 0.15,
    object_chance: 0.1,
  },
  forest: {
    base_terrain: 'grass',
    variety_terrain: [{ kind: 'dirt', chance: 0.2 }],
    common_objects: ['debris', 'scrap_heap'],
    rare_objects: ['skeleton', 'pipe'],
    rubble_chance_modifier: -0.05,
    object_chance: 0.08,
  },
  scrubland: {
    base_terrain: 'dirt',
    variety_terrain: [{ kind: 'wasteland', chance: 0.1 }, { kind: 'grass', chance: 0.1 }],
    common_objects: ['cactus', 'debris', 'scrap_heap'],
    rare_objects: ['barrel', 'skeleton'],
    rubble_chance_modifier: 0,
    object_chance: 0.07,
  },
  wasteland: {
    base_terrain: 'wasteland',
    variety_terrain: [{ kind: 'rubble', chance: 0.2 }, { kind: 'toxic_sludge', chance: 0.05 }],
    common_objects: ['debris', 'barrel', 'skeleton'],
    rare_objects: ['radioactive_barrel', 'scrap_heap'],
    rubble_chance_modifier: 0.1,
    object_chance: 0.09,
  },
  industrial: {
    base_terrain: 'metal_floor',
    variety_terrain: [{ kind: 'pavement', chance: 0.1 }, { kind: 'toxic_sludge', chance: 0.1 }],
    common_objects: ['barrel', 'pipe', 'crate'],
    rare_objects: ['power_generator', 'computer_console', 'radioactive_barrel'],
    rubble_chance_modifier: 0.05,
    object_chance: 0.12,
  },
  vault: {
    base_terrain: 'metal_floor',
    variety_terrain: [{ kind: 'floor', chance: 0.2 }],
    common_objects: ['crate', 'terminal', 'pipe'],
    rare_objects: ['computer_console', 'power_generator'],
    rubble_chance_modifier: -0.1,
    object_chance: 0.15,
  }
};

export interface BattlefieldMap {
  width: number;
  height: number;
  tiles: Tile[];
  weather?: 'clear' | 'sandstorm' | 'radstorm' | 'rain';
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface LayoutGenerationOptions {
  width?: number;
  height?: number;
  stable_id?: string | null;
  biome?: string | null;
  threat_level?: 'low' | 'medium' | 'high' | 'extreme' | null;
  hazard_tags?: string[];
  site_tags?: string[];
  faction_presence?: string[];
  object_density?: number;
  rubble_frequency?: number;
  wall_density?: number;
}

export interface LayoutTuning {
  rubble_chance: number;
  cluster_count_min: number;
  cluster_count_max: number;
  cluster_size_min: number;
  cluster_size_max: number;
  wall_bias: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasTag(tags: string[] | undefined, values: string[]) {
  const normalized = new Set((tags ?? []).map(tag => tag.toLowerCase()));
  return values.some(value => normalized.has(value));
}

export function buildLayoutTuning(options: LayoutGenerationOptions = {}): LayoutTuning {
  const biome = options.biome?.toLowerCase() ?? '';
  const hazardTags = options.hazard_tags ?? [];
  const siteTags = options.site_tags ?? [];
  const factionPresence = options.faction_presence ?? [];

  let rubbleChance = 0.15;
  let clusterCountMin = 2;
  let clusterCountMax = 4;
  let clusterSizeMin = 2;
  let clusterSizeMax = 4;
  let wallBias = 0.5;

  switch (options.threat_level) {
    case 'high':
      rubbleChance += 0.05;
      clusterCountMin += 1;
      clusterCountMax += 1;
      break;
    case 'extreme':
      rubbleChance += 0.08;
      clusterCountMin += 2;
      clusterCountMax += 2;
      clusterSizeMax += 1;
      break;
    case 'medium':
      rubbleChance += 0.02;
      break;
    default:
      break;
  }

  if (biome === 'desert' || biome === 'scrubland') {
    rubbleChance += 0.03;
    wallBias -= 0.15;
  }

  if (biome === 'underground' || hasTag(siteTags, ['vault', 'bunker', 'substation', 'relay'])) {
    wallBias += 0.25;
    clusterSizeMax += 1;
  }

  if (hasTag(siteTags, ['settlement', 'outpost', 'camp'])) {
    wallBias += 0.1;
  }

  if (hasTag(hazardTags, ['radiation'])) {
    rubbleChance += 0.05;
  }

  if (hasTag(hazardTags, ['storms', 'sandstorms'])) {
    rubbleChance += 0.04;
  }

  if (hasTag(hazardTags, ['bandits', 'raiders'])) {
    clusterCountMin += 1;
    clusterCountMax += 1;
    wallBias += 0.25;
  }

  if (hasTag(hazardTags, ['mutants'])) {
    clusterSizeMax += 1;
  }

  if (factionPresence.length > 0) {
    wallBias += 0.15;
    // Faction presence increases structure density
    clusterCountMax += 2;
  }

  // Override with manual density if provided
  if (options.rubble_frequency !== undefined) {
    rubbleChance = options.rubble_frequency;
  }
  if (options.wall_density !== undefined) {
    wallBias = options.wall_density;
  }

  return {
    rubble_chance: clamp(rubbleChance, 0.05, 0.6),
    cluster_count_min: clamp(clusterCountMin, 1, 10),
    cluster_count_max: clamp(Math.max(clusterCountMin, clusterCountMax), 1, 15),
    cluster_size_min: clamp(clusterSizeMin, 1, 6),
    cluster_size_max: clamp(Math.max(clusterSizeMin, clusterSizeMax), 1, 8),
    wall_bias: clamp(wallBias, 0.1, 0.95),
  };
}

function resolveLayoutRng(options: LayoutGenerationOptions) {
  return options.stable_id ? createSeededRng(`layout:${options.stable_id}`) : Math.random;
}

export function generateBattlefield(
  width = 12,
  height = 12,
  tuning: LayoutTuning = buildLayoutTuning(),
  rng: () => number = Math.random,
  biomeName = 'wasteland'
): BattlefieldMap {
  const tiles: Tile[] = [];
  const biome = (BIOME_CONFIGS[biomeName as BiomeType] || BIOME_CONFIGS.wasteland) as BiomeConfig;

  // Initialize all as base floor
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ x, y, kind: biome.base_terrain, object_kind: 'none', ap_cost: 1 });
    }
  }

  const getTile = (x: number, y: number) => tiles[y * width + x];
  const isSpawnZone = (y: number) => y <= 1 || y >= height - 2;

  // Determine weather
  let weather: BattlefieldMap['weather'] = 'clear';
  if (biomeName === 'desert' && rng() < 0.4) weather = 'sandstorm';
  else if (biomeName === 'wasteland' && rng() < 0.2) weather = 'radstorm';
  else if (biomeName === 'forest' && rng() < 0.3) weather = 'rain';

  // Add terrain variety
  for (const tile of tiles) {
    for (const variety of biome.variety_terrain) {
      if (rng() < variety.chance) {
        tile.kind = variety.kind;
        if (variety.kind === 'water' || variety.kind === 'toxic_sludge') {
          tile.ap_cost = 3; // Difficult terrain
        }
        break;
      }
    }
    
    // Add hazards to tiles
    if (tile.kind === 'toxic_sludge') {
      tile.hazard = 'toxic_gas';
    } else if (weather === 'radstorm' && rng() < 0.1) {
      tile.hazard = 'radiation';
    } else if (rng() < 0.02) {
      tile.hazard = 'radiation';
    }
  }

  // Add rubble/debris

  const rubbleChance = tuning.rubble_chance + biome.rubble_chance_modifier;
  for (const tile of tiles) {
    if (isSpawnZone(tile.y)) continue;
    if (rng() < rubbleChance) {
      if (rng() < 0.5) {
        tile.kind = 'rubble';
        tile.ap_cost = 2;
      } else {
        tile.object_kind = 'debris';
        tile.ap_cost = 2;
      }
    }
  }

  // Add objects
  const objectDensity = tuning.rubble_chance; // Using rubble chance as a proxy for chaos/density if not specified
  const objectChance = biome.object_chance * (1 + (tuning.wall_bias - 0.5)); // More walls = more clutter

  for (const tile of tiles) {
    if (isSpawnZone(tile.y) || tile.kind === 'wall' || tile.kind === 'rock' || tile.object_kind !== 'none') continue;
    
    if (rng() < objectChance) {
      const isRare = rng() < 0.2;
      const pool = isRare ? biome.rare_objects : biome.common_objects;
      tile.object_kind = pool[Math.floor(rng() * pool.length)];
      tile.ap_cost = 2;

      // Add animations to specific objects
      if (tile.object_kind === 'terminal' || tile.object_kind === 'computer_console') {
        tile.animation = 'flicker';
      } else if (tile.object_kind === 'radioactive_barrel' || tile.object_kind === 'power_generator') {
        tile.animation = 'glow';
      }

      // Randomly assign POIs
      if (rng() < 0.05) {
        tile.is_poi = true;
        tile.is_highlighted = true;
        tile.poi_description = `A curious looking ${tile.object_kind?.replace('_', ' ')}. Might be worth investigating.`;
      }

      // Randomly assign resources
      if (rng() < 0.08) {
        const resTypes: Tile['resource_type'][] = ['scrap', 'water', 'tech'];
        tile.resource_type = resTypes[Math.floor(rng() * resTypes.length)];
        tile.resource_amount = Math.floor(rng() * 5) + 1;
        tile.is_highlighted = true;
      }
    }
  }

  // Add 2-4 wall/rock clusters
  const clusterCount = tuning.cluster_count_min + Math.floor(rng() * (tuning.cluster_count_max - tuning.cluster_count_min + 1));
  for (let i = 0; i < clusterCount; i++) {
    // Place cluster centers away from spawn zones
    const cx = 1 + Math.floor(rng() * (width - 2));
    const cy = 3 + Math.floor(rng() * (height - 6));
    const clusterSize = tuning.cluster_size_min + Math.floor(rng() * (tuning.cluster_size_max - tuning.cluster_size_min + 1));
    const kind = rng() < tuning.wall_bias ? 'wall' : 'rock';

    for (let j = 0; j < clusterSize; j++) {
      const dx = cx + Math.floor(rng() * 3) - 1;
      const dy = cy + Math.floor(rng() * 3) - 1;
      if (dx >= 0 && dx < width && dy >= 0 && dy < height && !isSpawnZone(dy)) {
        const t = getTile(dx, dy);
        t.kind = kind as 'wall' | 'rock';
        t.object_kind = 'none'; // Walls/rocks replace objects
        t.ap_cost = -1;
      }
    }
  }

  // Flood-fill connectivity check between spawn zones
  // Find a walkable tile in bottom spawn zone
  let startTile: Tile | null = null;
  for (let y = height - 2; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = getTile(x, y);
      if (t.ap_cost > 0) { startTile = t; break; }
    }
    if (startTile) break;
  }

  if (startTile) {
    const visited = new Set<string>();
    const queue: [number, number][] = [[startTile.x, startTile.y]];
    visited.add(`${startTile.x},${startTile.y}`);

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        const t = getTile(nx, ny);
        if (t.ap_cost < 0) continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }

    // Check if any top spawn zone tile is reachable
    let topReachable = false;
    for (let y = 0; y <= 1; y++) {
      for (let x = 0; x < width; x++) {
        if (visited.has(`${x},${y}`) && getTile(x, y).ap_cost > 0) {
          topReachable = true;
          break;
        }
      }
      if (topReachable) break;
    }

    // If not connected, clear a vertical path
    if (!topReachable) {
      const pathX = Math.floor(width / 2);
      for (let y = 0; y < height; y++) {
        const t = getTile(pathX, y);
        if (t.ap_cost < 0) {
          t.kind = 'floor';
          t.ap_cost = 1;
        }
      }
    }
  }

  return { width, height, tiles, weather };
}

export function generateLocationLayout(options: LayoutGenerationOptions = {}): BattlefieldMap {
  const width = options.width ?? 10;
  const height = options.height ?? 10;
  const tuning = buildLayoutTuning(options);
  const biome = options.biome ?? 'wasteland';
  return generateBattlefield(width, height, tuning, resolveLayoutRng(options), biome);
}

export function getWalkableTiles(map: BattlefieldMap) {
  return map.tiles.filter(tile => tile.ap_cost > 0);
}

export function isWalkablePosition(map: BattlefieldMap, x?: number | null, y?: number | null) {
  if (x === undefined || x === null || y === undefined || y === null) {
    return false;
  }

  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return false;
  }

  return map.tiles[(y * map.width) + x]?.ap_cost > 0;
}

export function assignExplorationPositions(map: BattlefieldMap, npcCount: number, seed?: string) {
  const rng = seed ? createSeededRng(`exploration:${seed}`) : Math.random;
  const walkableTiles = shuffleWithRng(getWalkableTiles(map), rng);

  if (walkableTiles.length < npcCount + 1) {
    throw new Error('Not enough walkable tiles to place all exploration actors.');
  }

  const playerSpawn = walkableTiles[0];
  const npcSpawns = walkableTiles.slice(1, npcCount + 1);

  return {
    player: { x: playerSpawn.x, y: playerSpawn.y },
    npcs: npcSpawns.map(tile => ({ x: tile.x, y: tile.y })),
  };
}

export function assignStartPositions(turnOrder: any[], map: BattlefieldMap): any[] {
  const { width, height } = map;
  const getTile = (x: number, y: number) => map.tiles[y * width + x];

  // Collect walkable tiles in spawn zones
  const playerSpawns: Tile[] = [];
  const npcSpawns: Tile[] = [];

  for (let y = height - 2; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = getTile(x, y);
      if (t.ap_cost > 0) playerSpawns.push(t);
    }
  }
  for (let y = 0; y <= 1; y++) {
    for (let x = 0; x < width; x++) {
      const t = getTile(x, y);
      if (t.ap_cost > 0) npcSpawns.push(t);
    }
  }

  // Spread combatants across their spawn zones
  let playerIdx = 0;
  let npcIdx = 0;
  const playerStep = Math.max(1, Math.floor(playerSpawns.length / (turnOrder.filter(c => c.type === 'player').length || 1)));
  const npcStep = Math.max(1, Math.floor(npcSpawns.length / (turnOrder.filter(c => c.type === 'npc').length || 1)));

  return turnOrder.map(c => {
    if (c.type === 'player') {
      const spawn = playerSpawns[Math.min(playerIdx * playerStep, playerSpawns.length - 1)];
      playerIdx++;
      return { ...c, tile_x: spawn.x, tile_y: spawn.y };
    } else {
      const spawn = npcSpawns[Math.min(npcIdx * npcStep, npcSpawns.length - 1)];
      npcIdx++;
      return { ...c, tile_x: spawn.x, tile_y: spawn.y };
    }
  });
}
