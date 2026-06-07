import { findPath, manhattanDistance } from './pathfinding.js';

export const AP_COSTS = {
  attack: 5,
  aimed_shot: 7,
  use_item: 4,
  reload: 2,
  flee: 3,
  defend: 2,
  end_turn: 0,
  move: 0,
};

export const AIMED_SHOT_MODIFIERS: Record<string, number> = {
  torso: 0,
  head: -40,
  eyes: -60,
  arms: -30,
  legs: -20,
  groin: -30,
};

export const AIMED_SHOT_CRIT_BONUS: Record<string, number> = {
  torso: 0,
  head: 20,
  eyes: 40,
  arms: 10,
  legs: 10,
  groin: 15,
};

export const BODY_PART_EFFECTS: Record<string, any> = {
  eyes: { type: "blind", message: "blinded, accuracy severely reduced" },
  head: { type: "knockout", message: "knocked unconscious, loses next turn" },
  torso: { type: "winded", message: "winded, loses 2 AP next turn" },
  arms: { type: "disarm", message: "weapon knocked from their hands" },
  legs: { type: "knockdown", message: "knocked down, loses 3 AP next turn" },
  groin: { type: "stunned", message: "stunned by pain, loses 3 AP next turn" },
};

export const LIMB_MAP: Record<string, string> = {
  head: 'head',
  eyes: 'head',
  torso: 'torso',
  arms: 'right_arm',
  legs: 'right_leg',
  groin: 'torso'
};

export function rollInitiative(combatants: any[]) {
  const results = combatants.map(c => ({
    ...c,
    sequence: c.agility + Math.floor(Math.random() * 10) + 1
  }));
  results.sort((a, b) => {
    if (b.sequence !== a.sequence) return b.sequence - a.sequence;
    return b.luck - a.luck;
  });
  return results;
}

export function calculateApPerRound(agility: number) {
  return 5 + Math.floor(agility / 2);
}

export function calculateHitChance(skill: number, targetAc: number, aimedPenalty: number = 0) {
  const raw = skill - targetAc + aimedPenalty;
  return Math.max(5, Math.min(95, raw));
}

export function rollHit(hitChance: number) {
  const roll = Math.floor(Math.random() * 100) + 1;
  return { hit: roll <= hitChance, roll };
}

export function calculateDamage(rawDamage: number, armorDt: number = 0, armorDr: number = 0) {
  const afterThreshold = Math.max(0, rawDamage - armorDt);
  const afterResistance = afterThreshold * (1 - armorDr / 100);
  return Math.max(1, Math.floor(afterResistance));
}

export function rollWeaponDamage(damageMin: number, damageMax: number) {
  return Math.floor(Math.random() * (damageMax - damageMin + 1)) + damageMin;
}

export function rollCritical(luck: number, aimedBonus: number = 0, guaranteed: boolean = false) {
  if (guaranteed) return true;
  const critChance = luck + aimedBonus;
  const roll = Math.floor(Math.random() * 100) + 1;
  return roll <= critChance;
}

export function calculateCriticalDamage(baseDamage: number, multiplier?: number) {
  const finalMultiplier = multiplier || (1.5 + Math.random() * 0.5);
  return Math.floor(baseDamage * finalMultiplier);
}

export function getLimbPenalties(limbCondition: any) {
  const penalties = {
    accuracy: 0,
    ap_cost: 0,
    movement_penalty: 0,
    damage_reduction: 0
  };

  if (!limbCondition) return penalties;

  if (limbCondition.head <= 0) penalties.accuracy -= 20;
  if (limbCondition.left_arm <= 0) penalties.accuracy -= 10;
  if (limbCondition.right_arm <= 0) penalties.accuracy -= 10;
  if (limbCondition.left_leg <= 0) penalties.movement_penalty += 2;
  if (limbCondition.right_leg <= 0) penalties.movement_penalty += 2;
  
  return penalties;
}

export function resolveAttack(attacker: any, target: any, weaponEffects: any, bodyPart?: string, distance?: number, useCritical: boolean = false, critMultiplier?: number) {
  const aimedPenalty = bodyPart ? (AIMED_SHOT_MODIFIERS[bodyPart] || 0) : 0;
  const aimedCritBonus = bodyPart ? (AIMED_SHOT_CRIT_BONUS[bodyPart] || 0) : 0;
  
  // Apply limb penalties to attacker
  const attackerLimbPenalties = getLimbPenalties(attacker.limb_condition);
  const targetAc = (target.armor_class || 0) + (target.temporary_ac || 0);
  
  const baseHitChance = attacker.skill_value + attackerLimbPenalties.accuracy - targetAc - aimedPenalty;

  // Range checks (only when distance is provided - spatial combat)
  if (distance !== undefined) {
    const weaponClass = weaponEffects.weapon_class || 'melee';
    if (weaponClass === 'melee' && distance > 1) {
      return {
        hit: false, damage: 0, critical: false, critical_effect: null, roll: 0, hit_chance: 0,
        message: `${target.name} is too far for a melee attack!`, target_hp: target.hit_points,
        meter_gain: 0
      };
    }
    if (weaponClass === 'ranged') {
      const rangeMax = weaponEffects.range_max || 10;
      if (distance > rangeMax) {
        return {
          hit: false, damage: 0, critical: false, critical_effect: null, roll: 0, hit_chance: 0,
          message: `${target.name} is out of range! (distance: ${distance}, max: ${rangeMax})`, target_hp: target.hit_points,
          meter_gain: 0
        };
      }
    }
  }

  // Range penalty for ranged weapons beyond optimal range
  let rangePenalty = 0;
  if (distance !== undefined && weaponEffects.weapon_class === 'ranged') {
    const rangeOptimal = weaponEffects.range_optimal || 4;
    if (distance > rangeOptimal) {
      rangePenalty = -(distance - rangeOptimal) * 10;
    }
  }

  const hitChance = calculateHitChance(attacker.skill_value, targetAc, aimedPenalty + rangePenalty);
  const { hit, roll } = rollHit(hitChance);

  const result: any = {
    hit, damage: 0, critical: false, critical_effect: null, roll, hit_chance: hitChance, message: "", target_hp: target.hit_points,
    meter_gain: 0, limb_damage: 0, body_part: bodyPart, crippled: false
  };

  if (!hit) {
    result.message = `Attack missed ${target.name} (rolled ${roll} vs ${hitChance}%).`;
    return result;
  }

  let rawDamage = rollWeaponDamage(weaponEffects.damage_min, weaponEffects.damage_max);
  const isCritical = rollCritical(attacker.luck, aimedCritBonus, useCritical);

  if (isCritical) {
    rawDamage = calculateCriticalDamage(rawDamage, critMultiplier);
    result.critical = true;
    if (bodyPart && BODY_PART_EFFECTS[bodyPart]) {
      result.critical_effect = { ...BODY_PART_EFFECTS[bodyPart] };
    }
  }

  const finalDamage = calculateDamage(rawDamage, target.armor_dt, target.armor_dr);
  result.damage = finalDamage;
  result.target_hp = Math.max(0, target.hit_points - finalDamage);
  result.meter_gain = useCritical ? 0 : 15 + (attacker.luck * 2);

  // Handle Limb Damage
  if (bodyPart) {
    const limbKey = LIMB_MAP[bodyPart];
    if (limbKey && target.limb_condition) {
      // Limb damage is a portion of total damage, but higher for aimed shots
      const limbDamage = Math.floor(finalDamage * 1.5);
      result.limb_damage = limbDamage;
      result.limb_key = limbKey;
      
      const currentLimbHealth = target.limb_condition[limbKey] || 0;
      const newLimbHealth = Math.max(0, currentLimbHealth - limbDamage);
      
      if (currentLimbHealth > 0 && newLimbHealth <= 0) {
        result.crippled = true;
      }
    }
  }

  if (isCritical && result.critical_effect) {
    result.message = `CRITICAL HIT on ${target.name}'s ${bodyPart}! ${finalDamage} damage. ${target.name} is ${result.critical_effect.message}.`;
  } else if (isCritical) {
    result.message = `CRITICAL HIT on ${target.name}! ${finalDamage} damage.`;
  } else if (bodyPart) {
    result.message = `Hit ${target.name}'s ${bodyPart} for ${finalDamage} damage.`;
    if (result.crippled) {
      result.message += ` The ${bodyPart} is CRIPPLED!`;
    }
  } else {
    result.message = `Hit ${target.name} for ${finalDamage} damage.`;
  }

  return result;
}

interface NpcDecisionOptions {
  weaponEffects?: Record<string, any>;
  map?: {
    width: number;
    height: number;
    tiles: { x: number; y: number; ap_cost: number }[];
  } | null;
  occupiedPositions?: Set<string>;
}

function getTileAt(
  map: NonNullable<NpcDecisionOptions['map']>,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return null;
  }

  return map.tiles[y * map.width + x] ?? null;
}

function truncatePathToAvailableAp(
  map: NonNullable<NpcDecisionOptions['map']>,
  path: { x: number; y: number }[],
  availableAp: number,
) {
  let spent = 0;
  let destination: { x: number; y: number } | null = null;

  for (const step of path) {
    const tile = getTileAt(map, step.x, step.y);
    if (!tile || tile.ap_cost < 0 || spent + tile.ap_cost > availableAp) {
      break;
    }

    spent += tile.ap_cost;
    destination = step;
  }

  if (!destination) {
    return null;
  }

  return {
    ...destination,
    cost: spent,
  };
}

function chooseNearestEnemy(npcData: any, enemies: any[]) {
  if (npcData.tile_x === undefined || npcData.tile_y === undefined) {
    return enemies[0] ?? null;
  }

  return enemies.reduce((best: any, enemy: any) => {
    if (!best) {
      return enemy;
    }

    const bestDistance =
      best.tile_x === undefined || best.tile_y === undefined
        ? Number.MAX_SAFE_INTEGER
        : manhattanDistance(npcData.tile_x, npcData.tile_y, best.tile_x, best.tile_y);
    const enemyDistance =
      enemy.tile_x === undefined || enemy.tile_y === undefined
        ? Number.MAX_SAFE_INTEGER
        : manhattanDistance(npcData.tile_x, npcData.tile_y, enemy.tile_x, enemy.tile_y);

    return enemyDistance < bestDistance ? enemy : best;
  }, null);
}

function chooseMeleeMoveTarget(
  npcData: any,
  target: any,
  availableAp: number,
  map: NonNullable<NpcDecisionOptions['map']>,
  occupiedPositions: Set<string>,
) {
  if (
    npcData.tile_x === undefined ||
    npcData.tile_y === undefined ||
    target.tile_x === undefined ||
    target.tile_y === undefined
  ) {
    return null;
  }

  const adjacentTiles = [
    { x: target.tile_x - 1, y: target.tile_y },
    { x: target.tile_x + 1, y: target.tile_y },
    { x: target.tile_x, y: target.tile_y - 1 },
    { x: target.tile_x, y: target.tile_y + 1 },
  ].filter(candidate => {
    const tile = getTileAt(map, candidate.x, candidate.y);
    return Boolean(tile && tile.ap_cost >= 0 && !occupiedPositions.has(`${candidate.x},${candidate.y}`));
  });

  let bestMove: {
    x: number;
    y: number;
    cost: number;
    distanceToTarget: number;
    totalPathCost: number;
  } | null = null;

  for (const candidate of adjacentTiles) {
    const pathResult = findPath(
      map,
      npcData.tile_x,
      npcData.tile_y,
      candidate.x,
      candidate.y,
      occupiedPositions,
    );

    if (!pathResult.valid || pathResult.path.length === 0) {
      continue;
    }

    const reachable = truncatePathToAvailableAp(map, pathResult.path, availableAp);
    if (!reachable) {
      continue;
    }

    const distanceToTarget = manhattanDistance(reachable.x, reachable.y, target.tile_x, target.tile_y);

    if (
      !bestMove ||
      distanceToTarget < bestMove.distanceToTarget ||
      (distanceToTarget === bestMove.distanceToTarget && reachable.cost < bestMove.cost) ||
      (distanceToTarget === bestMove.distanceToTarget &&
        reachable.cost === bestMove.cost &&
        pathResult.totalApCost < bestMove.totalPathCost)
    ) {
      bestMove = {
        x: reachable.x,
        y: reachable.y,
        cost: reachable.cost,
        distanceToTarget,
        totalPathCost: pathResult.totalApCost,
      };
    }
  }

  return bestMove;
}

function chooseRangedRepositionTarget(
  npcData: any,
  target: any,
  availableAp: number,
  map: NonNullable<NpcDecisionOptions['map']>,
  occupiedPositions: Set<string>,
  weaponEffects: Record<string, any>,
) {
  if (
    npcData.tile_x === undefined ||
    npcData.tile_y === undefined ||
    target.tile_x === undefined ||
    target.tile_y === undefined
  ) {
    return null;
  }

  const currentDistance = manhattanDistance(npcData.tile_x, npcData.tile_y, target.tile_x, target.tile_y);
  const rangeOptimal = weaponEffects.range_optimal || 4;
  const rangeMax = weaponEffects.range_max || 8;

  let bestMove: {
    x: number;
    y: number;
    cost: number;
    priority: number;
    distanceScore: number;
    distanceToTarget: number;
  } | null = null;

  for (const tile of map.tiles) {
    const tileKey = `${tile.x},${tile.y}`;
    if (tile.ap_cost < 0 || occupiedPositions.has(tileKey)) {
      continue;
    }

    if (tile.x === npcData.tile_x && tile.y === npcData.tile_y) {
      continue;
    }

    const pathResult = findPath(
      map,
      npcData.tile_x,
      npcData.tile_y,
      tile.x,
      tile.y,
      occupiedPositions,
    );

    if (!pathResult.valid || pathResult.path.length === 0 || pathResult.totalApCost > availableAp) {
      continue;
    }

    const candidateDistance = manhattanDistance(tile.x, tile.y, target.tile_x, target.tile_y);

    let priority = 2;
    let distanceScore = Math.abs(candidateDistance - rangeOptimal);

    if (currentDistance < rangeOptimal) {
      if (candidateDistance >= rangeOptimal && candidateDistance <= rangeMax) {
        priority = 0;
      } else if (candidateDistance > currentDistance) {
        priority = 1;
      }
      distanceScore = Math.abs(candidateDistance - rangeOptimal);
    } else if (currentDistance > rangeMax) {
      if (candidateDistance >= rangeOptimal && candidateDistance <= rangeMax) {
        priority = 0;
      } else if (candidateDistance < currentDistance) {
        priority = 1;
      }
      distanceScore = Math.abs(candidateDistance - rangeOptimal);
    } else {
      if (candidateDistance >= rangeOptimal && candidateDistance <= rangeMax) {
        priority = 0;
      } else {
        priority = 1;
      }
    }

    if (
      !bestMove ||
      priority < bestMove.priority ||
      (priority === bestMove.priority && distanceScore < bestMove.distanceScore) ||
      (priority === bestMove.priority && distanceScore === bestMove.distanceScore && pathResult.totalApCost < bestMove.cost) ||
      (priority === bestMove.priority && distanceScore === bestMove.distanceScore && pathResult.totalApCost === bestMove.cost && candidateDistance < bestMove.distanceToTarget)
    ) {
      bestMove = {
        x: tile.x,
        y: tile.y,
        cost: pathResult.totalApCost,
        priority,
        distanceScore,
        distanceToTarget: candidateDistance,
      };
    }
  }

  return bestMove;
}

function chooseRetreatTarget(
  npcData: any,
  target: any,
  availableAp: number,
  map: NonNullable<NpcDecisionOptions['map']>,
  occupiedPositions: Set<string>,
) {
  if (
    !target ||
    npcData.tile_x === undefined ||
    npcData.tile_y === undefined ||
    target.tile_x === undefined ||
    target.tile_y === undefined
  ) {
    return null;
  }

  let bestMove: { x: number; y: number; cost: number; distance: number } | null = null;

  for (const tile of map.tiles) {
    const tileKey = `${tile.x},${tile.y}`;
    if (tile.ap_cost < 0 || occupiedPositions.has(tileKey)) {
      continue;
    }

    const pathResult = findPath(
      map,
      npcData.tile_x,
      npcData.tile_y,
      tile.x,
      tile.y,
      occupiedPositions,
    );

    if (!pathResult.valid || pathResult.path.length === 0 || pathResult.totalApCost > availableAp) {
      continue;
    }

    const distance = manhattanDistance(tile.x, tile.y, target.tile_x, target.tile_y);
    if (!bestMove || distance > bestMove.distance) {
      bestMove = { x: tile.x, y: tile.y, cost: pathResult.totalApCost, distance };
    }
  }

  return bestMove;
}

export function decideNpcAction(
  npcData: any,
  enemies: any[],
  npcInventory: any[] = [],
  options: NpcDecisionOptions = {},
) {
  const currentHp = npcData.hit_points || 0;
  const maxHp = npcData.max_hit_points || 1;
  const currentAp = npcData.action_points || 0;
  const aliveEnemies = enemies.filter(e => (e.hit_points || 0) > 0);
  
  if (aliveEnemies.length === 0) {
    return { action: 'end_turn', reason: 'No alive enemies' };
  }

  // Parse limb condition
  let limbCondition = { head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100 };
  try {
    if (typeof npcData.limb_condition === 'string') {
      limbCondition = JSON.parse(npcData.limb_condition);
    } else if (npcData.limb_condition) {
      limbCondition = npcData.limb_condition;
    }
  } catch (e) { /* fallback */ }

  const legsCrippled = (limbCondition.left_leg <= 0) || (limbCondition.right_leg <= 0);
  const armsCrippled = (limbCondition.left_arm <= 0) || (limbCondition.right_arm <= 0);
  const isSeverelyCrippled = Object.values(limbCondition).filter(v => v <= 0).length >= 2;

  const weaponEffects = options.weaponEffects || {};
  const weaponClass = weaponEffects.weapon_class || 'melee';
  const rangeOptimal = weaponEffects.range_optimal || (weaponClass === 'ranged' ? 4 : 1);
  const rangeMax = weaponEffects.range_max || (weaponClass === 'ranged' ? 8 : 1);

  // Sophisticated Target Selection
  // Score enemies based on HP, distance, and threat
  const scoredEnemies = aliveEnemies.map(enemy => {
    let score = 0;
    
    // HP factor: prioritize finishing off low HP enemies
    const hpPercent = (enemy.hit_points || 0) / (enemy.max_hit_points || 1);
    score += (1 - hpPercent) * 50;

    // Distance factor: closer is usually higher priority
    if (npcData.tile_x !== undefined && enemy.tile_x !== undefined) {
      const dist = manhattanDistance(npcData.tile_x, npcData.tile_y, enemy.tile_x, enemy.tile_y);
      score += (1 / (dist + 1)) * 30;
      
      // Ranged preference: prefer targets within optimal range
      if (weaponClass === 'ranged') {
        if (dist >= rangeOptimal && dist <= rangeMax) score += 20;
        else if (dist > rangeMax) score -= 40;
      }
    }

    // Threat factor: prioritize enemies that are already crippled (easier to kill) or high damage
    let enemyLimbCondition = { head: 100, torso: 100, left_arm: 100, right_arm: 100, left_leg: 100, right_leg: 100 };
    try {
      if (typeof enemy.limb_condition === 'string') enemyLimbCondition = JSON.parse(enemy.limb_condition);
      else if (enemy.limb_condition) enemyLimbCondition = enemy.limb_condition;
    } catch (e) {}
    
    const enemyCrippledCount = Object.values(enemyLimbCondition).filter(v => v <= 0).length;
    score += enemyCrippledCount * 10;

    return { enemy, score };
  });

  scoredEnemies.sort((a, b) => b.score - a.score);
  const primaryTarget = scoredEnemies[0].enemy;

  const hasSpatialData = Boolean(
    options.map &&
      primaryTarget &&
      npcData.tile_x !== undefined &&
      npcData.tile_y !== undefined &&
      primaryTarget.tile_x !== undefined &&
      primaryTarget.tile_y !== undefined,
  );
  
  const distanceToTarget = hasSpatialData
    ? manhattanDistance(npcData.tile_x, npcData.tile_y, primaryTarget.tile_x, primaryTarget.tile_y)
    : undefined;

  // Self-Preservation Logic
  if (currentHp < maxHp * 0.25 || isSeverelyCrippled) {
    const healingItems = npcInventory.filter(i => i.type === 'healing');
    if (healingItems.length > 0 && currentAp >= AP_COSTS.use_item) {
      return { action: 'use_item', item_id: healingItems[0].id, reason: 'Critically injured, using healing item' };
    }

    // If arms are crippled and no healing, maybe flee
    if (armsCrippled && hasSpatialData && currentAp >= AP_COSTS.move) {
      const retreatTarget = chooseRetreatTarget(npcData, primaryTarget, currentAp, options.map!, options.occupiedPositions!);
      if (retreatTarget && retreatTarget.distance > distanceToTarget!) {
        return { action: 'move', target_x: retreatTarget.x, target_y: retreatTarget.y, reason: 'Arms crippled and injured, retreating' };
      }
    }
  }

  // Combat Logic
  if (primaryTarget) {
    // Ranged Tactics
    if (weaponClass === 'ranged') {
      const tooClose = distanceToTarget !== undefined && distanceToTarget < rangeOptimal;
      const tooFar = distanceToTarget !== undefined && distanceToTarget > rangeMax;

      // If legs are crippled, don't move if we can shoot
      if (legsCrippled && !tooFar && currentAp >= AP_COSTS.attack) {
        return { action: 'attack', target_id: primaryTarget.id, reason: 'Legs crippled, staying to shoot' };
      }

      if (tooClose && hasSpatialData && currentAp > 0) {
        const reposition = chooseRangedRepositionTarget(npcData, primaryTarget, currentAp, options.map!, options.occupiedPositions!, weaponEffects);
        if (reposition && reposition.distanceToTarget > distanceToTarget!) {
          return { action: 'move', target_x: reposition.x, target_y: reposition.y, reason: 'Repositioning for better ranged distance' };
        }
      }

      if (!tooFar && currentAp >= AP_COSTS.attack) {
        // Aimed shot logic: if high skill, try to cripple player legs or head
        const skill = npcData.skill_value || 50;
        if (skill > 70 && Math.random() < 0.3) {
          const part = Math.random() < 0.5 ? 'legs' : 'head';
          return { action: 'attack', target_id: primaryTarget.id, body_part: part, reason: `Attempting aimed shot at ${part}` };
        }
        return { action: 'attack', target_id: primaryTarget.id, reason: 'Standard ranged attack' };
      }

      if (tooFar && hasSpatialData && currentAp > 0) {
        const advance = chooseRangedRepositionTarget(npcData, primaryTarget, currentAp, options.map!, options.occupiedPositions!, weaponEffects);
        if (advance) {
          return { action: 'move', target_x: advance.x, target_y: advance.y, reason: 'Advancing into ranged distance' };
        }
      }
    }

    // Melee Tactics
    if (weaponClass === 'melee') {
      if (distanceToTarget !== undefined && distanceToTarget <= 1) {
        if (currentAp >= AP_COSTS.attack) {
          return { action: 'attack', target_id: primaryTarget.id, reason: 'Melee attack' };
        }
      } else if (hasSpatialData && currentAp > 0 && !legsCrippled) {
        const moveTarget = chooseMeleeMoveTarget(npcData, primaryTarget, currentAp, options.map!, options.occupiedPositions!);
        if (moveTarget) {
          return { action: 'move', target_x: moveTarget.x, target_y: moveTarget.y, reason: 'Closing for melee' };
        }
      }
    }
  }

  // Default actions
  if (currentAp >= AP_COSTS.defend) {
    return { action: 'defend', reason: 'Defending' };
  }

  return { action: 'end_turn', reason: 'No viable actions' };
}
