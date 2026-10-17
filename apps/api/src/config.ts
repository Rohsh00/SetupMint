import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from root if available
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tradevault',

  // Security & Sessions
  sessionSecret: process.env.SESSION_SECRET || 'tradevault-local-development-session-secret-change-in-prod-32chars',
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // File Uploads
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads'),
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),

  // Defaults
  defaultBaseCurrency: process.env.DEFAULT_BASE_CURRENCY || 'INR',
};

// Ensure private upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}
