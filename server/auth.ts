import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const FALLBACK_SECRET = 'dev-fallback-CHANGE-ME';

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    // Fail fast: never sign tokens with a publicly-known fallback in production.
    throw new Error('FATAL: JWT_SECRET is not set. Refusing to start in production with an insecure fallback secret.');
  }
  console.warn('WARNING: JWT_SECRET not set. Using insecure dev fallback. Set JWT_SECRET in .env before deploying.');
}

export const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_SECRET;

export type AuthenticatedRequest = Request & {
  userId?: number;
};

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload & { userId: number };
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}