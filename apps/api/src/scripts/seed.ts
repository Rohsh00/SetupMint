import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { calculateSimpleExecutionPnL, calculateRealizedRMultiple } from '@tradevault/financial-engine';
import { PRESET_INSTRUMENTS } from '@tradevault/shared';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import {
  DailyJournal,
  Instrument,
  Strategy,
  Trade,
  TradingAccount,
  User,
} from '../db/models/index.js';

export async function runSeed() {
  console.log('[Seed] Connecting to database...');
  await connectDatabase();

  console.log('[Seed] Creating demo user...');
  const email = 'trader@tradevault.local';
  let user = await User.findOne({ email });

  if (!user) {
    const passwordHash = await bcrypt.hash('TradeVault@123', 10);
    user = await User.create({
      email,
      passwordHash,
      name: 'Arjun Discretionary Trader',
      baseCurrency: 'INR',
      theme: 'dark',
    });
    console.log(`[Seed] Created user: ${email} (Password: TradeVault@123)`);
  } else {
    console.log(`[Seed] Found existing user: ${email}`);
  }

  const userId = user._id;

  // Clear existing data for demo user
  await Trade.deleteMany({ userId });
  await Strategy.deleteMany({ userId });
  await TradingAccount.deleteMany({ userId });
  await DailyJournal.deleteMany({ userId });
  await Instrument.deleteMany({ userId });

  console.log('[Seed] Creating instruments...');
  for (const preset of PRESET_INSTRUMENTS) {
    await Instrument.create({
      ...preset,
      userId,
    });
  }

  console.log('[Seed] Creating trading accounts...');
  const accZerodha = await TradingAccount.create({
    userId,
    name: 'Zerodha Pro (Equity & F&O)',
    broker: 'Zerodha',
    accountNumber: 'ZR8829',
    accountType: 'FUTURES_OPTIONS',
    baseCurrency: 'INR',
    initialBalance: mongoose.Types.Decimal128.fromString('250000.00'),
    currentBalance: mongoose.Types.Decimal128.fromString('250000.00'),
    realizedPnL: mongoose.Types.Decimal128.fromString('0.00'),
    totalDeposits: mongoose.Types.Decimal128.fromString('0.00'),
    totalWithdrawals: mongoose.Types.Decimal128.fromString('0.00'),
    status: 'ACTIVE',
    riskRules: {
      maxDailyLoss: 10000,
      maxRiskPerTradePercent: 2,
      maxOpenTrades: 3,
    },
    notes: 'Primary intraday index & stock execution account',
  });

  const accCommodity = await TradingAccount.create({
    userId,
    name: 'Dhan MCX (Commodities)',
    broker: 'Dhan',
    accountNumber: 'DH1942',
    accountType: 'COMMODITY',
    baseCurrency: 'INR',
    initialBalance: mongoose.Types.Decimal128.fromString('150000.00'),
    currentBalance: mongoose.Types.Decimal128.fromString('150000.00'),
    realizedPnL: mongoose.Types.Decimal128.fromString('0.00'),
    totalDeposits: mongoose.Types.Decimal128.fromString('0.00'),
    totalWithdrawals: mongoose.Types.Decimal128.fromString('0.00'),
    status: 'ACTIVE',
    notes: 'Crude Oil and Natural Gas evening session trades',
  });

  console.log('[Seed] Creating strategy playbooks...');
  const stratORB = await Strategy.create({
    userId,
    name: '15-Min Opening Range Breakout (ORB)',
    description: 'High momentum breakout of the 15-minute high/low with volume confirmation at market open.',
    assetClasses: ['EQUITY', 'FUTURES'],
    timeframes: ['5m', '15m'],
    entryRules: [
      'Wait for 15-minute candle to close cleanly',
      'Check if volume on breakout candle is > 1.5x 20-period average',
      'Ensure index and sector align with breakout direction',
    ],
    stopLossRules: ['Place hard stop at the midpoint or opposite side of the 15m range'],
    targetRules: ['Target 1.5R to 2.5R or next major pivot high/low'],
    invalidationCriteria: ['False breakout reversal closing back inside range'],
    checklist: [
      'No major news release within 10 minutes',
      'Risk is within 1% of account equity',
      'Spread is normal',
    ],
    minRiskReward: 1.5,
    tags: ['Breakout', 'Momentum', 'MorningSession'],
    isActive: true,
  });

  const stratFVG = await Strategy.create({
    userId,
    name: 'Liquidity Sweep + FVG Reversal',
    description: 'Smart Money Concept (SMC) entry following a sweep of prev day high/low and market structure shift.',
    assetClasses: ['FUTURES', 'COMMODITY', 'FOREX'],
    timeframes: ['3m', '15m', '1h'],
    entryRules: [
      'Liquidity sweep of PDH or PDL',
      'Change of Character (CHOCH) on 3m timeframe',
      'Limit order entry at 50% discount of Fair Value Gap (FVG)',
    ],
    stopLossRules: ['Invalidation stop beyond the extreme sweep swing high/low'],
    targetRules: ['Opposite liquidity pool or 3R target'],
    invalidationCriteria: ['Clean candle close beyond sweep extreme'],
    checklist: ['Higher timeframe bias confirmed', 'Risk strictly 1%'],
    minRiskReward: 2.5,
    tags: ['SMC', 'LiquiditySweep', 'FVG'],
    isActive: true,
  });

  const stratPullback = await Strategy.create({
    userId,
    name: '20 EMA Trend Pullback',
    description: 'Trend following setup waiting for price pullback into dynamic support of the 20 EMA on 15m.',
    assetClasses: ['EQUITY', 'COMMODITY'],
    timeframes: ['15m', '1h'],
    entryRules: ['Strong trend established above/below 50 EMA', 'Touch and rejection wick off 20 EMA'],
    stopLossRules: ['Below rejection candle low'],
    targetRules: ['Recent swing high or 2R'],
    invalidationCriteria: ['Two consecutive closes through 20 EMA'],
    checklist: ['Market trend is intact', 'R:R is minimum 2:1'],
    minRiskReward: 2.0,
    tags: ['TrendFollowing', 'EMA'],
    isActive: true,
  });

  console.log('[Seed] Generating realistic manual trade records...');

  const sampleTrades = [
    {
      account: accZerodha,
      strategy: stratORB,
      symbol: 'NIFTY',
      assetClass: 'FUTURES',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      tradeDate: '2026-10-06',
      entryTime: '2026-10-06T09:30:00Z',
      exitTime: '2026-10-06T11:15:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'Nifty 15m ORB Long Breakout',
      entryPrice: 24200,
      exitPrice: 24320,
      quantity: 50, // 2 lots
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 45,
      regulatoryFees: 5,
      taxes: 110,
      stopLoss: 24150,
      target: 24350,
      tags: ['ORB', 'MorningTrade', 'TrendDay'],
      confluences: ['BOS', 'VOLUME_SPIKE', 'PDH_PDL'],
      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'CONFIDENT',
        emotionAfter: 'DISCIPLINED',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        lessonsLearned: 'Patience at open paid off; waited for clean 15m close before clicking buy.',
        notes: 'Clean continuation after crossing yesterday high.',
      },
    },
    {
      account: accZerodha,
      strategy: stratFVG,
      symbol: 'BANKNIFTY',
      assetClass: 'FUTURES',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'SHORT',
      tradeDate: '2026-10-07',
      entryTime: '2026-10-07T10:15:00Z',
      exitTime: '2026-10-07T12:30:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'BankNifty PDH Sweep Reversal',
      entryPrice: 51800,
      exitPrice: 51450,
      quantity: 30, // 2 lots
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 60,
      regulatoryFees: 6,
      taxes: 144,
      stopLoss: 51920,
      target: 51400,
      tags: ['SMC', 'Short', 'BankNifty'],
      confluences: ['LIQUIDITY_SWEEP', 'CHOCH', 'FVG'],
      psychology: {
        emotionBefore: 'CONFIDENT',
        emotionDuring: 'CALM',
        emotionAfter: 'CONFIDENT',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        lessonsLearned: 'Entry at 50% FVG gave a tight 120 pt stop with 350 pt reward.',
        notes: 'Bearish CHOCH followed by aggressive rejection.',
      },
    },
    {
      account: accZerodha,
      strategy: stratPullback,
      symbol: 'RELIANCE',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      direction: 'LONG',
      tradeDate: '2026-10-08',
      entryTime: '2026-10-08T11:00:00Z',
      exitTime: '2026-10-08T14:45:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'Reliance 20 EMA Pullback Bounce',
      entryPrice: 2850,
      exitPrice: 2895,
      quantity: 100,
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 18,
      regulatoryFees: 2,
      taxes: 52,
      stopLoss: 2825,
      target: 2900,
      tags: ['Swing', 'Reliance', 'EMA'],
      confluences: ['SUPPORT_RESISTANCE', 'EMA_CROSS'],
      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'CALM',
        emotionAfter: 'DISCIPLINED',
        disciplineScore: 4,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        notes: 'Solid institutional support at 2850 round number.',
      },
    },
    {
      account: accZerodha,
      strategy: stratORB,
      symbol: 'HDFCBANK',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      direction: 'SHORT',
      tradeDate: '2026-10-09',
      entryTime: '2026-10-09T09:40:00Z',
      exitTime: '2026-10-09T10:15:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'HDFC Bank Breakdown Stop Out',
      entryPrice: 1680,
      exitPrice: 1700, // Stopped out for loss
      quantity: 100,
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 12,
      regulatoryFees: 2,
      taxes: 36,
      stopLoss: 1700,
      target: 1640,
      tags: ['HDFC', 'Loss', 'StopLossRespected'],
      confluences: ['BOS'],
      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'ANXIOUS',
        emotionAfter: 'DISCIPLINED',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        lessonsLearned: 'Took the stop loss cleanly without hesitation or hope mode.',
        notes: 'Breakout failed and reversed rapidly. Loss kept strictly under 1R.',
      },
    },
    {
      account: accCommodity,
      strategy: stratFVG,
      symbol: 'CRUDEOIL',
      assetClass: 'COMMODITY',
      exchange: 'MCX',
      marketSegment: 'MCX',
      direction: 'LONG',
      tradeDate: '2026-10-12',
      entryTime: '2026-10-12T17:30:00Z',
      exitTime: '2026-10-12T20:15:00Z',
      session: 'MCX_EVENING',
      tradeTitle: 'Crude Oil US Open FVG Expansion',
      entryPrice: 6150,
      exitPrice: 6225,
      quantity: 1, // 1 lot = 100 barrels
      contractMultiplier: 100,
      brokerage: 50,
      exchangeFees: 38,
      regulatoryFees: 4,
      taxes: 88,
      stopLoss: 6120,
      target: 6250,
      tags: ['CrudeOil', 'MCX', 'Evening'],
      confluences: ['FVG', 'ORDER_BLOCK', 'LIQUIDITY_SWEEP'],
      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'CONFIDENT',
        emotionAfter: 'DISCIPLINED',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        notes: '75 points gain on 100 multiplier = 7,500 gross.',
      },
    },
    {
      account: accCommodity,
      strategy: stratPullback,
      symbol: 'NATURALGAS',
      assetClass: 'COMMODITY',
      exchange: 'MCX',
      marketSegment: 'MCX',
      direction: 'SHORT',
      tradeDate: '2026-10-13',
      entryTime: '2026-10-13T18:00:00Z',
      exitTime: '2026-10-13T19:20:00Z',
      session: 'MCX_EVENING',
      tradeTitle: 'Natural Gas Pullback Stop Out',
      entryPrice: 245.0,
      exitPrice: 248.0, // Loss of 3.0 pts * 1250 multiplier
      quantity: 1, // 1 lot = 1250 mmBtu
      contractMultiplier: 1250,
      brokerage: 50,
      exchangeFees: 24,
      regulatoryFees: 2,
      taxes: 64,
      stopLoss: 248.0,
      target: 238.0,
      tags: ['NatGas', 'Loss'],
      confluences: ['EMA_CROSS'],
      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'NEUTRAL',
        emotionAfter: 'CALM',
        disciplineScore: 4,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        notes: 'Inventory anticipation spike triggered stop.',
      },
    },
    {
      account: accZerodha,
      strategy: stratORB,
      symbol: 'TATASTEEL',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      direction: 'LONG',
      tradeDate: '2026-10-14',
      entryTime: '2026-10-14T09:45:00Z',
      exitTime: '2026-10-14T14:30:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'Tata Steel Metal Sector Trend Day',
      entryPrice: 154.5,
      exitPrice: 159.5,
      quantity: 500,
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 15,
      regulatoryFees: 2,
      taxes: 43,
      stopLoss: 152.0,
      target: 160.0,
      tags: ['Metals', 'TataSteel'],
      confluences: ['BOS', 'VOLUME_SPIKE'],
      psychology: {
        emotionBefore: 'CONFIDENT',
        emotionDuring: 'CALM',
        emotionAfter: 'DISCIPLINED',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        notes: 'Strong metal index surge; trailing stop worked perfectly.',
      },
    },
    {
      account: accZerodha,
      strategy: stratORB,
      symbol: 'NIFTY',
      assetClass: 'FUTURES',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      tradeDate: '2026-10-15',
      entryTime: '2026-10-15T13:40:00Z',
      exitTime: '2026-10-15T14:10:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'Late Afternoon FOMO Chased Entry',
      entryPrice: 24450,
      exitPrice: 24390,
      quantity: 50,
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 45,
      regulatoryFees: 5,
      taxes: 110,
      stopLoss: 24390,
      target: 24550,
      tags: ['FOMO', 'MistakeEntry'],
      confluences: [],
      psychology: {
        emotionBefore: 'GREEDY',
        emotionDuring: 'ANXIOUS',
        emotionAfter: 'FRUSTRATED',
        disciplineScore: 2,
        rulesFollowed: false,
        checklistCompleted: false,
        mistakes: ['FOMO', 'CHASED_MARKET', 'LATE_ENTRY'],
        revengeTrading: false,
        overtrading: true,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        lessonsLearned: 'Never enter a trade in the afternoon just because the morning move was missed. Costly lesson.',
        notes: 'Broke rule #2: No afternoon chasing without base formation.',
      },
    },
    {
      account: accZerodha,
      strategy: stratFVG,
      symbol: 'NIFTY',
      assetClass: 'FUTURES',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      tradeDate: '2026-10-16',
      entryTime: '2026-10-16T10:00:00Z',
      exitTime: '2026-10-16T13:15:00Z',
      session: 'NSE_REGULAR',
      tradeTitle: 'Nifty Weekly Support Reversal Bounce',
      entryPrice: 24400,
      exitPrice: 24520,
      quantity: 50,
      contractMultiplier: 1,
      brokerage: 40,
      exchangeFees: 46,
      regulatoryFees: 5,
      taxes: 112,
      stopLoss: 24350,
      target: 24550,
      tags: ['Nifty', 'WeeklySupport', 'DisciplineReturned'],
      confluences: ['SUPPORT_RESISTANCE', 'FVG', 'CHOCH'],
      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'CALM',
        emotionAfter: 'CONFIDENT',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        lessonsLearned: 'Reset psychology after yesterday mistake. Clean execution.',
        notes: '6000 gross gain - 203 costs = 5797 net.',
      },
    },
  ];

  let totalZerodhaNetPnL = 0;
  let totalCommodityNetPnL = 0;

  for (const st of sampleTrades) {
    const pnlRes = calculateSimpleExecutionPnL(st.direction as any, {
      entryPrice: st.entryPrice,
      exitPrice: st.exitPrice,
      quantity: st.quantity,
      contractMultiplier: st.contractMultiplier,
      brokerage: st.brokerage,
      exchangeFees: st.exchangeFees,
      regulatoryFees: st.regulatoryFees,
      taxes: st.taxes,
      otherFees: 0,
      explicitAdjustments: 0,
    });

    const plannedDist = Math.abs(st.entryPrice - st.stopLoss);
    const plannedRiskAmount = plannedDist * st.quantity * st.contractMultiplier;
    const realizedRMultiple = calculateRealizedRMultiple(pnlRes.netPnLNumber, plannedRiskAmount);

    const diffMinutes = Math.round(
      (new Date(st.exitTime).getTime() - new Date(st.entryTime).getTime()) / 60000
    );

    const tradeDoc = await Trade.create({
      userId,
      accountId: st.account._id,
      symbol: st.symbol,
      assetClass: st.assetClass,
      exchange: st.exchange,
      marketSegment: st.marketSegment,
      currency: st.account.baseCurrency,
      direction: st.direction,
      status: 'CLOSED',
      strategyId: st.strategy._id,
      strategyName: st.strategy.name,
      tags: st.tags,
      tradeDate: new Date(st.tradeDate),
      timeZone: 'Asia/Kolkata',
      entryTime: new Date(st.entryTime),
      exitTime: new Date(st.exitTime),
      session: st.session,
      tradeTitle: st.tradeTitle,
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: st.entryPrice,
        exitPrice: st.exitPrice,
        quantity: st.quantity,
        contractMultiplier: st.contractMultiplier,
        brokerage: st.brokerage,
        exchangeFees: st.exchangeFees,
        regulatoryFees: st.regulatoryFees,
        taxes: st.taxes,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: st.entryPrice,
        initialStopLoss: st.stopLoss,
        plannedTarget: st.target,
        riskBudgetAmount: plannedRiskAmount,
        estimatedRiskAmount: plannedRiskAmount,
        realizedRMultiple,
        riskRuleViolations: [],
      },
      thesis: {
        confluences: st.confluences,
        customTechnicalLabels: [],
      },
      psychology: st.psychology,
      calculated: {
        grossPnL: pnlRes.grossPnLNumber,
        totalCosts: pnlRes.totalCostsNumber,
        netPnL: pnlRes.netPnLNumber,
        realizedRMultiple,
        holdingTimeMinutes: diffMinutes,
        outcome: pnlRes.outcome,
        closedQuantity: st.quantity,
        openQuantity: 0,
        averageEntryPrice: st.entryPrice,
        averageExitPrice: st.exitPrice,
      },
      screenshotIds: [],
      auditLog: [{ action: 'SEEDED', timestamp: new Date(), changedBy: 'seed-script' }],
    });

    if (st.account._id.toString() === accZerodha._id.toString()) {
      totalZerodhaNetPnL += pnlRes.netPnLNumber;
    } else {
      totalCommodityNetPnL += pnlRes.netPnLNumber;
    }
  }

  // Update account balances
  accZerodha.realizedPnL = mongoose.Types.Decimal128.fromString(totalZerodhaNetPnL.toFixed(2));
  await accZerodha.save();

  accCommodity.realizedPnL = mongoose.Types.Decimal128.fromString(totalCommodityNetPnL.toFixed(2));
  await accCommodity.save();

  console.log('[Seed] Creating daily journals...');
  await DailyJournal.create({
    userId,
    date: '2026-10-15',
    marketConditions: 'Choppy consolidation in afternoon after morning run.',
    marketBias: 'NEUTRAL',
    mistakes: ['FOMO entry at 13:40', 'Overtrading in afternoon'],
    emotionalState: 'FRUSTRATED',
    disciplineRating: 2,
    lessonsLearned: 'Trading after 13:30 without clear setup destroys good morning performance.',
    nextDayPlan: 'Strictly zero trades unless morning ORB or 50% FVG retest presents itself.',
  });

  await DailyJournal.create({
    userId,
    date: '2026-10-16',
    marketConditions: 'Trend day following support defense.',
    marketBias: 'BULLISH',
    mistakes: [],
    emotionalState: 'CALM',
    disciplineRating: 5,
    lessonsLearned: 'Discipline restored. Maintained risk rules and let winners run to target.',
    nextDayPlan: 'Continue executing the playbook with zero deviation.',
  });

  console.log('\n======================================================');
  console.log('✅ Demo Seed Finished Successfully!');
  console.log(`Demo Account: ${email}`);
  console.log(`Password: TradeVault@123`);
  console.log(`Total Trades Seeded: ${sampleTrades.length}`);
  console.log(`Zerodha Account Net P&L: ${totalZerodhaNetPnL.toFixed(2)} INR`);
  console.log(`Commodity Account Net P&L: ${totalCommodityNetPnL.toFixed(2)} INR`);
  console.log('======================================================\n');

  await disconnectDatabase();
}

if (process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed.js')) {
  runSeed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
