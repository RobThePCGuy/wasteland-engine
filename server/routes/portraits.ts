import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const portraitsRouter = Router();

// NOTE: This endpoint is currently not called by any client code (kept for the
// character-portrait save flow). It is now behind `authenticate` (see server.ts).
portraitsRouter.post('/save', (req: any, res: any) => {
  const { index, base64Image } = req.body;

  // `index` is a small portrait slot. Coerce to a bounded non-negative integer and
  // reject anything else — this is what previously allowed path injection via the filename.
  const slot = Number(index);
  if (!Number.isInteger(slot) || slot < 0 || slot > 99) {
    return res.status(400).json({ message: 'Invalid portrait index.' });
  }

  if (typeof base64Image !== 'string' || base64Image.length === 0 || base64Image.length > 2_000_000) {
    return res.status(400).json({ message: 'Invalid image data.' });
  }

  // Scope writes per authenticated user so one user cannot overwrite another's portraits,
  // and confirm the resolved directory stays inside the portraits base dir (defense in depth).
  const baseDir = resolve(process.cwd(), 'public', 'portraits');
  const userDir = resolve(baseDir, String(req.userId));
  if (userDir !== baseDir && !userDir.startsWith(baseDir + sep)) {
    return res.status(400).json({ message: 'Invalid path.' });
  }

  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }

  const buffer = Buffer.from(base64Image, 'base64');
  const fileName = `portrait-${slot}.png`;
  writeFileSync(join(userDir, fileName), buffer);

  res.json({ status: 'ok', url: `/portraits/${req.userId}/${fileName}` });
});
