import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import {
  AccountTransaction,
  BrokerImportMapping,
  BrokerIntegration,
  TradingAccount,
} from '../db/models/index.js';
import { AccountService } from '../services/account.service.js';
import { encryptSecret, isEncryptedSecret } from '../services/crypto.service.js';

const LEGACY_MAPPING_INDEX = 'userId_1_broker_1';

function isLegacyMappingIndex(index: { name?: string; key: Record<string, unknown> }): boolean {
  if (index.name === LEGACY_MAPPING_INDEX) return true;
  return (
    Object.keys(index.key).length === 2 &&
    index.key.userId === 1 &&
    index.key.broker === 1
  );
}

export async function runBackfill(options?: { isLive?: boolean; skipConnect?: boolean }) {
  const isLive = options?.isLive ?? process.argv.includes('--yes');

  console.log('========================================================');
  console.log(' SetupMint Account & Broker Data Backfill Migration     ');
  console.log('========================================================');
  if (!isLive) {
    console.log('\n[DRY RUN MODE] No changes will be written to the database.');
    console.log('To execute this backfill, re-run with --yes:');
    console.log('  npm run accounts:backfill -- --yes\n');
    console.log('REMINDER: Run npm run db:backup first before executing migrations.\n');
  } else {
    console.log('\n[LIVE EXECUTION MODE] Applying changes to database.\n');
  }

  if (!options?.skipConnect) {
    await connectDatabase();
  }

  try {
    const mappingIndexes = await BrokerImportMapping.collection.indexes();
    const legacyMappingIndex = mappingIndexes.find(isLegacyMappingIndex);
    const hasLegacyMappingIndex = Boolean(legacyMappingIndex);

    if (legacyMappingIndex) {
      console.log(`  [DROP LEGACY INDEX] BrokerImportMapping.${legacyMappingIndex.name}`);
      if (isLive) {
        await BrokerImportMapping.collection.dropIndex(legacyMappingIndex.name as string);
      }
    } else {
      console.log('  [SKIP] Legacy BrokerImportMapping index already removed.');
    }

    const mappingFilter = {
      $or: [
        { importKind: { $exists: false } },
        { importKind: null },
      ],
    };
    const mappingsToUpdate = await BrokerImportMapping.countDocuments(mappingFilter);
    console.log(`  [BACKFILL MAPPINGS] ${mappingsToUpdate} mapping(s) missing importKind.`);
    if (isLive && mappingsToUpdate > 0) {
      await BrokerImportMapping.updateMany(mappingFilter, {
        $set: { importKind: 'TRADES' },
      });
    }

    if (isLive) {
      await BrokerImportMapping.syncIndexes();
      await AccountTransaction.syncIndexes();
      await TradingAccount.syncIndexes();
    }

    const transactionFilter = {
      $or: [
        { status: { $exists: false } },
        { status: null },
        { source: { $exists: false } },
        { source: null },
      ],
    };
    const transactionsToUpdate = await AccountTransaction.countDocuments(transactionFilter);
    console.log(
      `  [BACKFILL TRANSACTIONS] ${transactionsToUpdate} transaction(s) missing source/status.`
    );
    if (isLive && transactionsToUpdate > 0) {
      await AccountTransaction.updateMany(
        { $or: [{ status: { $exists: false } }, { status: null }] },
        { $set: { status: 'CONFIRMED' } }
      );
      await AccountTransaction.updateMany(
        { $or: [{ source: { $exists: false } }, { source: null }] },
        { $set: { source: 'MANUAL' } }
      );
    }

    const integrations = await BrokerIntegration.find({
      $or: [
        { secretKey: { $exists: true, $ne: null } },
        { accessToken: { $exists: true, $ne: null } },
        { refreshToken: { $exists: true, $ne: null } },
      ],
    });
    let secretsEncrypted = 0;
    for (const integration of integrations) {
      const updates: Record<string, string | null> = {};
      if (integration.secretKey && !isEncryptedSecret(integration.secretKey)) {
        updates.secretKey = encryptSecret(integration.secretKey);
      }
      if (integration.accessToken && !isEncryptedSecret(integration.accessToken)) {
        updates.accessToken = encryptSecret(integration.accessToken);
      }
      if (integration.refreshToken && !isEncryptedSecret(integration.refreshToken)) {
        updates.refreshToken = encryptSecret(integration.refreshToken);
      }
      if (Object.keys(updates).length === 0) continue;

      secretsEncrypted++;
      if (isLive) {
        await BrokerIntegration.updateOne({ _id: integration._id }, { $set: updates });
      }
    }
    console.log(
      `  [ENCRYPT SECRETS] ${secretsEncrypted} broker integration(s) contain legacy plaintext secrets.`
    );

    const accounts = await TradingAccount.find({}).select('_id userId name');
    console.log(`  [RECALCULATE ACCOUNTS] ${accounts.length} account(s).`);
    let recalculated = 0;
    for (const account of accounts) {
      if (isLive) {
        const summary = await AccountService.recalculateAccountBalances(
          account._id,
          account.userId
        );
        if (summary) recalculated++;
      }
    }

    console.log('\n========================================================');
    console.log('                 Backfill Summary                       ');
    console.log('========================================================');
    console.log(`Mode:                          ${isLive ? 'LIVE APPLIED' : 'DRY RUN (Simulated)'}`);
    console.log(`Legacy Index Dropped:          ${hasLegacyMappingIndex ? 'YES' : 'NO'}`);
    console.log(`Mappings Backfilled:           ${mappingsToUpdate}`);
    console.log(`Transactions Backfilled:       ${transactionsToUpdate}`);
    console.log(`Broker Secrets Encrypted:      ${secretsEncrypted}`);
    console.log(`Accounts Recalculated:         ${isLive ? recalculated : accounts.length}`);
    console.log('========================================================\n');

    return {
      mode: isLive ? 'LIVE' : 'DRY_RUN',
      legacyIndexDropped: hasLegacyMappingIndex,
      mappingsBackfilled: mappingsToUpdate,
      transactionsBackfilled: transactionsToUpdate,
      brokerSecretsEncrypted: secretsEncrypted,
      accountsRecalculated: isLive ? recalculated : accounts.length,
    };
  } finally {
    if (!options?.skipConnect) {
      await disconnectDatabase();
    }
  }
}

if (
  process.argv[1]?.includes('backfill-account-transactions.ts') ||
  process.argv[1]?.includes('backfill-account-transactions.js')
) {
  runBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}
