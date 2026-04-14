import { Router } from 'express';
import { db } from '../db.js';

export const questRouter = Router();

questRouter.get('/generate', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;
  if (!player) {
    return res.status(404).json({ message: 'Player not found' });
  }

  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(player.current_location_id) as any;
  if (!location) {
    return res.status(404).json({ message: 'Location not found' });
  }

  res.json({ location, player });
});

questRouter.post('/accept', async (req: any, res: any) => {
  const { title, description, objectives, reward_caps, reward_xp } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  if (!player) {
    return res.status(404).json({ message: 'Player not found' });
  }

  const stmt = db.prepare('INSERT INTO quests (title, description, objectives, reward_caps, reward_xp) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(title, description, JSON.stringify(objectives), reward_caps, reward_xp);

  const initialProgress = objectives.map(() => ({ current_count: 0, completed: false }));
  db.prepare("INSERT INTO player_quests (player_id, quest_id, status, progress) VALUES (?, ?, 'active', ?)").run(
    player.id,
    info.lastInsertRowid,
    JSON.stringify(initialProgress),
  );

  res.json({ message: 'Quest accepted' });
});

questRouter.post('/complete', async (req: any, res: any) => {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(req.userId) as any;

  const activeQuest = db.prepare(`
    SELECT q.*, pq.quest_id, pq.progress 
    FROM quests q
    JOIN player_quests pq ON q.id = pq.quest_id
    WHERE pq.player_id = ? AND pq.status = 'active'
    LIMIT 1
  `).get(player.id) as any;

  if (!activeQuest) {
    return res.status(400).json({ message: 'No active quests to turn in.' });
  }

  const progress = JSON.parse(activeQuest.progress);
  const allCompleted = progress.every((step: any) => step.completed);
  if (!allCompleted) {
    return res.status(400).json({ message: 'You have not completed all objectives yet.' });
  }

  db.prepare("UPDATE player_quests SET status = 'completed' WHERE player_id = ? AND quest_id = ?").run(player.id, activeQuest.quest_id);

  const newCaps = player.money + activeQuest.reward_caps;
  const newXp = player.experience_points + activeQuest.reward_xp;
  db.prepare('UPDATE players SET money = ?, experience_points = ? WHERE id = ?').run(newCaps, newXp, player.id);

  res.json({
    message: `Quest completed: ${activeQuest.title}. You received ${activeQuest.reward_caps} caps and ${activeQuest.reward_xp} XP.`,
  });
});