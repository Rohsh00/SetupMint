import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { TradingAccount } from '../src/db/models/TradingAccount.js';

describe('The5ers Prop Firm Summer Plan ($149) API Routes', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register test user
    const testEmail = `prop_trader_${Date.now()}@tradevault.local`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail,
        password: 'Password@123',
        name: 'The5ers Trader',
        baseCurrency: 'USD',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    userId = body.data.user.id;

    const cookies = res.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);
  });

  afterAll(async () => {
    if (userId) {
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('POST /api/v1/accounts creates The5ers Summer Plan ($149) account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'The5ers $100K Summer Challenge',
        broker: 'The5ers (MT5)',
        accountType: 'PROP_FIRM',
        baseCurrency: 'USD',
        initialBalance: 100000,
        propFirmConfig: {
          enabled: true,
          firm: 'THE5ERS',
          planName: 'Summer Plan 10/5 ($149)',
          phase: 'PHASE_1',
          initialBalance: 100000,
          targetProfitPercent: 10,
          dailyLossLimitPercent: 3,
          dailyLossReference: 'MAX_BALANCE_EQUITY_EOD',
          maxLossLimitPercent: 10,
          maxLossType: 'STATIC_FROM_INITIAL',
          maxLossFloor: 90000,
          minTradingDays: 0,
          newsTradingAllowed: true,
          weekendHoldingAllowed: true,
          status: 'ACTIVE',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('The5ers $100K Summer Challenge');
    expect(body.data.accountType).toBe('PROP_FIRM');
    expect(body.data.propFirmConfig.firm).toBe('THE5ERS');
    expect(body.data.propFirmConfig.planName).toBe('Summer Plan 10/5 ($149)');
    accountId = body.data.id;
  });

  it('GET /api/v1/accounts/:id/prop-health returns The5ers risk buffer metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/prop-health`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    const health = body.data;

    expect(health.firm).toBe('THE5ERS');
    expect(health.planName).toBe('Summer Plan 10/5 ($149)');
    expect(health.phase).toBe('PHASE_1');
    expect(health.initialBalance).toBe(100000);
    expect(health.currentBalance).toBe(100000);
    expect(health.targetProfitAmount).toBe(10000); // 10%
    expect(health.targetEquity).toBe(110000);
    expect(health.dailyLossLimitAmount).toBe(3000); // 3%
    expect(health.dailyLossFloor).toBe(97000);
    expect(health.dailyBufferRemaining).toBe(3000);
    expect(health.maxLossFloor).toBe(90000); // Static 10% floor
    expect(health.maxLossBufferRemaining).toBe(10000);
    expect(health.threatLevel).toBe('SAFE');
    expect(health.canAdvancePhase).toBe(false);
  });

  it('POST /api/v1/accounts/:id/prop-advance-phase rejects when target is not reached', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/prop-advance-phase`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PHASE_CRITERIA_NOT_MET');
  });

  it('POST /api/v1/accounts/:id/prop-advance-phase advances to Phase 2 when target reached', async () => {
    // Simulate reaching Phase 1 target: balance = $110,500
    await TradingAccount.findByIdAndUpdate(accountId, {
      currentBalance: mongoose.Types.Decimal128.fromString('110500.00'),
      realizedPnL: mongoose.Types.Decimal128.fromString('10500.00'),
    });

    // Check health now confirms target reached
    const healthRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/prop-health`,
      headers: { cookie: authCookie },
    });
    const healthBody = JSON.parse(healthRes.body);
    expect(healthBody.data.targetReached).toBe(true);
    expect(healthBody.data.canAdvancePhase).toBe(true);

    // Now advance to Phase 2
    const advanceRes = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/prop-advance-phase`,
      headers: { cookie: authCookie },
    });

    expect(advanceRes.statusCode).toBe(200);
    const advanceBody = JSON.parse(advanceRes.body);
    expect(advanceBody.success).toBe(true);
    expect(advanceBody.data.phase).toBe('PHASE_2');
    expect(advanceBody.data.targetProfitPercent).toBe(5); // Phase 2 target is 5%
    expect(advanceBody.data.targetProfitAmount).toBe(5000);
  });
});

