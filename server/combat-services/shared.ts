import { db } from '../db.js';

export interface ServiceResult {
  status: number;
  body: any;
}

export interface CombatContext {
  player: any;
  combat: any;
  turnOrder: any[];
  current: any;
}

export interface CombatContextResult {
  context?: CombatContext;
  error?: ServiceResult;
}

export interface WeaponData {
  weapon: any;
  weaponEffects: any;
  requiresAmmo: boolean;
  ammoType: string;
  magazineSize: number;
}

export interface AdvanceTurnOptions {
  resetAllTemporaryAc?: boolean;
  resetNextTemporaryAc?: boolean;
}

export function ok(body: any, status = 200): ServiceResult {
  return { status, body };
}

export function fail(status: number, message: string): ServiceResult {
  return { status, body: { message } };
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getPlayerByUserId(userId: number) {
  return db.prepare('SELECT *, critical_meter FROM players WHERE user_id = ?').get(userId) as any;
}

export function getPlayerPerks(playerId: number) {
  return db.prepare(`
    SELECT p.* 
    FROM perks p
    JOIN player_perks pp ON p.id = pp.perk_id
    WHERE pp.player_id = ?
  `).all(playerId) as any[];
}

export function getActiveCombatContext(userId: number): CombatContextResult {
  const player = getPlayerByUserId(userId);
  if (!player) {
    return { error: fail(404, 'Player not found') };
  }

  const combatPlayer = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').get(player.id) as any;
  if (!combatPlayer) {
    return { error: fail(404, 'No active combat found') };
  }

  const combat = db.prepare('SELECT * FROM combats WHERE id = ? AND is_active = 1').get(combatPlayer.combat_id) as any;
  if (!combat) {
    return { error: fail(404, 'No active combat found') };
  }

  const turnOrder = parseJson<any[]>(combat.turn_order, []);
  const current = turnOrder[combat.current_turn_index];

  return {
    context: {
      player,
      combat,
      turnOrder,
      current,
    },
  };
}

export function getCombatLog(combat: any) {
  return parseJson<any[]>(combat.combat_log, []);
}

export function updateCombatTurnAndLog(combatId: number, turnOrder: any[], combatLog: any[]) {
  db.prepare('UPDATE combats SET turn_order = ?, combat_log = ? WHERE id = ?').run(
    JSON.stringify(turnOrder),
    JSON.stringify(combatLog),
    combatId,
  );
}

export function updateCombatRoundTurnAndLog(
  combatId: number,
  currentTurnIndex: number,
  currentRound: number,
  turnOrder: any[],
  combatLog: any[],
) {
  db.prepare('UPDATE combats SET current_turn_index = ?, current_round = ?, turn_order = ?, combat_log = ? WHERE id = ?').run(
    currentTurnIndex,
    currentRound,
    JSON.stringify(turnOrder),
    JSON.stringify(combatLog),
    combatId,
  );
}

export function applyHazardDamage(
  combatant: any,
  combatantType: 'player' | 'npc',
  path: { x: number; y: number }[],
  map: any,
  combat: any,
  combatLog: any[],
  turnOrder: any[]
): number {
  if (!map || !map.tiles) return 0;
  
  let totalDamage = 0;
  let gotIrradiated = false;
  let gotPoisoned = false;

  const perks = combatantType === 'player' ? getPlayerPerks(combatant.id) : [];
  const radResist = perks.find(p => p.name === 'Rad Resistance') ? 0.5 : 0;
  const poisonResist = perks.find(p => p.name === 'Snake Eater') ? 0.5 : 0;

  const getTile = (x: number, y: number) => map.tiles.find((t: any) => t.x === x && t.y === y);

  for (const step of path) {
    const tile = getTile(step.x, step.y);
    if (!tile || !tile.hazard || tile.hazard === 'none') continue;

    let damage = 0;
    let hazardName = '';

    if (tile.hazard === 'radiation') {
      damage = Math.floor((Math.floor(Math.random() * 2) + 1) * (1 - radResist));
      hazardName = 'Radiation';
      gotIrradiated = true;
    } else if (tile.hazard === 'toxic_gas') {
      damage = Math.floor((Math.floor(Math.random() * 3) + 2) * (1 - poisonResist));
      hazardName = 'Toxic Gas';
      gotPoisoned = true;
    }

    if (damage > 0) {
      totalDamage += damage;
      combatLog.push({
        round: combat.current_round,
        actor: 'Environment',
        action: 'hazard',
        target: combatant.name || 'Combatant',
        damage: damage,
        message: `${combatant.name || 'Combatant'} took ${damage} damage from ${hazardName}.`,
      });
    }
  }

  if (totalDamage > 0 || gotIrradiated || gotPoisoned) {
    let newHp = 0;
    let statusEffects: any[] = [];

    if (combatantType === 'player') {
      const player = db.prepare('SELECT hit_points, status_effects FROM players WHERE id = ?').get(combatant.id) as any;
      newHp = Math.max(0, player.hit_points - totalDamage);
      statusEffects = parseJson<any[]>(player.status_effects, []);
      
      const effectTypes = statusEffects.map(e => typeof e === 'string' ? e : e.type);
      if (gotIrradiated && !effectTypes.includes('irradiated')) {
        statusEffects.push({ type: 'irradiated', duration: 999, message: 'Irradiated' });
      }
      if (gotPoisoned && !effectTypes.includes('poisoned')) {
        statusEffects.push({ type: 'poisoned', duration: 999, message: 'Poisoned' });
      }

      db.prepare('UPDATE players SET hit_points = ?, status_effects = ? WHERE id = ?').run(newHp, JSON.stringify(statusEffects), combatant.id);
      combatant.hit_points = newHp;
      combatant.status_effects = JSON.stringify(statusEffects);
    } else if (combatantType === 'npc') {
      const npc = db.prepare('SELECT hit_points, status_effects FROM npcs WHERE id = ?').get(combatant.id) as any;
      newHp = Math.max(0, npc.hit_points - totalDamage);
      statusEffects = parseJson<any[]>(npc.status_effects, []);
      
      const effectTypes = statusEffects.map(e => typeof e === 'string' ? e : e.type);
      if (gotIrradiated && !effectTypes.includes('irradiated')) {
        statusEffects.push({ type: 'irradiated', duration: 999, message: 'Irradiated' });
      }
      if (gotPoisoned && !effectTypes.includes('poisoned')) {
        statusEffects.push({ type: 'poisoned', duration: 999, message: 'Poisoned' });
      }

      db.prepare('UPDATE npcs SET hit_points = ?, status_effects = ? WHERE id = ?').run(newHp, JSON.stringify(statusEffects), combatant.id);
      combatant.hit_points = newHp;
      combatant.status_effects = JSON.stringify(statusEffects);
    }

    // Also update the turnOrder so the client sees the changes immediately
    const targetInTurnOrder = turnOrder.find((turn: any) => turn.type === combatantType && turn.id === combatant.id);
    if (targetInTurnOrder) {
      targetInTurnOrder.hit_points = newHp;
      targetInTurnOrder.status_effects = statusEffects;
      if (newHp <= 0) {
        targetInTurnOrder.is_dead = true;
      }
    }
  }

  return totalDamage;
}

export function updateCombatRoundAndTurn(combatId: number, currentTurnIndex: number, currentRound: number, turnOrder: any[]) {
  db.prepare('UPDATE combats SET current_turn_index = ?, current_round = ?, turn_order = ? WHERE id = ?').run(
    currentTurnIndex,
    currentRound,
    JSON.stringify(turnOrder),
    combatId,
  );
}

export function completeCombat(combatId: number, turnOrder: any[], combatLog: any[]) {
  db.prepare('UPDATE combats SET is_active = 0, turn_order = ?, combat_log = ? WHERE id = ?').run(
    JSON.stringify(turnOrder),
    JSON.stringify(combatLog),
    combatId,
  );
}

export function advanceTurn(combat: any, turnOrder: any[], combatLog: any[], options: AdvanceTurnOptions = {}): { nextIndex: number, nextRound: number, combat_over: boolean } {
  let nextIndex = combat.current_turn_index;
  let nextRound = combat.current_round;
  let loopCount = 0;

  while (loopCount < turnOrder.length) {
    nextIndex = (nextIndex + 1) % turnOrder.length;
    
    if (nextIndex === 0) {
      nextRound++;
      turnOrder.forEach((combatant: any) => {
        if (!combatant.is_dead) {
          combatant.ap_remaining = combatant.ap_per_round;
          if (options.resetAllTemporaryAc) {
            combatant.temporary_ac = 0;
          }
        }
      });
    } else if (options.resetNextTemporaryAc) {
      if (!turnOrder[nextIndex].is_dead) {
        turnOrder[nextIndex].temporary_ac = 0;
      }
    }

    const nextCombatant = turnOrder[nextIndex];
    if (!nextCombatant.is_dead) {
      let entity: any = null;
      if (nextCombatant.type === 'player') {
        entity = db.prepare('SELECT hit_points, status_effects FROM players WHERE id = ?').get(nextCombatant.id);
      } else {
        entity = db.prepare('SELECT hit_points, status_effects FROM npcs WHERE id = ?').get(nextCombatant.id);
      }

      if (entity) {
        const statusEffects = parseJson<any[]>(entity.status_effects, []);
        let hpChange = 0;
        const effectTypes = statusEffects.map(e => typeof e === 'string' ? e : e.type);
        
        if (effectTypes.includes('poisoned')) {
          hpChange -= 2; // Poison damage per turn
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 2,
            message: `${nextCombatant.name} takes 2 damage from poison.`,
          });
        }

        if (effectTypes.includes('irradiated')) {
          // Irradiated reduces AP by 2
          nextCombatant.ap_remaining = Math.max(0, nextCombatant.ap_remaining - 2);
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 0,
            message: `${nextCombatant.name} loses 2 AP from radiation sickness.`,
          });
        }

        if (effectTypes.includes('blinded')) {
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 0,
            message: `${nextCombatant.name} is blinded, accuracy reduced.`,
          });
        }

        if (effectTypes.includes('stunned')) {
          nextCombatant.ap_remaining = Math.max(0, nextCombatant.ap_remaining - 3);
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 0,
            message: `${nextCombatant.name} is stunned, loses 3 AP.`,
          });
        }

        if (effectTypes.includes('winded')) {
          nextCombatant.ap_remaining = Math.max(0, nextCombatant.ap_remaining - 2);
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 0,
            message: `${nextCombatant.name} is winded, loses 2 AP.`,
          });
        }

        if (effectTypes.includes('knockdown')) {
          nextCombatant.ap_remaining = Math.max(0, nextCombatant.ap_remaining - 3);
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 0,
            message: `${nextCombatant.name} is knocked down, loses 3 AP.`,
          });
        }

        if (effectTypes.includes('knockout')) {
          nextCombatant.ap_remaining = 0;
          combatLog.push({
            round: nextRound,
            actor: 'Environment',
            action: 'status_effect',
            target: nextCombatant.name,
            damage: 0,
            message: `${nextCombatant.name} is unconscious and loses their turn!`,
          });
        }

        // Clear temporary status effects after they apply
        const temporaryEffects = ['blinded', 'stunned', 'winded', 'knockdown', 'knockout'];
        const remainingEffects = statusEffects.filter(e => {
          const type = typeof e === 'string' ? e : e.type;
          return !temporaryEffects.includes(type);
        });
        
        if (remainingEffects.length !== statusEffects.length) {
          if (nextCombatant.type === 'player') {
            db.prepare('UPDATE players SET status_effects = ? WHERE id = ?').run(JSON.stringify(remainingEffects), nextCombatant.id);
          } else {
            db.prepare('UPDATE npcs SET status_effects = ? WHERE id = ?').run(JSON.stringify(remainingEffects), nextCombatant.id);
          }
          nextCombatant.status_effects = remainingEffects;
        }

        if (hpChange !== 0) {
          const newHp = Math.max(0, entity.hit_points + hpChange);
          if (nextCombatant.type === 'player') {
            db.prepare('UPDATE players SET hit_points = ? WHERE id = ?').run(newHp, nextCombatant.id);
          } else {
            db.prepare('UPDATE npcs SET hit_points = ? WHERE id = ?').run(newHp, nextCombatant.id);
          }
          nextCombatant.hit_points = newHp;
          
          if (newHp <= 0) {
            nextCombatant.is_dead = true;
            combatLog.push({
              round: nextRound,
              actor: 'Environment',
              action: 'death',
              target: nextCombatant.name,
              damage: 0,
              message: `${nextCombatant.name} died from status effects.`,
            });
            // If they died, we should continue the loop to find the next alive combatant
            loopCount++;
            continue;
          }
        }
      }
      
      // Found a living combatant, break the loop
      break;
    }
    
    loopCount++;
  }

  // Check if combat is over (all players dead or all NPCs dead)
  const alivePlayers = turnOrder.filter((c: any) => c.type === 'player' && !c.is_dead).length;
  const aliveNpcs = turnOrder.filter((c: any) => c.type === 'npc' && !c.is_dead).length;

  if (alivePlayers === 0 || aliveNpcs === 0) {
    completeCombat(combat.id, turnOrder, combatLog);
    return { nextIndex, nextRound, combat_over: true };
  } else {
    updateCombatRoundTurnAndLog(combat.id, nextIndex, nextRound, turnOrder, combatLog);
  }

  return { nextIndex, nextRound, combat_over: false };
}

export function getWeaponData(entity: any, defaultWeaponEffects: any) : WeaponData {
  let weapon = null;
  let weaponEffects = { ...defaultWeaponEffects };
  let requiresAmmo = false;
  let ammoType = '';
  let magazineSize = 0;

  if (entity.equipped_weapon_id) {
    weapon = db.prepare('SELECT name, effects FROM items WHERE id = ?').get(entity.equipped_weapon_id) as any;
    if (weapon?.effects) {
      weaponEffects = parseJson<Record<string, any>>(weapon.effects, weaponEffects);
      if (weaponEffects.ammo_type) {
        requiresAmmo = true;
        ammoType = weaponEffects.ammo_type;
        magazineSize = weaponEffects.magazine_size || 1;
      }
    }
  }

  return { weapon, weaponEffects, requiresAmmo, ammoType, magazineSize };
}

export function getArmorEffects(armorId?: number | null) {
  const defaultArmor = { armor_class: 0, armor_dt: 0, armor_dr: 0 };
  if (!armorId) {
    return defaultArmor;
  }

  const armor = db.prepare('SELECT effects FROM items WHERE id = ?').get(armorId) as any;
  if (!armor?.effects) {
    return defaultArmor;
  }

  return { ...defaultArmor, ...parseJson<Record<string, any>>(armor.effects, {}) };
}