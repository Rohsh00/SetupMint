import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../config.js';

let memoryServer: MongoMemoryServer | null = null;

export async function connectDatabase(): Promise<string> {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  if (isTest) {
    memoryServer = await MongoMemoryServer.create({
      instance: { dbName: 'tradevault-test' },
    });
    const uri = memoryServer.getUri();
    await mongoose.connect(uri);
    console.log(`[DB] Connected to test in-memory MongoDB at ${uri}`);
    return uri;
  }

  const localDbPath = path.resolve(process.cwd(), './data/db');
  if (!fs.existsSync(localDbPath)) {
    fs.mkdirSync(localDbPath, { recursive: true });
  }

  // 1. First try connecting to the configured MONGODB_URI (e.g. local mongod daemon or Docker)
  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 2500,
    });
    console.log(`[DB] Connected to MongoDB at ${config.mongodbUri}`);
    return config.mongodbUri;
  } catch (err: any) {
    console.log(
      `[DB] Could not connect to default MongoDB URI (${config.mongodbUri}). Starting embedded local instance with persistent storage...`
    );

    // 2. Fallback: Spin up embedded local MongoDB engine saving data in ./data/db
    try {
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'tradevault',
          dbPath: localDbPath,
          storageEngine: 'wiredTiger',
        },
      });

      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
      console.log(`[DB] Connected to embedded local MongoDB with persistence in ${localDbPath}`);
      return uri;
    } catch (memErr: any) {
      // In case wiredTiger with dbPath fails, spin in-memory with fallback
      console.warn(`[DB] Retrying embedded instance in memory: ${memErr.message}`);
      memoryServer = await MongoMemoryServer.create({
        instance: { dbName: 'tradevault' },
      });
      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
      console.log(`[DB] Connected to embedded MongoDB in-memory at ${uri}`);
      return uri;
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
    console.log('[DB] Disconnected from database.');
  } catch (err: any) {
    console.error('[DB] Error during disconnection:', err.message);
  }
}
