import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { User, TradingAccount, DailyJournal, reconcileDailyJournalIndexes } from '../src/db/models/index.js';
import { buildApp } from '../src/server.js';
import type { FastifyInstance } from 'fastify';

describe('DailyJournal Scoping & Multi-Account Isolation Integration', () => {
  let app: FastifyInstance;
  let testUserId: mongoose.Types.ObjectId;
  let testAccount1Id: mongoose.Types.ObjectId;
  let testAccount2Id: mongoose.Types.ObjectId;
  let cookieHeader: string;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();

    testUserId = new mongoose.Types.ObjectId();
    testAccount1Id = new mongoose.Types.ObjectId();
    testAccount2Id = new mongoose.Types.ObjectId();

    const email = `journal-${Date.now()}@test.local`;
    await User.create({
      _id: testUserId,
      email,
      passwordHash: 'dummyhash123',
      name: 'Journal Test Trader',
      baseCurrency: 'USD',
    });

    await TradingAccount.create([
      {
        _id: testAccount1Id,
        userId: testUserId,
        name: 'Account Alpha',
        broker: 'OTHER',
        accountType: 'EQUITY',
        baseCurrency: 'USD',
        currency: 'USD',
      },
      {
        _id: testAccount2Id,
        userId: testUserId,
        name: 'Account Beta',
        broker: 'OTHER',
        accountType: 'PROP_FIRM',
        baseCurrency: 'USD',
        currency: 'USD',
      },
    ]);

    // Create session to authenticate Fastify requests
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Password123!' },
    });

    // Alternatively, mock session cookie directly
    const sessionToken = await (app as any).createTestSessionToken?.(testUserId) || null;
    cookieHeader = sessionRes.headers['set-cookie']
      ? String(sessionRes.headers['set-cookie'])
      : '';
  });

  afterEach(async () => {
    if (testUserId) {
      await DailyJournal.deleteMany({ userId: testUserId });
      await TradingAccount.deleteMany({ userId: testUserId });
      await User.deleteOne({ _id: testUserId });
    }
    await app.close();
  });

  it('drops legacy index userId_1_date_1 cleanly via reconcileDailyJournalIndexes', async () => {
    await reconcileDailyJournalIndexes();
    const indexes = await DailyJournal.collection.indexes();
    const legacy = indexes.find((idx) => idx.name === 'userId_1_date_1');
    expect(legacy).toBeUndefined();
    const multiScope = indexes.find((idx) => idx.name === 'userId_1_date_1_scopeKey_1');
    expect(multiScope).toBeDefined();
  });

  it('allows distinct reflections for Account 1 and Account 2 on the same date without collision', async () => {
    const testDate = '2026-11-25';

    // Save reflection for Account 1
    const resAcc1 = await DailyJournal.findOneAndUpdate(
      { userId: testUserId, date: testDate, scopeKey: testAccount1Id.toString() },
      {
        $set: {
          marketConditions: 'High volatility trending day',
          marketBias: 'BULLISH',
          disciplineRating: 4,
          lessonsLearned: 'Stuck to execution plan on Alpha.',
          scopeKey: testAccount1Id.toString(),
          accountId: testAccount1Id,
        },
      },
      { upsert: true, new: true }
    );

    // Save reflection for Account 2 (same date, different account)
    const resAcc2 = await DailyJournal.findOneAndUpdate(
      { userId: testUserId, date: testDate, scopeKey: testAccount2Id.toString() },
      {
        $set: {
          marketConditions: 'Rangebound chop',
          marketBias: 'NEUTRAL',
          disciplineRating: 5,
          lessonsLearned: 'Patient sizing on Beta.',
          scopeKey: testAccount2Id.toString(),
          accountId: testAccount2Id,
        },
      },
      { upsert: true, new: true }
    );

    expect(resAcc1.scopeKey).toBe(testAccount1Id.toString());
    expect(resAcc2.scopeKey).toBe(testAccount2Id.toString());
    expect(resAcc1._id.toString()).not.toBe(resAcc2._id.toString());

    // Both must be retrievable
    const docs = await DailyJournal.find({ userId: testUserId, date: testDate });
    expect(docs).toHaveLength(2);
  });

  it('allows clearing bestTradeId and worstTradeId with null without CastError', async () => {
    const testDate = '2026-11-26';

    const initial = await DailyJournal.findOneAndUpdate(
      { userId: testUserId, date: testDate, scopeKey: testAccount1Id.toString() },
      {
        $set: {
          scopeKey: testAccount1Id.toString(),
          accountId: testAccount1Id,
          disciplineRating: 5,
          bestTradeId: new mongoose.Types.ObjectId(),
        },
      },
      { upsert: true, new: true }
    );

    expect(initial.bestTradeId).toBeDefined();

    // Now clear bestTradeId with null
    const updated = await DailyJournal.findOneAndUpdate(
      { userId: testUserId, date: testDate, scopeKey: testAccount1Id.toString() },
      {
        $set: {
          bestTradeId: null,
          worstTradeId: null,
        },
      },
      { new: true }
    );

    expect(updated?.bestTradeId).toBeNull();
    expect(updated?.worstTradeId).toBeNull();
  });

  it('HTTP POST /journal/:date with scope query param updates account-specific journal entry seamlessly', async () => {
    const registerEmail = `journal-http-${Date.now()}@test.local`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: registerEmail,
        password: 'Password@123',
        name: 'HTTP Tester',
        baseCurrency: 'USD',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const cookies = regRes.headers['set-cookie'];
    const regData = JSON.parse(regRes.body);
    const httpUserId = regData.data.user.id;

    // Create an account for this user
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(httpUserId),
      name: 'Elefin USD',
      broker: 'OTHER',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      currency: 'USD',
    });

    const testDate = '2026-11-25';

    // 1. Post daily review targeting ACCOUNT scope
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/v1/journal/${testDate}?scope=ACCOUNT&account=${acc._id}`,
      headers: { cookie: Array.isArray(cookies) ? cookies.join('; ') : String(cookies) },
      payload: {
        marketConditions: 'Strong USD trend',
        marketBias: 'BEARISH',
        disciplineRating: 4,
        lessonsLearned: 'Avoided revenge trading after initial drawdown.',
        mistakes: ['OVERTRADING'],
      },
    });

    expect(postRes.statusCode).toBe(200);
    const postBody = JSON.parse(postRes.body);
    expect(postBody.success).toBe(true);
    expect(postBody.data.scopeKey).toBe(acc._id.toString());

    // 2. Query GET /journal/:date targeting ACCOUNT scope
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/journal/${testDate}?scope=ACCOUNT&account=${acc._id}`,
      headers: { cookie: Array.isArray(cookies) ? cookies.join('; ') : String(cookies) },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.journal).toBeDefined();
    expect(getBody.data.journal.scopeKey).toBe(acc._id.toString());
    expect(getBody.data.journal.disciplineRating).toBe(4);

    // Cleanup ephemeral user
    await DailyJournal.deleteMany({ userId: httpUserId });
    await TradingAccount.deleteMany({ userId: httpUserId });
    await User.deleteOne({ _id: httpUserId });
  });
});
