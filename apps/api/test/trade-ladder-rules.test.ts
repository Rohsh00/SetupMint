import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade } from '../src/db/models/index.js';

describe('Trade Custom Ladder Rules API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let tradeId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `ladder-user-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Ladder Tester A',
      },
    });
    authCookie = regRes.cookies.find((c) => c.name === 'tv_session')?.value || '';
    userId = JSON.parse(regRes.body).data.user.id;

    // Create Account for User A
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: `tv_session=${authCookie}` },
      payload: {
        name: 'Ladder Account',
        broker: 'FYERS',
        accountType: 'EQUITY',
        initialBalance: 100000,
        currency: 'INR',
      },
    });
    accountId = JSON.parse(accRes.body).data.id;

    // Register User B
    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `ladder-user-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Ladder Tester B',
      },
    });
    userBAuthCookie = regB.cookies.find((c) => c.name === 'tv_session')?.value || '';

    // Create Trade for User A
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: `tv_session=${authCookie}` },
      payload: {
        accountId,
        symbol: 'NSE:INFY-EQ',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        direction: 'LONG',
        status: 'OPEN',
        tradeDate: '2026-11-03',
        entryTime: '2026-11-03T09:15:00.000Z',
        executionMode: 'SIMPLE',
        lotSize: 1,
        simpleExecution: {
          entryPrice: 1500,
          quantity: 100,
        },
        risk: {
          plannedEntryPrice: 1500,
          initialStopLoss: 1470,
          currentStopLoss: 1470,
        },
      },
    });
    expect(tradeRes.statusCode).toBe(201);
    tradeId = JSON.parse(tradeRes.body).data.id;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    await disconnectDatabase();
  });

  it('GET /api/v1/trades/:id/ladder-rules returns null initially when no custom rules set', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeId}/ladder-rules`,
      headers: { cookie: `tv_session=${authCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('PUT /api/v1/trades/:id/ladder-rules updates custom rules and logs audit entry', async () => {
    const customRules = {
      targetMode: 'T1_ONLY',
      autoExecuteEnabled: true,
      t1: {
        targetR: 1.5,
        exitRatio: 1.0,
        trailAction: 'NOMINAL_BE',
      },
      dynamicTrailing: {
        enabled: true,
        triggerR: 2.0,
        trailType: 'STEP_R',
        trailStepR: 0.5,
      },
      givebackAutoExit: {
        enabled: true,
        minPeakR: 1.2,
        maxGivebackPercent: 25,
      },
    };

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${tradeId}/ladder-rules`,
      headers: { cookie: `tv_session=${authCookie}` },
      payload: customRules,
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.success).toBe(true);
    expect(putBody.data.targetMode).toBe('T1_ONLY');
    expect(putBody.data.autoExecuteEnabled).toBe(true);
    expect(putBody.data.t1.targetR).toBe(1.5);
    expect(putBody.data.givebackAutoExit.maxGivebackPercent).toBe(25);

    // Verify GET returns the saved rules
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeId}/ladder-rules`,
      headers: { cookie: `tv_session=${authCookie}` },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.targetMode).toBe('T1_ONLY');
    expect(getBody.data.autoExecuteEnabled).toBe(true);

    // Verify audit log entry in database
    const dbTrade = await Trade.findById(tradeId);
    expect(dbTrade).not.toBeNull();
    const auditEntry = dbTrade!.auditLog.find((a) => a.action === 'CUSTOM_LADDER_RULES_UPDATED');
    expect(auditEntry).toBeDefined();
    expect((auditEntry!.details as any)?.targetMode).toBe('T1_ONLY');
  });

  it('enforces tenant isolation: User B cannot access User A rules', async () => {
    // User B attempting GET
    const getB = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeId}/ladder-rules`,
      headers: { cookie: `tv_session=${userBAuthCookie}` },
    });
    expect(getB.statusCode).toBe(404);

    // User B attempting PUT
    const putB = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${tradeId}/ladder-rules`,
      headers: { cookie: `tv_session=${userBAuthCookie}` },
      payload: { targetMode: 'CLASSIC_THREE' },
    });
    expect(putB.statusCode).toBe(404);
  });
});
