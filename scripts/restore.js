import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { extractMongoHost, validateAndFormatAtlasUri } from '../apps/api/dist/db/connection.js';
import { AccountService } from '../apps/api/dist/services/account.service.js';
import { getBackupConfig } from './lib/backup-config.js';
import { decryptFile } from './lib/crypto-backup.js';
import { unpackTarGzToDirectory } from './lib/tar-gz.js';

const { EJSON } = mongoose.mongo.BSON;

function promptConfirmation(question) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(true);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (type 'YES' to proceed): `, (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES');
    });
  });
}

function parseCliOption(args, flag) {
  const match = args.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!match) return null;
  if (match.includes('=')) return match.split('=')[1];
  const idx = args.indexOf(flag);
  return idx !== -1 && idx < args.length - 1 ? args[idx + 1] : true;
}

export async function executeRestore(options) {
  const {
    sourcePath,
    mongoUri,
    s3Config,
    encryptionKey,
    targetPrefix,
    forceDb = false,
  } = options;

  const { uri: atlasUri, host: atlasHost } = validateAndFormatAtlasUri(mongoUri);

  // Extract database name from connection URI
  const dbNameMatch = atlasUri.match(/\/([^/?#]+)(\?|$)/);
  const currentDbName = dbNameMatch ? dbNameMatch[1] : '';

  if (targetPrefix && currentDbName !== targetPrefix && !forceDb) {
    throw new Error(
      `[Target DB Safety Refusal] Database name in connection string ("${currentDbName}") does not match --target-prefix ("${targetPrefix}"). ` +
        `To override this safety protection, pass --force-db.`
    );
  }

  let restoreDir = sourcePath;
  let tempDirToClean = null;

  try {
    // If encrypted archive, decrypt and unpack into ephemeral temp directory
    if (sourcePath.endsWith('.enc')) {
      if (!encryptionKey) {
        throw new Error(
          'BACKUP_ENCRYPTION_KEY is required to restore from an encrypted .enc archive. Set it in .env or via config.'
        );
      }
      tempDirToClean = fs.mkdtempSync(path.join(os.tmpdir(), 'setupmint-restore-'));
      const tempTarGz = path.join(tempDirToClean, 'backup.tar.gz');
      const tempExtractedDir = path.join(tempDirToClean, 'extracted');

      console.log(`[Restore] Decrypting AES-256-GCM archive: ${path.basename(sourcePath)}...`);
      await decryptFile(sourcePath, tempTarGz, encryptionKey);

      console.log(`[Restore] Unpacking tar.gz archive...`);
      await unpackTarGzToDirectory(tempTarGz, tempExtractedDir);
      restoreDir = tempExtractedDir;
    }

    console.log(`[Restore] Connecting to MongoDB (${atlasHost}, db: "${currentDbName}")...`);
    let shouldDisconnect = false;
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 10000 });
      shouldDisconnect = true;
    }
    const db = mongoose.connection.db;

    const files = fs.readdirSync(restoreDir);
    let totalRestored = 0;

    for (const file of files) {
      if (file.endsWith('.json') && file !== 'manifest.json' && file !== 'state.json') {
        const colName = path.basename(file, '.json');
        const content = fs.readFileSync(path.join(restoreDir, file), 'utf-8');
        // Parse with Extended JSON (EJSON) to restore exact ObjectId, Date, and Decimal128 BSON types
        const records = EJSON.parse(content, { relaxed: false });

        if (Array.isArray(records) && records.length > 0) {
          await db.collection(colName).deleteMany({});
          await db.collection(colName).insertMany(records);
          totalRestored += records.length;
          console.log(`[Restore] ✓ Restored ${records.length} records into "${colName}"`);
        } else {
          console.log(`[Restore] - Collection "${colName}" is empty in backup (0 records).`);
        }
      }
    }

    // Restore and re-upload screenshot attachments into S3/R2 if uploads/ directory is present
    const backupUploads = path.join(restoreDir, 'uploads');
    let filesUploadedToS3 = 0;

    if (fs.existsSync(backupUploads) && s3Config && s3Config.bucket && s3Config.endpoint) {
      const s3Client = new S3Client({
        region: s3Config.region || 'auto',
        endpoint: s3Config.endpoint,
        credentials: {
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey,
        },
        forcePathStyle: true,
      });

      const uploadFiles = fs.readdirSync(backupUploads);
      console.log(`[Restore] Re-uploading ${uploadFiles.length} attachments to storage bucket "${s3Config.bucket}"...`);

      for (const f of uploadFiles) {
        const filePath = path.join(backupUploads, f);
        const ext = path.extname(f).toLowerCase();
        let mime = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        else if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.svg') mime = 'image/svg+xml';

        const fileBuffer = fs.readFileSync(filePath);
        const s3Key = s3Config.prefix ? `${s3Config.prefix}/${f}` : f;

        await s3Client.send(
          new PutObjectCommand({
            Bucket: s3Config.bucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: mime,
          })
        );
        filesUploadedToS3++;
      }
    }

    // Reconcile authoritative account balances after restore
    console.log('[Restore] Reconciling authoritative balances across all trading accounts...');
    const accounts = await db.collection('tradingaccounts').find({}).toArray();
    for (const acc of accounts) {
      await AccountService.recalculateAccountBalances(acc._id.toString(), acc.userId.toString());
    }

    if (shouldDisconnect) {
      await mongoose.disconnect();
    }

    return {
      totalRestored,
      filesUploadedToS3,
      accountsReconciled: accounts.length,
    };
  } finally {
    // Securely wipe ephemeral plaintext temporary directory
    if (tempDirToClean && fs.existsSync(tempDirToClean)) {
      try {
        fs.rmSync(tempDirToClean, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('🔄 SetupMint Cloud Restore Tool (Atlas + Cloudflare R2)');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const hasConfirmationFlag = args.includes('--yes-i-am-sure');

  if (!hasConfirmationFlag) {
    console.error(
      '❌ [Restore Aborted] Restoring replaces existing records in your database.\n' +
        'To proceed, you must explicitly pass the confirmation flag:\n\n' +
        '  npm run db:restore -- --yes-i-am-sure\n' +
        '  node scripts/restore.js <path-to-backup-dir-or-enc-file> --yes-i-am-sure\n'
    );
    process.exit(1);
  }

  const confirmed = await promptConfirmation(
    '⚠️  WARNING: This will overwrite existing trading records on your cluster. Are you sure?'
  );

  if (!confirmed) {
    console.log('[Restore] Operation cancelled by user.');
    process.exit(0);
  }

  const config = getBackupConfig({ requireBackupBucket: false, requireEncryptionKey: false });
  const backupDir = path.resolve(config.repoRoot, './backups');

  let targetBackup = args.find((a) => !a.startsWith('--'));
  if (!targetBackup) {
    if (!fs.existsSync(backupDir)) {
      console.error('[Restore Error] No backups directory found at ./backups');
      process.exit(1);
    }

    const backupEntries = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('setupmint-backup-') || f.startsWith('tradevault-backup-'))
      .sort()
      .reverse();

    if (backupEntries.length === 0) {
      console.error('[Restore Error] No backup archives found in ./backups');
      process.exit(1);
    }
    targetBackup = path.join(backupDir, backupEntries[0]);
  } else {
    targetBackup = path.resolve(targetBackup);
  }

  const targetPrefixOption = parseCliOption(args, '--target-prefix');
  const targetPrefix = typeof targetPrefixOption === 'string' ? targetPrefixOption : undefined;
  const forceDb = args.includes('--force-db');

  console.log(`[Restore] Target source: ${targetBackup}`);

  const result = await executeRestore({
    sourcePath: targetBackup,
    mongoUri: config.mongoUri,
    s3Config: config.liveS3,
    encryptionKey: config.encryptionKey,
    targetPrefix,
    forceDb,
  });

  console.log(`\n======================================================`);
  console.log(`✅ TradeVault restored successfully!`);
  console.log(`Database records restored to Atlas: ${result.totalRestored}`);
  console.log(`Trading accounts reconciled: ${result.accountsReconciled}`);
  console.log(`Chart attachments uploaded to R2: ${result.filesUploadedToS3}`);
  console.log(`======================================================\n`);
}

// Only run CLI entry point when executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error('[Restore Error]', err.message);
    process.exit(1);
  });
}
