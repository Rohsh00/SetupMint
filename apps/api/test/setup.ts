import { beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as dbModels from '../src/db/models/index.js';
import { setStorageForTests } from '../src/storage/index.js';
import { InMemoryStorage } from './in-memory-storage.js';

let mongod: MongoMemoryReplSet | null = null;
let testStorage: InMemoryStorage | null = null;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  testStorage = new InMemoryStorage();
  setStorageForTests(testStorage);

  mongod = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      dbName: 'tradevault-test',
      storageEngine: 'wiredTiger',
      args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=500'],
    },
  });
  process.env.MONGODB_URI = mongod.getUri();

  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(
    Object.values(dbModels)
      .filter((model: any) => typeof model?.init === 'function')
      .map((model: any) => model.init())
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop({ doCleanup: true, force: true });
    mongod = null;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  setStorageForTests(null);
});
