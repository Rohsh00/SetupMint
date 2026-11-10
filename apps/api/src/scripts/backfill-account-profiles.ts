import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { TradingAccount, buildDefaultAccountProfile } from '../db/models/TradingAccount.js';

interface MigrationStats {
  total: number;
  updated: number;
  alreadyComplete: number;
  errors: number;
}

export async function runAccountProfileBackfill(isApply: boolean): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    alreadyComplete: 0,
    errors: 0,
  };

  console.log(`\n======================================================`);
  console.log(`🚀 SetupMint — Account Profile Idempotent Backfill Migration`);
  console.log(`Mode: ${isApply ? 'APPLY (--yes flag detected)' : 'DRY RUN (pass --yes to persist changes)'}`);
  console.log(`======================================================\n`);

  const accounts = await TradingAccount.find({}).lean();
  stats.total = accounts.length;

  for (const acc of accounts) {
    try {
      const existingProfile = acc.profile as any;
      const hasCompleteProfile =
        existingProfile &&
        existingProfile.marketRegion &&
        existingProfile.baseCurrency &&
        existingProfile.timezone &&
        existingProfile.feeModelKey &&
        existingProfile.executionAdapterKey &&
        existingProfile.positionModel &&
        existingProfile.sessionCalendarKey &&
        existingProfile.capabilities;

      if (hasCompleteProfile) {
        stats.alreadyComplete++;
        continue;
      }

      const generatedProfile = buildDefaultAccountProfile(acc);
      stats.updated++;

      console.log(
        `[Backfill] Account "${acc.name}" (${acc._id}) -> Profile: ${generatedProfile.marketRegion} | ${generatedProfile.baseCurrency} | ${generatedProfile.timezone} | Adapter: ${generatedProfile.executionAdapterKey}`
      );

      if (isApply) {
        await TradingAccount.updateOne(
          { _id: acc._id },
          {
            $set: {
              profile: generatedProfile,
              baseCurrency: generatedProfile.baseCurrency,
            },
          }
        );
      }
    } catch (err: any) {
      stats.errors++;
      console.error(`[Backfill Error] Account ${acc._id}:`, err?.message || err);
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`Backfill Summary:`);
  console.log(`Total accounts scanned:   ${stats.total}`);
  console.log(`Profiles updated:         ${stats.updated} ${isApply ? '(persisted)' : '(dry-run simulated)'}`);
  console.log(`Already complete:         ${stats.alreadyComplete}`);
  console.log(`Errors:                   ${stats.errors}`);
  console.log(`------------------------------------------------------\n`);

  return stats;
}

// Direct script execution
const isDirectRun = process.argv[1]?.endsWith('backfill-account-profiles.ts') || process.argv[1]?.endsWith('backfill-account-profiles.js');

if (isDirectRun) {
  const isApply = process.argv.includes('--yes') || process.argv.includes('-y');
  (async () => {
    try {
      await connectDatabase();
      await runAccountProfileBackfill(isApply);
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    }
  })();
}

