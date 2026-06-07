import { Router } from 'express';
import { db } from '../db.js';

export const narrativeRouter = Router();

const NARRATIVE_LOG_RETAIN = 200; // load reads the latest 100; keep some headroom

narrativeRouter.post('/log', (req: any, res: any) => {
  const { text, type } = req.body;

  // Validate + bound: client text/type are stored verbatim and rendered later. Reject empty,
  // oversized, or non-string input to prevent storage-exhaustion via spammed/huge entries.
  if (typeof text !== 'string' || typeof type !== 'string' || text.length === 0 || text.length > 2000 || type.length > 40) {
    return res.status(400).json({ message: 'Invalid log entry' });
  }

  const player = db.prepare('SELECT id FROM players WHERE user_id = ?').get(req.userId) as any;

  if (player) {
    db.transaction(() => {
      db.prepare('INSERT INTO narrative_log (player_id, text, type) VALUES (?, ?, ?)').run(player.id, text, type);
      // Bound per-player growth: keep only the most recent N entries.
      db.prepare(`
        DELETE FROM narrative_log
        WHERE player_id = ?
          AND id NOT IN (
            SELECT id FROM narrative_log WHERE player_id = ? ORDER BY id DESC LIMIT ?
          )
      `).run(player.id, player.id, NARRATIVE_LOG_RETAIN);
    })();
  }

  res.json({ status: 'ok' });
});

narrativeRouter.get('/logs', (req: any, res: any) => {
  const player = db.prepare('SELECT id FROM players WHERE user_id = ?').get(req.userId) as any;

  if (!player) return res.status(404).json({ error: 'Player not found' });

  const logs = db.prepare('SELECT * FROM narrative_log WHERE player_id = ? ORDER BY timestamp DESC LIMIT 50').all(player.id);
  res.json({ logs });
});
