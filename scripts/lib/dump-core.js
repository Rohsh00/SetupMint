import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { CANONICAL_COLLECTIONS, EXCLUDED_COLLECTIONS, BACKUP_FORMAT_VERSION } from './constants.js';
import { extractSafeMongoHost } from './backup-config.js';
import { syncScreenshotsIncremental, createS3Client } from './r2-sync.js';

const { EJSON } = mongoose.mongo.BSON;

/**
 * Computes SHA-256 hex digest of a string or buffer.
 */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Performs a complete, EJSON-serialized dump of all MongoDB collections and incremental screenshots.
 *
 * @param {Object} options
 * @param {string} options.targetDir - Directory to write JSON files and uploads/
 * @param {string} options.mongoUri - MongoDB connection URI
 * @param {Object} [options.s3Config] - S3 credentials for live and backup buckets
 * @param {Object|null} [options.previousManifest] - Previous backup manifest for delta comparison
 * @param {boolean} [options.dryRun=false] - If true, calculates counts without disk writes
 * @param {string} [options.cacheDir] - Local directory caching screenshot downloads
 * @param {string} [options.stateFilePath] - Path to screenshot state.json
 * @returns {Promise<Object>} The generated manifest object
 */
export async function executeDatabaseDump(options) {
  const {
    targetDir,
    mongoUri,
    liveS3Config,
    backupS3Config,
    previousManifest = null,
    dryRun = false,
    cacheDir,
    stateFilePath,
  } = options;

  if (!dryRun && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  const host = extractSafeMongoHost(mongoUri);
  console.log(`[Backup Dump] Connecting to MongoDB Atlas (${host})...`);

  let shouldDisconnect = false;
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    shouldDisconnect = true;
  }

  const db = mongoose.connection.db;

  // Discover all collections in the database
  const remoteCollections = await db.listCollections().toArray();
  const remoteNames = remoteCollections.map((c) => c.name);

  // Union of canonical collections and existing remote collections
  const allCollectionNames = Array.from(
    new Set([...CANONICAL_COLLECTIONS, ...remoteNames])
  ).filter((col) => !EXCLUDED_COLLECTIONS.includes(col));

  allCollectionNames.sort();

  const manifest = {
    createdAt: new Date().toISOString(),
    appVersion: '1.0.0',
    nodeVersion: process.version,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    atlasHost: host,
    collections: {},
    collectionHashes: {},
    screenshotCount: 0,
    screenshotTotalBytes: 0,
    previousBackup: previousManifest
      ? {
          createdAt: previousManifest.createdAt,
          tradeCount: previousManifest.collections?.trades ?? 0,
          screenshotCount: previousManifest.screenshotCount ?? 0,
        }
      : null,
  };

  console.log(`[Backup Dump] Dumping ${allCollectionNames.length} database collections (sessions excluded)...`);

  for (const colName of allCollectionNames) {
    const records = await db.collection(colName).find({}).toArray();
    manifest.collections[colName] = records.length;

    // Serialize using Extended JSON (EJSON) to preserve ObjectId, Date, and Decimal128 exactly
    const ejsonString = EJSON.stringify(records, null, 2, { relaxed: false });
    manifest.collectionHashes[colName] = sha256(ejsonString);

    if (!dryRun) {
      const colFilePath = path.join(targetDir, `${colName}.json`);
      fs.writeFileSync(colFilePath, ejsonString, { encoding: 'utf-8', mode: 0o600 });
    }
  }

  // Handle screenshots
  const attachments = await db.collection('attachments').find({}).toArray();
  const requiredKeys = attachments.map((a) => a.storedFilename).filter(Boolean);
  manifest.screenshotCount = requiredKeys.length;

  console.log(`[Backup Dump] Checking ${requiredKeys.length} screenshot attachments...`);

  if (liveS3Config && liveS3Config.bucket && liveS3Config.endpoint) {
    const liveS3Client = createS3Client(liveS3Config);
    const backupS3Client =
      backupS3Config && backupS3Config.bucket && backupS3Config.endpoint
        ? createS3Client(backupS3Config)
        : null;

    const syncResult = await syncScreenshotsIncremental({
      liveS3Client,
      backupS3Client,
      liveBucket: liveS3Config.bucket,
      livePrefix: liveS3Config.prefix,
      backupBucket: backupS3Config?.bucket,
      backupPrefix: backupS3Config?.prefix,
      requiredKeys,
      cacheDir,
      stateFilePath,
      dryRun,
    });

    manifest.screenshotTotalBytes = syncResult.totalBytes;

    if (!dryRun) {
      // Copy cached screenshots into targetDir/uploads/ for archive inclusion
      const uploadsDir = path.join(targetDir, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
      }

      if (cacheDir && fs.existsSync(cacheDir)) {
        for (const key of requiredKeys) {
          const cachedFile = path.join(cacheDir, key);
          const destFile = path.join(uploadsDir, key);
          if (fs.existsSync(cachedFile) && !fs.existsSync(destFile)) {
            fs.copyFileSync(cachedFile, destFile);
          }
        }
      }
    }
  }

  if (!dryRun) {
    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
  }

  if (shouldDisconnect) {
    await mongoose.disconnect();
  }

  return manifest;
}
