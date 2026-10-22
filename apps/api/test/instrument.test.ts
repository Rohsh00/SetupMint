import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { InstrumentService } from '../src/services/instrument.service.js';
import { Instrument, Trade, TradingAccount, User } from '../src/db/models/index.js';
import { runBackfill } from '../src/scripts/backfill-instruments.js';

describe('Instrument Service & API Specifications Tests', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userAId: string;
  let userAAccountId: string;

  let userBCookie: string;
  let userBId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `inst_user_a_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'User A',
        baseCurrency: 'INR',
      },
    });
    const bodyA = JSON.parse(resA.body);
    userAId = bodyA.data.user.id;
    const cookieA = resA.headers['set-cookie'];
    userACookie = Array.isArray(cookieA) ? cookieA[0] : (cookieA as string);

    // Create Account for User A
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userACookie },
      payload: {
        name: 'User A Trading Account',
        broker: 'ZERODHA',
        accountNumber: 'UAA100',
        accountType: 'FUTURES_OPTIONS',
        baseCurrency: 'INR',
        initialBalance: 500000,
      },
    });
    userAAccountId = JSON.parse(accRes.body).data.id;

    // Register User B for tenant isolation tests
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `inst_user_b_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'User B',
        baseCurrency: 'INR',
      },
    });
    const bodyB = JSON.parse(resB.body);
    userBId = bodyB.data.user.id;
    const cookieB = resB.headers['set-cookie'];
    userBCookie = Array.isArray(cookieB) ? cookieB[0] : (cookieB as string);
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  describe('1. normalizeUnderlying', () => {
    it('normalizes common Indian equities and strips exchange prefixes', () => {
      expect(InstrumentService.normalizeUnderlying('RELIANCE')).toBe('RELIANCE');
      expect(InstrumentService.normalizeUnderlying('NSE:TCS')).toBe('TCS');
      expect(InstrumentService.normalizeUnderlying('BSE:INFY')).toBe('INFY');
      expect(InstrumentService.normalizeUnderlying('  hdfcbank  ')).toBe('HDFCBANK');
    });

    it('normalizes major Indian index option contracts to benchmark underlyings', () => {
      expect(InstrumentService.normalizeUnderlying('NIFTY24OCT24500CE')).toBe('NIFTY');
      expect(InstrumentService.normalizeUnderlying('NIFTY 24500 CE')).toBe('NIFTY');
      expect(InstrumentService.normalizeUnderlying('BANKNIFTY24NOV51500PE')).toBe('BANKNIFTY');
      expect(InstrumentService.normalizeUnderlying('FINNIFTY24O1723500CE')).toBe('FINNIFTY');
      expect(InstrumentService.normalizeUnderlying('MIDCPNIFTY24OCT12000PE')).toBe('MIDCPNIFTY');
      expect(InstrumentService.normalizeUnderlying('SENSEX 81000 CALL')).toBe('SENSEX');
      expect(InstrumentService.normalizeUnderlying('BANKEX24OCT55000PE')).toBe('BANKEX');
    });

    it('normalizes stock options and futures to their underlying equity', () => {
      expect(InstrumentService.normalizeUnderlying('RELIANCE24OCT3000CE')).toBe('RELIANCE');
      expect(InstrumentService.normalizeUnderlying('TCS 4200 PE')).toBe('TCS');
      expect(InstrumentService.normalizeUnderlying('INFY24NOVFUT')).toBe('INFY');
      expect(InstrumentService.normalizeUnderlying('SBIN24OCTFUT')).toBe('SBIN');
    });

    it('normalizes MCX commodities and mini/micro variants', () => {
      expect(InstrumentService.normalizeUnderlying('CRUDEOILM24OCTFUT')).toBe('CRUDEOILMINI');
      expect(InstrumentService.normalizeUnderlying('CRUDEOILMINI24OCTFUT')).toBe('CRUDEOILMINI');
      expect(InstrumentService.normalizeUnderlying('MCX:CRUDEOIL')).toBe('CRUDEOIL');
      expect(InstrumentService.normalizeUnderlying('GOLDM24OCTFUT')).toBe('GOLD');
      expect(InstrumentService.normalizeUnderlying('SILVERMIC')).toBe('SILVER');
      expect(InstrumentService.normalizeUnderlying('NATGASMINI')).toBe('NATGASMINI');
      expect(InstrumentService.normalizeUnderlying('NATURALGAS')).toBe('NATURALGAS');
    });

    it('handles crypto, forex, and unknown unnormalizable tickers as-is', () => {
      expect(InstrumentService.normalizeUnderlying('BINANCE:BTCUSDT')).toBe('BTCUSDT');
      expect(InstrumentService.normalizeUnderlying('ETHUSDT')).toBe('ETHUSDT');
      expect(InstrumentService.normalizeUnderlying('EURUSD')).toBe('EURUSD');
      expect(InstrumentService.normalizeUnderlying('CUSTOM-TOKEN')).toBe('CUSTOM-TOKEN');
    });
  });

  describe('2. ensureForTrade Service Behavior', () => {
    it('creates a new instrument with source AUTO and needsReview false for known presets', async () => {
      const inst = await InstrumentService.ensureForTrade(userAId, {
        symbol: 'NIFTY24OCT24500CE',
      });

      expect(inst).toBeDefined();
      expect(inst.symbol).toBe('NIFTY');
      expect(inst.source).toBe('AUTO');
      expect(inst.needsReview).toBe(false);
      expect(inst.lotSize).toBe(25);
      expect(inst.contractMultiplier).toBe(1);
    });

    it('reuses existing instrument for subsequent options of the same underlying', async () => {
      const inst2 = await InstrumentService.ensureForTrade(userAId, {
        symbol: 'NIFTY24OCT24000PE',
      });

      expect(inst2).toBeDefined();
      expect(inst2.symbol).toBe('NIFTY');

      // Verify only 1 NIFTY instrument exists for User A
      const count = await Instrument.countDocuments({ userId: userAId, symbol: 'NIFTY' });
      expect(count).toBe(1);
    });

    it('creates an instrument with needsReview true when symbol is unknown', async () => {
      const inst = await InstrumentService.ensureForTrade(userAId, {
        symbol: 'UNKNOWNCO',
        instrumentName: 'Unknown Corp Ltd',
        exchange: 'NSE',
        assetClass: 'EQUITY',
        simpleExecution: { contractMultiplier: 1 },
      });

      expect(inst).toBeDefined();
      expect(inst.symbol).toBe('UNKNOWNCO');
      expect(inst.source).toBe('AUTO');
      expect(inst.needsReview).toBe(true);
    });
  });

  describe('3. REST API: GET /api/v1/instruments (Tenant Isolation & Traded Summary)', () => {
    it('returns empty array for User B who has not traded or created any instrument', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/instruments',
        headers: { cookie: userBCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]); // No global presets, no catalog!
    });

    it('returns User A instruments enriched with trade metrics', async () => {
      // Find the NIFTY instrument created in previous test
      const niftyInst = await Instrument.findOne({ userId: userAId, symbol: 'NIFTY' });
      expect(niftyInst).toBeDefined();

      // Log a trade for User A referencing NIFTY
      const tradeRes = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userACookie },
        payload: {
          accountId: userAAccountId,
          symbol: 'NIFTY24OCT24500CE',
          assetClass: 'OPTIONS',
          exchange: 'NSE',
          marketSegment: 'NSE_FNO',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: new Date().toISOString(),
          entryTime: new Date().toISOString(),
          exitTime: new Date().toISOString(),
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice: 150,
            exitPrice: 190,
            quantity: 50,
            contractMultiplier: 1,
            brokerage: 40,
            exchangeFees: 10,
            regulatoryFees: 5,
            taxes: 15,
          },
        },
      });

      expect(tradeRes.statusCode).toBe(201);
      const tradeBody = JSON.parse(tradeRes.body);
      expect(tradeBody.data.underlying).toBe('NIFTY');

      // Now query GET /api/v1/instruments for User A
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/instruments',
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const niftyData = body.data.find((i: any) => i.symbol === 'NIFTY');
      expect(niftyData).toBeDefined();
      expect(niftyData.tradeCount).toBe(1);
      // Gross: (190 - 150) * 50 = 2000. Fees: 70. Net: 1930.
      expect(niftyData.netPnL).toBeCloseTo(1930, 2);
      expect(niftyData.lastTradedAt).toBeDefined();
    });
  });

  describe('4. REST API: POST /api/v1/instruments (Custom Creation)', () => {
    it('creates custom instrument with source CUSTOM', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/instruments',
        headers: { cookie: userACookie },
        payload: {
          symbol: 'SILVER',
          displayName: 'Silver Futures Custom',
          assetClass: 'COMMODITY',
          exchange: 'MCX',
          marketSegment: 'MCX',
          quoteCurrency: 'INR',
          contractMultiplier: 30,
          lotSize: 1,
          tickSize: 1,
          quantityIncrement: 1,
          pricePrecision: 2,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.symbol).toBe('SILVER');
      expect(body.data.source).toBe('CUSTOM');
      expect(body.data.needsReview).toBe(false);
    });

    it('rejects duplicate symbol for the same user with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/instruments',
        headers: { cookie: userACookie },
        payload: {
          symbol: 'SILVER',
          displayName: 'Silver Futures Duplicate',
          assetClass: 'COMMODITY',
          exchange: 'MCX',
          marketSegment: 'MCX',
        },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('5. REST API: POST /api/v1/instruments/:id/preview-update', () => {
    it('previews trade recalculation impact without modifying database', async () => {
      const niftyInst = await Instrument.findOne({ userId: userAId, symbol: 'NIFTY' });
      expect(niftyInst).toBeDefined();

      const previewRes = await app.inject({
        method: 'POST',
        url: `/api/v1/instruments/${niftyInst!._id}/preview-update`,
        headers: { cookie: userACookie },
        payload: {
          contractMultiplier: 2, // Double multiplier
        },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body).data;
      expect(preview.tradesCount).toBe(1);
      expect(preview.oldTotalNetPnL).toBeCloseTo(1930, 2);
      // Double multiplier: Gross = 4000, Fees ~ 70 => Net ~ 3930
      expect(preview.newTotalNetPnL).toBeGreaterThan(preview.oldTotalNetPnL);

      // Verify trade in database was NOT modified
      const tradeDoc = await Trade.findOne({ userId: userAId, underlying: 'NIFTY' });
      expect(tradeDoc?.simpleExecution.contractMultiplier).toBe(1);
    });
  });

  describe('6. REST API: PUT /api/v1/instruments/:id (Cascade and non-cascade)', () => {
    it('updates without applyToTrades leaves trades untouched', async () => {
      const niftyInst = await Instrument.findOne({ userId: userAId, symbol: 'NIFTY' });
      expect(niftyInst).toBeDefined();

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/instruments/${niftyInst!._id}`,
        headers: { cookie: userACookie },
        payload: {
          contractMultiplier: 2,
          applyToTrades: false,
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const instAfter = await Instrument.findById(niftyInst!._id);
      expect(instAfter?.contractMultiplier).toBe(2);

      const tradeDoc = await Trade.findOne({ userId: userAId, underlying: 'NIFTY' });
      expect(tradeDoc?.simpleExecution.contractMultiplier).toBe(1);
    });

    it('updates with applyToTrades: true cascades to existing trades and reconciles balances', async () => {
      const niftyInst = await Instrument.findOne({ userId: userAId, symbol: 'NIFTY' });
      expect(niftyInst).toBeDefined();

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/instruments/${niftyInst!._id}`,
        headers: { cookie: userACookie },
        payload: {
          contractMultiplier: 2,
          applyToTrades: true,
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body);
      expect(body.success).toBe(true);
      expect(body.tradesModified).toBe(1);

      // Verify trade was updated
      const tradeDoc = await Trade.findOne({ userId: userAId, underlying: 'NIFTY' });
      expect(tradeDoc?.simpleExecution.contractMultiplier).toBe(2);
      expect(tradeDoc?.calculated.grossPnL).toBe(4000);

      // Verify account balance was reconciled
      const accountDoc = await TradingAccount.findById(userAAccountId);
      expect(Number(accountDoc?.realizedPnL)).toBeCloseTo(Number(tradeDoc?.calculated.netPnL), 2);
    });
  });

  describe('7. REST API: DELETE /api/v1/instruments/:id', () => {
    it('blocks deletion with 409 when instrument has trades', async () => {
      const niftyInst = await Instrument.findOne({ userId: userAId, symbol: 'NIFTY' });
      expect(niftyInst).toBeDefined();

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/instruments/${niftyInst!._id}`,
        headers: { cookie: userACookie },
      });

      expect(delRes.statusCode).toBe(409);
      const body = JSON.parse(delRes.body);
      expect(body.error?.message || body.message).toMatch(/reference it|referenced by/i);
    });

    it('allows deletion of unused custom instrument', async () => {
      const silverInst = await Instrument.findOne({ userId: userAId, symbol: 'SILVER' });
      expect(silverInst).toBeDefined();

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/instruments/${silverInst!._id}`,
        headers: { cookie: userACookie },
      });

      expect(delRes.statusCode).toBe(200);
      const count = await Instrument.countDocuments({ _id: silverInst!._id });
      expect(count).toBe(0);
    });
  });

  describe('8. Backfill Migration Script (Dry-run vs Live)', () => {
    it('runs dry-run and live migration without throwing', async () => {
      // Create an unlinked trade without instrumentId or underlying
      await Trade.create({
        userId: userAId,
        accountId: userAAccountId,
        symbol: 'BANKNIFTY24OCT51500CE',
        assetClass: 'OPTIONS',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date(),
        entryTime: new Date(),
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 200,
          exitPrice: 300,
          quantity: 15,
          contractMultiplier: 1,
        },
        calculated: { grossPnL: 1500, totalCosts: 50, netPnL: 1450, outcome: 'WIN' },
      });

      // Dry run
      const dryResult = await runBackfill({ isLive: false, targetUserId: userAId, skipConnect: true });
      expect(dryResult).toBeDefined();
      expect(dryResult.totalTradesLinked).toBeGreaterThanOrEqual(1);

      // Live run
      const liveResult = await runBackfill({ isLive: true, targetUserId: userAId, skipConnect: true });
      expect(liveResult).toBeDefined();
      expect(liveResult.totalTradesLinked).toBeGreaterThanOrEqual(1);
      expect(liveResult.totalRetained).toBeGreaterThanOrEqual(1);
    });
  });
});
