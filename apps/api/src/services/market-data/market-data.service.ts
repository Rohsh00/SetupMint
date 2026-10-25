import mongoose from 'mongoose';
import moment from 'moment';
import { MarketDataIntegration, IMarketDataIntegrationDoc } from '../../db/models/MarketDataIntegration.js';
import { AngelOneInstrument } from '../../db/models/AngelOneInstrument.js';
import { Instrument } from '../../db/models/Instrument.js';
import { TradeCandleSnapshot } from '../../db/models/TradeCandleSnapshot.js';
import { encryptSecret, decryptSecret } from '../crypto.service.js';
import { config } from '../../config.js';
import { IMarketDataIntegrationStatus, CandleUnavailableReason, CandleFallbackProvider } from '@tradevault/shared';
import { ICandleProvider, CandleProviderResult } from './types.js';
import { FyersCandleProvider } from './fyers.provider.js';
import { AngelOneCandleProvider } from './angel-one.provider.js';
import { AngelOneClient } from './angel-one.client.js';

export class MarketDataService {
  private static fyersProvider = new FyersCandleProvider();
  private static angelOneProvider = new AngelOneCandleProvider();

  /**
   * Retrieves sanitized connection status for Angel One market data integration.
   */
  static async getAngelOneStatus(userId: string | mongoose.Types.ObjectId): Promise<IMarketDataIntegrationStatus> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });

    const dailyBudget = (config as any).angelOneDailyBudget || 500;
    const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');

    const lastInstrument = await AngelOneInstrument.findOne({
      $or: [{ userId: uId }, { userId: null }],
    })
      .sort({ refreshedAt: -1 })
      .select('refreshedAt');

    const instrumentCount = await AngelOneInstrument.countDocuments({
      $or: [{ userId: uId }, { userId: null }],
    });

    if (!integration) {
      return {
        provider: 'ANGEL_ONE',
        status: 'DISABLED',
        hasApiKey: false,
        hasClientCode: false,
        hasPin: false,
        clientCode: null,
        connected: false,
        isTokenExpired: false,
        instrumentCount,
        tokenExpiresAt: null,
        lastUsedAt: null,
        lastError: null,
        dailyCallsUsed: 0,
        dailyBudget,
        instrumentCacheRefreshedAt: lastInstrument?.refreshedAt?.toISOString() || null,
      };
    }

    const isToday = integration.dailyCallDate === today;
    const dailyCallsUsed = isToday ? integration.dailyCallCount || 0 : 0;
    const isTokenExpired = Boolean(
      integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) <= new Date()
    );
    const isConnected = Boolean(integration.tokenExpiresAt && !isTokenExpired);

    let computedStatus = integration.status;
    if (isTokenExpired) {
      computedStatus = 'ERROR';
    }

    let plainClientCode: string | null = null;
    if (integration.clientCode) {
      try {
        plainClientCode = integration.clientCode.startsWith('enc:')
          ? (decryptSecret(integration.clientCode) as string)
          : integration.clientCode;
      } catch {
        plainClientCode = integration.clientCode;
      }
    }

    return {
      provider: 'ANGEL_ONE',
      status: computedStatus,
      hasApiKey: Boolean(integration.apiKey),
      hasClientCode: Boolean(integration.clientCode),
      hasPin: Boolean(integration.pin),
      clientCode: plainClientCode,
      connected: isConnected,
      isTokenExpired,
      instrumentCount,
      tokenExpiresAt: integration.tokenExpiresAt ? integration.tokenExpiresAt.toISOString() : null,
      lastUsedAt: integration.lastUsedAt ? integration.lastUsedAt.toISOString() : null,
      lastError: integration.lastError || null,
      dailyCallsUsed,
      dailyBudget,
      instrumentCacheRefreshedAt: lastInstrument?.refreshedAt?.toISOString() || null,
    };
  }

  /**
   * Saves or updates encrypted Angel One credentials.
   * If API key or Client code changes, existing active session tokens are invalidated.
   */
  static async saveAngelOneConfig(
    userId: string | mongoose.Types.ObjectId,
    data: { apiKey: string; clientCode: string; pin: string }
  ): Promise<void> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    let integration = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });

    let existingApiKey = '';
    let existingClientCode = '';

    if (integration?.apiKey) {
      try {
        existingApiKey = decryptSecret(integration.apiKey) || '';
      } catch {
        // ignore
      }
    }
    if (integration?.clientCode) {
      try {
        existingClientCode = decryptSecret(integration.clientCode) || '';
      } catch {
        // ignore
      }
    }

    const keyChanged = existingApiKey !== data.apiKey.trim();
    const clientCodeChanged = existingClientCode !== data.clientCode.trim();

    const encApiKey = encryptSecret(data.apiKey.trim()) as string;
    const encClientCode = encryptSecret(data.clientCode.trim()) as string;
    const encPin = encryptSecret(data.pin.trim()) as string;

    if (!integration) {
      integration = new MarketDataIntegration({
        userId: uId,
        provider: 'ANGEL_ONE',
        apiKey: encApiKey,
        clientCode: encClientCode,
        pin: encPin,
        status: 'IDLE',
      });
    } else {
      integration.apiKey = encApiKey;
      integration.clientCode = encClientCode;
      integration.pin = encPin;

      if (keyChanged || clientCodeChanged) {
        integration.jwtToken = undefined;
        integration.refreshToken = undefined;
        integration.feedToken = undefined;
        integration.tokenExpiresAt = undefined;
        integration.status = 'IDLE';
      }
    }

    await integration.save();
  }

  /**
   * Connects to SmartAPI using dynamic TOTP. Never stores or logs TOTP.
   */
  static async connectAngelOne(
    userId: string | mongoose.Types.ObjectId,
    totp: string
  ): Promise<IMarketDataIntegrationStatus> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });

    if (!integration || !integration.apiKey || !integration.clientCode || !integration.pin) {
      throw new Error('Angel One credentials are missing. Save API Key, Client Code, and PIN first.');
    }

    let apiKey: string;
    let clientCode: string;
    let pin: string;
    try {
      apiKey = decryptSecret(integration.apiKey) as string;
      clientCode = decryptSecret(integration.clientCode) as string;
      pin = decryptSecret(integration.pin) as string;
    } catch {
      throw new Error('Failed to decrypt stored credentials. Please re-enter them.');
    }

    // Attempt login with TOTP
    const tokens = await AngelOneClient.login(apiKey, clientCode, pin, totp);

    // SmartAPI JWT tokens expire at 06:00 AM IST of the following day
    const tokenExpiresAt = moment().utcOffset('+05:30').add(1, 'day').startOf('day').add(6, 'hours').toDate();

    integration.jwtToken = encryptSecret(tokens.jwtToken) as string;
    integration.refreshToken = encryptSecret(tokens.refreshToken) as string;
    integration.feedToken = encryptSecret(tokens.feedToken) as string;
    integration.tokenExpiresAt = tokenExpiresAt;
    integration.status = 'IDLE';
    integration.lastError = undefined;

    await integration.save();

    return this.getAngelOneStatus(uId);
  }

  /**
   * Disconnects Angel One session, calling logout and clearing tokens.
   */
  static async disconnectAngelOne(userId: string | mongoose.Types.ObjectId): Promise<void> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });
    if (!integration) return;

    if (integration.jwtToken && integration.apiKey && integration.clientCode) {
      try {
        const apiKey = decryptSecret(integration.apiKey) as string;
        const clientCode = decryptSecret(integration.clientCode) as string;
        const jwtToken = decryptSecret(integration.jwtToken) as string;
        await AngelOneClient.logout(apiKey, clientCode, jwtToken);
      } catch {
        // Best effort
      }
    }

    integration.jwtToken = undefined;
    integration.refreshToken = undefined;
    integration.feedToken = undefined;
    integration.tokenExpiresAt = undefined;
    integration.status = 'DISABLED';
    await integration.save();
  }

  /**
   * Removes all Angel One credentials and cached user instruments.
   */
  static async deleteAngelOne(userId: string | mongoose.Types.ObjectId): Promise<void> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    await MarketDataIntegration.deleteOne({ userId: uId, provider: 'ANGEL_ONE' });
    await AngelOneInstrument.deleteMany({ userId: uId });
  }

  /**
   * Downloads official SmartAPI scrip master, filters to user underlyings + common indices,
   * and bulk-upserts atomically. Enforces a 24h cooldown on refresh.
   */
  static async refreshInstruments(
    userId: string | mongoose.Types.ObjectId,
    options: { force?: boolean } = {}
  ): Promise<{ added: number; refreshedAt: Date }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const lastRefreshed = await AngelOneInstrument.findOne({
      $or: [{ userId: uId }, { userId: null }],
    }).sort({ refreshedAt: -1 });

    const now = new Date();
    if (lastRefreshed && !options.force) {
      const hoursSince = moment(now).diff(moment(lastRefreshed.refreshedAt), 'hours');
      if (hoursSince < 24) {
        return { added: 0, refreshedAt: lastRefreshed.refreshedAt };
      }
    }

    // 1. Collect underlyings to keep: user's traded instruments + primary benchmark indices
    const userInstruments = await Instrument.find({ userId: uId }).select('symbol').lean();
    const neededUnderlyings = new Set<string>([
      'NIFTY',
      'BANKNIFTY',
      'FINNIFTY',
      'MIDCPNIFTY',
      'SENSEX',
      'CRUDEOIL',
      'CRUDEOILM',
      'NATURALGAS',
      'NATGASMINI',
      'GOLD',
      'GOLDM',
      'SILVER',
      'SILVERM',
      ...userInstruments.map((i) => i.symbol.toUpperCase()),
      ...userInstruments.map((i) => (i.symbol.toUpperCase() === 'CRUDEOILMINI' ? 'CRUDEOILM' : i.symbol.toUpperCase())),
    ]);

    // 2. Stream/fetch instrument master
    const masterList = await AngelOneClient.fetchInstrumentMaster();

    const commonIndices = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']);
    const bulkOps: any[] = [];

    for (const item of masterList) {
      const name = (item.name || '').toUpperCase().trim();
      if (!neededUnderlyings.has(name)) {
        continue;
      }

      const isCommonIndex = commonIndices.has(name);
      const targetUserId = isCommonIndex ? null : uId;

      bulkOps.push({
        updateOne: {
          filter: {
            symboltoken: String(item.token),
            exchange: String(item.exch_seg).toUpperCase(),
            userId: targetUserId,
          },
          update: {
            $set: {
              userId: targetUserId,
              symboltoken: String(item.token),
              tradingsymbol: String(item.symbol).toUpperCase(),
              name,
              exchange: String(item.exch_seg).toUpperCase(),
              instrumenttype: String(item.instrumenttype || ''),
              expiry: String(item.expiry || ''),
              strike: item.strike !== undefined ? Number(item.strike) : -1,
              lotsize: item.lotsize !== undefined ? Number(item.lotsize) : 1,
              tickSize: item.tick_size !== undefined ? Number(item.tick_size) : 0.05,
              refreshedAt: now,
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      await AngelOneInstrument.bulkWrite(bulkOps, { ordered: false });
    }

    return {
      added: bulkOps.length,
      refreshedAt: now,
    };
  }

  /**
   * Core Fallback Chain:
   * 1. Cached snapshot in TradeCandleSnapshot (if forceRefetch is false)
   * 2. If provider === 'ANGEL_ONE' -> Angel One only
   * 3. If provider === 'AUTO':
   *    - FYERS (primary)
   *    - Angel One (fallback, only if connected and token valid)
   *    - Underlying fallback (FYERS -> Angel One)
   *    - UNAVAILABLE
   */
  static async getCandlesWithFallback(params: {
    trade: any;
    resolution: string;
    from: Date;
    to: Date;
    userId: string | mongoose.Types.ObjectId;
    forceRefetch?: boolean;
    provider?: CandleFallbackProvider;
  }): Promise<CandleProviderResult> {
    const { trade, resolution, from, to, userId, forceRefetch, provider = 'AUTO' } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    let partialSnapshot: any = null;

    // 1. Check cached snapshot
    const snapshot = await TradeCandleSnapshot.findOne({
      userId: uId,
      tradeId: trade._id,
      resolution,
    });

    if (snapshot && snapshot.candles && snapshot.candles.length > 0) {
      let covFrom = snapshot.coverageFrom;
      let covTo = snapshot.coverageTo;

      if (!covFrom || !covTo) {
        // Backfill legacy snapshot coverage from first to last candle timestamp
        const firstT = snapshot.candles[0].t;
        const lastT = snapshot.candles[snapshot.candles.length - 1].t;
        covFrom = new Date(firstT < 1e11 ? firstT * 1000 : firstT);
        covTo = new Date(lastT < 1e11 ? lastT * 1000 : lastT);
      }

      // Reuse cached snapshot only if not forceRefetch and it covers the required range [from, to]
      if (!forceRefetch && covFrom.getTime() <= from.getTime() && covTo.getTime() >= to.getTime()) {
        return {
          ok: true,
          candles: snapshot.candles,
          resolution: snapshot.resolution,
          provider: snapshot.provider || 'FYERS',
          isUnderlyingFallback: Boolean(snapshot.isUnderlyingFallback),
          symbol: snapshot.symbol,
          droppedRowsCount: snapshot.droppedRowsCount || 0,
        };
      }

      partialSnapshot = snapshot;
    }

    // 2. Explicit Angel One requested
    if (provider === 'ANGEL_ONE') {
      const supports = await this.angelOneProvider.supports(trade, uId);
      if (!supports) {
        const status = await this.getAngelOneStatus(uId);
        if (status.status !== 'IDLE' || !status.tokenExpiresAt) {
          return {
            ok: false,
            reason: 'NOT_CONNECTED',
            message: 'Angel One is not connected or token has expired. Connect in Settings.',
          };
        }
      }

      const res = await this.angelOneProvider.getCandles({
        trade,
        resolution,
        from,
        to,
        userId: uId,
        isUnderlyingFallback: false,
      });

      if (res.ok) {
        await this.persistSnapshot(uId, trade._id, res, from, to);
      }
      return res;
    }

    // 3. Fallback Chain: AUTO mode
    // Step 3a: Try FYERS primary
    let fyersResult: CandleProviderResult | null = null;
    try {
      const fyersSupports = await this.fyersProvider.supports(trade, uId);
      if (fyersSupports) {
        fyersResult = await this.fyersProvider.getCandles({
          trade,
          resolution,
          from,
          to,
          userId: uId,
          isUnderlyingFallback: false,
        });

        if (fyersResult.ok && fyersResult.candles.length > 0) {
          await this.persistSnapshot(uId, trade._id, fyersResult, from, to);
          return fyersResult;
        }
      }
    } catch {
      // Proceed to Angel One fallback
    }

    // Step 3b: Try Angel One fallback
    try {
      const angelSupports = await this.angelOneProvider.supports(trade, uId);
      if (angelSupports) {
        const angelResult = await this.angelOneProvider.getCandles({
          trade,
          resolution,
          from,
          to,
          userId: uId,
          isUnderlyingFallback: false,
        });

        if (angelResult.ok && angelResult.candles.length > 0) {
          await this.persistSnapshot(uId, trade._id, angelResult, from, to);
          return angelResult;
        }
      }
    } catch {
      // Proceed to underlying fallback
    }

    // Step 3c: Underlying fallback (if trade is an option/derivative with an underlying)
    if (trade.underlying && trade.underlying !== trade.symbol) {
      // Try FYERS underlying
      try {
        const undFyers = await this.fyersProvider.getCandles({
          trade,
          resolution,
          from,
          to,
          userId: uId,
          isUnderlyingFallback: true,
        });
        if (undFyers.ok && undFyers.candles.length > 0) {
          await this.persistSnapshot(uId, trade._id, undFyers, from, to);
          return undFyers;
        }
      } catch {
        // Try Angel One underlying
      }

      // Try Angel One underlying
      try {
        const undAngel = await this.angelOneProvider.getCandles({
          trade,
          resolution,
          from,
          to,
          userId: uId,
          isUnderlyingFallback: true,
        });
        if (undAngel.ok && undAngel.candles.length > 0) {
          await this.persistSnapshot(uId, trade._id, undAngel, from, to);
          return undAngel;
        }
      } catch {
        // Fallback chain exhausted
      }
    }

    // If provider fetch failed, but we had a partial cached snapshot, fallback to it
    if (partialSnapshot) {
      return {
        ok: true,
        candles: partialSnapshot.candles,
        resolution: partialSnapshot.resolution,
        provider: partialSnapshot.provider || 'FYERS',
        isUnderlyingFallback: Boolean(partialSnapshot.isUnderlyingFallback),
        symbol: partialSnapshot.symbol,
        droppedRowsCount: partialSnapshot.droppedRowsCount || 0,
      };
    }

    // If FYERS returned an explicit error reason, preserve it; otherwise indicate no candles found
    return (
      fyersResult || {
        ok: false,
        reason: 'EMPTY_RESULT',
        message: `Historical candlestick data unavailable across all configured market data providers for ${trade.symbol}`,
      }
    );
  }

  private static async persistSnapshot(
    userId: mongoose.Types.ObjectId,
    tradeId: mongoose.Types.ObjectId,
    result: CandleProviderResult & { ok: true },
    requestedFrom?: Date,
    requestedTo?: Date
  ): Promise<void> {
    const firstT = result.candles.length > 0 ? result.candles[0].t : 0;
    const lastT = result.candles.length > 0 ? result.candles[result.candles.length - 1].t : 0;
    const candleStart = firstT ? new Date(firstT < 1e11 ? firstT * 1000 : firstT) : new Date();
    const candleEnd = lastT ? new Date(lastT < 1e11 ? lastT * 1000 : lastT) : new Date();

    const existing = await TradeCandleSnapshot.findOne({
      userId,
      tradeId,
      resolution: result.resolution,
    });

    let covFrom = requestedFrom || candleStart;
    let covTo = requestedTo || candleEnd;

    if (existing?.coverageFrom && existing.coverageFrom.getTime() < covFrom.getTime()) {
      covFrom = existing.coverageFrom;
    }
    if (existing?.coverageTo && existing.coverageTo.getTime() > covTo.getTime()) {
      covTo = existing.coverageTo;
    }

    // Merge existing and new candles without duplicates
    const candleMap = new Map<number, any>();
    if (existing?.candles) {
      for (const c of existing.candles) {
        candleMap.set(c.t, c);
      }
    }
    for (const c of result.candles) {
      candleMap.set(c.t, c);
    }
    const mergedCandles = Array.from(candleMap.values()).sort((a, b) => a.t - b.t);

    await TradeCandleSnapshot.findOneAndUpdate(
      { userId, tradeId, resolution: result.resolution },
      {
        $set: {
          symbol: result.symbol,
          resolution: result.resolution,
          candles: mergedCandles,
          provider: result.provider,
          isUnderlyingFallback: result.isUnderlyingFallback,
          droppedRowsCount: result.droppedRowsCount,
          coverageFrom: covFrom,
          coverageTo: covTo,
          fetchedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }
}
