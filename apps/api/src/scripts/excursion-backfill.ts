import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Trade, BrokerIntegration } from '../db/models/index.js';
import { FyersService } from '../services/fyers.service.js';

export async function runExcursionBackfill(options?: { isLive?: boolean; skipConnect?: boolean }) {
  const isLive = options?.isLive ?? process.argv.includes('--yes');

  console.log('========================================================');
  console.log(' SetupMint Excursion Analytics Backfill Migration      ');
  console.log('========================================================');
  if (!isLive) {
    console.log('\n[DRY RUN MODE] No changes will be written to the database.');
    console.log('To execute this backfill, re-run with --yes:');
    console.log('  npm run excursion:backfill -- --yes\n');
  } else {
    console.log('\n[LIVE EXECUTION MODE] Computing excursion metrics for closed trades.\n');
  }

  if (!options?.skipConnect) {
    await connectDatabase();
  }

  try {
    const filter = {
      status: 'CLOSED',
      $or: [
        { 'calculated.excursion': { $exists: false } },
        { 'calculated.excursion.status': 'PENDING' },
        { 'calculated.excursion.status': { $exists: false } },
      ],
    };

    const pendingCount = await Trade.countDocuments(filter);
    console.log(`Found ${pendingCount} closed trade(s) eligible for excursion computation.`);

    let computed = 0;
    let unavailable = 0;
    let failed = 0;

    if (isLive && pendingCount > 0) {
      const trades = await Trade.find(filter).sort({ tradeDate: -1 }).limit(100);

      for (const trade of trades) {
        try {
          const res = await FyersService.computeExcursionForTrade(trade._id, trade.userId);
          if (res.status === 'COMPUTED') {
            computed++;
            console.log(`  [COMPUTED] Trade ${trade._id} (${trade.symbol}) MFE: ${res.mfePoints}pts, MAE: ${res.maePoints}pts`);
          } else {
            unavailable++;
            console.log(`  [UNAVAILABLE] Trade ${trade._id} (${trade.symbol}): ${res.failureReason}`);
          }
        } catch (err: any) {
          failed++;
          console.warn(`  [FAILED] Trade ${trade._id} (${trade.symbol}): ${err.message}`);
        }
      }
    }

    console.log('\n========================================================');
    console.log('                 Backfill Summary                       ');
    console.log('========================================================');
    console.log(`Mode:                          ${isLive ? 'LIVE APPLIED' : 'DRY RUN (Simulated)'}`);
    console.log(`Eligible Trades Found:         ${pendingCount}`);
    if (isLive) {
      console.log(`Computed Successfully:         ${computed}`);
      console.log(`Marked Unavailable:            ${unavailable}`);
      console.log(`Failed Computations:           ${failed}`);
      console.log(`Remaining Trades:              ${Math.max(0, pendingCount - (computed + unavailable + failed))}`);
    }
    console.log('========================================================\n');
  } finally {
    if (!options?.skipConnect) {
      await disconnectDatabase();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('excursion-backfill.ts')) {
  runExcursionBackfill().catch((err) => {
    console.error('Fatal excursion backfill error:', err);
    process.exit(1);
  });
}
