import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { initDb } from './server/db.js';
import { authenticate } from './server/auth.js';
import { authRouter } from './server/routes/auth.js';
import { combatRouter } from './server/routes/combat.js';
import { itemRouter } from './server/routes/items.js';
import { narrativeRouter } from './server/routes/narrative.js';
import { npcRouter } from './server/routes/npc.js';
import { portraitsRouter } from './server/routes/portraits.js';
import { questRouter } from './server/routes/quests.js';
import { stateRouter } from './server/routes/state.js';
import { tradeRouter } from './server/routes/trade.js';
import { travelRouter } from './server/routes/travel.js';
import { worldRouter } from './server/routes/world.js';
import { interactRouter } from './server/routes/interact.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  initDb();

  app.use('/api/auth', authRouter);
  app.use('/api/state', authenticate, stateRouter);
  app.use('/api/narrative', authenticate, narrativeRouter);
  app.use('/api/portraits', authenticate, portraitsRouter);
  app.use('/api/npc', authenticate, npcRouter);
  app.use('/api/trade', authenticate, tradeRouter);
  app.use('/api/item', authenticate, itemRouter);
  app.use('/api/combat', authenticate, combatRouter);
  app.use('/api/quest', authenticate, questRouter);
  app.use('/api/travel', authenticate, travelRouter);
  app.use('/api/world', authenticate, worldRouter);
  app.use('/api/interact', authenticate, interactRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // Centralized error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
