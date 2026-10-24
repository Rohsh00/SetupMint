import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, Instrument, Trade, TradingAccount, AccountTransaction } from '../db/models/index.js';
import { calculateIndianCharges } from '@tradevault/financial-engine';
import { AccountService } from '../services/account.service.js';
import { FyersService } from '../services/fyers.service.js';

interface TradeSpec {
  tradeId: string;
  symbol: string;
  underlying: string;
  instrumentName: string;
  tradeTitle: string;
  assetClass: 'OPTIONS' | 'COMMODITY' | 'FUTURES';
  exchange: 'NSE' | 'BSE' | 'MCX';
  marketSegment: 'NSE_FNO' | 'MCX';
  optionType?: 'CALL' | 'PUT';
  strikePrice?: number;
  expiryDate: Date;
  multiplier: number;
  overrideTimes?: {
    entryTime: Date;
    exitTime: Date;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
  };
}

const TRADE_SPECS: TradeSpec[] = [
  // 1. 16-10-2026 NIFTY 23100 PE
  {
    tradeId: '6ad5ae1136c071b78955bf24',
    symbol: 'NIFTY26O1923100PE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 23100 PE',
    tradeTitle: '23100 PE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'PUT',
    strikePrice: 23100,
    expiryDate: new Date('2026-10-19T00:00:00.000Z'),
    multiplier: 1,
  },
  // 2. 16-10-2026 CRUDEOILM 19 OCT FUT
  {
    tradeId: '6ad5ae1136c071b78955bf20',
    symbol: 'CRUDEOILM26OCTFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-10-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 3. 19-10-2026 NIFTY 23000 PE
  {
    tradeId: '6ad748f1dadaea842ef17c36',
    symbol: 'NIFTY26O1923000PE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 23000 PE',
    tradeTitle: '23000 PE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'PUT',
    strikePrice: 23000,
    expiryDate: new Date('2026-10-19T00:00:00.000Z'),
    multiplier: 1,
  },
  // 4. 19-10-2026 NIFTY 23000 PE
  {
    tradeId: '6ad748f1dadaea842ef17c3a',
    symbol: 'NIFTY26O1923000PE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 23000 PE',
    tradeTitle: '23000 PE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'PUT',
    strikePrice: 23000,
    expiryDate: new Date('2026-10-19T00:00:00.000Z'),
    multiplier: 1,
  },
  // 5. 19-10-2026 CRUDEOILM 19 OCT FUT
  {
    tradeId: '6ad748f1dadaea842ef17c2e',
    symbol: 'CRUDEOILM26OCTFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-10-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 6. 19-10-2026 NIFTY 23000 PE
  {
    tradeId: '6ad748f1dadaea842ef17c32',
    symbol: 'NIFTY26O1923000PE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 23000 PE',
    tradeTitle: '23000 PE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'PUT',
    strikePrice: 23000,
    expiryDate: new Date('2026-10-19T00:00:00.000Z'),
    multiplier: 1,
  },
  // 7. 20-10-2026 NATGASMINI 26 OCT FUT
  {
    tradeId: '6ad84c5f260f5b8ae59e6de9',
    symbol: 'NATGASMINI26OCTFUT',
    underlying: 'NATGASMINI',
    instrumentName: 'NATGASMINI Fut',
    tradeTitle: 'NATGASMINI Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-10-27T00:00:00.000Z'),
    multiplier: 250,
  },
  // 8. 20-10-2026 NATGASMINI 26 OCT FUT
  {
    tradeId: '6ad7bfa8260f5b8ae59e6a9c',
    symbol: 'NATGASMINI26OCTFUT',
    underlying: 'NATGASMINI',
    instrumentName: 'NATGASMINI Fut',
    tradeTitle: 'NATGASMINI Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-10-27T00:00:00.000Z'),
    multiplier: 250,
  },
  // 9. 20-10-2026 CRUDEOILM 26 NOV FUT (Inverted timestamps fix)
  {
    tradeId: '6ad7b06865c8b634f3bdeb46',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
    overrideTimes: {
      entryTime: new Date('2026-10-20T17:00:24.000Z'), // 22:30:24 IST
      exitTime: new Date('2026-10-20T17:43:20.000Z'),  // 23:13:20 IST
      direction: 'SHORT',
      entryPrice: 9322.40,
      exitPrice: 9319.00,
      quantity: 15,
    },
  },
  // 10. 21-10-2026 NIFTY 22950 CE
  {
    tradeId: '6ad8ede34f1a8b9af6ef326f',
    symbol: 'NIFTY26OCT22950CE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 22950 CE',
    tradeTitle: '22950 CE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 22950,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 11. 21-10-2026 NIFTY 22900 CE
  {
    tradeId: '6ad8ede24f1a8b9af6ef325d',
    symbol: 'NIFTY26OCT22900CE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 22900 CE',
    tradeTitle: '22900 CE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 22900,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 12. 21-10-2026 NIFTY 22900 CE
  {
    tradeId: '6ad8ede24f1a8b9af6ef3260',
    symbol: 'NIFTY26OCT22900CE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 22900 CE',
    tradeTitle: '22900 CE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 22900,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 13. 21-10-2026 NIFTY 22850 CE
  {
    tradeId: '6ad8ede34f1a8b9af6ef326c',
    symbol: 'NIFTY26OCT22850CE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 22850 CE',
    tradeTitle: '22850 CE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 22850,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 14. 21-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6ad8ede24f1a8b9af6ef3263',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 15. 21-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6ad8ede24f1a8b9af6ef3266',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 16. 22-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6ada438a128b59b7268c6198',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 17. 22-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6ada438a128b59b7268c619b',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 18. 22-10-2026 GOLDM 26 NOV FUT
  {
    tradeId: '6ada438a128b59b7268c619e',
    symbol: 'GOLDM26NOVFUT',
    underlying: 'GOLD',
    instrumentName: 'GOLDM Fut',
    tradeTitle: 'GOLDM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-05T00:00:00.000Z'),
    multiplier: 10,
  },
  // 19. 23-10-2026 NIFTY 22650 CE
  {
    tradeId: '6adaf69988baef6036881443',
    symbol: 'NIFTY26OCT22650CE',
    underlying: 'NIFTY',
    instrumentName: 'NIFTY 22650 CE',
    tradeTitle: '22650 CE',
    assetClass: 'OPTIONS',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 22650,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 20. 23-10-2026 SENSEX 73600 CE
  {
    tradeId: '6adaf69988baef6036881446',
    symbol: 'SENSEX26OCT73600CE',
    underlying: 'SENSEX',
    instrumentName: 'SENSEX 73600 CE',
    tradeTitle: '73600 CE',
    assetClass: 'OPTIONS',
    exchange: 'BSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 73600,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 21. 23-10-2026 SENSEX 73600 CE
  {
    tradeId: '6adaf69a88baef6036881449',
    symbol: 'SENSEX26OCT73600CE',
    underlying: 'SENSEX',
    instrumentName: 'SENSEX 73600 CE',
    tradeTitle: '73600 CE',
    assetClass: 'OPTIONS',
    exchange: 'BSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 73600,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 22. 23-10-2026 SENSEX 73500 CE
  {
    tradeId: '6adb3df2247332c10d20c265',
    symbol: 'SENSEX26OCT73500CE',
    underlying: 'SENSEX',
    instrumentName: 'SENSEX 73500 CE',
    tradeTitle: '73500 CE',
    assetClass: 'OPTIONS',
    exchange: 'BSE',
    marketSegment: 'NSE_FNO',
    optionType: 'CALL',
    strikePrice: 73500,
    expiryDate: new Date('2026-10-26T00:00:00.000Z'),
    multiplier: 1,
  },
  // 23. 23-10-2026 NATGASMINI 26 OCT FUT
  {
    tradeId: '6adb3df2247332c10d20c26b',
    symbol: 'NATGASMINI26OCTFUT',
    underlying: 'NATGASMINI',
    instrumentName: 'NATGASMINI Fut',
    tradeTitle: 'NATGASMINI Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-10-27T00:00:00.000Z'),
    multiplier: 250,
  },
  // 24. 23-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6adb3df2247332c10d20c268',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 25. 23-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6adb65d4247332c10d20d83e',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
  // 26. 23-10-2026 CRUDEOILM 26 NOV FUT
  {
    tradeId: '6adb65d4247332c10d20d841',
    symbol: 'CRUDEOILM26NOVFUT',
    underlying: 'CRUDEOIL',
    instrumentName: 'CRUDEOILM Fut',
    tradeTitle: 'CRUDEOILM Fut',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    expiryDate: new Date('2026-11-19T00:00:00.000Z'),
    multiplier: 10,
  },
];

async function main() {
  await connectDatabase();
  console.log('=== STARTING REFINEMENT OF KOMALTRADER TRADES AND FYERS CAPITAL SYNC ===\n');

  const user = await User.findOne({ email: 'komaltrader@gmail.com' });
  if (!user) {
    throw new Error('User komaltrader@gmail.com not found!');
  }
  const account = await TradingAccount.findOne({ userId: user._id, name: 'Fyers' });
  if (!account) {
    throw new Error('TradingAccount "Fyers" not found!');
  }

  console.log(`Target User: ${user.name} (${user._id})`);
  console.log(`Target Account: ${account.name} (${account._id})\n`);

  // 1. Ensure Instruments exist for all required underlyings
  const instruments = await Instrument.find({ userId: user._id }).lean();
  const instMap = new Map<string, any>();
  for (const ins of instruments) {
    instMap.set(ins.symbol.toUpperCase(), ins);
  }

  // 2. Refine 26 existing trades
  console.log('--- REFINING 26 EXISTING TRADES ---');
  let refinedCount = 0;

  for (const spec of TRADE_SPECS) {
    const trade = await Trade.findOne({ _id: spec.tradeId, userId: user._id });
    if (!trade) {
      console.warn(`Trade ${spec.tradeId} not found, skipping.`);
      continue;
    }

    const prevSym = trade.symbol;
    trade.symbol = spec.symbol;
    trade.underlying = spec.underlying;
    trade.instrumentName = spec.instrumentName;
    trade.tradeTitle = spec.tradeTitle;
    trade.assetClass = spec.assetClass;
    trade.exchange = spec.exchange;
    trade.marketSegment = spec.marketSegment;
    trade.optionType = spec.optionType;
    trade.strikePrice = spec.strikePrice;
    trade.expiryDate = spec.expiryDate;

    // Link appropriate instrument
    const inst = instMap.get(spec.underlying.toUpperCase()) || instMap.get(spec.symbol.toUpperCase());
    if (inst) {
      trade.instrumentId = inst._id;
    }

    if (spec.overrideTimes) {
      trade.entryTime = spec.overrideTimes.entryTime;
      trade.exitTime = spec.overrideTimes.exitTime;
      trade.direction = spec.overrideTimes.direction;
      if (trade.simpleExecution) {
        trade.simpleExecution.entryPrice = spec.overrideTimes.entryPrice;
        trade.simpleExecution.exitPrice = spec.overrideTimes.exitPrice;
        trade.simpleExecution.quantity = spec.overrideTimes.quantity;
      }
    }

    const entryPrice = trade.simpleExecution?.entryPrice || 0;
    const exitPrice = trade.simpleExecution?.exitPrice || 0;
    const qty = trade.simpleExecution?.quantity || 1;
    const multiplier = spec.multiplier;

    if (trade.simpleExecution) {
      trade.simpleExecution.contractMultiplier = multiplier;
    }

    // Recalculate charges and PnL
    const charges = calculateIndianCharges({
      assetClass: spec.assetClass,
      marketSegment: spec.marketSegment,
      entryPrice,
      exitPrice,
      quantity: qty,
      contractMultiplier: multiplier,
      broker: 'FYERS',
    });

    const isLong = trade.direction === 'LONG';
    const priceDiff = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
    const grossPnL = priceDiff * qty * multiplier;
    const netPnL = grossPnL - charges.totalCosts;

    if (trade.simpleExecution) {
      trade.simpleExecution.brokerage = charges.brokerage;
      trade.simpleExecution.exchangeFees = charges.exchangeFees;
      trade.simpleExecution.regulatoryFees = charges.regulatoryFees;
      trade.simpleExecution.taxes = charges.taxes;
    }

    trade.calculated = trade.calculated || ({} as any);
    trade.calculated.averageEntryPrice = entryPrice;
    trade.calculated.averageExitPrice = exitPrice;
    trade.calculated.closedQuantity = qty;
    trade.calculated.openQuantity = 0;
    trade.calculated.totalCosts = charges.totalCosts;
    trade.calculated.grossPnL = grossPnL;
    trade.calculated.netPnL = netPnL;
    trade.calculated.outcome = netPnL > 0 ? 'WIN' : netPnL < 0 ? 'LOSS' : 'BREAKEVEN';

    // Clear failed excursion so it can be recomputed fresh with real candles
    if (trade.calculated.excursion?.status === 'UNAVAILABLE') {
      trade.calculated.excursion = undefined;
    }

    await trade.save();
    refinedCount++;
    console.log(`[UPDATED] Trade ${trade._id}: "${prevSym}" -> "${spec.symbol}" (${spec.exchange}), Mult: ${multiplier}, Net PnL: ₹${netPnL.toFixed(2)}`);
  }

  console.log(`\nRefined ${refinedCount} / ${TRADE_SPECS.length} trades.`);

  // 3. Insert Missing Trade #27 (Evening 23-10-2026 NATGASMINI)
  console.log('\n--- CHECKING MISSING TRADE #27 (23-10-2026 NATGASMINI EVENING) ---');
  let trade27 = await Trade.findOne({
    userId: user._id,
    symbol: 'NATGASMINI26OCTFUT',
    'simpleExecution.entryPrice': 255.40,
    'simpleExecution.exitPrice': 254.30,
  });

  if (!trade27) {
    const inst = instMap.get('NATGASMINI');
    const entryPrice = 255.40;
    const exitPrice = 254.30;
    const qty = 8;
    const multiplier = 250;
    const entryTime = new Date('2026-10-23T14:28:48.000Z'); // 19:58:48 IST
    const exitTime = new Date('2026-10-23T14:40:52.000Z');  // 20:10:52 IST

    const charges = calculateIndianCharges({
      assetClass: 'COMMODITY',
      marketSegment: 'MCX',
      entryPrice,
      exitPrice,
      quantity: qty,
      contractMultiplier: multiplier,
      broker: 'FYERS',
    });

    const grossPnL = (exitPrice - entryPrice) * qty * multiplier; // -2200.00
    const netPnL = grossPnL - charges.totalCosts;

    trade27 = await Trade.create({
      userId: user._id,
      accountId: account._id,
      instrumentId: inst?._id,
      underlying: 'NATGASMINI',
      instrumentName: 'NATGASMINI Fut',
      symbol: 'NATGASMINI26OCTFUT',
      tradeTitle: 'NATGASMINI Fut',
      assetClass: 'COMMODITY',
      exchange: 'MCX',
      marketSegment: 'MCX',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-23T00:00:00.000Z'),
      entryTime,
      exitTime,
      tags: ['FYERS_AUTO_SYNC'],
      executionMode: 'ADVANCED',
      simpleExecution: {
        contractMultiplier: multiplier,
        entryPrice,
        exitPrice,
        quantity: qty,
        brokerage: charges.brokerage,
        exchangeFees: charges.exchangeFees,
        regulatoryFees: charges.regulatoryFees,
        taxes: charges.taxes,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [
        {
          fillId: '629617326286070-BUY',
          timestamp: entryTime,
          type: 'ENTRY',
          price: entryPrice,
          quantity: qty,
          fee: 0,
        },
        {
          fillId: '629617326352169-SELL',
          timestamp: exitTime,
          type: 'EXIT',
          price: exitPrice,
          quantity: qty,
          fee: 0,
        },
      ],
      calculated: {
        averageEntryPrice: entryPrice,
        averageExitPrice: exitPrice,
        closedQuantity: qty,
        openQuantity: 0,
        totalCosts: charges.totalCosts,
        grossPnL,
        netPnL,
        outcome: 'LOSS',
      },
    });

    console.log(`[CREATED] Trade #27 inserted: ID ${trade27._id}, Gross: ₹${grossPnL}, Net: ₹${netPnL.toFixed(2)}`);
  } else {
    console.log(`Trade #27 already exists: ID ${trade27._id}`);
  }

  // 4. SYNC AND RECONCILE CAPITAL WITH LIVE FYERS
  console.log('\n--- SYNCING CAPITAL WITH LIVE FYERS ---');
  const fundsResult = await FyersService.syncFundsForAccount(account._id, user._id);
  const liveFyersBalance = fundsResult.brokerBalance; // e.g. 644988.02
  console.log(`Live FYERS Balance: ₹${liveFyersBalance}`);

  // Recalculate account balances to see current SetupMint base balance from trades
  let balanceSummary = await AccountService.recalculateAccountBalances(account._id, user._id);
  console.log('Balance before adjustment update:', balanceSummary);

  let adjTx = await AccountTransaction.findOne({
    accountId: account._id,
    userId: user._id,
    source: 'BROKER_SYNC',
  }).sort({ createdAt: -1 });

  const initial = new Decimal(account.initialBalance.toString());
  const realizedPnL = new Decimal(account.realizedPnL.toString());
  const deposits = new Decimal(account.totalDeposits.toString());
  const withdrawals = new Decimal(account.totalWithdrawals.toString());
  const baseBalance = initial.plus(realizedPnL).plus(deposits).minus(withdrawals);

  const targetBalance = new Decimal(liveFyersBalance);
  const exactAdjustment = targetBalance.minus(baseBalance);

  console.log(`Base SetupMint Balance (before adjustment): ₹${baseBalance.toFixed(2)}`);
  console.log(`Target Live FYERS Balance:                 ₹${targetBalance.toFixed(2)}`);
  console.log(`Exact Required Adjustment:                 ₹${exactAdjustment.toFixed(2)}`);

  if (!adjTx) {
    adjTx = await AccountTransaction.create({
      userId: user._id,
      accountId: account._id,
      type: 'ADJUSTMENT',
      amount: mongoose.Types.Decimal128.fromString(exactAdjustment.toFixed(2)),
      currency: account.baseCurrency,
      date: new Date(),
      notes: `FYERS Reconciliation Adjustment: Live Clear Balance ₹${targetBalance.toFixed(2)} synced`,
      source: 'BROKER_SYNC',
      status: 'CONFIRMED',
    });
    console.log(`[CREATED] Adjustment transaction ${adjTx._id} created with ₹${exactAdjustment.toFixed(2)}`);
  } else {
    adjTx.amount = mongoose.Types.Decimal128.fromString(exactAdjustment.toFixed(2));
    adjTx.status = 'CONFIRMED';
    adjTx.notes = `FYERS Reconciliation Adjustment: Live Clear Balance ₹${targetBalance.toFixed(2)} synced`;
    await adjTx.save();
    console.log(`[CONFIRMED] Adjustment transaction ${adjTx._id} updated to ₹${exactAdjustment.toFixed(2)} and CONFIRMED.`);
  }

  // Authoritatively recalculate final balances
  balanceSummary = await AccountService.recalculateAccountBalances(account._id, user._id);
  console.log('\nFINAL RECONCILED ACCOUNT BALANCE SUMMARY:');
  console.log(JSON.stringify(balanceSummary, null, 2));

  // 5. RE-COMPUTE EXCURSION AND CANDLES FOR ALL 27 TRADES
  console.log('\n--- RE-COMPUTING CANDLES & EXCURSION FOR ALL 27 TRADES ---');
  const allTrades = await Trade.find({ userId: user._id, accountId: account._id }).sort({ entryTime: 1 });
  let excursionSuccess = 0;
  let excursionFailed = 0;

  for (const t of allTrades) {
    try {
      const exc = await FyersService.computeExcursionForTrade(t._id, user._id, true);
      if (exc.status === 'COMPUTED' || exc.status === 'AVAILABLE') {
        excursionSuccess++;
        console.log(`[OK] Trade ${t._id} (${t.symbol} ${t.exchange}): MAE=${exc.mae?.price} (${exc.mae?.rMultiple}R), MFE=${exc.mfe?.price} (${exc.mfe?.rMultiple}R), source=${exc.source}`);
      } else {
        excursionFailed++;
        console.log(`[NOTE] Trade ${t._id} (${t.symbol} ${t.exchange}): ${exc.status} - ${exc.failureReason}`);
      }
    } catch (err: any) {
      excursionFailed++;
      console.error(`[ERROR] Trade ${t._id} excursion error:`, err.message);
    }
  }

  console.log(`\nExcursion Re-computation complete: ${excursionSuccess} SUCCESSFUL, ${excursionFailed} UNAVAILABLE/NOTE.`);
  console.log('========================================================\n');

  await disconnectDatabase();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
