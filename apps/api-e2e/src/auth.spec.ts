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

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';

  pgHandle = await startTestPostgres('api_auth_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  fixturePool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../libs/db-schema/drizzle') });
  await connectDB(pgHandle.connectionString);
  app = createApp();
}, 60000);

afterAll(async () => {
  // Two separate pg pools are open here: this file's own `db` (used for
  // TRUNCATE between tests) and the app's internal pool from connectDB().
  // Both must close before stopping embedded-postgres, or the abrupt
  // shutdown surfaces as an unhandled connection-terminated error.
  await fixturePool?.end();
  await disconnectDB();
  await pgHandle?.stop();
}, 30000);

afterEach(async () => {
  await db.execute(sql`TRUNCATE TABLE users, sso_providers RESTART IDENTITY CASCADE`);
});

describe('POST /api/auth/register', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', confirmPassword: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'test@example.com' });
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', confirmPassword: 'different' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Passwords do not match');
  });

  it('returns 409 when email is already in use', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@example.com', password: 'password123', confirmPassword: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@example.com', password: 'password123', confirmPassword: 'password123' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'password123', confirmPassword: 'password123' });
  });

  it('logs in with valid credentials and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('returns 401 with invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('returns 401 with unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});
