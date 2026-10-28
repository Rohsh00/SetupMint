import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getBackupConfig } from './lib/backup-config.js';
import { acquireLock, releaseLock } from './lib/lockfile.js';
import { executeDatabaseDump } from './lib/dump-core.js';
import { packDirectoryToTarGz } from './lib/tar-gz.js';
import { encryptFile } from './lib/crypto-backup.js';
import { detectAnomalies } from './lib/anomaly.js';
import { calculateRetentionDeletions } from './lib/retention.js';
import { createS3Client } from './lib/r2-sync.js';
import { notifyBackupEvent } from './lib/notify.js';

async function runScheduledBackup() {
  const startTime = Date.now();
  console.log('\n======================================================');
  console.log('🛡️  SetupMint Unattended Scheduled Cloud Backup');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const checkCatchup = args.includes('--check-catchup');

  if (dryRun) {
    console.log('🔍 [DRY-RUN MODE] Dry run enabled. No cloud uploads or deletions will occur.\n');
  }

  const config = getBackupConfig({
    requireBackupBucket: !dryRun,
    requireEncryptionKey: !dryRun,
  });

  const backupDir = path.resolve(config.repoRoot, './backups');
  const logDir = path.resolve(backupDir, 'logs');
  const lockFilePath = path.resolve(backupDir, '.backup.lock');
  const statusFilePath = path.resolve(backupDir, 'status.json');
  const cacheDir = path.resolve(backupDir, '.cache/uploads');
  const stateFilePath = path.resolve(backupDir, '.cache/state.json');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  // 1. Catch-up check for macOS wake / login triggers
  if (checkCatchup && fs.existsSync(statusFilePath)) {
    try {
      const prevStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf-8'));
      if (prevStatus.lastSuccessAt) {
        const hoursAgo = (Date.now() - new Date(prevStatus.lastSuccessAt).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 26) {
          console.log(`[Catch-Up Check] Last successful backup was ${hoursAgo.toFixed(1)}h ago (< 26h). Catch-up skipped.`);
          process.exit(0);
        }
      }
    } catch {
      // Proceed if unreadable
    }
  }

  // 2. Acquire lock file
  console.log('[Pipeline] Acquiring backup lock...');
  acquireLock(lockFilePath);

  let tempDumpDir = null;
  let tempTarGzPath = null;
  let tempEncPath = null;
  let result = 'FAILED';
  let uploadedKey = null;
  let uploadedSizeBytes = 0;
  let manifest = null;
  let errorMessage = null;

  try {
    // 3. Read previous status or manifest for anomaly baseline
    let previousManifest = null;
    if (fs.existsSync(statusFilePath)) {
      try {
        const prevStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf-8'));
        if (prevStatus.counts) {
          previousManifest = { collections: prevStatus.counts, createdAt: prevStatus.lastRunAt };
        }
      } catch {
        // Ignored
      }
    }

    // 4. Create ephemeral temporary directory with mode 0700
    tempDumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setupmint-dump-'));
    fs.chmodSync(tempDumpDir, 0o700);

    // 5. Execute database dump & incremental screenshot sync
    manifest = await executeDatabaseDump({
      targetDir: tempDumpDir,
      mongoUri: config.mongoUri,
      liveS3Config: config.liveS3,
      backupS3Config: config.backupS3.bucket ? config.backupS3 : null,
      previousManifest,
      dryRun,
      cacheDir,
      stateFilePath,
    });

    // 6. Run anomaly detection check
    const anomaly = detectAnomalies(manifest, previousManifest, config.maxDropPercent);
    if (anomaly.isSuspicious) {
      result = 'SUSPICIOUS';
      errorMessage = anomaly.reasons.join(' | ');
      console.warn(`\n⚠️  [ANOMALY DETECTED] Suspicious data drop detected:\n - ${anomaly.reasons.join('\n - ')}`);
      console.warn(`Archive will be segregated under "suspicious/" prefix to protect good backups.\n`);
    } else {
      result = 'OK';
      console.log('[Pipeline] ✓ Anomaly check passed. Record counts consistent with previous backup.');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseArchiveName = `setupmint-backup-${timestamp}`;

    if (!dryRun) {
      // 7. Package dump into .tar.gz
      tempTarGzPath = path.join(os.tmpdir(), `${baseArchiveName}.tar.gz`);
      console.log('[Pipeline] Packaging database dump and screenshots into .tar.gz...');
      await packDirectoryToTarGz(tempDumpDir, tempTarGzPath);

      // 8. Encrypt with AES-256-GCM
      tempEncPath = path.join(os.tmpdir(), `${baseArchiveName}.tar.gz.enc`);
      console.log('[Pipeline] Encrypting archive with AES-256-GCM (scrypt key derivation)...');
      await encryptFile(tempTarGzPath, tempEncPath, config.encryptionKey);

      uploadedSizeBytes = fs.statSync(tempEncPath).size;
      const backupS3Client = createS3Client(config.backupS3);

      // Determine off-site upload key
      const folderPrefix = result === 'SUSPICIOUS' ? 'suspicious' : 'daily';
      uploadedKey = `${config.backupS3.prefix}/${folderPrefix}/${baseArchiveName}.tar.gz.enc`;

      console.log(`[Pipeline] Uploading encrypted backup to off-site bucket: "${config.backupS3.bucket}"...`);
      const encBuffer = fs.readFileSync(tempEncPath);

      await backupS3Client.send(
        new PutObjectCommand({
          Bucket: config.backupS3.bucket,
          Key: uploadedKey,
          Body: encBuffer,
          ContentType: 'application/octet-stream',
          Metadata: {
            'app-version': manifest.appVersion,
            'backup-format': String(manifest.backupFormatVersion),
            'record-count': String(Object.values(manifest.collections).reduce((a, b) => a + b, 0)),
          },
        })
      );

      // On the 1st of the month, ALSO upload under monthly/ if not suspicious
      const isFirstOfMonth = new Date().getDate() === 1;
      if (isFirstOfMonth && result === 'OK') {
        const monthlyKey = `${config.backupS3.prefix}/monthly/${baseArchiveName}.tar.gz.enc`;
        console.log(`[Pipeline] First of the month detected. Also copying to monthly/ archive: ${monthlyKey}`);
        await backupS3Client.send(
          new PutObjectCommand({
            Bucket: config.backupS3.bucket,
            Key: monthlyKey,
            Body: encBuffer,
            ContentType: 'application/octet-stream',
          })
        );
      }

      // 9. Verify upload (HEAD object + size match)
      console.log('[Pipeline] Verifying uploaded backup object in off-site bucket...');
      const headResp = await backupS3Client.send(
        new HeadObjectCommand({
          Bucket: config.backupS3.bucket,
          Key: uploadedKey,
        })
      );

      if (!headResp.ContentLength || headResp.ContentLength !== uploadedSizeBytes) {
        throw new Error(
          `Upload verification failed! Remote size (${headResp.ContentLength}B) does not match local encrypted size (${uploadedSizeBytes}B).`
        );
      }
      console.log(`[Pipeline] ✓ Upload verified successfully: ${uploadedSizeBytes} bytes.`);

      // 10. Apply retention policy (ONLY if result is OK; never delete anything on SUSPICIOUS or FAILED)
      if (result === 'OK') {
        console.log('[Pipeline] Evaluating off-site retention policy (30 daily + 12 monthly)...');
        const listDaily = await backupS3Client.send(
          new ListObjectsV2Command({
            Bucket: config.backupS3.bucket,
            Prefix: `${config.backupS3.prefix}/daily/`,
          })
        );
        const listMonthly = await backupS3Client.send(
          new ListObjectsV2Command({
            Bucket: config.backupS3.bucket,
            Prefix: `${config.backupS3.prefix}/monthly/`,
          })
        );

        const dailyKeys = (listDaily.Contents || []).map((o) => o.Key).filter(Boolean);
        const monthlyKeys = (listMonthly.Contents || []).map((o) => o.Key).filter(Boolean);

        const retention = calculateRetentionDeletions({
          dailyKeys,
          monthlyKeys,
          retainDaily: config.retainDaily,
          retainMonthly: config.retainMonthly,
          minKeep: 3,
        });

        if (retention.allDeleteKeys.length > 0) {
          console.log(`[Pipeline] Pruning ${retention.allDeleteKeys.length} expired backups past retention limit...`);
          for (const key of retention.allDeleteKeys) {
            await backupS3Client.send(
              new DeleteObjectCommand({
                Bucket: config.backupS3.bucket,
                Key: key,
              })
            );
            console.log(`[Pipeline] - Pruned: ${key}`);
          }
        } else {
          console.log(`[Pipeline] ✓ Retention verified: ${dailyKeys.length} daily, ${monthlyKeys.length} monthly. 0 expired.`);
        }
      }
    } else {
      console.log('[Pipeline] Dry run completed. Skipping packaging, encryption, upload, and retention.');
      uploadedKey = `${config.backupS3.prefix}/daily/${baseArchiveName}.tar.gz.enc (dry-run)`;
    }
  } catch (err) {
    result = 'FAILED';
    errorMessage = err.message;
    console.error(`\n❌ [Pipeline Error] Backup failed: ${err.message}\n`);
  } finally {
    const durationMs = Date.now() - startTime;

    // 11. Write status record to backups/status.json
    let prevSuccessAt = null;
    if (fs.existsSync(statusFilePath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(statusFilePath, 'utf-8'));
        prevSuccessAt = prev.lastSuccessAt || null;
      } catch {
        // Ignored
      }
    }

    const statusRecord = {
      lastRunAt: new Date().toISOString(),
      lastSuccessAt: result === 'OK' ? new Date().toISOString() : prevSuccessAt,
      result,
      durationMs,
      counts: manifest?.collections || {},
      screenshotCount: manifest?.screenshotCount || 0,
      uploadedKey,
      sizeBytes: uploadedSizeBytes,
      error: errorMessage || undefined,
    };

    if (!dryRun) {
      fs.writeFileSync(statusFilePath, JSON.stringify(statusRecord, null, 2), { mode: 0o600 });

      // Mirror status record to off-site bucket: status/latest.json
      if (config.backupS3.bucket && config.backupS3.endpoint) {
        try {
          const backupS3Client = createS3Client(config.backupS3);
          const statusKey = `${config.backupS3.prefix}/status/latest.json`;
          await backupS3Client.send(
            new PutObjectCommand({
              Bucket: config.backupS3.bucket,
              Key: statusKey,
              Body: JSON.stringify(statusRecord, null, 2),
              ContentType: 'application/json',
            })
          );
        } catch (err) {
          console.warn(`[Pipeline Warning] Could not mirror status to off-site bucket: ${err.message}`);
        }
      }
    }

    // 12. Dispatch notification & log
    await notifyBackupEvent({
      logDir,
      result,
      uploadedKey,
      error: errorMessage,
      durationMs,
      counts: manifest?.collections,
      telegram: config.telegram,
    });

    // 13. Securely clean up ephemeral plaintext files
    if (tempDumpDir && fs.existsSync(tempDumpDir)) {
      try {
        fs.rmSync(tempDumpDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
    if (tempTarGzPath && fs.existsSync(tempTarGzPath)) {
      try {
        fs.unlinkSync(tempTarGzPath);
      } catch {
        // Ignored
      }
    }
    if (tempEncPath && fs.existsSync(tempEncPath)) {
      try {
        fs.unlinkSync(tempEncPath);
      } catch {
        // Ignored
      }
    }

    // 14. Release lock file
    releaseLock(lockFilePath);
  }

  console.log(`\n======================================================`);
  if (result === 'OK') {
    console.log(`🎉 Backup completed successfully in ${(Date.now() - startTime) / 1000}s!`);
    console.log(`Result: OK | Key: ${uploadedKey}`);
    process.exit(0);
  } else if (result === 'SUSPICIOUS') {
    console.warn(`⚠️  Backup flagged as SUSPICIOUS! Exiting with non-zero code.`);
    console.warn(`Details: ${errorMessage}`);
    process.exit(2);
  } else {
    console.error(`💥 Backup FAILED!`);
    console.error(`Error: ${errorMessage}`);
    process.exit(1);
  }
}

// Only run CLI when executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runScheduledBackup();
}
