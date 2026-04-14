import { Router } from 'express';
import { db } from '../db.js';

export const tradeRouter = Router();

tradeRouter.post('/', async (req: any, res: any) => {
  const { npc_id, item_id, action, quantity } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(npc_id) as any;
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(item_id) as any;

  if (!player || !npc || !item) {
    return res.status(400).json({ message: 'Invalid trade request' });
  }

  if (npc.current_location_id !== player.current_location_id) {
    return res.status(400).json({ message: 'NPC is not in your current location' });
  }

  const qty = quantity || 1;

  if (action === 'buy') {
    const npcItem = db.prepare('SELECT * FROM npc_items WHERE npc_id = ? AND item_id = ?').get(npc.id, item.id) as any;
    if (!npcItem || npcItem.quantity < qty) {
      return res.status(400).json({ message: 'NPC does not have enough of this item.' });
    }

    const cost = item.value * qty;
    if (player.money < cost) {
      return res.status(400).json({ message: 'Not enough caps.' });
    }

    const executeBuy = db.transaction(() => {
      db.prepare('UPDATE players SET money = money - ? WHERE id = ?').run(cost, player.id);

      if (npcItem.quantity === qty) {
        db.prepare('DELETE FROM npc_items WHERE npc_id = ? AND item_id = ?').run(npc.id, item.id);
      } else {
        db.prepare('UPDATE npc_items SET quantity = quantity - ? WHERE npc_id = ? AND item_id = ?').run(qty, npc.id, item.id);
      }

      const playerItem = db.prepare('SELECT * FROM player_items WHERE player_id = ? AND item_id = ?').get(player.id, item.id) as any;
      if (playerItem) {
        db.prepare('UPDATE player_items SET quantity = quantity + ? WHERE player_id = ? AND item_id = ?').run(qty, player.id, item.id);
      } else {
        db.prepare('INSERT INTO player_items (player_id, item_id, quantity) VALUES (?, ?, ?)').run(player.id, item.id, qty);
      }
    });

    executeBuy();
    return res.json({ message: `Bought ${qty}x ${item.name} for ${cost} caps.` });
  }

  if (action === 'sell') {
    const playerItem = db.prepare('SELECT * FROM player_items WHERE player_id = ? AND item_id = ?').get(player.id, item.id) as any;
    if (!playerItem || playerItem.quantity < qty) {
      return res.status(400).json({ message: 'You do not have enough of this item.' });
    }

    const revenue = Math.floor(item.value * 0.5) * qty;

    const executeSell = db.transaction(() => {
      db.prepare('UPDATE players SET money = money + ? WHERE id = ?').run(revenue, player.id);

      if (playerItem.quantity === qty) {
        db.prepare('DELETE FROM player_items WHERE player_id = ? AND item_id = ?').run(player.id, item.id);
      } else {
        db.prepare('UPDATE player_items SET quantity = quantity - ? WHERE player_id = ? AND item_id = ?').run(qty, player.id, item.id);
      }

      const npcItem = db.prepare('SELECT * FROM npc_items WHERE npc_id = ? AND item_id = ?').get(npc.id, item.id) as any;
      if (npcItem) {
        db.prepare('UPDATE npc_items SET quantity = quantity + ? WHERE npc_id = ? AND item_id = ?').run(qty, npc.id, item.id);
      } else {
        db.prepare('INSERT INTO npc_items (npc_id, item_id, quantity) VALUES (?, ?, ?)').run(npc.id, item.id, qty);
      }
    });

    executeSell();
    return res.json({ message: `Sold ${qty}x ${item.name} for ${revenue} caps.` });
  }

  res.status(400).json({ message: 'Invalid action.' });
});