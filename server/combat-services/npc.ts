import { AP_COSTS, decideNpcAction, resolveAttack } from '../combat.js';
import { db } from '../db.js';
import { findPath, manhattanDistance } from '../pathfinding.js';
import {
  advanceTurn,
  completeCombat,
  fail,
  getActiveCombatContext,
  getArmorEffects,
  getCombatLog,
  getWeaponData,
  ok,
  parseJson,
  applyHazardDamage,
  type ServiceResult,
} from './shared.js';

interface Item {
  id: number;
  name: string;
  type: string;
  effects: string;
  quantity: number;
}

export function executeNpcTurn(userId: number): ServiceResult {
  const { context, error } = getActiveCombatContext(userId);
  if (error || !context) {
    return error!;
  }

  const { player, combat, turnOrder, current } = context;
  if (current.type !== 'npc') {
    return fail(400, "It's not an NPC's turn!");
  }

  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(current.id) as any;
  const playerTurnEntry = turnOrder.find((turn: any) => turn.type === 'player' && turn.id === player.id);
  const npcInventory = db.prepare(`
    SELECT i.*, ni.quantity 
    FROM items i
    JOIN npc_items ni ON i.id = ni.item_id
    WHERE ni.npc_id = ?
  `).all(npc.id) as Item[];

  const messages: string[] = [];
  const combatLog = getCombatLog(combat);
  let isDead = false;

  while (current.ap_remaining > 0 && !isDead) {
    const enemies = [{
      id: player.id,
      name: player.name,
      hit_points: player.hit_points,
      tile_x: playerTurnEntry?.tile_x,
      tile_y: playerTurnEntry?.tile_y,
    }];
    const { weaponEffects, requiresAmmo } = getWeaponData(npc, { damage_min: 1, damage_max: 3 });
    const combatMap = combat.map_json ? parseJson<any>(combat.map_json, null) : null;
    const occupiedPositions = new Set<string>();

    for (const combatant of turnOrder) {
      if (combatant.id === current.id && combatant.type === current.type) {
        continue;
      }

      if (combatant.tile_x !== undefined && combatant.tile_y !== undefined) {
        occupiedPositions.add(`${combatant.tile_x},${combatant.tile_y}`);
      }
    }

    const decision = decideNpcAction(
      {
        ...npc,
        action_points: current.ap_remaining,
        tile_x: current.tile_x,
        tile_y: current.tile_y,
      },
      enemies,
      npcInventory,
      {
        weaponEffects,
        map: combatMap,
        occupiedPositions,
      },
    );

    if (decision.action === 'move') {
      if (!combatMap || current.tile_x === undefined || current.tile_y === undefined) {
        break;
      }

      const pathResult = findPath(
        combatMap,
        current.tile_x,
        current.tile_y,
        decision.target_x,
        decision.target_y,
        occupiedPositions,
      );

      if (!pathResult.valid || pathResult.path.length === 0 || pathResult.totalApCost > current.ap_remaining) {
        break;
      }

      current.tile_x = decision.target_x;
      current.tile_y = decision.target_y;
      current.ap_remaining -= pathResult.totalApCost;

      const moveMessage = `${npc.name} moves to (${decision.target_x}, ${decision.target_y}), spending ${pathResult.totalApCost} AP.`;
      messages.push(moveMessage);
      combatLog.push({
        round: combat.current_round,
        actor: npc.name,
        action: 'move',
        target: `(${decision.target_x},${decision.target_y})`,
        damage: 0,
        message: moveMessage,
      });

      const hazardDamage = applyHazardDamage(npc, 'npc', pathResult.path, combatMap, combat, combatLog, turnOrder);
      if (hazardDamage > 0) {
        npc.hit_points -= hazardDamage;
        if (npc.hit_points <= 0) {
          isDead = true;
          messages.push(`${npc.name} died from environmental hazards.`);
        }
      }

      continue;
    }

    if (decision.action === 'use_item' && decision.item_id) {
      if (current.ap_remaining < AP_COSTS.use_item) {
        break;
      }

      const item = npcInventory.find((inventoryItem: Item) => inventoryItem.id === decision.item_id);
      if (item && item.type === 'healing') {
        const effects = parseJson<Record<string, any>>(item.effects, {});
        const healAmount = effects.heal || 0;
        const newHp = Math.min(npc.max_hit_points, npc.hit_points + healAmount);

        db.prepare('UPDATE npcs SET hit_points = ? WHERE id = ?').run(newHp, npc.id);
        npc.hit_points = newHp;

        if (effects.heal_limbs) {
          const fullLimbs = { head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100 };
          db.prepare('UPDATE npcs SET limb_condition = ? WHERE id = ?').run(JSON.stringify(fullLimbs), npc.id);
          npc.limb_condition = JSON.stringify(fullLimbs);
        }

        current.ap_remaining -= AP_COSTS.use_item;

        if (item.quantity > 1) {
          db.prepare('UPDATE npc_items SET quantity = quantity - 1 WHERE npc_id = ? AND item_id = ?').run(npc.id, item.id);
          item.quantity -= 1;
        } else {
          db.prepare('DELETE FROM npc_items WHERE npc_id = ? AND item_id = ?').run(npc.id, item.id);
          const index = npcInventory.findIndex((inventoryItem: Item) => inventoryItem.id === item.id);
          if (index > -1) {
            npcInventory.splice(index, 1);
          }
        }

        const flavorText = `${npc.name} uses a ${item.name} and recovers ${healAmount} HP.`;
        messages.push(flavorText);
        combatLog.push({ round: combat.current_round, actor: npc.name, action: 'use_item', target: npc.name, damage: -healAmount, message: flavorText });
      } else {
        current.ap_remaining -= AP_COSTS.use_item;
      }

      continue;
    }

    if (decision.action === 'defend') {
      if (current.ap_remaining < AP_COSTS.defend) {
        break;
      }

      current.ap_remaining -= AP_COSTS.defend;
      current.temporary_ac = (current.temporary_ac || 0) + 10;
      const flavorText = `${npc.name} takes a defensive stance (+10 AC).`;
      messages.push(flavorText);
      combatLog.push({ round: combat.current_round, actor: npc.name, action: 'defend', target: npc.name, damage: 0, message: flavorText });
      continue;
    }

    if (decision.action === 'attack' && decision.target_id) {
      if (current.ap_remaining < AP_COSTS.attack) {
        break;
      }

      const npcSkillValue = 20 + (npc.perception * 5) + (npc.agility * 3);
      const npcLimbCondition = parseJson<any>(npc.limb_condition, {
        head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100
      });
      const attacker = { 
        skill_value: npcSkillValue, 
        luck: npc.luck,
        limb_condition: npcLimbCondition
      };
      const targetArmor = getArmorEffects(player.equipped_armor_id);
      const targetLimbCondition = parseJson<any>(player.limb_condition, {
        head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100
      });

      const targetInTurnOrder = turnOrder.find((turn: any) => turn.type === 'player' && turn.id === player.id);
      const target = {
        ...targetArmor,
        hit_points: player.hit_points,
        name: player.name,
        temporary_ac: targetInTurnOrder?.temporary_ac || 0,
        limb_condition: targetLimbCondition
      };

      if (requiresAmmo && npc.ammo_in_clip <= 0) {
        db.prepare('UPDATE npcs SET ammo_in_clip = ? WHERE id = ?').run((weaponEffects.magazine_size || 10), npc.id);
        npc.ammo_in_clip = weaponEffects.magazine_size || 10;
        const reloadMessage = `${npc.name} reloads their weapon.`;
        messages.push(reloadMessage);
        combatLog.push({ round: combat.current_round, actor: npc.name, action: 'reload', target: 'self', damage: 0, message: reloadMessage });
        current.ap_remaining -= AP_COSTS.reload;
        continue;
      }

      let distance: number | undefined;
      if (combat.map_json && current.tile_x !== undefined && targetInTurnOrder?.tile_x !== undefined) {
        distance = manhattanDistance(current.tile_x, current.tile_y, targetInTurnOrder.tile_x, targetInTurnOrder.tile_y);
      }

      // NPCs occasionally aim for limbs if they have high skill or luck
      let npcBodyPart: string | undefined = undefined;
      if (npc.intelligence > 6 && Math.random() > 0.7) {
        const parts = ['head', 'torso', 'arms', 'legs'];
        npcBodyPart = parts[Math.floor(Math.random() * parts.length)];
      }

      const result = resolveAttack(attacker, target, weaponEffects, npcBodyPart, distance);
      
      // Update Player HP and Limb Condition
      if (result.limb_key) {
        targetLimbCondition[result.limb_key] = Math.max(0, targetLimbCondition[result.limb_key] - result.limb_damage);
        db.prepare('UPDATE players SET hit_points = ?, limb_condition = ? WHERE id = ?').run(
          result.target_hp, 
          JSON.stringify(targetLimbCondition), 
          player.id
        );
      } else {
        db.prepare('UPDATE players SET hit_points = ? WHERE id = ?').run(result.target_hp, player.id);
      }

      // Apply Status Effects from Critical Hits
      if (result.critical && result.critical_effect) {
        const targetStatusEffects = parseJson<any[]>(player.status_effects, []);
        targetStatusEffects.push({
          type: result.critical_effect.type,
          duration: 1,
          message: result.critical_effect.message
        });
        db.prepare('UPDATE players SET status_effects = ? WHERE id = ?').run(
          JSON.stringify(targetStatusEffects),
          player.id
        );
      }
      
      player.hit_points = result.target_hp;
      player.limb_condition = JSON.stringify(targetLimbCondition);
      if (targetInTurnOrder) {
        targetInTurnOrder.hit_points = result.target_hp;
        targetInTurnOrder.limb_condition = targetLimbCondition;
      }
      
      current.ap_remaining -= AP_COSTS.attack;

      if (requiresAmmo) {
        db.prepare('UPDATE npcs SET ammo_in_clip = ammo_in_clip - 1 WHERE id = ?').run(npc.id);
        npc.ammo_in_clip -= 1;
      }

      messages.push(result.message);
      combatLog.push({ round: combat.current_round, actor: npc.name, action: 'attack', target: player.name, damage: result.damage, message: result.message });

      if (result.target_hp <= 0) {
        isDead = true;
        if (targetInTurnOrder) {
          targetInTurnOrder.is_dead = true;
        }
        break;
      }

      continue;
    }

    break;
  }

  if (messages.length === 0) {
    messages.push(`${npc.name} ends their turn.`);
  }

  if (isDead) {
    completeCombat(combat.id, turnOrder, combatLog);
    return ok({ message: `${messages.join(' ')} You have been defeated!`, combat_over: true });
  }

  const { combat_over } = advanceTurn(combat, turnOrder, combatLog, { resetNextTemporaryAc: true });
  return ok({ message: messages.join(' '), combat_over });
}