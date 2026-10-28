import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MAGIC_BYTES, BACKUP_FORMAT_VERSION } from './constants.js';

export const SALT_LENGTH = 32;
export const IV_LENGTH = 12; // 96-bit IV standard for AES-GCM
export const TAG_LENGTH = 16;
export const HEADER_LENGTH = 5 + 1 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH; // 66 bytes

/**
 * Derives a 256-bit AES key from a passphrase and random salt using scrypt.
 */
export function deriveKey(passphrase, salt) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a string of at least 32 characters.');
  }
  return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypts a plaintext buffer with AES-256-GCM.
 * Prepend authenticated header: [MAGIC (5B)][VERSION (1B)][SALT (32B)][IV (12B)][TAG (16B)][CIPHERTEXT]
 */
export function encryptBuffer(plainBuffer, passphrase) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const aad = Buffer.concat([Buffer.from(MAGIC_BYTES, 'utf-8'), Buffer.from([BACKUP_FORMAT_VERSION]), salt, iv]);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([aad, tag, ciphertext]);
}

/**
 * Encrypts a source file directly to a destination encrypted file (.enc).
 */
export async function encryptFile(srcFilePath, destEncPath, passphrase) {
  const plainBuffer = fs.readFileSync(srcFilePath);
  const encrypted = encryptBuffer(plainBuffer, passphrase);

  const parentDir = path.dirname(destEncPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(destEncPath, encrypted, { mode: 0o600 });
  return destEncPath;
}

/**
 * Decrypts an AES-256-GCM encrypted buffer with constant-time tag verification.
 */
export function decryptBuffer(encBuffer, passphrase) {
  if (encBuffer.length < HEADER_LENGTH) {
    throw new Error(
      `Invalid encrypted backup archive: file too short (${encBuffer.length} bytes, minimum ${HEADER_LENGTH} bytes required).`
    );
  }

  const magic = encBuffer.subarray(0, 5).toString('utf-8');
  if (magic !== MAGIC_BYTES) {
    throw new Error(`Invalid encrypted backup archive: unrecognized magic header "${magic}". Expected "${MAGIC_BYTES}".`);
  }

  const version = encBuffer[5];
  if (version !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Unsupported backup archive format version: ${version}. Expected version ${BACKUP_FORMAT_VERSION}.`
    );
  }

  const salt = encBuffer.subarray(6, 6 + SALT_LENGTH);
  const iv = encBuffer.subarray(6 + SALT_LENGTH, 6 + SALT_LENGTH + IV_LENGTH);
  const tag = encBuffer.subarray(6 + SALT_LENGTH + IV_LENGTH, HEADER_LENGTH);
  const ciphertext = encBuffer.subarray(HEADER_LENGTH);

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  const aad = Buffer.concat([Buffer.from(magic, 'utf-8'), Buffer.from([version]), salt, iv]);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new Error(
      `Decryption failed: corrupted archive, incorrect BACKUP_ENCRYPTION_KEY, or tampered ciphertext. (${err.message})`
    );
  }
}

/**
 * Decrypts an encrypted file (.enc) directly to a destination decrypted file.
 */
export async function decryptFile(encFilePath, destFilePath, passphrase) {
  const encBuffer = fs.readFileSync(encFilePath);
  const decrypted = decryptBuffer(encBuffer, passphrase);

  const parentDir = path.dirname(destFilePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(destFilePath, decrypted, { mode: 0o600 });
  return destFilePath;
}
