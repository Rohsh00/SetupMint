import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Trade, TradingAccount } from '../db/models/index.js';
import { deriveSessionFromTime } from '@tradevault/financial-engine';

export async function backfillTradingSessions() {
  console.log('Connecting to database...');
  await connectDatabase();

  const accounts = await TradingAccount.find({}).lean();
  const accountMap = new Map(accounts.map((a) => [a._id.toString(), a]));
  console.log(`Loaded ${accounts.length} trading accounts.`);

  // 1. Identify all trades in Elefin accounts (or any trade with missing/invalid session)
  const elefinAccounts = accounts.filter(
    (a) =>
      /elefin/i.test(a.broker || '') ||
      /elefin/i.test(a.name || '') ||
      a._id.toString() === '6af1fa0735d0f0f584d918bf'
  );
  console.log(`Found ${elefinAccounts.length} Elefin account(s):`, elefinAccounts.map((a) => `${a.name} [${a._id}]`));

  let elefinUpdatedCount = 0;
  const elefinBreakdown: Record<string, number> = {};

  for (const acc of elefinAccounts) {
    const trades = await Trade.find({ accountId: acc._id }).sort({ entryTime: 1 });
    console.log(`Processing Elefin account "${acc.name}" (${trades.length} trades)...`);

    for (const trade of trades) {
      const derivedSession = deriveSessionFromTime(
        trade.entryTime || trade.tradeDate,
        trade.exchange || 'FOREX',
        trade.marketSegment || 'FOREX_SPOT',
        acc.profile?.sessionCalendarKey || 'FOREX_24_5',
        trade.symbol
      );

      if (trade.session !== derivedSession) {
        await Trade.updateOne({ _id: trade._id }, { $set: { session: derivedSession } });
        elefinUpdatedCount++;
      }
      elefinBreakdown[derivedSession] = (elefinBreakdown[derivedSession] || 0) + 1;
    }
  }

  console.log(`\n========================================`);
  console.log(`✅ ELEFIN TRADES HEALED: ${elefinUpdatedCount} updated`);
  console.log(`📊 Elefin Session Distribution:`, elefinBreakdown);
  console.log(`========================================\n`);

  // 2. Also backfill any remaining trades across all other accounts where session is missing/null/empty
  const missingTrades = await Trade.find({
    $or: [{ session: { $exists: false } }, { session: null }, { session: '' }],
  });
  console.log(`Found ${missingTrades.length} other trades with missing session across the database.`);

  let globalUpdatedCount = 0;
  const globalBreakdown: Record<string, number> = {};

  for (const trade of missingTrades) {
    const acc = trade.accountId ? accountMap.get(trade.accountId.toString()) : null;
    const isForex =
      /forex/i.test(trade.exchange || '') ||
      /xau|eur|gbp|usd/i.test(trade.symbol || '') ||
      acc?.profile?.sessionCalendarKey === 'FOREX_24_5';

    const defaultCalendarKey = isForex
      ? 'FOREX_24_5'
      : acc?.profile?.sessionCalendarKey ||
        (acc?.broker === 'FYERS' || acc?.baseCurrency === 'INR' ? 'NSE' : 'FOREX_24_5');

    const derived = deriveSessionFromTime(
      trade.entryTime || trade.tradeDate,
      trade.exchange,
      trade.marketSegment,
      defaultCalendarKey,
      trade.symbol
    );

    await Trade.updateOne({ _id: trade._id }, { $set: { session: derived } });
    globalUpdatedCount++;
    globalBreakdown[derived] = (globalBreakdown[derived] || 0) + 1;
  }

  console.log(`✅ GLOBAL MISSING TRADES HEALED: ${globalUpdatedCount} updated`);
  console.log(`📊 Global Missing Session Breakdown:`, globalBreakdown);

  await disconnectDatabase();
  console.log('Database disconnected cleanly.');
}

if (process.argv[1]?.includes('backfill-trading-sessions')) {
  backfillTradingSessions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    });
}
