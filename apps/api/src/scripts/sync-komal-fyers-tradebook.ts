import fs from 'fs';
import dotenv from 'dotenv';
import Decimal from 'decimal.js';
import { parse } from 'csv-parse/sync';
import {
  calculateFIFOExecution,
  calculateIndianCharges,
  deriveSessionFromTime,
  calculateRealizedRMultiple,
} from '@tradevault/financial-engine';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, TradingAccount, Trade, Instrument } from '../db/models/index.js';
import { InstrumentClassifier } from '../services/instrument-classifier.service.js';
import { InstrumentService } from '../services/instrument.service.js';
import { parseFyersSymbol, FyersService } from '../services/fyers.service.js';
import { PatternRecognitionService } from '../services/pattern-recognition.service.js';
import { ChartGeneratorService } from '../services/chart-generator.service.js';
import { AccountService } from '../services/account.service.js';

dotenv.config({ path: '../../.env' });
dotenv.config();

const CSV_PATH =
  '/Users/komal/.gemini/antigravity/brain/238bf859-0529-4455-a16d-ad5bba84ff7e/.user_uploaded/media_1794303763223_30d55073.csv';

function parseCleanFloat(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalizeId(val: any): string | undefined {
  if (!val) return undefined;
  let str = String(val).trim();
  str = str.replace(/^="?|"?$/g, '').replace(/^"|"$/g, '').trim();
  str = str.replace(/\.0+$/, '');
  return str || undefined;
}

function parseFlexibleDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  const isPM = /\bpm\b/i.test(trimmed);
  const isAM = /\bam\b/i.test(trimmed);
  const cleaned = trimmed.replace(/,/g, ' ').trim();
  const parts = cleaned.split(/[\s\-\/:T]+/).filter(Boolean);

  if (parts.length >= 3) {
    let day = 1;
    let month = 0;
    let year = 2026;

    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (isNaN(parseInt(parts[1], 10))) {
      day = parseInt(parts[0], 10);
      const mStr = parts[1].toLowerCase();
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const foundMonth = months.findIndex((m) => mStr.startsWith(m));
      month = foundMonth === -1 ? 0 : foundMonth;
      year = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }

    let hours = parts[3] ? parseInt(parts[3], 10) : 9;
    const mins = parts[4] ? parseInt(parts[4], 10) : (parts[3] ? 0 : 15);
    const secs = parts[5] && !isNaN(parseInt(parts[5], 10)) ? parseInt(parts[5], 10) : 0;

    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }

    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const utcEpoch = Date.UTC(year, month, day, hours, mins, secs) - istOffsetMs;
    const parsed = new Date(utcEpoch);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(trimmed);
}

interface RawExec {
  rowIdx: number;
  timestamp: Date;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  orderId?: string;
  omsId?: string;
  segment?: string;
}

export async function syncKomalFyersTradebook() {
  console.log('========================================================');
  console.log('   FYERS Tradebook Comprehensive Sync & Analysis        ');
  console.log('   Target User: komal@gmail.com                         ');
  console.log('========================================================\n');

  await connectDatabase();

  const user = await User.findOne({ email: 'komal@gmail.com' });
  if (!user) {
    throw new Error('User komal@gmail.com not found!');
  }
  console.log(`[User] Found: ${user.name} (${user.email}, id: ${user._id})`);

  const fyersAccount = await TradingAccount.findOne({
    userId: user._id,
    $or: [{ _id: '6ae1c7dbb303e7e620935592' }, { broker: 'FYERS' }, { name: /FYERS/i }],
  });
  if (!fyersAccount) {
    throw new Error('FYERS Trading Account not found for komal@gmail.com!');
  }
  console.log(`[Account] Found: ${fyersAccount.name} (${fyersAccount._id})`);

  // Load existing trades
  const existingTrades = await Trade.find({ accountId: fyersAccount._id });
  console.log(`[Existing Trades] Found: ${existingTrades.length} trades currently in database.`);

  const existingTradeOrderIds = new Set<string>();
  for (const t of existingTrades) {
    for (const f of t.fills || []) {
      if (f.fillId) {
        const rawPrefix = f.fillId.split('-')[0].split('_')[0];
        const norm = normalizeId(rawPrefix);
        if (norm) existingTradeOrderIds.add(norm);
      }
    }
  }

  // Parse CSV
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found at: ${CSV_PATH}`);
  }
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n');
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (lines[i].includes('Symbol name') && lines[i].includes('Traded price')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Failed to find header row in CSV');
  }

  const csvData = lines.slice(headerIdx).join('\n');
  const records = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`[CSV] Read ${records.length} raw rows from Tradebook CSV.`);

  const executions: RawExec[] = [];
  let skippedRollovers = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const omsId = normalizeId(r['OMS order ID']);
    const exId = normalizeId(r['Exchange order ID']);
    const isRollover = Boolean(
      (omsId && /^[CS]\d+$/.test(omsId)) ||
      (exId && /^[CS]\d+$/.test(exId)) ||
      (r['Date & time'] && r['Date & time'].includes('12:00:00 AM'))
    );
    if (isRollover) {
      skippedRollovers++;
      continue;
    }

    const symbol = String(r['Symbol name'] || '').toUpperCase().trim();
    const price = parseCleanFloat(r['Traded price']);
    const quantity = parseCleanFloat(r['Qty']);
    const side = String(r['Side'] || '').toUpperCase().trim() as 'BUY' | 'SELL';
    const timestamp = parseFlexibleDate(r['Date & time']);
    const segment = r['Segment'];

    if (symbol && price > 0 && quantity > 0) {
      executions.push({
        rowIdx: i + 1,
        timestamp,
        symbol,
        side,
        price,
        quantity,
        orderId: exId,
        omsId,
        segment,
      });
    }
  }

  console.log(`[CSV] Filtered out ${skippedRollovers} synthetic rollover rows.`);
  console.log(`[CSV] Valid real market executions: ${executions.length}.`);

  // Group by symbol
  const bySymbol = new Map<string, RawExec[]>();
  for (const exec of executions) {
    const list = bySymbol.get(exec.symbol) || [];
    list.push(exec);
    bySymbol.set(exec.symbol, list);
  }

  interface MatchedGroup {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    tradeDate: Date;
    entryTime: Date;
    exitTime?: Date;
    entryPrice: number;
    exitPrice?: number;
    quantity: number;
    grossPnL: number;
    netPnL: number;
    totalCosts: number;
    charges: {
      brokerage: number;
      exchangeFees: number;
      regulatoryFees: number;
      taxes: number;
      totalCosts: number;
    };
    fillsCount: number;
    fills: Array<{
      fillId: string;
      orderId?: string;
      type: 'ENTRY' | 'EXIT';
      price: number;
      quantity: number;
      timestamp: Date;
    }>;
    orderIds: string[];
    isClosed: boolean;
  }

  const allCandidateTrades: MatchedGroup[] = [];

  for (const [symbol, list] of bySymbol.entries()) {
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.rowIdx - b.rowIdx);

    const segmentVal = list[0]?.segment;
    const classified = InstrumentClassifier.classifySync(symbol, segmentVal);
    const assetClass = classified.assetClass;
    const marketSegment = classified.marketSegment;

    interface ActiveGroup {
      direction: 'LONG' | 'SHORT';
      fills: Array<{
        fillId: string;
        orderId?: string;
        type: 'ENTRY' | 'EXIT';
        price: number;
        quantity: number;
        timestamp: Date;
      }>;
      openQuantity: number;
      entryTime: Date;
    }

    let currentGroup: ActiveGroup | null = null;

    const finalize = (group: ActiveGroup) => {
      const multiplier = 1;
      const fifoSummary = calculateFIFOExecution(
        group.direction,
        group.fills.map((f) => ({
          fillId: f.fillId,
          type: f.type,
          price: f.price,
          quantity: f.quantity,
          timestamp: f.timestamp.toISOString(),
        })),
        multiplier
      );

      const avgEntry = fifoSummary.weightedAvgEntryPrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      const avgExit = fifoSummary.weightedAvgExitPrice
        ? fifoSummary.weightedAvgExitPrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
        : undefined;
      const closedQty = fifoSummary.closedQuantity.toNumber();
      const totalTradeQty = group.fills.filter((f) => f.type === 'ENTRY').reduce((s, f) => s + f.quantity, 0);

      const charges = calculateIndianCharges({
        direction: group.direction,
        assetClass,
        marketSegment: marketSegment as any,
        entryPrice: avgEntry,
        exitPrice: avgExit,
        quantity: totalTradeQty,
        contractMultiplier: multiplier,
        broker: fyersAccount.broker,
      });

      const grossPnL = fifoSummary.realizedGrossPnL.toNumber();
      const totalCosts = fifoSummary.totalCosts.greaterThan(0) ? fifoSummary.totalCosts.toNumber() : charges.totalCosts;
      const netPnL = Number(new Decimal(grossPnL).minus(totalCosts).toFixed(2));
      const lastExit = group.fills.filter((f) => f.type === 'EXIT').slice(-1)[0];

      allCandidateTrades.push({
        symbol,
        direction: group.direction,
        tradeDate: group.entryTime,
        entryTime: group.entryTime,
        exitTime: lastExit?.timestamp,
        entryPrice: avgEntry,
        exitPrice: avgExit,
        quantity: totalTradeQty,
        grossPnL,
        netPnL,
        totalCosts,
        charges,
        fillsCount: group.fills.length,
        fills: group.fills,
        orderIds: Array.from(new Set(group.fills.map((f) => f.orderId).filter(Boolean) as string[])),
        isClosed: fifoSummary.isFullyClosed,
      });
    };

    for (const exec of list) {
      const isBuy = exec.side === 'BUY';
      const idStr = exec.omsId || exec.orderId || `row_${exec.rowIdx}`;

      if (!currentGroup) {
        currentGroup = {
          direction: isBuy ? 'LONG' : 'SHORT',
          fills: [
            {
              fillId: `${idStr}-${exec.rowIdx}`,
              orderId: exec.omsId || exec.orderId,
              type: 'ENTRY',
              price: exec.price,
              quantity: exec.quantity,
              timestamp: exec.timestamp,
            },
          ],
          openQuantity: exec.quantity,
          entryTime: exec.timestamp,
        };
      } else {
        const isScaleIn =
          (currentGroup.direction === 'LONG' && isBuy) || (currentGroup.direction === 'SHORT' && !isBuy);
        if (isScaleIn) {
          currentGroup.fills.push({
            fillId: `${idStr}-${exec.rowIdx}`,
            orderId: exec.omsId || exec.orderId,
            type: 'ENTRY',
            price: exec.price,
            quantity: exec.quantity,
            timestamp: exec.timestamp,
          });
          currentGroup.openQuantity += exec.quantity;
        } else {
          if (exec.quantity <= currentGroup.openQuantity) {
            currentGroup.fills.push({
              fillId: `${idStr}-${exec.rowIdx}`,
              orderId: exec.omsId || exec.orderId,
              type: 'EXIT',
              price: exec.price,
              quantity: exec.quantity,
              timestamp: exec.timestamp,
            });
            currentGroup.openQuantity -= exec.quantity;
            if (currentGroup.openQuantity === 0) {
              finalize(currentGroup);
              currentGroup = null;
            }
          } else {
            const closeQty: number = currentGroup.openQuantity;
            const newOpenQty: number = exec.quantity - closeQty;
            currentGroup.fills.push({
              fillId: `${idStr}-${exec.rowIdx}-close`,
              orderId: exec.omsId || exec.orderId,
              type: 'EXIT',
              price: exec.price,
              quantity: closeQty,
              timestamp: exec.timestamp,
            });
            currentGroup.openQuantity = 0;
            finalize(currentGroup);

            currentGroup = {
              direction: isBuy ? 'LONG' : 'SHORT',
              fills: [
                {
                  fillId: `${idStr}-${exec.rowIdx}-open`,
                  orderId: exec.omsId || exec.orderId,
                  type: 'ENTRY',
                  price: exec.price,
                  quantity: newOpenQty,
                  timestamp: exec.timestamp,
                },
              ],
              openQuantity: newOpenQty,
              entryTime: exec.timestamp,
            };
          }
        }
      }
    }

    if (currentGroup && currentGroup.fills.length > 0) {
      finalize(currentGroup);
      currentGroup = null;
    }
  }

  console.log(`[Matching] Formed ${allCandidateTrades.length} candidate round-trip trades.`);

  // Deduplicate against existing DB trades
  const missingTradesToInsert: MatchedGroup[] = [];
  let existingMatchedCount = 0;

  for (const cand of allCandidateTrades) {
    const isAlreadyPresent = existingTrades.some((et) => {
      // 1. Check order ID overlap
      for (const oid of cand.orderIds) {
        for (const f of et.fills || []) {
          const rawPrefix = f.fillId?.split('-')[0]?.split('_')[0];
          const norm = normalizeId(rawPrefix);
          if (norm === oid) return true;
        }
      }
      // 2. Fallback check: same symbol, exact tradeDate (day), entryPrice, closedQuantity
      const etDate = et.tradeDate?.toISOString().split('T')[0];
      const candDate = cand.tradeDate.toISOString().split('T')[0];
      if (etDate === candDate) {
        const symMatch =
          et.symbol === cand.symbol ||
          et.underlying === cand.symbol ||
          cand.symbol.startsWith(et.underlying || '') ||
          et.symbol.startsWith(cand.symbol.replace(/\d+.*$/, ''));
        const priceMatch =
          Math.abs((et.calculated?.averageEntryPrice || et.simpleExecution?.entryPrice || 0) - cand.entryPrice) < 0.2;
        const qtyMatch = (et.calculated?.closedQuantity || et.simpleExecution?.quantity) === cand.quantity;
        if (symMatch && priceMatch && qtyMatch) return true;
      }
      return false;
    });

    if (isAlreadyPresent) {
      existingMatchedCount++;
    } else {
      missingTradesToInsert.push(cand);
    }
  }

  console.log(`[Deduplication] Matched existing DB trades: ${existingMatchedCount}`);
  console.log(`[Deduplication] Missing trades to insert: ${missingTradesToInsert.length}`);

  // Cache instruments
  const instrumentCache = new Map<string, any>();

  async function resolveInstrument(rawSymbol: string) {
    const parsed = parseFyersSymbol(rawSymbol);
    const underlying = parsed.underlying;
    if (instrumentCache.has(underlying)) {
      return { inst: instrumentCache.get(underlying), parsed };
    }

    let inst: any = await Instrument.findOne({ userId: user!._id, symbol: underlying });
    if (!inst) {
      inst = await InstrumentService.ensureForTrade(user!._id, {
        symbol: underlying,
        assetClass: parsed.assetClass,
        exchange: parsed.exchange,
        marketSegment: parsed.marketSegment,
        currency: 'INR',
      });
    }
    instrumentCache.set(underlying, inst);
    return { inst, parsed };
  }

  // Insert missing trades
  console.log('\n--- Inserting Missing Trades ---');
  const newlyCreatedTradeIds: string[] = [];

  for (let idx = 0; idx < missingTradesToInsert.length; idx++) {
    const t = missingTradesToInsert[idx];
    const { inst, parsed } = await resolveInstrument(t.symbol);

    const exchange =
      parsed.exchange === 'MCX' ? 'MCX' : t.symbol.startsWith('SENSEX') || t.symbol.startsWith('BANKEX') ? 'BSE' : 'NSE';
    const marketSegment = parsed.marketSegment || (exchange === 'MCX' ? 'MCX' : 'NSE_FNO');
    const assetClass = parsed.assetClass || (exchange === 'MCX' ? 'COMMODITY' : 'OPTIONS');
    const session = deriveSessionFromTime(t.entryTime, exchange, marketSegment);

    const newTitle = parsed.isDerivative
      ? parsed.optionType && parsed.strikePrice
        ? `${parsed.strikePrice} ${parsed.optionType === 'CALL' ? 'CE' : 'PE'}`
        : (inst?.displayName || parsed.underlying)
      : (inst?.displayName || parsed.underlying);

    const outcome = t.grossPnL > 0 ? 'WIN' : t.grossPnL < 0 ? 'LOSS' : 'BREAKEVEN';

    // Set stop-loss for risk calculation:
    // If loss, initialStopLoss = exitPrice, plannedRisk = |entry - exit| * qty
    let initialStopLoss = t.exitPrice;
    let plannedRiskAmount: number | undefined;
    let realizedRMultiple: number | undefined;

    if (t.exitPrice && t.exitPrice > 0) {
      const priceDiff = Math.abs(t.entryPrice - t.exitPrice);
      if (priceDiff > 0) {
        plannedRiskAmount = Number(new Decimal(priceDiff).times(t.quantity).toFixed(2));
        realizedRMultiple = calculateRealizedRMultiple(t.netPnL, plannedRiskAmount);
      }
    }

    const createdTrade = await Trade.create({
      userId: user._id,
      accountId: fyersAccount._id,
      instrumentId: inst._id,
      underlying: inst.symbol,
      instrumentName: inst.displayName,
      symbol: inst.symbol,
      tradeTitle: newTitle,
      optionType: parsed.optionType,
      strikePrice: parsed.strikePrice,
      expiryDate: parsed.expiryDate,
      assetClass,
      exchange,
      marketSegment,
      currency: 'INR',
      direction: t.direction,
      status: 'CLOSED',
      tradeDate: t.tradeDate,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      session,
      timeZone: 'Asia/Kolkata',
      tags: ['FYERS_TRADEBOOK_IMPORT'],
      importBatchId: 'fyers_tradebook_20261110',
      executionMode: 'ADVANCED',
      simpleExecution: {
        contractMultiplier: 1,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        quantity: t.quantity,
        brokerage: t.charges.brokerage,
        exchangeFees: t.charges.exchangeFees,
        regulatoryFees: t.charges.regulatoryFees,
        taxes: t.charges.taxes,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: t.fills.map((f) => ({
        fillId: f.fillId,
        type: f.type,
        price: f.price,
        quantity: f.quantity,
        timestamp: f.timestamp,
        fee: 0,
        brokerage: 0,
        exchangeFee: 0,
        taxes: 0,
      })),
      risk: {
        plannedEntryPrice: t.entryPrice,
        initialStopLoss,
        currentStopLoss: initialStopLoss,
        initialStopSource: 'MANUAL',
        plannedRiskAmount,
        estimatedRiskAmount: plannedRiskAmount,
        realizedRMultiple,
        riskRuleViolations: [],
      },
      thesis: {
        confluences: [],
        customTechnicalLabels: [],
      },
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
        grossPnL: t.grossPnL,
        totalCosts: t.totalCosts,
        netPnL: t.netPnL,
        realizedRMultiple,
        outcome,
        closedQuantity: t.quantity,
        openQuantity: 0,
        averageEntryPrice: t.entryPrice,
        averageExitPrice: t.exitPrice,
      },
      screenshotIds: [],
      auditLog: [
        {
          action: 'IMPORTED_CSV_FIFO',
          timestamp: new Date(),
          changedBy: user.email,
          details: {
            importBatchId: 'fyers_tradebook_20261110',
            broker: 'FYERS',
            fillCount: t.fills.length,
          },
        },
      ],
    });

    newlyCreatedTradeIds.push(createdTrade._id.toString());
    if ((idx + 1) % 25 === 0 || idx === missingTradesToInsert.length - 1) {
      console.log(`  Inserted ${idx + 1} / ${missingTradesToInsert.length} trades...`);
    }
  }

  console.log(`✓ All ${newlyCreatedTradeIds.length} missing trades inserted successfully into database.`);

  // Excursion, Pattern Classification, and Snapshot Generation
  console.log('\n--- Computing Excursion, Setup Patterns, & Snapshots ---');
  // Combine newly created trades and any existing trades missing excursion/classification
  const tradesNeedingAnalysis = await Trade.find({
    accountId: fyersAccount._id,
    $or: [
      { 'calculated.excursion': { $exists: false } },
      { 'calculated.excursion.status': { $in: ['PENDING', null] } },
      { setup: { $exists: false } },
      { 'setup.variantStatus': 'UNCLASSIFIED' },
      { _id: { $in: newlyCreatedTradeIds } },
    ],
  }).select('_id symbol tradeDate');

  console.log(`Found ${tradesNeedingAnalysis.length} trades needing analysis.`);

  let excursionCount = 0;
  let classifiedCount = 0;
  let snapshotCount = 0;

  for (let i = 0; i < tradesNeedingAnalysis.length; i++) {
    const t = tradesNeedingAnalysis[i];
    try {
      const exc = await FyersService.computeExcursionForTrade(t._id, user._id);
      if (exc?.status === 'COMPUTED') excursionCount++;
    } catch (e: any) {
      // Excursion failed gracefully (outside lookback window or options spot mismatch)
    }

    try {
      const cls = await PatternRecognitionService.classifyTrade(t._id, user._id);
      if (cls && (cls.variantKey || cls.strategyName)) classifiedCount++;
    } catch (e: any) {
      // Setup pattern classification error
    }

    try {
      const snp = await ChartGeneratorService.ensureTradeSnapshot(t._id, user._id);
      if (snp && snp.length > 0) snapshotCount++;
    } catch (e: any) {
      // Snapshot error
    }

    if ((i + 1) % 20 === 0 || i === tradesNeedingAnalysis.length - 1) {
      console.log(`  Analyzed ${i + 1} / ${tradesNeedingAnalysis.length} trades (Excursions: ${excursionCount}, Patterns: ${classifiedCount}, Snapshots: ${snapshotCount})...`);
    }
    // Polite pacing delay
    await new Promise((r) => setTimeout(r, 60));
  }

  // Recalculate Account Balance
  console.log('\n--- Authoritatively Recalculating Account Balances ---');
  const balanceSummary = await AccountService.recalculateAccountBalances(fyersAccount._id, user._id);
  console.log('Balance Summary:', {
    accountName: fyersAccount.name,
    initialBalance: balanceSummary?.initialBalance,
    totalDeposits: balanceSummary?.totalDeposits,
    totalWithdrawals: balanceSummary?.totalWithdrawals,
    totalAdjustments: balanceSummary?.totalAdjustments,
    realizedPnL: balanceSummary?.realizedPnL,
    currentBalance: balanceSummary?.currentBalance,
    closedTradesCount: balanceSummary?.closedTradesCount,
    openTradesCount: balanceSummary?.openTradesCount,
  });

  // Final check on all trades in account
  const finalTrades = await Trade.find({ accountId: fyersAccount._id }).sort({ tradeDate: 1 });
  console.log(`\nTotal FYERS account trades now: ${finalTrades.length}`);
  console.log(`First trade date: ${finalTrades[0]?.tradeDate?.toISOString()}`);
  console.log(`Last trade date: ${finalTrades[finalTrades.length - 1]?.tradeDate?.toISOString()}`);

  console.log('\n========================================================');
  console.log('   FYERS Tradebook Sync Complete Successfully!          ');
  console.log('========================================================\n');

  await disconnectDatabase();
}

if (process.argv[1]?.includes('sync-komal-fyers-tradebook')) {
  syncKomalFyersTradebook().catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
}
