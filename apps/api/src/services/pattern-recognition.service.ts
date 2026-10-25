import mongoose from 'mongoose';
import { Trade, Strategy, TradeCandleSnapshot } from '../db/models/index.js';
import { MarketDataService } from './market-data/index.js';
import {
  detectHtfTrend4h,
  detectLtfSetup5m,
  matchStrategyAndVariant,
  aggregateCandles,
  IExcursionCandle,
} from '@tradevault/financial-engine';

export interface IAutoClassifyResult {
  tradeId: string;
  symbol: string;
  direction: string;
  strategyId?: string;
  strategyName: string;
  variantKey?: string;
  variantName?: string;
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  pattern: string;
  patternType: string;
  secondLegStatus: string;
  liquiditySide: string;
  sweepExtreme?: number;
  liquidityLevel?: number;
  confidence: number;
  reasoning: string;
}

export class PatternRecognitionService {
  /**
   * Fetches or derives 5M candles for the trade around entry.
   */
  static async get5mCandlesForTrade(
    trade: any,
    userId: mongoose.Types.ObjectId
  ): Promise<IExcursionCandle[]> {
    const sessionAnchor =
      trade.exchange === 'MCX' || trade.marketSegment === 'MCX' ? '09:00' : '09:15';

    // 1. Check cached snapshot for 5m
    const cached5m = await TradeCandleSnapshot.findOne({
      userId,
      tradeId: trade._id,
      resolution: '5',
    });
    if (cached5m && cached5m.candles && cached5m.candles.length >= 5) {
      return cached5m.candles as IExcursionCandle[];
    }

    // 2. Check cached snapshot for 1m and aggregate to 5m
    const cached1m = await TradeCandleSnapshot.findOne({
      userId,
      tradeId: trade._id,
      resolution: '1',
    });
    if (cached1m && cached1m.candles && cached1m.candles.length >= 10) {
      const agg = aggregateCandles(cached1m.candles as IExcursionCandle[], 5, sessionAnchor);
      return agg.candles;
    }

    // 3. Fetch from market data provider
    const entryMs = new Date(trade.entryTime).getTime();
    const from5m = new Date(entryMs - 12 * 60 * 60 * 1000);
    const to5m = new Date(trade.exitTime ? new Date(trade.exitTime).getTime() + 10 * 60 * 1000 : entryMs + 60 * 60 * 1000);

    try {
      const res = await MarketDataService.getCandlesWithFallback({
        trade,
        resolution: '5',
        from: from5m,
        to: to5m,
        userId,
      });

      if (res.ok && res.candles && res.candles.length > 0) {
        return res.candles as IExcursionCandle[];
      }
    } catch {
      // Continue to fallback
    }

    // Fallback: If option traded, try underlying fallback
    if (trade.assetClass === 'OPTIONS' && trade.underlying) {
      try {
        const resUnd = await MarketDataService.getCandlesWithFallback({
          trade,
          resolution: '5',
          from: from5m,
          to: to5m,
          userId,
          provider: 'AUTO',
        });
        if (resUnd.ok && resUnd.candles && resUnd.candles.length > 0) {
          return resUnd.candles as IExcursionCandle[];
        }
      } catch {
        // Ignored
      }
    }

    return [];
  }

  /**
   * Fetches or derives 4H (240m) candles for the trade's underlying to evaluate HTF trend.
   */
  static async get4hCandlesForTrade(
    trade: any,
    userId: mongoose.Types.ObjectId
  ): Promise<IExcursionCandle[]> {
    const sessionAnchor =
      trade.exchange === 'MCX' || trade.marketSegment === 'MCX' ? '09:00' : '09:15';

    // 1. Check cached snapshot for 4h (240)
    const cached240 = await TradeCandleSnapshot.findOne({
      userId,
      tradeId: trade._id,
      resolution: '240',
    });
    if (cached240 && cached240.candles && cached240.candles.length >= 5) {
      return cached240.candles as IExcursionCandle[];
    }

    // 2. Fetch ~30 days of 60m or 4h candles
    const entryMs = new Date(trade.entryTime).getTime();
    const from4h = new Date(entryMs - 30 * 24 * 60 * 60 * 1000);
    const to4h = new Date(entryMs);

    // HTF market structure for options/derivatives is always determined by the underlying index/future
    const proxyTrade = {
      ...trade.toObject ? trade.toObject() : trade,
      symbol: trade.underlying || trade.symbol,
      assetClass: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].includes(
        trade.underlying || trade.symbol
      )
        ? 'INDEX'
        : trade.assetClass === 'OPTIONS'
        ? 'EQUITY'
        : trade.assetClass,
      optionType: undefined,
      strikePrice: undefined,
      expiryDate: undefined,
    };

    try {
      // Try 60m candles and aggregate to 240m (4H)
      const res60 = await MarketDataService.getCandlesWithFallback({
        trade: proxyTrade,
        resolution: '60',
        from: from4h,
        to: to4h,
        userId,
      });

      if (res60.ok && res60.candles && res60.candles.length > 0) {
        const agg4h = aggregateCandles(res60.candles as IExcursionCandle[], 240, sessionAnchor);
        if (agg4h.candles.length >= 5) {
          return agg4h.candles;
        }
      }
    } catch {
      // Continue to 5m fallback
    }

    try {
      // Fallback: If 60m not available, try 5m over last 10 days and aggregate
      const from10d = new Date(entryMs - 10 * 24 * 60 * 60 * 1000);
      const res5m = await MarketDataService.getCandlesWithFallback({
        trade: proxyTrade,
        resolution: '5',
        from: from10d,
        to: to4h,
        userId,
      });

      if (res5m.ok && res5m.candles && res5m.candles.length > 0) {
        const agg4h = aggregateCandles(res5m.candles as IExcursionCandle[], 240, sessionAnchor);
        if (agg4h.candles.length >= 3) {
          return agg4h.candles;
        }
      }
    } catch {
      // Continue
    }

    return [];
  }

  /**
   * Classifies a single trade by analyzing 4H trend + 5M pattern and matching to active strategies.
   */
  static async classifyTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IAutoClassifyResult> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const trade = await Trade.findOne({ _id: tId, userId: uId });
    if (!trade) {
      throw new Error(`Trade ${tradeId} not found`);
    }

    // 1. Fetch 5M and 4H candles
    const [candles5m, candles4h] = await Promise.all([
      this.get5mCandlesForTrade(trade, uId),
      this.get4hCandlesForTrade(trade, uId),
    ]);

    // 2. Run Financial Engine 4H Trend Detection
    const htfResult = detectHtfTrend4h(candles4h);

    // 3. Run Financial Engine 5M Setup Pattern Recognition
    const entryPrice =
      trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0;
    const entryTimeMs = new Date(trade.entryTime).getTime();

    const ltfResult = detectLtfSetup5m({
      candles5m,
      direction: trade.direction,
      entryTimeMs,
      entryPrice,
    });

    // 4. Fetch User's Active Strategies
    const availableStrategies = await Strategy.find({ userId: uId, isActive: true }).lean();

    // 5. Match Strategy and Variant
    const match = matchStrategyAndVariant({
      htfTrend: htfResult.htfTrend,
      ltfSetup: ltfResult,
      direction: trade.direction,
      availableStrategies,
    });

    // 6. Update Trade Document
    if (match.strategyId) {
      trade.strategyId = new mongoose.Types.ObjectId(match.strategyId);
      trade.strategyName = match.strategyName;
    }

    trade.setup = {
      ...((trade.setup as any)?.toObject ? (trade.setup as any).toObject() : trade.setup || {}),
      variantKey: match.variantKey || undefined,
      variantStatus: 'CLASSIFIED',
      htfBias: match.htfBias,
      patternType: match.patternType,
      secondLegStatus: match.secondLegStatus,
      liquiditySide: match.liquiditySide,
      sweepExtreme: match.sweepExtreme,
      liquidityLevel: match.liquidityLevel,
    };

    trade.thesis = {
      ...((trade.thesis as any)?.toObject ? (trade.thesis as any).toObject() : trade.thesis || {}),
      higherTimeframeContext: match.reasoning,
      marketStructure:
        match.htfBias === 'BULLISH'
          ? 'TRENDING_UP'
          : match.htfBias === 'BEARISH'
          ? 'TRENDING_DOWN'
          : 'RANGING',
    };

    trade.auditLog.push({
      action: 'AUTO_CLASSIFIED',
      timestamp: new Date(),
      changedBy: 'Auto Pattern Recognizer (4H + 5M)',
      details: {
        strategyName: match.strategyName,
        variantKey: match.variantKey,
        htfTrend: match.htfBias,
        pattern: match.pattern,
        confidence: match.confidence,
        reasoning: match.reasoning,
      },
    });

    await trade.save();

    return {
      tradeId: String(trade._id),
      symbol: trade.symbol,
      direction: trade.direction,
      strategyId: match.strategyId,
      strategyName: match.strategyName,
      variantKey: match.variantKey,
      variantName: match.variantName,
      htfTrend: match.htfBias,
      pattern: match.pattern,
      patternType: match.patternType,
      secondLegStatus: match.secondLegStatus,
      liquiditySide: match.liquiditySide,
      sweepExtreme: match.sweepExtreme,
      liquidityLevel: match.liquidityLevel,
      confidence: match.confidence,
      reasoning: match.reasoning,
    };
  }

  /**
   * Classifies a batch of trades sequentially.
   */
  static async classifyBatch(
    tradeIds: Array<string | mongoose.Types.ObjectId>,
    userId: string | mongoose.Types.ObjectId
  ): Promise<{
    total: number;
    classified: number;
    failed: number;
    results: IAutoClassifyResult[];
    errors: Array<{ tradeId: string; error: string }>;
  }> {
    const results: IAutoClassifyResult[] = [];
    const errors: Array<{ tradeId: string; error: string }> = [];

    for (const tId of tradeIds) {
      try {
        const res = await this.classifyTrade(tId, userId);
        results.push(res);
      } catch (err: any) {
        errors.push({ tradeId: String(tId), error: err.message || 'Auto classification failed' });
      }
    }

    return {
      total: tradeIds.length,
      classified: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }
}
