import { Router } from 'express';
import { db } from '../db.js';

export const itemRouter = Router();

// Refund the rounds currently in a weapon's clip back into inventory as ammo items.
// Extracted from the equip/unequip/drop handlers, which previously inlined this 3× with drift.
// Caller is responsible for running this inside a transaction and zeroing ammo_in_clip.
function refundAmmoForWeapon(playerId: number, weapon: any, ammoInClip: number) {
  if (!weapon || !(ammoInClip > 0)) return;
  const effects = JSON.parse(weapon.effects || '{}');
  if (!effects.ammo_type) return;
  const ammoItem = db.prepare('SELECT id FROM items WHERE name LIKE ?').get(`%${effects.ammo_type}%Ammo%`) as any;
  if (!ammoItem) return;
  const existingAmmo = db.prepare('SELECT quantity FROM player_items WHERE player_id = ? AND item_id = ?').get(playerId, ammoItem.id) as any;
  if (existingAmmo) {
    db.prepare('UPDATE player_items SET quantity = quantity + ? WHERE player_id = ? AND item_id = ?').run(ammoInClip, playerId, ammoItem.id);
  } else {
    db.prepare('INSERT INTO player_items (player_id, item_id, quantity) VALUES (?, ?, ?)').run(playerId, ammoItem.id, ammoInClip);
  }
}

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

  // Check if in combat
  const combatPlayer = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').get(player.id) as any;
  let combat = null;
  if (combatPlayer) {
    combat = db.prepare('SELECT * FROM combats WHERE id = ? AND is_active = 1').get(combatPlayer.combat_id) as any;
  }

  if (combat) {
    const turnOrder = JSON.parse(combat.turn_order || '[]');
    const currentTurn = turnOrder[combat.current_turn_index];
    if (currentTurn.type !== 'player' || currentTurn.id !== player.id) {
      return res.status(400).json({ message: "It's not your turn!" });
    }
    if (currentTurn.ap_remaining < 2) {
      return res.status(400).json({ message: "Not enough AP to use item." });
    }
    currentTurn.ap_remaining -= 2;
    db.prepare('UPDATE combats SET turn_order = ? WHERE id = ?').run(JSON.stringify(turnOrder), combat.id);
  }

  let message = `You used ${item.name}.`;

  // Apply effects and consume the item atomically.
  db.transaction(() => {
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
  })();

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

  // Check if in combat
  const combatPlayer = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').get(player.id) as any;
  let combat = null;
  if (combatPlayer) {
    combat = db.prepare('SELECT * FROM combats WHERE id = ? AND is_active = 1').get(combatPlayer.combat_id) as any;
  }

  if (combat) {
    const turnOrder = JSON.parse(combat.turn_order || '[]');
    const currentTurn = turnOrder[combat.current_turn_index];
    if (currentTurn.type !== 'player' || currentTurn.id !== player.id) {
      return res.status(400).json({ message: "It's not your turn!" });
    }
    if (currentTurn.ap_remaining < 2) {
      return res.status(400).json({ message: "Not enough AP to equip item." });
    }
    currentTurn.ap_remaining -= 2;
    db.prepare('UPDATE combats SET turn_order = ? WHERE id = ?').run(JSON.stringify(turnOrder), combat.id);
  }

  if (item.type === 'weapon') {
    db.transaction(() => {
      // Refund ammo from the previously equipped weapon, if any.
      if (player.equipped_weapon_id && player.equipped_weapon_id !== item.id && player.ammo_in_clip > 0) {
        const oldWeapon = db.prepare('SELECT effects FROM items WHERE id = ?').get(player.equipped_weapon_id) as any;
        refundAmmoForWeapon(player.id, oldWeapon, player.ammo_in_clip);
      }
      db.prepare('UPDATE players SET equipped_weapon_id = ?, ammo_in_clip = 0 WHERE id = ?').run(item.id, player.id);
    })();
    return res.json({ message: `You equipped ${item.name}.` });
  }

  if (item.type === 'armor') {
    db.prepare('UPDATE players SET equipped_armor_id = ? WHERE id = ?').run(item.id, player.id);
    return res.json({ message: `You equipped ${item.name}.` });
  }

  res.status(400).json({ message: 'Item cannot be equipped.' });
});

itemRouter.post('/:id/unequip', async (req: any, res: any) => {
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

  // Check if in combat
  const combatPlayer = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').get(player.id) as any;
  let combat = null;
  if (combatPlayer) {
    combat = db.prepare('SELECT * FROM combats WHERE id = ? AND is_active = 1').get(combatPlayer.combat_id) as any;
  }

  if (combat) {
    const turnOrder = JSON.parse(combat.turn_order || '[]');
    const currentTurn = turnOrder[combat.current_turn_index];
    if (currentTurn.type !== 'player' || currentTurn.id !== player.id) {
      return res.status(400).json({ message: "It's not your turn!" });
    }
    if (currentTurn.ap_remaining < 2) {
      return res.status(400).json({ message: "Not enough AP to unequip item." });
    }
    currentTurn.ap_remaining -= 2;
    db.prepare('UPDATE combats SET turn_order = ? WHERE id = ?').run(JSON.stringify(turnOrder), combat.id);
  }

  if (item.type === 'weapon' && player.equipped_weapon_id === item.id) {
    db.transaction(() => {
      db.prepare('UPDATE players SET equipped_weapon_id = NULL WHERE id = ?').run(player.id);
      if (player.ammo_in_clip > 0) {
        refundAmmoForWeapon(player.id, item, player.ammo_in_clip);
        db.prepare('UPDATE players SET ammo_in_clip = 0 WHERE id = ?').run(player.id);
      }
    })();
    return res.json({ message: `You unequipped ${item.name}.` });
  }

  if (item.type === 'armor' && player.equipped_armor_id === item.id) {
    db.prepare('UPDATE players SET equipped_armor_id = NULL WHERE id = ?').run(player.id);
    return res.json({ message: `You unequipped ${item.name}.` });
  }

  res.status(400).json({ message: 'Item is not equipped.' });
});

itemRouter.post('/:id/reload', async (req: any, res: any) => {
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

  if (item.type !== 'weapon') {
    return res.status(400).json({ message: 'Item is not a weapon.' });
  }

  if (player.equipped_weapon_id !== item.id) {
    return res.status(400).json({ message: 'Weapon must be equipped to reload.' });
  }

  const effects = JSON.parse(item.effects || '{}');
  if (!effects.ammo_type) {
    return res.status(400).json({ message: 'This weapon does not use ammo.' });
  }

  const ammoType = effects.ammo_type;
  const magazineSize = effects.magazine_size || 1;
  const needed = magazineSize - player.ammo_in_clip;

  if (needed <= 0) {
    return res.status(400).json({ message: 'Magazine is already full.' });
  }

  const ammoItem = db.prepare(`
    SELECT i.*, pi.quantity 
    FROM items i
    JOIN player_items pi ON i.id = pi.item_id
    WHERE pi.player_id = ? AND i.name LIKE ?
  `).get(player.id, `%${ammoType}%Ammo%`) as any;

  if (!ammoItem || ammoItem.quantity <= 0) {
    return res.status(400).json({ message: `Out of ${ammoType} ammo!` });
  }

  const toReload = Math.min(needed, ammoItem.quantity);

  // Check if in combat
  const combatPlayer = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').get(player.id) as any;
  let combat = null;
  if (combatPlayer) {
    combat = db.prepare('SELECT * FROM combats WHERE id = ? AND is_active = 1').get(combatPlayer.combat_id) as any;
  }

  if (combat) {
    const turnOrder = JSON.parse(combat.turn_order || '[]');
    const currentTurn = turnOrder[combat.current_turn_index];
    if (currentTurn.type !== 'player' || currentTurn.id !== player.id) {
      return res.status(400).json({ message: "It's not your turn!" });
    }
    if (currentTurn.ap_remaining < 2) { // 2 AP to reload from PipBoy
      return res.status(400).json({ message: "Not enough AP to reload." });
    }
    currentTurn.ap_remaining -= 2;
    db.prepare('UPDATE combats SET turn_order = ? WHERE id = ?').run(JSON.stringify(turnOrder), combat.id);
  }

  db.transaction(() => {
    db.prepare('UPDATE players SET ammo_in_clip = ammo_in_clip + ? WHERE id = ?').run(toReload, player.id);
    if (ammoItem.quantity === toReload) {
      db.prepare('DELETE FROM player_items WHERE player_id = ? AND item_id = ?').run(player.id, ammoItem.id);
    } else {
      db.prepare('UPDATE player_items SET quantity = quantity - ? WHERE player_id = ? AND item_id = ?').run(toReload, player.id, ammoItem.id);
    }
  })();

  res.json({ message: `Reloaded ${item.name} with ${toReload} rounds.` });
});

itemRouter.post('/:id/drop', async (req: any, res: any) => {
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

  db.transaction(() => {
    if (item.type === 'weapon' && player.equipped_weapon_id === item.id) {
      db.prepare('UPDATE players SET equipped_weapon_id = NULL WHERE id = ?').run(player.id);
      if (player.ammo_in_clip > 0) {
        refundAmmoForWeapon(player.id, item, player.ammo_in_clip);
        db.prepare('UPDATE players SET ammo_in_clip = 0 WHERE id = ?').run(player.id);
      }
    }

    if (item.type === 'armor' && player.equipped_armor_id === item.id) {
      db.prepare('UPDATE players SET equipped_armor_id = NULL WHERE id = ?').run(player.id);
    }

    if (item.quantity > 1) {
      db.prepare('UPDATE player_items SET quantity = quantity - 1 WHERE player_id = ? AND item_id = ?').run(player.id, item.id);
    } else {
      db.prepare('DELETE FROM player_items WHERE player_id = ? AND item_id = ?').run(player.id, item.id);
    }
  })();

  res.json({ message: `You dropped ${item.name}.` });
});