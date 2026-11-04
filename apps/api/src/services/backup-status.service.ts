import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import type { ISystemBackupStatus } from '@tradevault/shared';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

interface CachedStatus {
  timestamp: number;
  data: ISystemBackupStatus;
}

let cachedStatus: CachedStatus | null = null;

export class BackupStatusService {
  /**
   * Resets the in-memory cache (primarily for tests).
   */
  static resetCache(): void {
    cachedStatus = null;
  }

  private static findLocalStatusPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'backups/status.json'),
      path.resolve(process.cwd(), '../../backups/status.json'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Reads off-site backup status, cached for 5 minutes (or invalidated when local status.json changes).
   */
  static async getStatus(): Promise<ISystemBackupStatus> {
    const now = Date.now();
    const localPath = this.findLocalStatusPath();
    const localMtimeMs = localPath ? fs.statSync(localPath).mtimeMs : 0;

    if (
      cachedStatus &&
      now - cachedStatus.timestamp < CACHE_TTL_MS &&
      localMtimeMs <= cachedStatus.timestamp
    ) {
      return cachedStatus.data;
    }

    const hasBackupConfig = Boolean(
      config.backupS3Bucket && config.backupS3Endpoint && config.backupS3AccessKeyId && config.backupS3SecretAccessKey
    );

    if (!hasBackupConfig) {
      const unconfigured: ISystemBackupStatus = { configured: false };
      cachedStatus = { timestamp: now, data: unconfigured };
      return unconfigured;
    }

    let remoteData: any = null;
    let localData: any = null;

    // 1. Read local backups/status.json if available
    if (localPath) {
      try {
        localData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      } catch {
        // Ignored
      }
    }

    // 2. Try reading status/latest.json from off-site S3 bucket
    try {
      const s3Client = new S3Client({
        region: config.backupS3Region || 'auto',
        endpoint: config.backupS3Endpoint,
        credentials: {
          accessKeyId: config.backupS3AccessKeyId,
          secretAccessKey: config.backupS3SecretAccessKey,
        },
        forcePathStyle: true,
      });

      const statusKey = `${config.backupS3Prefix}/status/latest.json`;
      const resp = await s3Client.send(
        new GetObjectCommand({
          Bucket: config.backupS3Bucket,
          Key: statusKey,
        })
      );

      if (resp.Body) {
        const chunks: Buffer[] = [];
        for await (const chunk of resp.Body as any) {
          chunks.push(Buffer.from(chunk));
        }
        remoteData = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      }
    } catch {
      // Fallback to localData
    }

    // Pick whichever status record has the newer lastRunAt timestamp
    let statusData: any = remoteData || localData;
    if (remoteData && localData) {
      const remoteTime = remoteData.lastRunAt ? new Date(remoteData.lastRunAt).getTime() : 0;
      const localTime = localData.lastRunAt ? new Date(localData.lastRunAt).getTime() : 0;
      statusData = localTime >= remoteTime ? localData : remoteData;
    }

    if (!statusData) {
      const pending: ISystemBackupStatus = {
        configured: true,
        lastRunAt: null,
        lastSuccessAt: null,
        result: null,
      };
      cachedStatus = { timestamp: now, data: pending };
      return pending;
    }

    const lastSuccessAt = statusData.lastSuccessAt || null;
    const isStale = lastSuccessAt
      ? Date.now() - new Date(lastSuccessAt).getTime() > 36 * 3600 * 1000
      : true;

    const result: ISystemBackupStatus = {
      configured: true,
      lastRunAt: statusData.lastRunAt || null,
      lastSuccessAt,
      result: statusData.result || null,
      durationMs: statusData.durationMs,
      sizeBytes: statusData.sizeBytes,
      uploadedKey: statusData.uploadedKey,
      error: statusData.error,
      isStale,
    };

    cachedStatus = { timestamp: now, data: result };
    return result;
  }
}
