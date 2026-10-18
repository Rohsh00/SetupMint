import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../config.js';

let memoryServer: MongoMemoryServer | null = null;
let startedMemoryServerHere = false;

const dataDir = process.cwd().endsWith('apps/api')
  ? path.resolve(process.cwd(), './data')
  : path.resolve(process.cwd(), './apps/api/data');
const localDbPath = path.resolve(dataDir, 'db');
const uriFilePath = path.resolve(dataDir, 'current_uri.txt');

export async function connectDatabase(): Promise<string> {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  if (isTest) {
    memoryServer = await MongoMemoryServer.create({
      instance: { dbName: 'tradevault-test' },
    });
    const uri = memoryServer.getUri();
    await mongoose.connect(uri);
    return uri;
  }

  if (!fs.existsSync(localDbPath)) {
    fs.mkdirSync(localDbPath, { recursive: true });
  }

  // 1. Try configured MONGODB_URI (e.g. Docker or local standard 27017)
  try {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 1500,
    });
    console.log(`[DB] Connected to MongoDB at ${config.mongodbUri}`);
    return config.mongodbUri;
  } catch {
    // Continue to check active URI file
  }

  // 2. Check if active URI file exists and is reachable
  if (fs.existsSync(uriFilePath)) {
    try {
      const recordedUri = fs.readFileSync(uriFilePath, 'utf-8').trim();
      if (recordedUri) {
        await mongoose.connect(recordedUri, {
          serverSelectionTimeoutMS: 1500,
        });
        console.log(`[DB] Connected to active MongoDB instance at ${recordedUri}`);
        return recordedUri;
      }
    } catch {
      // File has stale URI, will discover or spawn new
    }
  }

  // 3. Check if a mongod instance is already running on localDbPath via process inspection
  try {
    const psOutput = execSync('ps aux | grep mongod', { encoding: 'utf-8' });
    const match = psOutput.match(/--port\s+(\d+)\s+.*apps\/api\/data\/db/);
    if (match && match[1]) {
      const discoveredPort = match[1];
      const discoveredUri = `mongodb://127.0.0.1:${discoveredPort}/tradevault`;
      try {
        await mongoose.connect(discoveredUri, {
          serverSelectionTimeoutMS: 1500,
        });
        console.log(`[DB] Connected to detected mongod process on port ${discoveredPort}`);
        fs.writeFileSync(uriFilePath, discoveredUri, 'utf-8');
        return discoveredUri;
      } catch {}
    }
  } catch {}

  // 4. If lock file has content, another process holds the DB lock. Do not spawn with dbPath to avoid crashes.
  const lockFilePath = path.resolve(localDbPath, 'mongod.lock');
  const isLocked = fs.existsSync(lockFilePath) && fs.statSync(lockFilePath).size > 0;

  if (!isLocked) {
    try {
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'tradevault',
          dbPath: localDbPath,
          storageEngine: 'wiredTiger',
        },
      });

      const uri = memoryServer.getUri();
      startedMemoryServerHere = true;
      fs.writeFileSync(uriFilePath, uri, 'utf-8');

      await mongoose.connect(uri);
      console.log(`[DB] Connected to embedded local MongoDB with persistence in ${localDbPath}`);
      return uri;
    } catch (memErr: any) {
      console.warn(`[DB] Persistent embedded instance failed: ${memErr.message}`);
    }
  }

  // 5. Fallback: Pure in-memory instance
  console.log(`[DB] Starting embedded instance in memory...`);
  memoryServer = await MongoMemoryServer.create({
    instance: { dbName: 'tradevault' },
  });
  const uri = memoryServer.getUri();
  startedMemoryServerHere = true;
  await mongoose.connect(uri);
  console.log(`[DB] Connected to embedded MongoDB in-memory at ${uri}`);
  return uri;
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    if (memoryServer && startedMemoryServerHere) {
      if (fs.existsSync(uriFilePath)) {
        try {
          fs.unlinkSync(uriFilePath);
        } catch {}
      }
      await memoryServer.stop();
      memoryServer = null;
      startedMemoryServerHere = false;
    }
    console.log('[DB] Disconnected from database.');
  } catch (err: any) {
    console.error('[DB] Error during disconnection:', err.message);
  }
}
