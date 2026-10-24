import mongoose from 'mongoose';
import { MarketDataIntegration } from '../../db/models/MarketDataIntegration.js';
import { AngelOneInstrument } from '../../db/models/AngelOneInstrument.js';
import { config } from '../../config.js';
import { decryptSecret } from '../crypto.service.js';
import { ICandleProvider, CandleFetchParams, CandleProviderResult } from './types.js';
import { mapTradeToAngelOneSymbol } from './pure/symbol-mapper.js';
import { planAngelOneChunks } from './pure/chunk-planner.js';
import { normalizeAngelOneCandles } from './pure/normalizer.js';
import { AngelOneClient } from './angel-one.client.js';
import { getCircuitBreakerForUser } from './circuit-breaker.js';

export class AngelOneCandleProvider implements ICandleProvider {
  readonly name = 'ANGEL_ONE' as const;

  async supports(trade: any, userId: string | mongoose.Types.ObjectId): Promise<boolean> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });
    if (!integration || !integration.apiKey || !integration.jwtToken) {
      return false;
    }
    if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) <= new Date()) {
      return false;
    }

    // Verify symbol can be mapped
    const underlying = (trade.underlying || trade.symbol || '').trim().toUpperCase();
    const aliasUnderlying = underlying === 'CRUDEOILMINI' ? 'CRUDEOILM' : underlying;
    const count = await AngelOneInstrument.countDocuments({
      $and: [
        { $or: [{ userId: uId }, { userId: null }] },
        {
          $or: [
            { name: underlying },
            { name: aliasUnderlying },
            { tradingsymbol: trade.symbol?.trim().toUpperCase() },
          ],
        },
      ],
    });

    return count > 0;
  }

  async getCandles(params: CandleFetchParams): Promise<CandleProviderResult> {
    const { trade, resolution, from, to, userId, isUnderlyingFallback } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const userIdStr = uId.toString();

    // 1. Verify circuit breaker state
    const breaker = getCircuitBreakerForUser(userIdStr);
    if (!breaker.canExecute()) {
      return {
        ok: false,
        reason: 'CIRCUIT_OPEN',
        message: 'Angel One circuit breaker is OPEN due to repeated upstream errors. Waiting for cooldown.',
      };
    }

    // 2. Fetch integration record & check credentials
    const integration = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });
    if (!integration || !integration.apiKey || !integration.jwtToken) {
      return {
        ok: false,
        reason: 'NOT_CONNECTED',
        message: 'Angel One is not connected. Configure API Key and connect with TOTP in Settings.',
      };
    }

    // 3. Check token expiry
    if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) <= new Date()) {
      integration.status = 'ERROR';
      integration.lastError = 'SmartAPI daily session has expired. Please re-authenticate with TOTP.';
      await integration.save();

      return {
        ok: false,
        reason: 'TOKEN_EXPIRED',
        message: 'Angel One SmartAPI daily session has expired. Please reconnect in Settings.',
      };
    }

    let apiKey: string;
    let jwtToken: string;
    try {
      apiKey = decryptSecret(integration.apiKey) as string;
      jwtToken = decryptSecret(integration.jwtToken) as string;
    } catch {
      return {
        ok: false,
        reason: 'NOT_CONNECTED',
        message: 'Failed to decrypt Angel One credentials. Please reconnect in Settings.',
      };
    }

    // 4. Resolve symboltoken from AngelOneInstrument
    const targetUnderlying = (isUnderlyingFallback && trade.underlying ? trade.underlying : (trade.underlying || trade.symbol || '')).trim().toUpperCase();
    const targetSymbol = (trade.symbol || '').trim().toUpperCase();
    const aliasUnderlying = targetUnderlying === 'CRUDEOILMINI' ? 'CRUDEOILM' : targetUnderlying;

    // Query candidates matching underlying or tradingsymbol from user or global index cache
    const candidates = await AngelOneInstrument.find({
      $and: [
        { $or: [{ userId: uId }, { userId: null }] },
        {
          $or: [
            { name: targetUnderlying },
            { name: aliasUnderlying },
            { tradingsymbol: targetSymbol },
            { tradingsymbol: targetUnderlying },
          ],
        },
      ],
    }).lean();

    const mapped = mapTradeToAngelOneSymbol(
      {
        symbol: isUnderlyingFallback && trade.underlying ? trade.underlying : trade.symbol,
        underlying: trade.underlying,
        assetClass: isUnderlyingFallback ? 'INDEX' : trade.assetClass,
        exchange: trade.exchange,
        marketSegment: isUnderlyingFallback ? 'NSE_EQ' : trade.marketSegment,
        optionType: isUnderlyingFallback ? undefined : trade.optionType,
        strikePrice: isUnderlyingFallback ? undefined : trade.strikePrice,
        expiryDate: isUnderlyingFallback ? undefined : trade.expiryDate,
      },
      candidates as any
    );

    if (!mapped || !mapped.symboltoken) {
      return {
        ok: false,
        reason: 'NO_SYMBOL_TOKEN',
        message: `No SmartAPI symbol token found for ${trade.symbol} in instrument master`,
      };
    }

    // 5. Plan date chunks and validate lookback limits
    const planResult = planAngelOneChunks(resolution, from, to);
    if (!planResult.ok) {
      return planResult;
    }

    const { interval, chunks } = planResult;

    // 6. Check and consume daily call budget atomically
    const dailyBudget = (config as any).angelOneDailyBudget || 500;
    const budgetGranted = await AngelOneClient.consumeDailyBudget(uId, dailyBudget);
    if (!budgetGranted) {
      return {
        ok: false,
        reason: 'DAILY_BUDGET_EXHAUSTED',
        message: `Daily market data budget of ${dailyBudget} API calls has been reached. Resets at midnight IST.`,
      };
    }

    // 7. Execute chunked historical candle queries
    const rawAllCandles: any[] = [];

    for (const chunk of chunks) {
      try {
        const rawChunkCandles = await AngelOneClient.getCandleData(userIdStr, apiKey, jwtToken, {
          exchange: mapped.exchange,
          symboltoken: mapped.symboltoken,
          interval,
          fromdate: chunk.fromdate,
          todate: chunk.todate,
        });

        if (Array.isArray(rawChunkCandles)) {
          rawAllCandles.push(...rawChunkCandles);
        }
      } catch (err: any) {
        if (err.message === 'TOKEN_EXPIRED') {
          integration.status = 'ERROR';
          integration.lastError = 'Token rejected by SmartAPI as expired.';
          await integration.save();

          return {
            ok: false,
            reason: 'TOKEN_EXPIRED',
            message: 'Angel One token expired during request. Please reconnect in Settings.',
          };
        }

        return {
          ok: false,
          reason: 'UPSTREAM_ERROR',
          message: err.message || 'Error occurred while querying SmartAPI historical candle endpoint',
        };
      }
    }

    // 8. Normalize, validate, and deduplicate candles
    const { candles, droppedCount } = normalizeAngelOneCandles(rawAllCandles);

    if (candles.length === 0) {
      return {
        ok: false,
        reason: 'EMPTY_RESULT',
        message: `No historical candles returned by Angel One for ${mapped.tradingsymbol} around execution window`,
      };
    }

    return {
      ok: true,
      candles,
      resolution,
      provider: 'ANGEL_ONE',
      isUnderlyingFallback: Boolean(isUnderlyingFallback),
      symbol: mapped.tradingsymbol,
      droppedRowsCount: droppedCount,
    };
  }
}
