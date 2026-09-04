import bcrypt from 'bcryptjs';
import { eq, ne, and, desc } from 'drizzle-orm';
import { users, globalAdmins } from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';
import { serializeUser, type UserRecord } from './auth.service';

const BCRYPT_COST = 12;

// Shaped through serializeUser (rather than a raw column-projection query)
// so the list endpoint's over-the-wire shape matches getMe/updateMe exactly —
// password never leaves this function either way.
export async function getAllUsers() {
  const db = getDb();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return Promise.all(rows.map(serializeUser));
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

// Deliberately not folded into serializeUser (which login/register/getMe/
// updateMe all funnel through) — that would run this check on every single
// authentication, when in practice only a couple of call sites (this status
// check, the global-admin-dashboard's own server-side handlers) ever need
// it.
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select().from(globalAdmins).where(eq(globalAdmins.userId, userId));
  return rows.length > 0;
}

export async function updateUser(
  id: string,
  updates: { email?: string; currentPassword?: string; newPassword?: string }
): Promise<UserRecord> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const setValues: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (updates.email) {
    const normalizedEmail = updates.email.toLowerCase().trim();
    const [existing] = await db.select().from(users).where(and(eq(users.email, normalizedEmail), ne(users.id, id)));
    if (existing) {
      const err = new Error('Email already in use') as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }
    setValues.email = normalizedEmail;
  }

  if (updates.newPassword) {
    if (!updates.currentPassword) {
      const err = new Error('Current password is required') as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
    const isValid = !!user.password && (await bcrypt.compare(updates.currentPassword, user.password));
    if (!isValid) {
      const err = new Error('Current password is incorrect') as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
    setValues.password = await bcrypt.hash(updates.newPassword, BCRYPT_COST);
  }

  const [updated] = await db.update(users).set(setValues).where(eq(users.id, id)).returning();
  return updated;
}
