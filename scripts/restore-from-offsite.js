import fs from 'fs';
import path from 'path';
import os from 'os';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getBackupConfig } from './lib/backup-config.js';
import { createS3Client } from './lib/r2-sync.js';
import { executeRestore } from './restore.js';

async function main() {
  const config = getBackupConfig({ requireBackupBucket: true, requireEncryptionKey: true });
  const s3Client = createS3Client(config.backupS3);

  console.log(`[Offsite Restore] Querying latest backup from "${config.backupS3.bucket}"...`);
  const listResp = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: config.backupS3.bucket,
      Prefix: `${config.backupS3.prefix}/daily/`,
    })
  );

  const items = (listResp.Contents || []).filter((o) => o.Key && o.Key.endsWith('.enc'));
  if (items.length === 0) {
    throw new Error(`No encrypted archives found in ${config.backupS3.prefix}/daily/`);
  }

  items.sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));
  const latestKey = items[0].Key;
  console.log(`[Offsite Restore] Downloading "${latestKey}"...`);

  const backupDir = path.resolve(config.repoRoot, './backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const localFile = path.join(backupDir, path.basename(latestKey));
  const downloadResp = await s3Client.send(
    new GetObjectCommand({
      Bucket: config.backupS3.bucket,
      Key: latestKey,
    })
  );

  const chunks = [];
  for await (const chunk of downloadResp.Body) {
    chunks.push(chunk);
  }
  fs.writeFileSync(localFile, Buffer.concat(chunks));
  console.log(`[Offsite Restore] Saved to ${localFile} (${fs.statSync(localFile).size} bytes).`);

  console.log(`[Offsite Restore] Executing restore to Atlas MongoDB...`);
  const result = await executeRestore({
    sourcePath: localFile,
    mongoUri: config.mongoUri,
    s3Config: config.liveS3,
    encryptionKey: config.encryptionKey,
    forceDb: true,
  });

  console.log('\n======================================================');
  console.log('✅ Offsite Restore Complete!');
  console.log(`Total records restored to Atlas: ${result.totalRestored}`);
  console.log(`Accounts reconciled: ${result.accountsReconciled}`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[Offsite Restore Error]', err);
  process.exit(1);
});
