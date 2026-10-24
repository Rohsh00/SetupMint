import mongoose from 'mongoose';
import { BrokerIntegration } from '../../db/models/BrokerIntegration.js';
import { formatFyersSymbol } from '../fyers-symbol.js';
import { FyersService } from '../fyers.service.js';
import { ICandleProvider, CandleFetchParams, CandleProviderResult } from './types.js';

export class FyersCandleProvider implements ICandleProvider {
  readonly name = 'FYERS' as const;

  async supports(_trade: any, userId: string | mongoose.Types.ObjectId): Promise<boolean> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    if (!integration || !integration.appId || !integration.accessToken) {
      return false;
    }
    const tokenExpiry = integration.tokenExpiresAt || integration.authCodeExpiresAt;
    if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
      return false;
    }
    return true;
  }

  async getCandles(params: CandleFetchParams): Promise<CandleProviderResult> {
    const { trade, resolution, from, to, userId, isUnderlyingFallback } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const symbolToUse = isUnderlyingFallback && trade.underlying ? trade.underlying : trade.symbol;

    const fyersSymbol = formatFyersSymbol({
      symbol: symbolToUse,
      underlying: trade.underlying,
      assetClass: isUnderlyingFallback ? (['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].includes(symbolToUse) ? 'INDEX' : 'EQUITY') : trade.assetClass,
      exchange: trade.exchange,
      marketSegment: isUnderlyingFallback ? 'NSE_EQ' : trade.marketSegment,
      optionType: isUnderlyingFallback ? undefined : trade.optionType,
      strikePrice: isUnderlyingFallback ? undefined : trade.strikePrice,
      expiryDate: isUnderlyingFallback ? undefined : trade.expiryDate,
    });

    try {
      const candles = await FyersService.getHistoricalCandles(uId, fyersSymbol, resolution, from, to);

      if (!candles || candles.length === 0) {
        return {
          ok: false,
          reason: 'EMPTY_RESULT',
          message: `No candles returned by FYERS for ${fyersSymbol}`,
        };
      }

      return {
        ok: true,
        candles,
        resolution,
        provider: 'FYERS',
        isUnderlyingFallback: Boolean(isUnderlyingFallback),
        symbol: fyersSymbol,
        droppedRowsCount: 0,
      };
    } catch (err: any) {
      const msg = err.message || 'FYERS candle fetch failed';
      if (msg.includes('expired') || msg.includes('missing')) {
        return { ok: false, reason: 'TOKEN_EXPIRED', message: msg };
      }
      return { ok: false, reason: 'UPSTREAM_ERROR', message: msg };
    }
  }
}
