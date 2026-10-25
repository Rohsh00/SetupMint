import mongoose from 'mongoose';
import { Trade, Strategy, TradeCandleSnapshot, User } from '../db/models/index.js';
import { MarketDataService } from './market-data/index.js';
import {
  detectHtfTrend4h,
  detectLtfSetup5m,
  matchStrategyAndVariant,
  aggregateCandles,
  IExcursionCandle,
} from '@tradevault/financial-engine';
import {
  CHART_RESOLUTION_LABELS,
  DEFAULT_PATTERN_DETECTION_SETTINGS,
} from '@tradevault/shared';

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
  timeframeContext?: string;
}

export class PatternRecognitionService {
  /**
   * Fetches or derives LTF (e.g. 1m, 5m, 15m) candles for the trade around entry.
   */
  static async getLtfCandlesForTrade(
    trade: any,
    userId: mongoose.Types.ObjectId,
    resolution: string = '5'
  ): Promise<IExcursionCandle[]> {
    const sessionAnchor =
      trade.exchange === 'MCX' || trade.marketSegment === 'MCX' ? '09:00' : '09:15';

    // 1. Check cached snapshot for requested resolution
    const cached = await TradeCandleSnapshot.findOne({
      userId,
      tradeId: trade._id,
      resolution,
    });
    if (cached && cached.candles && cached.candles.length >= 5) {
      return cached.candles as IExcursionCandle[];
    }

    // 2. If requested resolution > 1m, check if cached 1m exists and aggregate
    if (resolution !== '1') {
      const targetMins = parseInt(resolution, 10);
      const cached1m = await TradeCandleSnapshot.findOne({
        userId,
        tradeId: trade._id,
        resolution: '1',
      });
      if (cached1m && cached1m.candles && cached1m.candles.length >= 10 && !isNaN(targetMins)) {
        const agg = aggregateCandles(cached1m.candles as IExcursionCandle[], targetMins, sessionAnchor);
        if (agg.candles.length >= 5) {
          return agg.candles;
        }
      }
    }

    // 3. Fetch from market data provider
    const entryMs = new Date(trade.entryTime).getTime();
    const fromLtf = new Date(entryMs - 12 * 60 * 60 * 1000);
    const toLtf = new Date(
      trade.exitTime ? new Date(trade.exitTime).getTime() + 10 * 60 * 1000 : entryMs + 60 * 60 * 1000
    );

    try {
      const res = await MarketDataService.getCandlesWithFallback({
        trade,
        resolution,
        from: fromLtf,
        to: toLtf,
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
          resolution,
          from: fromLtf,
          to: toLtf,
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
   * Fetches or derives HTF (e.g. 60m, 240m / 4H, Daily) candles for the trade's underlying to evaluate HTF trend.
   */
  static async getHtfCandlesForTrade(
    trade: any,
    userId: mongoose.Types.ObjectId,
    resolution: string = '240'
  ): Promise<IExcursionCandle[]> {
    const sessionAnchor =
      trade.exchange === 'MCX' || trade.marketSegment === 'MCX' ? '09:00' : '09:15';

    // 1. Check cached snapshot for requested resolution
    const cached = await TradeCandleSnapshot.findOne({
      userId,
      tradeId: trade._id,
      resolution,
    });
    if (cached && cached.candles && cached.candles.length >= 5) {
      return cached.candles as IExcursionCandle[];
    }

    // 2. Fetch ~30 days of underlying candles
    const entryMs = new Date(trade.entryTime).getTime();
    const fromHtf = new Date(entryMs - 30 * 24 * 60 * 60 * 1000);
    const toHtf = new Date(entryMs);

    const proxyTrade = {
      ...(trade.toObject ? trade.toObject() : trade),
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

    if (resolution === '60') {
      try {
        const res60 = await MarketDataService.getCandlesWithFallback({
          trade: proxyTrade,
          resolution: '60',
          from: fromHtf,
          to: toHtf,
          userId,
        });
        if (res60.ok && res60.candles && res60.candles.length >= 5) {
          return res60.candles as IExcursionCandle[];
        }
      } catch {
        // Fallback
      }
    } else if (resolution === '240') {
      try {
        const res60 = await MarketDataService.getCandlesWithFallback({
          trade: proxyTrade,
          resolution: '60',
          from: fromHtf,
          to: toHtf,
          userId,
        });

        if (res60.ok && res60.candles && res60.candles.length > 0) {
          const agg4h = aggregateCandles(res60.candles as IExcursionCandle[], 240, sessionAnchor);
          if (agg4h.candles.length >= 5) {
            return agg4h.candles;
          }
        }
      } catch {
        // Fallback
      }

      try {
        const from10d = new Date(entryMs - 10 * 24 * 60 * 60 * 1000);
        const res5m = await MarketDataService.getCandlesWithFallback({
          trade: proxyTrade,
          resolution: '5',
          from: from10d,
          to: toHtf,
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
    } else if (resolution === 'D') {
      try {
        const resD = await MarketDataService.getCandlesWithFallback({
          trade: proxyTrade,
          resolution: 'D',
          from: fromHtf,
          to: toHtf,
          userId,
        });
        if (resD.ok && resD.candles && resD.candles.length >= 5) {
          return resD.candles as IExcursionCandle[];
        }
      } catch {
        // Continue
      }
    }

    return [];
  }

  /**
   * Classifies a single trade by analyzing HTF trend + LTF pattern and matching to active strategies.
   * Respects user-configured default timeframes and instrument-specific overrides.
   */
  static async classifyTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IAutoClassifyResult> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const [trade, user] = await Promise.all([
      Trade.findOne({ _id: tId, userId: uId }),
      User.findById(uId),
    ]);

    if (!trade) {
      throw new Error(`Trade ${tradeId} not found`);
    }

    // Resolve user detection settings and instrument-specific overrides
    const settings = user?.patternDetectionSettings || DEFAULT_PATTERN_DETECTION_SETTINGS;
    const tradeSymbol = (trade.underlying || trade.symbol || '').toUpperCase().trim();

    const override = settings.instrumentOverrides?.find((o: any) => {
      const oSym = (o.symbol || '').toUpperCase().trim();
      return (
        tradeSymbol === oSym ||
        tradeSymbol.startsWith(oSym) ||
        (trade.symbol && trade.symbol.toUpperCase().includes(oSym))
      );
    });

    const htfRes = override?.htf || settings.defaultHtf || '240';
    const ltfRes = override?.ltf || settings.defaultLtf || '5';
    const preferredStrategyId = override?.preferredStrategyId;
    const preferredStrategyName = override?.preferredStrategyName;

    const htfLabel = CHART_RESOLUTION_LABELS[htfRes] || `${htfRes}m`;
    const ltfLabel = CHART_RESOLUTION_LABELS[ltfRes] || `${ltfRes}m`;
    const timeframeContext = `${htfLabel} Trend + ${ltfLabel} Confirmation`;

    // 1. Fetch dynamic LTF and HTF candles
    const [candlesLtf, candlesHtf] = await Promise.all([
      this.getLtfCandlesForTrade(trade, uId, ltfRes),
      this.getHtfCandlesForTrade(trade, uId, htfRes),
    ]);

    // 2. Run Financial Engine HTF Trend Detection
    const htfResult = detectHtfTrend4h(candlesHtf);

    // 3. Run Financial Engine LTF Setup Pattern Recognition
    const entryPrice =
      trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0;
    const entryTimeMs = new Date(trade.entryTime).getTime();

    const ltfResult = detectLtfSetup5m({
      candles5m: candlesLtf,
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

    // If instrument specifies a preferred strategy and trade currently has none
    let assignedStrategyId = match.strategyId;
    let assignedStrategyName = match.strategyName;

    if (preferredStrategyId) {
      const preferred = availableStrategies.find((s) => String(s._id) === preferredStrategyId);
      if (preferred) {
        assignedStrategyId = String(preferred._id);
        assignedStrategyName = preferred.name;
      }
    }

    // 6. Update Trade Document
    if (assignedStrategyId) {
      trade.strategyId = new mongoose.Types.ObjectId(assignedStrategyId);
      trade.strategyName = assignedStrategyName;
    }

    trade.setup = {
      ...((trade.setup as any)?.toObject ? (trade.setup as any).toObject() : trade.setup || {}),
      variantKey: match.variantKey || undefined,
      variantStatus: 'CLASSIFIED',
      htfBias: match.htfBias,
      executionTimeframe: timeframeContext,
      patternType: match.patternType,
      secondLegStatus: match.secondLegStatus,
      liquiditySide: match.liquiditySide,
      sweepExtreme: match.sweepExtreme,
      liquidityLevel: match.liquidityLevel,
    };

    trade.thesis = {
      ...((trade.thesis as any)?.toObject ? (trade.thesis as any).toObject() : trade.thesis || {}),
      higherTimeframeContext: `[${timeframeContext}] ${match.reasoning}`,
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
      changedBy: `Auto Pattern Recognizer (${timeframeContext})`,
      details: {
        strategyName: assignedStrategyName,
        variantKey: match.variantKey,
        htfTrend: match.htfBias,
        pattern: match.pattern,
        timeframeContext,
        confidence: match.confidence,
        reasoning: match.reasoning,
        instrumentOverride: Boolean(override),
      },
    });

    await trade.save();

    return {
      tradeId: String(trade._id),
      symbol: trade.symbol,
      direction: trade.direction,
      strategyId: assignedStrategyId,
      strategyName: assignedStrategyName,
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
      timeframeContext,
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
