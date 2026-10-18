import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { SetupMintSeedEngine } from '../seed/seed-engine.js';
import { SeedValidator } from '../seed/validator.js';
import { SeedDensity, SeedProfileName } from '../seed/types.js';
import { SEED_PROFILES } from '../seed/profiles.js';
import {
  AccountTransaction,
  Attachment,
  BrokerIntegration,
  DailyJournal,
  Instrument,
  Strategy,
  Trade,
  TradingAccount,
  User,
} from '../db/models/index.js';

export async function runCliSeed() {
  const args = process.argv.slice(2);

  // Parse arguments
  let profile: SeedProfileName = 'active-trader';
  let density: SeedDensity | undefined = undefined;
  let randomSeed: number = 42;
  let isResetOnly = false;
  let isValidateOnly = false;

  for (const arg of args) {
    if (arg.startsWith('--profile=')) {
      const p = arg.split('=')[1].toLowerCase() as SeedProfileName;
      if (SEED_PROFILES[p]) {
        profile = p;
      } else {
        console.warn(`Unknown profile "${p}". Valid options: ${Object.keys(SEED_PROFILES).join(', ')}`);
      }
    } else if (arg.startsWith('--density=')) {
      const d = arg.split('=')[1].toLowerCase() as SeedDensity;
      if (['minimal', 'standard', 'rich', 'analytics', 'stress'].includes(d)) {
        density = d;
      }
    } else if (arg.startsWith('--seed=')) {
      randomSeed = Number(arg.split('=')[1]) || 42;
    } else if (arg === '--reset') {
      isResetOnly = true;
    } else if (arg === '--validate') {
      isValidateOnly = true;
    }
  }

  await connectDatabase();

  if (isResetOnly) {
    console.log('[SeedCLI] Resetting demo user data only (Zero data loss for real users)...');
    const demoUser = await User.findOne({ email: 'trader@tradevault.local' });
    if (demoUser) {
      const userId = demoUser._id;
      await Trade.deleteMany({ userId });
      await TradingAccount.deleteMany({ userId });
      await AccountTransaction.deleteMany({ userId });
      await DailyJournal.deleteMany({ userId });
      await Attachment.deleteMany({ userId });
      await Instrument.deleteMany({ userId });
      await Strategy.deleteMany({ userId });
      await BrokerIntegration.deleteMany({ userId });
      console.log('✅ Demo data successfully wiped! Real users were untouched.');
    } else {
      console.log('No demo user found.');
    }
    await disconnectDatabase();
    return;
  }

  if (isValidateOnly) {
    console.log('[SeedCLI] Validating existing demo dataset...');
    const report = await SeedValidator.validate('trader@tradevault.local');
    console.log(`\n================ Validation Results ================`);
    console.log(`Status: ${report.isValid ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`Checks: ${report.passedChecks}/${report.totalChecks} passed`);
    for (const c of report.checks) {
      console.log(` [${c.passed ? '✓' : '✗'}] ${c.name}: ${c.details || ''}`);
    }
    if (report.errors.length > 0) {
      console.log('\nErrors encountered:');
      for (const err of report.errors) console.log(` - ${err}`);
    }
    console.log(`====================================================\n`);
    await disconnectDatabase();
    return;
  }

  // Execute Seed Engine
  const result = await SetupMintSeedEngine.run({
    profile,
    density,
    randomSeed,
  });

  // Automatically validate result
  const valReport = await SeedValidator.validate(result.userEmail);
  console.log(`Integrity Validation: ${valReport.isValid ? 'ALL CHECKS PASSED ✅' : 'SOME CHECKS FAILED ❌'}`);
  for (const c of valReport.checks) {
    console.log(` - ${c.name}: ${c.passed ? 'PASSED' : 'FAILED'}`);
  }

  await disconnectDatabase();
}

if (process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed.js')) {
  runCliSeed().catch((err) => {
    console.error('Fatal seed CLI error:', err);
    process.exit(1);
  });
}
