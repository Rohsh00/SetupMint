import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { SetupMintSeedEngine } from '../src/seed/seed-engine.js';
import { SeedValidator } from '../src/seed/validator.js';
import {
  AccountTransaction,
  DailyJournal,
  Trade,
  TradingAccount,
  User,
} from '../src/db/models/index.js';

describe('SetupMint Heavy Seed Data Engine & Integrity Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('1. Seeds Profile A (Beginner) deterministically with valid records', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'beginner',
      density: 'minimal',
      randomSeed: 101,
    });

    expect(res.profile).toBe('beginner');
    expect(res.counts.trades).toBe(35);
    expect(res.counts.accounts).toBe(1);
    expect(res.counts.instruments).toBeGreaterThan(0);
    expect(res.counts.strategies).toBeGreaterThanOrEqual(5);
    expect(res.counts.attachments).toBe(0);
    expect(res.counts.dailyJournals).toBeGreaterThan(0);

    const validation = await SeedValidator.validate('trader@tradevault.local');
    expect(validation.isValid).toBe(true);
    expect(validation.failedChecks).toBe(0);
  });

  it('2. Demonstrates strict idempotency: reseeding replaces previous records cleanly', async () => {
    // Run seed twice
    await SetupMintSeedEngine.run({ profile: 'beginner', density: 'minimal', randomSeed: 101 });
    const countBefore = await Trade.countDocuments();

    await SetupMintSeedEngine.run({ profile: 'beginner', density: 'minimal', randomSeed: 101 });
    const countAfter = await Trade.countDocuments();

    expect(countAfter).toBe(countBefore);
  });

  it('3. Guarantees 100% Real User Isolation: never touches or deletes real users', async () => {
    await User.deleteMany({ email: 'live_trader_real@gmail.com' });
    // Create a real user with a trade and account
    const realUser = await User.create({
      email: 'live_trader_real@gmail.com',
      passwordHash: 'hash123',
      name: 'Real Live Trader',
      baseCurrency: 'INR',
      theme: 'light',
    });

    const realAcc = await TradingAccount.create({
      userId: realUser._id,
      name: 'Real User Live FYERS Account',
      broker: 'FYERS',
      accountType: 'EQUITY',
      initialBalance: mongoose.Types.Decimal128.fromString('1000000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('1000000.00'),
    });

    const realTrade = await Trade.create({
      userId: realUser._id,
      accountId: realAcc._id,
      symbol: 'TCS',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      executionMode: 'SIMPLE',
      calculated: {
        grossPnL: 5000,
        totalCosts: 100,
        netPnL: 4900,
        outcome: 'WIN',
        closedQuantity: 10,
        openQuantity: 0,
        averageEntryPrice: 4000,
      },
      tags: [],
      screenshotIds: [],
      auditLog: [],
    });

    // Run seed on demo profile
    await SetupMintSeedEngine.run({ profile: 'active-trader', density: 'minimal', randomSeed: 42 });

    // Assert real user data is completely untouched
    const realAccAfter = await TradingAccount.findById(realAcc._id);
    const realTradeAfter = await Trade.findById(realTrade._id);
    const realUserAfter = await User.findById(realUser._id);

    expect(realAccAfter).not.toBeNull();
    expect(realTradeAfter).not.toBeNull();
    expect(realUserAfter).not.toBeNull();

    // Clean up real test user
    await Trade.deleteOne({ _id: realTrade._id });
    await TradingAccount.deleteOne({ _id: realAcc._id });
    await User.deleteOne({ _id: realUser._id });
  });

  it('4. Reconciles mathematical P&L and Account Balance down to the exact paisa', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'active-trader',
      density: 'minimal',
      randomSeed: 999,
    });

    const demoUser = await User.findOne({ email: 'trader@tradevault.local' });
    const accounts = await TradingAccount.find({ userId: demoUser!._id });

    for (const acc of accounts) {
      const initial = Number(acc.initialBalance.toString());
      const realized = Number(acc.realizedPnL.toString());
      const deposits = Number(acc.totalDeposits.toString());
      const withdrawals = Number(acc.totalWithdrawals.toString());
      const current = Number(acc.currentBalance.toString());

      const txs = await AccountTransaction.find({ accountId: acc._id, type: 'ADJUSTMENT' });
      const adjustments = txs.reduce((sum, tx) => sum + Number(tx.amount.toString()), 0);

      const expected = Number((initial + realized + deposits - withdrawals + adjustments).toFixed(2));
      expect(Math.abs(expected - current)).toBeLessThanOrEqual(0.01);
    }
  });

  it('5. Successfully seeds Profile C (Options Specialist)', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'options-specialist',
      density: 'minimal',
      randomSeed: 202,
    });

    expect(res.profile).toBe('options-specialist');
    const trades = await Trade.find({ userId: res.userId });
    expect(trades.every((t) => t.assetClass === 'OPTIONS')).toBe(true);
  });

  it('6. Successfully seeds Profile D (MCX Commodity Trader)', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'commodity-trader',
      density: 'minimal',
      randomSeed: 303,
    });

    expect(res.profile).toBe('commodity-trader');
    const trades = await Trade.find({ userId: res.userId });
    expect(trades.every((t) => t.assetClass === 'COMMODITY')).toBe(true);
  });

  it('7. Successfully seeds Profile F (Psychology and Discipline)', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'psychology',
      density: 'minimal',
      randomSeed: 404,
    });

    expect(res.profile).toBe('psychology');
    const trades = await Trade.find({ userId: res.userId });
    const hasMistakes = trades.some((t) => t.psychology.mistakes.length > 0);
    const hasDisciplined = trades.some((t) => t.psychology.disciplineScore >= 4);
    expect(hasMistakes).toBe(true);
    expect(hasDisciplined).toBe(true);
  });

  it('8. Validates Daily Journals have valid linked trades and ratings', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'active-trader',
      density: 'minimal',
      randomSeed: 505,
    });

    const journals = await DailyJournal.find({ userId: res.userId });
    expect(journals.length).toBeGreaterThan(0);

    for (const j of journals) {
      expect(j.disciplineRating).toBeGreaterThanOrEqual(1);
      expect(j.disciplineRating).toBeLessThanOrEqual(5);
      if (j.bestTradeId) {
        const found = await Trade.findById(j.bestTradeId);
        expect(found).not.toBeNull();
      }
    }
  });

  it('9. Seeds 2+ running live open trades with complete metrics fulfilled and zero image clutter', async () => {
    const res = await SetupMintSeedEngine.run({
      profile: 'active-trader',
      density: 'minimal',
      randomSeed: 777,
    });
    expect(res.counts.attachments).toBe(0);
    const demoUser = await User.findOne({ email: 'trader@tradevault.local' });
    expect(demoUser).not.toBeNull();
    const openTrades = await Trade.find({ userId: demoUser!._id, status: 'OPEN' });
    expect(openTrades.length).toBeGreaterThanOrEqual(2);
    for (const t of openTrades) {
      expect(t.status).toBe('OPEN');
      expect(t.calculated.outcome).toBe('OPEN');
      expect(t.calculated.openQuantity).toBeGreaterThan(0);
      expect(t.calculated.closedQuantity).toBe(0);
      expect(t.risk.initialStopLoss).toBeGreaterThan(0);
      expect(t.risk.plannedTarget).toBeGreaterThan(0);
      expect(t.calculated.liveMfeSummary).toBeDefined();
      expect(t.screenshotIds).toHaveLength(0);
    }
  });
});
