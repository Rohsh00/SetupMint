import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import { assertValidKey } from '../src/storage/types.js';
import { S3Storage } from '../src/storage/s3.storage.js';
import { getStorage, setStorageForTests } from '../src/storage/index.js';

describe('Storage Layer Unit Tests (Cloud Only)', () => {
  describe('assertValidKey validation', () => {
    it('accepts valid UUID filenames with approved extensions', () => {
      expect(() => assertValidKey('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11.png')).not.toThrow();
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.jpg')).not.toThrow();
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.jpeg')).not.toThrow();
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.webp')).not.toThrow();
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.svg')).not.toThrow();
    });

    it('accepts synthetic demo chart filenames', () => {
      expect(() =>
        assertValidKey('demo_chart_6ad487c932f848f59f1bdbeb_setup_1792313289395.svg')
      ).not.toThrow();
    });

    it('accepts healthcheck probe key', () => {
      expect(() =>
        assertValidKey('healthcheck/12345678-1234-1234-1234-123456789abc.png')
      ).not.toThrow();
    });

    it('rejects path traversal attempts', () => {
      expect(() => assertValidKey('../secret.png')).toThrow(/path-like traversal/);
      expect(() => assertValidKey('folder/../../etc/passwd.png')).toThrow(/path-like traversal/);
      expect(() => assertValidKey('/root/file.png')).toThrow(/path-like traversal/);
      expect(() => assertValidKey('..\\windows.png')).toThrow(/path-like traversal/);
    });

    it('rejects non-approved file extensions and malicious scripts', () => {
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.exe')).toThrow(/does not match/);
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.sh')).toThrow(/does not match/);
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.html')).toThrow(/does not match/);
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc.php')).toThrow(/does not match/);
      expect(() => assertValidKey('12345678-1234-1234-1234-123456789abc')).toThrow(/does not match/);
    });

    it('rejects empty, null or invalid type keys', () => {
      expect(() => assertValidKey('')).toThrow(/non-empty string/);
      expect(() => assertValidKey(null as any)).toThrow(/non-empty string/);
    });
  });

  describe('S3Storage with Mocked S3Client', () => {
    let mockSend: any;
    let mockClient: any;
    let storage: S3Storage;

    beforeEach(() => {
      mockSend = vi.fn();
      mockClient = { send: mockSend };
      storage = new S3Storage(
        {
          endpoint: 'https://test.r2.cloudflarestorage.com',
          bucket: 'test-bucket',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          prefix: 'journal-uploads',
        },
        mockClient
      );
    });

    it('save(): sends PutObjectCommand with prefixed key and correct buffer', async () => {
      mockSend.mockResolvedValueOnce({});
      const testBuffer = Buffer.from('image data');
      const key = '12345678-1234-1234-1234-123456789abc.png';

      await storage.save(key, testBuffer, 'image/png');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.Key).toBe(`journal-uploads/${key}`);
      expect(command.input.Body).toEqual(testBuffer);
      expect(command.input.ContentType).toBe('image/png');
    });

    it('read(): returns readable stream on successful GetObjectCommand', async () => {
      const readable = Readable.from(['stream data']);
      mockSend.mockResolvedValueOnce({ Body: readable });
      const key = '12345678-1234-1234-1234-123456789abc.png';

      const stream = await storage.read(key);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(stream).toBe(readable);
    });

    it('read(): throws FILE_NOT_FOUND when S3 returns NoSuchKey or 404', async () => {
      const noSuchKeyErr = new Error('NoSuchKey');
      noSuchKeyErr.name = 'NoSuchKey';
      mockSend.mockRejectedValueOnce(noSuchKeyErr);
      const key = '12345678-1234-1234-1234-123456789abc.png';

      await expect(storage.read(key)).rejects.toThrow(/File not found in storage/);
    });

    it('delete(): is idempotent and does not throw if object does not exist', async () => {
      const notFoundErr = new Error('NoSuchKey');
      notFoundErr.name = 'NoSuchKey';
      mockSend.mockRejectedValueOnce(notFoundErr);
      const key = '12345678-1234-1234-1234-123456789abc.png';

      await expect(storage.delete(key)).resolves.toBeUndefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('exists(): returns true when HeadObject succeeds', async () => {
      mockSend.mockResolvedValueOnce({});
      const key = '12345678-1234-1234-1234-123456789abc.png';

      const exists = await storage.exists(key);
      expect(exists).toBe(true);
    });

    it('exists(): returns false when HeadObject returns NotFound or 404', async () => {
      const notFoundErr: any = new Error('NotFound');
      notFoundErr.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundErr);
      const key = '12345678-1234-1234-1234-123456789abc.png';

      const exists = await storage.exists(key);
      expect(exists).toBe(false);
    });
  });

  describe('getStorage() environment validation', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
      setStorageForTests(null);
    });

    afterEach(() => {
      process.env = { ...savedEnv };
    });

    it('throws with clear message when S3 configuration environment variables are missing', () => {
      delete process.env.S3_ENDPOINT;
      delete process.env.S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;

      expect(() => getStorage()).toThrow(/Cloudflare R2 \(S3\) configuration missing/);
      expect(() => getStorage()).toThrow(/CLOUD-ONLY storage mode/);
    });
  });
});
