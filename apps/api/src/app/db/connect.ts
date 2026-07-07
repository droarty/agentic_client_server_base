import mongoose from 'mongoose';
import { env } from '../config/env';

export async function connectDB(): Promise<void> {
  // Use in-memory MongoDB when MONGODB_URI is set to 'memory' or when in dev and connection fails
  if (env.MONGODB_URI === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env['MONGODB_URI'] = uri;
    await mongoose.connect(uri);
    console.log('MongoDB (in-memory) connected at', uri);
    await syncIndexes();
    return;
  }

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
    await syncIndexes();
  } catch (err) {
    if (env.NODE_ENV === 'development') {
      console.warn('MongoDB connection failed, falling back to in-memory server...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      process.env['MONGODB_URI'] = uri;
      await mongoose.connect(uri);
      console.log('MongoDB (in-memory) connected at', uri);
      await syncIndexes();
    } else {
      console.error('MongoDB connection error:', err);
      throw err;
    }
  }
}

// Reconciles every registered model's indexes with what's actually in MongoDB — creates
// missing ones and drops indexes no longer declared in the schema. Without this, changing an
// index definition (e.g. renaming/adding a compound-index field) leaves the old index behind
// forever, since Mongoose's default autoIndex only ever adds, never removes (see #225).
async function syncIndexes(): Promise<void> {
  for (const model of Object.values(mongoose.connection.models)) {
    await model.syncIndexes();
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
