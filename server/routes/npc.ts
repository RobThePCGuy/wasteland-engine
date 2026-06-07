import { Router } from 'express';
import { db } from '../db.js';
import { updateQuestProgress } from '../quests.js';

export const npcRouter = Router();

npcRouter.get('/:id/dialogue', async (req: any, res: any) => {
  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id) as any;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  if (!npc || !player) {
    return res.status(404).json({ message: 'Not found' });
  }

  updateQuestProgress(player.id, 'talk', npc.name);
  res.json({ npc, player });
});

npcRouter.get('/:id/trade', async (req: any, res: any) => {
  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id) as any;
  if (!npc) {
    return res.status(404).json({ message: 'NPC not found' });
  }

  const inventory = db.prepare(`
    SELECT i.*, ni.quantity 
    FROM items i
    JOIN npc_items ni ON i.id = ni.item_id
    WHERE ni.npc_id = ?
  `).all(npc.id);

  res.json({ npc, inventory });
});

npcRouter.post('/dialogue/respond', async (req: any, res: any) => {
  const { npc_id } = req.body;
  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(npc_id) as any;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  res.json({ npc, player });
});

npcRouter.post('/:id/loot', async (req: any, res: any) => {
  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id) as any;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  if (!npc || !player) {
    return res.status(404).json({ message: 'Not found' });
  }

  if (npc.hit_points > 0) {
    return res.status(400).json({ message: 'NPC is not dead' });
  }

  if (npc.current_location_id !== player.current_location_id) {
    return res.status(400).json({ message: 'Not in same location' });
  }

  const capsFound = Math.floor(Math.random() * 20) + 1;

  // Loot the NPC's ACTUAL inventory (npc_items) — the themed loot assigned at spawn — rather
  // than a random row from the global items table.
  const npcInventory = db.prepare(`
    SELECT i.id, i.name, ni.quantity
    FROM items i
    JOIN npc_items ni ON i.id = ni.item_id
    WHERE ni.npc_id = ?
  `).all(npc.id) as any[];

  const lootedNames: string[] = [];

  db.transaction(() => {
    db.prepare('UPDATE players SET money = money + ? WHERE id = ?').run(capsFound, player.id);

    for (const lootItem of npcInventory) {
      const existing = db.prepare('SELECT quantity FROM player_items WHERE player_id = ? AND item_id = ?').get(player.id, lootItem.id) as any;
      if (existing) {
        db.prepare('UPDATE player_items SET quantity = quantity + ? WHERE player_id = ? AND item_id = ?').run(lootItem.quantity, player.id, lootItem.id);
      } else {
        db.prepare('INSERT INTO player_items (player_id, item_id, quantity) VALUES (?, ?, ?)').run(player.id, lootItem.id, lootItem.quantity);
      }
      updateQuestProgress(player.id, 'fetch', lootItem.name);
      lootedNames.push(lootItem.quantity > 1 ? `${lootItem.quantity}x ${lootItem.name}` : lootItem.name);
    }

    // Remove the NPC and its inventory rows together (previously npc_items were orphaned).
    db.prepare('DELETE FROM npc_items WHERE npc_id = ?').run(npc.id);
    db.prepare('DELETE FROM npcs WHERE id = ?').run(npc.id);
  })();

  const itemMessage = lootedNames.length > 0 ? ` and ${lootedNames.join(', ')}` : '';
  res.json({ message: `You looted ${capsFound} caps${itemMessage} from the body.` });
});