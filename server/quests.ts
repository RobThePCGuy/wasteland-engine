import { db } from './db.js';

export function updateQuestProgress(playerId: number, type: string, target: string, count: number = 1) {
  const activeQuests = db.prepare(`
    SELECT q.*, pq.quest_id, pq.progress 
    FROM quests q
    JOIN player_quests pq ON q.id = pq.quest_id
    WHERE pq.player_id = ? AND pq.status = 'active'
  `).all(playerId) as any[];

  for (const quest of activeQuests) {
    const objectives = JSON.parse(quest.objectives);
    const progress = JSON.parse(quest.progress);
    let updated = false;

    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      const prog = progress[i];

      if (!prog.completed && obj.type === type && obj.target.toLowerCase() === target.toLowerCase()) {
        prog.current_count += count;
        if (prog.current_count >= obj.required_count) {
          prog.current_count = obj.required_count;
          prog.completed = true;
        }
        updated = true;
      }
    }

    if (updated) {
      db.prepare('UPDATE player_quests SET progress = ? WHERE player_id = ? AND quest_id = ?')
        .run(JSON.stringify(progress), playerId, quest.quest_id);
    }
  }
}
