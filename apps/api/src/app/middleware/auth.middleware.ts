import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userId?: string;
  userRoles?: string[];
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    const user = await User.findById(payload.userId, { roles: 1 });
    req.userRoles = user?.roles ?? [];
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
