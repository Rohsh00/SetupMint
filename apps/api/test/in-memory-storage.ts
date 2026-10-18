import { Readable } from 'stream';
import { IStorageProvider, assertValidKey } from '../src/storage/types.js';

export class InMemoryStorage implements IStorageProvider {
  private files = new Map<string, { buffer: Buffer; mime: string }>();

  async save(key: string, buffer: Buffer, mime: string): Promise<void> {
    assertValidKey(key);
    this.files.set(key, { buffer: Buffer.from(buffer), mime });
  }

  async read(key: string): Promise<Readable> {
    assertValidKey(key);
    const item = this.files.get(key);
    if (!item) {
      const err = new Error(`File not found in storage: ${key}`);
      (err as any).code = 'FILE_NOT_FOUND';
      throw err;
    }
    return Readable.from(item.buffer);
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    this.files.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    assertValidKey(key);
    return this.files.has(key);
  }

  clear(): void {
    this.files.clear();
  }

  count(): number {
    return this.files.size;
  }

  getBuffer(key: string): Buffer | undefined {
    return this.files.get(key)?.buffer;
  }
}
