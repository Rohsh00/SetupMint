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
  tokenEncryptionKey:
    process.env.TOKEN_ENCRYPTION_KEY || 'tradevault-dev-token-encryption-key-change-me',
  webAppUrl: process.env.WEB_APP_URL || 'http://localhost:5173',

  // FYERS Broker Integration
  fyersApiBase: process.env.FYERS_API_BASE || 'https://api-t1.fyers.in/api/v3',
  fyersRedirectUri:
    process.env.FYERS_REDIRECT_URI ||
    'http://127.0.0.1:4000/api/v1/integrations/fyers/callback',
  fyersFundsDriftTolerance: Number(process.env.FYERS_FUNDS_DRIFT_TOLERANCE || 1),
  fyersFundsSyncEnabled: process.env.FYERS_FUNDS_SYNC_ENABLED !== 'false',

  // Angel One SmartAPI Market Data Fallback
  angelOneApiBase: process.env.ANGEL_ONE_API_BASE || 'https://apiconnect.angelone.in',
  angelOneDailyBudget: Number(process.env.ANGEL_ONE_DAILY_BUDGET || 500),
  angelOneInstrumentMasterUrl:
    process.env.ANGEL_ONE_INSTRUMENT_MASTER_URL ||
    'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json',

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
  if (
    !Number.isFinite(config.angelOneDailyBudget) ||
    config.angelOneDailyBudget <= 0 ||
    config.angelOneDailyBudget > 5000
  ) {
    throw new Error('FATAL: ANGEL_ONE_DAILY_BUDGET must be a positive number up to 5000.');
  }

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

    const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (
      !tokenKey ||
      tokenKey === 'tradevault-dev-token-encryption-key-change-me' ||
      tokenKey.length < 32
    ) {
      throw new Error(
        'FATAL: In production (NODE_ENV=production), TOKEN_ENCRYPTION_KEY must be explicitly set, cannot use the default dev fallback, and must be at least 32 characters long.'
      );
    }

    if (
      !Number.isFinite(config.fyersFundsDriftTolerance) ||
      config.fyersFundsDriftTolerance < 0
    ) {
      throw new Error('FATAL: FYERS_FUNDS_DRIFT_TOLERANCE must be a non-negative number.');
    }
  }
}

