import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pipeline } from 'stream/promises';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { extractMongoHost, validateAndFormatAtlasUri } from '../apps/api/src/db/connection.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const BACKUP_DIR = path.resolve(process.cwd(), './backups');

async function backup() {
  console.log('\n======================================================');
  console.log('📦 SetupMint Cloud Backup Tool (Atlas + Cloudflare R2)');
  console.log('======================================================\n');

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

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(BACKUP_DIR, `tradevault-backup-${timestamp}`);
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[Backup] Connecting to Atlas MongoDB (${atlasHost})...`);
  await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const manifest = {
    timestamp: new Date().toISOString(),
    atlasHost,
    r2Bucket: s3Bucket,
    collections: {},
    filesCopied: 0,
  };

  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    if (col.name === 'sessions') continue; // Skip ephemeral sessions
    const records = await db.collection(col.name).find({}).toArray();
    const colPath = path.join(targetDir, `${col.name}.json`);
    fs.writeFileSync(colPath, JSON.stringify(records, null, 2), 'utf-8');
    manifest.collections[col.name] = records.length;
    console.log(`[Backup] Dumped ${records.length} records from collection: ${col.name}`);
  }

  // Backup uploaded screenshots directly from Cloudflare R2
  const uploadsBackupDir = path.join(targetDir, 'uploads');
  fs.mkdirSync(uploadsBackupDir, { recursive: true });

  const attachments = await db.collection('attachments').find({}).toArray();
  console.log(`[Backup] Downloading ${attachments.length} attachments from Cloudflare R2...`);

  for (const att of attachments) {
    const key = att.storedFilename;
    if (!key) continue;

    const s3Key = s3Prefix ? `${s3Prefix}/${key}` : key;
    const destPath = path.join(uploadsBackupDir, key);

    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
        })
      );
      if (response.Body) {
        await pipeline(response.Body as any, fs.createWriteStream(destPath));
        manifest.filesCopied++;
      }
    } catch (err: any) {
      console.warn(`[Backup Warning] Could not download file "${key}" from R2: ${err.message}`);
    }
  }

  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n======================================================`);
  console.log(`✅ Cloud backup successfully created at: ${targetDir}`);
  console.log(`Collections backed up: ${Object.keys(manifest.collections).length}`);
  console.log(`Attachment files backed up from R2: ${manifest.filesCopied}`);
  console.log(`Note: Atlas M0 (Free Tier) does not include automated backups.`);
  console.log(`Run 'npm run db:backup' regularly to protect your trading journal.`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

backup().catch((err) => {
  console.error('[Backup Error]', err.message);
  process.exit(1);
});
