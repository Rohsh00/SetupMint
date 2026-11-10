import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { validateAndFormatAtlasUri } from '../apps/api/src/db/connection.js';
import { AccountService } from '../apps/api/src/services/account.service.js';
import { fixDuplicateMt5Fills } from '../apps/api/src/scripts/fix-duplicate-mt5-fills.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

async function reconcile() {
  console.log('\n======================================================');
  console.log('⚖️  SetupMint Authoritative Account Balance Reconciler');
  console.log('======================================================\n');

  // Step 1: Automatically heal any duplicate or corrupted MT5/Elefin fills first
  try {
    await fixDuplicateMt5Fills();
  } catch (healErr) {
    console.warn(`[Reconcile Warning] Fill healer encountered an issue: ${healErr.message}`);
  }

  const rawUri = process.env.MONGODB_URI;
  const { uri: atlasUri, host: atlasHost } = validateAndFormatAtlasUri(rawUri);

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    console.log(`[Reconcile] Connecting to Atlas MongoDB cluster at ${atlasHost}...`);
    try {
      await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 10000 });
    } catch (err) {
      console.error(`[Reconcile Error] Could not connect to Atlas at ${atlasHost}: ${err.message}`);
      process.exit(1);
    }
  }

  const db = mongoose.connection.db;
  const accountsCol = db.collection('tradingaccounts');
  const accounts = await accountsCol.find({}).toArray();

  console.log(`[Reconcile] Found ${accounts.length} trading accounts to audit and reconcile.\n`);

  for (const acc of accounts) {
    const updated = await AccountService.recalculateAccountBalances(acc._id.toString(), acc.userId.toString());
    console.log(
      `[Reconcile] ✓ Account: "${acc.name}" | Realized P&L: ₹${updated.realizedPnL.toString()} | Balance: ₹${updated.currentBalance.toString()}`
    );
  }

  console.log('\n✅ All account balances have been authoritatively reconciled against Atlas ledgers.\n');
  await mongoose.disconnect();
}

reconcile().catch((err) => {
  console.error('[Reconcile Error] Fatal error during reconciliation:', err.message);
  process.exit(1);
});

