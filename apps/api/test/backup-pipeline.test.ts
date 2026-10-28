import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { calculateRetentionDeletions, parseKeyTimestamp } from '../../../scripts/lib/retention.js';
import {
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
  HEADER_LENGTH,
} from '../../../scripts/lib/crypto-backup.js';
import {
  createUstarHeader,
  parseUstarHeader,
  packDirectoryToTarGz,
  unpackTarGzToDirectory,
} from '../../../scripts/lib/tar-gz.js';
import { detectAnomalies } from '../../../scripts/lib/anomaly.js';
import { acquireLock, releaseLock } from '../../../scripts/lib/lockfile.js';
import { syncScreenshotsIncremental } from '../../../scripts/lib/r2-sync.js';
import { validateConfig, config } from '../src/config.js';
import { BackupStatusService } from '../src/services/backup-status.service.js';

const { EJSON } = mongoose.mongo.BSON;

describe('Backup Pipeline Test Suite', () => {
  let tempTestDir: string;

  beforeEach(() => {
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  });

  // ============================================================================
  // 1. RETENTION LOGIC UNIT TESTS
  // ============================================================================
  describe('Retention Policy (calculateRetentionDeletions)', () => {
    it('parses timestamps accurately from backup key names', () => {
      const key = 'setupmint-backups/daily/setupmint-backup-2026-10-28T02-30-00-000Z.tar.gz.enc';
      const dt = parseKeyTimestamp(key);
      expect(dt).not.toBeNull();
      expect(dt?.toISOString()).toBe('2026-10-28T02:30:00.000Z');
    });

    it('returns null for unparseable key timestamps', () => {
      expect(parseKeyTimestamp('setupmint-backups/random-file.txt')).toBeNull();
      expect(parseKeyTimestamp('')).toBeNull();
      expect(parseKeyTimestamp('daily/invalid-date-format.tar.gz.enc')).toBeNull();
    });

    it('keeps all daily keys when count is under retainDaily limit', () => {
      const dailyKeys = [
        'prefix/daily/setupmint-backup-2026-10-28T02-30-00-000Z.tar.gz.enc',
        'prefix/daily/setupmint-backup-2026-10-27T02-30-00-000Z.tar.gz.enc',
        'prefix/daily/setupmint-backup-2026-10-26T02-30-00-000Z.tar.gz.enc',
      ];
      const result = calculateRetentionDeletions({
        dailyKeys,
        retainDaily: 30,
        retainMonthly: 12,
        minKeep: 3,
      });

      expect(result.deleteDailyKeys).toEqual([]);
      expect(result.keepDailyKeys).toHaveLength(3);
      expect(result.allDeleteKeys).toEqual([]);
    });

    it('prunes oldest daily backups when count exceeds retainDaily', () => {
      const dailyKeys: string[] = [];
      // Generate 35 valid consecutive days
      const baseDate = new Date('2026-08-01T02:30:00.000Z');
      for (let i = 0; i < 35; i++) {
        const d = new Date(baseDate.getTime() + i * 24 * 3600 * 1000);
        const iso = d.toISOString().replace(/[:.]/g, '-');
        dailyKeys.push(`prefix/daily/setupmint-backup-${iso}.tar.gz.enc`);
      }

      const result = calculateRetentionDeletions({
        dailyKeys,
        retainDaily: 30,
        minKeep: 3,
      });

      expect(result.keepDailyKeys).toHaveLength(30);
      expect(result.deleteDailyKeys).toHaveLength(5);
    });

    it('prunes monthly backups past retainMonthly limit', () => {
      const monthlyKeys: string[] = [];
      // Generate 15 valid monthly dates across multiple years
      for (let year = 2024; year <= 2025; year++) {
        for (let m = 1; m <= 12; m++) {
          if (monthlyKeys.length >= 15) break;
          const mStr = String(m).padStart(2, '0');
          monthlyKeys.push(`prefix/monthly/setupmint-backup-${year}-${mStr}-01T02-30-00-000Z.tar.gz.enc`);
        }
      }

      const result = calculateRetentionDeletions({
        monthlyKeys,
        retainMonthly: 12,
        minKeep: 3,
      });

      expect(result.keepMonthlyKeys).toHaveLength(12);
      expect(result.deleteMonthlyKeys).toHaveLength(3);
    });

    it('never deletes unparseable keys in the backup bucket', () => {
      const dailyKeys = [
        'prefix/daily/setupmint-backup-2026-10-28T02-30-00-000Z.tar.gz.enc',
        'prefix/daily/setupmint-backup-2026-10-27T02-30-00-000Z.tar.gz.enc',
        'prefix/daily/notes-manual.txt',
        'prefix/daily/unknown-archive.bin',
      ];

      const result = calculateRetentionDeletions({
        dailyKeys,
        retainDaily: 1, // Aggressive retention
        minKeep: 1,
      });

      expect(result.deleteDailyKeys).toEqual(['prefix/daily/setupmint-backup-2026-10-27T02-30-00-000Z.tar.gz.enc']);
      expect(result.keepDailyKeys).toContain('prefix/daily/notes-manual.txt');
      expect(result.keepDailyKeys).toContain('prefix/daily/unknown-archive.bin');
    });

    it('enforces minKeep safety guard to prevent deleting when total backups drop below threshold', () => {
      const dailyKeys = [
        'prefix/daily/setupmint-backup-2026-10-28T02-30-00-000Z.tar.gz.enc',
        'prefix/daily/setupmint-backup-2026-10-27T02-30-00-000Z.tar.gz.enc',
      ];

      const result = calculateRetentionDeletions({
        dailyKeys,
        retainDaily: 1, // Limit of 1, but minKeep is 3
        minKeep: 3,
      });

      // Both must be preserved because total < minKeep
      expect(result.deleteDailyKeys).toHaveLength(0);
      expect(result.keepDailyKeys).toHaveLength(2);
    });

    it('correctly handles leap days (Feb 29)', () => {
      const keys = [
        'prefix/daily/setupmint-backup-2028-02-29T02-30-00-000Z.tar.gz.enc', // 2028 is leap year
        'prefix/daily/setupmint-backup-2028-02-28T02-30-00-000Z.tar.gz.enc',
        'prefix/daily/setupmint-backup-2028-03-01T02-30-00-000Z.tar.gz.enc',
      ];

      const result = calculateRetentionDeletions({ dailyKeys: keys, retainDaily: 2, minKeep: 1 });
      expect(result.keepDailyKeys).toContain('prefix/daily/setupmint-backup-2028-03-01T02-30-00-000Z.tar.gz.enc');
      expect(result.keepDailyKeys).toContain('prefix/daily/setupmint-backup-2028-02-29T02-30-00-000Z.tar.gz.enc');
      expect(result.deleteDailyKeys).toEqual(['prefix/daily/setupmint-backup-2028-02-28T02-30-00-000Z.tar.gz.enc']);
    });
  });

  // ============================================================================
  // 2. CRYPTOGRAPHIC ENCRYPTION TESTS
  // ============================================================================
  describe('Crypto Engine (AES-256-GCM + scrypt)', () => {
    const validKey = 'tradevault-secure-backup-passphrase-32chars-minimum!';

    it('successfully encrypts and decrypts buffer with identical content', () => {
      const plain = Buffer.from('SetupMint Confidential Trading Performance Ledger 2026');
      const encrypted = encryptBuffer(plain, validKey);

      expect(encrypted.length).toBeGreaterThan(HEADER_LENGTH);
      const decrypted = decryptBuffer(encrypted, validKey);
      expect(decrypted.toString('utf-8')).toBe(plain.toString('utf-8'));
    });

    it('successfully encrypts and decrypts file on disk', async () => {
      const plainFile = path.join(tempTestDir, 'sample.txt');
      const encFile = path.join(tempTestDir, 'sample.txt.enc');
      const decFile = path.join(tempTestDir, 'sample.decrypted.txt');

      fs.writeFileSync(plainFile, 'Disaster Recovery Cold Storage Payload');
      await encryptFile(plainFile, encFile, validKey);
      expect(fs.existsSync(encFile)).toBe(true);

      await decryptFile(encFile, decFile, validKey);
      expect(fs.readFileSync(decFile, 'utf-8')).toBe('Disaster Recovery Cold Storage Payload');
    });

    it('fails to decrypt when using an incorrect passphrase', () => {
      const plain = Buffer.from('Sensitive Alpha Trading Strategy');
      const encrypted = encryptBuffer(plain, validKey);
      const wrongKey = 'completely-wrong-password-for-decryption-32c!';

      expect(() => decryptBuffer(encrypted, wrongKey)).toThrow(/Decryption failed/);
    });

    it('fails to decrypt if ciphertext is tampered', () => {
      const plain = Buffer.from('Financial Ledger Data');
      const encrypted = encryptBuffer(plain, validKey);

      // Mutate last byte of ciphertext
      encrypted[encrypted.length - 1] ^= 0x01;

      expect(() => decryptBuffer(encrypted, validKey)).toThrow(/Decryption failed/);
    });

    it('fails to decrypt if header magic bytes are tampered', () => {
      const plain = Buffer.from('Header Integrity Test');
      const encrypted = encryptBuffer(plain, validKey);

      // Corrupt magic header 'SMENC'
      encrypted[0] = 'X'.charCodeAt(0);

      expect(() => decryptBuffer(encrypted, validKey)).toThrow(/unrecognized magic header/);
    });

    it('fails to decrypt if format version is unsupported', () => {
      const plain = Buffer.from('Version Test');
      const encrypted = encryptBuffer(plain, validKey);

      // Corrupt version byte (byte index 5)
      encrypted[5] = 99;

      expect(() => decryptBuffer(encrypted, validKey)).toThrow(/Unsupported backup archive format version/);
    });

    it('produces unique salt, IV, and ciphertext on repeated encryptions of identical data', () => {
      const plain = Buffer.from('Identical Payload');
      const enc1 = encryptBuffer(plain, validKey);
      const enc2 = encryptBuffer(plain, validKey);

      expect(enc1.equals(enc2)).toBe(false);
      // Salt at 6..38
      const salt1 = enc1.subarray(6, 38);
      const salt2 = enc2.subarray(6, 38);
      expect(salt1.equals(salt2)).toBe(false);
      // IV at 38..50
      const iv1 = enc1.subarray(38, 50);
      const iv2 = enc2.subarray(38, 50);
      expect(iv1.equals(iv2)).toBe(false);
    });

    it('rejects keys shorter than 32 characters', () => {
      const shortKey = 'too-short-key';
      expect(() => encryptBuffer(Buffer.from('test'), shortKey)).toThrow(/at least 32 characters/);
    });
  });

  // ============================================================================
  // 3. TAR.GZ PACKING & UNPACKING TESTS
  // ============================================================================
  describe('Tar.gz Packaging (POSIX ustar)', () => {
    it('creates and parses valid ustar 512-byte headers', () => {
      const headerBuf = createUstarHeader('sub/trades.json', 1234, '0', 0o644);
      expect(headerBuf.length).toBe(512);

      const parsed = parseUstarHeader(headerBuf);
      expect(parsed).not.toBeNull();
      expect(parsed?.name).toBe('sub/trades.json');
      expect(parsed?.size).toBe(1234);
      expect(parsed?.isDir).toBe(false);
    });

    it('packs a directory to .tar.gz and unpacks with identical files and subdirectories', async () => {
      const sourceDir = path.join(tempTestDir, 'source');
      fs.mkdirSync(path.join(sourceDir, 'uploads'), { recursive: true });

      fs.writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify({ version: 1 }));
      fs.writeFileSync(path.join(sourceDir, 'trades.json'), JSON.stringify([{ id: 'T1' }]));
      fs.writeFileSync(path.join(sourceDir, 'uploads', 'chart.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const tarGzPath = path.join(tempTestDir, 'archive.tar.gz');
      await packDirectoryToTarGz(sourceDir, tarGzPath);
      expect(fs.existsSync(tarGzPath)).toBe(true);

      const extractedDir = path.join(tempTestDir, 'extracted');
      await unpackTarGzToDirectory(tarGzPath, extractedDir);

      expect(fs.existsSync(path.join(extractedDir, 'manifest.json'))).toBe(true);
      expect(fs.readFileSync(path.join(extractedDir, 'trades.json'), 'utf-8')).toBe(
        JSON.stringify([{ id: 'T1' }])
      );
      expect(fs.existsSync(path.join(extractedDir, 'uploads', 'chart.png'))).toBe(true);
    });
  });

  // ============================================================================
  // 4. ANOMALY DETECTION TESTS
  // ============================================================================
  describe('Anomaly Detection (detectAnomalies)', () => {
    it('does not flag anomaly on initial backup when no previous manifest exists', () => {
      const current = { collections: { trades: 50, attachments: 20 } };
      const result = detectAnomalies(current, null, 10);
      expect(result.isSuspicious).toBe(false);
      expect(result.isFirstBackup).toBe(true);
    });

    it('does not flag anomaly when record counts increase or stay the same', () => {
      const prev = { collections: { trades: 50, attachments: 20, accounttransactions: 10, tradingaccounts: 2 } };
      const current = { collections: { trades: 55, attachments: 22, accounttransactions: 12, tradingaccounts: 2 } };
      const result = detectAnomalies(current, prev, 10);
      expect(result.isSuspicious).toBe(false);
    });

    it('does not flag anomaly on minor drops under maxDropPercent threshold', () => {
      const prev = { collections: { trades: 100, attachments: 50, accounttransactions: 20, tradingaccounts: 4 } };
      // 5% drop in trades (100 -> 95)
      const current = { collections: { trades: 95, attachments: 50, accounttransactions: 20, tradingaccounts: 4 } };
      const result = detectAnomalies(current, prev, 10);
      expect(result.isSuspicious).toBe(false);
    });

    it('flags SUSPICIOUS when drop exceeds maxDropPercent threshold', () => {
      const prev = { collections: { trades: 100, attachments: 50, accounttransactions: 20, tradingaccounts: 4 } };
      // 15% drop in trades (100 -> 85)
      const current = { collections: { trades: 85, attachments: 50, accounttransactions: 20, tradingaccounts: 4 } };
      const result = detectAnomalies(current, prev, 10);

      expect(result.isSuspicious).toBe(true);
      expect(result.reasons[0]).toContain('Collection "trades" count dropped by 15.0%');
    });

    it('flags SUSPICIOUS when any critical collection drops to 0 from >0', () => {
      const prev = { collections: { trades: 10, attachments: 5, accounttransactions: 2, tradingaccounts: 1 } };
      const current = { collections: { trades: 0, attachments: 5, accounttransactions: 2, tradingaccounts: 1 } };
      const result = detectAnomalies(current, prev, 10);

      expect(result.isSuspicious).toBe(true);
      expect(result.reasons[0]).toContain('Critical collection "trades" dropped to 0 documents');
    });
  });

  // ============================================================================
  // 5. EXTENDED JSON (EJSON) & DECIMAL128 DRIFT TESTS
  // ============================================================================
  describe('EJSON Serialization & Decimal128 Precision', () => {
    it('accurately preserves ObjectId, Date, and Decimal128 across EJSON serialization', () => {
      const id = new mongoose.Types.ObjectId();
      const now = new Date();
      const amount = mongoose.Types.Decimal128.fromString('125000.7500000000000000000000000000');

      const doc = {
        _id: id,
        tradeDate: now,
        balance: amount,
        name: 'Alpha Portfolio',
      };

      const ejsonStr = EJSON.stringify([doc], null, 2, { relaxed: false });
      const parsed = EJSON.parse(ejsonStr, { relaxed: false });

      expect(parsed).toHaveLength(1);
      const restored = parsed[0];

      expect(restored._id.toString()).toBe(id.toString());
      expect(restored.tradeDate.getTime()).toBe(now.getTime());
      expect(restored.balance.toString()).toBe('125000.7500000000000000000000000000');
      expect(restored.balance instanceof mongoose.Types.Decimal128).toBe(true);
    });
  });

  // ============================================================================
  // 6. LOCKFILE CONCURRENCY & STALE RECLAMATION TESTS
  // ============================================================================
  describe('Lockfile Management (acquireLock / releaseLock)', () => {
    it('acquires lock and refuses concurrent execution', () => {
      const lockPath = path.join(tempTestDir, '.test.lock');

      const lock1 = acquireLock(lockPath, 100000);
      expect(lock1.acquired).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(true);

      // Second attempt must throw
      expect(() => acquireLock(lockPath, 100000)).toThrow(/Concurrent backup operation in progress/);

      releaseLock(lockPath);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('reclaims stale lock file when older than maxAgeMs', () => {
      const lockPath = path.join(tempTestDir, '.stale.lock');
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, acquiredAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() }));

      // Set mtime to 4 hours ago
      const pastTime = (Date.now() - 4 * 3600 * 1000) / 1000;
      fs.utimesSync(lockPath, pastTime, pastTime);

      // 3 hours max age
      const lock = acquireLock(lockPath, 3 * 3600 * 1000);
      expect(lock.acquired).toBe(true);
      releaseLock(lockPath);
    });
  });

  // ============================================================================
  // 7. CONFIG VALIDATION TESTS
  // ============================================================================
  describe('Config Validation (validateConfig)', () => {
    it('throws when BACKUP_S3_BUCKET is identical to S3_BUCKET on the same endpoint', () => {
      const prevBackupBucket = config.backupS3Bucket;
      const prevLiveBucket = process.env.S3_BUCKET;

      config.backupS3Bucket = 'shared-bucket';
      process.env.S3_BUCKET = 'shared-bucket';
      config.backupS3Endpoint = 'https://r2.cloudflarestorage.com';
      process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';

      expect(() => validateConfig()).toThrow(/BACKUP_S3_BUCKET \("shared-bucket"\) cannot be identical to S3_BUCKET/);

      // Cleanup
      config.backupS3Bucket = prevBackupBucket;
      process.env.S3_BUCKET = prevLiveBucket;
    });

    it('throws when BACKUP_ENCRYPTION_KEY is shorter than 32 characters', () => {
      const prevKey = config.backupEncryptionKey;
      config.backupEncryptionKey = 'short-key';

      expect(() => validateConfig()).toThrow(/BACKUP_ENCRYPTION_KEY must be at least 32 characters long/);

      config.backupEncryptionKey = prevKey;
    });
  });

  // ============================================================================
  // 8. INCREMENTAL SCREENSHOT SYNC LOGIC
  // ============================================================================
  describe('Incremental Screenshot Sync', () => {
    it('skips already copied keys and records new keys in state', async () => {
      const statePath = path.join(tempTestDir, 'state.json');
      const cacheDir = path.join(tempTestDir, 'cache');
      fs.mkdirSync(cacheDir);

      // Simulate one existing cached file
      const existingKey = '00000000-0000-0000-0000-000000000001.png';
      fs.writeFileSync(path.join(cacheDir, existingKey), Buffer.from('image-1'));

      fs.writeFileSync(
        statePath,
        JSON.stringify({
          copiedKeys: { [existingKey]: { copiedAt: new Date().toISOString() } },
          deletedKeys: {},
        })
      );

      const result = await syncScreenshotsIncremental({
        requiredKeys: [existingKey],
        cacheDir,
        stateFilePath: statePath,
        dryRun: false,
      });

      expect(result.skipped).toBe(1);
      expect(result.newCopied).toBe(0);
    });
  });

  // ============================================================================
  // 9. BACKUP STATUS SERVICE TESTS
  // ============================================================================
  describe('BackupStatusService', () => {
    it('returns configured: false when backup bucket is empty', async () => {
      BackupStatusService.resetCache();
      const prevBucket = config.backupS3Bucket;
      config.backupS3Bucket = '';

      const status = await BackupStatusService.getStatus();
      expect(status.configured).toBe(false);

      config.backupS3Bucket = prevBucket;
      BackupStatusService.resetCache();
    });
  });
});
