export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private failureThreshold: number;
  private cooldownMs: number;
  private now: () => number;

  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: CircuitState = 'CLOSED';

  constructor(
    optionsOrThreshold?: CircuitBreakerOptions | number,
    cooldownMs?: number,
    now?: () => number
  ) {
    if (typeof optionsOrThreshold === 'number') {
      this.failureThreshold = optionsOrThreshold;
      this.cooldownMs = cooldownMs ?? 60000;
      this.now = now ?? (() => Date.now());
    } else {
      this.failureThreshold = optionsOrThreshold?.failureThreshold ?? 3;
      this.cooldownMs = optionsOrThreshold?.cooldownMs ?? 60000;
      this.now = optionsOrThreshold?.now ?? (() => Date.now());
    }
  }

  canExecute(): boolean {
    const currentTime = this.now();

    if (this.state === 'OPEN') {
      if (currentTime - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = this.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState {
    const currentTime = this.now();
    if (this.state === 'OPEN' && currentTime - this.lastFailureTime >= this.cooldownMs) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
  }
}

// Registry of user-scoped circuit breakers
const userBreakerRegistry = new Map<string, CircuitBreaker>();

export function getCircuitBreakerForUser(
  userId: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  if (!userBreakerRegistry.has(userId)) {
    userBreakerRegistry.set(userId, new CircuitBreaker(options));
  }
  return userBreakerRegistry.get(userId)!;
}

export function resetAllCircuitBreakers(): void {
  userBreakerRegistry.clear();
}
