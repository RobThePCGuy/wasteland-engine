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

interactRouter.post('/scavenge', async (req: any, res: any) => {
  const player = getPlayerByUserId(req.userId);
  if (!player) return res.status(404).json({ message: 'Player not found' });

  const { resourceType, resourceAmount, tileX, tileY } = req.body;
  if (!resourceType || !resourceAmount || tileX === undefined || tileY === undefined) {
    return res.status(400).json({ message: 'Missing resource info or tile coordinates' });
  }

  // Update the location map to remove the resource
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (location && location.layout_json) {
    try {
      const layout = JSON.parse(location.layout_json);
      const tile = layout.tiles.find((t: any) => t.x === tileX && t.y === tileY);
      if (tile && tile.resource_type === resourceType) {
        tile.resource_type = 'none';
        tile.resource_amount = 0;
        db.prepare('UPDATE locations SET layout_json = ? WHERE id = ?').run(JSON.stringify(layout), location.id);
      } else {
        return res.status(400).json({ message: 'Resource not found at this location.' });
      }
    } catch (e) {
      console.error('Failed to update location layout:', e);
      return res.status(500).json({ message: 'Failed to update location layout' });
    }
  }

  let itemId;
  if (resourceType === 'scrap') {
    const item = db.prepare("SELECT id FROM items WHERE name = 'Scrap Metal'").get() as any;
    itemId = item?.id;
  } else if (resourceType === 'water') {
    const item = db.prepare("SELECT id FROM items WHERE name = 'Purified Water'").get() as any;
    itemId = item?.id;
  } else if (resourceType === 'tech') {
    const item = db.prepare("SELECT id FROM items WHERE name = 'Energy Cell'").get() as any;
    itemId = item?.id;
  }

  if (itemId) {
    const existing = db.prepare('SELECT quantity FROM player_items WHERE player_id = ? AND item_id = ?').get(player.id, itemId) as any;
    if (existing) {
      db.prepare('UPDATE player_items SET quantity = quantity + ? WHERE player_id = ? AND item_id = ?').run(resourceAmount, player.id, itemId);
    } else {
      db.prepare('INSERT INTO player_items (player_id, item_id, quantity) VALUES (?, ?, ?)').run(player.id, itemId, resourceAmount);
    }
  }

  // Award some XP
  const xpAwarded = 10;
  db.prepare('UPDATE players SET experience_points = experience_points + ? WHERE id = ?').run(xpAwarded, player.id);

  res.json({ message: `Scavenged ${resourceAmount} ${resourceType}.`, xp_awarded: xpAwarded });
});

interactRouter.post('/hack', async (req: any, res: any) => {
  const player = getPlayerByUserId(req.userId);
  if (!player) return res.status(404).json({ message: 'Player not found' });

  const { success, tileX, tileY } = req.body;
  if (tileX === undefined || tileY === undefined) {
    return res.status(400).json({ message: 'Missing tile coordinates' });
  }

  // Update the location map to mark the terminal as hacked or locked
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (location && location.layout_json) {
    try {
      const layout = JSON.parse(location.layout_json);
      const tile = layout.tiles.find((t: any) => t.x === tileX && t.y === tileY);
      if (tile && (tile.object_kind === 'terminal' || tile.object_kind === 'computer_console')) {
        // Change the object kind so it can't be interacted with again
        tile.object_kind = success ? 'terminal_hacked' : 'terminal_locked';
        db.prepare('UPDATE locations SET layout_json = ? WHERE id = ?').run(JSON.stringify(layout), location.id);
      } else {
        return res.status(400).json({ message: 'Terminal not found at this location.' });
      }
    } catch (e) {
      console.error('Failed to update location layout:', e);
    }
  }

  if (success) {
    // Award XP and maybe some digital currency (caps for now)
    const xpAwarded = 25;
    const capsAwarded = Math.floor(Math.random() * 20) + 10;
    
    db.prepare('UPDATE players SET experience_points = experience_points + ?, money = money + ? WHERE id = ?').run(xpAwarded, capsAwarded, player.id);
    
    res.json({ message: `Hack successful! Found ${capsAwarded} caps.`, xp_awarded: xpAwarded, caps_awarded: capsAwarded });
  } else {
    res.json({ message: 'Hack failed. Terminal locked.' });
  }
});
