import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  User,
  TradingAccount,
  Trade,
  Strategy,
  TradeTemplate,
  Instrument,
  DailyJournal,
  WeeklyReview,
  AlertState,
  Attachment,
  BrokerIntegration,
  AccountTransaction,
} from '../src/db/models/index.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';

describe('End-to-End Account Scope Isolation Audit Suite', () => {
  let app: any;
  let cookieA: string;
  let cookieB: string;
  let userAId: string;
  let userBId: string;

  // User A Accounts
  let accProp5ersId: string;
  let accPropFtmoId: string;
  let accLiveFyersId: string;
  let accLiveCryptoId: string;
  let accDemoId: string;
  let accArchivedPropId: string;

  // User B Accounts
  let accUserBPropId: string;
  let accUserBLiveId: string;

  // User A Strategies & Templates
  let stratProp5ersId: string;
  let stratPropFtmoId: string;
  let stratLiveFyersId: string;
  let stratLiveCryptoId: string;
  let stratDemoId: string;

  let tplProp5ersId: string;
  let tplPropFtmoId: string;
  let tplLiveFyersId: string;

  // User A Trades
  let trade5ersClosedId: string;
  let trade5ersOpenId: string;
  let tradeFtmoClosedId: string;
  let tradeFtmoOpenId: string;
  let tradeFyersClosedId: string;
  let tradeFyersOpenId: string;
  let tradeCryptoClosedId: string;
  let tradeDemoClosedId: string;
  let tradeArchivedClosedId: string;
  let tradeArchivedOpenId: string;
  let tradeUserBPropId: string;

  // Distinct PnL signatures (powers of 1111 / powers of 2 so any sum uniquely identifies the subset)
  const PNL_5ERS = 1111;
  const PNL_FTMO = 2222;
  const PNL_FYERS = 4444;
  const PNL_CRYPTO = 8888;
  const PNL_DEMO = 16000;
  const PNL_ARCHIVED = 32000;
  const PNL_USERB_PROP = 64000;
  const PNL_USERB_LIVE = 128000;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    const testUsers = await User.find({ email: { $in: ['scope-audit-a@setupmint.local', 'scope-audit-b@setupmint.local'] } });
    const testUserIds = testUsers.map((u) => u._id);

    await Promise.all([
      User.deleteMany({ _id: { $in: testUserIds } }),
      TradingAccount.deleteMany({ userId: { $in: testUserIds } }),
      Trade.deleteMany({ userId: { $in: testUserIds } }),
      Strategy.deleteMany({ userId: { $in: testUserIds } }),
      TradeTemplate.deleteMany({ userId: { $in: testUserIds } }),
      Instrument.deleteMany({ userId: { $in: testUserIds } }),
      DailyJournal.deleteMany({ userId: { $in: testUserIds } }),
      WeeklyReview.deleteMany({ userId: { $in: testUserIds } }),
      AlertState.deleteMany({ userId: { $in: testUserIds } }),
      Attachment.deleteMany({ userId: { $in: testUserIds } }),
      BrokerIntegration.deleteMany({ userId: { $in: testUserIds } }),
      AccountTransaction.deleteMany({ userId: { $in: testUserIds } }),
    ]);

    // 1. Register User A & User B
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'scope-audit-a@setupmint.local',
        password: 'Password123!',
        name: 'Audit Trader A',
      },
    });
    expect(regA.statusCode).toBe(201);
    cookieA = regA.headers['set-cookie'];
    userAId = regA.json().data.user.id;

    // Configure User A personal riskSettings (INR maxDailyLoss = 3000)
    await User.findByIdAndUpdate(userAId, {
      $set: {
        riskSettings: {
          maxDailyLoss: 3000,
          maxDailyTrades: 3,
          maxRiskPerTradePercent: 2,
          maxWeeklyLoss: 9000,
          maxOpenPositions: 3,
          minRiskRewardRatio: 1.5,
        },
      },
    });

    // Connect FYERS integration for User A to verify prop trades do not inherit FYERS live feed
    await BrokerIntegration.create({
      userId: new mongoose.Types.ObjectId(userAId),
      broker: 'FYERS',
      status: 'CONNECTED',
      appId: 'TEST_APP_ID',
      secretKey: 'TEST_SECRET',
      accessToken: 'TEST_FYERS_TOKEN',
      tokenExpiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      autoSyncEnabled: false,
    });

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'scope-audit-b@setupmint.local',
        password: 'Password123!',
        name: 'Audit Trader B',
      },
    });
    expect(regB.statusCode).toBe(201);
    cookieB = regB.headers['set-cookie'];
    userBId = regB.json().data.user.id;

    // 2. Create User A Accounts (2 Prop USD, 2 Live [FYERS INR + CRYPTO USD], 1 Demo INR, 1 Archived Prop USD)
    const acc5ers = await TradingAccount.create({
      userId: userAId,
      name: 'The5ers 100K High Stakes',
      broker: 'THE5ERS',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('100000'),
      currentBalance: mongoose.Types.Decimal128.fromString('101111'),
      status: 'ACTIVE',
      propFirm: {
        firmKey: 'the5ers',
        planKey: 'the5ers_high_stakes_100k',
        phase: 'PHASE_1',
        startingBalance: 100000,
        status: 'ACTIVE',
      },
      propFirmConfig: {
        enabled: true,
        firm: 'THE5ERS',
        planName: 'High Stakes 100K',
        phase: 'PHASE_1',
        initialBalance: 100000,
        dailyLossLimitPercent: 5, // $5,000 daily loss limit
        maxLossLimitPercent: 10,
        targetProfitPercent: 8,
        status: 'ACTIVE',
      },
    });
    accProp5ersId = acc5ers._id.toString();

    // Note: Intentionally omit propFirmConfig.firm so Mongoose sets its default 'THE5ERS',
    // verifying that firmKey=THE5ERS does NOT leak this FTMO account!
    const accFtmo = await TradingAccount.create({
      userId: userAId,
      name: 'FTMO 50K Challenge',
      broker: 'FTMO',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('50000'),
      currentBalance: mongoose.Types.Decimal128.fromString('52222'),
      status: 'ACTIVE',
      propFirm: {
        firmKey: 'ftmo',
        planKey: 'ftmo_normal_50k',
        phase: 'PHASE_1',
        startingBalance: 50000,
        status: 'ACTIVE',
      },
    });
    accPropFtmoId = accFtmo._id.toString();

    const accFyers = await TradingAccount.create({
      userId: userAId,
      name: 'FYERS Personal F&O',
      broker: 'FYERS',
      accountType: 'FUTURES_OPTIONS',
      baseCurrency: 'INR',
      initialBalance: mongoose.Types.Decimal128.fromString('200000'),
      currentBalance: mongoose.Types.Decimal128.fromString('204444'),
      status: 'ACTIVE',
    });
    accLiveFyersId = accFyers._id.toString();

    const accCrypto = await TradingAccount.create({
      userId: userAId,
      name: 'Binance Personal Crypto',
      broker: 'BINANCE',
      accountType: 'CRYPTO',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('10000'),
      currentBalance: mongoose.Types.Decimal128.fromString('18888'),
      status: 'ACTIVE',
    });
    accLiveCryptoId = accCrypto._id.toString();

    const accDemo = await TradingAccount.create({
      userId: userAId,
      name: 'Paper Trading Sandbox',
      broker: 'OTHER',
      accountType: 'DEMO',
      baseCurrency: 'INR',
      initialBalance: mongoose.Types.Decimal128.fromString('500000'),
      currentBalance: mongoose.Types.Decimal128.fromString('516000'),
      status: 'ACTIVE',
    });
    accDemoId = accDemo._id.toString();

    const accArch = await TradingAccount.create({
      userId: userAId,
      name: 'Archived 5ers Evaluation',
      broker: 'THE5ERS',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('25000'),
      currentBalance: mongoose.Types.Decimal128.fromString('57000'),
      status: 'ARCHIVED',
      propFirm: {
        firmKey: 'the5ers',
        planKey: 'the5ers_high_stakes_25k',
        phase: 'PHASE_1',
        startingBalance: 25000,
        status: 'PASSED',
      },
      propFirmConfig: {
        enabled: true,
        firm: 'THE5ERS',
        initialBalance: 25000,
        dailyLossLimitPercent: 5,
        maxLossLimitPercent: 10,
        targetProfitPercent: 8,
        status: 'PASSED',
      },
    });
    accArchivedPropId = accArch._id.toString();

    // 3. Create User B Accounts
    const accBProp = await TradingAccount.create({
      userId: userBId,
      name: 'User B 5ers Prop',
      broker: 'THE5ERS',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('100000'),
      currentBalance: mongoose.Types.Decimal128.fromString('164000'),
      status: 'ACTIVE',
      propFirm: { firmKey: 'the5ers', startingBalance: 100000, status: 'ACTIVE' },
    });
    accUserBPropId = accBProp._id.toString();

    const accBLive = await TradingAccount.create({
      userId: userBId,
      name: 'User B FYERS Live',
      broker: 'FYERS',
      accountType: 'EQUITY',
      baseCurrency: 'INR',
      initialBalance: mongoose.Types.Decimal128.fromString('300000'),
      currentBalance: mongoose.Types.Decimal128.fromString('428000'),
      status: 'ACTIVE',
    });
    accUserBLiveId = accBLive._id.toString();

    // 4. Create Strategies & Templates for User A
    const [s5ers, sFtmo, sFyers, sCrypto, sDemo] = await Promise.all([
      Strategy.create({
        userId: userAId,
        name: 'StratProp5ers',
        assetClasses: ['FOREX'],
        timeframes: ['15m'],
        isActive: true,
        variants: [{ key: 'V_5ERS', name: '5ers Sweep' }],
      }),
      Strategy.create({
        userId: userAId,
        name: 'StratPropFtmo',
        assetClasses: ['FOREX'],
        timeframes: ['1h'],
        isActive: true,
        variants: [{ key: 'V_FTMO', name: 'FTMO Breakout' }],
      }),
      Strategy.create({
        userId: userAId,
        name: 'StratLiveFyers',
        assetClasses: ['FUTURES'],
        timeframes: ['5m'],
        isActive: true,
        variants: [{ key: 'V_FYERS', name: 'Nifty ORB' }],
      }),
      Strategy.create({
        userId: userAId,
        name: 'StratLiveCrypto',
        assetClasses: ['CRYPTO'],
        timeframes: ['15m'],
        isActive: true,
      }),
      Strategy.create({
        userId: userAId,
        name: 'StratDemo',
        assetClasses: ['EQUITY'],
        timeframes: ['1d'],
        isActive: true,
      }),
    ]);
    stratProp5ersId = s5ers._id.toString();
    stratPropFtmoId = sFtmo._id.toString();
    stratLiveFyersId = sFyers._id.toString();
    stratLiveCryptoId = sCrypto._id.toString();
    stratDemoId = sDemo._id.toString();

    const [t5ers, tFtmo, tFyers] = await Promise.all([
      TradeTemplate.create({
        userId: userAId,
        name: 'TplProp5ers',
        group: 'FOREX_GOLD',
        markets: ['FOREX'],
        direction: 'LONG',
        slRule: { type: 'MANUAL' },
        titlePattern: '{symbol} 5ers Sweep',
        usageCount: 5, // Intentionally non-zero stored usageCount to test scoped override
      }),
      TradeTemplate.create({
        userId: userAId,
        name: 'TplPropFtmo',
        group: 'FOREX_GOLD',
        markets: ['FOREX'],
        direction: 'SHORT',
        slRule: { type: 'MANUAL' },
        titlePattern: '{symbol} FTMO Breakout',
        usageCount: 3,
      }),
      TradeTemplate.create({
        userId: userAId,
        name: 'TplLiveFyers',
        group: 'FNO',
        markets: ['FUTURES'],
        direction: 'LONG',
        slRule: { type: 'MANUAL' },
        titlePattern: '{symbol} Nifty ORB',
        usageCount: 9,
      }),
    ]);
    tplProp5ersId = t5ers._id.toString();
    tplPropFtmoId = tFtmo._id.toString();
    tplLiveFyersId = tFyers._id.toString();

    // 5. Create Instruments for User A
    const [instXau, instEur, instNifty, instBtc, instRel] = await Instrument.insertMany([
      {
        userId: userAId,
        symbol: 'XAUUSD',
        displayName: 'Gold Spot USD',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        contractMultiplier: 100,
        tickSize: 0.01,
        quoteCurrency: 'USD',
      },
      {
        userId: userAId,
        symbol: 'EURUSD',
        displayName: 'Euro USD',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        contractMultiplier: 100000,
        tickSize: 0.0001,
        quoteCurrency: 'USD',
      },
      {
        userId: userAId,
        symbol: 'NIFTY26OCTFUT',
        displayName: 'Nifty Oct Futures',
        assetClass: 'FUTURES',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        contractMultiplier: 1,
        lotSize: 25,
        tickSize: 0.05,
        quoteCurrency: 'INR',
      },
      {
        userId: userAId,
        symbol: 'BTCUSDT',
        displayName: 'Bitcoin USDT',
        assetClass: 'CRYPTO',
        exchange: 'CRYPTO',
        marketSegment: 'CRYPTO',
        contractMultiplier: 1,
        tickSize: 0.1,
        quoteCurrency: 'USD',
      },
      {
        userId: userAId,
        symbol: 'RELIANCE',
        displayName: 'Reliance Industries',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        contractMultiplier: 1,
        tickSize: 0.05,
        quoteCurrency: 'INR',
      },
    ]);

    // 6. Create Distinguishable Closed & Open Trades for every account (ISO Week 2026-W42: 2026-10-12 to 2026-10-16)
    const makeClosedTrade = (overrides: any) => ({
      userId: userAId,
      status: 'CLOSED',
      executionMode: 'SIMPLE',
      direction: 'LONG',
      simpleExecution: {
        entryPrice: 100,
        exitPrice: 110,
        quantity: 10,
        contractMultiplier: 1,
        brokerage: 0,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
      },
      risk: {
        plannedEntryPrice: 100,
        initialStopLoss: 95,
        plannedTarget: 120,
        riskBudgetAmount: 500,
        estimatedRiskAmount: 500,
        realizedRMultiple: 2.0,
      },
      calculated: {
        grossPnL: overrides.netPnL,
        totalCosts: 0,
        netPnL: overrides.netPnL,
        outcome: overrides.netPnL >= 0 ? 'WIN' : 'LOSS',
        realizedRMultiple: 2.0,
        holdingTimeMinutes: 45,
        excursion: {
          status: 'COMPUTED',
          maePoints: 2,
          mfePoints: 12,
          maeAmount: 100,
          mfeAmount: overrides.netPnL + 200,
          maeR: 0.4,
          mfeR: 2.4,
          captureEfficiencyPct: 83.3,
          barResolution: '1m',
          barsCount: 45,
          computedAt: new Date('2026-10-12T12:00:00Z'),
          pathSummary: {
            bars: [
              { t: 1760263200, o: 100, h: 105, l: 98, c: 104 },
              { t: 1760266800, o: 104, h: 112, l: 103, c: 110 },
            ],
          },
        },
      },
      ...overrides,
    });

    const t5ersClosed = await Trade.create(
      makeClosedTrade({
        accountId: accProp5ersId,
        instrumentId: instXau._id,
        symbol: 'XAUUSD',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        session: 'LONDON',
        strategyId: stratProp5ersId,
        templateId: tplProp5ersId,
        setup: { variantKey: 'V_5ERS', variantStatus: 'CLASSIFIED' },
        tradeDate: new Date('2026-10-12T10:00:00Z'),
        entryTime: new Date('2026-10-12T10:00:00Z'),
        exitTime: new Date('2026-10-12T10:45:00Z'),
        netPnL: PNL_5ERS,
        importBatchId: 'batch-5ers',
        psychology: {
          emotionBefore: 'CONFIDENT',
          emotionAfter: 'DISCIPLINED',
          disciplineScore: 5,
          rulesFollowed: true,
          mistakes: ['FOMO'],
        },
      })
    );
    trade5ersClosedId = t5ersClosed._id.toString();

    const tFtmoClosed = await Trade.create(
      makeClosedTrade({
        accountId: accPropFtmoId,
        instrumentId: instEur._id,
        symbol: 'EURUSD',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        session: 'NEW_YORK',
        strategyId: stratPropFtmoId,
        templateId: tplPropFtmoId,
        setup: { variantKey: 'V_FTMO', variantStatus: 'CLASSIFIED' },
        tradeDate: new Date('2026-10-13T14:00:00Z'),
        entryTime: new Date('2026-10-13T14:00:00Z'),
        exitTime: new Date('2026-10-13T14:45:00Z'),
        netPnL: PNL_FTMO,
        importBatchId: 'batch-ftmo',
        psychology: {
          emotionBefore: 'CALM',
          emotionAfter: 'CONFIDENT',
          disciplineScore: 4,
          rulesFollowed: true,
          mistakes: ['CHASED_MARKET'],
        },
      })
    );
    tradeFtmoClosedId = tFtmoClosed._id.toString();

    const tFyersClosed = await Trade.create(
      makeClosedTrade({
        accountId: accLiveFyersId,
        instrumentId: instNifty._id,
        symbol: 'NIFTY26OCTFUT',
        assetClass: 'FUTURES',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        session: 'NSE_REGULAR',
        strategyId: stratLiveFyersId,
        templateId: tplLiveFyersId,
        setup: { variantKey: 'V_FYERS', variantStatus: 'CLASSIFIED' },
        tradeDate: new Date('2026-10-14T05:00:00Z'),
        entryTime: new Date('2026-10-14T05:00:00Z'),
        exitTime: new Date('2026-10-14T05:45:00Z'),
        netPnL: PNL_FYERS,
        importBatchId: 'batch-fyers',
        psychology: {
          emotionBefore: 'ANXIOUS',
          emotionAfter: 'RELIEVED',
          disciplineScore: 3,
          rulesFollowed: false,
          mistakes: ['PREMATURE_EXIT'],
        },
      })
    );
    tradeFyersClosedId = tFyersClosed._id.toString();

    const tCryptoClosed = await Trade.create(
      makeClosedTrade({
        accountId: accLiveCryptoId,
        instrumentId: instBtc._id,
        symbol: 'BTCUSDT',
        assetClass: 'CRYPTO',
        exchange: 'CRYPTO',
        marketSegment: 'CRYPTO',
        session: 'ASIA',
        strategyId: stratLiveCryptoId,
        tradeDate: new Date('2026-10-15T02:00:00Z'),
        entryTime: new Date('2026-10-15T02:00:00Z'),
        exitTime: new Date('2026-10-15T02:45:00Z'),
        netPnL: PNL_CRYPTO,
        importBatchId: 'batch-crypto',
        psychology: {
          emotionBefore: 'FOCUSED',
          emotionAfter: 'EUPHORIC',
          disciplineScore: 4,
          rulesFollowed: true,
          mistakes: ['OVERTRADING'],
        },
      })
    );
    tradeCryptoClosedId = tCryptoClosed._id.toString();

    const tDemoClosed = await Trade.create(
      makeClosedTrade({
        accountId: accDemoId,
        instrumentId: instRel._id,
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        session: 'NSE_REGULAR',
        strategyId: stratDemoId,
        tradeDate: new Date('2026-10-16T06:00:00Z'),
        entryTime: new Date('2026-10-16T06:00:00Z'),
        exitTime: new Date('2026-10-16T06:45:00Z'),
        netPnL: PNL_DEMO,
        importBatchId: 'batch-demo',
        psychology: {
          emotionBefore: 'NEUTRAL',
          emotionAfter: 'CALM',
          disciplineScore: 5,
          rulesFollowed: true,
          mistakes: ['POOR_RR'],
        },
      })
    );
    tradeDemoClosedId = tDemoClosed._id.toString();

    const tArchivedClosed = await Trade.create(
      makeClosedTrade({
        accountId: accArchivedPropId,
        symbol: 'GBPUSD_ARCH',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        session: 'LONDON',
        strategyId: stratProp5ersId,
        templateId: tplProp5ersId,
        tradeDate: new Date('2026-10-16T11:00:00Z'),
        entryTime: new Date('2026-10-16T11:00:00Z'),
        exitTime: new Date('2026-10-16T11:45:00Z'),
        netPnL: PNL_ARCHIVED,
        importBatchId: 'batch-archived',
        psychology: {
          emotionBefore: 'FEARFUL',
          emotionAfter: 'FRUSTRATED',
          disciplineScore: 2,
          rulesFollowed: false,
          mistakes: ['LATE_ENTRY'],
        },
      })
    );
    tradeArchivedClosedId = tArchivedClosed._id.toString();

    // Open Trades for User A (5ers, FTMO, FYERS, Archived)
    const [t5ersOpen, tFtmoOpen, tFyersOpen, tArchOpen] = await Promise.all([
      Trade.create({
        userId: userAId,
        accountId: accProp5ersId,
        symbol: 'XAUUSD_OPEN',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        direction: 'LONG',
        status: 'OPEN',
        executionMode: 'SIMPLE',
        strategyId: stratProp5ersId,
        tradeDate: new Date('2026-10-16T12:00:00Z'),
        entryTime: new Date('2026-10-16T12:00:00Z'),
        simpleExecution: { entryPrice: 2600, quantity: 1, contractMultiplier: 100 },
        risk: { plannedEntryPrice: 2600, initialStopLoss: 2580, plannedTarget: 2650, riskBudgetAmount: 2000 },
        calculated: { openQuantity: 1, averageEntryPrice: 2600, grossPnL: 0, totalCosts: 0, netPnL: 0 },
      }),
      Trade.create({
        userId: userAId,
        accountId: accPropFtmoId,
        symbol: 'EURUSD_OPEN',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        direction: 'SHORT',
        status: 'OPEN',
        executionMode: 'SIMPLE',
        strategyId: stratPropFtmoId,
        tradeDate: new Date('2026-10-16T13:00:00Z'),
        entryTime: new Date('2026-10-16T13:00:00Z'),
        simpleExecution: { entryPrice: 1.09, quantity: 1, contractMultiplier: 100000 },
        risk: { plannedEntryPrice: 1.09, initialStopLoss: 1.10, plannedTarget: 1.07, riskBudgetAmount: 1000 },
        calculated: { openQuantity: 1, averageEntryPrice: 1.09, grossPnL: 0, totalCosts: 0, netPnL: 0 },
      }),
      Trade.create({
        userId: userAId,
        accountId: accLiveFyersId,
        symbol: 'BANKNIFTY26OCTFUT',
        assetClass: 'FUTURES',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        direction: 'LONG',
        status: 'OPEN',
        executionMode: 'SIMPLE',
        strategyId: stratLiveFyersId,
        tradeDate: new Date('2026-10-16T08:00:00Z'),
        entryTime: new Date('2026-10-16T08:00:00Z'),
        simpleExecution: { entryPrice: 51000, quantity: 15, contractMultiplier: 1 },
        risk: { plannedEntryPrice: 51000, initialStopLoss: 50800, plannedTarget: 51500, riskBudgetAmount: 3000 },
        calculated: { openQuantity: 15, averageEntryPrice: 51000, grossPnL: 0, totalCosts: 0, netPnL: 0 },
      }),
      Trade.create({
        userId: userAId,
        accountId: accArchivedPropId,
        symbol: 'GBPUSD_ARCH_OPEN',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        direction: 'LONG',
        status: 'OPEN',
        executionMode: 'SIMPLE',
        tradeDate: new Date('2026-10-16T09:00:00Z'),
        entryTime: new Date('2026-10-16T09:00:00Z'),
        simpleExecution: { entryPrice: 1.3, quantity: 1, contractMultiplier: 100000 },
        risk: { plannedEntryPrice: 1.3, initialStopLoss: 1.29, plannedTarget: 1.32, riskBudgetAmount: 1000 },
        calculated: { openQuantity: 1, averageEntryPrice: 1.3, grossPnL: 0, totalCosts: 0, netPnL: 0 },
      }),
    ]);
    trade5ersOpenId = t5ersOpen._id.toString();
    tradeFtmoOpenId = tFtmoOpen._id.toString();
    tradeFyersOpenId = tFyersOpen._id.toString();
    tradeArchivedOpenId = tArchOpen._id.toString();

    // 7. Create AlertState records for each open trade
    await AlertState.insertMany([
      {
        userId: userAId,
        tradeId: t5ersOpen._id,
        chatId: '12345',
        type: 'STOP_THREAT',
        state: 'ACTIVE',
        severity: 2,
        enterCount: 1,
        pingCount: 1,
        firstAt: new Date(),
        lastSentAt: new Date(),
      },
      {
        userId: userAId,
        tradeId: tFtmoOpen._id,
        chatId: '12345',
        type: 'GIVEBACK',
        state: 'ACTIVE',
        severity: 2,
        enterCount: 1,
        pingCount: 1,
        firstAt: new Date(),
        lastSentAt: new Date(),
      },
      {
        userId: userAId,
        tradeId: tFyersOpen._id,
        chatId: '12345',
        type: 'LADDER',
        state: 'ACTIVE',
        severity: 1,
        enterCount: 1,
        pingCount: 1,
        firstAt: new Date(),
        lastSentAt: new Date(),
      },
      {
        userId: userAId,
        tradeId: tArchOpen._id,
        chatId: '12345',
        type: 'STOP_THREAT',
        state: 'ACTIVE',
        severity: 3,
        enterCount: 1,
        pingCount: 1,
        firstAt: new Date(),
        lastSentAt: new Date(),
      },
    ]);

    // 8. Create DailyJournal (with bestTradeId pointing to FYERS Live trade) & WeeklyReviews
    await DailyJournal.create({
      userId: userAId,
      date: '2026-10-14',
      marketBias: 'BULLISH',
      emotionalState: 'CALM',
      disciplineRating: 4,
      lessonsLearned: 'Followed Nifty ORB rules',
      bestTradeId: tFyersClosed._id,
    });

    await WeeklyReview.insertMany([
      {
        userId: userAId,
        week: '2026-W42',
        startDate: '2026-10-12',
        endDate: '2026-10-18',
        accountId: null, // Consolidated ALL-scope finalized review
        status: 'FINALIZED',
        snapshot: {
          weekSummary: {
            netPnL: PNL_5ERS + PNL_FTMO + PNL_FYERS + PNL_CRYPTO + PNL_DEMO,
            winRate: 100,
            tradeCount: 5,
            avgRealizedR: 2.0,
          },
          discipline: { averageRating: 4.2 },
        },
        focusRule: { code: 'ALL_RULE', text: 'Global rule' },
        generatedAt: new Date(),
      },
      {
        userId: userAId,
        week: '2026-W42',
        startDate: '2026-10-12',
        endDate: '2026-10-18',
        accountId: acc5ers._id,
        status: 'FINALIZED',
        snapshot: {
          weekSummary: { netPnL: PNL_5ERS, winRate: 100, tradeCount: 1, avgRealizedR: 2.0 },
          discipline: { averageRating: 5.0 },
        },
        focusRule: { code: '5ERS_RULE', text: '5ers rule' },
        generatedAt: new Date(),
      },
      {
        userId: userAId,
        week: '2026-W42',
        startDate: '2026-10-12',
        endDate: '2026-10-18',
        accountId: accFyers._id,
        status: 'FINALIZED',
        snapshot: {
          weekSummary: { netPnL: PNL_FYERS, winRate: 100, tradeCount: 1, avgRealizedR: 2.0 },
          discipline: { averageRating: 3.0 },
        },
        focusRule: { code: 'FYERS_RULE', text: 'Fyers rule' },
        generatedAt: new Date(),
      },
    ]);

    // 9. Create User B Trades (Cross-Tenant) & Attachments
    const [tUserBProp] = await Trade.insertMany([
      makeClosedTrade({
        userId: userBId,
        accountId: accUserBPropId,
        symbol: 'XAUUSD_USERB',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        session: 'LONDON',
        tradeDate: new Date('2026-10-12T10:00:00Z'),
        entryTime: new Date('2026-10-12T10:00:00Z'),
        exitTime: new Date('2026-10-12T10:45:00Z'),
        netPnL: PNL_USERB_PROP,
      }),
      makeClosedTrade({
        userId: userBId,
        accountId: accUserBLiveId,
        symbol: 'NIFTY_USERB',
        assetClass: 'FUTURES',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        session: 'NSE_REGULAR',
        tradeDate: new Date('2026-10-14T05:00:00Z'),
        entryTime: new Date('2026-10-14T05:00:00Z'),
        exitTime: new Date('2026-10-14T05:45:00Z'),
        netPnL: PNL_USERB_LIVE,
      }),
    ]);
    tradeUserBPropId = tUserBProp._id.toString();

    await Attachment.insertMany([
      {
        userId: userAId,
        tradeId: t5ersClosed._id,
        originalName: '5ers-xauusd-entry.png',
        storedFilename: 'scope-test-5ers-entry.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        category: 'ENTRY',
      },
      {
        userId: userBId,
        tradeId: tUserBProp._id,
        originalName: 'userb-secret-chart.png',
        storedFilename: 'scope-test-userb-secret.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        category: 'ENTRY',
      },
    ]);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  describe('1. GET /api/v1/trades & POST /api/v1/trades/drilldown', () => {
    it('isolates trades across ALL, PROP_FIRM, PROP_FIRM+firmKey, TYPE(LIVE), TYPE(DEMO), ACCOUNT, includeArchived, and foreign accountId', async () => {
      const cases = [
        {
          name: 'scope=ALL (excludes archived)',
          query: 'scope=ALL&status=CLOSED',
          expectedPnL: PNL_5ERS + PNL_FTMO + PNL_FYERS + PNL_CRYPTO + PNL_DEMO,
          expectedSymbols: ['XAUUSD', 'EURUSD', 'NIFTY26OCTFUT', 'BTCUSDT', 'RELIANCE'],
        },
        {
          name: 'scope=ALL&includeArchived=true',
          query: 'scope=ALL&includeArchived=true&status=CLOSED',
          expectedPnL: PNL_5ERS + PNL_FTMO + PNL_FYERS + PNL_CRYPTO + PNL_DEMO + PNL_ARCHIVED,
          expectedSymbols: ['XAUUSD', 'EURUSD', 'NIFTY26OCTFUT', 'BTCUSDT', 'RELIANCE', 'GBPUSD_ARCH'],
        },
        {
          name: 'scope=PROP_FIRM (all active prop firms)',
          query: 'scope=PROP_FIRM&status=CLOSED',
          expectedPnL: PNL_5ERS + PNL_FTMO,
          expectedSymbols: ['XAUUSD', 'EURUSD'],
        },
        {
          name: 'scope=PROP_FIRM&firmKey=THE5ERS (must NOT leak FTMO despite Mongoose default propFirmConfig.firm)',
          query: 'scope=PROP_FIRM&firmKey=THE5ERS&status=CLOSED',
          expectedPnL: PNL_5ERS,
          expectedSymbols: ['XAUUSD'],
        },
        {
          name: 'scope=PROP_FIRM&firmKey=THE5ERS&includeArchived=true',
          query: 'scope=PROP_FIRM&firmKey=THE5ERS&includeArchived=true&status=CLOSED',
          expectedPnL: PNL_5ERS + PNL_ARCHIVED,
          expectedSymbols: ['XAUUSD', 'GBPUSD_ARCH'],
        },
        {
          name: 'scope=PROP_FIRM&firmKey=FTMO',
          query: 'scope=PROP_FIRM&firmKey=FTMO&status=CLOSED',
          expectedPnL: PNL_FTMO,
          expectedSymbols: ['EURUSD'],
        },
        {
          name: 'scope=PROP_FIRM&firmKey=APEX (empty scope with 0 matching accounts)',
          query: 'scope=PROP_FIRM&firmKey=APEX&status=CLOSED',
          expectedPnL: 0,
          expectedSymbols: [],
        },
        {
          name: 'scope=TYPE&accountType=LIVE (personal live accounts only, zero prop or demo)',
          query: 'scope=TYPE&accountType=LIVE&status=CLOSED',
          expectedPnL: PNL_FYERS + PNL_CRYPTO,
          expectedSymbols: ['NIFTY26OCTFUT', 'BTCUSDT'],
        },
        {
          name: 'scope=TYPE&accountType=DEMO',
          query: 'scope=TYPE&accountType=DEMO&status=CLOSED',
          expectedPnL: PNL_DEMO,
          expectedSymbols: ['RELIANCE'],
        },
        {
          name: 'scope=ACCOUNT (single prop account)',
          query: `scope=ACCOUNT&accountId=${accProp5ersId}&status=CLOSED`,
          expectedPnL: PNL_5ERS,
          expectedSymbols: ['XAUUSD'],
        },
        {
          name: 'scope=ACCOUNT (single live account)',
          query: `scope=ACCOUNT&accountId=${accLiveFyersId}&status=CLOSED`,
          expectedPnL: PNL_FYERS,
          expectedSymbols: ['NIFTY26OCTFUT'],
        },
        {
          name: 'foreign tenant accountId (User B prop account requested by User A)',
          query: `scope=ACCOUNT&accountId=${accUserBPropId}&status=CLOSED`,
          expectedPnL: 0,
          expectedSymbols: [],
        },
      ];

      for (const c of cases) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/trades?${c.query}`,
          headers: { cookie: cookieA },
        });
        expect(res.statusCode, c.name).toBe(200);
        const rows = res.json().data;
        const symbols = rows.map((r: any) => r.symbol).sort();
        const sumPnL = rows.reduce((s: number, r: any) => s + (r.calculated?.netPnL || 0), 0);
        expect(symbols, `${c.name} symbols`).toEqual([...c.expectedSymbols].sort());
        expect(sumPnL, `${c.name} netPnL`).toBe(c.expectedPnL);

        // Also test POST /api/v1/trades/drilldown with the exact same filter
        const paramsObj = Object.fromEntries(new URLSearchParams(c.query).entries());
        const drillRes = await app.inject({
          method: 'POST',
          url: '/api/v1/trades/drilldown',
          headers: { cookie: cookieA },
          payload: {
            descriptor: {
              kind: 'FILTER',
              label: c.name,
              filter: paramsObj,
            },
          },
        });
        expect(drillRes.statusCode, `drilldown ${c.name}`).toBe(200);
        const drillData = drillRes.json().data;
        const drillSymbols = drillData.trades.map((r: any) => r.symbol).sort();
        expect(drillSymbols, `drilldown ${c.name} symbols`).toEqual([...c.expectedSymbols].sort());
        expect(drillData.aggregate.netPnL, `drilldown ${c.name} aggregate.netPnL`).toBe(c.expectedPnL);
      }
    }, 30000);
  });

  describe('2. GET /api/v1/dashboard/stats & GET /api/v1/dashboard/equity-curves', () => {
    it('computes exact scoped metrics, multi-currency flags, propReferenceLines, and scoped breach markers', async () => {
      // A. scope=ALL -> mixes USD and INR accounts -> hasMultipleCurrencies = true
      const allStatsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?scope=ALL',
        headers: { cookie: cookieA },
      });
      expect(allStatsRes.statusCode).toBe(200);
      const allStats = allStatsRes.json().data;
      expect(allStats.netPnL).toBe(PNL_5ERS + PNL_FTMO + PNL_FYERS + PNL_CRYPTO + PNL_DEMO);
      expect(allStats.closedTradesCount).toBe(5);
      expect(allStats.hasMultipleCurrencies).toBe(true);
      expect(allStats.currencyBreakdown).toEqual({
        USD: 100000 + 50000 + 10000,
        INR: 200000 + 500000,
      });

      const allCurvesRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves?scope=ALL',
        headers: { cookie: cookieA },
      });
      expect(allCurvesRes.statusCode).toBe(200);
      const allCurves = allCurvesRes.json().data;
      // propReferenceLines must NOT leak into scope=ALL
      expect(allCurves.propReferenceLines).toBeUndefined();
      expect(allCurves.hasMultipleCurrencies).toBe(true);

      // B. scope=PROP_FIRM -> USD only -> hasMultipleCurrencies = false, propReferenceLines defined
      const propStatsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(propStatsRes.statusCode).toBe(200);
      const propStats = propStatsRes.json().data;
      expect(propStats.netPnL).toBe(PNL_5ERS + PNL_FTMO);
      expect(propStats.closedTradesCount).toBe(2);
      expect(propStats.hasMultipleCurrencies).toBe(false);
      expect(propStats.currencyBreakdown).toEqual({ USD: 150000 });

      const propCurvesRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: cookieA },
      });
      expect(propCurvesRes.statusCode).toBe(200);
      const propCurves = propCurvesRes.json().data;
      expect(propCurves.startingEquity).toBe(100000);
      expect(propCurves.propReferenceLines).toBeDefined();
      expect(propCurves.propReferenceLines.startingBalance).toBe(100000);
      expect(propCurves.propReferenceLines.profitTarget).toBe(110000); // 10% Phase 1 on the5ers_high_stakes_100k
      expect(propCurves.propReferenceLines.maxLossFloor).toBe(90000); // 10% max loss
      expect(propCurves.propReferenceLines.dailyLossFloor).toBe(97000); // 3% daily loss on the5ers_high_stakes_100k

      // C. scope=TYPE&accountType=LIVE -> zero prop data, propReferenceLines undefined
      const liveStatsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(liveStatsRes.statusCode).toBe(200);
      const liveStats = liveStatsRes.json().data;
      expect(liveStats.netPnL).toBe(PNL_FYERS + PNL_CRYPTO);
      expect(liveStats.closedTradesCount).toBe(2);
      expect(liveStats.hasMultipleCurrencies).toBe(true); // FYERS INR + Binance USD
      expect(liveStats.currencyBreakdown).toEqual({ INR: 200000, USD: 10000 });

      const liveCurvesRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(liveCurvesRes.json().data.propReferenceLines).toBeUndefined();

      // D. Foreign accountId -> 0 trades, 0 equity
      const foreignStatsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/dashboard/stats?accountId=${accUserBPropId}`,
        headers: { cookie: cookieA },
      });
      expect(foreignStatsRes.json().data.closedTradesCount).toBe(0);
      expect(foreignStatsRes.json().data.netPnL).toBe(0);
    });
  });

  describe('3. GET /api/v1/trades/live/watcher & GET /api/v1/trades/live/alerts', () => {
    it('isolates live positions & alerts by scope, excludes archived alerts in ALL, and keeps prop trades SIMULATED even when FYERS is connected', async () => {
      // A. Watcher in PROP_FIRM scope
      const propWatcherRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/watcher?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(propWatcherRes.statusCode).toBe(200);
      const propWatcher = propWatcherRes.json().data;
      expect(propWatcher.positions.map((p: any) => p.symbol).sort()).toEqual(['EURUSD_OPEN', 'XAUUSD_OPEN']);
      // Crucial invariant: Prop trades must NEVER be marked as provider='FYERS' or canExecuteBroker=true
      expect(propWatcher.provider).toBe('SIMULATED');
      expect(propWatcher.dataHealth.canExecuteBroker).toBe(false);
      for (const pos of propWatcher.positions) {
        expect(pos.provider).toBe('SIMULATED');
        expect(pos.dataHealth.canExecuteBroker).toBe(false);
      }

      // B. Watcher in PROP_FIRM + firmKey=FTMO
      const ftmoWatcherRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/watcher?scope=PROP_FIRM&firmKey=FTMO',
        headers: { cookie: cookieA },
      });
      expect(ftmoWatcherRes.json().data.positions.map((p: any) => p.symbol)).toEqual(['EURUSD_OPEN']);

      // C. Watcher in TYPE(LIVE) scope
      const liveWatcherRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/watcher?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      const liveWatcher = liveWatcherRes.json().data;
      expect(liveWatcher.positions.map((p: any) => p.symbol)).toEqual(['BANKNIFTY26OCTFUT']);
      expect(liveWatcher.positions[0].provider).toBe('FYERS');

      // D. Live Alerts in ALL (must exclude archived account alert!)
      const allAlertsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/alerts?scope=ALL',
        headers: { cookie: cookieA },
      });
      expect(allAlertsRes.statusCode).toBe(200);
      const allAlertSymbols = allAlertsRes.json().data.map((a: any) => a.symbol).sort();
      expect(allAlertSymbols).toEqual(['BANKNIFTY26OCTFUT', 'EURUSD_OPEN', 'XAUUSD_OPEN']);

      // E. Live Alerts in ALL + includeArchived=true
      const archAlertsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/alerts?scope=ALL&includeArchived=true',
        headers: { cookie: cookieA },
      });
      expect(archAlertsRes.json().data.map((a: any) => a.symbol).sort()).toEqual([
        'BANKNIFTY26OCTFUT',
        'EURUSD_OPEN',
        'GBPUSD_ARCH_OPEN',
        'XAUUSD_OPEN',
      ]);

      // F. Live Alerts in PROP_FIRM vs TYPE(LIVE)
      const propAlertsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/alerts?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(propAlertsRes.json().data.map((a: any) => a.symbol).sort()).toEqual(['EURUSD_OPEN', 'XAUUSD_OPEN']);

      const liveAlertsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/live/alerts?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(liveAlertsRes.json().data.map((a: any) => a.symbol)).toEqual(['BANKNIFTY26OCTFUT']);
    });
  });

  describe('4. Analytics: /analytics/psychology, /analytics/excursion, /analytics/what-if', () => {
    it('isolates psychology, excursion, and what-if simulations across scopes', async () => {
      // A. Psychology Analytics
      const psychProp = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/psychology?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(psychProp.statusCode).toBe(200);
      const psychPropMistakes = psychProp
        .json()
        .data.mistakeAnalysis.filter((m: any) => m.occurrences > 0)
        .map((m: any) => m.mistake)
        .sort();
      expect(psychPropMistakes).toEqual(['CHASED_MARKET', 'FOMO']);

      const psychLive = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/psychology?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      const psychLiveMistakes = psychLive
        .json()
        .data.mistakeAnalysis.filter((m: any) => m.occurrences > 0)
        .map((m: any) => m.mistake)
        .sort();
      expect(psychLiveMistakes).toEqual(['OVERTRADING', 'PREMATURE_EXIT']);

      // B. Excursion Analytics
      const excProp5ers = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/excursion?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: cookieA },
      });
      expect(excProp5ers.statusCode).toBe(200);
      expect(excProp5ers.json().data.scatterPoints.map((p: any) => p.symbol)).toEqual(['XAUUSD']);

      const excLive = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/excursion?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(excLive.json().data.scatterPoints.map((p: any) => p.symbol).sort()).toEqual([
        'BTCUSDT',
        'NIFTY26OCTFUT',
      ]);

      // C. What-If Simulator (accepts scope params in filters without 400 error and scopes trades)
      const whatIfProp = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/what-if',
        headers: { cookie: cookieA },
        payload: {
          filters: { scope: 'PROP_FIRM', firmKey: 'THE5ERS' },
          stopRGrid: [null, 1.0],
          targetRGrid: [null, 2.0],
        },
      });
      expect(whatIfProp.statusCode).toBe(200);
      expect(whatIfProp.json().data.scope.tradesInScope).toBe(1);

      const whatIfLive = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/what-if',
        headers: { cookie: cookieA },
        payload: {
          filters: { scope: 'TYPE', accountType: 'LIVE' },
          stopRGrid: [null, 1.0],
          targetRGrid: [null, 2.0],
        },
      });
      expect(whatIfLive.statusCode).toBe(200);
      expect(whatIfLive.json().data.scope.tradesInScope).toBe(2);
    });
  });

  describe('5. Strategies, Variant Analytics, Templates & Instruments', () => {
    it('scopes strategy stats AND edge.sampleSize, template performance (no global usageCount leak), and instruments', async () => {
      // A. GET /strategies in PROP_FIRM+THE5ERS scope
      const strat5ersRes = await app.inject({
        method: 'GET',
        url: '/api/v1/strategies?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: cookieA },
      });
      expect(strat5ersRes.statusCode).toBe(200);
      const stratList5ers = strat5ersRes.json().data;
      const s5ersItem = stratList5ers.find((s: any) => s.name === 'StratProp5ers');
      const sFyersItem = stratList5ers.find((s: any) => s.name === 'StratLiveFyers');
      // StratProp5ers has 1 active trade (+1 archived trade excluded)
      expect(s5ersItem.totalTrades).toBe(1);
      expect(s5ersItem.netPnL).toBe(PNL_5ERS);
      expect(s5ersItem.edge.sampleSize).toBe(1);
      // StratLiveFyers has 0 trades in PROP_FIRM scope -> edge.sampleSize must be 0!
      expect(sFyersItem.totalTrades).toBe(0);
      expect(sFyersItem.netPnL).toBe(0);
      expect(sFyersItem.edge.sampleSize).toBe(0);

      // B. GET /strategies/:id in PROP_FIRM vs TYPE(LIVE) scope
      const stratDetailInProp = await app.inject({
        method: 'GET',
        url: `/api/v1/strategies/${stratLiveFyersId}?scope=PROP_FIRM`,
        headers: { cookie: cookieA },
      });
      expect(stratDetailInProp.statusCode).toBe(200);
      expect(stratDetailInProp.json().data.trades).toHaveLength(0);
      expect(stratDetailInProp.json().data.edge.sampleSize).toBe(0);

      // C. GET /strategies/:id/analytics
      const varAnalyticsInProp = await app.inject({
        method: 'GET',
        url: `/api/v1/strategies/${stratLiveFyersId}/analytics?scope=PROP_FIRM`,
        headers: { cookie: cookieA },
      });
      expect(varAnalyticsInProp.statusCode).toBe(200);
      expect(varAnalyticsInProp.json().data.parent.closedTrades).toBe(0);

      // D. GET /templates & GET /templates/:id (must return 0 usageCount/totalTrades when out of scope, not global usageCount=9)
      const tplInPropRes = await app.inject({
        method: 'GET',
        url: '/api/v1/templates?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: cookieA },
      });
      expect(tplInPropRes.statusCode).toBe(200);
      const tplList = tplInPropRes.json().data;
      const tpl5ers = tplList.find((t: any) => t.id === tplProp5ersId);
      const tplFyers = tplList.find((t: any) => t.id === tplLiveFyersId);
      expect(tpl5ers.performance.totalTrades).toBe(1);
      expect(tpl5ers.performance.netPnL).toBe(PNL_5ERS);
      expect(tplFyers.performance.totalTrades).toBe(0);
      expect(tplFyers.usageCount).toBe(0);
      expect(tplFyers.performance.netPnL).toBe(0);

      const singleTplInProp = await app.inject({
        method: 'GET',
        url: `/api/v1/templates/${tplLiveFyersId}?scope=PROP_FIRM`,
        headers: { cookie: cookieA },
      });
      expect(singleTplInProp.json().data.performance.totalTrades).toBe(0);

      // E. GET /instruments
      const instPropRes = await app.inject({
        method: 'GET',
        url: '/api/v1/instruments?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(instPropRes.statusCode).toBe(200);
      const instProp = instPropRes.json().data;
      const xauInst = instProp.find((i: any) => i.symbol === 'XAUUSD');
      const niftyInst = instProp.find((i: any) => i.symbol === 'NIFTY26OCTFUT');
      expect(xauInst).toBeDefined();
      expect(xauInst.tradeCount).toBe(1);
      expect(xauInst.netPnL).toBe(PNL_5ERS);
      // NIFTY26OCTFUT was traded only on the LIVE FYERS account and must not appear in PROP_FIRM scope
      expect(niftyInst).toBeUndefined();
    });
  });

  describe('6. Journal, Review Queue, Prefill, Mistake Suggestions & Weekly Review', () => {
    it('scopes journal calendar/day (masks out-of-scope bestTradeId), review queue, prefill, and weekly review', async () => {
      // A. Journal Calendar
      const calProp = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/calendar?yearMonth=2026-10&scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(calProp.statusCode).toBe(200);
      const daysProp = calProp.json().data.days;
      const oct12 = daysProp.find((d: any) => d.date === '2026-10-12');
      const oct14 = daysProp.find((d: any) => d.date === '2026-10-14');
      expect(oct12.netPnL).toBe(PNL_5ERS);
      expect(oct14.netPnL).toBe(0); // Oct 14 trade was on FYERS Live

      // B. Journal Day (2026-10-14 has bestTradeId = FYERS Live trade; must be masked in PROP_FIRM scope)
      const dayProp = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/2026-10-14?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(dayProp.statusCode).toBe(200);
      expect(dayProp.json().data.trades).toHaveLength(0);
      expect(dayProp.json().data.journal.bestTradeId).toBeNull();

      const dayLive = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/2026-10-14?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(dayLive.json().data.trades).toHaveLength(1);
      expect(dayLive.json().data.journal.bestTradeId._id).toBe(tradeFyersClosedId);

      // C. Weekly Review: finalized ALL-scope review (accountId: null) must NOT leak into PROP_FIRM or TYPE(LIVE)
      const weeklyAll = await app.inject({
        method: 'GET',
        url: '/api/v1/review/weekly/2026-W42?scope=ALL',
        headers: { cookie: cookieA },
      });
      expect(weeklyAll.statusCode).toBe(200);
      expect(weeklyAll.json().data.status).toBe('FINALIZED');
      expect(weeklyAll.json().data.snapshot.weekSummary.netPnL).toBe(
        PNL_5ERS + PNL_FTMO + PNL_FYERS + PNL_CRYPTO + PNL_DEMO
      );

      const weeklyProp = await app.inject({
        method: 'GET',
        url: '/api/v1/review/weekly/2026-W42?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(weeklyProp.statusCode).toBe(200);
      expect(weeklyProp.json().data.snapshot.weekSummary.netPnL).toBe(PNL_5ERS + PNL_FTMO);
      expect(weeklyProp.json().data.snapshot.weekSummary.tradeCount).toBe(2);

      const weeklyLive = await app.inject({
        method: 'GET',
        url: '/api/v1/review/weekly/2026-W42?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(weeklyLive.statusCode).toBe(200);
      expect(weeklyLive.json().data.snapshot.weekSummary.netPnL).toBe(PNL_FYERS + PNL_CRYPTO);
      expect(weeklyLive.json().data.snapshot.weekSummary.tradeCount).toBe(2);

      // Weekly Review list mode in PROP_FIRM scope only lists reviews for prop accounts
      const weeklyListProp = await app.inject({
        method: 'GET',
        url: '/api/v1/review/weekly?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(weeklyListProp.statusCode).toBe(200);
      expect(weeklyListProp.json().data.map((r: any) => r.accountId)).toEqual([accProp5ersId]);

      // D. Review Prefill (/review/prefill/:date)
      const prefillProp = await app.inject({
        method: 'GET',
        url: '/api/v1/review/prefill/2026-10-12?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(prefillProp.statusCode).toBe(200);
      expect(prefillProp.json().data.tradesCount).toBe(1);
      expect(prefillProp.json().data.netPnL).toBe(PNL_5ERS);

      const prefillLiveOnPropDay = await app.inject({
        method: 'GET',
        url: '/api/v1/review/prefill/2026-10-12?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(prefillLiveOnPropDay.statusCode).toBe(200);
      expect(prefillLiveOnPropDay.json().data.tradesCount).toBe(0);
      expect(prefillLiveOnPropDay.json().data.netPnL).toBe(0);

      // E. Review Queue (/review/queue): scoped trades, unreviewedDays, AND scoped dailyLossBreach.limit
      const queueProp = await app.inject({
        method: 'GET',
        url: '/api/v1/review/queue?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(queueProp.statusCode).toBe(200);
      const qPropData = queueProp.json().data;
      // 5ers (3% of $100,000 = $3,000) + FTMO (5% of $50,000 = $2,500) = $5,500 prop daily loss limit (NOT personal INR 3,000!)
      expect(qPropData.dailyLossBreach.maxDailyLoss).toBe(5500);
      expect(qPropData.dailyLossBreach.currency).toBe('USD');
      for (const item of qPropData.queue) {
        expect(['XAUUSD', 'XAUUSD_OPEN', 'EURUSD', 'EURUSD_OPEN']).toContain(item.symbol);
      }
      // XAUUSD closed trade HAS an attachment, so its missing array must NOT contain MISSING_SCREENSHOTS
      expect(qPropData.queue.find((i: any) => i.id === trade5ersClosedId)?.missing ?? []).toEqual([]);
      // EURUSD closed trade has no attachment -> missing contains MISSING_SCREENSHOTS
      expect(qPropData.queue.find((i: any) => i.id === tradeFtmoClosedId)?.missing).toContain('MISSING_SCREENSHOTS');

      const queueLive = await app.inject({
        method: 'GET',
        url: '/api/v1/review/queue?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(queueLive.statusCode).toBe(200);
      const qLiveData = queueLive.json().data;
      expect(qLiveData.dailyLossBreach.maxDailyLoss).toBe(3000);
      expect(qLiveData.dailyLossBreach.currency).toBe('INR');
      for (const item of qLiveData.queue) {
        expect(['NIFTY26OCTFUT', 'BANKNIFTY26OCTFUT', 'BTCUSDT']).toContain(item.symbol);
      }

      // F. Mistake Suggestions (/review/suggest-mistakes/:tradeId): live losses must NOT trigger prop revenge/overtrading
      const tempLiveLosses = await Trade.insertMany(
        [1, 2, 3, 4].map((idx) => ({
          userId: userAId,
          accountId: accLiveFyersId,
          symbol: 'NIFTY_TEMP_LOSS',
          assetClass: 'FUTURES',
          exchange: 'NSE',
          marketSegment: 'NSE_FNO',
          direction: 'LONG',
          status: 'CLOSED',
          executionMode: 'SIMPLE',
          tradeDate: new Date('2026-10-10T09:00:00Z'),
          entryTime: new Date(`2026-10-10T09:0${idx}:00Z`),
          exitTime: new Date(`2026-10-10T09:0${idx}:30Z`),
          simpleExecution: { entryPrice: 100, exitPrice: 90, quantity: 10, contractMultiplier: 1 },
          calculated: { grossPnL: -1000, totalCosts: 0, netPnL: -1000, outcome: 'LOSS' },
        }))
      );
      const tempPropTrade = await Trade.create({
        userId: userAId,
        accountId: accProp5ersId,
        symbol: 'XAUUSD_CLEAN',
        assetClass: 'FOREX',
        exchange: 'FOREX',
        marketSegment: 'FOREX',
        direction: 'LONG',
        status: 'CLOSED',
        executionMode: 'SIMPLE',
        tradeDate: new Date('2026-10-10T09:10:00Z'),
        entryTime: new Date('2026-10-10T09:10:00Z'),
        exitTime: new Date('2026-10-10T09:30:00Z'),
        simpleExecution: { entryPrice: 2600, exitPrice: 2610, quantity: 1, contractMultiplier: 100 },
        calculated: { grossPnL: 1000, totalCosts: 0, netPnL: 1000, outcome: 'WIN' },
      });

      try {
        const suggestPropRes = await app.inject({
          method: 'GET',
          url: `/api/v1/review/suggest-mistakes/${tempPropTrade._id.toString()}`,
          headers: { cookie: cookieA },
        });
        expect(suggestPropRes.statusCode).toBe(200);
        const suggestedRules = suggestPropRes.json().data.map((s: any) => s.rule);
        expect(suggestedRules).not.toContain('OVERTRADING');
        expect(suggestedRules).not.toContain('REVENGE_TRADING');
      } finally {
        await Trade.deleteMany({
          _id: { $in: [...tempLiveLosses.map((t) => t._id), tempPropTrade._id] },
        });
      }
    }, 30000);
  });

  describe('7. Prop Overview, Export CSV/JSON, Import Batches & Telegram Commands', () => {
    it('isolates /accounts/prop-overview, /export/csv, /export/json, /export/import/batches, and Telegram commands', async () => {
      // A. Prop Overview respects firmKey and includeArchived
      const overviewAllProp = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/prop-overview?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(overviewAllProp.statusCode).toBe(200);
      expect(overviewAllProp.json().data.map((a: any) => a.accountId).sort()).toEqual(
        [accProp5ersId, accPropFtmoId].sort()
      );

      const overview5ers = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/prop-overview?scope=PROP_FIRM&firmKey=THE5ERS',
        headers: { cookie: cookieA },
      });
      expect(overview5ers.json().data.map((a: any) => a.accountId)).toEqual([accProp5ersId]);

      const overview5ersArch = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/prop-overview?scope=PROP_FIRM&firmKey=THE5ERS&includeArchived=true',
        headers: { cookie: cookieA },
      });
      expect(overview5ersArch.json().data.map((a: any) => a.accountId).sort()).toEqual(
        [accProp5ersId, accArchivedPropId].sort()
      );

      // B. Export CSV & JSON
      const csvProp = await app.inject({
        method: 'GET',
        url: '/api/v1/export/csv?scope=PROP_FIRM&firmKey=FTMO',
        headers: { cookie: cookieA },
      });
      expect(csvProp.statusCode).toBe(200);
      expect(csvProp.body).toContain('EURUSD');
      expect(csvProp.body).not.toContain('XAUUSD');
      expect(csvProp.body).not.toContain('NIFTY26OCTFUT');

      const jsonLive = await app.inject({
        method: 'GET',
        url: '/api/v1/export/json?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(jsonLive.statusCode).toBe(200);
      const jsonTrades = jsonLive.json();
      expect(jsonTrades.map((t: any) => t.symbol).sort()).toEqual([
        'BANKNIFTY26OCTFUT',
        'BTCUSDT',
        'NIFTY26OCTFUT',
      ]);

      // C. Import Batches
      const batchesProp = await app.inject({
        method: 'GET',
        url: '/api/v1/export/import/batches?scope=PROP_FIRM',
        headers: { cookie: cookieA },
      });
      expect(batchesProp.statusCode).toBe(200);
      expect(batchesProp.json().data.map((b: any) => b.batchId).sort()).toEqual(['batch-5ers', 'batch-ftmo']);

      const batchesLive = await app.inject({
        method: 'GET',
        url: '/api/v1/export/import/batches?scope=TYPE&accountType=LIVE',
        headers: { cookie: cookieA },
      });
      expect(batchesLive.json().data.map((b: any) => b.batchId).sort()).toEqual(['batch-crypto', 'batch-fyers']);

      // D. Telegram /alerts & /pnl commands (via spy on TelegramAlertService.sendMessage)
      const sentMessages: string[] = [];
      const origSend = (TelegramAlertService as any).sendMessage;
      (TelegramAlertService as any).sendMessage = async (_token: any, _chatId: any, text: string) => {
        sentMessages.push(text);
        return { ok: true, result: { message_id: 1 } };
      };

      try {
        const userADoc = await User.findById(userAId);
        await (TelegramAlertService as any).handleAlertsListCommand(userADoc, 'token', 12345, undefined);
        // Must have 3 active alerts (5ers, FTMO, FYERS) and exclude archived alert!
        expect(sentMessages[0]).toContain('Active Alert States (3)');

        sentMessages.length = 0;
        await (TelegramAlertService as any).handleAlertsListCommand(userADoc, 'token', 12345, 'prop');
        expect(sentMessages[0]).toContain('Active Alert States (2)');

        sentMessages.length = 0;
        await (TelegramAlertService as any).handleAlertsListCommand(userADoc, 'token', 12345, 'live');
        expect(sentMessages[0]).toContain('Active Alert States (1)');

        // /trades prop vs live (Telegram sends one card per open trade)
        sentMessages.length = 0;
        await (TelegramAlertService as any).handleTradesCommand(userADoc, 'token', 12345, 'prop');
        const propTradesCombined = sentMessages.join('\n');
        expect(propTradesCombined).toContain('XAUUSD_OPEN');
        expect(propTradesCombined).toContain('EURUSD_OPEN');
        expect(propTradesCombined).not.toContain('BANKNIFTY26OCTFUT');

        sentMessages.length = 0;
        await (TelegramAlertService as any).handleTradesCommand(userADoc, 'token', 12345, 'live');
        const liveTradesCombined = sentMessages.join('\n');
        expect(liveTradesCombined).toContain('BANKNIFTY26OCTFUT');
        expect(liveTradesCombined).not.toContain('XAUUSD_OPEN');
        expect(liveTradesCombined).not.toContain('EURUSD_OPEN');

        // /pnl prop vs live
        sentMessages.length = 0;
        await (TelegramAlertService as any).handlePnlCommand(userADoc, 'token', 12345, 'prop');
        expect(sentMessages[0]).toContain('(PROP MODE)');
        expect(sentMessages[0]).toContain('Open Positions  : 2');
        expect(sentMessages[0]).toContain('$');

        sentMessages.length = 0;
        await (TelegramAlertService as any).handlePnlCommand(userADoc, 'token', 12345, 'live');
        expect(sentMessages[0]).toContain('(LIVE PERSONAL)');
        expect(sentMessages[0]).toContain('Open Positions  : 1');
        expect(sentMessages[0]).toContain('₹');
      } finally {
        (TelegramAlertService as any).sendMessage = origSend;
      }

      // E. Attachments & Cross-Tenant Ownership
      const attOwnRes = await app.inject({
        method: 'GET',
        url: `/api/v1/attachments/trades/${trade5ersClosedId}`,
        headers: { cookie: cookieA },
      });
      expect(attOwnRes.statusCode).toBe(200);
      expect(attOwnRes.json().data).toHaveLength(1);
      expect(attOwnRes.json().data[0].originalName).toBe('5ers-xauusd-entry.png');

      const attForeignRes = await app.inject({
        method: 'GET',
        url: `/api/v1/attachments/trades/${tradeUserBPropId}`,
        headers: { cookie: cookieA },
      });
      expect(attForeignRes.statusCode).toBe(404);
    }, 30000);
  });
});

