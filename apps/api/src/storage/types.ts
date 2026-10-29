import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';

export interface IStorageProvider {
  save(key: string, buffer: Buffer, mime: string): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>; // idempotent
  exists(key: string): Promise<boolean>;
}

// Allows UUID files with approved image extensions (png, jpg, jpeg, webp, svg for demo charts),
// synthetic demo charts (demo_chart_<tradeId>_<category>_<timestamp>.svg),
// and probe healthcheck objects (healthcheck/<uuid>.png).
const UUID_FILE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|svg)$/i;
const DEMO_CHART_REGEX = /^demo_chart_[a-f0-9]{24}_[a-z0-9_-]+_\d+\.svg$/i;
const PROBE_REGEX = /^healthcheck\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;

export function assertValidKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid storage key: key must be a non-empty string');
  }

  // Reject path traversal, backslashes, leading slash, and consecutive slashes
  if (key.includes('..') || key.includes('\\') || key.startsWith('/') || key.includes('//')) {
    throw new Error(`Invalid storage key: path-like traversal and absolute keys are rejected: "${key}"`);
  }

  if (UUID_FILE_REGEX.test(key) || DEMO_CHART_REGEX.test(key) || PROBE_REGEX.test(key)) {
    return;
  }

  throw new Error(
    `Invalid storage key: "${key}" does not match allowed pattern (<uuid>.(png|jpe?g|webp|svg) or synthetic chart)`
  );
}
