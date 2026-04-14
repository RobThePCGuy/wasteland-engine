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
  db.prepare('UPDATE players SET money = money + ? WHERE id = ?').run(capsFound, player.id);

  let itemMessage = '';
  const npcItems = db.prepare(`
    SELECT i.*, ni.quantity AS npc_qty
    FROM items i
    JOIN npc_items ni ON i.id = ni.item_id
    WHERE ni.npc_id = ?
  `).all(npc.id) as any[];

  if (npcItems.length > 0) {
    const randomItem = npcItems[Math.floor(Math.random() * npcItems.length)];
    const existing = db.prepare('SELECT * FROM player_items WHERE player_id = ? AND item_id = ?').get(player.id, randomItem.id) as any;

    if (existing) {
      db.prepare('UPDATE player_items SET quantity = quantity + 1 WHERE player_id = ? AND item_id = ?').run(player.id, randomItem.id);
    } else {
      db.prepare('INSERT INTO player_items (player_id, item_id, quantity) VALUES (?, ?, 1)').run(player.id, randomItem.id);
    }

    updateQuestProgress(player.id, 'fetch', randomItem.name);
    itemMessage = ` and a ${randomItem.name}`;
  }

  db.prepare('DELETE FROM npcs WHERE id = ?').run(npc.id);
  res.json({ message: `You looted ${capsFound} caps${itemMessage} from the body.` });
});