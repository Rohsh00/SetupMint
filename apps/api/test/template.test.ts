import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';

describe('Trade Templates API Integration & Isolation Tests', () => {
  let app: FastifyInstance;
  let user1Cookie: string;
  let user1Id: string;
  let user1AccountId: string;

  let user2Cookie: string;
  let user2Id: string;

  let createdTemplateId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `trader1_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Trader One',
        baseCurrency: 'INR',
      },
    });
    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.body);
    user1Id = body1.data.user.id;
    const cookies1 = res1.headers['set-cookie'];
    user1Cookie = Array.isArray(cookies1) ? cookies1[0] : (cookies1 as string);

    // Create Account for User 1
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: user1Cookie },
      payload: {
        name: 'Zerodha Main',
        broker: 'Zerodha',
        accountType: 'FUTURES_OPTIONS',
        baseCurrency: 'INR',
        initialBalance: 500000,
      },
    });
    expect(accRes.statusCode).toBe(201);
    user1AccountId = JSON.parse(accRes.body).data.id;

    // Register User 2
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `trader2_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Trader Two',
        baseCurrency: 'INR',
      },
    });
    expect(res2.statusCode).toBe(201);
    const body2 = JSON.parse(res2.body);
    user2Id = body2.data.user.id;
    const cookies2 = res2.headers['set-cookie'];
    user2Cookie = Array.isArray(cookies2) ? cookies2[0] : (cookies2 as string);
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  it('GET /api/v1/templates requires authentication (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/templates',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/templates returns 25 built-in templates with accurate structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/templates',
      headers: { cookie: user1Cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(25);

    const orb = body.data.find((t: any) => t.id === 'fno-orb');
    expect(orb).toBeDefined();
    expect(orb.isBuiltIn).toBe(true);
    expect(orb.group).toBe('FNO');
    expect(orb.slRule.type).toBe('PERCENT');
    expect(orb.performance).toBeDefined();
    expect(orb.performance.totalTrades).toBe(0);

    const sweep = body.data.find((t: any) => t.id === 'pa-liquidity-sweep-reversal');
    expect(sweep).toBeDefined();
    expect(sweep.isBuiltIn).toBe(true);
    expect(sweep.group).toBe('PRICE_ACTION');
    expect(sweep.confluences).toContain('BUY_SIDE_LIQUIDITY_SWEEP');
  });

  it('POST /api/v1/templates creates a custom template for user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: { cookie: user1Cookie },
      payload: {
        name: 'Custom VWAP Pullback',
        description: 'Scalp index or large cap when bouncing off VWAP with volume confirmation',
        group: 'CUSTOM',
        markets: ['EQUITY', 'OPTIONS'],
        direction: 'LONG',
        strategyName: 'VWAP Bounce',
        slRule: {
          type: 'PERCENT',
          value: 0.5,
        },
        minRR: 2.0,
        titlePattern: '{symbol} VWAP Long {date}',
        tags: ['vwap', 'pullback', 'momentum'],
        confluences: ['VWAP', 'VOLUME_SPIKE'],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Custom VWAP Pullback');
    expect(body.data.isBuiltIn).toBe(false);
    expect(body.data.minRR).toBe(2.0);
    expect(body.data.userId).toBe(user1Id);
    createdTemplateId = body.data.id;
  });

  it('POST /api/v1/templates rejects duplicate name for same user (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: { cookie: user1Cookie },
      payload: {
        name: 'Custom VWAP Pullback',
        markets: ['EQUITY'],
        slRule: { type: 'PERCENT', value: 1.0 },
        titlePattern: '{symbol} Setup',
      },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('DUPLICATE_TEMPLATE_NAME');
  });

  it('PUT /api/v1/templates/:id updates custom template', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user1Cookie },
      payload: {
        minRR: 2.5,
        description: 'Updated VWAP bounce description',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.minRR).toBe(2.5);
    expect(body.data.description).toBe('Updated VWAP bounce description');
  });

  it('PUT /api/v1/templates/:id prevents modifying built-in templates (400 BUILT_IN_READ_ONLY)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/templates/fno-orb',
      headers: { cookie: user1Cookie },
      payload: {
        minRR: 3.0,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('BUILT_IN_READ_ONLY');
  });

  it('DELETE /api/v1/templates/:id prevents deleting built-in templates (400 BUILT_IN_READ_ONLY)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/templates/fno-orb',
      headers: { cookie: user1Cookie },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('BUILT_IN_READ_ONLY');
  });

  it('Strict Tenant Isolation: User 2 cannot access, modify, or delete User 1 template', async () => {
    // User 2 cannot GET User 1 template
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user2Cookie },
    });
    expect(getRes.statusCode).toBe(404);

    // User 2 cannot PUT User 1 template
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user2Cookie },
      payload: { name: 'Hacked Template' },
    });
    expect(putRes.statusCode).toBe(404);

    // User 2 cannot DELETE User 1 template
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user2Cookie },
    });
    expect(delRes.statusCode).toBe(404);

    // User 2 GET list does not include User 1 template
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/templates',
      headers: { cookie: user2Cookie },
    });
    const listBody = JSON.parse(listRes.body);
    const found = listBody.data.find((t: any) => t.id === createdTemplateId);
    expect(found).toBeUndefined();
  });

  it('Trades link to templateId, support filtering, and aggregate performance stats', async () => {
    // Create a trade using built-in template fno-orb
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: user1Cookie },
      payload: {
        accountId: user1AccountId,
        symbol: 'NIFTY',
        assetClass: 'OPTIONS',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeTitle: 'NIFTY ORB Long 2026-10-19',
        tags: ['orb', 'intraday'],
        tradeDate: '2026-10-19',
        entryTime: '2026-10-19T09:30:00.000Z',
        exitTime: '2026-10-19T10:15:00.000Z',
        templateId: 'fno-orb',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 120,
          exitPrice: 160,
          quantity: 75,
          contractMultiplier: 1,
          brokerage: 40,
          exchangeFees: 10,
          regulatoryFees: 5,
          taxes: 15,
          otherFees: 0,
          explicitAdjustments: 0,
        },
      },
    });

    expect(tradeRes.statusCode).toBe(201);
    const tradeBody = JSON.parse(tradeRes.body);
    expect(tradeBody.data.templateId).toBe('fno-orb');
    const tradeId = tradeBody.data.id;

    // Filter trades by templateId
    const filterRes = await app.inject({
      method: 'GET',
      url: '/api/v1/trades?templateId=fno-orb',
      headers: { cookie: user1Cookie },
    });
    expect(filterRes.statusCode).toBe(200);
    const filterBody = JSON.parse(filterRes.body);
    expect(filterBody.data.length).toBe(1);
    expect(filterBody.data[0].id).toBe(tradeId);
    expect(filterBody.data[0].templateId).toBe('fno-orb');

    // Filter with other templateId returns 0
    const filterEmpty = await app.inject({
      method: 'GET',
      url: '/api/v1/trades?templateId=stocks-gap-and-go',
      headers: { cookie: user1Cookie },
    });
    expect(JSON.parse(filterEmpty.body).data.length).toBe(0);

    // Verify template performance stats update on GET /api/v1/templates
    const templatesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/templates',
      headers: { cookie: user1Cookie },
    });
    const templatesBody = JSON.parse(templatesRes.body);
    const orbTemplate = templatesBody.data.find((t: any) => t.id === 'fno-orb');
    expect(orbTemplate).toBeDefined();
    expect(orbTemplate.performance.totalTrades).toBe(1);
    expect(orbTemplate.performance.winTrades).toBe(1);
    expect(orbTemplate.performance.winRate).toBe(100);
    expect(orbTemplate.performance.netPnL).toBeGreaterThan(0);
  });

  it('POST /api/v1/templates/:id/favorite toggles favorite status', async () => {
    const favRes = await app.inject({
      method: 'POST',
      url: `/api/v1/templates/${createdTemplateId}/favorite`,
      headers: { cookie: user1Cookie },
    });
    expect(favRes.statusCode).toBe(200);
    const favBody = JSON.parse(favRes.body);
    expect(favBody.data.isFavorite).toBe(true);

    const unfavRes = await app.inject({
      method: 'POST',
      url: `/api/v1/templates/${createdTemplateId}/favorite`,
      headers: { cookie: user1Cookie },
    });
    expect(unfavRes.statusCode).toBe(200);
    expect(JSON.parse(unfavRes.body).data.isFavorite).toBe(false);
  });

  it('POST /api/v1/templates/:id/use increments usage count', async () => {
    const useRes = await app.inject({
      method: 'POST',
      url: `/api/v1/templates/${createdTemplateId}/use`,
      headers: { cookie: user1Cookie },
    });
    expect(useRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user1Cookie },
    });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.usageCount).toBe(1);
  });

  it('DELETE /api/v1/templates/:id successfully deletes custom template', async () => {
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user1Cookie },
    });
    expect(delRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/templates/${createdTemplateId}`,
      headers: { cookie: user1Cookie },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
