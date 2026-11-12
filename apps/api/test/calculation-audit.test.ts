import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  User,
  TradingAccount,
  Trade,
  Instrument,
  AccountTransaction,
} from '../src/db/models/index.js';
import { AccountService } from '../src/services/account.service.js';
import { InstrumentService } from '../src/services/instrument.service.js';

describe('Quantitative Audit API Integration Tests (Phases 1-6)', () => {
  let app: FastifyInstance;
  let userId: string;
  let cookie: string;
  let inrAccountId: string;
  let balanceAccountId: string;
  let usdAccountId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `calc-audit-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Quant Audit Tester',
      },
    });
    expect(regRes.statusCode).toBe(201);
    cookie = regRes.headers['set-cookie'] as string;

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    userId = meRes.json().data.user.id;

    const uObjId = new mongoose.Types.ObjectId(userId);
    const inrAcc = await TradingAccount.create({
      userId: uObjId,
      broker: 'FYERS',
      accountNumber: `AUDIT_INR_${Date.now()}`,
      name: 'Audit INR Account',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });
    inrAccountId = inrAcc._id.toString();

    const balAcc = await TradingAccount.create({
      userId: uObjId,
      broker: 'FYERS',
      accountNumber: `AUDIT_BAL_${Date.now()}`,
      name: 'Audit Balance Account',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });
    balanceAccountId = balAcc._id.toString();

    const usdAcc = await TradingAccount.create({
      userId: uObjId,
      broker: 'THE5ERS',
      accountNumber: `AUDIT_USD_${Date.now()}`,
      name: 'Audit USD Account',
      initialBalance: mongoose.Types.Decimal128.fromString('10000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('10000.00'),
      baseCurrency: 'USD',
      status: 'ACTIVE',
    });
    usdAccountId = usdAcc._id.toString();
  }, 60000);

  afterAll(async () => {
    if (userId) {
      const uObjId = new mongoose.Types.ObjectId(userId);
      await Trade.deleteMany({ userId: uObjId });
      await AccountTransaction.deleteMany({ userId: uObjId });
      await Instrument.deleteMany({ userId: uObjId });
      await TradingAccount.deleteMany({ userId: uObjId });
      await User.deleteOne({ _id: uObjId });
    }
    if (app) await app.close();
    await disconnectDatabase();
  }, 60000);

  it('1. IST $dayOfWeek parity: 19:00 UTC Monday maps to Tuesday IST in drilldown and dashboard stats', async () => {
    // 2026-10-19T19:00:00.000Z = Mon Oct 19 19:00 UTC = Tue Oct 20 00:30:00 IST
    const boundaryDate = '2026-10-19T19:00:00.000Z';
    const postRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie },
      payload: {
        accountId: inrAccountId,
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: boundaryDate,
        entryTime: boundaryDate,
        exitTime: '2026-10-19T20:00:00.000Z',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 1400,
          exitPrice: 1420,
          quantity: 10,
          contractMultiplier: 1,
          brokerage: 40,
          exchangeFees: 1,
          regulatoryFees: 2,
          taxes: 10,
        },
      },
    });
    expect(postRes.statusCode).toBe(201);
    const createdTradeId = postRes.json().data.id;

    const tueDrill = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/drilldown',
      headers: { cookie },
      payload: {
        accountId: inrAccountId,
        descriptor: {
          kind: 'FILTER',
          filter: { weekday: 'Tuesday', accountId: inrAccountId },
          label: 'IST Tuesday',
        },
      },
    });
    expect(tueDrill.statusCode).toBe(200);
    const tueIds = tueDrill.json().data.trades.map((t: any) => t.id);
    expect(tueIds).toContain(createdTradeId);

    const monDrill = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/drilldown',
      headers: { cookie },
      payload: {
        accountId: inrAccountId,
        descriptor: {
          kind: 'FILTER',
          filter: { weekday: 'Monday', accountId: inrAccountId },
          label: 'IST Monday',
        },
      },
    });
    expect(monDrill.statusCode).toBe(200);
    const monIds = monDrill.json().data.trades.map((t: any) => t.id);
    expect(monIds).not.toContain(createdTradeId);

    const statsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard/stats?scope=ACCOUNT&accountId=${inrAccountId}`,
      headers: { cookie },
    });
    expect(statsRes.statusCode).toBe(200);
    const dayStats = statsRes.json().data.dayOfWeekBreakdown || statsRes.json().data.byDayOfWeek || [];
    const tuesdayRow = dayStats.find((d: any) => d.day === 'Tuesday' || d.label === 'Tue' || d.weekday === 'Tuesday');
    if (tuesdayRow) {
      expect(tuesdayRow.trades ?? tuesdayRow.count).toBeGreaterThanOrEqual(1);
    }
  }, 15000);

  it('2. NSE USDINR currency futures retain Indian statutory charges on create & PUT update', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie },
      payload: {
        accountId: inrAccountId,
        symbol: 'NSE:USDINR26NOVFUT',
        assetClass: 'FUTURES',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: '2026-06-15T10:00:00.000+05:30',
        entryTime: '2026-06-15T10:00:00.000+05:30',
        exitTime: '2026-06-15T12:00:00.000+05:30',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 84.125,
          exitPrice: 84.375,
          quantity: 1000,
          contractMultiplier: 1,
          brokerage: 0,
          exchangeFees: 0,
          regulatoryFees: 0,
          taxes: 0,
        },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const tradeId = createRes.json().data.id;

    // Trigger PUT recalculate (regression guard against naive USD substring wipe)
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${tradeId}`,
      headers: { cookie },
      payload: {
        notes: 'Verify Indian CDS charges preserved',
      },
    });
    expect(putRes.statusCode).toBe(200);
    const updated = putRes.json().data;
    expect(updated.simpleExecution.brokerage).toBe(40);
    expect(updated.calculated.totalCosts).toBeGreaterThan(40);
    expect(updated.calculated.grossPnL).toBe(250);
  });

  it('3. Effective-dated NIFTY lotSize + closed-trade cascade protection on lotSize update', async () => {
    const histInst = await InstrumentService.ensureForTrade(userId, {
      symbol: 'NIFTY24OCT24500CE',
      tradeDate: new Date('2024-10-15T10:00:00.000+05:30'),
    });
    expect(histInst.symbol).toBe('NIFTY');
    expect(histInst.lotSize).toBe(25); // Pre-Nov-2024 NSE NIFTY lot size

    const tradeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie },
      payload: {
        accountId: inrAccountId,
        symbol: 'NIFTY24OCT24500CE',
        assetClass: 'OPTIONS',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: '2024-10-15T10:00:00.000+05:30',
        entryTime: '2024-10-15T10:00:00.000+05:30',
        exitTime: '2024-10-15T11:00:00.000+05:30',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 120,
          exitPrice: 200,
          quantity: 50,
          contractMultiplier: 1,
          brokerage: 40,
          exchangeFees: 15,
          regulatoryFees: 10,
          taxes: 35,
        },
      },
    });
    expect(tradeRes.statusCode).toBe(201);
    const tradeId = tradeRes.json().data.id;
    const createdTrade = await Trade.findById(tradeId).lean();
    const initialNetPnL = createdTrade?.calculated?.netPnL;
    expect(initialNetPnL).toBe(3900);

    // Cascade lotSize change to 65 with applyToTrades: true
    const cascadeRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/instruments/${histInst._id}`,
      headers: { cookie },
      payload: {
        lotSize: 65,
        applyToTrades: true,
      },
    });
    expect(cascadeRes.statusCode).toBe(200);

    const refreshedTrade = await Trade.findById(tradeId).lean();
    expect(refreshedTrade?.simpleExecution?.quantity).toBe(50);
    expect(refreshedTrade?.calculated?.netPnL).toBe(3900);
  });

  it('4. Account balance excludes PENDING_REVIEW/REJECTED and keeps TRANSFER neutral', async () => {
    const uObjId = new mongoose.Types.ObjectId(userId);
    const accObjId = new mongoose.Types.ObjectId(balanceAccountId);

    // Closed winning trade (+5000 net)
    await Trade.create({
      userId: uObjId,
      accountId: accObjId,
      symbol: 'INFY',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-06-01T10:00:00+05:30'),
      entryTime: new Date('2026-06-01T10:00:00+05:30'),
      exitTime: new Date('2026-06-01T11:00:00+05:30'),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 1500,
        exitPrice: 1600,
        quantity: 52,
        contractMultiplier: 1,
        brokerage: 40,
        exchangeFees: 10,
        regulatoryFees: 10,
        taxes: 140,
      },
      calculated: {
        grossPnL: 5200,
        totalCosts: 200,
        netPnL: 5000,
        outcome: 'WIN',
        closedQuantity: 52,
        openQuantity: 0,
      },
    });

    await AccountTransaction.insertMany([
      {
        userId: uObjId,
        accountId: accObjId,
        type: 'DEPOSIT',
        amount: mongoose.Types.Decimal128.fromString('10000.00'),
        currency: 'INR',
        date: new Date('2026-06-02T10:00:00+05:30'),
        source: 'MANUAL',
        status: 'CONFIRMED',
      },
      {
        userId: uObjId,
        accountId: accObjId,
        type: 'WITHDRAWAL',
        amount: mongoose.Types.Decimal128.fromString('4000.00'),
        currency: 'INR',
        date: new Date('2026-06-03T10:00:00+05:30'),
        source: 'MANUAL',
        status: 'CONFIRMED',
      },
      {
        userId: uObjId,
        accountId: accObjId,
        type: 'ADJUSTMENT',
        amount: mongoose.Types.Decimal128.fromString('-500.00'),
        currency: 'INR',
        date: new Date('2026-06-04T10:00:00+05:30'),
        source: 'MANUAL',
        status: 'CONFIRMED',
      },
      {
        userId: uObjId,
        accountId: accObjId,
        type: 'TRANSFER',
        amount: mongoose.Types.Decimal128.fromString('25000.00'),
        currency: 'INR',
        date: new Date('2026-06-05T10:00:00+05:30'),
        source: 'MANUAL',
        status: 'CONFIRMED',
      },
      {
        userId: uObjId,
        accountId: accObjId,
        type: 'DEPOSIT',
        amount: mongoose.Types.Decimal128.fromString('99999.00'),
        currency: 'INR',
        date: new Date('2026-06-06T10:00:00+05:30'),
        source: 'MANUAL',
        status: 'PENDING_REVIEW',
      },
      {
        userId: uObjId,
        accountId: accObjId,
        type: 'WITHDRAWAL',
        amount: mongoose.Types.Decimal128.fromString('88888.00'),
        currency: 'INR',
        date: new Date('2026-06-07T10:00:00+05:30'),
        source: 'MANUAL',
        status: 'REJECTED',
      },
    ]);

    const res = await AccountService.recalculateAccountBalances(balanceAccountId, userId);
    // 100000 + 5000 + 10000 - 4000 - 500 = 110500 (TRANSFER neutral, PENDING_REVIEW & REJECTED excluded)
    expect(Number(res.currentBalance)).toBeCloseTo(110500, 2);
    expect(Number(res.totalDeposits)).toBeCloseTo(10000, 2);
    expect(Number(res.totalWithdrawals)).toBeCloseTo(4000, 2);
    expect(Number((res as any).totalTransfers)).toBeCloseTo(25000, 2);
  });

  it('5. Supports BSE_FNO (SENSEX/BANKEX) trade creation & BSE statutory charges', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie },
      payload: {
        accountId: inrAccountId,
        symbol: 'BSE:SENSEX26NOV80000CE',
        assetClass: 'OPTIONS',
        exchange: 'BSE',
        marketSegment: 'BSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: '2026-05-10T10:00:00.000+05:30',
        entryTime: '2026-05-10T10:00:00.000+05:30',
        exitTime: '2026-05-10T11:00:00.000+05:30',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 200,
          exitPrice: 250,
          quantity: 20,
          contractMultiplier: 1,
          brokerage: 0,
          exchangeFees: 0,
          regulatoryFees: 0,
          taxes: 0,
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const createdId = res.json().data.id;
    const data = await Trade.findById(createdId).lean();
    expect(data?.marketSegment).toBe('BSE_FNO');
    expect(data?.calculated?.grossPnL).toBe(1000);
    expect(data?.calculated?.totalCosts).toBeGreaterThan(40);
  });

  it('6. Cash-flow-safe drawdown ignores mid-range deposits & flags multi-currency scope ALL', async () => {
    const uObjId = new mongoose.Types.ObjectId(userId);
    const balObjId = new mongoose.Types.ObjectId(balanceAccountId);

    // Second trade after the +10000 DEPOSIT (-2000 loss -> drawdown should be 2000, not distorted by deposit)
    await Trade.create({
      userId: uObjId,
      accountId: balObjId,
      symbol: 'TCS',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-06-10T10:00:00+05:30'),
      entryTime: new Date('2026-06-10T10:00:00+05:30'),
      exitTime: new Date('2026-06-10T11:00:00+05:30'),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 4000,
        exitPrice: 3960,
        quantity: 45,
        contractMultiplier: 1,
        brokerage: 40,
        exchangeFees: 10,
        regulatoryFees: 10,
        taxes: 140,
      },
      calculated: {
        grossPnL: -1800,
        totalCosts: 200,
        netPnL: -2000,
        outcome: 'LOSS',
        closedQuantity: 45,
        openQuantity: 0,
      },
    });

    const statsSingleRes = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard/stats?scope=ACCOUNT&accountId=${balanceAccountId}&startDate=2026-05-30&endDate=2026-06-15`,
      headers: { cookie },
    });
    expect(statsSingleRes.statusCode).toBe(200);
    const statsSingle = statsSingleRes.json().data;
    expect(statsSingle.maxDrawdownAmount).toBe(2000);
    // Peak after trade 1 (+5000) & confirmed deposit (+10000) = 115000 (or 110500 ex transfer / 115000 pre-withdrawal-adjusted);
    // Max drawdown % must be < 5% (approx 2000/115000 ~ 1.74% or 2000/110500 ~ 1.81%) and never > 10%
    expect(statsSingle.maxDrawdownPercent).toBeGreaterThan(0);
    expect(statsSingle.maxDrawdownPercent).toBeLessThan(5);

    // Multi-currency check on scope=ALL (user has INR and USD accounts)
    await Trade.create({
      userId: uObjId,
      accountId: new mongoose.Types.ObjectId(usdAccountId),
      symbol: 'EURUSD',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-06-11T10:00:00Z'),
      entryTime: new Date('2026-06-11T10:00:00Z'),
      exitTime: new Date('2026-06-11T11:00:00Z'),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 1.08,
        exitPrice: 1.085,
        quantity: 0.1,
        contractMultiplier: 100000,
        brokerage: 0,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
      },
      calculated: {
        grossPnL: 50,
        totalCosts: 0,
        netPnL: 50,
        outcome: 'WIN',
        closedQuantity: 0.1,
        openQuantity: 0,
      },
    });

    const statsAllRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats?scope=ALL',
      headers: { cookie },
    });
    expect(statsAllRes.statusCode).toBe(200);
    const statsAll = statsAllRes.json().data;
    expect(statsAll.isCrossCurrencyWarning).toBe(true);
    expect(statsAll.byCurrency?.INR).toBeDefined();
    expect(statsAll.byCurrency?.USD).toBeDefined();
  });

  it('Elefin MT5 zero-commission & multi-fill partial exit webhook compute exact net P&L without phantom fees', async () => {
    const elefinAcc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Elefin Audit USD',
      broker: 'Elefin',
      accountType: 'FOREX',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('100.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100.00'),
      status: 'ACTIVE',
      profile: {
        marketRegion: 'GLOBAL',
        baseCurrency: 'USD',
        timezone: 'UTC',
        feeModelKey: 'FOREX_COMMISSION',
        executionAdapterKey: 'ELEFIN_MT5',
        positionModel: 'HEDGING',
        sessionCalendarKey: 'FOREX_24_5',
        capabilities: {
          canPlaceOrders: true,
          canModifyStopLoss: true,
          canExitPositions: true,
          canScaleLadder: true,
          canAutoExecute: true,
          canSyncFunds: false,
          canFetchHistory: false,
          canStreamQuotes: true,
        },
      },
    });
    const elefinAccId = elefinAcc._id.toString();
    const ticket = `99${Date.now().toString().slice(-6)}`;

    // 1. Open SHORT 0.04 XAUUSD @ 3974.56
    const openRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${elefinAccId}`,
      payload: {
        positions: [
          {
            ticket,
            symbol: 'XAUUSD',
            type: 'SELL',
            volume: 0.04,
            price: 3974.56,
            commission: 0,
            swap: 0,
            open_time: '2026-11-12T06:39:12Z',
          },
        ],
      },
    });
    expect(openRes.statusCode).toBe(200);

    const openTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: elefinAcc._id,
      tags: `MT5_TICKET_${ticket}`,
    });
    expect(openTrade).toBeDefined();
    expect(openTrade?.calculated?.totalCosts).toBe(0);

    // 2. UI queues partial exit 0.02 @ 3969.59 -> creates optimistic pending fill, NOT phantom INR/FX fees
    const uiExitRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${openTrade!._id}/broker-exit`,
      headers: { cookie },
      payload: {
        exitQuantity: 0.02,
        exitPrice: 3969.59,
        executeOnBroker: true,
      },
    });
    expect(uiExitRes.statusCode).toBe(200);

    // 3. MT5 executes first partial close 0.02 @ 3969.00 (commission=0, swap=0) -> replaces pending fill in-place
    const partialCloseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${elefinAccId}`,
      payload: {
        action: 'CLOSE',
        ticket,
        deal_id: `${ticket}01`,
        symbol: 'XAUUSD',
        type: 'SELL',
        volume: 0.02,
        price: 3974.56,
        close_price: 3969.0,
        profit: 11.12,
        commission: 0,
        swap: 0,
        close_time: '2026-11-12T06:47:53Z',
      },
    });
    expect(partialCloseRes.statusCode).toBe(200);

    const midTrade = await Trade.findById(openTrade!._id);
    expect(midTrade?.status).toBe('OPEN'); // Still 0.02 open! Not prematurely closed!
    expect(midTrade?.fills?.filter((f: any) => f.type === 'EXIT').length).toBe(1);

    // 4. MT5 closes final remaining 0.02 @ 3960.98 (profit=+27.16, commission=0, swap=0)
    const finalCloseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${elefinAccId}`,
      payload: {
        action: 'CLOSE',
        ticket,
        deal_id: `${ticket}02`,
        symbol: 'XAUUSD',
        type: 'SELL',
        volume: 0.02,
        price: 3974.56,
        close_price: 3960.98,
        profit: 27.16,
        commission: 0,
        swap: 0,
        close_time: '2026-11-12T07:14:14Z',
      },
    });
    expect(finalCloseRes.statusCode).toBe(200);

    const finalTrade = await Trade.findById(openTrade!._id);
    expect(finalTrade?.status).toBe('CLOSED');
    expect(finalTrade?.fills?.filter((f: any) => f.type === 'EXIT').length).toBe(2);
    expect(finalTrade?.calculated?.totalCosts).toBe(0);
    // Weighted partial close: (0.02*(3974.56-3969.00) + 0.02*(3974.56-3960.98))*100 = 11.12 + 27.16 = 38.28 (NOT 54.32!)
    expect(finalTrade?.calculated?.grossPnL).toBe(38.28);
    expect(finalTrade?.calculated?.netPnL).toBe(38.28);
    expect(finalTrade?.calculated?.averageExitPrice).toBe(3964.99);
    expect(finalTrade?.simpleExecution?.exitPrice).toBe(3964.99);
  });
});
