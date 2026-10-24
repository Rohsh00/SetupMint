import moment from 'moment';
import mongoose from 'mongoose';
import { MarketDataIntegration } from '../../db/models/MarketDataIntegration.js';
import { config } from '../../config.js';
import { decryptSecret } from '../crypto.service.js';
import { getCircuitBreakerForUser } from './circuit-breaker.js';

export interface SmartApiLoginResult {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
}

export interface SmartApiCandleParams {
  exchange: string;
  symboltoken: string;
  interval: string;
  fromdate: string; // 'YYYY-MM-DD HH:mm'
  todate: string;   // 'YYYY-MM-DD HH:mm'
}

export class AngelOneClient {
  private static readonly API_BASE = 'https://apiconnect.angelone.in';
  private static readonly INSTRUMENT_MASTER_DEFAULT =
    'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

  // In-memory rate limiting queues per user (max 3 req/sec)
  private static userLastCallTime = new Map<string, number>();

  /**
   * Enforces 3 req/sec spacing per user (334ms minimum delay between calls).
   */
  private static async throttle(userId: string): Promise<void> {
    const lastCall = this.userLastCallTime.get(userId) || 0;
    const now = Date.now();
    const elapsed = now - lastCall;
    const minSpacing = 340; // ~3 req/sec

    if (elapsed < minSpacing) {
      await new Promise((r) => setTimeout(r, minSpacing - elapsed));
    }
    this.userLastCallTime.set(userId, Date.now());
  }

  /**
   * Helper to build standard SmartAPI client headers with safety and zero leakage.
   */
  private static getHeaders(apiKey: string, jwtToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': '127.0.0.1',
      'X-MACAddress': 'fe80::1',
      'X-PrivateKey': apiKey,
    };
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }
    return headers;
  }

  /**
   * Authenticates with SmartAPI using Client Code, PIN, and dynamic TOTP.
   * Generates JWT token, Refresh token, and Feed token.
   */
  static async login(
    apiKey: string,
    clientCode: string,
    pin: string,
    totp: string
  ): Promise<SmartApiLoginResult> {
    const url = `${this.API_BASE}/rest/auth/angelbroking/user/v1/loginByPassword`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(apiKey),
        body: JSON.stringify({
          clientcode: clientCode.trim(),
          password: pin.trim(),
          totp: totp.trim(),
        }),
        signal: controller.signal,
      });

      const body = (await res.json()) as any;

      if (!res.ok || !body?.status || !body?.data?.jwtToken) {
        const errorMsg = body?.message || `SmartAPI authentication failed (HTTP ${res.status})`;
        throw new Error(errorMsg);
      }

      return {
        jwtToken: body.data.jwtToken,
        refreshToken: body.data.refreshToken,
        feedToken: body.data.feedToken || '',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Logs out and terminates active SmartAPI session.
   */
  static async logout(apiKey: string, clientCode: string, jwtToken: string): Promise<void> {
    const url = `${this.API_BASE}/rest/secure/angelbroking/user/v1/logout`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(apiKey, jwtToken),
        body: JSON.stringify({ clientcode: clientCode }),
        signal: controller.signal,
      });
    } catch {
      // Best-effort logout
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Consumes one request from the daily budget atomically.
   * Returns true if budget allowed and recorded, false if exhausted.
   */
  static async consumeDailyBudget(
    userId: mongoose.Types.ObjectId | string,
    budgetCap: number = 500
  ): Promise<boolean> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');

    // Atomic update preventing race conditions across processes
    const updated = await MarketDataIntegration.findOneAndUpdate(
      {
        userId: uId,
        provider: 'ANGEL_ONE',
        $or: [
          { dailyCallDate: { $ne: today } },
          { dailyCallCount: { $lt: budgetCap } },
        ],
      },
      [
        {
          $set: {
            dailyCallCount: {
              $cond: [
                { $eq: ['$dailyCallDate', today] },
                { $add: ['$dailyCallCount', 1] },
                1,
              ],
            },
            dailyCallDate: today,
            lastUsedAt: new Date(),
          },
        },
      ],
      { new: true }
    );

    return Boolean(updated);
  }

  /**
   * Fetches historical candlestick array with bounded retries, full jitter backoff,
   * circuit breaker, and timeout.
   */
  static async getCandleData(
    userId: string,
    apiKey: string,
    jwtToken: string,
    params: SmartApiCandleParams
  ): Promise<any[]> {
    const breaker = getCircuitBreakerForUser(userId);
    if (!breaker.canExecute()) {
      throw new Error('CIRCUIT_OPEN: Angel One market data circuit breaker is open due to consecutive failures');
    }

    const url = `${this.API_BASE}/rest/secure/angelbroking/historical/v1/getCandleData`;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      await this.throttle(userId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: this.getHeaders(apiKey, jwtToken),
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (res.status === 401) {
          // Auth failure: do not retry; mark token expired
          breaker.recordFailure();
          throw new Error('TOKEN_EXPIRED');
        }

        if (res.status === 429 || res.status >= 500) {
          // Rate limited or upstream error: retry with exponential backoff + jitter
          breaker.recordFailure();
          if (attempts >= maxAttempts) {
            throw new Error(`Upstream error from SmartAPI (HTTP ${res.status}) after ${attempts} attempts`);
          }

          const retryAfter = res.headers.get('Retry-After');
          const delayMs = retryAfter
            ? Number(retryAfter) * 1000
            : Math.floor(Math.pow(2, attempts) * 300 + Math.random() * 200);

          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        if (!res.ok) {
          // Other 4xx error (e.g. invalid parameter)
          breaker.recordFailure();
          throw new Error(`SmartAPI error (HTTP ${res.status})`);
        }

        const data = (await res.json()) as any;

        if (!data || data.status === false) {
          if (data?.errorcode === 'AB1004' || data?.message?.includes('Token Expired')) {
            breaker.recordFailure();
            throw new Error('TOKEN_EXPIRED');
          }
          breaker.recordSuccess();
          return [];
        }

        breaker.recordSuccess();
        return Array.isArray(data.data) ? data.data : [];
      } catch (err: any) {
        if (err.name === 'AbortError') {
          breaker.recordFailure();
          if (attempts >= maxAttempts) {
            throw new Error('SmartAPI request timed out after 10 seconds');
          }
        } else if (err.message === 'TOKEN_EXPIRED') {
          throw err;
        } else if (attempts >= maxAttempts) {
          breaker.recordFailure();
          throw err;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return [];
  }

  /**
   * Fetches public scrip master JSON.
   */
  static async fetchInstrumentMaster(customUrl?: string): Promise<any[]> {
    const url = customUrl || this.INSTRUMENT_MASTER_DEFAULT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Failed to download SmartAPI Scrip Master (HTTP ${res.status})`);
      }
      return (await res.json()) as any[];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
