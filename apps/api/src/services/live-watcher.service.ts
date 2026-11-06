import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { Trade, Instrument, BrokerIntegration, User, TradingAccount } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';
import { formatFyersSymbol } from './fyers-symbol.js';
import { AccountScopeService } from './account-scope.service.js';
import { GlobalCfdCandleProvider } from './market-data/global-cfd.provider.js';
import {
  calculateLiveOpenTradeMetric,
  calculateLiveWatcherSummary,
  calculatePositionGreeks,
  evaluateTradeStagnation,
  evaluateDataHealth,
  ILiveOpenTradeMetric,
  ILiveWatcherSummary,
  LiveQuoteProvider,
} from '@tradevault/financial-engine';

export class LiveWatcherService {
  /**
   * Determines whether an open trade is eligible for live FYERS quotes and broker execution.
   * Prop firm accounts, demo accounts, and non-Indian (Forex/Crypto) trades must never be
   * treated as live FYERS positions or present simulated prices as real broker feeds.
   */
  private static isFyersEligibleTrade(trade: any, account?: any): boolean {
    if (account) {
      if (AccountScopeService.isPropAccount(account)) return false;
      if (String(account.accountType || '').toUpperCase() === 'DEMO') return false;
    }
    const ex = String(trade.exchange || '').toUpperCase();
    const ac = String(trade.assetClass || '').toUpperCase();
    if (ex === 'FOREX' || ex === 'CRYPTO' || ac === 'FOREX' || ac === 'CRYPTO') {
      return false;
    }
    return true;
  }
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
   * Guards against anomalous or corrupted prices (e.g. underlying spot index price applied to an option contract).
   */
  private static isPlausiblePrice(
    price: number | undefined | null,
    entryPrice: number,
    isOption: boolean
  ): boolean {
    if (price == null || !Number.isFinite(price) || price <= 0) return false;
    if (entryPrice <= 0) return true;

    if (isOption) {
      // Option contracts cannot exceed 1000 when entry is below 500, or jump 4x
      if (entryPrice < 500 && price > 1000) return false;
      if (price > entryPrice * 4) return false;
      if (price < entryPrice * 0.05) return false;
    } else {
      if (price > entryPrice * 4 || price < entryPrice * 0.15) return false;
    }
    return true;
  }

  /**
   * Fetches live market quotes for all open trades of a user and computes
   * real-time floating P&L, unrealized R, distance to SL (points/ticks),
   * and distance to Target.
   */
  static async getLiveWatcherSummary(
    userId: string | mongoose.Types.ObjectId,
    accountIdsOrId?: string | mongoose.Types.ObjectId | mongoose.Types.ObjectId[] | string[]
  ): Promise<ILiveWatcherSummary> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const filter: any = {
      userId: uId,
      status: 'OPEN',
    };
    if (Array.isArray(accountIdsOrId)) {
      filter.accountId = {
        $in: accountIdsOrId
          .filter((id) => mongoose.isValidObjectId(id))
          .map((id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)),
      };
    } else if (accountIdsOrId && mongoose.isValidObjectId(accountIdsOrId)) {
      filter.accountId = new mongoose.Types.ObjectId(accountIdsOrId);
    }

    const openTrades = await Trade.find(filter)
      .sort({ entryTime: -1 })
      .lean();

    // Load scoped or open-trade accounts to check prop/demo/live eligibility
    const accountIdsToCheck = Array.isArray(accountIdsOrId)
      ? accountIdsOrId.filter((id) => mongoose.isValidObjectId(id))
      : accountIdsOrId && mongoose.isValidObjectId(accountIdsOrId)
      ? [accountIdsOrId]
      : Array.from(new Set(openTrades.map((t) => t.accountId).filter(Boolean)));

    const scopedAccounts =
      accountIdsToCheck.length > 0
        ? await TradingAccount.find({ _id: { $in: accountIdsToCheck }, userId: uId }).lean()
        : [];
    const accountMap = new Map<string, any>();
    for (const acc of scopedAccounts) {
      accountMap.set(acc._id.toString(), acc);
    }
    const anyFyersEligibleAccount =
      scopedAccounts.length === 0
        ? !Array.isArray(accountIdsOrId)
        : scopedAccounts.some(
            (a) =>
              !AccountScopeService.isPropAccount(a) &&
              String(a.accountType || '').toUpperCase() !== 'DEMO'
          );

    if (!openTrades || openTrades.length === 0) {
      const [brokerIntegration, userDoc] = await Promise.all([
        BrokerIntegration.findOne({
          userId: uId,
          broker: 'FYERS',
        }).lean(),
        User.findById(uId).select('liveWatcherSettings').lean(),
      ]);

      const tokenExpiresAt = brokerIntegration?.tokenExpiresAt;
      const isTokenExpired = Boolean(
        (tokenExpiresAt && new Date(tokenExpiresAt) <= new Date()) ||
        brokerIntegration?.status === 'ERROR'
      );
      const hasActiveBroker = Boolean(
        anyFyersEligibleAccount &&
        brokerIntegration &&
        brokerIntegration.status === 'CONNECTED' &&
        brokerIntegration.accessToken &&
        !isTokenExpired
      );
      const staleThresholdSec = userDoc?.liveWatcherSettings?.staleDataThresholdSeconds ?? 10;

      const now = new Date();
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(now.getTime() + istOffsetMs);
      const dayOfWeek = istDate.getUTCDay();
      const totalMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
      const isNseMarketOpen =
        dayOfWeek >= 1 &&
        dayOfWeek <= 5 &&
        totalMinutes >= 9 * 60 + 15 &&
        totalMinutes <= 15 * 60 + 30;

      const emptyHealth = evaluateDataHealth({
        provider: hasActiveBroker ? 'FYERS' : 'SIMULATED',
        lastTickAt: hasActiveBroker ? new Date() : null,
        asOf: new Date(),
        isMarketOpen: isNseMarketOpen,
        staleThresholdSeconds: staleThresholdSec,
        tokenExpiresAt,
        hasActiveBrokerConnection: hasActiveBroker,
      });

      return {
        ...calculateLiveWatcherSummary([]),
        provider: hasActiveBroker ? 'FYERS' : 'SIMULATED',
        dataHealth: emptyHealth,
      };
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

    // 2. Prepare symbols for broker quote fetching (only for FYERS-eligible Indian live trades)
    const tradeFyersSymbolMap = new Map<string, string>();
    const fyersSymbolsToFetch: string[] = [];
    const globalSymbolsToFetch: string[] = [];

    for (const trade of openTrades) {
      const acc = trade.accountId ? accountMap.get(trade.accountId.toString()) : undefined;
      const isFyersEligible = this.isFyersEligibleTrade(trade, acc);

      if (isFyersEligible) {
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

      // Queue candidate symbol in real-time scanner for spot/CFD/futures assets.
      // NEVER queue or mix option derivatives with underlying spot index prices!
      const isOption =
        trade.assetClass === 'OPTIONS' ||
        Boolean(trade.optionType) ||
        Boolean(trade.strikePrice) ||
        /(\d+(?:CE|PE))$/i.test(trade.symbol || '');

      if (
        !isOption &&
        process.env.NODE_ENV !== 'test' &&
        !process.env.VITEST &&
        (GlobalCfdCandleProvider.isSupportedGlobalSymbol(trade.symbol, trade.exchange, trade.assetClass) ||
         (trade.underlying && GlobalCfdCandleProvider.isSupportedGlobalSymbol(trade.underlying, trade.exchange, trade.assetClass)))
      ) {
        globalSymbolsToFetch.push(trade.symbol);
        if (trade.underlying && trade.underlying !== trade.symbol) {
          globalSymbolsToFetch.push(trade.underlying);
        }
      }
    }

    // 3. Attempt to fetch quotes from FYERS and Global TradingView CFD/Forex/Crypto scanner
    let fyersQuotes = new Map<string, any>();
    let globalQuotes = new Map<string, any>();
    if (fyersSymbolsToFetch.length > 0) {
      try {
        fyersQuotes = await FyersService.getMarketQuotes(uId, fyersSymbolsToFetch);
      } catch (err: any) {
        console.warn(`[LiveWatcherService] Could not fetch FYERS quotes: ${err.message}`);
      }
    }
    if (globalSymbolsToFetch.length > 0) {
      try {
        globalQuotes = await GlobalCfdCandleProvider.getLiveQuotes(globalSymbolsToFetch);
      } catch (err: any) {
        console.warn(`[LiveWatcherService] Could not fetch global CFD quotes: ${err.message}`);
      }
    }

    // Verify whether the trader has a connected FYERS integration and user settings
    const [brokerIntegration, userDoc] = await Promise.all([
      BrokerIntegration.findOne({
        userId: uId,
        broker: 'FYERS',
      }).lean(),
      User.findById(uId).select('liveWatcherSettings').lean(),
    ]);

    const tokenExpiresAt = brokerIntegration?.tokenExpiresAt;
    const isTokenExpired = Boolean(
      (tokenExpiresAt && new Date(tokenExpiresAt) <= new Date()) ||
      brokerIntegration?.status === 'ERROR'
    );
    const hasActiveBroker = Boolean(
      brokerIntegration &&
      brokerIntegration.status === 'CONNECTED' &&
      brokerIntegration.accessToken &&
      !isTokenExpired
    );
    const staleThresholdSec = userDoc?.liveWatcherSettings?.staleDataThresholdSeconds ?? 10;

    // Determine if Indian Equity/Derivatives market is currently open (09:15 to 15:30 IST Mon-Fri)
    const nowUtc = Date.now();
    const istOffsetMs = 5.5 * 3600 * 1000;
    const istDate = new Date(nowUtc + istOffsetMs);
    const istDay = istDate.getUTCDay(); // 0 = Sun, 6 = Sat
    const istMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
    const isNseMarketOpen = istDay >= 1 && istDay <= 5 && istMinutes >= (9 * 60 + 15) && istMinutes <= (15 * 60 + 30);
    const isMcxMarketOpen = istDay >= 1 && istDay <= 5 && istMinutes >= (9 * 60) && istMinutes <= (23 * 60 + 30);

    // 4. Calculate metrics for each open trade
    const positions: ILiveOpenTradeMetric[] = [];
    let latestQuoteTimestamp: Date | null = null;

    for (const trade of openTrades) {
      const tradeId = trade._id.toString();
      const inst = instrumentMap.get(trade.symbol);
      const fields = this.extractTradeFields(trade, inst);
      const acc = trade.accountId ? accountMap.get(trade.accountId.toString()) : undefined;
      const isFyersEligible = this.isFyersEligibleTrade(trade, acc);
      const effectiveHasBroker = hasActiveBroker && isFyersEligible;

      const fyersSym = tradeFyersSymbolMap.get(tradeId);
      let quote = isFyersEligible && fyersSym ? fyersQuotes.get(fyersSym) : undefined;
      if (!quote && isFyersEligible) {
        quote =
          fyersQuotes.get(trade.symbol) ||
          (fyersSym && fyersSym.includes(':') ? fyersQuotes.get(fyersSym.split(':')[1]) : undefined);
      }
      let provider: LiveQuoteProvider = 'FYERS';
      let quoteTimestamp: Date | null = null;

      const isOption =
        trade.assetClass === 'OPTIONS' ||
        Boolean(trade.optionType) ||
        Boolean(trade.strikePrice) ||
        /(\d+(?:CE|PE))$/i.test(trade.symbol || '');

      let currentLtp: number;
      if (isFyersEligible && quote && typeof quote.ltp === 'number' && quote.ltp > 0) {
        currentLtp = quote.ltp;
        provider = 'FYERS';
        quoteTimestamp = quote.timestamp
          ? new Date(quote.timestamp)
          : quote.last_traded_time
          ? new Date(quote.last_traded_time * 1000)
          : new Date();
      } else {
        // Fallback: Real-time TradingView / Yahoo market scanner quote (strictly non-options only)
        const globalQuote = !isOption
          ? (globalQuotes.get(trade.symbol) || (trade.underlying ? globalQuotes.get(trade.underlying) : undefined))
          : undefined;

        if (globalQuote && typeof globalQuote.ltp === 'number' && globalQuote.ltp > 0) {
          currentLtp = globalQuote.ltp;
          provider = 'SIMULATED';
          quoteTimestamp = globalQuote.timestamp ? new Date(globalQuote.timestamp) : new Date();
        } else if (effectiveHasBroker && this.isPlausiblePrice(trade.calculated?.liveMfeSummary?.peakLtp, fields.entryPrice, isOption)) {
          // Connected broker fallback: peak LTP (if plausible) or entry price
          currentLtp = trade.calculated?.liveMfeSummary?.peakLtp || fields.entryPrice;
          provider = 'FYERS';
          quoteTimestamp = trade.calculated?.liveMfeSummary?.peakTimestamp
            ? new Date(trade.calculated.liveMfeSummary.peakTimestamp)
            : (trade.entryTime ? new Date(trade.entryTime) : new Date(Date.now() - 30000));
        } else {
          currentLtp = this.generateSimulatedLtp(trade, fields.tickSize, fields.stopLoss);
          provider = 'SIMULATED';
          quoteTimestamp = new Date();
        }
      }

      if (quoteTimestamp && (!latestQuoteTimestamp || quoteTimestamp > latestQuoteTimestamp)) {
        latestQuoteTimestamp = quoteTimestamp;
      }

      const isMcxTrade =
        String(trade.exchange || '').toUpperCase() === 'MCX' ||
        String(trade.marketSegment || '').toUpperCase() === 'MCX' ||
        String(trade.assetClass || '').toUpperCase() === 'COMMODITY';
      const isTradeMarketOpen = isMcxTrade ? isMcxMarketOpen : isNseMarketOpen;

      const tradeDataHealth = evaluateDataHealth({
        provider,
        lastTickAt: quoteTimestamp,
        asOf: new Date(),
        isMarketOpen: isTradeMarketOpen,
        staleThresholdSeconds: staleThresholdSec,
        tokenExpiresAt,
        hasActiveBrokerConnection: effectiveHasBroker,
      });

      // Guard against corrupted peak MFE previously stored in DB (e.g. spot index price applied to an option)
      const isExistingPeakPlausible = this.isPlausiblePrice(
        trade.calculated?.liveMfeSummary?.peakLtp,
        fields.entryPrice,
        isOption
      );

      if (trade.calculated?.liveMfeSummary && !isExistingPeakPlausible) {
        Trade.updateOne(
          { _id: trade._id },
          { $unset: { 'calculated.liveMfeSummary': 1 } }
        ).catch(() => {});
      }

      const effectivePeakMfe = isExistingPeakPlausible ? trade.calculated?.liveMfeSummary : undefined;

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
        previousPeakMfe: effectivePeakMfe,
        dataHealth: tradeDataHealth,
        customRules: trade.customLadderRules,
      });

      // Asynchronously persist new peak MFE to DB if new high reached AND price is plausible
      const prevPeak = effectivePeakMfe?.peakFloatingNetPnL ?? -Infinity;
      if (
        metric.giveback &&
        metric.giveback.peakFloatingNetPnL > prevPeak &&
        this.isPlausiblePrice(metric.giveback.peakLtp, fields.entryPrice, isOption)
      ) {
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

    const summaryProvider: LiveQuoteProvider = positions.length === 0
      ? 'SIMULATED'
      : positions.every((p) => p.provider === 'FYERS')
      ? 'FYERS'
      : positions.some((p) => p.provider === 'FYERS')
      ? 'FYERS'
      : 'SIMULATED';

    const globalDataHealth = evaluateDataHealth({
      provider: summaryProvider,
      lastTickAt: latestQuoteTimestamp,
      asOf: new Date(),
      isMarketOpen: isNseMarketOpen,
      staleThresholdSeconds: staleThresholdSec,
      tokenExpiresAt,
      hasActiveBrokerConnection: hasActiveBroker && summaryProvider === 'FYERS',
    });

    return calculateLiveWatcherSummary(positions, new Date(), globalDataHealth);
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
      const accScopeKey = trade.accountId ? trade.accountId.toString() : 'all';
      const cacheKey = `${userId.toString()}:${accScopeKey}:${setupName || trade.strategyId?.toString()}`;
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
            ...(trade.accountId ? { accountId: trade.accountId } : {}),
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
            const prevStop = metric.stopLoss || trade.risk?.currentStopLoss || trade.risk?.initialStopLoss;
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

            // Also persist active currentStopLoss and record stop move event in trade document in DB
            const activeSlPrice = slCheck.slPrice;
            if (prevStop && prevStop !== activeSlPrice) {
              const isTrailed = isLong ? activeSlPrice > prevStop : activeSlPrice < prevStop;
              const moveType: 'TRAILED_FAVORABLY' | 'WIDENED_RISK' = isTrailed ? 'TRAILED_FAVORABLY' : 'WIDENED_RISK';
              const changePts = Math.abs(activeSlPrice - prevStop);
              const changePct = prevStop > 0 ? (changePts / prevStop) * 100 : 0;
              const initialStop = trade.risk?.initialStopLoss || prevStop;

              const newEvent = {
                previousStop: prevStop,
                newStop: activeSlPrice,
                changePoints: Number(changePts.toFixed(4)),
                changePercent: Number(changePct.toFixed(2)),
                moveType,
                movedAt: new Date(),
                orderId: slCheck.orderId,
                reason: `FYERS Resting SL Order #${slCheck.orderId || ''}`,
              };

              Trade.findById(trade._id)
                .then(async (t) => {
                  if (!t) return;
                  t.risk = t.risk || {};
                  t.risk.currentStopLoss = activeSlPrice;
                  t.psychology = t.psychology || ({} as any);
                  t.psychology.stopLossMoved = true;
                  if (moveType === 'WIDENED_RISK') {
                    t.psychology.mistakes = t.psychology.mistakes || [];
                    if (!t.psychology.mistakes.includes('STOP_MOVED')) {
                      t.psychology.mistakes.push('STOP_MOVED');
                    }
                  }
                  t.stopLossMoveEvents = t.stopLossMoveEvents || [];
                  t.stopLossMoveEvents.push(newEvent);

                  const trCount = t.stopLossMoveEvents.filter((e: any) => e.moveType === 'TRAILED_FAVORABLY').length;
                  const widCount = t.stopLossMoveEvents.filter((e: any) => e.moveType === 'WIDENED_RISK').length;
                  const netRiskPts = isLong
                    ? Number((initialStop - activeSlPrice).toFixed(4))
                    : Number((activeSlPrice - initialStop).toFixed(4));

                  t.calculated = t.calculated || ({} as any);
                  t.calculated.stopMoveSummary = {
                    totalMoves: t.stopLossMoveEvents.length,
                    widenedCount: widCount,
                    trailedCount: trCount,
                    initialStop,
                    finalStop: activeSlPrice,
                    netRiskChangePoints: netRiskPts,
                    hasWidenedRisk: widCount > 0,
                    detectedAt: new Date(),
                  };
                  t.auditLog = t.auditLog || [];
                  t.auditLog.push({
                    action: 'STOP_MOVED_DETECTED',
                    timestamp: new Date(),
                    changedBy: 'live-watcher',
                    details: {
                      previousStop: prevStop,
                      newStop: activeSlPrice,
                      moveType,
                    },
                  });
                  await t.save();
                })
                .catch(() => {});
            } else {
              Trade.updateOne(
                { _id: trade._id },
                { $set: { 'risk.currentStopLoss': activeSlPrice } }
              ).catch(() => {});
            }
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

    const [inst, tradeAccount] = await Promise.all([
      Instrument.findOne({
        userId: uId,
        symbol: trade.symbol,
      }).lean(),
      trade.accountId
        ? TradingAccount.findOne({ _id: trade.accountId, userId: uId }).lean()
        : Promise.resolve(null),
    ]);

    const fields = this.extractTradeFields(trade, inst);
    const isFyersEligible = this.isFyersEligibleTrade(trade, tradeAccount);

    const isOption =
      trade.assetClass === 'OPTIONS' ||
      Boolean(trade.optionType) ||
      Boolean(trade.strikePrice) ||
      /(\d+(?:CE|PE))$/i.test(trade.symbol || '');

    const fyersSym = isFyersEligible
      ? formatFyersSymbol({
          symbol: trade.symbol,
          underlying: trade.underlying,
          assetClass: trade.assetClass,
          exchange: trade.exchange,
          marketSegment: trade.marketSegment,
          optionType: trade.optionType,
          strikePrice: trade.strikePrice,
          expiryDate: trade.expiryDate,
        })
      : null;

    let currentLtp: number;
    let provider: LiveQuoteProvider = 'FYERS';

    let quote: any;
    if (isFyersEligible && fyersSym) {
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

    if (isFyersEligible && quote && typeof quote.ltp === 'number' && quote.ltp > 0) {
      currentLtp = quote.ltp;
      provider = 'FYERS';
    } else {
      let globalQuote: any = null;
      if (
        !isOption &&
        process.env.NODE_ENV !== 'test' &&
        !process.env.VITEST &&
        (GlobalCfdCandleProvider.isSupportedGlobalSymbol(trade.symbol, trade.exchange, trade.assetClass) ||
         (trade.underlying && GlobalCfdCandleProvider.isSupportedGlobalSymbol(trade.underlying, trade.exchange, trade.assetClass)))
      ) {
        try {
          const syms = [trade.symbol];
          if (trade.underlying && trade.underlying !== trade.symbol) syms.push(trade.underlying);
          const gMap = await GlobalCfdCandleProvider.getLiveQuotes(syms);
          globalQuote = gMap.get(trade.symbol) || (trade.underlying ? gMap.get(trade.underlying) : undefined);
        } catch {
          // Fallback to simulated LTP
        }
      }

      if (globalQuote && typeof globalQuote.ltp === 'number' && globalQuote.ltp > 0) {
        currentLtp = globalQuote.ltp;
        provider = 'SIMULATED';
      } else if (isFyersEligible) {
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

        if (hasActiveBroker && this.isPlausiblePrice(trade.calculated?.liveMfeSummary?.peakLtp, fields.entryPrice, isOption)) {
          currentLtp = trade.calculated?.liveMfeSummary?.peakLtp || fields.entryPrice;
          provider = 'FYERS';
        } else {
          currentLtp = this.generateSimulatedLtp(trade, fields.tickSize, fields.stopLoss);
          provider = 'SIMULATED';
        }
      } else {
        currentLtp = this.generateSimulatedLtp(trade, fields.tickSize, fields.stopLoss);
        provider = 'SIMULATED';
      }
    }

    const isExistingPeakPlausible = this.isPlausiblePrice(
      trade.calculated?.liveMfeSummary?.peakLtp,
      fields.entryPrice,
      isOption
    );

    if (trade.calculated?.liveMfeSummary && !isExistingPeakPlausible) {
      Trade.updateOne(
        { _id: trade._id },
        { $unset: { 'calculated.liveMfeSummary': 1 } }
      ).catch(() => {});
    }

    const effectivePeakMfe = isExistingPeakPlausible ? trade.calculated?.liveMfeSummary : undefined;

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
      previousPeakMfe: effectivePeakMfe,
      customRules: trade.customLadderRules,
    });

    const prevPeak = effectivePeakMfe?.peakFloatingNetPnL ?? -Infinity;
    if (
      metric.giveback &&
      metric.giveback.peakFloatingNetPnL > prevPeak &&
      this.isPlausiblePrice(metric.giveback.peakLtp, fields.entryPrice, isOption)
    ) {
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
