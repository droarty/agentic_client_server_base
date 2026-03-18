import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../api/src/app/app';
import { Application } from 'express';

let app: Application;
let mongod: MongoMemoryServer;
let authToken: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['JWT_SECRET'] = 'test-secret';

  await mongoose.connect(mongod.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

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
