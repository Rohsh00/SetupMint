import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { TradingAccount } from '../src/db/models/TradingAccount.js';
import { Trade } from '../src/db/models/Trade.js';
import { AccountScopeService } from '../src/services/account-scope.service.js';

describe('Account Scope & Prop Firm Rule Engine API Integration Tests', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;

  let userAPropAccount1: any;
  let userAPropAccount2: any;
  let userAPersonalAccount: any;
  let userBPropAccount: any;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `scope_user_a_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Scope User A',
        baseCurrency: 'USD',
      },
    });
    expect(resA.statusCode).toBe(201);
    const bodyA = JSON.parse(resA.body);
    userAId = bodyA.data.user.id;
    const cookiesA = resA.headers['set-cookie'];
    userACookie = Array.isArray(cookiesA) ? cookiesA[0] : (cookiesA as string);

    // Register User B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `scope_user_b_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Scope User B',
        baseCurrency: 'USD',
      },
    });
    expect(resB.statusCode).toBe(201);
    const bodyB = JSON.parse(resB.body);
    userBId = bodyB.data.user.id;
    const cookiesB = resB.headers['set-cookie'];
    userBCookie = Array.isArray(cookiesB) ? cookiesB[0] : (cookiesB as string);

    // Create User A Prop Account 1 (The5ers)
    const acc1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userACookie },
      payload: {
        name: 'User A The5ers $100K',
        broker: 'The5ers',
        accountType: 'PROP_FIRM',
        baseCurrency: 'USD',
        initialBalance: 100000,
        propFirm: {
          firmKey: 'THE5ERS',
          planKey: 'THE5ERS_SUMMER',
          phase: 'PHASE_1',
          startingBalance: 100000,
          status: 'ACTIVE',
        },
        propFirmConfig: {
          enabled: true,
          firm: 'THE5ERS',
          planName: 'Summer Plan 10/5',
          phase: 'PHASE_1',
          initialBalance: 100000,
          targetProfitPercent: 10,
          dailyLossLimitPercent: 3,
          dailyLossReference: 'STARTING_BALANCE',
          maxLossLimitPercent: 10,
          maxLossType: 'STATIC_FROM_INITIAL',
          maxLossFloor: 90000,
        },
      },
    });
    expect(acc1Res.statusCode).toBe(201);
    userAPropAccount1 = JSON.parse(acc1Res.body).data;

    // Create User A Prop Account 2 (FTMO)
    const acc2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userACookie },
      payload: {
        name: 'User A FTMO $100K',
        broker: 'FTMO',
        accountType: 'PROP_FIRM',
        baseCurrency: 'USD',
        initialBalance: 100000,
        propFirm: {
          firmKey: 'FTMO',
          planKey: 'FTMO_STANDARD_100K',
          phase: 'PHASE_1',
          startingBalance: 100000,
          status: 'ACTIVE',
        },
        propFirmConfig: {
          enabled: true,
          firm: 'FTMO',
          planName: 'FTMO Standard 10/5',
          phase: 'PHASE_1',
          initialBalance: 100000,
          targetProfitPercent: 10,
          dailyLossLimitPercent: 5,
          dailyLossReference: 'STARTING_BALANCE',
          maxLossLimitPercent: 10,
          maxLossType: 'STATIC_FROM_INITIAL',
          maxLossFloor: 90000,
        },
      },
    });
    expect(acc2Res.statusCode).toBe(201);
    userAPropAccount2 = JSON.parse(acc2Res.body).data;

    // Create User A Personal Account (Equity)
    const acc3Res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userACookie },
      payload: {
        name: 'User A Personal Zerodha',
        broker: 'Zerodha',
        accountType: 'EQUITY',
        baseCurrency: 'USD',
        initialBalance: 50000,
      },
    });
    expect(acc3Res.statusCode).toBe(201);
    userAPersonalAccount = JSON.parse(acc3Res.body).data;

    // Create User B Prop Account
    const accBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userBCookie },
      payload: {
        name: 'User B Prop Account',
        broker: 'The5ers',
        accountType: 'PROP_FIRM',
        baseCurrency: 'USD',
        initialBalance: 100000,
        propFirm: {
          firmKey: 'THE5ERS',
          planKey: 'THE5ERS_SUMMER',
          phase: 'PHASE_1',
          startingBalance: 100000,
          status: 'ACTIVE',
        },
      },
    });
    expect(accBRes.statusCode).toBe(201);
    userBPropAccount = JSON.parse(accBRes.body).data;

    // Seed sample trades
    // User A Prop Trade 1
    await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(userAPropAccount1.id),
      symbol: 'EURUSD',
      assetClass: 'FOREX',
      exchange: 'GLOBAL',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'LONG',
      entryPrice: 1.085,
      exitPrice: 1.095,
      quantity: 10,
      status: 'CLOSED',
      tradeDate: new Date('2026-05-01T10:00:00Z'),
      entryTime: new Date('2026-05-01T10:00:00Z'),
      exitTime: new Date('2026-05-01T12:00:00Z'),
      calculated: {
        grossPnL: 1000,
        netPnL: 990,
        commission: 10,
        returnPercent: 0.99,
        outcome: 'WIN',
      },
    });

    // User A Prop Trade 2 (FTMO)
    await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(userAPropAccount2.id),
      symbol: 'GBPUSD',
      assetClass: 'FOREX',
      exchange: 'GLOBAL',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'SHORT',
      entryPrice: 1.25,
      exitPrice: 1.255,
      quantity: 10,
      status: 'CLOSED',
      tradeDate: new Date('2026-05-02T10:00:00Z'),
      entryTime: new Date('2026-05-02T10:00:00Z'),
      exitTime: new Date('2026-05-02T11:00:00Z'),
      calculated: {
        grossPnL: -500,
        netPnL: -510,
        commission: 10,
        returnPercent: -0.51,
        outcome: 'LOSS',
      },
    });

    // User A Personal Trade (Zerodha)
    await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(userAPersonalAccount.id),
      symbol: 'RELIANCE',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'USD',
      direction: 'LONG',
      entryPrice: 2500,
      exitPrice: 2600,
      quantity: 20,
      status: 'CLOSED',
      tradeDate: new Date('2026-05-03T10:00:00Z'),
      entryTime: new Date('2026-05-03T10:00:00Z'),
      exitTime: new Date('2026-05-03T14:00:00Z'),
      calculated: {
        grossPnL: 2000,
        netPnL: 1950,
        commission: 50,
        returnPercent: 3.9,
        outcome: 'WIN',
      },
    });

    // User B Prop Trade
    await Trade.create({
      userId: new mongoose.Types.ObjectId(userBId),
      accountId: new mongoose.Types.ObjectId(userBPropAccount.id),
      symbol: 'XAUUSD',
      assetClass: 'COMMODITY',
      exchange: 'GLOBAL',
      marketSegment: 'OTHER',
      currency: 'USD',
      direction: 'LONG',
      entryPrice: 2300,
      exitPrice: 2350,
      quantity: 5,
      status: 'CLOSED',
      tradeDate: new Date('2026-05-01T10:00:00Z'),
      entryTime: new Date('2026-05-01T10:00:00Z'),
      exitTime: new Date('2026-05-01T15:00:00Z'),
      calculated: {
        grossPnL: 2500,
        netPnL: 2480,
        commission: 20,
        returnPercent: 2.48,
        outcome: 'WIN',
      },
    });
  });

  afterAll(async () => {
    if (userAId) {
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
    }
    if (userBId) {
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  describe('AccountScopeService Tenant Isolation & Resolver Invariants', () => {
    it('Tenant Isolation: User A cannot resolve User B accountId even if passed explicitly', async () => {
      const resolved = await AccountScopeService.resolveAccountScope(userAId, {
        mode: 'ACCOUNT',
        accountId: userBPropAccount.id,
      });

      expect(resolved).toEqual([]);
    });

    it('Resolves scope=PROP_FIRM strictly to User A prop accounts only', async () => {
      const resolved = await AccountScopeService.resolveAccountScope(userAId, {
        mode: 'PROP_FIRM',
      });

      const ids = resolved.map((id) => id.toString());
      expect(ids).toContain(userAPropAccount1.id);
      expect(ids).toContain(userAPropAccount2.id);
      expect(ids).not.toContain(userAPersonalAccount.id);
      expect(ids).not.toContain(userBPropAccount.id);
    });

    it('Resolves scope=PROP_FIRM with firmKey=THE5ERS strictly to The5ers accounts', async () => {
      const resolved = await AccountScopeService.resolveAccountScope(userAId, {
        mode: 'PROP_FIRM',
        firmKey: 'THE5ERS',
      });

      const ids = resolved.map((id) => id.toString());
      expect(ids).toContain(userAPropAccount1.id);
      expect(ids).not.toContain(userAPropAccount2.id);
      expect(ids).not.toContain(userAPersonalAccount.id);
    });

    it('Excludes archived accounts unless explicitly requested', async () => {
      // Archive User A Prop Account 2
      await TradingAccount.findByIdAndUpdate(userAPropAccount2.id, { status: 'ARCHIVED' });

      const resolvedWithoutArchived = await AccountScopeService.resolveAccountScope(userAId, {
        mode: 'PROP_FIRM',
      });
      const idsWithout = resolvedWithoutArchived.map((id) => id.toString());
      expect(idsWithout).toContain(userAPropAccount1.id);
      expect(idsWithout).not.toContain(userAPropAccount2.id);

      const resolvedWithArchived = await AccountScopeService.resolveAccountScope(userAId, {
        mode: 'PROP_FIRM',
        includeArchived: true,
      });
      const idsWith = resolvedWithArchived.map((id) => id.toString());
      expect(idsWith).toContain(userAPropAccount1.id);
      expect(idsWith).toContain(userAPropAccount2.id);

      // Unarchive
      await TradingAccount.findByIdAndUpdate(userAPropAccount2.id, { status: 'ACTIVE' });
    });
  });

  describe('Scoped Endpoints Behavior', () => {
    it('GET /api/v1/trades?scope=PROP_FIRM returns only prop trades for User A', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades?scope=PROP_FIRM',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const trades = body.data;
      expect(trades.length).toBe(2);

      const symbols = trades.map((t: any) => t.symbol);
      expect(symbols).toContain('EURUSD');
      expect(symbols).toContain('GBPUSD');
      expect(symbols).not.toContain('RELIANCE'); // Personal trade excluded
      expect(symbols).not.toContain('XAUUSD'); // User B trade excluded
    });

    it('GET /api/v1/trades?scope=PROP_FIRM&firmKey=THE5ERS returns only The5ers trades', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const trades = body.data;
      expect(trades.length).toBe(1);
      expect(trades[0].symbol).toBe('EURUSD');
    });

    it('GET /api/v1/dashboard/stats?scope=PROP_FIRM reconciles KPI aggregates with prop trades', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?scope=PROP_FIRM',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const stats = body.data;
      // User A prop trades: EURUSD netPnL = 990, GBPUSD netPnL = -510 -> Total = 480
      expect(stats.closedTradesCount).toBe(2);
      expect(stats.netPnL).toBe(480);
      expect(stats.winningTradesCount).toBe(1);
      expect(stats.losingTradesCount).toBe(1);
      expect(stats.winRate).toBe(50);
    });

    it('POST /api/v1/trades/drilldown preserves scope parity with dashboard aggregates', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userACookie },
        payload: {
          descriptor: {
            kind: 'FILTER',
            label: 'All Prop Trades',
            filter: {
              scope: 'PROP_FIRM',
            },
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.aggregate.count).toBe(2);
      expect(body.data.aggregate.netPnL).toBe(480);
      expect(body.data.trades.length).toBe(2);
    });

    it('GET /api/v1/dashboard/equity-curves?scope=PROP_FIRM provides propReferenceLines', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.propReferenceLines).toBeDefined();
      expect(body.data.propReferenceLines.profitTarget).toBe(110000);
      expect(body.data.propReferenceLines.maxLossFloor).toBe(90000);
    });

    it('GET /api/v1/accounts/prop-presets returns registry presets with metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/prop-presets',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(7);

      const the5ers = body.data.find((p: any) => p.planKey === 'SUMMER_100K');
      expect(the5ers).toBeDefined();
      expect(the5ers.displayName).toBe('The5ers Summer Plan 10/5 ($149)');
      expect(the5ers.rulesVerifiedAt).toBeDefined();
      expect(the5ers.sourceUrl).toBeDefined();
    });

    it('GET /api/v1/accounts/prop-overview returns user prop accounts health summary', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/prop-overview',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);

      const item1 = body.data.find((a: any) => a.account.id === userAPropAccount1.id);
      expect(item1).toBeDefined();
      expect(item1.account.name).toBe('User A The5ers $100K');
      expect(item1.health.firm).toBe('THE5ERS');
      expect(item1.health.phase).toBe('PHASE_1');
      expect(item1.health.threatLevel).toBe('SAFE');
      expect(item1.health.dailyBufferRemaining).toBeDefined();
      expect(item1.health.maxLossBufferRemaining).toBeDefined();
    });
  });

  describe('Sticky Permanent Breach Invariant', () => {
    it('Sticky breach marks status FAILED and does not recover on subsequent positive P&L', async () => {
      // Create a large loss on User A Prop Account 1 that breaches max loss floor (floor is 90,000)
      // Account initial balance is 100,000; simulate current balance dropped to 85,000
      await TradingAccount.findByIdAndUpdate(userAPropAccount1.id, {
        currentBalance: mongoose.Types.Decimal128.fromString('85000.00'),
      });

      // Query prop health -> should detect breach and persist sticky FAILED status
      const breachHealthRes = await app.inject({
        method: 'GET',
        url: `/api/v1/accounts/${userAPropAccount1.id}/prop-health`,
        headers: { cookie: userACookie },
      });

      expect(breachHealthRes.statusCode).toBe(200);
      const breachBody = JSON.parse(breachHealthRes.body);
      expect(breachBody.data.status).toBe('FAILED');
      expect(breachBody.data.threatLevel).toBe('BREACHED');
      expect(['dailyLoss', 'maxLoss']).toContain(breachBody.data.breachedRule);

      // Verify sticky breach in database
      const dbAcc = await TradingAccount.findById(userAPropAccount1.id);
      expect(dbAcc?.propFirm?.status).toBe('FAILED');
      expect(dbAcc?.propFirm?.breachedAt).toBeDefined();

      // Now simulate a massive win bringing balance back to $105,000
      await TradingAccount.findByIdAndUpdate(userAPropAccount1.id, {
        currentBalance: mongoose.Types.Decimal128.fromString('105000.00'),
      });

      // Re-query prop health -> MUST remain FAILED (never silently recovered)
      const afterHealthRes = await app.inject({
        method: 'GET',
        url: `/api/v1/accounts/${userAPropAccount1.id}/prop-health`,
        headers: { cookie: userACookie },
      });

      expect(afterHealthRes.statusCode).toBe(200);
      const afterBody = JSON.parse(afterHealthRes.body);
      expect(afterBody.data.status).toBe('FAILED');
      expect(afterBody.data.threatLevel).toBe('BREACHED');
      expect(['dailyLoss', 'maxLoss']).toContain(afterBody.data.breachedRule);
    });
  });
});
