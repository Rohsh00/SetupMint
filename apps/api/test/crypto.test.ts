import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { encryptSecret, decryptSecret, isEncryptedSecret } from '../src/services/crypto.service.js';

describe('Crypto Service & Key Resilience Tests', () => {
  it('encrypts and decrypts secret successfully with primary key', () => {
    const raw = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    const encrypted = encryptSecret(raw);
    expect(encrypted).not.toBeNull();
    expect(isEncryptedSecret(encrypted)).toBe(true);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(raw);
  });

  it('returns plaintext as-is when secret is not encrypted', () => {
    const plain = 'unencrypted-plaintext-token';
    expect(decryptSecret(plain)).toBe(plain);
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
  });

  it('successfully decrypts secrets encrypted with candidate development keys', () => {
    const fallbackKey = 'supersecret-setupmint-token-encryption-key-change-me-32chars';
    const keyBuffer = crypto.createHash('sha256').update(fallbackKey, 'utf8').digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    const secretText = '987654321:XYZabc_Fallback_Key_Token';
    const encrypted = Buffer.concat([cipher.update(secretText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const legacyPayload = `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;

    // Should gracefully decrypt via candidate fallback keys
    const decrypted = decryptSecret(legacyPayload);
    expect(decrypted).toBe(secretText);
  });

  it('throws descriptive error instead of raw OpenSSL crash when key does not match any candidate', () => {
    const completelyUnknownKey = 'some-random-unknown-key-1234567890!';
    const keyBuffer = crypto.createHash('sha256').update(completelyUnknownKey, 'utf8').digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    const secretText = 'secret-under-unknown-key';
    const encrypted = Buffer.concat([cipher.update(secretText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const unauthenticablePayload = `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;

    expect(() => decryptSecret(unauthenticablePayload)).toThrow(
      /Unable to authenticate encrypted secret/
    );
  });
});

