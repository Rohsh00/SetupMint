import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

/**
 * Probes the remote S3 endpoint's HTTP Date header to compute clock offset (ms)
 * between the remote server and local system clock. Prevents RequestTimeTooSkewed
 * errors after macOS sleep/wake cycles or local NTP drift.
 */
export async function resolveClockOffsetMs(endpoint) {
  if (!endpoint) return 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    const dateHeader = res.headers?.get?.('date');
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      if (!Number.isNaN(serverMs)) {
        const diff = serverMs - Date.now();
        // Only apply offset if difference exceeds 5 seconds
        return Math.abs(diff) > 5000 ? diff : 0;
      }
    }
  } catch {
    // Fallback to 0 offset if offline or unreachable
  }
  return 0;
}

/**
 * Creates an S3Client instance from config.
 */
export function createS3Client(s3Config, systemClockOffset = 0) {
  return new S3Client({
    region: s3Config.region || 'auto',
    endpoint: s3Config.endpoint,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
    forcePathStyle: true,
    maxAttempts: 3,
    ...(systemClockOffset ? { systemClockOffset } : {}),
  });
}

/**
 * Loads the screenshot sync state manifest.
 */
export function loadScreenshotState(stateFilePath) {
  try {
    if (fs.existsSync(stateFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      return {
        copiedKeys: parsed.copiedKeys || {},
        deletedKeys: parsed.deletedKeys || {},
        missingKeys: parsed.missingKeys || {},
        lastSyncAt: parsed.lastSyncAt || null,
      };
    }
  } catch {
    // Ignored
  }
  return {
    copiedKeys: {}, // key -> { copiedAt, sizeBytes }
    deletedKeys: {}, // key -> { deletedAt }
    missingKeys: {}, // key -> { lastAttemptAt }
    lastSyncAt: null,
  };
}

/**
 * Saves screenshot sync state manifest.
 */
export function saveScreenshotState(stateFilePath, state) {
  const dir = path.dirname(stateFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Incrementally syncs screenshot attachments:
 * 1. Queries required attachment filenames from DB or live bucket listing.
 * 2. Compares against state of already-copied keys.
 * 3. Copies ONLY new keys from live bucket to backup bucket (preferring S3 server-side CopyObject).
 * 4. Also maintains local cache in cacheDir for archive packaging without re-downloading.
 */
export async function syncScreenshotsIncremental(options) {
  const {
    liveS3Client,
    backupS3Client,
    liveBucket,
    livePrefix = '',
    backupBucket,
    backupPrefix = 'setupmint-backups',
    requiredKeys = [], // string[] of storedFilename from attachments
    cacheDir,
    stateFilePath,
    dryRun = false,
  } = options;

  if (cacheDir && !fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  }

  const state = stateFilePath ? loadScreenshotState(stateFilePath) : { copiedKeys: {}, deletedKeys: {}, missingKeys: {} };
  let newCopiedCount = 0;
  let totalBytes = 0;
  let skippedCount = 0;

  const currentLiveKeySet = new Set(requiredKeys);

  // Detect keys deleted in live DB
  for (const knownKey of Object.keys(state.copiedKeys)) {
    if (!currentLiveKeySet.has(knownKey) && !state.deletedKeys[knownKey]) {
      state.deletedKeys[knownKey] = { detectedDeletedAt: new Date().toISOString() };
    }
  }

  for (const key of requiredKeys) {
    if (!key) continue;

    const liveS3Key = livePrefix ? `${livePrefix}/${key}` : key;
    const backupS3Key = `${backupPrefix}/screenshots/${key}`;
    const localCachedPath = cacheDir ? path.join(cacheDir, key) : null;

    const alreadyInBackup = Boolean(state.copiedKeys[key]);
    const alreadyInLocalCache = localCachedPath && fs.existsSync(localCachedPath);
    const isKnownMissing = Boolean(state.missingKeys?.[key]);

    if (alreadyInBackup && alreadyInLocalCache) {
      skippedCount++;
      const cachedSize = fs.statSync(localCachedPath).size;
      totalBytes += cachedSize;
      continue;
    }

    if (isKnownMissing && !alreadyInLocalCache) {
      skippedCount++;
      continue;
    }

    if (dryRun) {
      newCopiedCount++;
      continue;
    }

    // 1. Copy to backup bucket if not already copied
    if (!alreadyInBackup && backupBucket && backupS3Client) {
      let copySuccess = false;

      // Try server-side CopyObject first (fast, zero network bandwidth)
      try {
        await backupS3Client.send(
          new CopyObjectCommand({
            Bucket: backupBucket,
            Key: backupS3Key,
            CopySource: `${liveBucket}/${liveS3Key}`,
          })
        );
        copySuccess = true;
      } catch (err) {
        // Fallback: Stream download and upload
      }

      if (!copySuccess && liveS3Client) {
        try {
          const getResp = await liveS3Client.send(
            new GetObjectCommand({
              Bucket: liveBucket,
              Key: liveS3Key,
            })
          );
          if (getResp.Body) {
            const chunks = [];
            for await (const chunk of getResp.Body) {
              chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            await backupS3Client.send(
              new PutObjectCommand({
                Bucket: backupBucket,
                Key: backupS3Key,
                Body: buf,
                ContentType: getResp.ContentType || 'image/png',
              })
            );
            copySuccess = true;
          }
        } catch (err) {
          console.warn(`[Screenshot Sync Warning] Could not copy file "${key}" to backup bucket: ${err.message}`);
          if (
            err.name === 'NoSuchKey' ||
            err.name === 'NotFound' ||
            err.$metadata?.httpStatusCode === 404 ||
            err.message?.includes('does not exist')
          ) {
            if (!state.missingKeys) state.missingKeys = {};
            state.missingKeys[key] = { lastAttemptAt: new Date().toISOString() };
          }
        }
      }

      if (copySuccess) {
        state.copiedKeys[key] = {
          copiedAt: new Date().toISOString(),
        };
        newCopiedCount++;
      }
    }

    // 2. Download to local cache if local archive packaging needs it
    if (localCachedPath && !alreadyInLocalCache && liveS3Client && !state.missingKeys?.[key]) {
      try {
        const resp = await liveS3Client.send(
          new GetObjectCommand({
            Bucket: liveBucket,
            Key: liveS3Key,
          })
        );
        if (resp.Body) {
          await pipeline(resp.Body, fs.createWriteStream(localCachedPath));
          const size = fs.statSync(localCachedPath).size;
          totalBytes += size;
        }
      } catch (err) {
        console.warn(`[Screenshot Sync Warning] Could not cache file "${key}" to local cache: ${err.message}`);
        if (
          err.name === 'NoSuchKey' ||
          err.name === 'NotFound' ||
          err.$metadata?.httpStatusCode === 404 ||
          err.message?.includes('does not exist')
        ) {
          if (!state.missingKeys) state.missingKeys = {};
          state.missingKeys[key] = { lastAttemptAt: new Date().toISOString() };
        }
      }
    } else if (localCachedPath && alreadyInLocalCache) {
      totalBytes += fs.statSync(localCachedPath).size;
    }
  }

  state.lastSyncAt = new Date().toISOString();
  if (stateFilePath && !dryRun) {
    saveScreenshotState(stateFilePath, state);
  }

  return {
    totalRequired: requiredKeys.length,
    newCopied: newCopiedCount,
    skipped: skippedCount,
    totalBytes,
  };
}
