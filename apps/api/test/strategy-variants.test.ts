import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';

describe('Custom Parent Strategy & Child Setup Variants Integration Tests', () => {
  let app: FastifyInstance;
  let user1Cookie: string;
  let user1AccountId: string;

  let user2Cookie: string;

  let createdStrategyId: string;
  let createdTradeId: string;
  let unclassifiedTradeId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `variant_trader1_${Date.now()}@setupmint.local`,
        password: 'Password@123',
        name: 'Variant Trader One',
        baseCurrency: 'INR',
      },
    });
    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.body);
    const cookies1 = res1.headers['set-cookie'];
    user1Cookie = Array.isArray(cookies1) ? cookies1[0] : (cookies1 as string);

    // Create Account for User 1
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: user1Cookie },
      payload: {
        name: 'Zerodha Derivative Master',
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
        email: `variant_trader2_${Date.now()}@setupmint.local`,
        password: 'Password@123',
        name: 'Variant Trader Two',
        baseCurrency: 'INR',
      },
    });
    expect(res2.statusCode).toBe(201);
    const cookies2 = res2.headers['set-cookie'];
    user2Cookie = Array.isArray(cookies2) ? cookies2[0] : (cookies2 as string);
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  it('1. Creates a 100% custom parent strategy with custom child variants (no static restrictions)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: { cookie: user1Cookie },
      payload: {
        name: 'Volume Weighted Reversal Strategy',
        description: 'Custom multi-timeframe volume weighted reversal strategy with custom variants',
        assetClasses: ['EQUITY', 'FUTURES'],
        timeframes: ['5m', '15m'],
        entryRules: ['Volume exceeds 200% average', 'Key support zone held'],
        stopLossRules: ['Hard stop at recent swing low'],
        targetRules: ['2.5R target'],
        invalidationCriteria: ['Clean candle close below support'],
        checklist: ['Context aligned', 'Risk controlled'],
        minRiskReward: 2.5,
        tags: ['Custom', 'VWAP', 'VolumeBreakout'],
        variants: [
          {
            key: 'VOL-REV-A',
            name: 'High Volume Washout Reversal',
            description: 'Washout wick at open with immediate absorption',
            isActive: true,
            sortOrder: 1,
            minRiskReward: 3.0,
            expected: {
              direction: 'LONG',
              customIndicator: 'VWAP_CROSS',
            },
            entryRules: ['Wait for 5m absorption wick'],
          },
          {
            key: 'VOL-REV-B',
            name: 'Secondary Pullback Re-Entry',
            description: 'Low volume retest of the absorption level',
            isActive: true,
            sortOrder: 2,
            minRiskReward: 2.0,
            expected: {
              direction: 'LONG',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Volume Weighted Reversal Strategy');
    expect(body.data.variants).toHaveLength(2);
    expect(body.data.variants[0].key).toBe('VOL-REV-A');
    expect(body.data.variants[0].name).toBe('High Volume Washout Reversal');
    expect(body.data.variants[1].key).toBe('VOL-REV-B');

    createdStrategyId = body.data._id || body.data.id;

    // List endpoint must return persisted variants so they survive a page reload
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/strategies',
      headers: { cookie: user1Cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listedStrategy = JSON.parse(listRes.body).data.find((s: any) => s.id === createdStrategyId);
    expect(listedStrategy).toBeDefined();
    expect(listedStrategy.variants).toHaveLength(2);
    expect(listedStrategy.variants[0].key).toBe('VOL-REV-A');
    expect(listedStrategy.variants[1].key).toBe('VOL-REV-B');
  });

  it('2. Enforces strict tenant isolation: User 2 cannot access User 1 strategy', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/strategies/${createdStrategyId}`,
      headers: { cookie: user2Cookie },
    });

    expect(res.statusCode).toBe(404);
  });

  it('3. Logs a trade referencing the custom parent strategy and child variant key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: user1Cookie },
      payload: {
        accountId: user1AccountId,
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date().toISOString().split('T')[0],
        entryTime: new Date(Date.now() - 3600000).toISOString(),
        exitTime: new Date().toISOString(),
        strategyId: createdStrategyId,
        strategyName: 'Volume Weighted Reversal Strategy',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 2500,
          exitPrice: 2550,
          quantity: 100,
          fees: 50,
        },
        setup: {
          variantKey: 'VOL-REV-A',
          variantStatus: 'CLASSIFIED',
          executionTimeframe: '5m',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.strategyId).toBe(createdStrategyId);
    expect(body.data.setup.variantKey).toBe('VOL-REV-A');
    expect(body.data.setup.variantStatus).toBe('CLASSIFIED');

    // Audit log should include classification event
    const classifyLog = (body.data.auditLog || []).find((l: any) => l.action === 'CLASSIFIED');
    expect(classifyLog).toBeDefined();

    createdTradeId = body.data.id;
  });

  it('4. Prevents deleting an in-use child variant (409 VARIANT_IN_USE)', async () => {
    // Attempt to update strategy by removing VOL-REV-A (which is used by createdTradeId)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/strategies/${createdStrategyId}`,
      headers: { cookie: user1Cookie },
      payload: {
        variants: [
          {
            key: 'VOL-REV-B',
            name: 'Secondary Pullback Re-Entry',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VARIANT_IN_USE');
    expect(body.error.inUseKeys).toContain('VOL-REV-A');
  });

  it('5. Allows archiving a variant instead of deleting it', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/strategies/${createdStrategyId}`,
      headers: { cookie: user1Cookie },
      payload: {
        variants: [
          {
            key: 'VOL-REV-A',
            name: 'High Volume Washout Reversal',
            isActive: false, // Archived
          },
          {
            key: 'VOL-REV-B',
            name: 'Secondary Pullback Re-Entry',
            isActive: true,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    const vA = body.data.variants.find((v: any) => v.key === 'VOL-REV-A');
    expect(vA.isActive).toBe(false);
  });

  it('6. Bulk classifies an unclassified trade to a child variant', async () => {
    // Create unclassified trade under parent strategy
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: user1Cookie },
      payload: {
        accountId: user1AccountId,
        symbol: 'INFY',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date().toISOString().split('T')[0],
        entryTime: new Date(Date.now() - 3600000).toISOString(),
        exitTime: new Date().toISOString(),
        strategyId: createdStrategyId,
        strategyName: 'Volume Weighted Reversal Strategy',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 1500,
          exitPrice: 1530,
          quantity: 50,
          fees: 30,
        },
      },
    });
    expect(tradeRes.statusCode).toBe(201);
    unclassifiedTradeId = JSON.parse(tradeRes.body).data.id;

    // Bulk classify to VOL-REV-B
    const classifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/bulk-classify',
      headers: { cookie: user1Cookie },
      payload: {
        tradeIds: [unclassifiedTradeId],
        strategyId: createdStrategyId,
        variantKey: 'VOL-REV-B',
        variantStatus: 'CLASSIFIED',
      },
    });

    expect(classifyRes.statusCode).toBe(200);
    const classifyBody = JSON.parse(classifyRes.body);
    expect(classifyBody.success).toBe(true);
    expect(classifyBody.data.count).toBe(1);

    // Verify trade now has variant
    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${unclassifiedTradeId}`,
      headers: { cookie: user1Cookie },
    });
    expect(checkRes.statusCode).toBe(200);
    const checkBody = JSON.parse(checkRes.body);
    expect(checkBody.data.setup.variantKey).toBe('VOL-REV-B');
    expect(checkBody.data.setup.variantStatus).toBe('CLASSIFIED');
  });

  it('7. Returns Strategy Variant Analytics with performance metrics breakdown', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/strategies/${createdStrategyId}/analytics`,
      headers: { cookie: user1Cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.strategy.id).toBe(createdStrategyId);
    expect(body.data.parent.closedTrades).toBe(2);
    expect(body.data.invariantCheck.reconciled).toBe(true);

    const buckets = body.data.buckets;
    const bucketA = buckets.find((b: any) => b.key === 'VOL-REV-A');
    const bucketB = buckets.find((b: any) => b.key === 'VOL-REV-B');

    expect(bucketA).toBeDefined();
    expect(bucketA.closedTrades).toBe(1);
    expect(bucketA.winRate).toBe(100);

    expect(bucketB).toBeDefined();
    expect(bucketB.closedTrades).toBe(1);
    expect(bucketB.winRate).toBe(100);
  });

  it('8. Inserts starter parent strategies with child variants on demand (idempotent)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/strategies/pack/liquidity-retracement',
      headers: { cookie: user1Cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.createdCount).toBeGreaterThan(0);

    // Running again is idempotent (no duplicates)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/strategies/pack/liquidity-retracement',
      headers: { cookie: user1Cookie },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.createdCount).toBe(0);
  });
});
