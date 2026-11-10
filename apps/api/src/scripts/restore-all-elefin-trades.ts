import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Trade, TradingAccount, User } from '../db/models/index.js';
import { InstrumentService } from '../services/instrument.service.js';
import { AccountService } from '../services/account.service.js';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';

dotenv.config({ path: '../../.env' });
dotenv.config();

interface ElefinTradeInput {
  ticket: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  volume: number;
  openPrice: number;
  closePrice: number;
  stopLoss: number;
  swap: number;
  profit: number;
  openTime: string;
  closeTime: string;
}

const elefinTradesToEnsure: ElefinTradeInput[] = [
  {
    ticket: '14270776',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.03,
    openPrice: 4106.76,
    closePrice: 4108.36,
    stopLoss: 4108.36,
    swap: 0.00,
    profit: 4.80,
    openTime: '2026-11-09T16:55:00.000Z',
    closeTime: '2026-11-09T16:56:00.000Z',
  },
  {
    ticket: '14275515',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.01,
    openPrice: 4105.94,
    closePrice: 4103.72,
    stopLoss: 4103.72,
    swap: 0.00,
    profit: -2.22,
    openTime: '2026-11-09T17:22:00.000Z',
    closeTime: '2026-11-09T17:32:00.000Z',
  },
  {
    ticket: '14276701',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.03,
    openPrice: 4105.30,
    closePrice: 4103.46,
    stopLoss: 4103.46,
    swap: 0.00,
    profit: -5.52,
    openTime: '2026-11-09T17:34:00.000Z',
    closeTime: '2026-11-09T17:40:00.000Z',
  },
  {
    ticket: '14330300',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.01,
    openPrice: 4118.18,
    closePrice: 4116.12,
    stopLoss: 4116.40,
    swap: 0.00,
    profit: -2.06,
    openTime: '2026-11-10T05:21:42.000Z',
    closeTime: '2026-11-10T05:35:23.000Z',
  },
];

export async function restoreAllElefinTrades() {
  await connectDatabase();
  console.log('[ElefinRestore] Connected to Atlas MongoDB');

  const user = await User.findOne({ email: 'komal@gmail.com' });
  if (!user) throw new Error('User komal@gmail.com not found!');

  const account = await TradingAccount.findOne({
    userId: user._id,
    $or: [{ _id: new mongoose.Types.ObjectId('6af1fa0735d0f0f584d918bf') }, { broker: /elefin/i }, { name: /elefin/i }],
  });
  if (!account) throw new Error('Elefin account not found!');

  const userId = user._id;
  const accountId = account._id;
  const instrumentId = new mongoose.Types.ObjectId('6ae9beae64455f97c5feacc8');

  // Set initial balance so that with -1.58 realized PnL, balance = 28.36 USD
  account.initialBalance = mongoose.Types.Decimal128.fromString('29.94') as any;
  await account.save();
  console.log('[ElefinRestore] Updated Elefin account initial balance to 29.94 USD');

  // 1. Update any existing trade where SL is missing
  console.log('\n--- 1. Ensuring Stop Loss on Existing Trades ---');
  const existingTrades = await Trade.find({ userId, accountId });
  for (const trade of existingTrades) {
    const hasSl = trade.risk?.initialStopLoss !== undefined && trade.risk?.initialStopLoss !== null && trade.risk.initialStopLoss > 0;
    if (!hasSl) {
      const exitPrice = trade.simpleExecution?.exitPrice || trade.fills?.find(f => f.type === 'EXIT')?.price;
      if (exitPrice && exitPrice > 0) {
        console.log(`Setting missing SL on trade #${trade._id} (${trade.tradeTitle}) to exit price: ${exitPrice}`);
        const entryPrice = trade.simpleExecution?.entryPrice || exitPrice;
        const qty = trade.simpleExecution?.quantity || 0.01;
        const plannedRisk = Number((Math.abs(entryPrice - exitPrice) * qty * 100).toFixed(2));

        trade.risk = {
          ...((trade.risk as any)?.toObject ? (trade.risk as any).toObject() : trade.risk || {}),
          plannedEntryPrice: entryPrice,
          initialStopLoss: exitPrice,
          currentStopLoss: exitPrice,
          initialStopSource: 'MANUAL',
          plannedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
          estimatedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
        };

        const recalculated = InstrumentService.computeTradeCalculations(trade.toObject());
        if (trade.calculated) {
          trade.calculated.realizedRMultiple = recalculated.realizedRMultiple;
          trade.calculated.grossPnL = recalculated.grossPnL;
          trade.calculated.netPnL = recalculated.netPnL;
          trade.calculated.totalCosts = recalculated.totalCosts;
          trade.calculated.outcome = recalculated.outcome;
        } else {
          trade.calculated = recalculated;
        }

        trade.auditLog.push({
          action: 'SL_MODIFIED',
          timestamp: new Date(),
          changedBy: 'komal@gmail.com',
          details: {
            reason: 'Set SL to Exit Price (SL was undefined)',
            initialStopLoss: exitPrice,
          },
        } as any);

        await trade.save();
        console.log(`✓ Trade #${trade._id} updated with SL: ${exitPrice}`);
      }
    }
  }

  // 2. Insert missing trades
  console.log('\n--- 2. Inserting Missing Trades ---');
  for (const m of elefinTradesToEnsure) {
    const existing = await Trade.findOne({
      userId,
      accountId,
      tags: `MT5_TICKET_${m.ticket}`,
    });

    if (existing) {
      console.log(`Trade #${m.ticket} already exists in DB. Ensuring SL...`);
      if (!existing.risk?.initialStopLoss || existing.risk.initialStopLoss === 0) {
        existing.risk = {
          ...((existing.risk as any)?.toObject ? (existing.risk as any).toObject() : existing.risk || {}),
          initialStopLoss: m.stopLoss,
          currentStopLoss: m.stopLoss,
        };
        const recalculated = InstrumentService.computeTradeCalculations(existing.toObject());
        existing.calculated = recalculated;
        await existing.save();
      }
      continue;
    }

    const dist = Math.abs(m.openPrice - m.stopLoss);
    const plannedRisk = Number((dist * m.volume * 100).toFixed(2));
    const openDate = new Date(m.openTime);
    const closeDate = new Date(m.closeTime);

    const tradeDoc: any = {
      userId,
      accountId,
      instrumentId,
      instrumentName: 'Gold / US Dollar Spot (CFD/Forex)',
      strategyName: 'Discretionary',
      symbol: m.symbol,
      underlying: m.symbol,
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: m.direction,
      status: 'CLOSED',
      tags: ['ELEFIN', 'MT5', `MT5_TICKET_${m.ticket}`],
      tradeDate: openDate,
      timeZone: 'Asia/Kolkata',
      entryTime: openDate,
      exitTime: closeDate,
      tradeTitle: `${m.symbol} ${m.direction} (Elefin #${m.ticket})`,
      importBatchId: `MT5_${m.ticket}`,
      executionMode: 'ADVANCED',
      simpleExecution: {
        entryPrice: m.openPrice,
        exitPrice: m.closePrice,
        quantity: m.volume,
        contractMultiplier: 100,
        brokerage: 0,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [
        {
          fillId: `mt5_${m.ticket}_entry`,
          type: 'ENTRY',
          price: m.openPrice,
          quantity: m.volume,
          timestamp: openDate,
          fee: 0,
          brokerage: 0,
          exchangeFee: 0,
          taxes: 0,
          notes: '',
        },
        {
          fillId: `mt5_${m.ticket}_exit`,
          type: 'EXIT',
          price: m.closePrice,
          quantity: m.volume,
          timestamp: closeDate,
          fee: 0,
          brokerage: 0,
          exchangeFee: 0,
          taxes: 0,
          notes: '',
        },
      ],
      risk: {
        plannedEntryPrice: m.openPrice,
        initialStopLoss: m.stopLoss,
        currentStopLoss: m.stopLoss,
        initialStopSource: 'MANUAL',
        plannedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
        estimatedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
        riskRuleViolations: [],
        slReviewCandidates: [],
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
      setup: {
        variantStatus: 'UNCLASSIFIED',
        alsoMatches: [],
      },
      screenshotIds: [],
      stopLossMoveEvents: [],
      auditLog: [
        {
          action: 'CREATED',
          timestamp: new Date(),
          changedBy: 'komal@gmail.com',
          details: {
            source: 'ELEFIN_PORTAL_IMPORT',
            ticket: m.ticket,
            profit: m.profit,
            sl: m.stopLoss,
          },
        },
      ],
    };

    const calculated = InstrumentService.computeTradeCalculations(tradeDoc);
    tradeDoc.calculated = calculated;

    const createdTrade = await Trade.create(tradeDoc);
    console.log(`✓ Created trade #${m.ticket}: ${createdTrade.tradeTitle} | Net PnL: $${createdTrade.calculated?.netPnL} | Realized R: ${createdTrade.calculated?.realizedRMultiple}R | SL: ${createdTrade.risk?.initialStopLoss}`);
  }

  // 3. Recalculate account balance
  console.log('\n--- 3. Recalculating Authoritative Account Balances ---');
  const summary = await AccountService.recalculateAccountBalances(accountId.toString(), userId.toString());
  console.log('Balance Summary:', summary);

  const finalAccount = await TradingAccount.findById(accountId);
  console.log(`\n✅ Elefin Account Reconciled: Balance = $${finalAccount?.currentBalance} USD | Realized PnL = $${finalAccount?.realizedPnL} USD`);

  const allTrades = await Trade.find({ accountId }).sort({ entryTime: 1 });
  console.log(`Total Elefin Trades: ${allTrades.length}`);
  allTrades.forEach((t, i) => {
    console.log(`${i + 1}. ${t.tradeTitle} | Qty: ${t.simpleExecution?.quantity} | Entry: ${t.simpleExecution?.entryPrice} | Exit: ${t.simpleExecution?.exitPrice} | SL: ${t.risk?.initialStopLoss} | PnL: $${t.calculated?.netPnL} | R: ${t.calculated?.realizedRMultiple}R`);
  });

  await disconnectDatabase();
}

if (process.argv[1]?.includes('restore-all-elefin-trades')) {
  restoreAllElefinTrades().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
