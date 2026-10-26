import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  BrokerIntegration,
  Trade,
  TradingAccount,
  Instrument,
} from '../src/db/models/index.js';
import {
  getNextFyersTokenExpiry,
  normalizeFyersFunds,
} from '../src/services/fyers.service.js';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from '../src/services/crypto.service.js';

describe('FYERS funds sync and reconciliation', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let fundsClearBalance = 101000;
  let tradebookExecutions: any[] = [];

  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/validate-authcode')) {
          return new Response(
            JSON.stringify({
              s: 'ok',
              access_token: 'test-access-token',
              refresh_token: 'test-refresh-token',
              client_id: 'CPCJNZWGA9',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/tradebook')) {
          return new Response(JSON.stringify({ s: 'ok', tradeBook: tradebookExecutions }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/funds')) {
          return new Response(
            JSON.stringify({
              s: 'ok',
              code: 200,
              fund_limit: [
                { id: 1, title: 'Total Balance', equityAmount: fundsClearBalance + 5000, commodityAmount: 0 },
                { id: 2, title: 'Clear Balance', equityAmount: fundsClearBalance, commodityAmount: 0 },
                { id: 3, title: 'Available Balance', equityAmount: fundsClearBalance - 1000, commodityAmount: 0 },
                { id: 4, title: 'Utilized Amount', equityAmount: 1000, commodityAmount: 0 },
                { id: 5, title: 'Realized Profit and Loss', equityAmount: 250, commodityAmount: 0 },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    await connectDatabase();
    app = await buildApp();
    await app.ready();

    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `broker_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Broker Trader',
        baseCurrency: 'INR',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const registerBody = JSON.parse(registerRes.body);
    userId = registerBody.data.user.id;
    const cookies = registerRes.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    const accountRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'FYERS Funded Account',
        broker: 'FYERS',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 100000,
      },
    });
    expect(accountRes.statusCode).toBe(201);
    accountId = JSON.parse(accountRes.body).data.id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await disconnectDatabase();
    vi.unstubAllGlobals();
  });

  it('accepts both equity and commodity fund shapes and preserves exact amounts', () => {
    const normalized = normalizeFyersFunds([
      { id: 1, title: 'Total Balance', equityAmount: '1,50,000.25', commodityAmount: '10,000.50' },
      { id: 2, title: 'Clear Balance', equityAmount: '1,40,000.25', commodityAmount: '9,000.50' },
      { id: 3, title: 'Available Balance', equityAmount: '1,30,000.25', commodityAmount: '8,000.50' },
      { id: 4, title: 'Utilized Amount', equityAmount: '10,000.00', commodityAmount: '1,000.00' },
      { id: 5, title: 'Realized Profit and Loss', equityAmount: '500.25', commodityAmount: '25.50' },
    ]);

    expect(normalized.snapshot.clearBalance).toBe(140000.25);
    expect(normalized.snapshot.realizedPnL).toBe(500.25);
    expect(normalized.snapshot.fundLimits[0]).toMatchObject({
      title: 'Total Balance',
      equityAmount: 150000.25,
      commodityAmount: 10000.5,
    });
    expect(normalized.exact.clearBalance.toFixed(2)).toBe('140000.25');
  });

  it('expires access tokens at 06:30 IST', () => {
    expect(getNextFyersTokenExpiry(new Date('2026-10-23T00:30:00.000Z')).toISOString()).toBe(
      '2026-10-23T01:00:00.000Z'
    );
    expect(getNextFyersTokenExpiry(new Date('2026-10-23T01:00:00.000Z')).toISOString()).toBe(
      '2026-10-24T01:00:00.000Z'
    );
  });

  it('encrypts secrets with authenticated encryption and round-trips them', () => {
    const encrypted = encryptSecret('super-secret-value');
    expect(encrypted).not.toBeNull();
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain('super-secret-value');
    expect(decryptSecret(encrypted)).toBe('super-secret-value');
  });

  it('stores encrypted credentials and never returns them in status responses', async () => {
    const configRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/config',
      headers: { cookie: authCookie },
      payload: {
        appId: 'CPCJNZWGA9-200',
        secretKey: 'test-secret-key',
        autoSyncEnabled: true,
      },
    });
    expect(configRes.statusCode).toBe(200);

    const stored = await BrokerIntegration.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      broker: 'FYERS',
    });
    expect(stored?.secretKey).toBeTruthy();
    expect(stored?.secretKey).not.toBe('test-secret-key');
    expect(isEncryptedSecret(stored?.secretKey)).toBe(true);
    expect(decryptSecret(stored?.secretKey)).toBe('test-secret-key');

    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/fyers/status',
      headers: { cookie: authCookie },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.body).not.toContain('test-secret-key');
    expect(statusRes.body).not.toContain('test-access-token');
    expect(statusRes.body).not.toContain('test-refresh-token');
  });

  it('completes OAuth with a database-backed state and stores encrypted tokens', async () => {
    const connectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/connect',
      headers: { cookie: authCookie },
    });
    expect(connectRes.statusCode).toBe(200);
    const connectBody = JSON.parse(connectRes.body);
    const loginUrl = new URL(connectBody.data.url);
    const state = loginUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const callbackRes = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/fyers/callback?auth_code=valid-code&state=${encodeURIComponent(
        state as string
      )}`,
    });
    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toContain('fyers=connected');

    const integration = await BrokerIntegration.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      broker: 'FYERS',
    });
    expect(integration?.accessToken).toBeTruthy();
    expect(integration?.accessToken).not.toBe('test-access-token');
    expect(isEncryptedSecret(integration?.accessToken)).toBe(true);
    expect(decryptSecret(integration?.accessToken)).toBe('test-access-token');
    expect(isEncryptedSecret(integration?.refreshToken)).toBe(true);
    expect(integration?.oauthStateHash).toBeFalsy();
    expect(integration?.clientId).toBe('CPCJNZWGA9');
    expect(integration?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects mismatched client IDs when linking an account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/broker-link`,
      headers: { cookie: authCookie },
      payload: { clientId: 'WRONGCLIENT' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('CLIENT_ID_MISMATCH');
  });

  it('links the account and creates a pending reconciliation adjustment', async () => {
    const linkRes = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/broker-link`,
      headers: { cookie: authCookie },
      payload: { clientId: 'CPCJNZWGA9' },
    });
    expect(linkRes.statusCode).toBe(200);
    expect(JSON.parse(linkRes.body).data.brokerLink.clientId).toBe('CPCJNZWGA9');

    const syncRes = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/sync-funds`,
      headers: { cookie: authCookie },
    });
    expect(syncRes.statusCode).toBe(200);
    const body = JSON.parse(syncRes.body);
    expect(body.data).toMatchObject({
      currentBalance: 100000,
      brokerBalance: 101000,
      drift: 1000,
      suggestionCreated: true,
    });
    expect(body.data.pendingTransaction).toMatchObject({
      type: 'ADJUSTMENT',
      amount: 1000,
      source: 'BROKER_SYNC',
      status: 'PENDING_REVIEW',
    });

    const account = await TradingAccount.findById(accountId);
    expect(Number(account?.currentBalance.toString())).toBe(100000);

    const pendingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/pending-transactions`,
      headers: { cookie: authCookie },
    });
    const pendingBody = JSON.parse(pendingRes.body);
    expect(pendingBody.data.transactions).toHaveLength(1);
    expect(pendingBody.data.latestSnapshot.clearBalance).toBe(101000);
  });

  it('does not create a second pending adjustment for the same drift', async () => {
    fundsClearBalance = 102000;
    const syncRes = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/sync-funds`,
      headers: { cookie: authCookie },
    });
    expect(syncRes.statusCode).toBe(200);
    const body = JSON.parse(syncRes.body);
    expect(body.data.suggestionCreated).toBe(false);
    expect(body.data.skipReason).toBe('PENDING_REVIEW_EXISTS');
  });

  it('confirms the pending adjustment and updates the authoritative balance', async () => {
    const pendingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/pending-transactions`,
      headers: { cookie: authCookie },
    });
    const pendingBody = JSON.parse(pendingRes.body);
    const txId = pendingBody.data.transactions[0].id;

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/transactions/${txId}/confirm`,
      headers: { cookie: authCookie },
    });
    expect(confirmRes.statusCode).toBe(200);
    const confirmBody = JSON.parse(confirmRes.body);
    expect(confirmBody.data.balanceSummary.currentBalance).toBe(101000);
    expect(confirmBody.data.balanceSummary.totalAdjustments).toBe(1000);

    const account = await TradingAccount.findById(accountId);
    expect(Number(account?.currentBalance.toString())).toBe(101000);
  });

  it('skips suggestions within tolerance and when open or planned trades exist', async () => {
    fundsClearBalance = 101000;
    const withinTolerance = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/sync-funds`,
      headers: { cookie: authCookie },
    });
    const toleranceBody = JSON.parse(withinTolerance.body);
    expect(toleranceBody.data.suggestionCreated).toBe(false);
    expect(toleranceBody.data.skipReason).toBe('WITHIN_TOLERANCE');

    await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'RELIANCE',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      direction: 'LONG',
      status: 'PLANNED',
      tradeDate: new Date(),
      entryTime: new Date(),
      currency: 'INR',
    });

    fundsClearBalance = 105000;
    const openTradesRes = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/sync-funds`,
      headers: { cookie: authCookie },
    });
    const openTradesBody = JSON.parse(openTradesRes.body);
    expect(openTradesBody.data.suggestionCreated).toBe(false);
    expect(openTradesBody.data.skipReason).toBe('OPEN_OR_PLANNED_TRADES');
  });

  it('syncs tradebook executions into the linked account', async () => {
    tradebookExecutions = [
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '23-Oct-2026 10:00:00',
        orderNumber: 'ORD-1',
        tradeNumber: 'TRD-1',
        tradePrice: 100,
        tradeValue: 1000,
        tradedQty: 10,
        orderType: 2,
        side: 1,
        productType: 'INTRADAY',
        segment: 10,
        exchange: 10,
        fyToken: 'token-1',
        symbol: 'NSE:SBIN-EQ',
      },
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '23-Oct-2026 10:15:00',
        orderNumber: 'ORD-2',
        tradeNumber: 'TRD-2',
        tradePrice: 110,
        tradeValue: 1100,
        tradedQty: 10,
        orderType: 2,
        side: -1,
        productType: 'INTRADAY',
        segment: 10,
        exchange: 10,
        fyToken: 'token-1',
        symbol: 'NSE:SBIN-EQ',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookie },
    });
    expect(syncRes.statusCode).toBe(200);
    const body = JSON.parse(syncRes.body);
    expect(body.data.syncedTradesCount).toBe(1);

    const linkedTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: 'SBIN',
    });
    expect(linkedTrade).toBeTruthy();
    expect(linkedTrade?.accountId.toString()).toBe(accountId);
    expect(linkedTrade?.status).toBe('CLOSED');
    expect(linkedTrade?.instrumentId).toBeDefined();
    expect(linkedTrade?.underlying).toBe('SBIN');

    // Verify instrument was auto-created in user's instruments collection
    const sbinInst = await Instrument.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: 'SBIN',
    });
    expect(sbinInst).toBeTruthy();
    expect(sbinInst?._id.toString()).toBe(linkedTrade?.instrumentId?.toString());
  });

  it('syncs option derivative executions (e.g. NIFTY 24100 CE), auto-creates NIFTY underlying instrument, and sets trade fields', async () => {
    tradebookExecutions = [
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '23-Oct-2026 11:00:00',
        orderNumber: 'ORD-OPT-1',
        tradeNumber: 'TRD-OPT-1',
        tradePrice: 150,
        tradeValue: 7500,
        tradedQty: 50,
        orderType: 2,
        side: 1, // BUY
        productType: 'INTRADAY',
        segment: 11,
        exchange: 10,
        fyToken: 'token-opt-1',
        symbol: 'NSE:NIFTY24OCT24100CE',
      },
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '23-Oct-2026 11:30:00',
        orderNumber: 'ORD-OPT-2',
        tradeNumber: 'TRD-OPT-2',
        tradePrice: 180,
        tradeValue: 9000,
        tradedQty: 50,
        orderType: 2,
        side: -1, // SELL
        productType: 'INTRADAY',
        segment: 11,
        exchange: 10,
        fyToken: 'token-opt-1',
        symbol: 'NSE:NIFTY24OCT24100CE',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookie },
    });
    expect(syncRes.statusCode).toBe(200);

    // Verify NIFTY instrument was auto-created for this user
    const niftyInst = await Instrument.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: 'NIFTY',
    });
    expect(niftyInst).toBeTruthy();
    expect(niftyInst?.displayName).toBe('Nifty 50');

    // Verify the trade was recorded with proper linkage and option metadata
    const optionTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: 'NIFTY',
    });
    expect(optionTrade).toBeTruthy();
    expect(optionTrade?.instrumentId?.toString()).toBe(niftyInst?._id.toString());
    expect(optionTrade?.underlying).toBe('NIFTY');
    expect(optionTrade?.instrumentName).toBe(niftyInst?.displayName);
    expect(optionTrade?.optionType).toBe('CALL');
    expect(optionTrade?.strikePrice).toBe(24100);
    expect(optionTrade?.tradeTitle).toBe('24100 CE');
    expect(optionTrade?.assetClass).toBe('OPTIONS');
    expect(optionTrade?.status).toBe('CLOSED');
    expect(optionTrade?.calculated.netPnL).toBeGreaterThan(0);
  });

  it('syncs MCX commodity futures (e.g. CRUDEOILM) with dynamic contract multiplier from instrument', async () => {
    tradebookExecutions = [
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '23-Oct-2026 14:00:00',
        orderNumber: 'ORD-COMM-1',
        tradeNumber: 'TRD-COMM-1',
        tradePrice: 6000,
        tradeValue: 60000,
        tradedQty: 1,
        orderType: 2,
        side: 1, // BUY
        productType: 'MARGIN',
        segment: 20,
        exchange: 20,
        fyToken: 'token-comm-1',
        symbol: 'MCX:CRUDEOILM26NOVFUT',
      },
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '23-Oct-2026 14:30:00',
        orderNumber: 'ORD-COMM-2',
        tradeNumber: 'TRD-COMM-2',
        tradePrice: 6050,
        tradeValue: 60500,
        tradedQty: 1,
        orderType: 2,
        side: -1, // SELL
        productType: 'MARGIN',
        segment: 20,
        exchange: 20,
        fyToken: 'token-comm-1',
        symbol: 'MCX:CRUDEOILM26NOVFUT',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookie },
    });
    expect(syncRes.statusCode).toBe(200);

    const crudeInst = await Instrument.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: 'CRUDEOILMINI',
    });
    expect(crudeInst).toBeTruthy();
    expect(crudeInst?.contractMultiplier).toBe(10);

    const crudeTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: 'CRUDEOILMINI',
    });
    expect(crudeTrade).toBeTruthy();
    expect(crudeTrade?.instrumentId?.toString()).toBe(crudeInst?._id.toString());
    expect(crudeTrade?.underlying).toBe('CRUDEOILMINI');
    expect(crudeTrade?.simpleExecution?.contractMultiplier).toBe(10);
    // 50 points * 10 multiplier * 1 lot = 500 gross P&L
    expect(crudeTrade?.calculated.grossPnL).toBe(500);
  });

  it(
    'correctly updates an OPEN trade to CLOSED when user fetches at entry and fetches again at exit',
    async () => {
      // Phase 1: Entry only
      tradebookExecutions = [
        {
          clientId: 'CPCJNZWGA9',
          orderDateTime: '26-Oct-2026 10:00:00',
          orderNumber: 'ORD-PHASE-ENTRY',
          tradeNumber: 'TRD-PHASE-ENTRY-1',
          tradePrice: 100,
          tradeValue: 5000,
          tradedQty: 50,
          orderType: 2,
          side: 1, // BUY
          productType: 'INTRADAY',
          segment: 11,
          exchange: 10,
          fyToken: 'token-phase-1',
          symbol: 'NSE:BANKNIFTY26OCT52000CE',
        },
      ];

      const sync1Res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/fyers/sync',
        headers: { cookie: authCookie },
      });
      expect(sync1Res.statusCode).toBe(200);

      const openTrade = await Trade.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        'fills.fillId': 'TRD-PHASE-ENTRY-1',
      });
      expect(openTrade).toBeTruthy();
      expect(openTrade?.status).toBe('OPEN');
      expect(openTrade?.fills.length).toBe(1);
      expect(openTrade?.calculated.openQuantity).toBe(50);
      expect(openTrade?.calculated.closedQuantity).toBe(0);

      // Phase 2: Exit execution is added to tradebook
      tradebookExecutions = [
        {
          clientId: 'CPCJNZWGA9',
          orderDateTime: '26-Oct-2026 10:00:00',
          orderNumber: 'ORD-PHASE-ENTRY',
          tradeNumber: 'TRD-PHASE-ENTRY-1',
          tradePrice: 100,
          tradeValue: 5000,
          tradedQty: 50,
          orderType: 2,
          side: 1, // BUY
          productType: 'INTRADAY',
          segment: 11,
          exchange: 10,
          fyToken: 'token-phase-1',
          symbol: 'NSE:BANKNIFTY26OCT52000CE',
        },
        {
          clientId: 'CPCJNZWGA9',
          orderDateTime: '26-Oct-2026 10:15:00',
          orderNumber: 'ORD-PHASE-EXIT',
          tradeNumber: 'TRD-PHASE-EXIT-1',
          tradePrice: 130,
          tradeValue: 6500,
          tradedQty: 50,
          orderType: 2,
          side: -1, // SELL
          productType: 'INTRADAY',
          segment: 11,
          exchange: 10,
          fyToken: 'token-phase-1',
          symbol: 'NSE:BANKNIFTY26OCT52000CE',
        },
      ];

      const sync2Res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/fyers/sync',
        headers: { cookie: authCookie },
      });
      expect(sync2Res.statusCode).toBe(200);

      const closedTrade = await Trade.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        'fills.fillId': 'TRD-PHASE-ENTRY-1',
      });
      expect(closedTrade).toBeTruthy();
      expect(closedTrade?.status).toBe('CLOSED');
      expect(closedTrade?.fills.length).toBe(2);
      expect(closedTrade?.exitTime).toBeDefined();
      expect(closedTrade?.simpleExecution?.exitPrice).toBe(130);
      expect(closedTrade?.calculated.closedQuantity).toBe(50);
      expect(closedTrade?.calculated.openQuantity).toBe(0);
      expect(closedTrade?.calculated.grossPnL).toBe(1500); // (130 - 100) * 50
      expect(closedTrade?.calculated.outcome).toBe('WIN');
    },
    15000
  );

  it('correctly handles position reversal by splitting exit fill into closing and new entry', async () => {
    // Short 10 contracts, then Buy 20 contracts (10 to close short, 10 to go long)
    tradebookExecutions = [
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '26-Oct-2026 11:00:00',
        orderNumber: 'ORD-REV-1',
        tradeNumber: 'TRD-REV-SHORT-1',
        tradePrice: 1000,
        tradeValue: 10000,
        tradedQty: 10,
        orderType: 2,
        side: -1, // SELL (SHORT)
        productType: 'INTRADAY',
        segment: 11,
        exchange: 10,
        fyToken: 'token-rev-1',
        symbol: 'NSE:RELIANCE-EQ',
      },
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '26-Oct-2026 11:30:00',
        orderNumber: 'ORD-REV-2',
        tradeNumber: 'TRD-REV-BUY-1',
        tradePrice: 950,
        tradeValue: 19000,
        tradedQty: 20,
        orderType: 2,
        side: 1, // BUY 20 (covers 10 short, opens 10 long)
        productType: 'INTRADAY',
        segment: 11,
        exchange: 10,
        fyToken: 'token-rev-1',
        symbol: 'NSE:RELIANCE-EQ',
      },
      {
        clientId: 'CPCJNZWGA9',
        orderDateTime: '26-Oct-2026 12:00:00',
        orderNumber: 'ORD-REV-3',
        tradeNumber: 'TRD-REV-SELL-1',
        tradePrice: 980,
        tradeValue: 9800,
        tradedQty: 10,
        orderType: 2,
        side: -1, // SELL 10 (closes long)
        productType: 'INTRADAY',
        segment: 11,
        exchange: 10,
        fyToken: 'token-rev-1',
        symbol: 'NSE:RELIANCE-EQ',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookie },
    });
    expect(syncRes.statusCode).toBe(200);

    // Trade 1: Short trade (10 lots, entry 1000, exit 950 -> +500 gross profit)
    const shortTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      'fills.fillId': 'TRD-REV-SHORT-1',
    });
    expect(shortTrade).toBeTruthy();
    expect(shortTrade?.direction).toBe('SHORT');
    expect(shortTrade?.status).toBe('CLOSED');
    expect(shortTrade?.calculated.closedQuantity).toBe(10);
    expect(shortTrade?.calculated.grossPnL).toBe(500); // (1000 - 950) * 10
    expect(shortTrade?.calculated.outcome).toBe('WIN');

    // Trade 2: Long reversed trade (10 lots, entry 950, exit 980 -> +300 gross profit)
    const longTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      'fills.fillId': 'TRD-REV-BUY-1-rev',
    });
    expect(longTrade).toBeTruthy();
    expect(longTrade?.direction).toBe('LONG');
    expect(longTrade?.status).toBe('CLOSED');
    expect(longTrade?.calculated.closedQuantity).toBe(10);
    expect(longTrade?.calculated.grossPnL).toBe(300); // (980 - 950) * 10
    expect(longTrade?.calculated.outcome).toBe('WIN');
  }, 15000);
});

