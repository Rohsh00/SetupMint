import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  AccountTransaction,
  BrokerImportMapping,
  BrokerIntegration,
  TradingAccount,
} from '../src/db/models/index.js';
import { runBackfill } from '../src/scripts/backfill-account-transactions.js';
import { decryptSecret, isEncryptedSecret } from '../src/services/crypto.service.js';

describe('Account & broker data backfill', () => {
  const userId = new mongoose.Types.ObjectId();
  let accountId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectDatabase();

    const account = await TradingAccount.create({
      userId,
      name: 'Backfill Account',
      broker: 'FYERS',
      accountType: 'EQUITY',
      baseCurrency: 'INR',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      status: 'ACTIVE',
    });
    accountId = account._id as mongoose.Types.ObjectId;

    await AccountTransaction.collection.insertOne({
      userId,
      accountId,
      type: 'DEPOSIT',
      amount: mongoose.Types.Decimal128.fromString('500.00'),
      currency: 'INR',
      date: new Date('2026-10-20T10:00:00.000Z'),
      notes: 'Legacy deposit',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await BrokerImportMapping.collection.insertOne({
      userId,
      broker: 'FYERS',
      name: 'Legacy FYERS mapping',
      mapping: { date: 'Date', credit: 'Credit', debit: 'Debit' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await BrokerIntegration.create({
      userId,
      broker: 'FYERS',
      status: 'IDLE',
      appId: 'LEGACY-APP-100',
      secretKey: 'legacy-plaintext-secret',
      accessToken: 'legacy-plaintext-token',
    });

    await BrokerImportMapping.collection.dropIndex('userId_1_broker_1_importKind_1');
    await BrokerImportMapping.collection.createIndex(
      { userId: 1, broker: 1 },
      { name: 'userId_1_broker_1' }
    );
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('reports the legacy state without writing during a dry run', async () => {
    const result = await runBackfill({ isLive: false, skipConnect: true });

    expect(result).toMatchObject({
      mode: 'DRY_RUN',
      legacyIndexDropped: true,
      mappingsBackfilled: 1,
      transactionsBackfilled: 1,
      brokerSecretsEncrypted: 1,
      accountsRecalculated: 1,
    });

    const mapping = await BrokerImportMapping.collection.findOne({ userId });
    expect(mapping?.importKind).toBeUndefined();
    const tx = await AccountTransaction.collection.findOne({ userId });
    expect(tx?.status).toBeUndefined();
    expect(tx?.source).toBeUndefined();
  });

  it('applies index, data, encryption, and balance backfills in live mode', async () => {
    const result = await runBackfill({ isLive: true, skipConnect: true });
    expect(result.mode).toBe('LIVE');

    const mapping = await BrokerImportMapping.collection.findOne({ userId });
    expect(mapping?.importKind).toBe('TRADES');
    const indexes = await BrokerImportMapping.collection.indexes();
    expect(indexes.some((index) => index.name === 'userId_1_broker_1')).toBe(false);
    expect(
      indexes.some(
        (index) =>
          JSON.stringify(index.key) ===
          JSON.stringify({ userId: 1, broker: 1, importKind: 1 })
      )
    ).toBe(true);

    const tx = await AccountTransaction.collection.findOne({ userId });
    expect(tx?.status).toBe('CONFIRMED');
    expect(tx?.source).toBe('MANUAL');

    const integration = await BrokerIntegration.findOne({ userId, broker: 'FYERS' });
    expect(isEncryptedSecret(integration?.secretKey)).toBe(true);
    expect(isEncryptedSecret(integration?.accessToken)).toBe(true);
    expect(decryptSecret(integration?.secretKey)).toBe('legacy-plaintext-secret');
    expect(decryptSecret(integration?.accessToken)).toBe('legacy-plaintext-token');

    const account = await TradingAccount.findById(accountId);
    expect(Number(account?.totalDeposits.toString())).toBe(500);
    expect(Number(account?.currentBalance.toString())).toBe(100500);
  });
});
