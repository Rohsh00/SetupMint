import { IStorageProvider } from './types.js';
import { S3Storage } from './s3.storage.js';

let storageInstance: S3Storage | null = null;
let testStorageInstance: IStorageProvider | null = null;

/**
 * Injects a test storage provider (e.g. InMemoryStorage) during automated tests.
 * Passing null resets to the production cloud singleton.
 */
export function setStorageForTests(provider: IStorageProvider | null): void {
  testStorageInstance = provider;
}

/**
 * Returns the active storage provider.
 * In production, SetupMint is strictly CLOUD-ONLY with Cloudflare R2 (S3-compatible).
 * Missing S3 credentials will immediately throw.
 */
export function getStorage(): IStorageProvider {
  if (testStorageInstance) {
    return testStorageInstance;
  }

  if (storageInstance) {
    return storageInstance;
  }

  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  const missing: string[] = [];
  if (!endpoint) missing.push('S3_ENDPOINT');
  if (!bucket) missing.push('S3_BUCKET');
  if (!accessKeyId) missing.push('S3_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Cloudflare R2 (S3) configuration missing: [${missing.join(', ')}]. ` +
        `SetupMint runs in CLOUD-ONLY storage mode with zero local disk fallbacks. ` +
        `Please configure S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in .env.`
    );
  }

  storageInstance = new S3Storage({
    endpoint: endpoint!,
    region: process.env.S3_REGION || 'auto',
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    prefix: process.env.S3_PREFIX,
  });

  return storageInstance;
}
