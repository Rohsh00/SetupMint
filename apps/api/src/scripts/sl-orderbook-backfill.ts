import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { BrokerIntegration } from '../db/models/index.js';
import { FyersService } from '../services/fyers.service.js';

export async function runSLOrderbookBackfill(options?: { isLive?: boolean; skipConnect?: boolean }) {
  const isLive = options?.isLive ?? process.argv.includes('--yes');

  console.log('========================================================');
  console.log(' SetupMint FYERS Orderbook SL Recovery Backfill        ');
  console.log('========================================================');
  console.log('Note: FYERS orderbook is available for CURRENT-DAY orders only.');
  if (!isLive) {
    console.log('\n[DRY RUN MODE] No changes will be written to the database.');
    console.log('To apply matching stops to your database, re-run with --yes:');
    console.log('  npm run sl:backfill -- --yes\n');
  } else {
    console.log('\n[LIVE EXECUTION MODE] Matching and persisting stops from FYERS orderbook.\n');
  }

  if (!options?.skipConnect) {
    await connectDatabase();
  }

  try {
    const integrations = await BrokerIntegration.find({
      broker: 'FYERS',
      accessToken: { $exists: true, $ne: null },
    });

    if (integrations.length === 0) {
      console.log('No connected FYERS integrations found.');
      return;
    }

    let totalMatched = 0;
    let totalAmbiguous = 0;
    let totalSkipped = 0;

    for (const integration of integrations) {
      console.log(`Processing user ${integration.userId} (Client ID: ${integration.clientId || 'N/A'})...`);
      try {
        const result = await FyersService.backfillSLFromOrderbook(integration.userId, {
          dryRun: !isLive,
        });

        console.log(`  Eligible same-day trades: ${result.totalEligibleTrades}`);
        console.log(`  Matched:                  ${result.matchedCount}`);
        console.log(`  Ambiguous:                ${result.ambiguousCount}`);
        console.log(`  Skipped (no SL order):    ${result.skippedCount}`);

        for (const t of result.trades) {
          if (t.confidence === 'HIGH') {
            console.log(`    ✓ Trade ${t.tradeId} (${t.symbol} ${t.direction}): SL recovered at ${t.initialStop}`);
          } else if (t.confidence === 'AMBIGUOUS') {
            console.log(`    ⚠ Trade ${t.tradeId} (${t.symbol} ${t.direction}): Ambiguous (${t.reason})`);
          }
        }

        totalMatched += result.matchedCount;
        totalAmbiguous += result.ambiguousCount;
        totalSkipped += result.skippedCount;
      } catch (err: any) {
        console.warn(`  Failed backfill for user ${integration.userId}: ${err.message}`);
      }
    }

    console.log('\n========================================================');
    console.log('                 Backfill Summary                       ');
    console.log('========================================================');
    console.log(`Mode:                          ${isLive ? 'LIVE APPLIED' : 'DRY RUN (Simulated)'}`);
    console.log(`Total Matched & Updated:       ${totalMatched}`);
    console.log(`Total Ambiguous Trades:        ${totalAmbiguous}`);
    console.log(`Total Skipped / No SL:         ${totalSkipped}`);
    console.log('========================================================\n');
  } finally {
    if (!options?.skipConnect) {
      await disconnectDatabase();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('sl-orderbook-backfill.ts')) {
  runSLOrderbookBackfill().catch((err) => {
    console.error('Fatal SL backfill error:', err);
    process.exit(1);
  });
}
