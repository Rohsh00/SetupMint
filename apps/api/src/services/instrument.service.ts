import mongoose from 'mongoose';
import {
  getPresetSpec,
  TradeOutcome,
} from '@tradevault/shared';
import {
  calculateFIFOExecution,
  calculateIndianCharges,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
  normalizeUnderlying,
} from '@tradevault/financial-engine';
import { Instrument, IInstrumentDoc, Trade, ITradeDoc } from '../db/models/index.js';
import { AccountService } from './account.service.js';

export interface TradedSummaryItem {
  instrumentId: string;
  tradeCount: number;
  netPnL: number;
  firstTradedAt?: string;
  lastTradedAt?: string;
}

export interface InstrumentPreviewResult {
  affectedTradeCount: number;
  tradesCount: number;
  oldTotalNetPnL: number;
  newTotalNetPnL: number;
  deltaNetPnL: number;
  affectedAccountIds: string[];
}

export class InstrumentService {
  /**
   * Normalizes any trading symbol into its base underlying.
   * Strips broker prefixes (NSE:, BSE:, MCX:), option details (strikes, expiries, CE/PE),
   * and futures tokens (FUT).
   *
   * Real-world examples:
   *   NIFTY24OCT24500CE    -> NIFTY
   *   NIFTY 24500 CE       -> NIFTY
   *   NIFTY24O1724500CE    -> NIFTY
   *   BANKNIFTY24OCT51000PE -> BANKNIFTY
   *   BANKNIFTY 24 OCT 51000 PE -> BANKNIFTY
   *   RELIANCE24OCT3000CE  -> RELIANCE
   *   TCS24OCTFUT          -> TCS
   *   MCX:CRUDEOIL24NOVFUT -> CRUDEOIL
   *   CRUDEOILM24NOVFUT    -> CRUDEOIL
   *   GOLDM24OCTFUT        -> GOLD
   *   SILVERM24NOVFUT      -> SILVER
   *   NATGAS24NOVFUT       -> NATURALGAS
   *   BTCUSDT              -> BTCUSDT
   *   EURUSD               -> EURUSD
   */
  static normalizeUnderlying(symbol: string): string {
    return normalizeUnderlying(symbol);
  }

  /**
   * Finds or automatically creates an instrument for a trade's underlying.
   * If a matching instrument exists for { userId, symbol }, returns it.
   * Otherwise, creates a new one with source: 'AUTO'.
   * If known preset specs exist, fills from getPresetSpec(underlying) and sets needsReview = false.
   * If unknown symbol, fills from trade's own data and sets needsReview = true.
   * Handles E11000 duplicate race condition gracefully.
   */
  static async ensureForTrade(
    userId: string | mongoose.Types.ObjectId,
    tradeLike: {
      symbol: string;
      assetClass?: string;
      exchange?: string;
      marketSegment?: string;
      currency?: string;
      instrumentName?: string;
      simpleExecution?: { contractMultiplier?: number; [k: string]: any };
      [k: string]: any;
    }
  ): Promise<IInstrumentDoc> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const underlying = this.normalizeUnderlying(tradeLike.symbol);

    // 1. Check if instrument already exists for this user and underlying
    let existing = await Instrument.findOne({ userId: uId, symbol: underlying });
    if (existing) {
      return existing;
    }

    // 2. Prepare creation payload
    const preset = getPresetSpec(underlying);
    let createPayload: any;

    if (preset) {
      createPayload = {
        userId: uId,
        symbol: underlying,
        displayName: preset.displayName || underlying,
        assetClass: preset.assetClass,
        exchange: preset.exchange,
        marketSegment: preset.marketSegment,
        quoteCurrency: preset.quoteCurrency || 'INR',
        contractMultiplier: preset.contractMultiplier,
        lotSize: preset.lotSize,
        tickSize: preset.tickSize,
        quantityIncrement: preset.quantityIncrement || preset.lotSize,
        pricePrecision: preset.pricePrecision ?? 2,
        isActive: true,
        source: 'AUTO',
        needsReview: false,
      };
    } else {
      createPayload = {
        userId: uId,
        symbol: underlying,
        displayName: tradeLike.instrumentName || underlying,
        assetClass: tradeLike.assetClass || 'EQUITY',
        exchange: tradeLike.exchange || 'NSE',
        marketSegment: tradeLike.marketSegment || 'NSE_EQ',
        quoteCurrency: tradeLike.currency || 'INR',
        contractMultiplier: tradeLike.simpleExecution?.contractMultiplier || 1,
        lotSize: 1,
        tickSize: 0.05,
        quantityIncrement: 1,
        pricePrecision: 2,
        isActive: true,
        source: 'AUTO',
        needsReview: true,
      };
    }

    // 3. Create document handling E11000 duplicate key race
    try {
      return await Instrument.create(createPayload);
    } catch (err: any) {
      if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
        const found = await Instrument.findOne({ userId: uId, symbol: underlying });
        if (found) return found;
      }
      throw err;
    }
  }

  /**
   * Aggregation over Trade grouped by instrumentId, returning tradeCount, netPnL,
   * firstTradedAt, and lastTradedAt for each instrument.
   */
  static async getTradedSummary(
    userId: string | mongoose.Types.ObjectId
  ): Promise<Map<string, TradedSummaryItem>> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const stats = await Trade.aggregate([
      {
        $match: {
          userId: uId,
          instrumentId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$instrumentId',
          tradeCount: { $sum: 1 },
          netPnL: { $sum: '$calculated.netPnL' },
          firstTradedAt: { $min: '$tradeDate' },
          lastTradedAt: { $max: '$tradeDate' },
        },
      },
    ]);

    const summaryMap = new Map<string, TradedSummaryItem>();
    for (const item of stats) {
      summaryMap.set(item._id.toString(), {
        instrumentId: item._id.toString(),
        tradeCount: item.tradeCount,
        netPnL: Number((item.netPnL ?? 0).toFixed(2)),
        firstTradedAt: item.firstTradedAt ? new Date(item.firstTradedAt).toISOString() : undefined,
        lastTradedAt: item.lastTradedAt ? new Date(item.lastTradedAt).toISOString() : undefined,
      });
    }

    return summaryMap;
  }

  /**
   * Computes calculations for a trade using the financial engine.
   * Matches the exact logic from trade routes.
   */
  static computeTradeCalculations(body: any) {
    let grossPnL = 0;
    let totalCosts = 0;
    let netPnL = 0;
    let outcome: TradeOutcome = body.status === 'PLANNED' ? 'OPEN' : 'BREAKEVEN';
    let closedQty = 0;
    let openQty = 0;
    let avgEntry = 0;
    let avgExit: number | undefined = undefined;

    if (body.executionMode === 'SIMPLE' && body.simpleExecution) {
      const exec = body.simpleExecution;
      const res = calculateSimpleExecutionPnL(body.direction, exec);

      grossPnL = res.grossPnLNumber;
      totalCosts = res.totalCostsNumber;
      netPnL = res.netPnLNumber;
      outcome = body.status === 'OPEN' ? 'OPEN' : res.outcome;
      closedQty = exec.exitPrice ? exec.quantity : 0;
      openQty = exec.exitPrice ? 0 : exec.quantity;
      avgEntry = exec.entryPrice;
      avgExit = exec.exitPrice;
    } else if (body.executionMode === 'ADVANCED' && body.fills && body.fills.length > 0) {
      const mult = body.simpleExecution?.contractMultiplier || 1;
      const fifo = calculateFIFOExecution(body.direction, body.fills, mult);

      grossPnL = Number(fifo.realizedGrossPnL.toFixed(2));
      const fifoCosts = Number(fifo.totalCosts.toFixed(2));
      outcome = body.status === 'OPEN' ? 'OPEN' : fifo.outcome;
      closedQty = fifo.closedQuantity.toNumber();
      openQty = fifo.openQuantity.toNumber();
      avgEntry = Number(fifo.weightedAvgEntryPrice.toFixed(4));
      avgExit = fifo.weightedAvgExitPrice ? Number(fifo.weightedAvgExitPrice.toFixed(4)) : undefined;

      const simpleCosts = body.simpleExecution
        ? Number(
            (
              (body.simpleExecution.brokerage || 0) +
              (body.simpleExecution.exchangeFees || 0) +
              (body.simpleExecution.regulatoryFees || 0) +
              (body.simpleExecution.taxes || 0) +
              (body.simpleExecution.otherFees || 0) +
              (body.simpleExecution.explicitAdjustments || 0)
            ).toFixed(2)
          )
        : 0;

      if (fifoCosts > 0) {
        totalCosts = fifoCosts;
      } else if (simpleCosts > 0) {
        totalCosts = simpleCosts;
      } else if (avgEntry > 0 && (closedQty > 0 || openQty > 0)) {
        const autoCharges = calculateIndianCharges({
          assetClass: body.assetClass,
          marketSegment: body.marketSegment,
          entryPrice: avgEntry,
          exitPrice: avgExit,
          quantity: closedQty > 0 ? closedQty : openQty,
          contractMultiplier: mult,
        });
        totalCosts = autoCharges.totalCosts;
        if (!body.simpleExecution) {
          body.simpleExecution = {};
        }
        body.simpleExecution.brokerage = autoCharges.brokerage;
        body.simpleExecution.exchangeFees = autoCharges.exchangeFees;
        body.simpleExecution.regulatoryFees = autoCharges.regulatoryFees;
        body.simpleExecution.taxes = autoCharges.taxes;
      } else {
        totalCosts = 0;
      }

      netPnL = Number((grossPnL - totalCosts).toFixed(2));
      if (body.status !== 'OPEN') {
        if (netPnL > 0) outcome = 'WIN';
        else if (netPnL < 0) outcome = 'LOSS';
        else outcome = 'BREAKEVEN';
      }
    }

    let holdingTimeMinutes: number | undefined;
    if (body.entryTime && body.exitTime) {
      const diffMs = new Date(body.exitTime).getTime() - new Date(body.entryTime).getTime();
      if (diffMs > 0) {
        holdingTimeMinutes = Math.round(diffMs / 60000);
      }
    }

    let plannedRisk = body.risk?.riskBudgetAmount || body.risk?.estimatedRiskAmount;
    const entryForRisk = body.risk?.plannedEntryPrice || avgEntry || body.simpleExecution?.entryPrice;
    if (!plannedRisk && entryForRisk && body.risk?.initialStopLoss) {
      const dist = Math.abs(entryForRisk - body.risk.initialStopLoss);
      const qty = body.simpleExecution?.quantity || closedQty || 1;
      const mult = body.simpleExecution?.contractMultiplier || 1;
      plannedRisk = dist * qty * mult;
    }

    const realizedRMultiple = calculateRealizedRMultiple(netPnL, plannedRisk);

    return {
      grossPnL,
      totalCosts,
      netPnL,
      realizedRMultiple,
      holdingTimeMinutes,
      outcome,
      closedQuantity: closedQty,
      openQuantity: openQty,
      averageEntryPrice: avgEntry,
      averageExitPrice: avgExit,
    };
  }

  /**
   * Preview impact of modifying an instrument on its existing trades.
   * Writes nothing to database.
   */
  static async previewUpdate(
    userId: string | mongoose.Types.ObjectId,
    instrumentId: string | mongoose.Types.ObjectId,
    changes: {
      contractMultiplier?: number;
      lotSize?: number;
      tickSize?: number;
      quantityIncrement?: number;
      symbol?: string;
      displayName?: string;
      [k: string]: any;
    }
  ): Promise<InstrumentPreviewResult> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const instId = typeof instrumentId === 'string' ? new mongoose.Types.ObjectId(instrumentId) : instrumentId;

    const trades = await Trade.find({ userId: uId, instrumentId: instId });
    const affectedTradeCount = trades.length;

    let oldTotalNetPnL = 0;
    let newTotalNetPnL = 0;
    const accountIdSet = new Set<string>();

    const multiplierChanged =
      changes.contractMultiplier !== undefined &&
      changes.contractMultiplier !== null;

    for (const trade of trades) {
      accountIdSet.add(trade.accountId.toString());
      const oldNet = trade.calculated?.netPnL ?? 0;
      oldTotalNetPnL += oldNet;

      if (multiplierChanged) {
        const tradeObj = trade.toObject();
        if (tradeObj.simpleExecution) {
          tradeObj.simpleExecution.contractMultiplier = changes.contractMultiplier!;
        }
        const newCalculations = this.computeTradeCalculations(tradeObj);
        newTotalNetPnL += newCalculations.netPnL;
      } else {
        newTotalNetPnL += oldNet;
      }
    }

    const deltaNetPnL = Number((newTotalNetPnL - oldTotalNetPnL).toFixed(2));
    return {
      affectedTradeCount,
      tradesCount: affectedTradeCount,
      oldTotalNetPnL: Number(oldTotalNetPnL.toFixed(2)),
      newTotalNetPnL: Number(newTotalNetPnL.toFixed(2)),
      deltaNetPnL,
      affectedAccountIds: Array.from(accountIdSet),
    };
  }

  /**
   * Applies updates to an instrument, and if applyToTrades is true,
   * recalculates all linked trades in ONE transaction, appends audit logs,
   * and reconciles affected accounts.
   */
  static async applyUpdate(
    userId: string | mongoose.Types.ObjectId,
    instrumentId: string | mongoose.Types.ObjectId,
    updateData: {
      applyToTrades?: boolean;
      recomputeAutoFees?: boolean;
      symbol?: string;
      displayName?: string;
      assetClass?: any;
      exchange?: string;
      marketSegment?: any;
      quoteCurrency?: string;
      contractMultiplier?: number;
      lotSize?: number;
      tickSize?: number;
      quantityIncrement?: number;
      pricePrecision?: number;
      isActive?: boolean;
      [k: string]: any;
    },
    userEmail: string
  ): Promise<{ instrument: IInstrumentDoc; affectedTradeCount: number }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const instId = typeof instrumentId === 'string' ? new mongoose.Types.ObjectId(instrumentId) : instrumentId;

    // Check instrument existence
    const instrument = await Instrument.findOne({ _id: instId, userId: uId });
    if (!instrument) {
      throw new Error('INSTRUMENT_NOT_FOUND');
    }

    // Check symbol collision if renaming
    if (updateData.symbol && updateData.symbol.toUpperCase() !== instrument.symbol) {
      const targetSymbol = updateData.symbol.toUpperCase().trim();
      const collision = await Instrument.findOne({
        userId: uId,
        symbol: targetSymbol,
        _id: { $ne: instId },
      });
      if (collision) {
        const err: any = new Error(`Instrument with symbol ${targetSymbol} already exists`);
        err.code = 'DUPLICATE_INSTRUMENT';
        err.statusCode = 409;
        throw err;
      }
    }

    const applyToTrades = Boolean(updateData.applyToTrades);
    const recomputeAutoFees = Boolean(updateData.recomputeAutoFees);

    const oldMultiplier = instrument.contractMultiplier;
    const newMultiplier = updateData.contractMultiplier ?? oldMultiplier;
    const oldSymbol = instrument.symbol;
    const newSymbol = updateData.symbol ? updateData.symbol.toUpperCase().trim() : oldSymbol;

    const affectedAccountIds = new Set<string>();
    let affectedTradeCount = 0;

    // Clean instrument update payload
    const { applyToTrades: _a, recomputeAutoFees: _r, ...instrumentFields } = updateData;
    if (instrumentFields.symbol) {
      instrumentFields.symbol = instrumentFields.symbol.toUpperCase().trim();
    }
    // Saving user specs clears needsReview
    instrumentFields.needsReview = false;

    if (!applyToTrades) {
      const updated = await Instrument.findOneAndUpdate(
        { _id: instId, userId: uId },
        { $set: instrumentFields },
        { new: true }
      );
      return { instrument: updated!, affectedTradeCount: 0 };
    }

    // Single Mongo Transaction for updating instrument and all trades
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const updatedInstrument = await Instrument.findOneAndUpdate(
        { _id: instId, userId: uId },
        { $set: instrumentFields },
        { new: true, session }
      );

      const trades = await Trade.find({ userId: uId, instrumentId: instId }).session(session);
      affectedTradeCount = trades.length;

      for (const trade of trades) {
        affectedAccountIds.add(trade.accountId.toString());

        const oldNetPnL = trade.calculated?.netPnL ?? 0;
        let needsRecompute = false;

        // Multiplier change or sync
        const currentTradeMult = trade.simpleExecution?.contractMultiplier ?? 1;
        if (newMultiplier !== oldMultiplier || currentTradeMult !== newMultiplier) {
          if (!trade.simpleExecution) {
            trade.simpleExecution = {} as any;
          }
          trade.simpleExecution!.contractMultiplier = newMultiplier;
          needsRecompute = true;
        }

        // Symbol change
        if (newSymbol !== oldSymbol) {
          trade.underlying = newSymbol;
          // If the trade's symbol was identical to the instrument symbol, update it too
          if (trade.symbol === oldSymbol) {
            trade.symbol = newSymbol;
          }
        }

        // Recompute calculations
        if (needsRecompute || recomputeAutoFees) {
          const tradeObj = trade.toObject();
          if (trade.simpleExecution) {
            tradeObj.simpleExecution = trade.simpleExecution;
          }

          const newCalculations = this.computeTradeCalculations(tradeObj);
          trade.calculated = newCalculations as any;

          trade.auditLog.push({
            action: 'INSTRUMENT_UPDATED',
            timestamp: new Date(),
            changedBy: userEmail,
            details: {
              instrumentId: instId.toString(),
              field: 'contractMultiplier',
              old: oldMultiplier,
              new: newMultiplier,
              oldNetPnL,
              newNetPnL: newCalculations.netPnL,
            },
          });
        }

        await trade.save({ session });
      }

      await session.commitTransaction();

      // Recalculate authoritative account balances outside transaction
      for (const accId of affectedAccountIds) {
        await AccountService.recalculateAccountBalances(accId, uId);
      }

      return { instrument: updatedInstrument!, affectedTradeCount };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
