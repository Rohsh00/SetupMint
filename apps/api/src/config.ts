import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or current directory
[
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../.env'),
].forEach((p) => dotenv.config({ path: p }));
dotenv.config();

const rawCookieDomain = process.env.COOKIE_DOMAIN?.trim();
// For localhost or empty, omit the Domain attribute entirely (browsers reject Domain=localhost)
const cookieDomain = rawCookieDomain && rawCookieDomain !== 'localhost' ? rawCookieDomain : undefined;

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Database (Atlas MongoDB)
  mongodbUri: process.env.MONGODB_URI || '',

  // Security & Sessions
  sessionSecret: process.env.SESSION_SECRET || 'tradevault-cloud-session-secret-change-in-prod-32chars',
  cookieDomain,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Session Lifetimes (Sliding & Absolute)
  sessionIdleDays: Number(process.env.SESSION_IDLE_DAYS || 90),
  sessionAbsoluteDays: Number(process.env.SESSION_ABSOLUTE_DAYS || 365),
  sessionRenewThreshold: Number(process.env.SESSION_RENEW_THRESHOLD || 0.5),

  // File Upload Limit (Cloudflare R2)
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),

  // Defaults
  defaultBaseCurrency: process.env.DEFAULT_BASE_CURRENCY || 'INR',
};

/**
 * Validates critical environment configuration on startup.
 * In production mode, fails fast if SESSION_SECRET is missing, uses the dev fallback, or is under 32 characters.
 */
export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    const secret = process.env.SESSION_SECRET;
    if (
      !secret ||
      secret === 'tradevault-cloud-session-secret-change-in-prod-32chars' ||
      secret.length < 32
    ) {
      throw new Error(
        'FATAL: In production (NODE_ENV=production), SESSION_SECRET must be explicitly set, cannot use the default dev fallback, and must be at least 32 characters long.'
      );
    }
  }
}

