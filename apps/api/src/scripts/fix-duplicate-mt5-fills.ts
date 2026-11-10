import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { validateAndFormatAtlasUri } from '../db/connection.js';
import { Trade, TradingAccount } from '../db/models/index.js';
import { sanitizeTradeFills } from '@tradevault/financial-engine';
import { InstrumentService } from '../services/instrument.service.js';
import { AccountService } from '../services/account.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export async function fixDuplicateMt5Fills() {
  console.log('\n================================================================');
  console.log('🔧 SetupMint — Automatic MT5 / Elefin Duplicate Fills Healer');
  console.log('================================================================\n');

  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    console.error('[Healer Error] MONGODB_URI is not set in environment.');
    return { fixedCount: 0, checkedCount: 0 };
  }

  const { uri: atlasUri, host: atlasHost } = validateAndFormatAtlasUri(rawUri);

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    console.log(`[Healer] Connecting to Atlas MongoDB cluster at ${atlasHost}...`);
    try {
      await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 10000 });
    } catch (err: any) {
      console.error(`[Healer Error] Could not connect to Atlas at ${atlasHost}: ${err.message}`);
      return { fixedCount: 0, checkedCount: 0 };
    }
  }

  // Find all trades that have fills
  const trades = await Trade.find({
    $or: [
      { executionMode: 'ADVANCED' },
      { 'fills.0': { $exists: true } },
      { tags: { $in: ['ELEFIN', 'MT5'] } },
      { importBatchId: { $regex: /^MT5_/ } },
    ],
  });

  console.log(`[Healer] Auditing ${trades.length} candidate trades for duplicate/excess exit fills...\n`);

  let fixedCount = 0;
  const affectedAccountIds = new Set<string>();

  for (const trade of trades) {
    if (!Array.isArray(trade.fills) || trade.fills.length === 0) continue;

    const sanitizeResult = sanitizeTradeFills(trade.fills);
    if (!sanitizeResult.hasChanges) continue;

    console.log(
      `[Healer] ⚠️  Found corrupted fills on Trade #${trade._id.toString()} (${trade.tradeTitle || trade.symbol}):`
    );
    console.log(
      `         - Total entries: ${sanitizeResult.totalEntries} | Original exits: ${sanitizeResult.originalTotalExits} -> Sanitized exits: ${sanitizeResult.sanitizedTotalExits}`
    );
    console.log(`         - Pruned ${sanitizeResult.duplicateCount} duplicate/excess exit fill(s)`);

    trade.fills = sanitizeResult.fills as any;
    trade.markModified('fills');

    // Recalculate calculations
    const recalced = InstrumentService.computeTradeCalculations(trade.toObject());
    trade.calculated = recalced;
    trade.markModified('calculated');

    if (trade.simpleExecution && recalced.averageExitPrice !== undefined) {
      trade.simpleExecution.exitPrice = recalced.averageExitPrice;
      trade.markModified('simpleExecution');
    }

    if (recalced.openQuantity === 0 && sanitizeResult.totalEntries > 0) {
      trade.status = 'CLOSED';
    }

    await trade.save();
    fixedCount++;

    if (trade.accountId && trade.userId) {
      affectedAccountIds.add(`${trade.accountId.toString()}::${trade.userId.toString()}`);
    }
    console.log(`[Healer] ✓ Trade #${trade._id.toString()} healed successfully.\n`);
  }

  // Authoritatively reconcile all affected accounts
  if (affectedAccountIds.size > 0) {
    console.log(`[Healer] Reconciling balances for ${affectedAccountIds.size} affected trading account(s)...`);
    for (const item of affectedAccountIds) {
      const [accId, uId] = item.split('::');
      try {
        await AccountService.recalculateAccountBalances(accId, uId);
        console.log(`[Healer] ✓ Account ${accId} balances reconciled.`);
      } catch (err: any) {
        console.warn(`[Healer] Warning reconciling account ${accId}: ${err.message}`);
      }
    }
  }

  console.log(`\n================================================================`);
  console.log(`✅ Healing complete! Checked: ${trades.length} | Fixed: ${fixedCount} corrupted trades.`);
  console.log(`================================================================\n`);

  return { fixedCount, checkedCount: trades.length };
}

// Direct execution guard
if (process.argv[1] && process.argv[1].endsWith('fix-duplicate-mt5-fills.ts')) {
  fixDuplicateMt5Fills()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Healer Error] Fatal error during healing:', err);
      process.exit(1);
    });
}

