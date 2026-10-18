import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { SeedValidator } from '../seed/validator.js';

export async function validateDemoData() {
  await connectDatabase();
  console.log('[ValidateDemo] Running authoritative integrity audit...');
  const report = await SeedValidator.validate('trader@tradevault.local');

  console.log(`\n================ Seed Validation Audit Report ================`);
  console.log(`Overall Status: ${report.isValid ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Audited Checks: ${report.passedChecks}/${report.totalChecks} Passed\n`);

  for (const c of report.checks) {
    const symbol = c.passed ? '✓' : '✗';
    console.log(` [${symbol}] ${c.name}`);
    if (c.details) console.log(`     ${c.details}`);
  }

  if (report.errors.length > 0) {
    console.log('\nAudit Discrepancies:');
    for (const err of report.errors) {
      console.log(`  ❌ ${err}`);
    }
  }
  console.log(`==============================================================\n`);

  await disconnectDatabase();

  if (!report.isValid) {
    process.exit(1);
  }
}

if (process.argv[1]?.includes('validate-seed.ts') || process.argv[1]?.includes('validate-seed.js')) {
  validateDemoData().catch((err) => {
    console.error('Validation script error:', err);
    process.exit(1);
  });
}
