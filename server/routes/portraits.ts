import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const portraitsRouter = Router();

portraitsRouter.post('/save', (req: any, res: any) => {
  const { index, base64Image } = req.body;

  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ message: 'Invalid portrait index' });
  }

  const publicDir = join(process.cwd(), 'public', 'portraits');

  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  const buffer = Buffer.from(base64Image, 'base64');
  writeFileSync(join(publicDir, `portrait-${index}.png`), buffer);

  res.json({ status: 'ok', url: `/portraits/portrait-${index}.png` });
});