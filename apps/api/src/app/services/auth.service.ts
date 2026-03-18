import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/user.model';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export async function registerUser(email: string, password: string): Promise<IUser> {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already in use') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const user = new User({ email, password });
  await user.save();
  return user;
}

export async function loginUser(email: string, password: string): Promise<IUser> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return user;
}
