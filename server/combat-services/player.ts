import { AP_COSTS, resolveAttack } from '../combat.js';
import { db } from '../db.js';
import { updateQuestProgress } from '../quests.js';
import { manhattanDistance, findPath } from '../pathfinding.js';
import {
  advanceTurn,
  completeCombat,
  fail,
  getActiveCombatContext,
  getArmorEffects,
  getCombatLog,
  getPlayerPerks,
  getWeaponData,
  ok,
  parseJson,
  updateCombatRoundAndTurn,
  updateCombatTurnAndLog,
  applyHazardDamage,
  type ServiceResult,
} from './shared.js';

function handleAttackAction(
  player: any,
  combat: any,
  turnOrder: any[],
  current: any,
  actionType: 'attack' | 'aimed_shot',
  targetId?: number,
  bodyPart?: string,
  useCritical?: boolean,
): ServiceResult {
  const apCost = AP_COSTS[actionType];
  if (current.ap_remaining < apCost) {
    return fail(400, 'Not enough AP');
  }

  if (useCritical && (player.critical_meter || 0) < 100) {
    return fail(400, 'Critical meter not full!');
  }

  const targetNpc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(targetId) as any;
  if (!targetNpc || targetNpc.hit_points <= 0) {
    return fail(400, 'Invalid target');
  }

  const targetInTurnOrder = turnOrder.find((turn: any) => turn.type === 'npc' && turn.id === targetNpc.id);
  const skillValue = 20 + (player.perception * 5) + (player.agility * 3);
  
  // Perk Effects
  const perks = getPlayerPerks(player.id);
  let skillBonus = 0;
  let damageMult = 1.0;
  let critMult: number | undefined = undefined;
  let apRefund = 0;

  perks.forEach(perk => {
    const effects = parseJson<any>(perk.effects_json, {});
    if (effects.damage_mult) damageMult *= effects.damage_mult;
    if (effects.dr_bonus) { /* handled in damage calculation if we had DR on player */ }
    if (effects.crit_damage_mult) critMult = effects.crit_damage_mult;
    if (bodyPart && effects.aimed_shot_bonus) skillBonus += effects.aimed_shot_bonus;
    if (effects.ap_refund_on_kill) apRefund = effects.ap_refund_on_kill;
  });

  const playerLimbCondition = parseJson<any>(player.limb_condition, {
    head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100
  });

  const attacker = { 
    skill_value: skillValue + skillBonus, 
    luck: player.luck,
    limb_condition: playerLimbCondition
  };
  const { weaponEffects, requiresAmmo } = getWeaponData(player, { damage_min: 1, damage_max: 5 });

  // Apply Slayer (if melee)
  let finalApCost = apCost;
  if (weaponEffects.weapon_class === 'melee') {
    const slayer = perks.find(p => p.name === 'Slayer');
    if (slayer) finalApCost = Math.max(1, finalApCost - 1);
  }

  if (current.ap_remaining < finalApCost) {
    return fail(400, 'Not enough AP');
  }

  if (requiresAmmo && player.ammo_in_clip <= 0) {
    return fail(400, 'Out of ammo! You need to reload.');
  }

  const targetArmor = getArmorEffects(targetNpc.equipped_armor_id);
  const targetLimbCondition = parseJson<any>(targetNpc.limb_condition, {
    head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100
  });

  const target = {
    ...targetArmor,
    hit_points: targetNpc.hit_points,
    name: targetNpc.name,
    temporary_ac: targetInTurnOrder?.temporary_ac || 0,
    limb_condition: targetLimbCondition
  };

  let distance: number | undefined;
  if (combat.map_json && current.tile_x !== undefined && targetInTurnOrder?.tile_x !== undefined) {
    distance = manhattanDistance(current.tile_x, current.tile_y, targetInTurnOrder.tile_x, targetInTurnOrder.tile_y);
  }

  const result = resolveAttack(attacker, target, weaponEffects, bodyPart, distance, useCritical, critMult);
  
  // Apply damage multiplier (Bloody Mess, etc)
  if (result.hit) {
    result.damage = Math.floor(result.damage * damageMult);
    result.target_hp = Math.max(0, targetNpc.hit_points - result.damage);
  }

  // Update NPC HP and Limb Condition
  if (result.limb_key) {
    targetLimbCondition[result.limb_key] = Math.max(0, targetLimbCondition[result.limb_key] - result.limb_damage);
    db.prepare('UPDATE npcs SET hit_points = ?, limb_condition = ? WHERE id = ?').run(
      result.target_hp, 
      JSON.stringify(targetLimbCondition), 
      targetNpc.id
    );
    if (targetInTurnOrder) {
      targetInTurnOrder.limb_condition = targetLimbCondition;
    }
  } else {
    db.prepare('UPDATE npcs SET hit_points = ? WHERE id = ?').run(result.target_hp, targetNpc.id);
  }

  // Apply Status Effects from Critical Hits
  if (result.critical && result.critical_effect) {
    const targetStatusEffects = parseJson<any[]>(targetNpc.status_effects, []);
    targetStatusEffects.push({
      type: result.critical_effect.type,
      duration: 1, // Most critical effects last 1 turn
      message: result.critical_effect.message
    });
    db.prepare('UPDATE npcs SET status_effects = ? WHERE id = ?').run(
      JSON.stringify(targetStatusEffects),
      targetNpc.id
    );
    if (targetInTurnOrder) {
      targetInTurnOrder.status_effects = targetStatusEffects;
    }
  }

  if (useCritical) {
    db.prepare('UPDATE players SET critical_meter = 0 WHERE id = ?').run(player.id);
  } else if (result.hit) {
    const newMeter = Math.min(100, (player.critical_meter || 0) + (result.meter_gain || 0));
    db.prepare('UPDATE players SET critical_meter = ? WHERE id = ?').run(newMeter, player.id);
  }

  if (requiresAmmo) {
    db.prepare('UPDATE players SET ammo_in_clip = ammo_in_clip - 1 WHERE id = ?').run(player.id);
  }

  if (result.target_hp <= 0 && targetNpc.hit_points > 0) {
    updateQuestProgress(player.id, 'kill', targetNpc.name);
    if (targetInTurnOrder) {
      targetInTurnOrder.is_dead = true;
    }
    // Grim Reaper's Sprint
    if (apRefund > 0) {
      current.ap_remaining += apRefund;
      result.message += ` Grim Reaper's Sprint! Regained ${apRefund} AP.`;
    }
  }

  current.ap_remaining -= finalApCost;
  const combatLog = getCombatLog(combat);
  combatLog.push({
    round: combat.current_round,
    actor: player.name,
    action: actionType,
    target: targetNpc.name,
    damage: result.damage,
    message: result.message,
  });

  const allNpcs = db.prepare(
    'SELECT n.hit_points FROM npcs n JOIN combat_npcs cn ON n.id = cn.npc_id WHERE cn.combat_id = ?',
  ).all(combat.id) as any[];

  const allDead = allNpcs.every((npc: any) => npc.hit_points <= 0);
  if (allDead) {
    completeCombat(combat.id, turnOrder, combatLog);

    const xpAwarded = 50 * allNpcs.length;
    const newXp = player.experience_points + xpAwarded;
    db.prepare('UPDATE players SET experience_points = ? WHERE id = ?').run(newXp, player.id);

    return ok({
      message: `${result.message} All enemies defeated!`,
      result,
      combat_over: true,
      xp_awarded: xpAwarded,
    });
  }

  if (current.ap_remaining < Math.min(AP_COSTS.attack, AP_COSTS.flee)) {
    const { combat_over } = advanceTurn(combat, turnOrder, combatLog);
    if (combat_over) {
      return ok({ message: result.message, result, combat_over: true });
    }
  } else {
    updateCombatTurnAndLog(combat.id, turnOrder, combatLog);
  }

  return ok({ message: result.message, result, combat_over: false });
}

function handleFleeAction(player: any, combat: any): ServiceResult {
  const combatLog = getCombatLog(combat);
  db.prepare('UPDATE combats SET is_active = 0 WHERE id = ?').run(combat.id);

  combatLog.push({
    round: combat.current_round,
    actor: player.name,
    action: 'flee',
    target: 'none',
    damage: 0,
    message: `${player.name} successfully fled from combat!`,
  });

  db.prepare('UPDATE combats SET combat_log = ? WHERE id = ?').run(JSON.stringify(combatLog), combat.id);
  return ok({ message: 'You fled from combat!', combat_over: true });
}

function handleReloadAction(player: any, combat: any, turnOrder: any[], current: any): ServiceResult {
  const apCost = AP_COSTS.reload;
  if (current.ap_remaining < apCost) {
    return fail(400, 'Not enough AP');
  }

  if (!player.equipped_weapon_id) {
    return fail(400, 'No weapon equipped to reload.');
  }

  const weapon = db.prepare('SELECT name, effects FROM items WHERE id = ?').get(player.equipped_weapon_id) as any;
  const weaponEffects = parseJson<Record<string, any>>(weapon?.effects, {});
  if (!weaponEffects.ammo_type) {
    return fail(400, 'This weapon does not use ammo.');
  }

  const ammoType = weaponEffects.ammo_type;
  const magazineSize = weaponEffects.magazine_size || 1;
  const needed = magazineSize - player.ammo_in_clip;
  if (needed <= 0) {
    return fail(400, 'Magazine is already full.');
  }

  const ammoItem = db.prepare(`
    SELECT i.*, pi.quantity 
    FROM items i
    JOIN player_items pi ON i.id = pi.item_id
    WHERE pi.player_id = ? AND i.name LIKE ?
  `).get(player.id, `%${ammoType}%Ammo%`) as any;

  if (!ammoItem || ammoItem.quantity <= 0) {
    return fail(400, `You have no ${ammoType} ammo.`);
  }

  const toReload = Math.min(needed, ammoItem.quantity);
  db.prepare('UPDATE players SET ammo_in_clip = ammo_in_clip + ? WHERE id = ?').run(toReload, player.id);

  if (ammoItem.quantity > toReload) {
    db.prepare('UPDATE player_items SET quantity = quantity - ? WHERE player_id = ? AND item_id = ?').run(toReload, player.id, ammoItem.id);
  } else {
    db.prepare('DELETE FROM player_items WHERE player_id = ? AND item_id = ?').run(player.id, ammoItem.id);
  }

  current.ap_remaining -= apCost;
  const combatLog = getCombatLog(combat);
  combatLog.push({
    round: combat.current_round,
    actor: player.name,
    action: 'reload',
    target: 'self',
    damage: 0,
    message: `${player.name} reloaded their ${weapon?.name || 'weapon'} (+${toReload} rounds).`,
  });

  if (current.ap_remaining < Math.min(AP_COSTS.attack, AP_COSTS.flee)) {
    const { combat_over } = advanceTurn(combat, turnOrder, combatLog);
    if (combat_over) {
      return ok({ message: 'You reloaded your weapon.', combat_over: true });
    }
  } else {
    updateCombatTurnAndLog(combat.id, turnOrder, combatLog);
  }

  return ok({ message: 'You reloaded your weapon.', combat_over: false });
}

function handleUseItemAction(player: any, combat: any, turnOrder: any[], current: any, itemId?: number): ServiceResult {
  const apCost = AP_COSTS.use_item;
  if (current.ap_remaining < apCost) {
    return fail(400, 'Not enough AP');
  }

  const item = db.prepare(`
    SELECT i.*, pi.quantity 
    FROM items i
    JOIN player_items pi ON i.id = pi.item_id
    WHERE pi.player_id = ? AND i.id = ?
  `).get(player.id, itemId) as any;

  if (!item || item.quantity <= 0) {
    return fail(404, 'Item not found in inventory');
  }

  let message = `You used ${item.name}.`;
  if (item.type === 'healing') {
    const effects = parseJson<Record<string, any>>(item.effects, {});
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

  current.ap_remaining -= apCost;
  const combatLog = getCombatLog(combat);
  combatLog.push({
    round: combat.current_round,
    actor: player.name,
    action: 'use_item',
    target: 'self',
    damage: 0,
    message,
  });

  if (current.ap_remaining < Math.min(AP_COSTS.attack, AP_COSTS.flee)) {
    const { combat_over } = advanceTurn(combat, turnOrder, combatLog);
    if (combat_over) {
      return ok({ message, combat_over: true });
    }
  } else {
    updateCombatTurnAndLog(combat.id, turnOrder, combatLog);
  }

  return ok({ message, combat_over: false });
}

function handleDefendAction(player: any, combat: any, turnOrder: any[], current: any): ServiceResult {
  const apCost = AP_COSTS.defend;
  if (current.ap_remaining < apCost) {
    return fail(400, 'Not enough AP');
  }

  current.ap_remaining -= apCost;
  current.temporary_ac = (current.temporary_ac || 0) + 10;

  const combatLog = getCombatLog(combat);
  combatLog.push({
    round: combat.current_round,
    actor: player.name,
    action: 'defend',
    target: 'self',
    damage: 0,
    message: `${player.name} takes a defensive stance (+10 AC).`,
  });

  if (current.ap_remaining < Math.min(AP_COSTS.attack, AP_COSTS.flee, AP_COSTS.defend)) {
    const { combat_over } = advanceTurn(combat, turnOrder, combatLog, { resetAllTemporaryAc: true, resetNextTemporaryAc: true });
    if (combat_over) {
      return ok({ message: 'You take a defensive stance.', combat_over: true });
    }
  } else {
    updateCombatTurnAndLog(combat.id, turnOrder, combatLog);
  }

  return ok({ message: 'You take a defensive stance.', combat_over: false });
}

function handleMoveAction(player: any, combat: any, turnOrder: any[], current: any, targetX?: number, targetY?: number): ServiceResult {
  if (targetX === undefined || targetY === undefined) {
    return fail(400, 'Missing target_x or target_y');
  }

  if (!combat.map_json) {
    return fail(400, 'No battlefield map for this combat');
  }

  const map = parseJson<Parameters<typeof findPath>[0] | null>(combat.map_json, null);
  if (!map) {
    return fail(500, 'Invalid battlefield map data');
  }

  const occupiedPositions = new Set<string>();
  for (const combatant of turnOrder) {
    if (combatant.id === current.id && combatant.type === current.type) {
      continue;
    }
    if (combatant.tile_x !== undefined && combatant.tile_y !== undefined) {
      occupiedPositions.add(`${combatant.tile_x},${combatant.tile_y}`);
    }
  }

  const pathResult = findPath(map, current.tile_x, current.tile_y, targetX, targetY, occupiedPositions);
  if (!pathResult.valid) {
    return fail(400, 'No valid path to that tile.');
  }

  if (pathResult.totalApCost === 0 && pathResult.path.length === 0) {
    return fail(400, 'Already at that position.');
  }

  if (current.ap_remaining < pathResult.totalApCost) {
    return fail(400, `Not enough AP. Need ${pathResult.totalApCost}, have ${current.ap_remaining}.`);
  }

  current.tile_x = targetX;
  current.tile_y = targetY;
  current.ap_remaining -= pathResult.totalApCost;

  const combatLog = getCombatLog(combat);
  combatLog.push({
    round: combat.current_round,
    actor: player.name,
    action: 'move',
    target: `(${targetX},${targetY})`,
    damage: 0,
    message: `${player.name} moved to (${targetX},${targetY}), spending ${pathResult.totalApCost} AP.`,
  });

  const hazardDamage = applyHazardDamage(player, 'player', pathResult.path, map, combat, combatLog, turnOrder);

  if (player.hit_points <= 0) {
    const { combat_over } = advanceTurn(combat, turnOrder, combatLog);
    return ok({
      message: `Moved to (${targetX},${targetY}), spent ${pathResult.totalApCost} AP.${hazardDamage > 0 ? ` Took ${hazardDamage} hazard damage.` : ''}`,
      path: pathResult.path,
      ap_cost: pathResult.totalApCost,
      combat_over,
    });
  }

  if (current.ap_remaining === 0) {
    const { combat_over } = advanceTurn(combat, turnOrder, combatLog);
    return ok({
      message: `Moved to (${targetX},${targetY}), spent ${pathResult.totalApCost} AP.${hazardDamage > 0 ? ` Took ${hazardDamage} hazard damage.` : ''}`,
      path: pathResult.path,
      ap_cost: pathResult.totalApCost,
      combat_over,
    });
  }

  updateCombatTurnAndLog(combat.id, turnOrder, combatLog);

  return ok({
    message: `Moved to (${targetX},${targetY}), spent ${pathResult.totalApCost} AP.${hazardDamage > 0 ? ` Took ${hazardDamage} hazard damage.` : ''}`,
    path: pathResult.path,
    ap_cost: pathResult.totalApCost,
    combat_over: false,
  });
}

function handleEndTurnAction(combat: any, turnOrder: any[]): ServiceResult {
  const combatLog = getCombatLog(combat);
  combatLog.push({
    round: combat.current_round,
    actor: turnOrder[combat.current_turn_index].name,
    action: 'end_turn',
    target: 'self',
    damage: 0,
    message: `${turnOrder[combat.current_turn_index].name} ended their turn.`,
  });
  const { combat_over } = advanceTurn(combat, turnOrder, combatLog);
  return ok({ message: 'Turn ended', combat_over });
}

export function executePlayerCombatAction(userId: number, action: any): ServiceResult {
  const { context, error } = getActiveCombatContext(userId);
  if (error || !context) {
    return error!;
  }

  const { player, combat, turnOrder, current } = context;
  if (current.type !== 'player' || current.id !== player.id) {
    return fail(400, "It's not your turn!");
  }

  switch (action.action_type) {
    case 'attack':
    case 'aimed_shot':
      return handleAttackAction(player, combat, turnOrder, current, action.action_type, action.target_id, action.body_part, action.use_critical);
    case 'flee':
      if (current.ap_remaining < AP_COSTS.flee) {
        return fail(400, 'Not enough AP');
      }
      return handleFleeAction(player, combat);
    case 'reload':
      return handleReloadAction(player, combat, turnOrder, current);
    case 'use_item':
      return handleUseItemAction(player, combat, turnOrder, current, action.target_id);
    case 'defend':
      return handleDefendAction(player, combat, turnOrder, current);
    case 'move':
      return handleMoveAction(player, combat, turnOrder, current, action.target_x, action.target_y);
    case 'end_turn':
      return handleEndTurnAction(combat, turnOrder);
    default:
      return fail(400, 'Unknown action');
  }
}