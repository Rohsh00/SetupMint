import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, TradingAccount, AccountTransaction, Instrument, Trade } from '../db/models/index.js';
import { AccountService } from '../services/account.service.js';
import { getThe5ersSummerPlanPreset, evaluatePropFirmHealth } from '@tradevault/financial-engine';

async function main() {
  console.log('================================================================');
  console.log('   The5ers Real Account & Trades Synchronization — SetupMint   ');
  console.log('================================================================\n');

  await connectDatabase();

  const user = await User.findOne({ email: 'komal@gmail.com' });
  if (!user) {
    throw new Error('User komal@gmail.com not found!');
  }
  console.log(`[User] Found: ${user.name} (${user.email}, ID: ${user._id})`);

  // 1. Locate or create Trading Account
  let account = await TradingAccount.findOne({
    userId: user._id,
    $or: [
      { _id: new mongoose.Types.ObjectId('6ae9bc4a88a7774500482d26') },
      { name: 'The5ers $100K Summer Plan' },
      { accountNumber: '25436' },
      { accountNumber: 'Roko1999' },
    ],
  });

  const propConfig = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
  propConfig.currentPhaseStartedAt = '2026-10-31';

  const propFirmSubdoc = {
    firmKey: 'THE5ERS',
    planKey: 'SUMMER_100K',
    phase: 'PHASE_1' as const,
    phaseStartedAt: '2026-10-31',
    startingBalance: 100000,
    status: 'ACTIVE' as const,
  };

  if (!account) {
    console.log('[Account] Creating new The5ers trading account...');
    account = await TradingAccount.create({
      userId: user._id,
      name: 'The5ers $100K Summer Plan',
      broker: 'The5ers (Tradingview)',
      accountNumber: '25436',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      realizedPnL: mongoose.Types.Decimal128.fromString('0.00'),
      totalDeposits: mongoose.Types.Decimal128.fromString('0.00'),
      totalWithdrawals: mongoose.Types.Decimal128.fromString('0.00'),
      totalAdjustments: mongoose.Types.Decimal128.fromString('0.00'),
      status: 'ACTIVE',
      propFirmConfig: propConfig,
      propFirm: propFirmSubdoc,
      notes: 'The5ers Summer Plan $149 (Account #25436, Login: Roko1999)',
    });
  } else {
    console.log(`[Account] Found existing account: ${account.name} (${account._id})`);
    account.accountType = 'PROP_FIRM';
    account.accountNumber = '25436';
    account.broker = 'The5ers (Tradingview)';
    account.baseCurrency = 'USD';
    account.initialBalance = mongoose.Types.Decimal128.fromString('100000.00');
    account.propFirmConfig = propConfig;
    account.propFirm = propFirmSubdoc;
    account.markModified('propFirm');
    account.markModified('propFirmConfig');
    account.notes = 'The5ers Summer Plan $149 (Account #25436, Login: Roko1999)';
    account.status = 'ACTIVE';
    await account.save();
  }
  console.log(`[Account] Configured: ${account.name} (Prop Firm: ${account.propFirmConfig?.planName})`);

  // Remove any duplicate manual DEPOSIT transactions on the prop firm account (initialBalance already reflects $100K)
  const deletedDeposits = await AccountTransaction.deleteMany({
    userId: user._id,
    accountId: account._id,
    type: 'DEPOSIT',
  });
  if (deletedDeposits.deletedCount > 0) {
    console.log(`[Transactions] Removed ${deletedDeposits.deletedCount} duplicate deposit transaction(s) from prop account.`);
  }

  // Clean up any empty default propFirm subdocuments on non-prop accounts
  await TradingAccount.updateMany(
    {
      accountType: { $ne: 'PROP_FIRM' },
      'propFirmConfig.enabled': { $ne: true },
      $or: [
        { 'propFirm.firmKey': { $exists: false } },
        { 'propFirm.firmKey': null },
        { 'propFirm.firmKey': '' },
      ],
    },
    { $unset: { propFirm: 1 } }
  );

  // 2. Ensure Instruments exist for komal@gmail.com
  let xauusd = await Instrument.findOne({ userId: user._id, symbol: 'XAUUSD' });
  if (!xauusd) {
    xauusd = await Instrument.create({
      userId: user._id,
      symbol: 'XAUUSD',
      displayName: 'Gold / US Dollar Spot (CFD/Forex)',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      quoteCurrency: 'USD',
      contractMultiplier: 100,
      lotSize: 0.01,
      tickSize: 0.01,
      quantityIncrement: 0.01,
      pricePrecision: 2,
      isActive: true,
      source: 'CUSTOM',
    });
    console.log('[Instrument] Created XAUUSD instrument');
  } else {
    xauusd.contractMultiplier = 100;
    xauusd.quoteCurrency = 'USD';
    await xauusd.save();
    console.log('[Instrument] Verified XAUUSD instrument');
  }

  let ethusd = await Instrument.findOne({ userId: user._id, symbol: 'ETHUSD' });
  if (!ethusd) {
    ethusd = await Instrument.create({
      userId: user._id,
      symbol: 'ETHUSD',
      displayName: 'Ethereum / US Dollar',
      assetClass: 'CRYPTO',
      exchange: 'CRYPTO',
      marketSegment: 'CRYPTO',
      quoteCurrency: 'USD',
      contractMultiplier: 1,
      lotSize: 1,
      tickSize: 0.01,
      quantityIncrement: 1,
      pricePrecision: 2,
      isActive: true,
      source: 'CUSTOM',
    });
    console.log('[Instrument] Created ETHUSD instrument');
  } else {
    ethusd.contractMultiplier = 1;
    ethusd.quoteCurrency = 'USD';
    await ethusd.save();
    console.log('[Instrument] Verified ETHUSD instrument');
  }

  // 3. Clear any existing trades for this account with these tickets for idempotency
  const tickets = [
    '560643070273-1',
    '560643070273-2',
    '560643070273',
    '560643070160',
    '560643070140',
    '560643069881',
    '560643069684',
    '560643069458',
  ];
  const deleteResult = await Trade.deleteMany({
    userId: user._id,
    accountId: account._id,
    externalBrokerOrderRef: { $in: tickets },
  });
  console.log(`[Trades] Cleared ${deleteResult.deletedCount} existing trades matching tickets.`);

  // 4. Build trade payloads
  const tradesToInsert = [
    // 1. Closed Trade: XAUUSD Short 0.4 lot (3908.75 -> 3908.70, Qty 0.4, Fee 3.12, Net -$1.12)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: xauusd._id,
      symbol: 'XAUUSD',
      underlying: 'XAUUSD',
      instrumentName: xauusd.displayName,
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'SHORT',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-03T00:00:00Z'),
      entryTime: new Date('2026-11-03T15:25:00Z'),
      exitTime: new Date('2026-11-03T16:39:00Z'),
      externalBrokerOrderRef: '560643070273-1',
      tradeTitle: 'Gold Short 0.40 Lots',
      tags: ['THE5ERS', 'PROP_FIRM', 'METATRADER5', 'GOLD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3908.75,
        exitPrice: 3908.7,
        quantity: 0.4,
        contractMultiplier: 100,
        brokerage: 3.12,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 3908.75,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 5,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: 2.0,
        totalCosts: 3.12,
        netPnL: -1.12,
        outcome: 'LOSS',
        closedQuantity: 0.4,
        openQuantity: 0,
        averageEntryPrice: 3908.75,
        averageExitPrice: 3908.7,
        holdingTimeMinutes: 74,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643070273-1', source: 'The5ers Hub' },
        },
      ],
    },

    // 2. Closed Trade: XAUUSD Short 0.15 lot (3909.18 -> 3908.68, Qty 0.15, Fee 1.18, Net +$6.32)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: xauusd._id,
      symbol: 'XAUUSD',
      underlying: 'XAUUSD',
      instrumentName: xauusd.displayName,
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'SHORT',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-03T00:00:00Z'),
      entryTime: new Date('2026-11-03T15:24:00Z'),
      exitTime: new Date('2026-11-03T16:39:00Z'),
      externalBrokerOrderRef: '560643070273-2',
      tradeTitle: 'Gold Short 0.15 Lots',
      tags: ['THE5ERS', 'PROP_FIRM', 'METATRADER5', 'GOLD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3909.18,
        exitPrice: 3908.68,
        quantity: 0.15,
        contractMultiplier: 100,
        brokerage: 1.18,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 3909.18,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 5,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: 7.5,
        totalCosts: 1.18,
        netPnL: 6.32,
        outcome: 'WIN',
        closedQuantity: 0.15,
        openQuantity: 0,
        averageEntryPrice: 3909.18,
        averageExitPrice: 3908.68,
        holdingTimeMinutes: 75,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643070273-2', source: 'The5ers Hub' },
        },
      ],
    },

    // 3. Closed Trade: ETHUSD Long (2251.04 -> 2244.57, Qty 50, Fee 67.44, Net -$390.94)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: ethusd._id,
      symbol: 'ETHUSD',
      underlying: 'ETHUSD',
      instrumentName: ethusd.displayName,
      assetClass: 'CRYPTO',
      exchange: 'CRYPTO',
      marketSegment: 'CRYPTO',
      currency: 'USD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-03T00:00:00Z'),
      entryTime: new Date('2026-11-03T11:10:00Z'),
      exitTime: new Date('2026-11-03T11:30:00Z'),
      externalBrokerOrderRef: '560643070160',
      tradeTitle: 'Ethereum Long Scalp',
      tags: ['THE5ERS', 'PROP_FIRM', 'CRYPTO', 'ETHUSD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 2251.04,
        exitPrice: 2244.57,
        quantity: 50,
        contractMultiplier: 1,
        brokerage: 67.44,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 2251.04,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 4,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: -323.50,
        totalCosts: 67.44,
        netPnL: -390.94,
        outcome: 'LOSS',
        closedQuantity: 50,
        openQuantity: 0,
        averageEntryPrice: 2251.04,
        averageExitPrice: 2244.57,
        holdingTimeMinutes: 20,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643070160', source: 'The5ers Hub' },
        },
      ],
    },

    // 4. Closed Trade: XAUUSD Long (3923.41 -> 3920.73, Qty 0.4, Fee 3.14, Net -$110.34)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: xauusd._id,
      symbol: 'XAUUSD',
      underlying: 'XAUUSD',
      instrumentName: xauusd.displayName,
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-03T00:00:00Z'),
      entryTime: new Date('2026-11-03T10:12:00Z'),
      exitTime: new Date('2026-11-03T11:00:00Z'),
      externalBrokerOrderRef: '560643070140',
      tradeTitle: 'Gold Pullback Long',
      tags: ['THE5ERS', 'PROP_FIRM', 'GOLD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3923.41,
        exitPrice: 3920.73,
        quantity: 0.4,
        contractMultiplier: 100,
        brokerage: 3.14,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 3923.41,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 4,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: -107.20,
        totalCosts: 3.14,
        netPnL: -110.34,
        outcome: 'LOSS',
        closedQuantity: 0.4,
        openQuantity: 0,
        averageEntryPrice: 3923.41,
        averageExitPrice: 3920.73,
        holdingTimeMinutes: 48,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643070140', source: 'The5ers Hub' },
        },
      ],
    },

    // 5. Closed Trade: XAUUSD Short (3963.66 -> 3966.18, Qty 0.4, Fee 3.18, Net -$103.98)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: xauusd._id,
      symbol: 'XAUUSD',
      underlying: 'XAUUSD',
      instrumentName: xauusd.displayName,
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'SHORT',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-02T00:00:00Z'),
      entryTime: new Date('2026-11-02T20:26:00Z'),
      exitTime: new Date('2026-11-02T20:28:00Z'),
      externalBrokerOrderRef: '560643069881',
      tradeTitle: 'Gold Resistance Fade',
      tags: ['THE5ERS', 'PROP_FIRM', 'GOLD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3963.66,
        exitPrice: 3966.18,
        quantity: 0.4,
        contractMultiplier: 100,
        brokerage: 3.18,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 3963.66,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 4,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: -100.80,
        totalCosts: 3.18,
        netPnL: -103.98,
        outcome: 'LOSS',
        closedQuantity: 0.4,
        openQuantity: 0,
        averageEntryPrice: 3963.66,
        averageExitPrice: 3966.18,
        holdingTimeMinutes: 2,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643069881', source: 'The5ers Hub' },
        },
      ],
    },

    // 6. Closed Trade: XAUUSD Short (3902.94 -> 3903.01, Qty 0.3, Fee 2.34, Net -$4.44)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: xauusd._id,
      symbol: 'XAUUSD',
      underlying: 'XAUUSD',
      instrumentName: xauusd.displayName,
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'SHORT',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-02T00:00:00Z'),
      entryTime: new Date('2026-11-02T13:35:00Z'),
      exitTime: new Date('2026-11-02T14:16:00Z'),
      externalBrokerOrderRef: '560643069684',
      tradeTitle: 'Gold Intraday Short',
      tags: ['THE5ERS', 'PROP_FIRM', 'GOLD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3902.94,
        exitPrice: 3903.01,
        quantity: 0.3,
        contractMultiplier: 100,
        brokerage: 2.34,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 3902.94,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 5,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: -2.10,
        totalCosts: 2.34,
        netPnL: -4.44,
        outcome: 'LOSS',
        closedQuantity: 0.3,
        openQuantity: 0,
        averageEntryPrice: 3902.94,
        averageExitPrice: 3903.01,
        holdingTimeMinutes: 41,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643069684', source: 'The5ers Hub' },
        },
      ],
    },

    // 7. Closed Trade: ETHUSD Short (2262.99 -> 2268.75, Qty 20, Fee 27.07, Net -$142.27)
    {
      userId: user._id,
      accountId: account._id,
      instrumentId: ethusd._id,
      symbol: 'ETHUSD',
      underlying: 'ETHUSD',
      instrumentName: ethusd.displayName,
      assetClass: 'CRYPTO',
      exchange: 'CRYPTO',
      marketSegment: 'CRYPTO',
      currency: 'USD',
      direction: 'SHORT',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-31T00:00:00Z'),
      entryTime: new Date('2026-10-31T23:19:00Z'),
      exitTime: new Date('2026-11-01T00:05:00Z'),
      externalBrokerOrderRef: '560643069458',
      tradeTitle: 'Ethereum Breakdown Short',
      tags: ['THE5ERS', 'PROP_FIRM', 'CRYPTO', 'ETHUSD'],
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 2262.99,
        exitPrice: 2268.75,
        quantity: 20,
        contractMultiplier: 1,
        brokerage: 27.07,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [],
      risk: {
        plannedEntryPrice: 2262.99,
        riskRuleViolations: [],
      },
      thesis: { confluences: [], customTechnicalLabels: [] },
      psychology: {
        disciplineScore: 4,
        checklistCompleted: true,
        rulesFollowed: true,
        mistakes: [],
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
      },
      calculated: {
        grossPnL: -115.20,
        totalCosts: 27.07,
        netPnL: -142.27,
        outcome: 'LOSS',
        closedQuantity: 20,
        openQuantity: 0,
        averageEntryPrice: 2262.99,
        averageExitPrice: 2268.75,
        holdingTimeMinutes: 46,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'CREATED_PROP_FIRM_SYNC',
          timestamp: new Date(),
          changedBy: user.email,
          details: { ticket: '560643069458', source: 'The5ers Hub' },
        },
      ],
    },
  ];

  const createdTrades = await Trade.insertMany(tradesToInsert);
  console.log(`[Trades] Inserted ${createdTrades.length} trades (7 closed, 0 open).`);

  // 5. Authoritative Balance Recalculation
  const balanceSummary = await AccountService.recalculateAccountBalances(account._id, user._id);
  console.log('\n[Balance Summary] Recalculated:');
  console.log(`  Initial Balance:      $${balanceSummary?.initialBalance.toFixed(2)}`);
  console.log(`  Realized Net P&L:     $${balanceSummary?.realizedPnL.toFixed(2)}`);
  console.log(`  Current Balance:      $${balanceSummary?.currentBalance.toFixed(2)}`);
  console.log(`  Closed Trades:        ${balanceSummary?.closedTradesCount}`);
  console.log(`  Open Trades:          ${balanceSummary?.openTradesCount}`);

  // 6. Compute Prop Firm Health
  const refreshedAcc = await TradingAccount.findById(account._id);
  const health = evaluatePropFirmHealth({
    accountId: account._id.toString(),
    config: refreshedAcc!.propFirmConfig!,
    currentBalance: balanceSummary!.currentBalance,
    previousDayEodBalance: 99749.31, // Balance at EOD Nov 2
    previousDayEodEquity: 99749.31,
  });

  console.log('\n================ The5ers Prop Firm Guardian Status ================');
  console.log(`  Threat Level:         ${health.threatLevel}`);
  console.log(`  Phase:                ${health.phase}`);
  console.log(`  Status Reason:        ${health.statusReason}`);
  console.log(`  Current Equity:       $${health.currentEquity.toFixed(2)}`);
  console.log(`  Target Progress:      $${health.profitMadeInPhase.toFixed(2)} / $${health.targetProfitAmount.toFixed(2)} (${health.targetProgressPercent.toFixed(1)}%)`);
  console.log(`  Target Remaining:     $${health.targetRemaining.toFixed(2)}`);
  console.log(`  Today's Loss:         $${health.todayLossSoFar.toFixed(2)}`);
  console.log(`  Daily Loss Limit:     $${health.dailyLossLimitAmount.toFixed(2)}`);
  console.log(`  Daily Buffer Left:    $${health.dailyBufferRemaining.toFixed(2)} (${health.dailyBufferPercent.toFixed(1)}%)`);
  console.log(`  Max Drawdown Floor:   $${health.maxLossFloor.toFixed(2)}`);
  console.log(`  Max Buffer Left:      $${health.maxLossBufferRemaining.toFixed(2)} (${health.maxLossBufferPercent.toFixed(1)}%)`);
  console.log('===================================================================\n');

  await disconnectDatabase();
}

main().catch(console.error);
