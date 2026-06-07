import { calculateApPerRound, rollInitiative } from '../combat.js';
import { db } from '../db.js';
import { assignStartPositions, generateBattlefield } from '../mapgen.js';
import { fail, getPlayerByUserId, ok, parseJson, type ServiceResult } from './shared.js';

export function startCombatForPlayer(userId: number, npcIds: number[]): ServiceResult {
  const player = getPlayerByUserId(userId);
  if (!player) {
    return fail(404, 'Player not found');
  }

  // Bound combat-table growth: drop this player's previously-completed combat rows before
  // starting a new one (completed combats set is_active=0 but are otherwise never deleted).
  const priorLinks = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').all(player.id) as any[];
  for (const link of priorLinks) {
    const prior = db.prepare('SELECT is_active FROM combats WHERE id = ?').get(link.combat_id) as any;
    if (!prior || prior.is_active === 0) {
      db.prepare('DELETE FROM combat_npcs WHERE combat_id = ?').run(link.combat_id);
      db.prepare('DELETE FROM combat_players WHERE combat_id = ?').run(link.combat_id);
      db.prepare('DELETE FROM combats WHERE id = ?').run(link.combat_id);
    }
  }

  if (!Array.isArray(npcIds) || npcIds.length === 0 || npcIds.length > 12 || !npcIds.every((id) => Number.isInteger(id))) {
    return fail(400, 'Invalid combat targets');
  }

  const npcs = npcIds.map((id: number) => db.prepare('SELECT * FROM npcs WHERE id = ?').get(id) as any);
  if (npcs.some((npc: any) => !npc)) {
    return fail(404, 'One or more NPCs not found');
  }

  // Server-authoritative checks: targets must be at the player's location and still alive,
  // so combat cannot be started against NPCs elsewhere in the world or against corpses.
  if (npcs.some((npc: any) => npc.current_location_id !== player.current_location_id)) {
    return fail(400, 'Those targets are not here.');
  }
  if (npcs.some((npc: any) => npc.hit_points <= 0)) {
    return fail(400, 'You cannot start combat with the dead.');
  }

  const combatants = [
    { type: 'player', id: player.id, name: player.name, agility: player.agility, luck: player.luck },
    ...npcs.map((npc: any) => ({ type: 'npc', id: npc.id, name: npc.name, agility: npc.agility, luck: npc.luck })),
  ];

  let turnOrder = rollInitiative(combatants).map(combatant => ({
    ...combatant,
    ap_per_round: calculateApPerRound(combatant.agility),
    ap_remaining: calculateApPerRound(combatant.agility),
  }));

  const battlefield = generateBattlefield();
  turnOrder = assignStartPositions(turnOrder, battlefield);

  const info = db.prepare(
    'INSERT INTO combats (is_active, current_turn_index, current_round, turn_order, combat_log, map_json) VALUES (1, 0, 1, ?, ?, ?)',
  ).run(JSON.stringify(turnOrder), JSON.stringify([]), JSON.stringify(battlefield));

  const combatId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO combat_players (combat_id, player_id) VALUES (?, ?)').run(combatId, player.id);
  for (const npc of npcs) {
    db.prepare('INSERT INTO combat_npcs (combat_id, npc_id) VALUES (?, ?)').run(combatId, npc.id);
  }

  return ok({
    message: 'Combat started!',
    combat_id: combatId,
    turn_order: turnOrder,
    current_turn: turnOrder[0],
    map: battlefield,
  });
}

export function getCombatStateForPlayer(userId: number): ServiceResult {
  const player = getPlayerByUserId(userId);
  if (!player) {
    return fail(404, 'Player not found');
  }

  const combatPlayer = db.prepare('SELECT combat_id FROM combat_players WHERE player_id = ?').get(player.id) as any;
  if (!combatPlayer) {
    return fail(404, 'No active combat found');
  }

  const combat = db.prepare('SELECT * FROM combats WHERE id = ? AND is_active = 1').get(combatPlayer.combat_id) as any;
  if (!combat) {
    return fail(404, 'No active combat found');
  }

  const turnOrder = parseJson<any[]>(combat.turn_order, []);
  const playerTurnEntry = turnOrder.find((turn: any) => turn.type === 'player' && turn.id === player.id);

  const npcs = db.prepare(`
    SELECT n.*, 
           w.name as equipped_weapon_name,
           a.name as equipped_armor_name
    FROM npcs n
    JOIN combat_npcs cn ON n.id = cn.npc_id
    LEFT JOIN items w ON n.equipped_weapon_id = w.id
    LEFT JOIN items a ON n.equipped_armor_id = a.id
    WHERE cn.combat_id = ?
  `).all(combat.id);

  return ok({
    combat_id: combat.id,
    is_active: combat.is_active,
    current_turn_index: combat.current_turn_index,
    current_round: combat.current_round,
    turn_order: turnOrder,
    combat_log: parseJson<any[]>(combat.combat_log, []),
    players: [{
      id: player.id,
      name: player.name,
      hp: player.hit_points,
      max_hp: player.max_hit_points,
      tile_x: playerTurnEntry?.tile_x,
      tile_y: playerTurnEntry?.tile_y,
      ap_remaining: playerTurnEntry?.ap_remaining,
      status_effects: parseJson<string[]>(player.status_effects, []),
    }],
    npcs: npcs.map((npc: any) => {
      const turnEntry = turnOrder.find((turn: any) => turn.type === 'npc' && turn.id === npc.id);

      return {
        id: npc.id,
        name: npc.name,
        hp: npc.hit_points,
        max_hp: npc.max_hit_points,
        tile_x: turnEntry?.tile_x,
        tile_y: turnEntry?.tile_y,
        ap_remaining: turnEntry?.ap_remaining,
        status_effects: parseJson<string[]>(npc.status_effects, []),
      };
    }),
    map: combat.map_json ? parseJson(combat.map_json, null) : null,
  });
}