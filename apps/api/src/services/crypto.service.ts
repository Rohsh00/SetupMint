import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;

function getKey(customKey?: string): Buffer {
  const secret = customKey || config.tokenEncryptionKey || 'tradevault-dev-token-encryption-key-change-me';
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isEncryptedSecret(value)) return value;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isEncryptedSecret(value)) return value;

  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  // Candidate encryption keys (current configured key, common dev defaults, session secret)
  const candidateKeys = [
    config.tokenEncryptionKey,
    'supersecret-setupmint-token-encryption-key-change-me-32chars',
    'tradevault-dev-token-encryption-key-change-me',
    config.sessionSecret,
  ].filter(Boolean) as string[];

  const uniqueCandidateKeys = Array.from(new Set(candidateKeys));

  for (const candidate of uniqueCandidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, getKey(candidate), iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      // Try next candidate key
    }
  }

  throw new Error(
    'Unable to authenticate encrypted secret (encryption key mismatch or invalid token). Please re-enter your secret credentials.'
  );
}

export function hashOAuthState(state: string): string {
  return crypto.createHash('sha256').update(state, 'utf8').digest('hex');
}
