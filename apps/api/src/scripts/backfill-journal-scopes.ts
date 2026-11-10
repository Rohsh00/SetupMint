import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { DailyJournal } from '../db/models/DailyJournal.js';
import { Trade } from '../db/models/Trade.js';

export async function runJournalScopeBackfill(isApply: boolean) {
  console.log(`\n======================================================`);
  console.log(`🚀 SetupMint — DailyJournal Scope-Aware Keys Backfill Migration`);
  console.log(`Mode: ${isApply ? 'APPLY (--yes flag detected)' : 'DRY RUN (pass --yes to apply)'}`);
  console.log(`======================================================\n`);

  const journals = await DailyJournal.find({}).lean();
  let updated = 0;
  let alreadySet = 0;

  for (const j of journals) {
    if (j.scopeKey && j.scopeKey !== 'ALL') {
      alreadySet++;
      continue;
    }

    // Attempt to link to the account of bestTradeId or worstTradeId if present
    let inferredAccountId: any = null;
    if (j.bestTradeId) {
      const trade = await Trade.findById(j.bestTradeId).select('accountId').lean();
      if (trade?.accountId) inferredAccountId = trade.accountId;
    }
    if (!inferredAccountId && j.worstTradeId) {
      const trade = await Trade.findById(j.worstTradeId).select('accountId').lean();
      if (trade?.accountId) inferredAccountId = trade.accountId;
    }

    const scopeKey = inferredAccountId ? inferredAccountId.toString() : 'ALL';
    updated++;

    console.log(
      `[Journal Backfill] Date: ${j.date} | User: ${j.userId} -> ScopeKey: ${scopeKey} (Account: ${inferredAccountId || 'ALL'})`
    );

    if (isApply) {
      await DailyJournal.updateOne(
        { _id: j._id },
        {
          $set: {
            scopeKey,
            accountId: inferredAccountId || undefined,
          },
        }
      );
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`Total Journals: ${journals.length}`);
  console.log(`Updated:        ${updated}`);
  console.log(`Already Scoped: ${alreadySet}`);
  console.log(`------------------------------------------------------\n`);
}

const isDirect = process.argv[1]?.endsWith('backfill-journal-scopes.ts') || process.argv[1]?.endsWith('backfill-journal-scopes.js');
if (isDirect) {
  const isApply = process.argv.includes('--yes') || process.argv.includes('-y');
  (async () => {
    try {
      await connectDatabase();
      await runJournalScopeBackfill(isApply);
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      console.error('Fatal migration error:', err);
      process.exit(1);
    }
  })();
}

