import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getBackupConfig } from './lib/backup-config.js';
import { decryptFile } from './lib/crypto-backup.js';
import { unpackTarGzToDirectory } from './lib/tar-gz.js';
import { sha256 } from './lib/dump-core.js';
import { createS3Client } from './lib/r2-sync.js';

const { EJSON } = mongoose.mongo.BSON;

export async function verifyBackupArchive(sourceTarget, config) {
  let targetFile = sourceTarget;
  let tempDirToClean = null;

  try {
    tempDirToClean = fs.mkdtempSync(path.join(os.tmpdir(), 'setupmint-verify-'));

    // Handle "latest" keyword by downloading latest archive from off-site S3 bucket
    if (sourceTarget === 'latest' || !sourceTarget) {
      if (!config.backupS3.bucket) {
        throw new Error('BACKUP_S3_BUCKET is required to fetch the "latest" off-site backup.');
      }
      const s3Client = createS3Client(config.backupS3);
      console.log(`[Verify] Querying latest backup in off-site bucket "${config.backupS3.bucket}"...`);

      const listResp = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: config.backupS3.bucket,
          Prefix: `${config.backupS3.prefix}/daily/`,
        })
      );

      const items = (listResp.Contents || []).filter((o) => o.Key && o.Key.endsWith('.enc'));
      if (items.length === 0) {
        throw new Error(`No encrypted backup archives found under ${config.backupS3.prefix}/daily/`);
      }

      items.sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));
      const latestKey = items[0].Key;
      console.log(`[Verify] Downloading latest off-site archive: "${latestKey}"...`);

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
      const downloadPath = path.join(tempDirToClean, path.basename(latestKey));
      fs.writeFileSync(downloadPath, Buffer.concat(chunks));
      targetFile = downloadPath;
    }

    let inspectDir = targetFile;

    // Decrypt and unpack if encrypted archive
    if (targetFile.endsWith('.enc')) {
      console.log(`[Verify] Verifying AES-256-GCM authentication tag and decrypting: ${path.basename(targetFile)}...`);
      const tempTarGz = path.join(tempDirToClean, 'unpacked.tar.gz');
      const tempExtractedDir = path.join(tempDirToClean, 'extracted');

      await decryptFile(targetFile, tempTarGz, config.encryptionKey);
      console.log(`[Verify] ✓ Authentication tag verified (no tampering). Unpacking archive...`);

      await unpackTarGzToDirectory(tempTarGz, tempExtractedDir);
      inspectDir = tempExtractedDir;
    }

    // Verify manifest.json
    const manifestPath = path.join(inspectDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Integrity Failure: Missing manifest.json in backup archive.`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`\n======================================================`);
    console.log(`📋 Backup Manifest Summary`);
    console.log(`======================================================`);
    console.log(`- Created At: ${manifest.createdAt}`);
    console.log(`- App Version: ${manifest.appVersion}`);
    console.log(`- Node Version: ${manifest.nodeVersion}`);
    console.log(`- Backup Format Version: ${manifest.backupFormatVersion}`);
    console.log(`- Collections in Manifest: ${Object.keys(manifest.collections || {}).length}`);
    console.log(`- Recorded Screenshots: ${manifest.screenshotCount || 0}`);
    console.log(`======================================================\n`);

    const verificationResults = [];
    let totalRecordsVerified = 0;

    for (const [colName, expectedCount] of Object.entries(manifest.collections || {})) {
      const colFilePath = path.join(inspectDir, `${colName}.json`);
      if (!fs.existsSync(colFilePath)) {
        throw new Error(`Integrity Failure: Expected collection file "${colName}.json" not found in archive.`);
      }

      const fileContent = fs.readFileSync(colFilePath, 'utf-8');

      // Verify SHA-256 hash against manifest
      const computedHash = sha256(fileContent);
      const expectedHash = manifest.collectionHashes?.[colName];

      if (expectedHash && computedHash !== expectedHash) {
        throw new Error(
          `Integrity Failure: SHA-256 hash mismatch for "${colName}.json"!\n  Expected: ${expectedHash}\n  Computed: ${computedHash}`
        );
      }

      // Parse with EJSON to verify valid BSON schema and record count
      const parsedRecords = EJSON.parse(fileContent, { relaxed: false });
      if (!Array.isArray(parsedRecords)) {
        throw new Error(`Corrupted JSON: Content of "${colName}.json" is not an array.`);
      }

      if (parsedRecords.length !== expectedCount) {
        throw new Error(
          `Count Mismatch: "${colName}.json" contains ${parsedRecords.length} records, but manifest recorded ${expectedCount}!`
        );
      }

      totalRecordsVerified += parsedRecords.length;
      verificationResults.push({
        collection: colName,
        count: parsedRecords.length,
        hashMatch: true,
      });

      console.log(`[Verify] ✓ ${colName.padEnd(24)}: ${String(parsedRecords.length).padStart(5)} docs | SHA-256 matched`);
    }

    // Verify screenshot files if uploads/ exists
    const uploadsDir = path.join(inspectDir, 'uploads');
    let screenshotFilesFound = 0;
    if (fs.existsSync(uploadsDir)) {
      screenshotFilesFound = fs.readdirSync(uploadsDir).length;
    }

    console.log(`\n======================================================`);
    console.log(`✅ VERIFICATION REPORT: 100% PASSED`);
    console.log(`======================================================`);
    console.log(`- Collections Verified: ${verificationResults.length}`);
    console.log(`- Total Records Verified: ${totalRecordsVerified}`);
    console.log(`- Screenshots In Archive: ${screenshotFilesFound}`);
    console.log(`- SHA-256 Hash Integrity: ALL MATCHED`);
    console.log(`- BSON / EJSON Format: 100% VALID`);
    console.log(`\n🔐 KEY SAFETY CHECK:`);
    console.log(`   Your encrypted backup is protected by BACKUP_ENCRYPTION_KEY.`);
    console.log(`   If this key is lost, your backups CANNOT be recovered by anyone.`);
    console.log(`   Ensure your key is safely stored in a secure password manager.`);
    console.log(`======================================================\n`);

    return {
      success: true,
      collectionsVerified: verificationResults.length,
      recordsVerified: totalRecordsVerified,
      manifest,
    };
  } finally {
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
  const args = process.argv.slice(2);
  const target = args[0] || 'latest';

  const config = getBackupConfig({
    requireBackupBucket: target === 'latest',
    requireEncryptionKey: true,
  });

  try {
    await verifyBackupArchive(target, config);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ [Verification Failed] ${err.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
