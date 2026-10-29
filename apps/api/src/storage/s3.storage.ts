import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import crypto from 'crypto';
import { IStorageProvider, assertValidKey } from './types.js';

export interface S3StorageConfig {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

export class S3Storage implements IStorageProvider {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3StorageConfig, clientOverride?: S3Client) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ? config.prefix.replace(/^\/+|\/+$/g, '') : '';
    this.client =
      clientOverride ||
      new S3Client({
        region: config.region || 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: true,
      });
  }

  private resolveKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async save(key: string, buffer: Buffer, mime: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.resolveKey(key),
        Body: buffer,
        ContentType: mime,
      })
    );
  }

  async read(key: string): Promise<Readable> {
    assertValidKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.resolveKey(key),
        })
      );
      if (!response.Body) {
        const notFoundErr = new Error(`Object body is empty for key: ${key}`);
        (notFoundErr as any).code = 'FILE_NOT_FOUND';
        throw notFoundErr;
      }
      return response.Body as Readable;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404 || err.code === 'FILE_NOT_FOUND') {
        const notFoundErr = new Error(`File not found in storage: ${key}`);
        (notFoundErr as any).code = 'FILE_NOT_FOUND';
        throw notFoundErr;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.resolveKey(key),
        })
      );
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return; // Idempotent
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertValidKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.resolveKey(key),
        })
      );
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Health check executed at startup:
   * 1. Checks bucket access via HeadBucket
   * 2. Writes, reads, and deletes a probe object to ensure read/write access
   */
  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));

    const probeUuid = crypto.randomUUID();
    const probeKey = `healthcheck/${probeUuid}.png`;
    const probeBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await this.save(probeKey, probeBuffer, 'image/png');

    const stream = await this.read(probeKey);
    for await (const _ of stream) {
      // consume stream probe
    }

    await this.delete(probeKey);
  }
}
