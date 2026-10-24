import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  calculateLinearPnL,
  calculateRealizedRMultiple,
  IndianChargesCalculator,
} from '@tradevault/financial-engine';
import { Confluence, Emotion, MistakeTag, TradingSession } from '@tradevault/shared';
import { AccountService } from '../services/account.service.js';
import { InstrumentService } from '../services/instrument.service.js';
import {
  AccountTransaction,
  Attachment,
  BrokerIntegration,
  DailyJournal,
  Instrument,
  Strategy,
  Trade,
  TradingAccount,
  User,
} from '../db/models/index.js';
import { SeededPRNG } from './prng.js';
import { SeedDensity, SeedOptions, SeedProfileName, SeedResult } from './types.js';
import { IndianMarketCalendar } from './date-generator.js';
import { SEED_INSTRUMENTS, SeedInstrumentSpec } from './instrument-catalog.js';
import { SEED_STRATEGY_PLAYBOOKS } from './playbooks.js';
import { ChartGenerator } from './chart-generator.js';
import { ProfileDefinition, SEED_PROFILES } from './profiles.js';
import { getStorage } from '../storage/index.js';

export class SetupMintSeedEngine {
  /**
   * Executes the heavy seed engine with the given options.
   */
  static async run(options: SeedOptions = {}): Promise<SeedResult> {
    const startTime = Date.now();
    const profileName: SeedProfileName = options.profile || 'active-trader';
    const profileDef: ProfileDefinition = SEED_PROFILES[profileName] || SEED_PROFILES['active-trader'];
    const density: SeedDensity = options.density || profileDef.defaultDensity;
    const targetTradeCount = options.customTradeCount || profileDef.tradeCountMap[density];
    const randomSeed = options.randomSeed ?? 42;
    const prng = new SeededPRNG(randomSeed);

    console.log(`\n======================================================`);
    console.log(`🌱 SetupMint Heavy Seed Engine Starting...`);
    console.log(`Profile: ${profileDef.displayName}`);
    console.log(`Density: ${density} (Target Trades: ${targetTradeCount})`);
    console.log(`Random Seed: ${randomSeed} (Deterministic)`);
    console.log(`======================================================\n`);

    // 1. Find or create demo user
    const email = 'trader@tradevault.local';
    let user = await User.findOne({ email });

    if (!user) {
      const passwordHash = await bcrypt.hash('TradeVault@123', 10);
      user = await User.create({
        email,
        passwordHash,
        name: 'SetupMint Demo Trader',
        baseCurrency: 'INR',
        theme: 'dark',
      });
      console.log(`[SeedEngine] Created demo user: ${email} (Password: TradeVault@123)`);
    } else {
      user.name = 'SetupMint Demo Trader';
      user.baseCurrency = 'INR';
      user.theme = 'dark';
      await user.save();
      console.log(`[SeedEngine] Active demo user: ${email}`);
    }

    const userId = user._id;

    // 2. Safe cleanup strictly for demo user (Real user isolation)
    console.log(`[SeedEngine] Resetting previous demo records for user ${email}...`);
    const oldAttachments = await Attachment.find({ userId });
    if (oldAttachments.length > 0) {
      try {
        const storage = getStorage();
        for (const att of oldAttachments) {
          try {
            await storage.delete(att.storedFilename);
          } catch {
            // ignore individual deletion errors
          }
        }
      } catch {
        // ignore if storage not configured during isolated test mocks
      }
    }
    await Trade.deleteMany({ userId });
    await TradingAccount.deleteMany({ userId });
    await AccountTransaction.deleteMany({ userId });
    await DailyJournal.deleteMany({ userId });
    await Attachment.deleteMany({ userId });
    await Instrument.deleteMany({ userId });
    await Strategy.deleteMany({ userId });
    await BrokerIntegration.deleteMany({ userId });

    // 3. Seed Strategies
    console.log(`[SeedEngine] Seeding ${SEED_STRATEGY_PLAYBOOKS.length} strategy playbooks...`);
    const createdStrategies: any[] = [];
    for (const pb of SEED_STRATEGY_PLAYBOOKS) {
      const strat = await Strategy.create({
        userId,
        name: pb.name,
        description: pb.description,
        assetClasses: pb.assetClasses,
        timeframes: pb.timeframes,
        entryRules: pb.entryRules,
        stopLossRules: pb.stopLossRules,
        targetRules: pb.targetRules,
        invalidationCriteria: pb.invalidationCriteria,
        checklist: pb.checklist,
        minRiskReward: pb.minRiskReward,
        tags: pb.tags,
        isActive: pb.isActive,
        variants: pb.variants || [],
      });
      createdStrategies.push(strat);
    }

    // 5. Seed Trading Accounts
    console.log(`[SeedEngine] Seeding ${profileDef.accounts.length} trading accounts...`);
    const createdAccounts: any[] = [];
    for (const accCfg of profileDef.accounts) {
      const acc = await TradingAccount.create({
        userId,
        name: accCfg.name,
        broker: accCfg.broker,
        accountNumber: accCfg.accountNumber,
        accountType: accCfg.accountType,
        baseCurrency: 'INR',
        initialBalance: mongoose.Types.Decimal128.fromString(accCfg.initialBalance.toFixed(2)),
        currentBalance: mongoose.Types.Decimal128.fromString(accCfg.initialBalance.toFixed(2)),
        realizedPnL: mongoose.Types.Decimal128.fromString('0.00'),
        totalDeposits: mongoose.Types.Decimal128.fromString('0.00'),
        totalWithdrawals: mongoose.Types.Decimal128.fromString('0.00'),
        status: 'ACTIVE',
        notes: accCfg.notes,
        riskRules: {
          maxDailyLoss: Math.round(accCfg.initialBalance * 0.03), // 3% max daily loss
          maxRiskPerTradePercent: 1.5,
          maxOpenTrades: 4,
        },
      });
      createdAccounts.push(acc);
    }

    // 6. Seed Account Cash Flows (Deposits, milestone withdrawals, adjustments)
    console.log(`[SeedEngine] Seeding cash flow transactions...`);
    const createdTransactionsCount = await this.seedAccountTransactions(userId, createdAccounts, prng);

    // 7. Seed FYERS Broker Integration
    console.log(`[SeedEngine] Seeding FYERS broker connection status & sync history...`);
    await BrokerIntegration.create({
      userId,
      broker: 'FYERS',
      status: 'IDLE',
      appId: 'FYERS-DEMO-2026',
      lastSyncAt: new Date(),
      syncHistory: [
        {
          timestamp: new Date(Date.now() - 3600000 * 2),
          status: 'SUCCESS',
          syncedCount: 14,
          reconciledCount: 14,
        },
        {
          timestamp: new Date(Date.now() - 3600000 * 26),
          status: 'SUCCESS',
          syncedCount: 22,
          reconciledCount: 22,
        },
      ],
    });

    // 8. Generate Trading Days distribution
    // Covers previous 2 years up to runtime date (Oct 18, 2026)
    const asOfDate = options.asOfDate || new Date('2026-10-18T12:00:00.000Z');
    const startDate = new Date(asOfDate.getTime() - 1000 * 60 * 60 * 24 * 365 * 2); // 2 years back
    const allDays = IndianMarketCalendar.getTradingDays(startDate, asOfDate);
    const tradingDays = allDays.filter((d) => d.isTradingDay);

    console.log(
      `[SeedEngine] Generated ${tradingDays.length} historical trading days (from ${startDate.toISOString().slice(0, 10)} to ${asOfDate.toISOString().slice(0, 10)})`
    );

    // 8. Generate Trades
    console.log(`[SeedEngine] Generating ${targetTradeCount} realistic trades...`);
    const tradeGenerationResult = await this.generateTrades(
      userId,
      profileDef,
      targetTradeCount,
      createdAccounts,
      createdStrategies,
      tradingDays,
      prng,
      asOfDate
    );

    // 9. Generate Daily Journal reflections
    console.log(`[SeedEngine] Seeding trading calendar daily reflections...`);
    const dailyJournalsCount = await this.seedDailyJournals(
      userId,
      tradeGenerationResult.tradesByDate,
      prng
    );

    // 10. Authoritative Account Balance Reconciliation
    console.log(`[SeedEngine] Reconciling authoritative balances across all accounts...`);
    const reconciledAccounts = await AccountService.reconcileAllUserAccounts(userId);

    const durationMs = Date.now() - startTime;

    const result: SeedResult = {
      profile: profileName,
      density,
      userEmail: email,
      userId: userId.toString(),
      counts: {
        accounts: createdAccounts.length,
        transactions: createdTransactionsCount,
        instruments: tradeGenerationResult.createdInstruments.length,
        strategies: createdStrategies.length,
        trades: tradeGenerationResult.totalCreated,
        attachments: tradeGenerationResult.attachmentCount,
        dailyJournals: dailyJournalsCount,
        brokerIntegrations: 1,
      },
      tradesSummary: tradeGenerationResult.summary,
      accountsSummary: reconciledAccounts.map((a) => {
        const accDoc = createdAccounts.find((x) => x._id.toString() === a.accountId);
        return {
          name: accDoc ? accDoc.name : a.accountId,
          broker: accDoc ? accDoc.broker : 'FYERS',
          initialBalance: a.initialBalance,
          currentBalance: a.currentBalance,
          realizedPnL: a.realizedPnL,
        };
      }),
      durationMs,
    };

    console.log(`\n======================================================`);
    console.log(`✅ SetupMint Seed Finished in ${(durationMs / 1000).toFixed(2)}s!`);
    console.log(`Profile: ${profileDef.displayName}`);
    console.log(`Total Trades Seeded: ${result.counts.trades}`);
    console.log(`Win Rate: ${result.tradesSummary.winRatePercent.toFixed(1)}%`);
    console.log(`Total Net Realized P&L: ₹${result.tradesSummary.totalNetPnL.toLocaleString('en-IN')}`);
    for (const acc of result.accountsSummary) {
      console.log(`Account [${acc.name}]: Initial ₹${acc.initialBalance.toLocaleString('en-IN')} | Realized P&L ₹${acc.realizedPnL.toLocaleString('en-IN')} | Current Balance ₹${acc.currentBalance.toLocaleString('en-IN')}`);
    }
    console.log(`======================================================\n`);

    return result;
  }

  /**
   * Seeds realistic deposits, milestone profit withdrawals, and cash adjustments.
   */
  private static async seedAccountTransactions(
    userId: mongoose.Types.ObjectId,
    accounts: any[],
    prng: SeededPRNG
  ): Promise<number> {
    let count = 0;
    for (const acc of accounts) {
      // 1. Initial Deposit
      await AccountTransaction.create({
        userId,
        accountId: acc._id,
        type: 'DEPOSIT',
        amount: acc.initialBalance,
        currency: 'INR',
        date: new Date('2024-04-01T09:00:00.000Z'),
        notes: 'Initial capital allocation via FYERS Net Banking',
      });
      count++;

      // 2. Periodic Top-up or Milestone Withdrawal
      if (acc.broker === 'FYERS') {
        await AccountTransaction.create({
          userId,
          accountId: acc._id,
          type: 'DEPOSIT',
          amount: mongoose.Types.Decimal128.fromString('50000.00'),
          currency: 'INR',
          date: new Date('2025-01-10T10:30:00.000Z'),
          notes: 'Capital expansion for options margin requirements',
        });
        count++;

        await AccountTransaction.create({
          userId,
          accountId: acc._id,
          type: 'WITHDRAWAL',
          amount: mongoose.Types.Decimal128.fromString('25000.00'),
          currency: 'INR',
          date: new Date('2025-07-15T16:00:00.000Z'),
          notes: 'Quarterly trading profit payout to bank account',
        });
        count++;

        await AccountTransaction.create({
          userId,
          accountId: acc._id,
          type: 'ADJUSTMENT',
          amount: mongoose.Types.Decimal128.fromString('125.50'),
          currency: 'INR',
          date: new Date('2026-03-31T20:00:00.000Z'),
          notes: 'FY annual interest credit on idle trading balance',
        });
        count++;
      }
    }
    return count;
  }

  /**
   * Generates trades and advanced fills according to profile requirements.
   */
  private static async generateTrades(
    userId: mongoose.Types.ObjectId,
    profileDef: ProfileDefinition,
    targetCount: number,
    accounts: any[],
    strategies: any[],
    tradingDays: any[],
    prng: SeededPRNG,
    asOfDate: Date
  ): Promise<{
    totalCreated: number;
    attachmentCount: number;
    summary: SeedResult['tradesSummary'];
    tradesByDate: Map<string, any[]>;
    createdInstruments: any[];
  }> {
    // Filter instrument specs by profile's allowed asset classes
    const eligibleSpecs = SEED_INSTRUMENTS.filter((s) =>
      profileDef.allowedAssetClasses.includes(s.assetClass)
    );
    const specPool = eligibleSpecs.length > 0 ? eligibleSpecs : SEED_INSTRUMENTS;
    const instrumentCache = new Map<string, any>();

    // Confluence options
    const allConfluences: Confluence[] = [
      'BOS',
      'CHOCH',
      'FVG',
      'ORDER_BLOCK',
      'LIQUIDITY_SWEEP',
      'PDH_PDL',
      'SUPPORT_RESISTANCE',
      'EMA_CROSS',
      'VWAP',
      'VOLUME_SPIKE',
    ];

    // Mistakes pool
    const mistakeOptions: MistakeTag[] = [
      'FOMO',
      'REVENGE_TRADING',
      'OVERTRADING',
      'PREMATURE_EXIT',
      'STOP_MOVED',
      'SIZE_VIOLATION',
      'CHASED_MARKET',
      'EARLY_ENTRY',
      'LATE_ENTRY',
      'POOR_RR',
    ];

    const emotionOptions: Emotion[] = ['CALM', 'CONFIDENT', 'DISCIPLINED', 'ANXIOUS', 'GREEDY', 'FRUSTRATED', 'NEUTRAL'];

    const tradesToInsert: any[] = [];
    const tradesByDate = new Map<string, any[]>();

    let closedCount = 0;
    let openCount = 0;
    let plannedCount = 0;
    let cancelledCount = 0;
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let totalGrossPnL = 0;
    let totalCosts = 0;
    let totalNetPnL = 0;

    // Distribute trades across trading days: more recent months have higher trade density
    // Recent 90 days get 50% of trades, older periods get the remaining 50%
    const recentCutoff = new Date(asOfDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const recentTradingDays = tradingDays.filter((d) => d.date >= recentCutoff);
    const olderTradingDays = tradingDays.filter((d) => d.date < recentCutoff);

    for (let i = 0; i < targetCount; i++) {
      // Pick date
      const isRecent = prng.chance(0.55);
      const dayPool = isRecent && recentTradingDays.length > 0 ? recentTradingDays : olderTradingDays.length > 0 ? olderTradingDays : tradingDays;
      const day = prng.pick(dayPool);
      const dateStr = day.dateStr;

      // Pick account (primary gets 70% weight)
      let account = accounts[0];
      if (accounts.length > 1 && !prng.chance(0.7)) {
        account = prng.pick(accounts.slice(1));
      }

      // Pick instrument spec matching account
      let spec = prng.pick(specPool);
      if (account.accountType === 'COMMODITY') {
        const commoditySpecs = specPool.filter((x) => x.assetClass === 'COMMODITY');
        if (commoditySpecs.length > 0) spec = prng.pick(commoditySpecs);
      } else if (account.accountType === 'FUTURES_OPTIONS') {
        const fnoSpecs = specPool.filter((x) => x.assetClass === 'FUTURES' || x.assetClass === 'OPTIONS');
        if (fnoSpecs.length > 0) spec = prng.pick(fnoSpecs);
      } else if (account.accountType === 'EQUITY') {
        const eqSpecs = specPool.filter((x) => x.assetClass === 'EQUITY');
        if (eqSpecs.length > 0) spec = prng.pick(eqSpecs);
      }

      // Ensure instrument exists on demand for this underlying
      const underlying = InstrumentService.normalizeUnderlying(spec.symbol);
      let inst = instrumentCache.get(underlying);
      if (!inst) {
        inst = await InstrumentService.ensureForTrade(userId, {
          symbol: spec.symbol,
          assetClass: spec.assetClass,
          exchange: spec.exchange,
          marketSegment: spec.marketSegment,
          currency: spec.quoteCurrency,
          instrumentName: spec.displayName,
          contractMultiplier: spec.contractMultiplier,
          lotSize: spec.lotSize,
          tickSize: spec.tickSize,
          quantityIncrement: spec.quantityIncrement,
          pricePrecision: spec.pricePrecision,
        });
        instrumentCache.set(underlying, inst);
      }

      // Pick matching strategy
      const eligibleStrategies = strategies.filter((s: any) =>
        s.assetClasses.includes(spec.assetClass)
      );
      const strategy = eligibleStrategies.length > 0 ? prng.pick(eligibleStrategies) : strategies[0];

      // Session & Timing
      const session: TradingSession = spec.assetClass === 'COMMODITY' ? 'MCX_EVENING' : 'NSE_REGULAR';
      const entryHour = session === 'MCX_EVENING' ? prng.nextInt(17, 21) : prng.nextInt(9, 14);
      const entryMinute = session === 'NSE_REGULAR' && entryHour === 9 ? prng.nextInt(16, 55) : prng.nextInt(0, 55);
      const holdingMinutes = spec.assetClass === 'OPTIONS' ? prng.nextInt(12, 120) : prng.nextInt(25, 280);

      const { entryTime, exitTime } = IndianMarketCalendar.createExecutionTimestamps(
        dateStr,
        session as any,
        { hour: entryHour, minute: entryMinute },
        holdingMinutes
      );

      // Status
      let status = 'CLOSED';
      if (i === targetCount - 1 && profileDef.allowOpenTrades) {
        status = 'OPEN';
      } else if (i === targetCount - 2 && profileDef.allowPlannedTrades) {
        status = 'PLANNED';
      } else if (i === targetCount - 3 && profileDef.allowCancelledTrades) {
        status = 'CANCELLED';
      }

      // Direction
      const direction = prng.chance(0.65) ? 'LONG' : 'SHORT';

      // Base Price
      const minP = spec.typicalPriceMin ?? 1000;
      const maxP = spec.typicalPriceMax ?? 1500;
      const entryPrice = prng.nextNumber(minP, maxP, inst.pricePrecision);

      // Stop Loss & Target Distance
      const stopDistancePercent = spec.assetClass === 'OPTIONS' ? prng.nextNumber(0.1, 0.25) : prng.nextNumber(0.005, 0.015);
      const stopDist = Number((entryPrice * stopDistancePercent).toFixed(inst.pricePrecision));

      const stopLoss = direction === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
      const targetMultiple = prng.nextNumber(1.6, 2.8);
      const target = direction === 'LONG' ? entryPrice + stopDist * targetMultiple : entryPrice - stopDist * targetMultiple;

      // Quantity calculation based on ~1% account risk
      const plannedRiskPerTrade = 4000; // ~₹4,000 risk budget
      const lossPerUnit = stopDist * inst.contractMultiplier;
      let rawQty = lossPerUnit > 0 ? Math.floor(plannedRiskPerTrade / lossPerUnit) : 1;
      // Round to lot size
      let quantity = Math.max(inst.lotSize, Math.floor(rawQty / inst.lotSize) * inst.lotSize);
      if (quantity === 0) quantity = inst.lotSize;

      // Outcome & Exit Price
      const isWin = prng.chance(profileDef.winRateTarget);
      const isBreakeven = !isWin && prng.chance(0.12);

      let exitPrice = entryPrice;
      if (status === 'CLOSED') {
        if (isBreakeven) {
          // Breakeven: slight move insufficient to cover fees
          const tinyMove = stopDist * 0.05;
          exitPrice = direction === 'LONG' ? entryPrice + tinyMove : entryPrice - tinyMove;
        } else if (isWin) {
          // Winner: 1.2R to 2.8R
          const winR = prng.nextNumber(1.2, 2.8);
          exitPrice = direction === 'LONG' ? entryPrice + stopDist * winR : entryPrice - stopDist * winR;
        } else {
          // Loser: 0.8R to 1.1R (SL hit or partial slippage)
          const lossR = prng.nextNumber(0.85, 1.05);
          exitPrice = direction === 'LONG' ? entryPrice - stopDist * lossR : entryPrice + stopDist * lossR;
        }
      }

      exitPrice = Number(exitPrice.toFixed(inst.pricePrecision));

      // Execution Mode (Simple vs Advanced Fills)
      const isAdvanced = profileDef.allowAdvancedFills && prng.chance(0.25);
      const executionMode = isAdvanced ? 'ADVANCED' : 'SIMPLE';

      // Fills
      const fills: any[] = [];
      if (status === 'CLOSED') {
        if (isAdvanced) {
          // 2 entry fills (scale-in) and 2 exit fills (scale-out)
          const halfQty = Math.max(inst.lotSize, Math.floor(quantity / (2 * inst.lotSize)) * inst.lotSize);
          const remQty = quantity - halfQty;

          fills.push({
            fillId: `fill_ent_${i}_1`,
            type: 'ENTRY',
            price: entryPrice,
            quantity: halfQty,
            timestamp: entryTime,
            brokerage: 20,
            fee: 10,
            taxes: 25,
            notes: 'Initial position entry at setup level',
          });

          const secondEntryPrice = direction === 'LONG' ? entryPrice + stopDist * 0.1 : entryPrice - stopDist * 0.1;
          fills.push({
            fillId: `fill_ent_${i}_2`,
            type: 'ENTRY',
            price: Number(secondEntryPrice.toFixed(inst.pricePrecision)),
            quantity: remQty,
            timestamp: new Date(entryTime.getTime() + 5 * 60 * 1000),
            brokerage: 20,
            fee: 10,
            taxes: 25,
            notes: 'Confirmation scale-in fill',
          });

          fills.push({
            fillId: `fill_ext_${i}_1`,
            type: 'EXIT',
            price: Number(((entryPrice + exitPrice) / 2).toFixed(inst.pricePrecision)),
            quantity: halfQty,
            timestamp: new Date(entryTime.getTime() + (holdingMinutes - 10) * 60 * 1000),
            brokerage: 20,
            fee: 10,
            taxes: 25,
            notes: 'Partial 50% scale-out at 1.5R target',
          });

          fills.push({
            fillId: `fill_ext_${i}_2`,
            type: 'EXIT',
            price: exitPrice,
            quantity: remQty,
            timestamp: exitTime,
            brokerage: 20,
            fee: 10,
            taxes: 25,
            notes: 'Runner exit upon final target / trail stop',
          });
        }
      }

      // Charges & Financial Calculations
      const charges = IndianChargesCalculator.calculate(
        inst.assetClass,
        inst.marketSegment,
        entryPrice,
        status === 'CLOSED' ? exitPrice : entryPrice,
        quantity,
        inst.contractMultiplier
      );

      const pnlRes = calculateLinearPnL({
        direction: direction as any,
        entryPrice,
        exitPrice: status === 'CLOSED' ? exitPrice : null,
        quantity,
        contractMultiplier: inst.contractMultiplier,
        brokerage: charges.brokerage,
        exchangeFees: charges.exchangeFees,
        regulatoryFees: charges.regulatoryFees,
        taxes: charges.taxes,
        precision: 2,
      });

      const plannedRiskAmount = stopDist * quantity * inst.contractMultiplier;
      const realizedRMultiple =
        status === 'CLOSED' ? calculateRealizedRMultiple(pnlRes.netPnLNumber, plannedRiskAmount) : undefined;

      // Psychology & Discipline
      let disciplineScore = 5;
      let mistakes: string[] = [];
      let rulesFollowed = true;
      let revengeTrading = false;
      let overtrading = false;
      let prematureExit = false;
      let stopLossMoved = false;

      if (profileDef.behaviorFocus === 'PSYCHOLOGY' || prng.chance(0.2)) {
        if (!isWin && prng.chance(0.5)) {
          // Undisciplined loss or revenge trade
          disciplineScore = prng.nextInt(1, 3);
          rulesFollowed = false;
          mistakes = prng.pickMultiple(mistakeOptions, prng.nextInt(1, 2));
          if (mistakes.includes('REVENGE_TRADING')) revengeTrading = true;
          if (mistakes.includes('OVERTRADING')) overtrading = true;
          if (mistakes.includes('STOP_MOVED')) stopLossMoved = true;
        } else if (isWin && prng.chance(0.35)) {
          // Undisciplined win (lucky mistake, premature exit)
          disciplineScore = prng.nextInt(2, 3);
          rulesFollowed = false;
          mistakes = ['PREMATURE_EXIT'];
          prematureExit = true;
        } else {
          // Disciplined execution (whether win or loss)
          disciplineScore = prng.nextInt(4, 5);
          rulesFollowed = true;
          mistakes = [];
        }
      }

      // Confluences
      const confluences = prng.pickMultiple(allConfluences, prng.nextInt(2, 4));

      // Titles
      const tradeTitle = `${spec.symbol} ${strategy.name.slice(0, 20)} ${direction}`;

      // Notes
      const notes = isWin
        ? `Clean execution. Followed ${strategy.name} rules with strong volume confirmation.`
        : isBreakeven
        ? 'Price hesitated around 1R. Trailed stop loss to breakeven to eliminate risk.'
        : 'Invalidation stop respected. Market structure shifted unexpectedly against thesis.';

      const lessonsLearned = isWin
        ? 'Letting winners reach predefined target maximizes edge.'
        : mistakes.length > 0
        ? `Mistake identified: ${mistakes.join(', ')}. Avoid emotional impulses.`
        : 'Controlled loss according to risk budget is standard cost of doing business.';

      let setupData: any = undefined;
      const initialAuditLog: any[] = [{ action: 'SEEDED', timestamp: entryTime, changedBy: 'seed-engine' }];

      if (strategy.variants && strategy.variants.length > 0) {
        const matchingVariants = strategy.variants.filter((v: any) => !v.expected?.direction || v.expected.direction === direction);
        const pickedVariant: any = matchingVariants.length > 0 ? prng.pick(matchingVariants) : prng.pick(strategy.variants);
        setupData = {
          variantKey: pickedVariant.key,
          variantStatus: 'CLASSIFIED',
          htfBias: direction === 'LONG' ? 'BULLISH' : 'BEARISH',
          executionTimeframe: '5m',
          liquiditySide: pickedVariant.expected?.liquiditySide || (direction === 'LONG' ? 'SELL_SIDE' : 'BUY_SIDE'),
          patternType: pickedVariant.expected?.patternType || (direction === 'LONG' ? 'W' : 'M'),
          secondLegStatus: pickedVariant.expected?.secondLegStatus || 'SWEPT',
          entryModel: 'CONFIRMATION_CANDLE',
        };
        initialAuditLog.push({
          action: 'CLASSIFIED',
          timestamp: entryTime,
          changedBy: 'seed-engine',
          details: {
            event: 'CLASSIFIED',
            userId,
            previousVariantKey: undefined,
            newVariantKey: pickedVariant.key,
            previousStatus: 'UNCLASSIFIED',
            newStatus: 'CLASSIFIED',
            reason: 'Initial setup variant classification during trade logging',
          },
        });
      }

      // Generate realistic stop move events
      const stopLossMoveEvents: any[] = [];
      let stopMoveSummary: any = undefined;

      if (status === 'CLOSED' && stopLoss > 0) {
        if (stopLossMoved) {
          // Widened risk under pressure
          const widenedPts = Number((stopDist * prng.nextNumber(0.2, 0.5)).toFixed(inst.pricePrecision));
          const newStop =
            direction === 'LONG'
              ? Number((stopLoss - widenedPts).toFixed(inst.pricePrecision))
              : Number((stopLoss + widenedPts).toFixed(inst.pricePrecision));

          const moveTime = new Date(entryTime.getTime() + Math.min(holdingMinutes * 0.4 * 60000, 30 * 60000));
          stopLossMoveEvents.push({
            previousStop: stopLoss,
            newStop,
            changePoints: widenedPts,
            changePercent: Number(((widenedPts / stopLoss) * 100).toFixed(2)),
            moveType: 'WIDENED_RISK',
            movedAt: moveTime,
            reason: 'Widened stop loss to give trade extra room',
          });

          stopMoveSummary = {
            totalMoves: 1,
            widenedCount: 1,
            trailedCount: 0,
            initialStop: stopLoss,
            finalStop: newStop,
            netRiskChangePoints: widenedPts,
            hasWidenedRisk: true,
            detectedAt: exitTime || entryTime,
          };

          initialAuditLog.push({
            action: 'STOP_MOVED_DETECTED',
            timestamp: moveTime,
            changedBy: 'system',
            details: {
              widenedCount: 1,
              netRiskChangePoints: widenedPts,
            },
          });
        } else if (isWin && prng.chance(0.25)) {
          // Trailed stop favorably
          const trailPts = Number((stopDist * prng.nextNumber(0.5, 1.2)).toFixed(inst.pricePrecision));
          const newStop =
            direction === 'LONG'
              ? Number((stopLoss + trailPts).toFixed(inst.pricePrecision))
              : Number((stopLoss - trailPts).toFixed(inst.pricePrecision));

          const moveTime = new Date(entryTime.getTime() + Math.min(holdingMinutes * 0.5 * 60000, 45 * 60000));
          stopLossMoveEvents.push({
            previousStop: stopLoss,
            newStop,
            changePoints: trailPts,
            changePercent: Number(((trailPts / stopLoss) * 100).toFixed(2)),
            moveType: 'TRAILED_FAVORABLY',
            movedAt: moveTime,
            reason: 'Trailed stop loss to lock in profits',
          });

          stopMoveSummary = {
            totalMoves: 1,
            widenedCount: 0,
            trailedCount: 1,
            initialStop: stopLoss,
            finalStop: newStop,
            netRiskChangePoints: -trailPts,
            hasWidenedRisk: false,
            detectedAt: exitTime || entryTime,
          };
        }
      }

      const tradeDoc: any = {
        _id: new mongoose.Types.ObjectId(),
        userId,
        accountId: account._id,
        instrumentId: inst._id,
        underlying: inst.symbol,
        symbol: spec.symbol,
        instrumentName: spec.displayName,
        assetClass: spec.assetClass,
        exchange: spec.exchange,
        marketSegment: spec.marketSegment,
        currency: account.baseCurrency,
        direction,
        status,
        optionType: spec.optionType,
        strikePrice: spec.strikePrice,
        expiryDate: spec.expiryDate,
        strategyId: strategy._id,
        strategyName: strategy.name,
        tags: [...strategy.tags, direction, spec.assetClass],
        tradeDate: new Date(dateStr),
        timeZone: 'Asia/Kolkata',
        entryTime,
        exitTime: status === 'CLOSED' ? exitTime : undefined,
        session,
        tradeTitle,
        externalBrokerOrderRef: `FYERS-${dateStr.replace(/-/g, '')}-${i + 1000}`,
        executionMode,
        simpleExecution: {
          entryPrice,
          exitPrice: status === 'CLOSED' ? exitPrice : undefined,
          quantity,
          contractMultiplier: inst.contractMultiplier,
          brokerage: charges.brokerage,
          exchangeFees: charges.exchangeFees,
          regulatoryFees: charges.regulatoryFees,
          taxes: charges.taxes,
          otherFees: 0,
          explicitAdjustments: 0,
        },
        fills,
        risk: {
          plannedEntryPrice: entryPrice,
          initialStopLoss: stopLoss,
          plannedTarget: target,
          riskBudgetAmount: plannedRiskAmount,
          estimatedRiskAmount: plannedRiskAmount,
          realizedRMultiple,
          riskRuleViolations: mistakes.includes('SIZE_VIOLATION') ? ['Risk budget exceeded by 20%'] : [],
        },
        thesis: {
          preMarketBias: prng.pick(['BULLISH', 'BEARISH', 'NEUTRAL']),
          marketStructure: prng.pick(['TRENDING_UP', 'TRENDING_DOWN', 'RANGING']),
          entryRationale: `Setup qualified on ${strategy.name} rules.`,
          confluences,
          customTechnicalLabels: [],
        },
        psychology: {
          emotionBefore: prng.pick(emotionOptions),
          emotionDuring: prng.pick(emotionOptions),
          emotionAfter: prng.pick(emotionOptions),
          confidenceScore: prng.nextInt(3, 5),
          disciplineScore,
          checklistCompleted: rulesFollowed,
          rulesFollowed,
          mistakes,
          revengeTrading,
          overtrading,
          prematureExit,
          stopLossMoved,
          positionSizeViolation: mistakes.includes('SIZE_VIOLATION'),
          lessonsLearned,
          notes,
        },
        calculated: (() => {
          let excursionData: any = undefined;
          if (status === 'CLOSED') {
            const resolution = holdingMinutes <= 240 ? '1' : '5';
            let mfePts = 0;
            let maePts = 0;
            let exitEff = 0;
            const flags: string[] = [];
            let reversedAfterStop = false;

            if (isWin) {
              const favorablePts = Math.abs(exitPrice - entryPrice);
              mfePts = Number((favorablePts * prng.nextNumber(1.05, 1.35)).toFixed(inst.pricePrecision));
              maePts = Number((stopDist * prng.nextNumber(0.1, 0.65)).toFixed(inst.pricePrecision));
              exitEff = mfePts > 0 ? Number(Math.min(1, Math.max(0, favorablePts / mfePts)).toFixed(4)) : 1;
            } else if (isBreakeven) {
              mfePts = Number((stopDist * prng.nextNumber(0.8, 1.8)).toFixed(inst.pricePrecision));
              maePts = Number((stopDist * prng.nextNumber(0.2, 0.65)).toFixed(inst.pricePrecision));
              exitEff = 0;
              flags.push('GAVE_BACK_PROFIT');
            } else {
              maePts = Number((Math.abs(exitPrice - entryPrice) * prng.nextNumber(1.0, 1.05)).toFixed(inst.pricePrecision));
              mfePts = Number((stopDist * prng.nextNumber(0.05, 0.4)).toFixed(inst.pricePrecision));
              exitEff = 0;
              if (prng.chance(0.3) || mistakes.includes('STOP_MOVED')) {
                reversedAfterStop = true;
                flags.push('STOP_TOO_TIGHT_EVIDENCE');
              }
            }

            const mfeAmt = Number((mfePts * quantity * inst.contractMultiplier).toFixed(2));
            const maeAmt = Number((maePts * quantity * inst.contractMultiplier).toFixed(2));
            const mfeR = stopDist > 0 ? Number((mfePts / stopDist).toFixed(2)) : undefined;
            const maeR = stopDist > 0 ? Number((maePts / stopDist).toFixed(2)) : undefined;

            excursionData = {
              status: 'COMPUTED',
              computedAt: exitTime ? exitTime.toISOString() : entryTime.toISOString(),
              source: 'FYERS_HISTORY',
              resolution,
              maePoints: maePts,
              mfePoints: mfePts,
              maeAmount: maeAmt,
              mfeAmount: mfeAmt,
              maeR,
              mfeR,
              exitEfficiency: exitEff,
              stopEfficiency: exitEff,
              stopHit: !isWin && !isBreakeven,
              reversedAfterStopHit: reversedAfterStop,
              timeToMfeMinutes: prng.nextInt(5, Math.max(6, holdingMinutes)),
              timeToMaeMinutes: prng.nextInt(3, Math.max(4, holdingMinutes)),
              candleCount: Math.max(3, Math.floor(holdingMinutes / (holdingMinutes <= 240 ? 1 : 5))),
              excursionFlags: flags,
            };
          }

          return {
            grossPnL: pnlRes.grossPnLNumber,
            totalCosts: pnlRes.totalCostsNumber,
            netPnL: pnlRes.netPnLNumber,
            realizedRMultiple,
            holdingTimeMinutes: holdingMinutes,
            outcome: pnlRes.outcome,
            closedQuantity: status === 'CLOSED' ? quantity : 0,
            openQuantity: status === 'OPEN' ? quantity : 0,
            averageEntryPrice: entryPrice,
            averageExitPrice: status === 'CLOSED' ? exitPrice : undefined,
            excursion: excursionData,
            stopMoveSummary,
          };
        })(),
        stopLossMoveEvents,
        setup: setupData,
        screenshotIds: [],
        auditLog: initialAuditLog,
        createdAt: entryTime,
        updatedAt: exitTime || entryTime,
      };

      tradesToInsert.push(tradeDoc);

      // Track summary counts
      if (status === 'CLOSED') {
        closedCount++;
        totalGrossPnL += pnlRes.grossPnLNumber;
        totalCosts += pnlRes.totalCostsNumber;
        totalNetPnL += pnlRes.netPnLNumber;

        if (pnlRes.outcome === 'WIN') winCount++;
        else if (pnlRes.outcome === 'LOSS') lossCount++;
        else breakevenCount++;

        // Track in tradesByDate
        if (!tradesByDate.has(dateStr)) tradesByDate.set(dateStr, []);
        tradesByDate.get(dateStr)!.push(tradeDoc);
      } else if (status === 'OPEN') {
        openCount++;
      } else if (status === 'PLANNED') {
        plannedCount++;
      } else {
        cancelledCount++;
      }
    }

    // Generate Synthetic Charts & Attachments for select prominent trades
    console.log(`[SeedEngine] Generating SVG candlestick chart attachments...`);
    let attachmentCount = 0;
    const attachmentTrades = tradesToInsert.filter((t) => t.status === 'CLOSED').slice(0, 10);

    for (let idx = 0; idx < attachmentTrades.length; idx++) {
      const tr = attachmentTrades[idx];
      try {
        const chartDoc = await ChartGenerator.createSyntheticChart(userId, tr._id, {
          tradeSymbol: tr.symbol,
          category: idx % 4 === 0 ? 'AUTO_CHART' : idx % 4 === 1 ? 'SETUP' : idx % 4 === 2 ? 'ENTRY' : 'EXIT',
          timeframe: '15m',
          description: `${tr.tradeTitle} — Chart analysis with technical execution levels`,
          themeColor: tr.calculated.outcome === 'WIN' ? 'emerald' : 'rose',
          entryPrice: tr.simpleExecution.entryPrice,
          stopPrice: tr.risk.initialStopLoss,
          targetPrice: tr.risk.plannedTarget,
        });

        tr.screenshotIds = [chartDoc._id];
        attachmentCount++;
      } catch (err: any) {
        console.warn(`[SeedEngine] Could not generate chart: ${err.message}`);
      }
    }

    // Bulk insert all trades
    await Trade.insertMany(tradesToInsert);

    const winRatePercent = closedCount > 0 ? (winCount / closedCount) * 100 : 0;

    return {
      totalCreated: tradesToInsert.length,
      attachmentCount,
      tradesByDate,
      createdInstruments: Array.from(instrumentCache.values()),
      summary: {
        closed: closedCount,
        open: openCount,
        planned: plannedCount,
        cancelled: cancelledCount,
        wins: winCount,
        losses: lossCount,
        breakeven: breakevenCount,
        winRatePercent: Number(winRatePercent.toFixed(2)),
        totalGrossPnL: Number(totalGrossPnL.toFixed(2)),
        totalCosts: Number(totalCosts.toFixed(2)),
        totalNetPnL: Number(totalNetPnL.toFixed(2)),
      },
    };
  }

  /**
   * Seeds daily journal reviews across active trading days.
   */
  private static async seedDailyJournals(
    userId: mongoose.Types.ObjectId,
    tradesByDate: Map<string, any[]>,
    prng: SeededPRNG
  ): Promise<number> {
    const dates = Array.from(tradesByDate.keys()).sort();
    const journalsToInsert: any[] = [];

    // Bias options
    const biases: Array<'BULLISH' | 'BEARISH' | 'NEUTRAL'> = ['BULLISH', 'BEARISH', 'NEUTRAL'];

    for (const dateStr of dates) {
      const dayTrades = tradesByDate.get(dateStr) || [];
      if (dayTrades.length === 0) continue;

      // Sort day trades by netPnL to find best and worst
      const sortedByPnL = [...dayTrades].sort(
        (a, b) => b.calculated.netPnL - a.calculated.netPnL
      );
      const bestTrade = sortedByPnL[0];
      const worstTrade = sortedByPnL[sortedByPnL.length - 1];

      const dailyNetPnL = dayTrades.reduce((acc, t) => acc + t.calculated.netPnL, 0);
      const isGreenDay = dailyNetPnL > 0;

      // Collect mistakes across all trades of the day
      const dayMistakes = Array.from(
        new Set(dayTrades.flatMap((t) => t.psychology.mistakes || []))
      );

      const disciplineRating = isGreenDay && dayMistakes.length === 0 ? prng.nextInt(4, 5) : dayMistakes.length > 0 ? prng.nextInt(2, 3) : prng.nextInt(3, 4);

      const marketConditions = isGreenDay
        ? 'Clean directional trend day with expansion after the morning opening range.'
        : 'Choppy consolidation and false breakouts around the session midpoint.';

      const lessonsLearned = isGreenDay
        ? 'Sticking to predefined setups produced reliable results.'
        : 'Patience required during low volatility chop; avoid trading without confluence.';

      journalsToInsert.push({
        userId,
        date: dateStr,
        marketConditions,
        marketBias: prng.pick(biases),
        bestTradeId: bestTrade._id,
        worstTradeId: worstTrade && worstTrade._id.toString() !== bestTrade._id.toString() ? worstTrade._id : undefined,
        mistakes: dayMistakes,
        emotionalState: isGreenDay ? 'CALM' : dayMistakes.length > 0 ? 'FRUSTRATED' : 'DISCIPLINED',
        disciplineRating,
        lessonsLearned,
        nextDayPlan: 'Focus on high-probability ORB and FVG setups at open with strict risk limits.',
        notes: `Executed ${dayTrades.length} trades. Day result: ₹${dailyNetPnL.toFixed(2)}.`,
      });
    }

    if (journalsToInsert.length > 0) {
      await DailyJournal.insertMany(journalsToInsert);
    }

    return journalsToInsert.length;
  }
}
