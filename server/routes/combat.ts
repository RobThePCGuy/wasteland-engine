import { Router } from 'express';
import { executeNpcTurn } from '../combat-services/npc.js';
import { executePlayerCombatAction } from '../combat-services/player.js';
import { getCombatStateForPlayer, startCombatForPlayer } from '../combat-services/state.js';

export const combatRouter = Router();

combatRouter.post('/start', async (req: any, res: any) => {
  const result = startCombatForPlayer(req.userId, req.body.npc_ids || []);
  res.status(result.status).json(result.body);
});

combatRouter.get('/state', async (req: any, res: any) => {
  const result = getCombatStateForPlayer(req.userId);
  res.status(result.status).json(result.body);
});

combatRouter.post('/action', async (req: any, res: any) => {
  const result = executePlayerCombatAction(req.userId, req.body);
  res.status(result.status).json(result.body);
});

combatRouter.post('/npc-turn', async (req: any, res: any) => {
  const result = executeNpcTurn(req.userId);
  res.status(result.status).json(result.body);
});
