import mongoose from 'mongoose';
import { config } from '../config.js';

/**
 * Extracts the database host safely without ever logging or leaking user credentials.
 */
export function extractMongoHost(uri: string): string {
  try {
    const match = uri.match(/@([^/?#]+)/);
    if (match && match[1]) {
      return match[1];
    }
    const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    return parsed.host || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}

/**
 * Validates that the URI is an Atlas cluster URI and ensures default database and parameters.
 */
export function validateAndFormatAtlasUri(rawUri: string | undefined): { uri: string; host: string } {
  if (!rawUri || typeof rawUri !== 'string' || rawUri.trim() === '') {
    throw new Error(
      'MONGODB_URI is required but was not provided. SetupMint is strictly CLOUD-ONLY with MongoDB Atlas. ' +
        'Please set MONGODB_URI to your Atlas connection string in .env.'
    );
  }

  const trimmed = rawUri.trim();
  const isAtlas = trimmed.startsWith('mongodb+srv://') || trimmed.includes('.mongodb.net');
  if (!isAtlas) {
    const safeDisplay = trimmed.split('@').pop() || trimmed;
    throw new Error(
      `Invalid MONGODB_URI: "${safeDisplay}". SetupMint requires a MongoDB Atlas cluster URI ` +
        `(e.g., mongodb+srv://... or *.mongodb.net). Local embedded and standalone MongoDB instances have been permanently removed.`
    );
  }

  const host = extractMongoHost(trimmed);

  // Ensure DB name /tradevault and query params retryWrites=true&w=majority are present
  const queryIndex = trimmed.indexOf('?');
  const basePart = queryIndex !== -1 ? trimmed.substring(0, queryIndex) : trimmed;
  const queryPart = queryIndex !== -1 ? trimmed.substring(queryIndex + 1) : '';

  let finalBase = basePart;
  const lastSlashIndex = basePart.lastIndexOf('/');
  const protocolEndIndex = basePart.indexOf('://') + 2;

  if (lastSlashIndex <= protocolEndIndex || lastSlashIndex === basePart.length - 1) {
    finalBase = basePart.replace(/\/+$/, '') + '/tradevault';
  }

  const params = new URLSearchParams(queryPart);
  if (!params.has('retryWrites')) {
    params.set('retryWrites', 'true');
  }
  if (!params.has('w')) {
    params.set('w', 'majority');
  }

  const finalQuery = params.toString();
  const formattedUri = finalQuery ? `${finalBase}?${finalQuery}` : finalBase;

  return { uri: formattedUri, host };
}

/**
 * Establishes a single, un-fallback connection to MongoDB Atlas.
 * In production, fails fast and exits non-zero if misconfigured or unreachable.
 */
export async function connectDatabase(overrideUri?: string, forceAtlasValidation = false): Promise<string> {
  const isTest = (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) && !forceAtlasValidation;
  const rawUri = overrideUri !== undefined ? overrideUri : (config.mongodbUri || process.env.MONGODB_URI);

  if (isTest) {
    if (!rawUri) {
      throw new Error('Test database URI not provided. Vitest setup must provide a valid test URI.');
    }
    await mongoose.connect(rawUri, {
      serverSelectionTimeoutMS: 10000,
    });
    return rawUri;
  }

  const { uri, host } = validateAndFormatAtlasUri(rawUri);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[DB] Connected to Atlas MongoDB at ${host}`);
    return uri;
  } catch (err: any) {
    // Log host only, never credentials
    console.error(`[DB Error] Fatal: Failed to connect to MongoDB Atlas cluster at host: "${host}". Error: ${err.message}`);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    console.log('[DB] Disconnected from database.');
  } catch (err: any) {
    console.error('[DB] Error during disconnection:', err.message);
  }
}
