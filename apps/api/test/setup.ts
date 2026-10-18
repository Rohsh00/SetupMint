import { beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setStorageForTests } from '../src/storage/index.js';
import { InMemoryStorage } from './in-memory-storage.js';

let mongod: MongoMemoryServer | null = null;
let testStorage: InMemoryStorage | null = null;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  testStorage = new InMemoryStorage();
  setStorageForTests(testStorage);

  mongod = await MongoMemoryServer.create({
    instance: { dbName: 'tradevault-test' },
  });
  process.env.MONGODB_URI = mongod.getUri();
});

afterAll(async () => {
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  setStorageForTests(null);
});
