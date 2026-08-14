import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { users, ssoProviders } from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';
import { env } from '../config/env';

// Cost factor matches the one previously hardcoded in the Mongoose User
// model's pre('save') hook — hashing now happens explicitly here instead,
// since Drizzle has no equivalent lifecycle hook. Any code path that writes
// to users.password must go through registerUser/updateUser, not a raw
// db.update(users) call, or it will silently store a plaintext password.
const BCRYPT_COST = 12;

export type UserRecord = typeof users.$inferSelect;

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export async function serializeUser(user: UserRecord) {
  const db = getDb();
  const providers = await db.select().from(ssoProviders).where(eq(ssoProviders.userId, user.id));
  return {
    _id: user.id,
    email: user.email,
    hasPassword: !!user.password,
    ssoProviders: providers.map((p) => ({
      provider: p.provider,
      email: p.email,
      displayName: p.displayName ?? undefined,
    })),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function registerUser(email: string, password: string): Promise<UserRecord> {
  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (existing) {
    const err = new Error('Email already in use') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(password, BCRYPT_COST);
  const [user] = await db.insert(users).values({ email: normalizedEmail, password: hashed }).returning();
  return user;
}

export async function loginUser(email: string, password: string): Promise<UserRecord> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user || !user.password) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return user;
}
