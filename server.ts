import 'dotenv/config';
import 'express-async-errors'; // forwards async-handler rejections to the error middleware (Express 4 does not)
import path from 'path';
import rateLimit from 'express-rate-limit';
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
import { aiRouter } from './server/routes/ai.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Lightweight request logging (method, path, status, duration). Basic observability so
  // production failures leave a trace. Skipped under tests to keep output clean.
  if (process.env.NODE_ENV !== 'test') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  initDb();

  // Rate limiting (IP-based). Strict window on auth to slow brute force / account spam;
  // a looser global cap protects the AI-trigger and narrative-log endpoints from flooding.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Try again later.' },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Slow down.' },
  });
  app.use('/api', apiLimiter);

  app.use('/api/auth', authLimiter, authRouter);
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
  app.use('/api/ai', authenticate, aiRouter);

  // Vite middleware for development / Static files for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
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
