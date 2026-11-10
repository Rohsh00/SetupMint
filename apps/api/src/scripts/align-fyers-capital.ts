import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
dotenv.config();
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, TradingAccount, Trade, BrokerFundsSnapshot } from '../db/models/index.js';
import { AccountService } from '../services/account.service.js';

async function alignFyersCapital() {
  await connectDatabase();

  const user = await User.findOne({ email: 'komal@gmail.com' });
  if (!user) throw new Error('User komal@gmail.com not found');

  const account = await TradingAccount.findOne({
    _id: new mongoose.Types.ObjectId('6ae1c7dbb303e7e620935592'),
    userId: user._id,
  });
  if (!account) throw new Error('FYERS account not found');

  const latestSnapshot = await BrokerFundsSnapshot.findOne({
    accountId: account._id,
    userId: user._id,
  }).sort({ fetchedAt: -1 });

  const settledClearBalance = latestSnapshot
    ? new Decimal(latestSnapshot.clearBalance.toString())
    : new Decimal('493817.58');

  console.log(`FYERS Live Clear Balance (Settled): ₹${settledClearBalance.toFixed(2)}`);

  // Analyze all closed trades
  const closedTrades = await Trade.find({
    accountId: account._id,
    userId: user._id,
    status: 'CLOSED',
  }).sort({ tradeDate: 1, entryTime: 1 });

  let settledGross = new Decimal(0);
  let settledCosts = new Decimal(0);
  let settledNet = new Decimal(0);

  let unsettledGross = new Decimal(0);
  let unsettledCosts = new Decimal(0);
  let unsettledNet = new Decimal(0);

  const SETTLEMENT_CUTOFF = new Date('2026-11-07T00:00:00+05:30');

  for (const t of closedTrades) {
    const isSettled = t.tradeDate < SETTLEMENT_CUTOFF;
    const gross = new Decimal(t.calculated?.grossPnL || 0);
    const costs = new Decimal(t.calculated?.totalCosts || 0);
    const net = new Decimal(t.calculated?.netPnL || 0);

    if (isSettled) {
      settledGross = settledGross.plus(gross);
      settledCosts = settledCosts.plus(costs);
      settledNet = settledNet.plus(net);
    } else {
      unsettledGross = unsettledGross.plus(gross);
      unsettledCosts = unsettledCosts.plus(costs);
      unsettledNet = unsettledNet.plus(net);
    }
  }

  console.log('\n--- Settled Trades (Through Friday 06 Nov) ---');
  console.log(`Count: ${closedTrades.filter((t) => t.tradeDate < SETTLEMENT_CUTOFF).length}`);
  console.log(`Gross: ₹${settledGross.toFixed(2)}`);
  console.log(`Costs: ₹${settledCosts.toFixed(2)}`);
  console.log(`Net:   ₹${settledNet.toFixed(2)}`);

  console.log('\n--- Unsettled Trades (09 Nov & 10 Nov) ---');
  console.log(`Count: ${closedTrades.filter((t) => t.tradeDate >= SETTLEMENT_CUTOFF).length}`);
  console.log(`Gross: ₹${unsettledGross.toFixed(2)}`);
  console.log(`Costs: ₹${unsettledCosts.toFixed(2)}`);
  console.log(`Net:   ₹${unsettledNet.toFixed(2)}`);

  // Calculate authoritative opening balance:
  // Settled Clear Balance = Opening Balance + Settled Net P&L
  // Opening Balance = Settled Clear Balance - Settled Net P&L
  const exactOpeningBalance = settledClearBalance.minus(settledNet);
  console.log(`\nExact Opening Balance: ₹${exactOpeningBalance.toFixed(2)}`);

  // Update account initial balance
  account.initialBalance = mongoose.Types.Decimal128.fromString(exactOpeningBalance.toFixed(2));
  await account.save();
  console.log(`✓ Updated FYERS account initialBalance to ₹${exactOpeningBalance.toFixed(2)}`);

  // Authoritatively recalculate account balances
  console.log('\n--- Recalculating Account Balances ---');
  const summary = await AccountService.recalculateAccountBalances(account._id, user._id);
  console.log('Updated Account Balance Summary:', {
    accountName: account.name,
    initialBalance: summary?.initialBalance,
    settledClearBalance: settledClearBalance.toFixed(2),
    settledNetPnL: settledNet.toFixed(2),
    unsettledNetPnL: unsettledNet.toFixed(2),
    totalRealizedPnL: summary?.realizedPnL,
    currentEquity: summary?.currentBalance,
    closedTradesCount: summary?.closedTradesCount,
    openTradesCount: summary?.openTradesCount,
  });

  const expectedEquity = settledClearBalance.plus(unsettledNet);
  const currentEquityDec = new Decimal(summary?.currentBalance || 0);
  const drift = currentEquityDec.minus(expectedEquity);

  console.log(`\nVerification:`);
  console.log(`  Settled Clear Balance:      ₹${settledClearBalance.toFixed(2)}`);
  console.log(`  + Unsettled Trade Profit:   ₹${unsettledNet.toFixed(2)}`);
  console.log(`  = Expected Total Equity:    ₹${expectedEquity.toFixed(2)}`);
  console.log(`  SetupMint Current Balance:  ₹${currentEquityDec.toFixed(2)}`);
  console.log(`  Drift:                      ₹${drift.toFixed(2)} (MUST BE 0.00)`);

  if (!drift.isZero()) {
    throw new Error(`Drift is not zero: ${drift.toFixed(2)}`);
  }

  console.log('\n✓ FYERS Capital perfectly aligned with 100% mathematical precision down to the paise!');
  await disconnectDatabase();
}

alignFyersCapital().catch((err) => {
  console.error('Alignment failed:', err);
  process.exit(1);
});
