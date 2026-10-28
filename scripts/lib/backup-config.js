import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '../..');

// Load environment from repository root regardless of current working directory
const rootEnvPath = path.join(REPO_ROOT, '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config(); // Fallback to process.cwd()

/**
 * Safely masks secret values for logging.
 */
export function maskSecret(val) {
  if (!val || typeof val !== 'string') return '***';
  if (val.length <= 8) return '***';
  return `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
}

/**
 * Extracts database host without leaking username, password, or auth credentials.
 */
export function extractSafeMongoHost(uri) {
  if (!uri) return 'unspecified';
  try {
    const match = uri.match(/@([^/?#]+)/);
    if (match && match[1]) return match[1];
    const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    return parsed.host || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}

/**
 * Reads and validates backup configuration.
 */
export function getBackupConfig(options = {}) {
  const { requireBackupBucket = true, requireEncryptionKey = true } = options;

  const mongoUri = process.env.MONGODB_URI || '';
  const liveS3Endpoint = process.env.S3_ENDPOINT || '';
  const liveS3Bucket = process.env.S3_BUCKET || '';
  const liveS3AccessKeyId = process.env.S3_ACCESS_KEY_ID || '';
  const liveS3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
  const liveS3Region = process.env.S3_REGION || 'auto';
  const liveS3Prefix = (process.env.S3_PREFIX || '').replace(/^\/+|\/+$/g, '');

  const backupS3Endpoint = process.env.BACKUP_S3_ENDPOINT || liveS3Endpoint;
  const backupS3Bucket = process.env.BACKUP_S3_BUCKET || '';
  const backupS3AccessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID || liveS3AccessKeyId;
  const backupS3SecretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY || liveS3SecretAccessKey;
  const backupS3Region = process.env.BACKUP_S3_REGION || 'auto';
  const backupS3Prefix = (process.env.BACKUP_S3_PREFIX || 'setupmint-backups').replace(/^\/+|\/+$/g, '');

  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || '';
  const retainDaily = Math.max(1, parseInt(process.env.BACKUP_RETAIN_DAILY || '30', 10));
  const retainMonthly = Math.max(1, parseInt(process.env.BACKUP_RETAIN_MONTHLY || '12', 10));
  const maxDropPercent = Math.max(1, parseFloat(process.env.BACKUP_MAX_DROP_PERCENT || '10'));

  const telegramBotToken = process.env.BACKUP_ALERT_TELEGRAM_BOT_TOKEN || '';
  const telegramChatId = process.env.BACKUP_ALERT_TELEGRAM_CHAT_ID || '';

  // Validation rules
  if (requireBackupBucket) {
    if (!backupS3Bucket) {
      throw new Error(
        'BACKUP_S3_BUCKET is required for off-site backups. Please specify a dedicated backup bucket in .env.'
      );
    }
    if (!backupS3Endpoint || !backupS3AccessKeyId || !backupS3SecretAccessKey) {
      throw new Error(
        'Incomplete off-site backup S3 credentials. Ensure BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID, and BACKUP_S3_SECRET_ACCESS_KEY (or live S3 fallback) are set.'
      );
    }
    // Fail-fast rule: Backup bucket cannot be identical to the live bucket on the same endpoint
    if (
      backupS3Bucket === liveS3Bucket &&
      backupS3Endpoint.replace(/\/+$/, '') === liveS3Endpoint.replace(/\/+$/, '')
    ) {
      throw new Error(
        `FATAL: BACKUP_S3_BUCKET ("${backupS3Bucket}") cannot be identical to S3_BUCKET on the same endpoint. ` +
          `SetupMint requires an isolated, dedicated off-site bucket to protect against accidental live bucket deletion or corruption.`
      );
    }
  }

  if (requireEncryptionKey) {
    if (!encryptionKey) {
      throw new Error(
        'BACKUP_ENCRYPTION_KEY is required for encrypted backups. Set a secure passphrase (>= 32 characters) in .env.'
      );
    }
    if (encryptionKey.length < 32) {
      throw new Error(
        `BACKUP_ENCRYPTION_KEY is too short (${encryptionKey.length} chars). It must be at least 32 characters long to ensure scrypt/AES-256-GCM security.`
      );
    }
  }

  return {
    repoRoot: REPO_ROOT,
    mongoUri,
    mongoHost: extractSafeMongoHost(mongoUri),
    liveS3: {
      endpoint: liveS3Endpoint,
      bucket: liveS3Bucket,
      accessKeyId: liveS3AccessKeyId,
      secretAccessKey: liveS3SecretAccessKey,
      region: liveS3Region,
      prefix: liveS3Prefix,
    },
    backupS3: {
      endpoint: backupS3Endpoint,
      bucket: backupS3Bucket,
      accessKeyId: backupS3AccessKeyId,
      secretAccessKey: backupS3SecretAccessKey,
      region: backupS3Region,
      prefix: backupS3Prefix,
    },
    encryptionKey,
    retainDaily,
    retainMonthly,
    maxDropPercent,
    telegram: {
      botToken: telegramBotToken,
      chatId: telegramChatId,
      enabled: Boolean(telegramBotToken && telegramChatId),
    },
  };
}
