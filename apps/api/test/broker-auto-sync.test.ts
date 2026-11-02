import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { BrokerIntegration, User, Trade } from '../src/db/models/index.js';
import { BrokerAutoSyncWorker, isIndianMarketOpenNow } from '../src/services/broker-auto-sync.service.js';
import { FyersService } from '../src/services/fyers.service.js';

describe('BrokerAutoSyncWorker Tests', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testIntegration: any;

  beforeAll(async () => {
    await connectDatabase();
    testUserId = new mongoose.Types.ObjectId();

    testIntegration = await BrokerIntegration.create({
      userId: testUserId,
      broker: 'FYERS',
      status: 'CONNECTED',
      appId: 'TEST_APP_ID-100',
      accessToken: 'dummy_token',
      autoSyncEnabled: true,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24h
      syncHistory: [],
    });
  });

  afterAll(async () => {
    BrokerAutoSyncWorker.stop();
    await BrokerIntegration.deleteMany({ userId: testUserId });
    await Trade.deleteMany({ userId: testUserId });
    await disconnectDatabase();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly reports Indian market hours status', () => {
    const isOpen = isIndianMarketOpenNow();
    expect(typeof isOpen).toBe('boolean');
  });

  it('starts and stops background auto-sync worker without errors', () => {
    BrokerAutoSyncWorker.start(5000);
    // Calling start again should be idempotent
    BrokerAutoSyncWorker.start(5000);
    BrokerAutoSyncWorker.stop();
  });

  it('syncs trades for connected users with autoSyncEnabled=true in runCycle', async () => {
    let syncedUser: string | null = null;
    vi.spyOn(FyersService, 'syncTradesForUser').mockImplementation(async (uId: any) => {
      syncedUser = uId.toString();
      return {
        syncedTradesCount: 1,
        duplicateTradesCount: 0,
        totalExecutions: 2,
        accountId: 'acc_123',
        accountName: 'FYERS Account',
        lastSyncAt: new Date(),
      };
    });

    // Create open trade so off-market checks also proceed
    await Trade.create({
      userId: testUserId,
      accountId: new mongoose.Types.ObjectId(),
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      symbol: 'NSE:TCS-EQ',
      assetClass: 'EQUITY',
      direction: 'LONG',
      tradeDate: '2026-11-02',
      entryTime: new Date(),
      quantity: 10,
      status: 'OPEN',
      simpleExecution: { entryPrice: 3800, quantity: 10 },
      screenshotIds: [],
      auditLog: [],
    });

    await BrokerAutoSyncWorker.runCycle();

    expect(syncedUser).toBe(testUserId.toString());
  });

  it('skips auto-sync when autoSyncEnabled is false', async () => {
    let syncCalled = false;
    vi.spyOn(FyersService, 'syncTradesForUser').mockImplementation(async () => {
      syncCalled = true;
      return {} as any;
    });

    await BrokerIntegration.updateOne({ _id: testIntegration._id }, { autoSyncEnabled: false });

    await BrokerAutoSyncWorker.runCycle();
    expect(syncCalled).toBe(false);

    // Re-enable for subsequent tests
    await BrokerIntegration.updateOne({ _id: testIntegration._id }, { autoSyncEnabled: true });
  });

  it('triggers immediate sync on demand and throttles rapid duplicates', async () => {
    let callCount = 0;
    vi.spyOn(FyersService, 'syncTradesForUser').mockImplementation(async () => {
      callCount++;
      return {
        syncedTradesCount: 0,
        duplicateTradesCount: 0,
        totalExecutions: 0,
        accountId: 'acc_123',
        accountName: 'FYERS Account',
        lastSyncAt: new Date(),
      };
    });

    // 1st immediate trigger should fire
    await BrokerAutoSyncWorker.triggerImmediateSync(testUserId.toString());
    expect(callCount).toBe(1);

    // 2nd trigger within 4s window should be throttled
    await BrokerAutoSyncWorker.triggerImmediateSync(testUserId.toString());
    expect(callCount).toBe(1);
  });
});
