import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Trade, Attachment, User } from '../db/models/index.js';
import { ChartGeneratorService } from '../services/chart-generator.service.js';
import { resolveSnapshotTimeframes } from '@tradevault/financial-engine';

export async function runChartBackfill(options?: { isLive?: boolean; skipConnect?: boolean }) {
  const isLive = options?.isLive ?? process.argv.includes('--yes');

  console.log('========================================================');
  console.log(' SetupMint Automated Chart Snapshot Backfill            ');
  console.log('========================================================');
  if (!isLive) {
    console.log('\n[DRY RUN MODE] No snapshot files or attachments will be generated.');
    console.log('To execute this backfill, re-run with --yes:');
    console.log('  npm run chart:backfill -- --yes\n');
  } else {
    console.log('\n[LIVE EXECUTION MODE] Generating permanent SVG snapshots for closed trades.\n');
  }

  if (!options?.skipConnect) {
    await connectDatabase();
  }

  try {
    const closedTrades = await Trade.find({ status: 'CLOSED' }).sort({ tradeDate: -1 });
    console.log(`Found ${closedTrades.length} closed trade(s) across all users.`);

    let eligibleCount = 0;
    let generatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const userSettingsCache = new Map<string, any>();

    for (const trade of closedTrades) {
      const uIdStr = trade.userId.toString();
      if (!userSettingsCache.has(uIdStr)) {
        const u = await User.findById(trade.userId).select('patternDetectionSettings').lean();
        userSettingsCache.set(uIdStr, (u as any)?.patternDetectionSettings || null);
      }
      const settings = userSettingsCache.get(uIdStr);

      const resolved = resolveSnapshotTimeframes(
        trade.toObject ? trade.toObject() : trade,
        settings
      );

      // Check existing auto charts
      const existingAutoCharts = await Attachment.find({
        userId: trade.userId,
        tradeId: trade._id,
        category: 'AUTO_CHART',
      });

      const existingTimeframes = new Set(existingAutoCharts.map((a) => a.timeframe));
      const neededTimeframes = resolved.resolutions.filter((r: string) => {
        const tf = r === 'D' ? '1D' : `${r}m`;
        return !existingTimeframes.has(tf) && !existingTimeframes.has(r);
      });

      if (neededTimeframes.length > 0) {
        eligibleCount++;
        console.log(
          `  Trade ${trade._id} (${trade.symbol}) [${resolved.source}]: needs [${neededTimeframes.join(', ')}] (existing: ${existingAutoCharts.length})`
        );

        if (isLive) {
          try {
            const results = await ChartGeneratorService.ensureTradeSnapshot(trade._id, trade.userId);
            const created = results.filter((r) => r.status === 'CREATED' || r.status === 'REPLACED');
            if (created.length > 0) {
              generatedCount += created.length;
              console.log(`    -> Generated ${created.length} snapshot(s)`);
            } else {
              skippedCount++;
            }
            await new Promise((r) => setTimeout(r, 220));
          } catch (err: any) {
            failedCount++;
            console.warn(`    -> FAILED for trade ${trade._id}: ${err.message}`);
          }
        }
      }
    }

    console.log('\n========================================================');
    console.log(' Backfill Summary:');
    console.log(`  Eligible Trades Needing Snapshots: ${eligibleCount}`);
    if (isLive) {
      console.log(`  Snapshots Generated:             ${generatedCount}`);
      console.log(`  Skipped / Slot-Capped:           ${skippedCount}`);
      console.log(`  Failed:                          ${failedCount}`);
    }
    console.log('========================================================\n');
  } finally {
    if (!options?.skipConnect) {
      await disconnectDatabase();
    }
  }
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith('chart-backfill.ts')) {
  runChartBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    });
}
