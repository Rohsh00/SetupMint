/**
 * Idempotency & In-Flight Lock Service for Broker Order Executions.
 * Prevents double-clicks, retry storms, and race conditions from placing duplicate
 * market orders or flipping positions into reverse exposure.
 */

interface IdempotencyRecord {
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  result?: any;
  error?: any;
  timestamp: number;
}

export class IdempotencyService {
  private static store = new Map<string, IdempotencyRecord>();
  private static TTL_MS = 2 * 60 * 1000; // 2 minutes retention window

  /**
   * Generates or sanitizes a composite idempotency key per user & action.
   */
  static makeKey(userId: string, action: string, keyOrTradeId?: string): string {
    const raw = keyOrTradeId || 'default';
    return `${userId}:${action}:${raw}`;
  }

  /**
   * Attempts to acquire an execution lock for the given idempotency key.
   * If an identical operation is already completed, returns the cached result.
   * If an operation is currently pending, throws a 409 CONCURRENT_EXECUTION error.
   */
  static acquireLock<T>(
    compositeKey: string
  ): { isLocked: boolean; cachedResult?: T } {
    this.cleanup();

    const existing = this.store.get(compositeKey);
    if (existing) {
      if (existing.status === 'PENDING') {
        throw new Error('Concurrent order execution in progress for this request. Please wait.');
      }
      if (existing.status === 'RESOLVED') {
        return { isLocked: false, cachedResult: existing.result as T };
      }
    }

    // Set lock
    this.store.set(compositeKey, {
      status: 'PENDING',
      timestamp: Date.now(),
    });

    return { isLocked: true };
  }

  /**
   * Resolves the idempotency record with the successful broker execution result.
   */
  static resolve(compositeKey: string, result: any): void {
    this.store.set(compositeKey, {
      status: 'RESOLVED',
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Rejects the idempotency record or clears the lock on failure so the user may retry.
   */
  static reject(compositeKey: string, error: any): void {
    // If the error was a transient failure or pre-flight check failure, clear lock so retry is permitted
    this.store.delete(compositeKey);
  }

  /**
   * Periodic pruning of stale records past TTL.
   */
  private static cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now - record.timestamp > this.TTL_MS) {
        this.store.delete(key);
      }
    }
  }
}

