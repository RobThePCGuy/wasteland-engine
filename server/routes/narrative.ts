import { Router } from 'express';
import { db } from '../db.js';

export const narrativeRouter = Router();

narrativeRouter.post('/log', (req: any, res: any) => {
  const { text, type } = req.body;
  const player = db.prepare('SELECT id FROM players WHERE user_id = ?').get(req.userId) as any;

  if (player) {
    db.prepare('INSERT INTO narrative_log (player_id, text, type) VALUES (?, ?, ?)').run(player.id, text, type);
  }

  res.json({ status: 'ok' });
});

narrativeRouter.get('/logs', (req: any, res: any) => {
  const player = db.prepare('SELECT id FROM players WHERE user_id = ?').get(req.userId) as any;

  if (!player) return res.status(404).json({ error: 'Player not found' });

  const logs = db.prepare('SELECT * FROM narrative_log WHERE player_id = ? ORDER BY timestamp DESC LIMIT 50').all(player.id);
  res.json({ logs });
});
