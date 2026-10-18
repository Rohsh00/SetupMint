import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import readline from 'readline';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { extractMongoHost, validateAndFormatAtlasUri } from '../apps/api/src/db/connection.js';
import { AccountService } from '../apps/api/src/services/account.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const BACKUP_DIR = path.resolve(process.cwd(), './backups');

function promptConfirmation(question: string): Promise<boolean> {
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

async function restore() {
  console.log('\n======================================================');
  console.log('🔄 SetupMint Cloud Restore Tool (Atlas + Cloudflare R2)');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const hasConfirmationFlag = args.includes('--yes-i-am-sure');

  if (!hasConfirmationFlag) {
    console.error(
      '❌ [Restore Aborted] Restoring replaces records in your Atlas database.\n' +
        'To proceed, you must explicitly pass the confirmation flag:\n\n' +
        '  npm run db:restore -- --yes-i-am-sure\n' +
        '  node scripts/restore.js <path-to-backup> --yes-i-am-sure\n'
    );
    process.exit(1);
  }

  const confirmed = await promptConfirmation(
    '⚠️  WARNING: This will overwrite existing trading records on your Atlas cluster. Are you sure?'
  );

  if (!confirmed) {
    console.log('[Restore] Operation cancelled by user.');
    process.exit(0);
  }

  // Find latest backup folder or specified argument
  let targetBackup = args.find((a) => !a.startsWith('--'));
  if (!targetBackup) {
    if (!fs.existsSync(BACKUP_DIR)) {
      console.error('[Restore Error] No backups directory found at ./backups');
      process.exit(1);
    }

    const backupFolders = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('tradevault-backup-'))
      .sort()
      .reverse();

    if (backupFolders.length === 0) {
      console.error('[Restore Error] No backup archives found in ./backups');
      process.exit(1);
    }
    targetBackup = path.join(BACKUP_DIR, backupFolders[0]);
  } else {
    targetBackup = path.resolve(targetBackup);
  }

  console.log(`[Restore] Restoring from backup folder: ${targetBackup}`);

  const rawUri = process.env.MONGODB_URI;
  const { uri: atlasUri, host: atlasHost } = validateAndFormatAtlasUri(rawUri);

  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3Bucket = process.env.S3_BUCKET;
  const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
  const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const s3Region = process.env.S3_REGION || 'auto';
  const s3Prefix = process.env.S3_PREFIX ? process.env.S3_PREFIX.replace(/^\/+|\/+$/g, '') : '';

  if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
    throw new Error('Cloudflare R2 configuration missing. Ensure S3_* variables are set in .env.');
  }

  const s3Client = new S3Client({
    region: s3Region,
    endpoint: s3Endpoint,
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    },
    forcePathStyle: true,
  });

  console.log(`[Restore] Connecting to Atlas MongoDB (${atlasHost})...`);
  await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const files = fs.readdirSync(targetBackup);
  let totalRestored = 0;

  for (const file of files) {
    if (file.endsWith('.json') && file !== 'manifest.json') {
      const colName = path.basename(file, '.json');
      const content = fs.readFileSync(path.join(targetBackup, file), 'utf-8');
      const records = JSON.parse(content);

      if (records.length > 0) {
        // Clear collection before restoring
        await db.collection(colName).deleteMany({});
        await db.collection(colName).insertMany(records);
        totalRestored += records.length;
        console.log(`[Restore] Restored ${records.length} records into ${colName}`);
      }
    }
  }

  // Restore and re-upload attachments into Cloudflare R2
  const backupUploads = path.join(targetBackup, 'uploads');
  let filesUploadedToR2 = 0;

  if (fs.existsSync(backupUploads)) {
    const uploadFiles = fs.readdirSync(backupUploads);
    console.log(`[Restore] Re-uploading ${uploadFiles.length} attachments to Cloudflare R2 (${s3Bucket})...`);

    for (const f of uploadFiles) {
      const filePath = path.join(backupUploads, f);
      const ext = path.extname(f).toLowerCase();
      let mime = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      else if (ext === '.webp') mime = 'image/webp';
      else if (ext === '.svg') mime = 'image/svg+xml';

      const fileBuffer = fs.readFileSync(filePath);
      const s3Key = s3Prefix ? `${s3Prefix}/${f}` : f;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: mime,
        })
      );
      filesUploadedToR2++;
    }
  }

  // Reconcile account balances after restore
  console.log('[Restore] Reconciling authoritative balances across all trading accounts...');
  const accounts = await db.collection('tradingaccounts').find({}).toArray();
  for (const acc of accounts) {
    await AccountService.recalculateAccountBalances(acc._id.toString(), acc.userId.toString());
  }

  console.log(`\n======================================================`);
  console.log(`✅ TradeVault restored successfully!`);
  console.log(`Database records restored to Atlas: ${totalRestored}`);
  console.log(`Chart attachments uploaded to R2: ${filesUploadedToR2}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

restore().catch((err) => {
  console.error('[Restore Error]', err.message);
  process.exit(1);
});
