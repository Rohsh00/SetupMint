import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractMongoHost,
  validateAndFormatAtlasUri,
  connectDatabase,
} from '../src/db/connection.js';

describe('Database Connection Layer (Cloud Only — MongoDB Atlas)', () => {
  describe('extractMongoHost() credential masking', () => {
    it('extracts host from mongodb+srv URI without leaking password', () => {
      const uri = 'mongodb+srv://db_admin:superSecretPassword123@cluster0.re6xr4n.mongodb.net/tradevault';
      const host = extractMongoHost(uri);
      expect(host).toBe('cluster0.re6xr4n.mongodb.net');
      expect(host).not.toContain('superSecretPassword123');
      expect(host).not.toContain('db_admin');
    });

    it('extracts host when special characters exist in password', () => {
      const uri = 'mongodb+srv://user:pass%401998@cluster0.re6xr4n.mongodb.net/tradevault';
      const host = extractMongoHost(uri);
      expect(host).toBe('cluster0.re6xr4n.mongodb.net');
      expect(host).not.toContain('pass%401998');
    });
  });

  describe('validateAndFormatAtlasUri() validation', () => {
    it('throws when URI is missing or empty', () => {
      expect(() => validateAndFormatAtlasUri('')).toThrow(/MONGODB_URI is required/);
      expect(() => validateAndFormatAtlasUri(undefined)).toThrow(/MONGODB_URI is required/);
      expect(() => validateAndFormatAtlasUri('   ')).toThrow(/MONGODB_URI is required/);
    });

    it('throws with clear message when URI is a local or non-Atlas address', () => {
      expect(() => validateAndFormatAtlasUri('mongodb://127.0.0.1:27017/tradevault')).toThrow(
        /SetupMint requires a MongoDB Atlas cluster URI/
      );
      expect(() => validateAndFormatAtlasUri('mongodb://localhost:27017/test')).toThrow(
        /SetupMint requires a MongoDB Atlas cluster URI/
      );
    });

    it('formats Atlas URI to guarantee /tradevault db and retryWrites=true&w=majority', () => {
      const rawUri = 'mongodb+srv://user:pass%401998@cluster0.re6xr4n.mongodb.net/';
      const { uri, host } = validateAndFormatAtlasUri(rawUri);
      expect(host).toBe('cluster0.re6xr4n.mongodb.net');
      expect(uri).toContain('/tradevault');
      expect(uri).toContain('retryWrites=true');
      expect(uri).toContain('w=majority');
    });
  });

  describe('connectDatabase() fail-fast behavior', () => {
    let exitSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('PROCESS_EXIT_CALLED');
      }) as any);
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('throws immediately on missing URI with forceAtlasValidation', async () => {
      await expect(connectDatabase('', true)).rejects.toThrow(/MONGODB_URI is required/);
    });

    it('throws immediately on non-Atlas URI with forceAtlasValidation', async () => {
      await expect(
        connectDatabase('mongodb://127.0.0.1:27017/tradevault', true)
      ).rejects.toThrow(/SetupMint requires a MongoDB Atlas cluster URI/);
    });

    it('fails fast on unreachable Atlas host, logs only host, and exits non-zero without fallbacks', async () => {
      const unreachableAtlasUri =
        'mongodb+srv://dummy_user:dummy_password@cluster-nonexistent-12345.mongodb.net/tradevault?serverSelectionTimeoutMS=200';

      await expect(connectDatabase(unreachableAtlasUri, true)).rejects.toThrow('PROCESS_EXIT_CALLED');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedError = consoleErrorSpy.mock.calls[0].join(' ');
      expect(loggedError).toContain('cluster-nonexistent-12345.mongodb.net');
      // Verify credentials were NEVER logged
      expect(loggedError).not.toContain('dummy_password');
    });
  });
});
