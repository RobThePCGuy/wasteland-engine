import { Router } from 'express';
import { db } from '../db.js';
import { getPlayerByUserId, ok, fail, applyHazardDamage } from '../combat-services/shared.js';
import { findPath } from '../pathfinding.js';
import { isWalkablePosition } from '../mapgen.js';

export const interactRouter = Router();

interactRouter.post('/move', async (req: any, res: any) => {
  const player = getPlayerByUserId(req.userId);
  if (!player) return res.status(404).json({ message: 'Player not found' });

  const { targetX, targetY } = req.body;
  if (targetX === undefined || targetY === undefined) {
    return res.status(400).json({ message: 'Missing target coordinates' });
  }

  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (!location || !location.layout_json) {
    return res.status(400).json({ message: 'Location not found or has no layout' });
  }

  const layout = JSON.parse(location.layout_json);
  
  if (!isWalkablePosition(layout, targetX, targetY)) {
    return res.status(400).json({ message: 'Target position is not walkable' });
  }

  const npcs = db.prepare('SELECT id, tile_x, tile_y FROM npcs WHERE current_location_id = ? AND hit_points > 0').all(location.id) as any[];
  const occupiedPositions = new Set<string>();
  npcs.forEach(npc => occupiedPositions.add(`${npc.tile_x},${npc.tile_y}`));

  if (occupiedPositions.has(`${targetX},${targetY}`)) {
    return res.status(400).json({ message: 'Target position is occupied' });
  }

  const pathResult = findPath(layout, player.tile_x, player.tile_y, targetX, targetY, occupiedPositions);
  
  if (!pathResult.valid || pathResult.path.length === 0) {
    return res.status(400).json({ message: 'No valid path to target' });
  }

  const combatLog: any[] = [];
  const hazardDamage = applyHazardDamage(player, 'player', pathResult.path, layout, { current_round: 0 }, combatLog, []);

  db.prepare('UPDATE players SET tile_x = ?, tile_y = ? WHERE id = ?').run(targetX, targetY, player.id);

  res.json({ 
    message: `Moved to (${targetX}, ${targetY}).${hazardDamage > 0 ? ` Took ${hazardDamage} hazard damage.` : ''}`,
    path: pathResult.path,
    hazardDamage,
    combatLog
  });
});

const RESOURCE_ITEM_NAMES: Record<string, string> = {
  scrap: 'Scrap Metal',
  water: 'Purified Water',
  tech: 'Energy Cell',
};

interactRouter.post('/scavenge', async (req: any, res: any) => {
  const player = getPlayerByUserId(req.userId);
  if (!player) return res.status(404).json({ message: 'Player not found' });

  const { resourceType, tileX, tileY } = req.body;
  if (!resourceType || tileX === undefined || tileY === undefined) {
    return res.status(400).json({ message: 'Missing resource info or tile coordinates' });
  }

  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (!location || !location.layout_json) {
    return res.status(400).json({ message: 'Location not found or has no layout' });
  }

  let layout: any;
  try {
    layout = JSON.parse(location.layout_json);
  } catch {
    return res.status(400).json({ message: 'Location layout is corrupt.' });
  }

  const tile = layout.tiles?.find((t: any) => t.x === tileX && t.y === tileY);
  if (!tile || tile.resource_type !== resourceType || !(tile.resource_amount > 0)) {
    return res.status(400).json({ message: 'Resource not found at this location.' });
  }

  // Server is authoritative on the amount — derive it from the tile, never from the request body.
  const amount = tile.resource_amount;
  const itemName = RESOURCE_ITEM_NAMES[resourceType];
  const item = itemName ? (db.prepare('SELECT id FROM items WHERE name = ?').get(itemName) as any) : null;
  const xpAwarded = 10;

  // Consume the tile resource and grant the reward atomically.
  db.transaction(() => {
    tile.resource_type = 'none';
    tile.resource_amount = 0;
    db.prepare('UPDATE locations SET layout_json = ? WHERE id = ?').run(JSON.stringify(layout), location.id);

    if (item) {
      const existing = db.prepare('SELECT quantity FROM player_items WHERE player_id = ? AND item_id = ?').get(player.id, item.id) as any;
      if (existing) {
        db.prepare('UPDATE player_items SET quantity = quantity + ? WHERE player_id = ? AND item_id = ?').run(amount, player.id, item.id);
      } else {
        db.prepare('INSERT INTO player_items (player_id, item_id, quantity) VALUES (?, ?, ?)').run(player.id, item.id, amount);
      }
    }

    db.prepare('UPDATE players SET experience_points = experience_points + ? WHERE id = ?').run(xpAwarded, player.id);
  })();

  res.json({ message: `Scavenged ${amount} ${resourceType}.`, amount, xp_awarded: xpAwarded });
});

interactRouter.post('/rest', async (req: any, res: any) => {
  const player = getPlayerByUserId(req.userId);
  if (!player) return res.status(404).json({ message: 'Player not found' });

  const healAmount = Math.floor(player.max_hit_points * 0.5); // Heal 50% max HP
  const newHp = Math.min(player.hit_points + healAmount, player.max_hit_points);
  
  db.prepare('UPDATE players SET hit_points = ? WHERE id = ?').run(newHp, player.id);

  // Small chance of a random encounter or event during rest could be added here,
  // but for now just heal the player.
  res.json({ message: `You rested and recovered ${newHp - player.hit_points} HP.`, healed: newHp - player.hit_points });
});

interactRouter.post('/hack', async (req: any, res: any) => {
  const player = getPlayerByUserId(req.userId);
  if (!player) return res.status(404).json({ message: 'Player not found' });

  const { success, tileX, tileY } = req.body;
  if (tileX === undefined || tileY === undefined) {
    return res.status(400).json({ message: 'Missing tile coordinates' });
  }

  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (!location || !location.layout_json) {
    return res.status(400).json({ message: 'Location not found or has no layout' });
  }

  let layout: any;
  try {
    layout = JSON.parse(location.layout_json);
  } catch {
    return res.status(400).json({ message: 'Location layout is corrupt.' });
  }

  const tile = layout.tiles?.find((t: any) => t.x === tileX && t.y === tileY);
  // Idempotency + validity gate: only an un-hacked terminal can be hacked. Already
  // hacked/locked terminals and non-terminals are rejected, so the reward cannot be
  // farmed by replaying the request. (`caps` previously referenced a non-existent column,
  // which threw inside this async handler with no response — it is now `money`.)
  if (!tile || (tile.object_kind !== 'terminal' && tile.object_kind !== 'computer_console')) {
    return res.status(400).json({ message: 'No accessible terminal at this location.' });
  }

  const hackSucceeded = success === true;
  const xpAwarded = hackSucceeded ? 25 : 0;
  let capsAwarded = 0;

  // Persist terminal state and any reward atomically — no silent fall-through that would
  // leave the terminal re-hackable while still paying out.
  db.transaction(() => {
    tile.object_kind = hackSucceeded ? 'terminal_hacked' : 'terminal_locked';
    db.prepare('UPDATE locations SET layout_json = ? WHERE id = ?').run(JSON.stringify(layout), location.id);

    if (hackSucceeded) {
      capsAwarded = Math.floor(Math.random() * 20) + 10;
      db.prepare('UPDATE players SET experience_points = experience_points + ?, money = money + ? WHERE id = ?')
        .run(xpAwarded, capsAwarded, player.id);
    }
  })();

  if (hackSucceeded) {
    res.json({ message: `Hack successful! Found ${capsAwarded} caps.`, xp_awarded: xpAwarded, caps_awarded: capsAwarded });
  } else {
    res.json({ message: 'Hack failed. Terminal locked.' });
  }
});
