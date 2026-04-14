import { Router } from 'express';
import { db } from '../db.js';

export const itemRouter = Router();

itemRouter.post('/:id/use', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  const item = db.prepare(`
    SELECT i.*, pi.quantity 
    FROM items i
    JOIN player_items pi ON i.id = pi.item_id
    WHERE pi.player_id = ? AND i.id = ?
  `).get(player.id, req.params.id) as any;

  if (!item || item.quantity <= 0) {
    return res.status(404).json({ message: 'Item not found in inventory' });
  }

  let message = `You used ${item.name}.`;

  if (item.type === 'healing') {
    const effects = JSON.parse(item.effects || '{}');
    if (effects.heal) {
      const newHp = Math.min(player.max_hit_points, player.hit_points + effects.heal);
      db.prepare('UPDATE players SET hit_points = ? WHERE id = ?').run(newHp, player.id);
      message = `You used ${item.name} and recovered ${effects.heal} HP.`;
    }
    if (effects.heal_limbs) {
      const fullLimbs = { head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100 };
      db.prepare('UPDATE players SET limb_condition = ? WHERE id = ?').run(JSON.stringify(fullLimbs), player.id);
      message += " All limbs have been restored.";
    }
  }

  if (item.quantity > 1) {
    db.prepare('UPDATE player_items SET quantity = quantity - 1 WHERE player_id = ? AND item_id = ?').run(player.id, item.id);
  } else {
    db.prepare('DELETE FROM player_items WHERE player_id = ? AND item_id = ?').run(player.id, item.id);
  }

  res.json({ message });
});

itemRouter.post('/:id/equip', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  const item = db.prepare(`
    SELECT i.*, pi.quantity 
    FROM items i
    JOIN player_items pi ON i.id = pi.item_id
    WHERE pi.player_id = ? AND i.id = ?
  `).get(player.id, req.params.id) as any;

  if (!item || item.quantity <= 0) {
    return res.status(404).json({ message: 'Item not found in inventory' });
  }

  if (item.type === 'weapon') {
    db.prepare('UPDATE players SET equipped_weapon_id = ? WHERE id = ?').run(item.id, player.id);
    return res.json({ message: `You equipped ${item.name}.` });
  }

  if (item.type === 'armor') {
    db.prepare('UPDATE players SET equipped_armor_id = ? WHERE id = ?').run(item.id, player.id);
    return res.json({ message: `You equipped ${item.name}.` });
  }

  res.status(400).json({ message: 'Item cannot be equipped.' });
});