import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or current directory
[
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../.env'),
].forEach((p) => dotenv.config({ path: p }));
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Database (Atlas MongoDB)
  mongodbUri: process.env.MONGODB_URI || '',

  // Security & Sessions
  sessionSecret: process.env.SESSION_SECRET || 'tradevault-cloud-session-secret-change-in-prod-32chars',
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // File Upload Limit (Cloudflare R2)
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),

  // Defaults
  defaultBaseCurrency: process.env.DEFAULT_BASE_CURRENCY || 'INR',
};
