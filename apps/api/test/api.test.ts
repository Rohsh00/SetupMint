import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';

describe('TradeVault API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let tradeId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  it('GET /api/health returns ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.dbState).toBe('connected');
  });

  it('POST /api/v1/auth/register creates user and returns session cookie', async () => {
    const testEmail = `test_${Date.now()}@tradevault.local`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail,
        password: 'Password@123',
        name: 'Test Trader',
        baseCurrency: 'INR',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testEmail);
    userId = body.data.user.id;

    // Extract cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);
  });

  it('GET /api/v1/auth/me returns current user profile with valid cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        cookie: authCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(userId);
  });

  it('POST /api/v1/auth/login rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'trader@tradevault.local',
        password: 'WrongPassword999',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/accounts creates a trading account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'Test Intraday Account',
        broker: 'Zerodha',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 100000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.initialBalance).toBe(100000);
    accountId = body.data.id;
  });

  it('GET /api/v1/instruments returns presets and active instruments', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/instruments',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((i: any) => i.symbol === 'NIFTY')).toBe(true);
  });

  it('POST /api/v1/trades creates a manual trade with exact financial calculations', async () => {
    // Buy 100 shares at 2500, sell at 2550. Gross = 5000. Fees = 100. Net = 4900.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: '2026-10-16',
        entryTime: '2026-10-16T09:30:00Z',
        exitTime: '2026-10-16T11:00:00Z',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 2500,
          exitPrice: 2550,
          quantity: 100,
          contractMultiplier: 1,
          brokerage: 40,
          exchangeFees: 20,
          taxes: 40,
        },
        risk: {
          plannedEntryPrice: 2500,
          initialStopLoss: 2475,
          plannedTarget: 2560,
        },
        thesis: {
          confluences: ['BOS'],
        },
        psychology: {
          disciplineScore: 5,
          rulesFollowed: true,
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.netPnL).toBe(4900);
    expect(body.data.outcome).toBe('WIN');
    tradeId = body.data.id;
  });

  it('GET /api/v1/dashboard/stats returns computed analytics from real records', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.netPnL).toBe(4900);
    expect(body.data.winningTradesCount).toBe(1);
    expect(body.data.winRate).toBe(100);
    expect(body.data.equityCurve.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/risk/calculate calculates position sizing and lot rounding', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/calculate',
      headers: { cookie: authCookie },
      payload: {
        accountEquity: 200000,
        riskPercent: 1,
        entryPrice: 24000,
        stopLossPrice: 23940,
        targetPrice: 24150,
        direction: 'LONG',
        contractMultiplier: 1,
        lotSize: 25,
        quantityIncrement: 25,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.plannedRiskAmount).toBe(2000);
    expect(body.data.roundedLotQuantity).toBe(25);
    expect(body.data.isDirectionValid).toBe(true);
  });

  it('POST /api/v1/trades/:id/duplicate duplicates trade for fast re-entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeId}/duplicate`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.symbol).toBe('RELIANCE');
  });

  it('PUT /api/v1/trades/:id performs Quick Close for OPEN trade with partial execution payload', async () => {
    // 1. Duplicate creates an OPEN trade with entryPrice=2500, quantity=100
    const dupRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeId}/duplicate`,
      headers: { cookie: authCookie },
    });
    const dupTrade = JSON.parse(dupRes.body).data;

    // 2. Perform Quick Close: send only exitPrice, exitTime, and status: 'CLOSED'
    const closeRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${dupTrade.id}`,
      headers: { cookie: authCookie },
      payload: {
        status: 'CLOSED',
        exitTime: '2026-10-18T10:30:00Z',
        simpleExecution: {
          exitPrice: 2560, // Gross: (2560 - 2500) * 100 = 6000. Costs: 100 (40+20+40 from source). Net: 5900
        },
      },
    });

    expect(closeRes.statusCode).toBe(200);
    const closeBody = JSON.parse(closeRes.body);
    expect(closeBody.success).toBe(true);
    expect(closeBody.data.status).toBe('CLOSED');
    expect(closeBody.data.calculated.grossPnL).toBe(6000);
    expect(closeBody.data.calculated.netPnL).toBe(5900);
    expect(closeBody.data.calculated.outcome).toBe('WIN');

    // 3. Verify audit log recorded CLOSED action and exitPrice details
    const lastAudit = closeBody.data.auditLog[closeBody.data.auditLog.length - 1];
    expect(lastAudit.action).toBe('CLOSED');
    expect(lastAudit.details.exitPrice).toBe(2560);

    // 4. Clean up duplicate closed trade to maintain state isolation for sequential account tests
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/trades/${dupTrade.id}`,
      headers: { cookie: authCookie },
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('GET /api/v1/trades/invalid-id rejects invalid ObjectId format with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/not-a-valid-id',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_ID');
  });

  it('POST /api/v1/accounts/:id/transactions adds deposit and authoritatively recalculates balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/transactions`,
      headers: { cookie: authCookie },
      payload: {
        type: 'DEPOSIT',
        amount: 50000,
        currency: 'INR',
        date: new Date().toISOString(),
        notes: 'Monthly capital addition',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.balanceSummary.totalDeposits).toBe(50000);
    // Initial 100,000 + 4,900 realized trade P&L + 50,000 deposit = 154,900
    expect(body.balanceSummary.currentBalance).toBe(154900);
  });

  it('POST /api/v1/accounts/:id/reconcile returns authoritative account balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/reconcile`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.currentBalance).toBe(154900);
    expect(body.data.closedTradesCount).toBe(1);
  });

  it('POST /api/v1/trades/bulk-delete deletes trades and reconciles account balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/bulk-delete',
      headers: { cookie: authCookie },
      payload: {
        tradeIds: [tradeId],
      },
    });

    expect(res.statusCode).toBe(200);

    // Verify account balance reconciled after trade deletion (4,900 net P&L removed)
    const accRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}`,
      headers: { cookie: authCookie },
    });
    const accBody = JSON.parse(accRes.body);
    // 100,000 initial + 0 P&L + 50,000 deposit = 150,000
    expect(accBody.data.currentBalance).toBe(150000);
    expect(accBody.data.realizedPnL).toBe(0);
  });

  it('POST /api/v1/export/mappings saves broker mapping and GET /api/v1/export/mappings returns it', async () => {
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/export/mappings',
      headers: { cookie: authCookie },
      payload: {
        broker: 'ZERODHA',
        name: 'Zerodha Kite Custom Mapping',
        mapping: {
          tradeDate: 'trade_date',
          symbol: 'symbol',
          direction: 'trade_type',
          price: 'price',
          quantity: 'quantity',
        },
      },
    });

    expect(saveRes.statusCode).toBe(200);
    const saveBody = JSON.parse(saveRes.body);
    expect(saveBody.success).toBe(true);
    expect(saveBody.data.broker).toBe('ZERODHA');

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/export/mappings/ZERODHA',
      headers: { cookie: authCookie },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.broker).toBe('ZERODHA');
    expect(getBody.data.mapping.symbol).toBe('symbol');
  });

  it('POST /api/v1/export/import/preview detects Zerodha tradebook format from CSV headers', async () => {
    const boundary = '----TestBoundaryPreview';
    const csvData = [
      'trade_date,tradeno,order_execution_time,symbol,series,isin,trade_type,quantity,price,order_id,trade_id',
      '2026-10-15 09:20:00,101,2026-10-15 09:20:00,RELIANCE,EQ,INE002A01018,buy,100,2500,ord1,trd1',
      '2026-10-15 11:30:00,102,2026-10-15 11:30:00,RELIANCE,EQ,INE002A01018,sell,100,2550,ord2,trd2',
    ].join('\n');

    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tradebook.csv"\r\nContent-Type: text/csv\r\n\r\n`),
      Buffer.from(csvData),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: authCookie,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.detectedBroker).toBe('ZERODHA');
    expect(body.data.totalRows).toBe(2);
    expect(body.data.isRawExecutionLog).toBe(true);
  });

  it('POST /api/v1/export/import/preview detects FYERS Tradebook report with preamble metadata and comma numbers', async () => {
    const fyersCsv = [
      'Report Title,Tradebook report',
      'Date Range,From 01/04/2026 to 31/03/2027',
      'Client Name,KOMAL MEHTA',
      'Client ID,FAK61952',
      'PAN,GUYPM7707N',
      'Download Timestamp,18/10/2026 16:54:50 IST',
      '',
      'Symbol name,Symbol code,Date & time,Side,Product type,Qty,Traded price,Total value,Segment,Exchange order ID,OMS order ID',
      'NIFTY26O1923100PE,NIFTY 23100 PE,"16 Oct 2026, 10:48:23 AM",SELL,Overnight,130.00,124.30,"16,159.00",Derivatives,"=""1000000084271616""","=""26101600177998"""',
      'NIFTY26O1923100PE,NIFTY 23100 PE,"16 Oct 2026, 10:37:40 AM",BUY,Overnight,130.00,103.55,"13,461.50",Derivatives,"=""1000000075022109""","=""26101600161330"""',
      'GOLDM26NOVFUT,GOLDM Fut,"15 Oct 2026, 09:06:47 AM",SELL,Overnight,20.00,"1,46,317.00","29,26,340.00",Commodity,"=""628824324136021""","=""26101500002739.0"""',
      'GOLDM26NOVFUT,GOLDM Fut,"15 Oct 2026, 12:00:00 AM",BUY,Overnight,20.00,"1,44,696.00","28,93,920.00",Commodity,"=""C1446960000""","=""C1446960000"""',
    ].join('\n');

    // Test with JSON csvText body
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/preview',
      headers: {
        'content-type': 'application/json',
        cookie: authCookie,
      },
      payload: { csvText: fyersCsv },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.detectedBroker).toBe('FYERS');
    expect(body.data.totalRows).toBe(4);
    expect(body.data.isRawExecutionLog).toBe(true);
    expect(body.data.headers).toContain('Symbol name');
    expect(body.data.headers).toContain('Traded price');
    expect(body.data.headers).toContain('OMS order ID');
    expect(body.data.suggestedMapping.symbol).toBe('Symbol name');
    expect(body.data.suggestedMapping.price).toBe('Traded price');
    expect(body.data.suggestedMapping.tradeDate).toBe('Date & time');
    expect(body.data.previewRows[0]['Exchange order ID']).toBe('1000000084271616');
  });

  it('POST /api/v1/export/import/commit handles Indian commas in prices and classifies MCX commodity futures', async () => {
    const fyersAccRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'FYERS Test MCX Account',
        accountType: 'COMMODITY',
        broker: 'FYERS',
        initialBalance: 100000,
        baseCurrency: 'INR',
      },
    });
    const fyersAccId = JSON.parse(fyersAccRes.body).data.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/commit',
      headers: { cookie: authCookie },
      payload: {
        accountId: fyersAccId,
        broker: 'FYERS',
        mapping: {
          tradeDate: 'Date & time',
          symbol: 'Symbol name',
          direction: 'Side',
          price: 'Traded price',
          quantity: 'Qty',
          orderId: 'Exchange order ID',
          tradeId: 'OMS order ID',
          segment: 'Segment',
        },
        rows: [
          {
            'Symbol name': 'GOLDM26NOVFUT',
            'Date & time': '15 Oct 2026, 09:00:00 AM',
            Side: 'BUY',
            'Traded price': '1,44,696.00',
            Qty: '20.00',
            Segment: 'Commodity',
            'Exchange order ID': '="628824324136021"',
          },
          {
            'Symbol name': 'GOLDM26NOVFUT',
            'Date & time': '15 Oct 2026, 09:06:47 AM',
            Side: 'SELL',
            'Traded price': '1,46,317.00',
            Qty: '20.00',
            Segment: 'Commodity',
            'Exchange order ID': '="628824324136021"',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.importedCount).toBe(1);

    const tradesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades?accountId=${fyersAccId}&search=GOLDM`,
      headers: { cookie: authCookie },
    });
    const tradesBody = JSON.parse(tradesRes.body);
    const goldTrade = tradesBody.data.find((t: any) => t.symbol === 'GOLDM26NOVFUT');
    expect(goldTrade).toBeDefined();
    expect(goldTrade.assetClass).toBe('COMMODITY');
    expect(goldTrade.exchange).toBe('MCX');
    expect(goldTrade.marketSegment).toBe('MCX');
    expect(goldTrade.calculated.averageEntryPrice).toBe(144696);
    expect(goldTrade.calculated.averageExitPrice).toBe(146317);
    expect(goldTrade.calculated.closedQuantity).toBe(20);
    expect(goldTrade.calculated.grossPnL).toBe(32420); // 20 * (146317 - 144696)
  });

  let importedBatchId: string;

  it('POST /api/v1/export/import/commit groups raw executions into round-trip trades using FIFO matching with auto-charges', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/commit',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        broker: 'ZERODHA',
        mapping: {
          tradeDate: 'trade_date',
          symbol: 'symbol',
          direction: 'trade_type',
          price: 'price',
          quantity: 'quantity',
        },
        rows: [
          {
            trade_date: '2026-10-15 09:20:00',
            symbol: 'RELIANCE',
            trade_type: 'buy',
            price: '2500',
            quantity: '100',
          },
          {
            trade_date: '2026-10-15 11:30:00',
            symbol: 'RELIANCE',
            trade_type: 'sell',
            price: '2550',
            quantity: '100',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.importedCount).toBe(1);
    expect(body.data.duplicateCount).toBe(0);
    expect(body.data.batchId).toBeDefined();
    importedBatchId = body.data.batchId;

    // Verify Trade created in DB
    const tradesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades?accountId=${accountId}`,
      headers: { cookie: authCookie },
    });
    const tradesBody = JSON.parse(tradesRes.body);
    const importedTrade = tradesBody.data.find((t: any) => t.importBatchId === importedBatchId);
    expect(importedTrade).toBeDefined();
    expect(importedTrade.executionMode).toBe('ADVANCED');
    expect(importedTrade.status).toBe('CLOSED');
    expect(importedTrade.tags).toContain('IMPORTED');
    expect(importedTrade.calculated.grossPnL).toBe(5000); // 100 * (2550 - 2500)
    expect(importedTrade.calculated.totalCosts).toBeGreaterThan(0);
    expect(importedTrade.calculated.netPnL).toBe(
      importedTrade.calculated.grossPnL - importedTrade.calculated.totalCosts
    );

    // Verify account balance reconciled with new realized P&L
    const accRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}`,
      headers: { cookie: authCookie },
    });
    const accBody = JSON.parse(accRes.body);
    expect(accBody.data.currentBalance).toBe(150000 + importedTrade.calculated.netPnL);
  });

  it('POST /api/v1/export/import/commit skips duplicates when identical trades are imported', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/commit',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        broker: 'ZERODHA',
        mapping: {
          tradeDate: 'trade_date',
          symbol: 'symbol',
          direction: 'trade_type',
          price: 'price',
          quantity: 'quantity',
        },
        rows: [
          {
            trade_date: '2026-10-15 09:20:00',
            symbol: 'RELIANCE',
            trade_type: 'buy',
            price: '2500',
            quantity: '100',
          },
          {
            trade_date: '2026-10-15 11:30:00',
            symbol: 'RELIANCE',
            trade_type: 'sell',
            price: '2550',
            quantity: '100',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.importedCount).toBe(0);
    expect(body.data.duplicateCount).toBe(1);
  });

  it('POST /api/v1/export/import/undo deletes imported batch and reconciles account balances', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/undo',
      headers: { cookie: authCookie },
      payload: { batchId: importedBatchId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.deletedCount).toBe(1);

    // Verify account balance restored to pre-import state (150,000)
    const accRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}`,
      headers: { cookie: authCookie },
    });
    const accBody = JSON.parse(accRes.body);
    expect(accBody.data.currentBalance).toBe(150000);
    expect(accBody.data.realizedPnL).toBe(0);
  });

  it('PUT /api/v1/settings/profile updates riskSettings and GET /api/v1/settings/profile returns them', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        riskSettings: {
          maxDailyLoss: 7500,
          maxDailyTrades: 4,
          maxOpenTrades: 2,
          maxRiskPerTradePercent: 1.5,
          revengeTradingMinutes: 20,
        },
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.body);
    expect(updateBody.success).toBe(true);
    expect(updateBody.data.riskSettings.maxDailyLoss).toBe(7500);
    expect(updateBody.data.riskSettings.maxDailyTrades).toBe(4);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.riskSettings.maxDailyLoss).toBe(7500);
    expect(getBody.data.riskSettings.maxRiskPerTradePercent).toBe(1.5);
  });

  it('GET /api/v1/review/queue returns trades missing exit, psychology, screenshots, and unreviewed days', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/review/queue',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.queue)).toBe(true);
    expect(Array.isArray(body.data.unreviewedDays)).toBe(true);
    expect(body.data.summary).toBeDefined();
    expect(body.data.summary.totalUnreviewedTrades).toBeGreaterThanOrEqual(1);
    expect(body.data.dailyLossBreach).toBeDefined();
    expect(typeof body.data.dailyLossBreach.breached).toBe('boolean');
  });

  it('GET /api/v1/review/prefill/:date calculates session prefill with best/worst trade and discipline rating', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/review/prefill/${todayStr}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.date).toBe(todayStr);
    expect(typeof body.data.suggestedDisciplineRating).toBe('number');
    expect(body.data.suggestedDisciplineRating).toBeGreaterThanOrEqual(1);
    expect(body.data.suggestedDisciplineRating).toBeLessThanOrEqual(5);
    expect(body.data.reasoning).toBeDefined();
    expect(Array.isArray(body.data.aggregatedMistakes)).toBe(true);
  });

  it('GET /api/v1/journal/:date includes prefill payload alongside journal review', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/journal/${todayStr}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.date).toBe(todayStr);
    expect(body.data.prefill).toBeDefined();
    expect(typeof body.data.prefill.suggestedDisciplineRating).toBe('number');
  });

  it('GET /api/v1/review/suggest-mistakes/:tradeId detects rule violations or returns suggestions list', async () => {
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        symbol: 'TCS',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        direction: 'LONG',
        tradeDate: new Date().toISOString(),
        entryTime: new Date().toISOString(),
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 3500,
          quantity: 10,
        },
      },
    });
    expect(tradeRes.statusCode).toBe(201);
    const createdTrade = JSON.parse(tradeRes.body).data;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/review/suggest-mistakes/${createdTrade.id}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});


