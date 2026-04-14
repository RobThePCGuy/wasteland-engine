import { Router } from 'express';
import { db } from '../db.js';
import {
  assignExplorationPositions,
  generateLocationLayout,
  isWalkablePosition,
  type BattlefieldMap,
} from '../mapgen.js';
import { safeParseJson } from '../utils/safeJson.js';

export const stateRouter = Router();

function parseLayout(value: string | null | undefined): BattlefieldMap | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as BattlefieldMap;
  } catch {
    return null;
  }
}

function hasDuplicatePositions(entries: Array<{ tile_x?: number | null; tile_y?: number | null }>) {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.tile_x === undefined || entry.tile_x === null || entry.tile_y === undefined || entry.tile_y === null) {
      return true;
    }

    const key = `${entry.tile_x},${entry.tile_y}`;
    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function ensureExplorationState(player: any, location: any, npcs: any[]) {
  let layout = parseLayout(location.layout_json);

  if (!layout) {
    layout = generateLocationLayout();
    db.prepare('UPDATE locations SET layout_json = ? WHERE id = ?').run(JSON.stringify(layout), location.id);
    location.layout_json = JSON.stringify(layout);
  }

  const invalidActorPosition =
    !isWalkablePosition(layout, player.tile_x, player.tile_y) ||
    npcs.some(npc => !isWalkablePosition(layout!, npc.tile_x, npc.tile_y));
  const duplicatePositions = hasDuplicatePositions([{ tile_x: player.tile_x, tile_y: player.tile_y }, ...npcs]);

  if (invalidActorPosition || duplicatePositions) {
    const positions = assignExplorationPositions(layout, npcs.length);

    db.prepare('UPDATE players SET tile_x = ?, tile_y = ? WHERE id = ?').run(positions.player.x, positions.player.y, player.id);
    player.tile_x = positions.player.x;
    player.tile_y = positions.player.y;

    npcs.forEach((npc, index) => {
      const position = positions.npcs[index];
      db.prepare('UPDATE npcs SET tile_x = ?, tile_y = ? WHERE id = ?').run(position.x, position.y, npc.id);
      npc.tile_x = position.x;
      npc.tile_y = position.y;
    });
  }

  return layout;
}

const ensureDefaultLocation = db.transaction((player: any) => {
  db.prepare("INSERT OR IGNORE INTO locations (id, name, description) VALUES (1, 'Wasteland Outpost', 'A dusty outpost.')").run();
  const location = db.prepare('SELECT * FROM locations WHERE id = 1').get() as any;

  db.prepare('UPDATE players SET current_location_id = 1 WHERE id = ?').run(player.id);

  const npcCount = db.prepare('SELECT COUNT(*) as count FROM npcs').get() as any;
  if (npcCount.count === 0) {
    db.prepare(`
      INSERT INTO npcs (name, description, type, is_hostile, current_location_id, hit_points, max_hit_points)
      VALUES
      ('Wasteland Scavenger', 'A dirty scavenger looking for scraps.', 'human', 0, 1, 20, 20),
      ('Feral Ghoul', 'A mindless, irradiated zombie.', 'mutant', 1, 1, 15, 15),
      ('Raider Thug', 'A violent raider armed with a rusty pipe.', 'human', 1, 1, 25, 25)
    `).run();

    const stimpak = db.prepare("SELECT id FROM items WHERE name = 'Stimpak'").get() as any;
    if (stimpak) {
      db.prepare('INSERT INTO npc_items (npc_id, item_id, quantity) VALUES (1, ?, 1), (3, ?, 1)').run(stimpak.id, stimpak.id);
    }
  }

  return location;
});

stateRouter.post('/save', (req: any, res: any) => {
  const { player_name, player_stats, location_id } = req.body;
  const existing = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  if (!existing) {
    const hp = 15 + player_stats.strength + (2 * player_stats.endurance);
    const ap = 5 + Math.floor(player_stats.agility / 2);

    db.prepare(`
      INSERT INTO players (user_id, name, strength, perception, endurance, charisma, intelligence, agility, luck, hit_points, max_hit_points, action_points, current_location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.userId,
      player_name,
      player_stats.strength,
      player_stats.perception,
      player_stats.endurance,
      player_stats.charisma,
      player_stats.intelligence,
      player_stats.agility,
      player_stats.luck,
      hp,
      hp,
      ap,
      location_id || 1,
    );
  }

  res.json({ message: 'Game saved' });
});

stateRouter.get('/load', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  if (!player) {
    return res.status(404).json({ message: 'No save found' });
  }

  let location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (!location) {
    location = ensureDefaultLocation(player);
  }

  const npcs = db.prepare('SELECT * FROM npcs WHERE current_location_id = ?').all(location.id);

  // Ensure current location sector is discovered
  const sectors = safeParseJson<number[][]>(player.discovered_sectors_json, []);
  const currentSector = [location.world_x, location.world_y];
  if (!sectors.some((s: number[]) => s[0] === currentSector[0] && s[1] === currentSector[1])) {
    sectors.push(currentSector);
    db.prepare('UPDATE players SET discovered_sectors_json = ? WHERE id = ?').run(JSON.stringify(sectors), player.id);
    player.discovered_sectors_json = JSON.stringify(sectors);
  }

  // Add region info if available (additive - does not change existing shape)
  let regionName: string | null = null;
  if (location.region_id) {
    const region = db.prepare('SELECT name FROM regions WHERE id = ?').get(location.region_id) as any;
    if (region) regionName = region.name;
  }

  const layout = ensureExplorationState(player, location, npcs);
  const activeQuests = db.prepare(`
    SELECT q.*, pq.progress FROM quests q
    JOIN player_quests pq ON q.id = pq.quest_id
    WHERE pq.player_id = ? AND pq.status = 'active'
  `).all(player.id);

  const inventory = db.prepare(`
    SELECT i.*, pi.quantity, pi.is_equipped 
    FROM items i
    JOIN player_items pi ON i.id = pi.item_id
    WHERE pi.player_id = ?
  `).all(player.id);

  const narrativeHistory = db.prepare(`
    SELECT text, type FROM narrative_log 
    WHERE player_id = ? 
    ORDER BY timestamp ASC 
    LIMIT 100
  `).all(player.id);

  const playerPerks = db.prepare(`
    SELECT p.* FROM perks p
    JOIN player_perks pp ON p.id = pp.perk_id
    WHERE pp.player_id = ?
  `).all(player.id);

  res.json({
    player: {
      id: player.id,
      name: player.name,
      stats: {
        strength: player.strength,
        perception: player.perception,
        endurance: player.endurance,
        charisma: player.charisma,
        intelligence: player.intelligence,
        agility: player.agility,
        luck: player.luck,
      },
      vitals: {
        hit_points: player.hit_points,
        max_hit_points: player.max_hit_points,
        action_points: player.action_points,
        experience_points: player.experience_points,
        level: player.level,
        perk_points: player.perk_points,
        money: player.money,
        karma: player.karma,
        ammo_in_clip: player.ammo_in_clip,
        critical_meter: player.critical_meter || 0,
        status_effects: safeParseJson(player.status_effects, []),
        limb_condition: safeParseJson(player.limb_condition, { head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100 }),
      },
      equipment: {
        weapon_id: player.equipped_weapon_id,
        armor_id: player.equipped_armor_id,
      },
      position: {
        x: player.tile_x,
        y: player.tile_y,
      },
      quests: activeQuests,
      perks: playerPerks,
      discovered_sectors: safeParseJson<number[][]>(player.discovered_sectors_json, []),
    },
    location: {
      id: location.id,
      name: location.name,
      description: location.description,
      world_x: location.world_x,
      world_y: location.world_y,
      width: layout?.width,
      height: layout?.height,
      tiles: layout?.tiles ?? [],
      npcs: npcs.map((npc: any) => ({
        npc_id: npc.id,
        name: npc.name,
        is_hostile: npc.is_hostile,
        hit_points: npc.hit_points,
        max_hit_points: npc.max_hit_points,
        x: npc.tile_x,
        y: npc.tile_y,
        tile_x: npc.tile_x,
        tile_y: npc.tile_y,
        status_effects: safeParseJson(npc.status_effects, []),
        limb_condition: safeParseJson(npc.limb_condition, { head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100 }),
      })),
    },
    region_name: regionName,
    inventory,
    narrative_history: narrativeHistory,
  });
});

stateRouter.post('/levelup', async (req: any, res: any) => {
  const { stat } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  const xpNeeded = player.level * 1000;
  if (player.experience_points < xpNeeded) {
    return res.status(400).json({ message: 'Not enough XP to level up.' });
  }

  const validStats = ['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'];
  if (!validStats.includes(stat)) {
    return res.status(400).json({ message: 'Invalid stat.' });
  }

  const newLevel = player.level + 1;
  const newStatValue = player[stat] + 1;
  const newMaxHp = player.max_hit_points + 5 + Math.floor(player.endurance / 2);
  const newPerkPoints = player.perk_points + 1;

  db.prepare(`
    UPDATE players 
    SET level = ?, ${stat} = ?, max_hit_points = ?, hit_points = ?, perk_points = ?
    WHERE id = ?
  `).run(newLevel, newStatValue, newMaxHp, newMaxHp, newPerkPoints, player.id);

  res.json({ message: `Leveled up to ${newLevel}! ${stat.toUpperCase()} increased to ${newStatValue}. You gained a Perk Point!` });
});

stateRouter.post('/perk/choose', async (req: any, res: any) => {
  const { perkId } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  if (player.perk_points <= 0) {
    return res.status(400).json({ message: 'No perk points available.' });
  }

  const perk = db.prepare('SELECT * FROM perks WHERE id = ?').get(perkId) as any;
  if (!perk) {
    return res.status(404).json({ message: 'Perk not found.' });
  }

  // Check if player already has it
  const existing = db.prepare('SELECT * FROM player_perks WHERE player_id = ? AND perk_id = ?').get(player.id, perkId);
  if (existing) {
    return res.status(400).json({ message: 'You already have this perk.' });
  }

  // Check requirements
  const requirements = JSON.parse(perk.requirements_json || '{}');
  if (requirements.level && player.level < requirements.level) {
    return res.status(400).json({ message: `Requires level ${requirements.level}.` });
  }
  if (requirements.strength && player.strength < requirements.strength) return res.status(400).json({ message: `Requires Strength ${requirements.strength}.` });
  if (requirements.perception && player.perception < requirements.perception) return res.status(400).json({ message: `Requires Perception ${requirements.perception}.` });
  if (requirements.endurance && player.endurance < requirements.endurance) return res.status(400).json({ message: `Requires Endurance ${requirements.endurance}.` });
  if (requirements.charisma && player.charisma < requirements.charisma) return res.status(400).json({ message: `Requires Charisma ${requirements.charisma}.` });
  if (requirements.intelligence && player.intelligence < requirements.intelligence) return res.status(400).json({ message: `Requires Intelligence ${requirements.intelligence}.` });
  if (requirements.agility && player.agility < requirements.agility) return res.status(400).json({ message: `Requires Agility ${requirements.agility}.` });
  if (requirements.luck && player.luck < requirements.luck) return res.status(400).json({ message: `Requires Luck ${requirements.luck}.` });

  const grantPerk = db.transaction(() => {
    db.prepare('INSERT INTO player_perks (player_id, perk_id) VALUES (?, ?)').run(player.id, perkId);
    db.prepare('UPDATE players SET perk_points = perk_points - 1 WHERE id = ?').run(player.id);
  });
  grantPerk();

  res.json({ message: `You have gained the perk: ${perk.name}!` });
});

stateRouter.post('/restart', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  if (player) {
    const deletePlayer = db.transaction(() => {
      db.prepare('DELETE FROM player_items WHERE player_id = ?').run(player.id);
      db.prepare('DELETE FROM player_quests WHERE player_id = ?').run(player.id);
      db.prepare('DELETE FROM player_perks WHERE player_id = ?').run(player.id);
      db.prepare('DELETE FROM narrative_log WHERE player_id = ?').run(player.id);
      db.prepare('DELETE FROM players WHERE id = ?').run(player.id);
    });
    deletePlayer();
  }
  res.json({ message: 'Game restarted.' });
});
