import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { Trade, Instrument, BrokerIntegration } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';
import { formatFyersSymbol } from './fyers-symbol.js';
import {
  calculateLiveOpenTradeMetric,
  calculateLiveWatcherSummary,
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

    const plannedRiskAmount =
      trade.risk?.estimatedRiskAmount ??
      trade.risk?.riskBudgetAmount ??
      trade.risk?.plannedRiskAmount ??
      (originalInitialStop && entryPrice > 0
        ? Math.abs(entryPrice - originalInitialStop) * quantity * contractMultiplier
        : null);

    return {
      entryPrice,
      quantity,
      contractMultiplier,
      lotSize,
      tickSize,
      stopLoss,
      target,
      plannedRiskAmount,
    };
  }

  /**
   * Generates a realistic simulated market tick for demo or offline testing.
   * Subtle oscillation around entry price that respects tick size.
   */
  private static generateSimulatedLtp(
    trade: any,
    tickSize: number = 0.05
  ): number {
    const { entryPrice } = this.extractTradeFields(trade);
    const entry = entryPrice > 0 ? entryPrice : 100;
    const hash = (trade._id?.toString() || 'trade')
      .split('')
      .reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);

    // Dynamic wave based on current epoch seconds with per-trade phase shift
    const nowSec = Math.floor(Date.now() / 1000);
    const phase = (hash % 100) / 10;
    const wave = Math.sin((nowSec / 12) + phase); // oscillates between -1 and +1

    // Default oscillation is +/- 0.6% of entry price
    const driftRatio = 0.006 * wave;
    let simulatedLtp = entry * (1 + driftRatio);

    // Round to nearest tick size
    const dTick = new Decimal(tickSize > 0 ? tickSize : 0.05);
    const rounded = new Decimal(simulatedLtp)
      .dividedBy(dTick)
      .round()
      .times(dTick);

    return Number(rounded.toFixed(4));
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

    // 4. Calculate metrics for each open trade
    const positions: ILiveOpenTradeMetric[] = [];

    for (const trade of openTrades) {
      const tradeId = trade._id.toString();
      const inst = instrumentMap.get(trade.symbol);
      const fields = this.extractTradeFields(trade, inst);

      const fyersSym = tradeFyersSymbolMap.get(tradeId);
      let quote = fyersSym ? fyersQuotes.get(fyersSym) : undefined;
      let provider: LiveQuoteProvider = 'FYERS';

      let currentLtp: number;
      if (quote && typeof quote.ltp === 'number' && quote.ltp > 0) {
        currentLtp = quote.ltp;
        provider = 'FYERS';
      } else {
        // Fallback to simulated tick with clear SIMULATED provider marking
        currentLtp = this.generateSimulatedLtp(trade, fields.tickSize);
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

      positions.push(metric);
    }

    return calculateLiveWatcherSummary(positions);
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

    if (fyersSym) {
      try {
        const quotes = await FyersService.getMarketQuotes(uId, [fyersSym]);
        const quote = quotes.get(fyersSym);
        if (quote && typeof quote.ltp === 'number' && quote.ltp > 0) {
          currentLtp = quote.ltp;
          provider = 'FYERS';
        } else {
          currentLtp = this.generateSimulatedLtp(trade, fields.tickSize);
          provider = 'SIMULATED';
        }
      } catch {
        currentLtp = this.generateSimulatedLtp(trade, fields.tickSize);
        provider = 'SIMULATED';
      }
    } else {
      currentLtp = this.generateSimulatedLtp(trade, fields.tickSize);
      provider = 'SIMULATED';
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

    return metric;
  }
}
