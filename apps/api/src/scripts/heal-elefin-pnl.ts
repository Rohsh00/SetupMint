import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import mongoose from 'mongoose';
import { Trade, TradingAccount } from '../db/models/index.js';
import { InstrumentService } from '../services/instrument.service.js';
import { AccountService } from '../services/account.service.js';

const ELEFIN_ACCOUNT_ID = new mongoose.Types.ObjectId('6af1fa0735d0f0f584d918bf');
const PARTIAL_EXIT_TRADE_ID = new mongoose.Types.ObjectId('6af55f10db6a6e540a71fbe1'); // MT5 #14707983

async function healElefinPnL() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const account = await TradingAccount.findById(ELEFIN_ACCOUNT_ID);
  if (!account) {
    throw new Error('Elefin account 6af1fa0735d0f0f584d918bf not found');
  }

  const trades = await Trade.find({ accountId: ELEFIN_ACCOUNT_ID }).sort({ tradeDate: 1 });
  console.log(`Loaded ${trades.length} Elefin trade(s)`);

  for (const trade of trades) {
    // 1. Heal Trade #14707983 partial exit duplicate placeholder -> true 2-leg exit (0.02 @ 3969.00 + 0.02 @ 3960.98 = $38.28)
    if (trade._id.equals(PARTIAL_EXIT_TRADE_ID)) {
      trade.fills = [
        {
          fillId: 'mt5_14707983_entry',
          type: 'ENTRY',
          price: 3974.56,
          quantity: 0.04,
          timestamp: new Date('2026-11-12T06:39:12.000Z'),
          fee: 0,
          brokerage: 0,
          exchangeFee: 0,
          taxes: 0,
        },
        {
          fillId: 'mt5_deal_21139352',
          type: 'EXIT',
          price: 3969.0,
          quantity: 0.02,
          timestamp: new Date('2026-11-12T06:47:53.000Z'),
          fee: 0,
          brokerage: 0,
          exchangeFee: 0,
          taxes: 0,
        },
        {
          fillId: 'mt5_14707983_exit_final',
          type: 'EXIT',
          price: 3960.98,
          quantity: 0.02,
          timestamp: new Date('2026-11-12T07:14:14.000Z'),
          fee: 0,
          brokerage: 0,
          exchangeFee: 0,
          taxes: 0,
        },
      ] as any;
      trade.executionMode = 'ADVANCED';
      trade.markModified('fills');
    }

    // 2. Elefin Standard account charges $0.00 commission & $0.00 swap
    if (trade.simpleExecution) {
      trade.simpleExecution.brokerage = 0;
      trade.simpleExecution.exchangeFees = 0;
      trade.simpleExecution.regulatoryFees = 0;
      trade.simpleExecution.taxes = 0;
      trade.simpleExecution.otherFees = 0;
    }
    if (Array.isArray(trade.fills)) {
      for (const f of trade.fills as any[]) {
        f.fee = 0;
        f.brokerage = 0;
        f.exchangeFee = 0;
        f.taxes = 0;
      }
      trade.markModified('fills');
    }

    const prevExcursionRaw = trade.calculated?.excursion as any;
    const prevExcursion =
      prevExcursionRaw && typeof prevExcursionRaw.toObject === 'function'
        ? prevExcursionRaw.toObject()
        : prevExcursionRaw && typeof prevExcursionRaw === 'object'
        ? { ...prevExcursionRaw }
        : undefined;

    const recalced = InstrumentService.computeTradeCalculations({
      ...trade.toObject(),
      broker: account.broker,
      _accountProfile: account.profile,
      feeModelKey: account.profile?.feeModelKey,
      positionModel: account.profile?.positionModel || 'HEDGING',
      _authoritativeFees: true,
    });

    if (trade.simpleExecution && recalced.averageExitPrice) {
      trade.simpleExecution.exitPrice = recalced.averageExitPrice;
    }

    trade.calculated = {
      ...recalced,
      ...(prevExcursion ? { excursion: prevExcursion } : {}),
    };
    trade.markModified('simpleExecution');
    trade.markModified('calculated');
    await trade.save();
  }

  await AccountService.recalculateAccountBalances(ELEFIN_ACCOUNT_ID, account.userId);
  const refreshedAccount = await TradingAccount.findById(ELEFIN_ACCOUNT_ID).lean();
  const refreshedClosed = await Trade.find({ accountId: ELEFIN_ACCOUNT_ID, status: 'CLOSED' }).lean();

  let wins = 0;
  let losses = 0;
  let sumNet = 0;
  let best = -Infinity;
  let worst = Infinity;
  for (const t of refreshedClosed) {
    const n = t.calculated?.netPnL ?? 0;
    sumNet += n;
    if (n > 0) wins++;
    else if (n < 0) losses++;
    if (n > best) best = n;
    if (n < worst) worst = n;
  }

  console.log({
    closedCount: refreshedClosed.length,
    wins,
    losses,
    sumNet: Number(sumNet.toFixed(2)),
    best,
    worst,
    realizedPnL: refreshedAccount?.realizedPnL?.toString(),
    currentBalance: refreshedAccount?.currentBalance?.toString(),
  });

  await mongoose.disconnect();
}

healElefinPnL().catch((err) => {
  console.error(err);
  process.exit(1);
});

