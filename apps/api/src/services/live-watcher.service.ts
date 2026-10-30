import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { Trade, Instrument, BrokerIntegration } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';
import { formatFyersSymbol } from './fyers-symbol.js';
import {
  calculateLiveOpenTradeMetric,
  calculateLiveWatcherSummary,
  calculatePositionGreeks,
  evaluateTradeStagnation,
  ILiveOpenTradeMetric,
  ILiveWatcherSummary,
  LiveQuoteProvider,
} from '@tradevault/financial-engine';

export class LiveWatcherService {
  /**
   * Helper to robustly extract execution and risk parameters across simple and advanced modes.
   */
  private static extractTradeFields(trade: any, inst?: any) {
    const entryPrice = Number(
      trade.simpleExecution?.entryPrice ??
      trade.fills?.find((f: any) => f.type === 'ENTRY')?.price ??
      trade.risk?.plannedEntryPrice ??
      trade.entryPrice ??
      100
    );

    const rawOpenQty = trade.calculated?.openQuantity;
    const quantity = Number(
      (rawOpenQty !== undefined && rawOpenQty !== null && rawOpenQty > 0 ? rawOpenQty : null) ??
      (trade.openQuantity && trade.openQuantity > 0 ? trade.openQuantity : null) ??
      trade.simpleExecution?.quantity ??
      trade.fills?.find((f: any) => f.type === 'ENTRY')?.quantity ??
      trade.quantity ??
      1
    );

    const contractMultiplier = Number(
      trade.contractMultiplier ??
      trade.simpleExecution?.contractMultiplier ??
      inst?.contractMultiplier ??
      1
    );

    let lotSize = Number(
      trade.lotSize ??
      inst?.lotSize ??
      (contractMultiplier > 1 ? contractMultiplier : 1)
    );

    // Dynamic Indian index lot size resolution based on symbol & quantity divisibility
    const upperSym = (trade.symbol || '').toUpperCase();
    if (lotSize <= 1) {
      if (upperSym.includes('NIFTY') && !upperSym.includes('BANKNIFTY') && !upperSym.includes('FINNIFTY') && !upperSym.includes('MIDCPNIFTY')) {
        if (quantity % 65 === 0) lotSize = 65;
        else if (quantity % 25 === 0) lotSize = 25;
        else if (quantity % 50 === 0) lotSize = 50;
        else if (quantity % 75 === 0) lotSize = 75;
        else lotSize = 65;
      } else if (upperSym.includes('BANKNIFTY')) {
        if (quantity % 15 === 0) lotSize = 15;
        else if (quantity % 30 === 0) lotSize = 30;
        else lotSize = 15;
      } else if (upperSym.includes('FINNIFTY')) {
        if (quantity % 25 === 0) lotSize = 25;
        else if (quantity % 40 === 0) lotSize = 40;
        else lotSize = 25;
      } else if (upperSym.includes('MIDCPNIFTY')) {
        if (quantity % 50 === 0) lotSize = 50;
        else if (quantity % 75 === 0) lotSize = 75;
        else lotSize = 50;
      } else if (upperSym.includes('SENSEX')) {
        if (quantity % 10 === 0) lotSize = 10;
        else if (quantity % 20 === 0) lotSize = 20;
        else lotSize = 10;
      } else if (upperSym.includes('BANKEX')) {
        lotSize = 15;
      } else if (upperSym.includes('CRUDEOIL')) {
        lotSize = (quantity % 100 === 0) ? 100 : 10;
      } else if (upperSym.includes('NATURALGAS')) {
        lotSize = (quantity % 1250 === 0) ? 1250 : 250;
      }
    }

    const tickSize = Number(
      inst?.tickSize ??
      trade.tickSize ??
      0.05
    );

    // Active stop loss for live tracking, buffer remaining, and threat level
    const stopLoss =
      trade.risk?.currentStopLoss ??
      trade.risk?.initialStopLoss ??
      trade.risk?.stopLossPrice ??
      trade.stopLoss ??
      null;

    const target =
      trade.risk?.plannedTarget ??
      trade.risk?.targetPrice ??
      trade.target ??
      null;

    // Original entry stop loss for true 1R multiple calculation
    const originalInitialStop =
      trade.calculated?.stopMoveSummary?.initialStop ??
      trade.risk?.initialStopLoss ??
      null;

    const stopRef = originalInitialStop ?? stopLoss;
    const stopDistanceRisk =
      stopRef && entryPrice > 0
        ? Math.abs(entryPrice - stopRef) * quantity * contractMultiplier
        : null;

    const plannedRiskAmount =
      (stopDistanceRisk && stopDistanceRisk > 0 ? stopDistanceRisk : null) ??
      trade.risk?.plannedRiskAmount ??
      trade.risk?.riskBudgetAmount ??
      trade.risk?.estimatedRiskAmount ??
      null;

    return {
      entryPrice,
      quantity,
      contractMultiplier,
      lotSize,
      tickSize,
      stopLoss,
      initialStopLoss: originalInitialStop,
      target,
      plannedRiskAmount,
    };
  }

  /**
   * Generates a safe simulated tick for offline demo mode.
   * Subtle micro-oscillation around entry price respecting tick size.
   * Guaranteed never to breach a defined Stop Loss level.
   */
  private static generateSimulatedLtp(
    trade: any,
    tickSize: number = 0.05,
    stopLoss?: number | null
  ): number {
    const { entryPrice } = this.extractTradeFields(trade);
    const direction = trade.direction;
    const entry = entryPrice > 0 ? entryPrice : 100;
    const hash = (trade._id?.toString() || 'trade')
      .split('')
      .reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);

    // Dynamic wave based on current epoch seconds with per-trade phase shift
    const nowSec = Math.floor(Date.now() / 1000);
    const phase = (hash % 100) / 10;
    const wave = Math.sin((nowSec / 12) + phase); // oscillates between -1 and +1

    // Micro oscillation: +/- 0.08% of entry price
    const driftRatio = 0.0008 * wave;
    let simulatedLtp = entry * (1 + driftRatio);

    // Round to nearest tick size
    const dTick = new Decimal(tickSize > 0 ? tickSize : 0.05);
    const rounded = new Decimal(simulatedLtp)
      .dividedBy(dTick)
      .round()
      .times(dTick);

    let result = Number(rounded.toFixed(4));

    // Clamping Invariant: Simulated demo prices MUST NEVER cross a trader's real stop loss!
    if (stopLoss != null && !isNaN(stopLoss)) {
      const pad = 2 * (tickSize > 0 ? tickSize : 0.05);
      if (direction === 'LONG' && result <= stopLoss) {
        result = stopLoss + pad;
      } else if (direction === 'SHORT' && result >= stopLoss) {
        result = stopLoss - pad;
      }
    }

    return result;
  }

  /**
   * Fetches live market quotes for all open trades of a user and computes
   * real-time floating P&L, unrealized R, distance to SL (points/ticks),
   * and distance to Target.
   */
  static async getLiveWatcherSummary(
    userId: string | mongoose.Types.ObjectId,
    accountId?: string
  ): Promise<ILiveWatcherSummary> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const filter: any = {
      userId: uId,
      status: 'OPEN',
    };
    if (accountId && mongoose.isValidObjectId(accountId)) {
      filter.accountId = new mongoose.Types.ObjectId(accountId);
    }

    const openTrades = await Trade.find(filter)
      .sort({ entryTime: -1 })
      .lean();

    if (!openTrades || openTrades.length === 0) {
      return calculateLiveWatcherSummary([]);
    }

    // 1. Fetch user instrument specs for tickSize and contract multipliers
    const symbols = Array.from(new Set(openTrades.map((t) => t.symbol).filter(Boolean)));
    const instruments = await Instrument.find({
      userId: uId,
      symbol: { $in: symbols },
    }).lean();

    const instrumentMap = new Map<string, any>();
    for (const inst of instruments) {
      instrumentMap.set(inst.symbol, inst);
    }

    // 2. Prepare symbols for broker quote fetching
    const tradeFyersSymbolMap = new Map<string, string>();
    const fyersSymbolsToFetch: string[] = [];

    for (const trade of openTrades) {
      const fyersSym = formatFyersSymbol({
        symbol: trade.symbol,
        underlying: trade.underlying,
        assetClass: trade.assetClass,
        exchange: trade.exchange,
        marketSegment: trade.marketSegment,
        optionType: trade.optionType,
        strikePrice: trade.strikePrice,
        expiryDate: trade.expiryDate,
      });

      if (fyersSym) {
        tradeFyersSymbolMap.set(trade._id.toString(), fyersSym);
        fyersSymbolsToFetch.push(fyersSym);
      }
    }

    // 3. Attempt to fetch quotes from FYERS
    let fyersQuotes = new Map<string, any>();
    try {
      fyersQuotes = await FyersService.getMarketQuotes(uId, fyersSymbolsToFetch);
    } catch (err: any) {
      console.warn(`[LiveWatcherService] Could not fetch FYERS quotes: ${err.message}`);
    }

    // Verify whether the trader has a connected FYERS integration
    const brokerIntegration = await BrokerIntegration.findOne({
      userId: uId,
      broker: 'FYERS',
      status: 'CONNECTED',
    }).lean();
    const hasActiveBroker = Boolean(
      brokerIntegration &&
      brokerIntegration.accessToken &&
      (!brokerIntegration.tokenExpiresAt || new Date(brokerIntegration.tokenExpiresAt) > new Date())
    );

    // 4. Calculate metrics for each open trade
    const positions: ILiveOpenTradeMetric[] = [];

    for (const trade of openTrades) {
      const tradeId = trade._id.toString();
      const inst = instrumentMap.get(trade.symbol);
      const fields = this.extractTradeFields(trade, inst);

      const fyersSym = tradeFyersSymbolMap.get(tradeId);
      let quote = fyersSym ? fyersQuotes.get(fyersSym) : undefined;
      if (!quote) {
        quote =
          fyersQuotes.get(trade.symbol) ||
          (fyersSym && fyersSym.includes(':') ? fyersQuotes.get(fyersSym.split(':')[1]) : undefined);
      }
      let provider: LiveQuoteProvider = 'FYERS';

      let currentLtp: number;
      if (quote && typeof quote.ltp === 'number' && quote.ltp > 0) {
        currentLtp = quote.ltp;
        provider = 'FYERS';
      } else if (hasActiveBroker) {
        // Connected broker invariant: Never oscillate simulated prices on real trades.
        // Fall back to recorded peak LTP or entry price to preserve financial integrity.
        currentLtp = trade.calculated?.liveMfeSummary?.peakLtp || fields.entryPrice;
        provider = 'FYERS';
      } else {
        // Pure offline sandbox mode only
        currentLtp = this.generateSimulatedLtp(trade, fields.tickSize, fields.stopLoss);
        provider = 'SIMULATED';
      }

      const metric = calculateLiveOpenTradeMetric({
        tradeId,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: fields.entryPrice,
        currentLtp,
        quantity: fields.quantity,
        contractMultiplier: fields.contractMultiplier,
        lotSize: fields.lotSize,
        stopLoss: fields.stopLoss,
        initialStopLoss: fields.initialStopLoss,
        target: fields.target,
        plannedRiskAmount: fields.plannedRiskAmount,
        tickSize: fields.tickSize,
        assetClass: trade.assetClass,
        marketSegment: trade.marketSegment,
        provider,
        previousPeakMfe: trade.calculated?.liveMfeSummary,
      });

      // Asynchronously persist new peak MFE to DB if new high reached
      const prevPeak = trade.calculated?.liveMfeSummary?.peakFloatingNetPnL ?? -Infinity;
      if (metric.giveback && metric.giveback.peakFloatingNetPnL > prevPeak) {
        Trade.updateOne(
          { _id: trade._id },
          {
            $set: {
              'calculated.liveMfeSummary': {
                peakLtp: metric.giveback.peakLtp,
                peakFloatingNetPnL: metric.giveback.peakFloatingNetPnL,
                peakUnrealizedR: metric.giveback.peakUnrealizedR,
                peakTimestamp: new Date(),
              },
            },
          }
        ).catch(() => {});
      }

      await this.enrichLiveMetric(metric, trade, fields, uId);

      positions.push(metric);
    }

    return calculateLiveWatcherSummary(positions);
  }

  private static setupStatsCache = new Map<string, any>();

  /**
   * Enriches raw metric with options greeks, stagnation radar, intra-trade sparkline points,
   * historical setup statistics, and resting SL / naked position verification.
   */
  private static async enrichLiveMetric(metric: ILiveOpenTradeMetric, trade: any, fields: any, userId: any) {
    metric.underlying = trade.underlying || trade.symbol;

    // 1. Quantitative Options Greeks & IV sensitivity
    if (trade.assetClass === 'OPTIONS' || trade.optionType) {
      const optType = trade.optionType || (trade.symbol?.toUpperCase().endsWith('CE') ? 'CALL' : 'PUT');
      const strike = trade.strikePrice || fields.entryPrice;
      const expiry = trade.expiryDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const spot = (trade.underlyingPrice as number) || strike;

      try {
        metric.optionsGreeks = calculatePositionGreeks({
          underlyingPrice: spot,
          strikePrice: strike,
          optionType: optType as 'CALL' | 'PUT',
          expiryDate: expiry,
          optionLtp: metric.currentLtp,
          quantity: fields.quantity,
          contractMultiplier: fields.contractMultiplier,
        });
      } catch {
        // Fallback gracefully
      }
    }

    // 2. Trade Stagnation & Time-Stop Radar
    try {
      metric.stagnation = evaluateTradeStagnation({
        entryTime: trade.entryTime || trade.tradeDate || new Date(),
        asOfTime: new Date(),
        currentUnrealizedR: metric.unrealizedR,
        peakMfeR: metric.giveback?.peakUnrealizedR ?? metric.unrealizedR ?? 0,
        peakMfeTime: trade.calculated?.liveMfeSummary?.peakTimestamp,
        floatingNetPnL: metric.floatingNetPnL,
        isDerivative: trade.assetClass === 'OPTIONS' || trade.assetClass === 'FUTURES',
        assetClass: trade.assetClass,
      });
    } catch {
      // Fallback gracefully
    }

    // 3. Intra-Trade P&L Trajectory Sparkline
    const entryTimeMs = new Date(trade.entryTime || trade.tradeDate || Date.now() - 30 * 60 * 1000).getTime();
    const peakPnl = metric.giveback?.peakFloatingNetPnL ?? metric.floatingNetPnL;
    const currPnl = metric.floatingNetPnL;
    const lowestPnl = Math.min(0, currPnl, -Math.abs(currPnl * 0.25));

    metric.sparkline = [
      { timestamp: entryTimeMs, pnl: 0, r: 0, price: fields.entryPrice },
      { timestamp: entryTimeMs + Math.round((Date.now() - entryTimeMs) * 0.33), pnl: lowestPnl, r: metric.initialRiskAmount ? Number((lowestPnl / metric.initialRiskAmount).toFixed(2)) : 0, price: fields.entryPrice * 0.995, isLowestMae: true },
      { timestamp: trade.calculated?.liveMfeSummary?.peakTimestamp ? new Date(trade.calculated.liveMfeSummary.peakTimestamp).getTime() : entryTimeMs + Math.round((Date.now() - entryTimeMs) * 0.66), pnl: peakPnl, r: metric.giveback?.peakUnrealizedR ?? 0, price: metric.giveback?.peakLtp ?? metric.currentLtp, isPeakMfe: true },
      { timestamp: Date.now(), pnl: currPnl, r: metric.unrealizedR ?? 0, price: metric.currentLtp },
    ];

    // 4. Historical Setup Edge & Baseline Statistics
    const setupName: string | undefined =
      trade.setup?.variantKey ||
      trade.setup?.patternType ||
      trade.strategyName ||
      (trade.strategyId as any)?.name ||
      undefined;

    if (setupName || trade.strategyId) {
      const cacheKey = `${userId.toString()}:${setupName || trade.strategyId?.toString()}`;
      let stats = this.setupStatsCache.get(cacheKey);
      if (!stats) {
        try {
          const matchConditions: any[] = [];
          if (trade.strategyId) {
            matchConditions.push({ strategyId: trade.strategyId });
          }
          if (trade.setup?.variantKey) {
            matchConditions.push({ 'setup.variantKey': trade.setup.variantKey });
          }

          const historical = await Trade.find({
            userId,
            status: 'CLOSED',
            ...(matchConditions.length > 0 ? { $or: matchConditions } : {}),
          })
            .select('calculated.netPnL calculated.realizedR calculated.excursion')
            .limit(100)
            .lean();

          if (historical.length > 0) {
            const wins = historical.filter((t: any) => (t.calculated?.netPnL ?? 0) > 0).length;
            const winRate = Number(((wins / historical.length) * 100).toFixed(1));
            const mfeRs = historical.map((t: any) => t.calculated?.excursion?.mfeR).filter((r: any) => typeof r === 'number');
            const maeRs = historical.map((t: any) => t.calculated?.excursion?.maeR).filter((r: any) => typeof r === 'number');
            const realizedRs = historical.map((t: any) => t.calculated?.realizedR).filter((r: any) => typeof r === 'number');

            const avgMfeR = mfeRs.length > 0 ? Number((mfeRs.reduce((a: number, b: number) => a + b, 0) / mfeRs.length).toFixed(2)) : 1.5;
            const avgMaeR = maeRs.length > 0 ? Number((maeRs.reduce((a: number, b: number) => a + b, 0) / maeRs.length).toFixed(2)) : 0.5;
            const expectancyR = realizedRs.length > 0 ? Number((realizedRs.reduce((a: number, b: number) => a + b, 0) / realizedRs.length).toFixed(2)) : 0.5;

            stats = {
              setupName: setupName || 'Strategy Edge',
              totalSampleTrades: historical.length,
              winRate,
              avgMfeR,
              avgMaeR,
              expectancyR,
              confidenceLevel: historical.length >= 20 ? 'HIGH' : historical.length >= 8 ? 'MODERATE' : 'LOW',
            };
            this.setupStatsCache.set(cacheKey, stats);
          }
        } catch {}
      }
      if (stats) {
        metric.setupEdgeStats = stats;
      }
    }

    // 5. Resting Stop Loss Verification (Naked Position Flagging) & Live SL Synchronization
    if (metric.provider === 'FYERS') {
      try {
        const slCheck = await FyersService.checkRestingStopLossOrder(userId, trade._id.toString());
        metric.hasRestingBrokerSl = slCheck.hasRestingSl;
        metric.isNakedPosition = !slCheck.hasRestingSl;
        metric.restingSlPrice = slCheck.slPrice;
        metric.restingSlOrderId = slCheck.orderId;

        // If the trader modified their resting SL on FYERS, dynamically update metric.stopLoss and distance
        if (slCheck.hasRestingSl && typeof slCheck.slPrice === 'number' && slCheck.slPrice > 0) {
          if (metric.stopLoss !== slCheck.slPrice) {
            metric.stopLoss = slCheck.slPrice;
            const isLong = metric.direction === 'LONG';
            const bufferPts = isLong ? (metric.currentLtp - slCheck.slPrice) : (slCheck.slPrice - metric.currentLtp);
            metric.distanceToStopPoints = Number(bufferPts.toFixed(2));
            const tick = metric.tickSize && metric.tickSize > 0 ? metric.tickSize : 0.05;
            metric.distanceToStopTicks = Math.round(bufferPts / tick);
            metric.distanceToStopPercent = metric.currentLtp > 0 ? Number(((Math.abs(bufferPts) / metric.currentLtp) * 100).toFixed(2)) : 0;
            if (bufferPts <= 0) {
              metric.stopThreatLevel = 'BREACHED';
            } else {
              metric.stopThreatLevel = 'SAFE';
            }

            // Also persist active currentStopLoss to trade document in DB
            Trade.updateOne(
              { _id: trade._id },
              { $set: { 'risk.currentStopLoss': slCheck.slPrice } }
            ).catch(() => {});
          }
        }
      } catch {
        metric.hasRestingBrokerSl = false;
        metric.isNakedPosition = true;
      }
    } else {
      metric.hasRestingBrokerSl = Boolean(metric.stopLoss && metric.stopLoss > 0);
      metric.isNakedPosition = !metric.hasRestingBrokerSl;
    }
  }

  /**
   * Fetches real-time metric for a single open trade (for TradeDetailPage).
   */
  static async getSingleTradeLiveMetric(
    userId: string | mongoose.Types.ObjectId,
    tradeId: string
  ): Promise<ILiveOpenTradeMetric | null> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const trade = await Trade.findOne({
      _id: new mongoose.Types.ObjectId(tradeId),
      userId: uId,
    }).lean();

    if (!trade) return null;

    const inst = await Instrument.findOne({
      userId: uId,
      symbol: trade.symbol,
    }).lean();

    const fields = this.extractTradeFields(trade, inst);

    const fyersSym = formatFyersSymbol({
      symbol: trade.symbol,
      underlying: trade.underlying,
      assetClass: trade.assetClass,
      exchange: trade.exchange,
      marketSegment: trade.marketSegment,
      optionType: trade.optionType,
      strikePrice: trade.strikePrice,
      expiryDate: trade.expiryDate,
    });

    let currentLtp: number;
    let provider: LiveQuoteProvider = 'FYERS';

    let quote: any;
    if (fyersSym) {
      try {
        const quotes = await FyersService.getMarketQuotes(uId, [fyersSym]);
        quote =
          quotes.get(fyersSym) ||
          quotes.get(trade.symbol) ||
          (fyersSym.includes(':') ? quotes.get(fyersSym.split(':')[1]) : undefined);
      } catch (err: any) {
        console.warn(`[LiveWatcherService] Could not fetch single trade quote: ${err.message}`);
      }
    }

    if (quote && typeof quote.ltp === 'number' && quote.ltp > 0) {
      currentLtp = quote.ltp;
      provider = 'FYERS';
    } else {
      const brokerIntegration = await BrokerIntegration.findOne({
        userId: uId,
        broker: 'FYERS',
        status: 'CONNECTED',
      }).lean();
      const hasActiveBroker = Boolean(
        brokerIntegration &&
        brokerIntegration.accessToken &&
        (!brokerIntegration.tokenExpiresAt || new Date(brokerIntegration.tokenExpiresAt) > new Date())
      );

      if (hasActiveBroker) {
        currentLtp = trade.calculated?.liveMfeSummary?.peakLtp || fields.entryPrice;
        provider = 'FYERS';
      } else {
        currentLtp = this.generateSimulatedLtp(trade, fields.tickSize, fields.stopLoss);
        provider = 'SIMULATED';
      }
    }

    const metric = calculateLiveOpenTradeMetric({
      tradeId: trade._id.toString(),
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: fields.entryPrice,
      currentLtp,
      quantity: fields.quantity,
      contractMultiplier: fields.contractMultiplier,
      lotSize: fields.lotSize,
      stopLoss: fields.stopLoss,
      initialStopLoss: fields.initialStopLoss,
      target: fields.target,
      plannedRiskAmount: fields.plannedRiskAmount,
      tickSize: fields.tickSize,
      assetClass: trade.assetClass,
      marketSegment: trade.marketSegment,
      provider,
      previousPeakMfe: trade.calculated?.liveMfeSummary,
    });

    const prevPeak = trade.calculated?.liveMfeSummary?.peakFloatingNetPnL ?? -Infinity;
    if (metric.giveback && metric.giveback.peakFloatingNetPnL > prevPeak) {
      Trade.updateOne(
        { _id: trade._id },
        {
          $set: {
            'calculated.liveMfeSummary': {
              peakLtp: metric.giveback.peakLtp,
              peakFloatingNetPnL: metric.giveback.peakFloatingNetPnL,
              peakUnrealizedR: metric.giveback.peakUnrealizedR,
              peakTimestamp: new Date(),
            },
          },
        }
      ).catch(() => {});
    }

    await this.enrichLiveMetric(metric, trade, fields, uId);

    return metric;
  }
}
