import 'dotenv/config';
import * as path from 'path';
import request from 'supertest';
import { Application } from 'express';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDb, type Database } from '@agentic-client-server-base/db-schema';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import { createApp } from '../../api/src/app/app';
import { connectDB, disconnectDB } from '../../api/src/app/db/connect';

let app: Application;
let pgHandle: TestPostgresHandle;
let db: Database;
let fixturePool: Pool;
let authToken: string;

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';

  pgHandle = await startTestPostgres('api_users_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  fixturePool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../libs/db-schema/drizzle') });
  await connectDB(pgHandle.connectionString);
  app = createApp();
}, 60000);

afterAll(async () => {
  await fixturePool?.end();
  await disconnectDB();
  await pgHandle?.stop();
}, 30000);

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE users, sso_providers RESTART IDENTITY CASCADE`);

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'user@example.com', password: 'password123', confirmPassword: 'password123' });

  authToken = res.body.token;
});

describe('GET /api/users', () => {
  it('returns list of users when authenticated', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].email).toBe('user@example.com');
    expect(res.body[0]).not.toHaveProperty('password');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users/me', () => {
  it('returns the authenticated user', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@example.com');
  });
});

describe('PATCH /api/users/me', () => {
  it('updates the user email', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'updated@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('updated@example.com');
  });

  it('updates the password with valid current password', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: 'password123', newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
  });

  it('returns 400 with incorrect current password', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' });

    expect(res.status).toBe(400);
  });
});
