import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Trade } from '../db/models/index.js';
import { FyersService } from '../services/fyers.service.js';

export async function backfillAllExcursions() {
  await connectDatabase();
  console.log('========================================================');
  console.log(' SetupMint — Comprehensive Excursion & Post-Exit Backfill');
  console.log('========================================================\n');

  try {
    // Find closed trades that either have no postExitMfePoints or need excursion computation
    const trades = await Trade.find({
      status: 'CLOSED',
      $or: [
        { 'calculated.excursion.postExitMfePoints': { $exists: false } },
        { 'calculated.excursion.status': { $in: ['PENDING', 'UNAVAILABLE', null] } },
      ],
    })
      .sort({ entryTime: -1 })
      .select('_id userId symbol direction entryTime exitTime calculated');

    console.log(`Found ${trades.length} eligible closed trades to process.\n`);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      process.stdout.write(`[${i + 1}/${trades.length}] Trade ${trade._id} (${trade.symbol} ${trade.direction}) ... `);

      if (!trade.entryTime || !trade.exitTime) {
        console.log('SKIPPED (missing entry or exit time)');
        skippedCount++;
        continue;
      }

      try {
        const result = await FyersService.computeExcursionForTrade(trade._id, trade.userId, true);
        if (result && result.status === 'COMPUTED') {
          console.log(`COMPUTED (In-Trade MFE: ${result.mfePoints} pts, Post-Exit MFE: ${result.postExitMfePoints ?? 'N/A'} pts, R Left: ${result.rLeftOnTable ?? 'N/A'}R)`);
          successCount++;
        } else {
          console.log(`UNAVAILABLE (${result?.failureReason || 'No candles'})`);
          failedCount++;
        }
      } catch (err: any) {
        console.log(`ERROR (${err.message})`);
        failedCount++;
      }

      // Gentle rate pacing to respect upstream data providers
      await new Promise((r) => setTimeout(r, 120));
    }

    console.log('\n========================================================');
    console.log(` Backfill Complete: ${successCount} Computed, ${failedCount} Unavailable/Failed, ${skippedCount} Skipped`);
    console.log('========================================================\n');
  } catch (err: any) {
    console.error('Fatal backfill error:', err);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && process.argv[1].includes('backfill-all-excursions')) {
  backfillAllExcursions().catch(console.error);
}

