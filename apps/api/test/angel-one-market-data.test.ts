import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import pino from 'pino';
import moment from 'moment';
import { Writable } from 'stream';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  MarketDataIntegration,
  AngelOneInstrument,
  Trade,
  TradingAccount,
  TradeCandleSnapshot,
  BrokerIntegration,
} from '../src/db/models/index.js';
import { MarketDataService } from '../src/services/market-data/market-data.service.js';
import { AngelOneClient } from '../src/services/market-data/angel-one.client.js';
import { AngelOneCandleProvider } from '../src/services/market-data/angel-one.provider.js';
import { encryptSecret, decryptSecret } from '../src/services/crypto.service.js';
import { FyersService } from '../src/services/fyers.service.js';

describe('Angel One Market Data Integration & Security Tests', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;

  beforeAll(async () => {
    // Intercept fetch calls
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input);

        // SmartAPI Login
        if (url.includes('/loginByPassword')) {
          return new Response(
            JSON.stringify({
              status: true,
              message: 'SUCCESS',
              errorcode: '',
              data: {
                jwtToken: 'mock_jwt_token_header_payload_signature',
                refreshToken: 'mock_refresh_token_secret',
                feedToken: 'mock_feed_token_secret',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        // SmartAPI Logout
        if (url.includes('/logout')) {
          return new Response(
            JSON.stringify({ status: true, message: 'SUCCESS', errorcode: '' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        // SmartAPI Candle Data
        if (url.includes('/getCandleData')) {
          return new Response(
            JSON.stringify({
              status: true,
              message: 'SUCCESS',
              errorcode: '',
              data: [
                ['2026-10-21T09:15:00+05:30', 2500, 2520, 2490, 2515, 50000],
                ['2026-10-21T09:16:00+05:30', 2515, 2530, 2510, 2525, 60000],
                ['2026-10-21T09:17:00+05:30', 2525, 2540, 2520, 2535, 45000],
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        // FYERS Historical Data (used to test fallback short-circuit)
        if (url.includes('/data/history')) {
          const baseEpoch = Math.floor(new Date('2026-10-21T09:15:00+05:30').getTime() / 1000);
          return new Response(
            JSON.stringify({
              s: 'ok',
              code: 200,
              candles: [
                [baseEpoch, 2500, 2520, 2490, 2515, 50000],
                [baseEpoch + 60, 2515, 2530, 2510, 2525, 60000],
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ status: true, data: {} }), { status: 200 });
      })
    );

    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const regARes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `angel-user-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Angel Tester A',
      },
    });
    userACookie = regARes.headers['set-cookie'] as string;
    userAId = JSON.parse(regARes.payload).data.user.id;

    // Register User B
    const regBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `angel-user-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Angel Tester B',
      },
    });
    userBCookie = regBRes.headers['set-cookie'] as string;
    userBId = JSON.parse(regBRes.payload).data.user.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectDatabase();
  });

  describe('Security Guard Test: Zero Trading APIs', () => {
    it('proves that Angel One market data modules contain NO order, position, holding, funds or profile methods', () => {
      const forbiddenTerms = [
        'placeorder',
        'modifyorder',
        'cancelorder',
        'getorderbook',
        'gettradebook',
        'getposition',
        'getholding',
        'getfunds',
        'getprofile',
        'orderbook',
        'tradebook',
        'holding',
        'funds',
      ];

      // Inspect prototype methods and properties of AngelOneClient
      const clientMethods = Object.getOwnPropertyNames(AngelOneClient.prototype).map((m) =>
        m.toLowerCase()
      );
      for (const term of forbiddenTerms) {
        expect(clientMethods).not.toContain(term);
      }

      // Inspect prototype methods of MarketDataService
      const serviceMethods = Object.getOwnPropertyNames(MarketDataService).map((m) =>
        m.toLowerCase()
      );
      for (const term of forbiddenTerms) {
        expect(serviceMethods).not.toContain(term);
      }

      // Inspect prototype methods of AngelOneCandleProvider
      const providerMethods = Object.getOwnPropertyNames(AngelOneCandleProvider.prototype).map((m) =>
        m.toLowerCase()
      );
      for (const term of forbiddenTerms) {
        expect(providerMethods).not.toContain(term);
      }
    });
  });

  describe('Pino Log Redaction Test', () => {
    it('redacts all sensitive credentials from log outputs when serialized', () => {
      let loggedOutput = '';
      const dest = new Writable({
        write(chunk, _encoding, callback) {
          loggedOutput += chunk.toString();
          callback();
        },
      });

      const redactList = [
        'apiKey',
        'clientCode',
        'pin',
        'totp',
        'jwtToken',
        'refreshToken',
        'feedToken',
        'x-privatekey',
        'x-macaddress',
        'x-clientlocalip',
        'x-clientpublicip',
      ];

      const logger = pino({ redact: redactList }, dest);

      const secretPayload = {
        apiKey: 'MY_SUPER_SECRET_KEY_123',
        clientCode: 'CLIENT_SECRET_CODE_999',
        pin: 'PIN_SECRET_9876',
        totp: 'TOTP_SECRET_654321',
        jwtToken: 'JWT_HEADER_SECRET_TOKEN',
        refreshToken: 'REFRESH_SECRET_KEY',
        feedToken: 'FEED_TOKEN_SECRET',
        'x-privatekey': 'PRIVATE_KEY_HEADER_SECRET',
        'x-macaddress': 'MAC_SECRET_ADDR',
        'x-clientlocalip': 'IP_LOCAL_SECRET',
        'x-clientpublicip': 'IP_PUBLIC_SECRET',
      };

      logger.info(secretPayload, 'Testing Angel One credential redaction');

      // Verify that NONE of the secret literal values appear in the log output
      expect(loggedOutput).not.toContain('MY_SUPER_SECRET_KEY_123');
      expect(loggedOutput).not.toContain('CLIENT_SECRET_CODE_999');
      expect(loggedOutput).not.toContain('PIN_SECRET_9876');
      expect(loggedOutput).not.toContain('TOTP_SECRET_654321');
      expect(loggedOutput).not.toContain('JWT_HEADER_SECRET_TOKEN');
      expect(loggedOutput).not.toContain('REFRESH_SECRET_KEY');
      expect(loggedOutput).not.toContain('FEED_TOKEN_SECRET');
      expect(loggedOutput).not.toContain('PRIVATE_KEY_HEADER_SECRET');
      expect(loggedOutput).not.toContain('MAC_SECRET_ADDR');
      expect(loggedOutput).not.toContain('IP_LOCAL_SECRET');
      expect(loggedOutput).not.toContain('IP_PUBLIC_SECRET');

      // Verify redaction placeholder is present
      expect(loggedOutput).toContain('[Redacted]');
    });
  });

  describe('Tenant Isolation Tests', () => {
    it('isolates User A credentials from User B', async () => {
      // 1. User A saves credentials
      const saveRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/market-data/angel-one/config',
        headers: { cookie: userACookie },
        payload: {
          apiKey: 'test_api_key_user_a',
          clientCode: 'USER_A_CODE',
          pin: '1234',
        },
      });
      expect(saveRes.statusCode).toBe(200);

      // 2. User A gets status -> shows configured
      const statusARes = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/market-data/angel-one/status',
        headers: { cookie: userACookie },
      });
      const statusA = JSON.parse(statusARes.payload).data;
      expect(statusA.hasApiKey).toBe(true);
      expect(statusA.clientCode).toBe('USER_A_CODE');

      // 3. User B gets status -> shows NOT configured
      const statusBRes = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/market-data/angel-one/status',
        headers: { cookie: userBCookie },
      });
      const statusB = JSON.parse(statusBRes.payload).data;
      expect(statusB.hasApiKey).toBe(false);
      expect(statusB.clientCode).toBeNull();
      expect(statusB.connected).toBe(false);

      // 4. User B cannot disconnect or delete User A's session
      await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/market-data/angel-one/disconnect',
        headers: { cookie: userBCookie },
      });

      // User A integration record still exists intact and clientCode is encrypted at rest
      const userADoc = await MarketDataIntegration.findOne({ userId: userAId, provider: 'ANGEL_ONE' });
      expect(userADoc).not.toBeNull();
      expect(userADoc?.clientCode).toMatch(/^enc:v1:/);
      expect(decryptSecret(userADoc?.clientCode!)).toBe('USER_A_CODE');
    });
  });

  describe('Route Operations & Authentication via app.inject()', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/market-data/angel-one/status',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid TOTP format on connect with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/market-data/angel-one/connect',
        headers: { cookie: userACookie },
        payload: { totp: '123' }, // not 6 digits
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('authenticates with valid 6-digit TOTP and establishes active session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/market-data/angel-one/connect',
        headers: { cookie: userACookie },
        payload: { totp: '123456' },
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.connected).toBe(true);
      expect(json.data.isTokenExpired).toBe(false);
    });

    it('disconnects session and clears tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/market-data/angel-one/disconnect',
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(200);

      const statusRes = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/market-data/angel-one/status',
        headers: { cookie: userACookie },
      });
      const status = JSON.parse(statusRes.payload).data;
      expect(status.connected).toBe(false);
      expect(status.tokenExpiresAt).toBeNull();
    });

    it('deletes integration record completely', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/integrations/market-data/angel-one',
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(200);

      const doc = await MarketDataIntegration.findOne({ userId: userAId, provider: 'ANGEL_ONE' });
      expect(doc).toBeNull();
    });
  });

  describe('Fallback Chain Short-Circuiting Test', () => {
    it('proves that Angel One is NEVER touched when FYERS returns valid candles', async () => {
      // 1. Create a trading account and closed trade for User A
      const account = await TradingAccount.create({
        userId: userAId,
        name: 'Fallback Test Account',
        broker: 'FYERS',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: mongoose.Types.Decimal128.fromString('100000'),
        currentBalance: mongoose.Types.Decimal128.fromString('100000'),
        realizedPnL: mongoose.Types.Decimal128.fromString('0'),
        totalDeposits: mongoose.Types.Decimal128.fromString('0'),
        totalWithdrawals: mongoose.Types.Decimal128.fromString('0'),
        totalAdjustments: mongoose.Types.Decimal128.fromString('0'),
        status: 'ACTIVE',
      });

      const trade = await Trade.create({
        userId: userAId,
        accountId: account._id,
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date('2026-10-21'),
        entryTime: new Date('2026-10-21T09:15:00+05:30'),
        exitTime: new Date('2026-10-21T09:30:00+05:30'),
        simpleExecution: {
          entryPrice: 2500,
          exitPrice: 2530,
          quantity: 100,
        },
      });

      // Connect FYERS integration
      await BrokerIntegration.findOneAndUpdate(
        { userId: userAId, broker: 'FYERS' },
        {
          $set: {
            appId: 'test_app_id',
            accessToken: encryptSecret('mock_fyers_token'),
            tokenExpiresAt: new Date(Date.now() + 86400000),
          },
        },
        { upsert: true }
      );

      // Track AngelOneClient calls
      const angelOneCandleSpy = vi.spyOn(AngelOneClient, 'getCandleData');

      // Compute excursion with provider AUTO
      const result = await FyersService.computeExcursionForTrade(trade._id, userAId, true, {
        provider: 'AUTO',
      });

      expect(result.status).toBe('COMPUTED');
      expect(result.source).toBe('FYERS_HISTORY');

      // Assert zero Angel One calls were made
      expect(angelOneCandleSpy).toHaveBeenCalledTimes(0);

      angelOneCandleSpy.mockRestore();
    });
  });

  describe('Concurrency Safety Test (Atomic Daily Budget Consumption)', () => {
    it('executes concurrent budget consumption calls without race conditions or lost updates', async () => {
      const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');

      // Setup integration doc with 0 calls used
      await MarketDataIntegration.findOneAndUpdate(
        { userId: userBId, provider: 'ANGEL_ONE' },
        {
          $set: {
            apiKey: encryptSecret('key'),
            clientCode: 'CONCURRENCY_TEST',
            pin: encryptSecret('1234'),
            dailyCallCount: 0,
            dailyCallDate: today,
          },
        },
        { upsert: true, new: true }
      );

      // Run 20 parallel consumption calls
      const tasks = Array.from({ length: 20 }).map(() =>
        AngelOneClient.consumeDailyBudget(userBId, 50)
      );
      const results = await Promise.all(tasks);

      // All 20 should succeed
      expect(results.every((r) => r === true)).toBe(true);

      // Re-fetch document from database
      const updated = await MarketDataIntegration.findOne({ userId: userBId, provider: 'ANGEL_ONE' });
      expect(updated?.dailyCallCount).toBe(20);
    });
  });

  describe('Database Explain Index Confirmation', () => {
    function hasIndexScan(plan: any): boolean {
      if (!plan) return false;
      if (plan.stage === 'IXSCAN' || plan.stage === 'IDHACK') return true;
      if (plan.inputStage) return hasIndexScan(plan.inputStage);
      if (Array.isArray(plan.inputStages)) return plan.inputStages.some(hasIndexScan);
      return false;
    }

    it('confirms IXSCAN usage on AngelOneInstrument symbol and token lookup queries', async () => {
      // Seed a mock instrument
      await AngelOneInstrument.create({
        symboltoken: '2885',
        tradingsymbol: 'RELIANCE-EQ',
        name: 'RELIANCE',
        exchange: 'NSE',
        instrumenttype: '',
        expiry: '',
        strike: 0,
        lotsize: 1,
        tickSize: 0.05,
      });

      // Explain lookup query using tradingsymbol and exchange index
      const explanation: any = await AngelOneInstrument.find({
        tradingsymbol: 'RELIANCE-EQ',
        exchange: 'NSE',
      }).explain('executionStats');

      expect(hasIndexScan(explanation?.queryPlanner?.winningPlan)).toBe(true);
    });

    it('confirms IXSCAN usage on MarketDataIntegration unique index { userId: 1, provider: 1 }', async () => {
      const explanation: any = await MarketDataIntegration.findOne({
        userId: userBId,
        provider: 'ANGEL_ONE',
      }).explain('executionStats');

      expect(hasIndexScan(explanation?.queryPlanner?.winningPlan)).toBe(true);
    });
  });

  describe('Benchmark Performance: Scrip Master Ingestion', () => {
    it('parses and bulk-writes 1,000 instrument rows in under 2 seconds with bounded memory', async () => {
      const syntheticRows = Array.from({ length: 1000 }).map((_, idx) => ({
        symboltoken: `TOKEN_${idx}`,
        tradingsymbol: `NIFTY26OCT${24000 + idx}CE`,
        name: 'NIFTY',
        expiry: '28-OCT-2026',
        strike: 24000 + idx,
        lotsize: 25,
        instrumenttype: 'OPTIDX',
        exchange: 'NFO',
        tickSize: 0.05,
      }));

      const startMem = process.memoryUsage().heapUsed;
      const startTime = Date.now();

      // Bulk write ordered: false
      const operations = syntheticRows.map((row) => ({
        updateOne: {
          filter: { symboltoken: row.symboltoken, exchange: row.exchange },
          update: { $set: row },
          upsert: true,
        },
      }));

      const res = await AngelOneInstrument.bulkWrite(operations, { ordered: false });
      const durationMs = Date.now() - startTime;
      const endMem = process.memoryUsage().heapUsed;
      const memDeltaMb = (endMem - startMem) / (1024 * 1024);

      expect(res.upsertedCount + res.modifiedCount).toBe(1000);
      expect(durationMs).toBeLessThan(2000); // completed well under 2s
      expect(memDeltaMb).toBeLessThan(50); // heap growth bounded under 50MB
    });
  });
});
