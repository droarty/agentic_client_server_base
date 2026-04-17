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
    return;
  }

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    if (env.NODE_ENV === 'development') {
      console.warn('MongoDB connection failed, falling back to in-memory server...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      process.env['MONGODB_URI'] = uri;
      await mongoose.connect(uri);
      console.log('MongoDB (in-memory) connected at', uri);
    } else {
      console.error('MongoDB connection error:', err);
      throw err;
    }
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
