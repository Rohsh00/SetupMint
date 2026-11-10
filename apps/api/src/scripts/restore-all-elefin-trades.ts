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
  currentStopLoss?: number;
  swap: number;
  profit: number;
  openTime: string;
  closeTime: string;
}

// Exactly the 10 real trades from Elefin Portal (login #1134947817)
const allElefinTrades: ElefinTradeInput[] = [
  {
    ticket: '14287415',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.01,
    openPrice: 4104.15,
    closePrice: 4101.87,
    stopLoss: 4102.00,
    swap: 0.00,
    profit: -2.28,
    openTime: '2026-11-09T19:01:00.000Z',
    closeTime: '2026-11-09T19:10:00.000Z',
  },
  {
    ticket: '14287659',
    symbol: 'XAUUSD',
    direction: 'SHORT',
    volume: 0.01,
    openPrice: 4101.93,
    closePrice: 4102.33,
    stopLoss: 4102.33,
    swap: 0.00,
    profit: -0.40,
    openTime: '2026-11-09T19:10:00.000Z',
    closeTime: '2026-11-09T19:10:00.000Z',
  },
  {
    ticket: '14295856',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.01,
    openPrice: 4139.82,
    closePrice: 4145.92,
    stopLoss: 4135.50,
    swap: 0.00,
    profit: 6.10,
    openTime: '2026-11-09T20:14:00.000Z',
    closeTime: '2026-11-09T20:23:00.000Z',
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
  {
    ticket: '14344819',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.02,
    openPrice: 4122.15,
    closePrice: 4118.88,
    stopLoss: 4119.00,
    swap: 0.00,
    profit: -6.54,
    openTime: '2026-11-10T06:52:53.000Z',
    closeTime: '2026-11-10T06:56:46.000Z',
  },
  {
    ticket: '14345378',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.02,
    openPrice: 4121.04,
    closePrice: 4120.79,
    stopLoss: 4118.50,
    currentStopLoss: 4121.04,
    swap: 0.00,
    profit: -0.50,
    openTime: '2026-11-10T06:57:28.000Z',
    closeTime: '2026-11-10T07:08:35.000Z',
  },
  {
    ticket: '14349840',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.02,
    openPrice: 4118.97,
    closePrice: 4116.25,
    stopLoss: 4116.40,
    swap: 0.00,
    profit: -5.44,
    openTime: '2026-11-10T07:27:17.000Z',
    closeTime: '2026-11-10T07:32:19.000Z',
  },
  {
    ticket: '14359554',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.01,
    openPrice: 4117.18,
    closePrice: 4114.58,
    stopLoss: 4114.58,
    swap: 0.00,
    profit: -2.60,
    openTime: '2026-11-10T08:30:29.000Z',
    closeTime: '2026-11-10T08:54:38.000Z',
  },
  {
    ticket: '14366483',
    symbol: 'XAUUSD',
    direction: 'SHORT',
    volume: 0.01,
    openPrice: 4101.74,
    closePrice: 4095.04,
    stopLoss: 4108.44,
    swap: 0.00,
    profit: 6.70,
    openTime: '2026-11-10T09:07:37.000Z',
    closeTime: '2026-11-10T09:10:10.000Z',
  },
  {
    ticket: '14375808',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 0.01,
    openPrice: 4084.83,
    closePrice: 4086.90,
    stopLoss: 4081.00,
    swap: 0.00,
    profit: 2.07,
    openTime: '2026-11-10T09:44:38.000Z',
    closeTime: '2026-11-10T09:58:38.000Z',
  },
];

// Foreign tickets accidentally imported previously from account #12345917373
const foreignTicketsToRemove = ['14270776', '14275515', '14276701'];

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

  // Set account details and initial balance to exactly $27.00 USD
  account.accountNumber = '1134947817';
  account.initialBalance = mongoose.Types.Decimal128.fromString('27.00') as any;
  await account.save();
  console.log('[ElefinRestore] Updated Elefin account (#1134947817) initial balance to $27.00 USD');

  // 1. Remove foreign tickets accidentally imported from Rohit's account
  console.log('\n--- 1. Removing extraneous foreign tickets not in Elefin history ---');
  for (const fTicket of foreignTicketsToRemove) {
    const deleted = await Trade.deleteOne({
      userId,
      accountId,
      tags: `MT5_TICKET_${fTicket}`,
    });
    if (deleted.deletedCount > 0) {
      console.log(`✓ Removed foreign trade #${fTicket} from Elefin account`);
    }
  }

  // 2. Ensure all 10 real trades are present with correct SL and metrics
  console.log('\n--- 2. Ensuring All 10 Real Elefin Trades ---');
  for (const m of allElefinTrades) {
    const openDate = new Date(m.openTime);
    const closeDate = new Date(m.closeTime);
    const dist = Math.abs(m.openPrice - m.stopLoss);
    const plannedRisk = Number((dist * m.volume * 100).toFixed(2));

    const existing = await Trade.findOne({
      userId,
      accountId,
      tags: `MT5_TICKET_${m.ticket}`,
    });

    if (existing) {
      console.log(`Trade #${m.ticket} already exists. Verifying/updating details...`);
      existing.direction = m.direction;
      existing.entryTime = openDate;
      existing.exitTime = closeDate;
      existing.tradeDate = openDate;
      if (!existing.risk?.initialStopLoss || existing.risk.initialStopLoss === 0) {
        existing.risk = {
          ...((existing.risk as any)?.toObject ? (existing.risk as any).toObject() : existing.risk || {}),
          plannedEntryPrice: m.openPrice,
          initialStopLoss: m.stopLoss,
          currentStopLoss: m.currentStopLoss || m.stopLoss,
          initialStopSource: 'MANUAL',
          plannedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
          estimatedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
        };
      }
      if (existing.simpleExecution) {
        existing.simpleExecution.entryPrice = m.openPrice;
        existing.simpleExecution.exitPrice = m.closePrice;
        existing.simpleExecution.quantity = m.volume;
        existing.simpleExecution.contractMultiplier = 100;
        existing.simpleExecution.brokerage = 0;
      }
      const recalculated = InstrumentService.computeTradeCalculations(existing.toObject());
      existing.calculated = recalculated;
      await existing.save();
      console.log(`✓ Trade #${m.ticket} verified: Net PnL = $${existing.calculated?.netPnL} | Realized R = ${existing.calculated?.realizedRMultiple}R`);
      continue;
    }

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
        currentStopLoss: m.currentStopLoss || m.stopLoss,
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

  // 3. Recalculate authoritative account balance
  console.log('\n--- 3. Recalculating Authoritative Account Balances ---');
  const summary = await AccountService.recalculateAccountBalances(accountId.toString(), userId.toString());
  console.log('Balance Summary:', summary);

  const finalAccount = await TradingAccount.findById(accountId);
  console.log(`\n✅ Elefin Account Reconciled: Balance = $${finalAccount?.currentBalance} USD | Realized PnL = $${finalAccount?.realizedPnL} USD`);

  const allTradesInDb = await Trade.find({ accountId }).sort({ entryTime: 1 });
  console.log(`Total Elefin Trades: ${allTradesInDb.length}`);
  allTradesInDb.forEach((t, i) => {
    console.log(`${i + 1}. #${t.tags?.find(tag => tag.startsWith('MT5_TICKET_'))?.replace('MT5_TICKET_', '')} | ${t.tradeTitle} | Qty: ${t.simpleExecution?.quantity} | Entry: ${t.simpleExecution?.entryPrice} | Exit: ${t.simpleExecution?.exitPrice} | SL: ${t.risk?.initialStopLoss} | PnL: $${t.calculated?.netPnL} | R: ${t.calculated?.realizedRMultiple}R`);
  });

  await disconnectDatabase();
}

if (process.argv[1]?.includes('restore-all-elefin-trades')) {
  restoreAllElefinTrades().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
