import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { JWT_SECRET } from '../auth.js';
import { db } from '../db.js';

export const authRouter = Router();

// Validate credentials at the boundary: reject empty/oversized/malformed input
// before it reaches bcrypt or SQL. (Previously req.body flowed in unchecked.)
const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(32, 'Username must be at most 32 characters.')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Username may contain letters, numbers, and . _ - only.'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters.')
    .max(200, 'Password must be at most 200 characters.'),
});

authRouter.post('/register', (req: any, res: any) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid username or password.' });
  }
  const { username, password } = parsed.data;

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const info = stmt.run(username, hashedPassword);
    const token = jwt.sign({ userId: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ access_token: token });
  } catch {
    res.status(400).json({ message: 'Username already exists' });
  }
});

authRouter.post('/login', (req: any, res: any) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const { username, password } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ access_token: token });
});
