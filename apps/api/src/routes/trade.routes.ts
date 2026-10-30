import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import {
  calculateFIFOExecution,
  calculateIndianCharges,
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
  calculateDrilldownAggregate,
  aggregateCandles,
  estimateFetchRange,
} from '@tradevault/financial-engine';
import {
  createTradeSchema,
  updateTradeSchema,
  tradeFilterQuerySchema,
  drilldownRequestSchema,
  bulkClassifySchema,
  stopMoveDetectionSchema,
  excursionComputeOptionsSchema,
  chartGenerateOptionsSchema,
  generateChartSchema,
  TradeOutcome,
} from '@tradevault/shared';

import {
  TradingAccount,
  Trade,
  Strategy,
  Instrument,
  Attachment,
  TradeTemplate,
  BrokerIntegration,
  MarketDataIntegration,
  TradeCandleSnapshot,
} from '../db/models/index.js';
import { getStorage } from '../storage/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
import { InstrumentService } from '../services/instrument.service.js';
import { InstrumentClassifier } from '../services/instrument-classifier.service.js';
import { FyersService } from '../services/fyers.service.js';
import { ChartGeneratorService } from '../services/chart-generator.service.js';
import { PatternRecognitionService } from '../services/pattern-recognition.service.js';
import { MarketDataService } from '../services/market-data/index.js';
import { validateObjectIdParam } from '../middleware/validate.js';
import { buildTradeMongooseFilter } from '../services/trade-query.service.js';
import { LiveWatcherService } from '../services/live-watcher.service.js';
import { IdempotencyService } from '../services/idempotency.service.js';
import { TelegramAlertService } from '../services/telegram-alert.service.js';
import { User } from '../db/models/index.js';

export const tradeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {

  app.addHook('preHandler', requireAuth);

  // Helper function to calculate trade details using financial engine
  function computeTradeCalculations(body: any) {
    return InstrumentService.computeTradeCalculations(body);
  }

  // Helper function to derive effective market setup direction (e.g. Short PE is Bullish / LONG)
  function deriveEffectiveDirection(
    executionDirection: string,
    assetClass?: string,
    optionType?: string,
    symbol?: string
  ): 'LONG' | 'SHORT' {
    const cleanSymbol = (symbol || '').trim().toUpperCase();
    const isOption =
      assetClass === 'OPTIONS' ||
      Boolean(optionType) ||
      /PE$|CE$|PUT$|CALL$/i.test(cleanSymbol);

    let resolvedOpt = optionType?.toUpperCase();
    if (!resolvedOpt && isOption && cleanSymbol) {
      if (/PE$|PUT$/i.test(cleanSymbol)) resolvedOpt = 'PUT';
      else if (/CE$|CALL$/i.test(cleanSymbol)) resolvedOpt = 'CALL';
    }

    if (isOption && resolvedOpt) {
      const isPut = resolvedOpt === 'PUT' || resolvedOpt === 'PE';
      if (isPut) {
        // Shorting a Put is Bullish (LONG) on the underlying/setup.
        // Buying a Put is Bearish (SHORT) on the underlying/setup.
        return executionDirection === 'SHORT' ? 'LONG' : 'SHORT';
      } else {
        // Long Call is Bullish (LONG), Short Call is Bearish (SHORT).
        return executionDirection === 'LONG' ? 'LONG' : 'SHORT';
      }
    }

    return executionDirection === 'SHORT' ? 'SHORT' : 'LONG';
  }

  // Helper function to validate classification rules and compute non-blocking warnings
  async function validateTradeClassificationAndComputeWarnings(
    userId: string,
    tradeData: {
      direction: string;
      strategyId?: string;
      setup?: any;
      risk?: any;
      thesis?: any;
      simpleExecution?: any;
      assetClass?: string;
      optionType?: string;
      symbol?: string;
    }
  ): Promise<{ error?: { status: number; code: string; message: string }; warnings: string[] }> {
    const warnings: string[] = [];
    const strategyId = tradeData.strategyId;
    const setup = tradeData.setup;

    if (setup?.variantStatus === 'CLASSIFIED' && !setup?.variantKey) {
      return {
        error: {
          status: 400,
          code: 'INVALID_VARIANT_STATUS',
          message: 'variantStatus is CLASSIFIED but no variantKey was provided',
        },
        warnings: [],
      };
    }

    if (setup?.variantKey && setup?.variantStatus && setup.variantStatus !== 'CLASSIFIED') {
      return {
        error: {
          status: 400,
          code: 'INVALID_VARIANT_STATUS',
          message: `variantKey "${setup.variantKey}" cannot be set when variantStatus is "${setup.variantStatus}"`,
        },
        warnings: [],
      };
    }

    let strategy: any = null;
    if (strategyId) {
      strategy = await Strategy.findOne({ _id: strategyId, userId });
      if (!strategy) {
        return {
          error: {
            status: 400,
            code: 'STRATEGY_NOT_FOUND',
            message: 'Strategy does not exist or does not belong to the user',
          },
          warnings: [],
        };
      }
    }

    if (setup?.variantKey) {
      if (!strategy) {
        return {
          error: {
            status: 400,
            code: 'STRATEGY_REQUIRED',
            message: 'A valid strategyId is required when assigning a setup variantKey',
          },
          warnings: [],
        };
      }

      const variant = (strategy.variants || []).find((v: any) => v.key === setup.variantKey);
      if (!variant) {
        return {
          error: {
            status: 400,
            code: 'VARIANT_NOT_FOUND',
            message: `Variant key "${setup.variantKey}" is not defined in strategy "${strategy.name}"`,
          },
          warnings: [],
        };
      }

      // Direction validation: dynamic check against variant's configured expected direction.
      // In options trading:
      // - Shorting a PE (PUT) option or buying a CE (CALL) option represents an underlying LONG (Bullish) setup.
      // - Buying a PE (PUT) option or shorting a CE (CALL) option represents an underlying SHORT (Bearish) setup.
      // We accept the variant if EITHER raw contract execution direction OR effective underlying setup direction matches.
      if (variant.expected?.direction && tradeData.direction) {
        const effectiveDirection = deriveEffectiveDirection(
          tradeData.direction,
          tradeData.assetClass,
          tradeData.optionType,
          tradeData.symbol
        );
        const matchesRaw = tradeData.direction === variant.expected.direction;
        const matchesEffective = effectiveDirection === variant.expected.direction;

        if (!matchesRaw && !matchesEffective) {
          return {
            error: {
              status: 400,
              code: 'DIRECTION_MISMATCH',
              message: `Variant expects direction ${variant.expected.direction}, but trade direction is ${tradeData.direction}${
                tradeData.optionType
                  ? ` (${tradeData.direction} ${tradeData.optionType} is effectively ${effectiveDirection})`
                  : ''
              }`,
            },
            warnings: [],
          };
        }
      }

      // Contradicting setup attributes
      if (
        variant.expected?.secondLegStatus === 'UNSWEPT' &&
        setup.secondLegStatus === 'SWEPT'
      ) {
        return {
          error: {
            status: 400,
            code: 'CONTRADICTION_ERROR',
            message: 'Variant is UNSWEPT but trade setup specifies secondLegStatus=SWEPT',
          },
          warnings: [],
        };
      }
      if (
        variant.expected?.secondLegStatus === 'SWEPT' &&
        setup.secondLegStatus === 'UNSWEPT'
      ) {
        return {
          error: {
            status: 400,
            code: 'CONTRADICTION_ERROR',
            message: 'Variant is SWEPT but trade setup specifies secondLegStatus=UNSWEPT',
          },
          warnings: [],
        };
      }
      if (
        variant.expected?.liquiditySide === 'NONE' &&
        setup.liquiditySide &&
        setup.liquiditySide !== 'NONE'
      ) {
        return {
          error: {
            status: 400,
            code: 'CONTRADICTION_ERROR',
            message: `Unswept variant expects liquiditySide=NONE, but trade setup has ${setup.liquiditySide}`,
          },
          warnings: [],
        };
      }

      // Non-blocking Warnings:
      // 1. Stop not beyond sweepExtreme
      if (setup.sweepExtreme !== undefined && setup.sweepExtreme !== null && tradeData.risk?.initialStopLoss) {
        const stop = tradeData.risk.initialStopLoss;
        const extreme = setup.sweepExtreme;
        if (tradeData.direction === 'LONG' && stop >= extreme) {
          warnings.push(`Initial stop loss (${stop}) is at or above sweep extreme (${extreme}). For a long sweep setup, the stop should be placed beyond the sweep low.`);
        } else if (tradeData.direction === 'SHORT' && stop <= extreme) {
          warnings.push(`Initial stop loss (${stop}) is at or below sweep extreme (${extreme}). For a short sweep setup, the stop should be placed beyond the sweep high.`);
        }
      }

      // 2. Sweep-type confluences on an UNSWEPT variant
      const isUnswept = variant.expected?.secondLegStatus === 'UNSWEPT' || setup.secondLegStatus === 'UNSWEPT';
      if (isUnswept && Array.isArray(tradeData.thesis?.confluences)) {
        const sweepConfluences = [
          'BUY_SIDE_LIQUIDITY_SWEEP',
          'SELL_SIDE_LIQUIDITY_SWEEP',
          'LIQUIDITY_SWEEP',
          'PREV_DAY_HIGH_SWEEP',
          'PREV_DAY_LOW_SWEEP',
          'ASIAN_RANGE_SWEEP',
          'SESSION_HIGH_LOW_SWEEP',
        ];
        const hasSweep = tradeData.thesis.confluences.some((c: string) => sweepConfluences.includes(c));
        if (hasSweep) {
          warnings.push('Trade confluences include liquidity sweep tags, but variant is an UNSWEPT continuation model.');
        }
      }

      // 3. htfBias contradicting a WITH_HTF variant
      if (variant.expected?.momentumRelation === 'WITH_HTF' && setup.htfBias) {
        if (
          (tradeData.direction === 'LONG' && setup.htfBias === 'BEARISH') ||
          (tradeData.direction === 'SHORT' && setup.htfBias === 'BULLISH')
        ) {
          warnings.push(`Variant expects WITH_HTF momentum, but trade has HTF bias ${setup.htfBias} with direction ${tradeData.direction}.`);
        }
      }

      // 4. planned R:R below effective min R:R
      const effectiveMinRR = variant.minRiskReward ?? strategy.minRiskReward ?? 1.5;
      let plannedRR = tradeData.risk?.plannedRewardRiskRatio;
      if (!plannedRR && tradeData.risk?.plannedEntryPrice && tradeData.risk?.initialStopLoss && tradeData.risk?.plannedTarget) {
        const entry = tradeData.risk.plannedEntryPrice;
        const sl = tradeData.risk.initialStopLoss;
        const tp = tradeData.risk.plannedTarget;
        const riskDist = Math.abs(entry - sl);
        const rewardDist = Math.abs(tp - entry);
        if (riskDist > 0) {
          plannedRR = Number((rewardDist / riskDist).toFixed(2));
        }
      }
      if (plannedRR !== undefined && plannedRR < effectiveMinRR) {
        warnings.push(`Planned R:R (${plannedRR.toFixed(2)}) is below the effective minimum R:R threshold (${effectiveMinRR.toFixed(2)}).`);
      }
    }

    return { warnings };
  }


  function formatTradeDocument(t: any) {
    const exclusionReasons: string[] = [];
    if (t.status !== 'CLOSED') {
      exclusionReasons.push(`NOT_CLOSED (status: ${t.status})`);
    }
    if (!t.risk?.initialStopLoss) {
      exclusionReasons.push('EXCLUDED_NO_STOP');
    }
    if (
      (t.calculated?.realizedRMultiple === undefined || t.calculated?.realizedRMultiple === null) &&
      (!t.risk?.plannedRiskAmount || t.risk.plannedRiskAmount <= 0)
    ) {
      exclusionReasons.push('NO_R_DATA');
    }
    if (t.calculated?.excursion?.reversedAfterStopHit) {
      exclusionReasons.push('STOP_REVERSED');
    }
    if (t.calculated?.stopMoveSummary?.hasWidenedRisk) {
      exclusionReasons.push('RISK_WIDENED');
    }

    return {
      id: t._id.toString(),
      userId: t.userId.toString(),
      accountId: t.accountId?._id ? (t.accountId as any)._id.toString() : t.accountId?.toString(),
      accountName: (t.accountId as any)?.name || 'Account',
      instrumentId: t.instrumentId ? t.instrumentId.toString() : undefined,
      symbol: t.symbol,
      underlying: t.underlying || t.symbol,
      optionType: t.optionType,
      strikePrice: t.strikePrice,
      expiryDate: t.expiryDate ? t.expiryDate.toISOString() : undefined,
      instrumentName: t.instrumentName,
      assetClass: t.assetClass,
      exchange: t.exchange,
      marketSegment: t.marketSegment,
      currency: t.currency,
      direction: t.direction,
      status: t.status,
      strategyId: t.strategyId?._id ? (t.strategyId as any)._id.toString() : t.strategyId?.toString(),
      strategyName: (t.strategyId as any)?.name || t.strategyName || 'Discretionary',
      tags: t.tags || [],
      tradeDate: t.tradeDate ? t.tradeDate.toISOString().split('T')[0] : '',
      entryTime: t.entryTime ? t.entryTime.toISOString() : '',
      exitTime: t.exitTime ? t.exitTime.toISOString() : undefined,
      session: t.session,
      tradeTitle: t.tradeTitle,
      externalBrokerOrderRef: t.externalBrokerOrderRef,
      importBatchId: t.importBatchId,
      templateId: t.templateId,
      executionMode: t.executionMode,
      simpleExecution: t.simpleExecution,
      fills: t.fills,
      risk: t.risk,
      thesis: t.thesis,
      psychology: t.psychology,
      calculated: t.calculated,
      setup: t.setup,
      screenshotIds: (t.screenshotIds || []).map((id: any) => id.toString()),
      createdAt: t.createdAt ? t.createdAt.toISOString() : '',
      updatedAt: t.updatedAt ? t.updatedAt.toISOString() : '',
      exclusionReasons: exclusionReasons.length > 0 ? exclusionReasons : undefined,
    };
  }

  // List trades with pagination, global filtering, and sorting
  app.get('/', async (req, reply) => {
    const queryResult = tradeFilterQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: queryResult.error.issues.map((i) => i.message).join(', ') || 'Invalid query parameters',
          details: queryResult.error.format(),
        },
      });
    }

    const { page, limit, sortBy, sortOrder } = queryResult.data;
    const filter = buildTradeMongooseFilter(queryResult.data, req.user!.id);

    const totalCount = await Trade.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);
    const skip = (page - 1) * limit;

    const sortMap: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    const trades = await Trade.find(filter)
      .sort(sortMap)
      .skip(skip)
      .limit(limit)
      .populate('accountId', 'name broker baseCurrency')
      .populate('strategyId', 'name');

    return reply.send({
      success: true,
      data: trades.map(formatTradeDocument),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  });

  // Universal trade drill-down resolver
  app.post('/drilldown', async (req, reply) => {
    const parseResult = drilldownRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join(', ') || 'Invalid drilldown payload',
          details: parseResult.error.format(),
        },
      });
    }

    const { descriptor, page, limit, sortBy, sortOrder } = parseResult.data;
    const userId = req.user!.id;
    const sortMap: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };
    const skip = (page - 1) * limit;

    let filter: mongoose.FilterQuery<any>;

    if (descriptor.kind === 'TRADE') {
      if (!mongoose.Types.ObjectId.isValid(descriptor.tradeId)) {
        return reply.send({
          success: true,
          data: {
            trades: [],
            totalCount: 0,
            page: 1,
            limit,
            totalPages: 0,
            aggregate: calculateDrilldownAggregate([]),
            descriptor,
          },
        });
      }

      filter = { _id: new mongoose.Types.ObjectId(descriptor.tradeId), userId };
    } else if (descriptor.kind === 'TRADES') {
      const validIds = (descriptor.tradeIds || [])
        .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
        .slice(0, 200)
        .map((id: string) => new mongoose.Types.ObjectId(id));

      filter = { _id: { $in: validIds }, userId };
    } else {
      // FILTER
      filter = buildTradeMongooseFilter(descriptor.filter, userId);
    }

    const totalCount = await Trade.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);

    const [trades, allTradesInFilter] = await Promise.all([
      Trade.find(filter)
        .sort(sortMap)
        .skip(skip)
        .limit(limit)
        .populate('accountId', 'name broker baseCurrency')
        .populate('strategyId', 'name'),
      Trade.find(filter).select('calculated status risk'),
    ]);

    const aggregateTrades = allTradesInFilter.map((t) => ({
      id: t._id.toString(),
      status: t.status,
      calculated: t.calculated,
      netPnL: t.calculated?.netPnL,
      grossPnL: t.calculated?.grossPnL,
      totalCosts: t.calculated?.totalCosts,
      realizedRMultiple: t.calculated?.realizedRMultiple,
    }));

    const aggregate = calculateDrilldownAggregate(aggregateTrades);

    return reply.send({
      success: true,
      data: {
        trades: trades.map(formatTradeDocument),
        totalCount,
        page,
        limit,
        totalPages,
        aggregate,
        descriptor,
      },
    });
  });


  // Create trade
  app.post('/', async (req, reply) => {
    // Check opt-in Hard Discipline Lockout Mode
    const user = await User.findById(req.user!.id);
    if (user?.liveWatcherSettings?.hardDisciplineLockoutEnabled) {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayClosedTrades = await Trade.find({
        userId: req.user!.id,
        status: 'CLOSED',
        exitTime: { $gte: new Date(todayStr + 'T00:00:00.000Z') },
      }).sort({ exitTime: -1 });

      const maxDailyLoss = user.riskSettings?.maxDailyLoss ?? 5000;
      const todayPnl = todayClosedTrades.reduce((acc, t) => acc + (t.calculated?.netPnL || 0), 0);
      const isDailyBreached = todayPnl <= -Math.abs(maxDailyLoss);

      // Check consecutive losses (3 or more consecutive closed trades with negative netPnL)
      let consecutiveLosses = 0;
      for (const t of todayClosedTrades) {
        if ((t.calculated?.netPnL || 0) < 0) {
          consecutiveLosses++;
        } else {
          break;
        }
      }

      if (isDailyBreached || consecutiveLosses >= 3) {
        const lastLossTime = todayClosedTrades[0]?.exitTime || new Date();
        const durationMins = user.liveWatcherSettings?.hardDisciplineLockoutDurationMins || 60;
        const elapsedMins = (Date.now() - new Date(lastLossTime).getTime()) / (1000 * 60);

        if (elapsedMins < durationMins) {
          const remainingMins = Math.ceil(durationMins - elapsedMins);
          return reply.status(403).send({
            success: false,
            error: {
              code: 'DISCIPLINE_LOCKOUT_ACTIVE',
              message: `Discipline Lockout active: ${isDailyBreached ? `Daily loss limit (₹${maxDailyLoss.toLocaleString()}) breached (Current: ₹${todayPnl.toFixed(2)})` : `${consecutiveLosses} consecutive losses recorded`}. New entries locked for ${remainingMins} more minutes.`,
            },
          });
        }
      }
    }

    const parseResult = createTradeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid trade details', details: parseResult.error.format() },
      });
    }

    const body = parseResult.data;

    // Validate classification rules and compute warnings
    const classValidation = await validateTradeClassificationAndComputeWarnings(req.user!.id, {
      direction: body.direction,
      strategyId: body.strategyId,
      setup: body.setup,
      risk: body.risk,
      thesis: body.thesis,
      simpleExecution: body.simpleExecution,
      assetClass: body.assetClass,
      optionType: body.optionType,
      symbol: body.symbol,
    });

    if (classValidation.error) {
      return reply.status(classValidation.error.status).send({
        success: false,
        error: {
          code: classValidation.error.code,
          message: classValidation.error.message,
        },
      });
    }

    // Verify account ownership
    const account = await TradingAccount.findOne({ _id: body.accountId, userId: req.user!.id });
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Trading account not found' },
      });
    }

    // Compute calculations
    const calculated = computeTradeCalculations(body);

    const initialAuditLog: any[] = [
      {
        action: 'CREATED',
        timestamp: new Date(),
        changedBy: req.user!.email,
        details: { initialPnl: calculated.netPnL },
      },
    ];

    if (body.setup?.variantKey) {
      initialAuditLog.push({
        action: 'CLASSIFIED',
        timestamp: new Date(),
        changedBy: req.user!.email || 'user',
        details: {
          previousVariantKey: undefined,
          newVariantKey: body.setup.variantKey,
          previousStatus: 'UNCLASSIFIED',
          newStatus: body.setup.variantStatus || 'CLASSIFIED',
        },
      });
    }

    const tradeData: any = {
      ...body,
      userId: req.user!.id,
      tradeDate: new Date(body.tradeDate),
      entryTime: new Date(body.entryTime),
      exitTime: body.exitTime ? new Date(body.exitTime) : undefined,
      calculated,
      auditLog: initialAuditLog,
    };

    if (!tradeData.strategyId) delete tradeData.strategyId;
    if (!tradeData.instrumentId) delete tradeData.instrumentId;
    if (!tradeData.templateId) delete tradeData.templateId;

    // Dynamically harmonize exchange, marketSegment, and assetClass
    const harmonized = await InstrumentClassifier.harmonizeTradeMeta({
      symbol: tradeData.symbol,
      exchange: tradeData.exchange,
      marketSegment: tradeData.marketSegment,
      assetClass: tradeData.assetClass,
      userId: req.user?.id,
    });
    tradeData.exchange = harmonized.exchange;
    tradeData.marketSegment = harmonized.marketSegment;
    tradeData.assetClass = harmonized.assetClass;

    // Auto-create/ensure instrument for trade's underlying
    const inst = await InstrumentService.ensureForTrade(req.user!.id, tradeData);
    tradeData.instrumentId = inst._id;
    tradeData.underlying = inst.symbol;
    if (!tradeData.instrumentName) {
      tradeData.instrumentName = inst.displayName;
    }

    const trade = await Trade.create(tradeData);

    // Recalculate account realized P&L and balance authoritatively
    await AccountService.recalculateAccountBalances(account._id, req.user!.id);

    // Telegram Notification on Trade Creation
    User.findById(req.user!.id).lean().then((u) => {
      if (u) {
        if (trade.status === 'OPEN') {
          TelegramAlertService.notifyTradeOpened(u, trade).catch(() => {});
        } else if (trade.status === 'CLOSED') {
          TelegramAlertService.notifyTradeClosed(u, trade, {
            netPnL: trade.calculated?.netPnL || 0,
            realizedR: trade.calculated?.realizedRMultiple,
            exitPrice: trade.simpleExecution?.exitPrice || (trade as any).exits?.[0]?.price || 0,
          }).catch(() => {});
        }
      }
    }).catch(() => {});

    // Auto-compute excursion, setup classification & generate snapshot if trade was created in CLOSED status
    if (trade.status === 'CLOSED') {
      FyersService.computeExcursionForTrade(trade._id, req.user!.id).catch((err: any) => {
        req.log.warn('Auto excursion computation threw for trade %s: %s', trade._id, err.message);
      });
      PatternRecognitionService.classifyTrade(trade._id, req.user!.id).catch((err: any) => {
        req.log.warn('Auto setup classification threw for trade %s: %s', trade._id, err.message);
      });
      ChartGeneratorService.ensureTradeSnapshot(trade._id, req.user!.id).catch((err: any) => {
        req.log.warn('Auto snapshot generation threw for trade %s: %s', trade._id, err.message);
      });
    }

    if (body.templateId) {
      await TradeTemplate.findOneAndUpdate(
        { _id: body.templateId, userId: req.user!.id },
        { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } }
      ).catch(() => {});
    }

    return reply.status(201).send({
      success: true,
      data: {
        id: trade._id.toString(),
        symbol: trade.symbol,
        underlying: trade.underlying,
        instrumentId: trade.instrumentId?.toString(),
        strategyId: trade.strategyId?.toString(),
        strategyName: trade.strategyName,
        templateId: trade.templateId,
        setup: trade.setup,
        auditLog: trade.auditLog,
        netPnL: trade.calculated.netPnL,
        outcome: trade.calculated.outcome,
      },
      warnings: classValidation.warnings.length > 0 ? classValidation.warnings : undefined,
    });
  });

  // Bulk classify trades
  app.post('/bulk-classify', async (req: any, reply) => {
    const parseResult = bulkClassifySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid bulk classify parameters', details: parseResult.error.format() },
      });
    }

    const { tradeIds, strategyId, variantKey, variantStatus } = parseResult.data;

    let targetStrategy: any = null;
    if (strategyId) {
      targetStrategy = await Strategy.findOne({ _id: strategyId, userId: req.user!.id });
      if (!targetStrategy) {
        return reply.status(404).send({
          success: false,
          error: { code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found' },
        });
      }
      if (variantKey) {
        const found = (targetStrategy.variants || []).some((v: any) => v.key === variantKey);
        if (!found) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VARIANT_NOT_FOUND', message: `Variant "${variantKey}" not found in strategy "${targetStrategy.name}"` },
          });
        }
      }
    }

    const trades = await Trade.find({ _id: { $in: tradeIds }, userId: req.user!.id });
    let updatedCount = 0;

    for (const trade of trades) {
      const prevKey = trade.setup?.variantKey;
      const prevStatus = trade.setup?.variantStatus || 'UNCLASSIFIED';

      const newKey = variantKey !== undefined ? variantKey : prevKey;
      const newStatus = variantStatus !== undefined
        ? variantStatus
        : (newKey ? 'CLASSIFIED' : prevStatus);

      trade.setup = {
        ...((trade.setup as any)?.toObject ? (trade.setup as any).toObject() : trade.setup || {}),
        variantKey: newKey || undefined,
        variantStatus: newStatus,
      };

      if (strategyId && targetStrategy) {
        trade.strategyId = targetStrategy._id;
        trade.strategyName = targetStrategy.name;
      }

      trade.auditLog.push({
        action: 'CLASSIFIED',
        timestamp: new Date(),
        changedBy: req.user!.email || 'user',
        details: {
          previousVariantKey: prevKey,
          newVariantKey: newKey,
          previousStatus: prevStatus,
          newStatus,
          bulk: true,
        },
      });

      await trade.save();
      updatedCount++;
    }

    return reply.send({
      success: true,
      message: `Successfully classified ${updatedCount} trade(s)`,
      data: { count: updatedCount },
    });
  });

  // Batch auto-classify trades using 4H Trend + 5M Setup pattern recognition
  app.post('/auto-classify-batch', async (req: any, reply) => {
    const tradeIds = Array.isArray(req.body?.tradeIds) ? req.body.tradeIds : [];
    if (tradeIds.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'tradeIds array is required and must not be empty' },
      });
    }

    try {
      const summary = await PatternRecognitionService.classifyBatch(tradeIds, req.user!.id);
      return reply.send({
        success: true,
        message: `Processed ${summary.total} trade(s): ${summary.classified} classified, ${summary.failed} failed`,
        data: summary,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: { code: 'CLASSIFICATION_FAILED', message: err.message || 'Batch classification failed' },
      });
    }
  });

  // Auto-classify single trade using 4H Trend + 5M Setup pattern recognition
  app.post('/:id/auto-classify', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    try {
      const result = await PatternRecognitionService.classifyTrade(req.params.id, req.user!.id);
      return reply.send({
        success: true,
        message: `Successfully classified trade with ${result.strategyName} (${result.variantKey || 'Standard'})`,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.message.includes('not found') ? 404 : 500;
      return reply.status(statusCode).send({
        success: false,
        error: { code: 'CLASSIFICATION_FAILED', message: err.message || 'Auto classification failed' },
      });
    }
  });

  // GET /live/watcher - Real-time open trades MTM, unrealized R, and SL/Target distance
  app.get('/live/watcher', async (req: any, reply) => {
    try {
      const accountId = (req.query as any)?.accountId;
      const summary = await LiveWatcherService.getLiveWatcherSummary(req.user!.id, accountId);
      return reply.send({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      req.log.error('Failed to get live open trades watcher summary: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'LIVE_WATCHER_FAILED',
          message: err.message || 'Failed to fetch live open trade watcher metrics',
        },
      });
    }
  });

  // GET /live/stream - Real-time Server-Sent Events (SSE) stream for zero-polling live metrics
  app.get('/live/stream', async (req: any, reply) => {
    const accountId = (req.query as any)?.accountId;
    const userId = req.user!.id;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');

    // Send initial snapshot
    try {
      const initial = await LiveWatcherService.getLiveWatcherSummary(userId, accountId);
      reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);
    } catch (e: any) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
    }

    if (req.query?.once === 'true' || req.query?.once === true) {
      reply.raw.end();
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const update = await LiveWatcherService.getLiveWatcherSummary(userId, accountId);
        reply.raw.write(`data: ${JSON.stringify(update)}\n\n`);
      } catch (err: any) {
        req.log.warn('SSE stream error: %s', err?.message);
      }
    }, 2000);

    req.raw.on('close', () => {
      clearInterval(intervalId);
    });
  });

  // POST /:id/live-pulse - Records real-time in-trade emotional checkpoint into auditLog
  app.post('/:id/live-pulse', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const { emotion, notes } = req.body || {};
    if (!emotion) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Emotion tag is required' },
      });
    }

    const metric = await LiveWatcherService.getSingleTradeLiveMetric(req.user!.id, trade._id.toString());

    trade.auditLog = trade.auditLog || [];
    trade.auditLog.push({
      action: 'LIVE_PULSE_CHECK' as any,
      timestamp: new Date(),
      changedBy: req.user?.name || 'Trader',
      details: {
        emotion,
        notes: notes || undefined,
        currentLtp: metric?.currentLtp,
        floatingNetPnL: metric?.floatingNetPnL,
        unrealizedR: metric?.unrealizedR,
      },
    });

    await trade.save();

    return reply.send({
      success: true,
      message: `Logged ${emotion} emotional checkpoint`,
      data: {
        emotion,
        timestamp: new Date(),
        metric,
      },
    });
  });

  // Get trade details
  app.get('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id })
      .populate('accountId', 'name broker baseCurrency')
      .populate('strategyId', 'name checklist');

    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const attachments = await Attachment.find({ tradeId: trade._id, userId: req.user!.id }).sort({ createdAt: 1 });
    const formattedAttachments = attachments.map((att) => ({
      id: att._id.toString(),
      tradeId: trade._id.toString(),
      originalName: att.originalName,
      category: att.category,
      caption: att.description,
      description: att.description,
      timeframe: att.timeframe,
      chartTimestamp: att.chartTimestamp,
      sizeBytes: att.sizeBytes,
      mimeType: att.mimeType,
      downloadUrl: `/api/v1/attachments/${att._id}/download`,
      uploadedAt: att.createdAt.toISOString(),
      createdAt: att.createdAt.toISOString(),
      chartMeta: att.chartMeta
        ? {
            resolution: att.chartMeta.resolution,
            paddingBefore: att.chartMeta.paddingBefore,
            paddingAfter: att.chartMeta.paddingAfter,
            appliedBefore: att.chartMeta.appliedBefore,
            appliedAfter: att.chartMeta.appliedAfter,
            truncated: att.chartMeta.truncated,
            generatedAt: att.chartMeta.generatedAt
              ? new Date(att.chartMeta.generatedAt).toISOString()
              : undefined,
            settingsSource: att.chartMeta.settingsSource,
            isStale: Boolean(att.chartMeta.isStale),
          }
        : undefined,
    }));

    return reply.send({
      success: true,
      data: {
        id: trade._id.toString(),
        userId: trade.userId.toString(),
        accountId: trade.accountId?._id ? (trade.accountId as any)._id.toString() : trade.accountId?.toString(),
        accountName: (trade.accountId as any)?.name || 'Account',
        instrumentId: trade.instrumentId ? trade.instrumentId.toString() : undefined,
        symbol: trade.symbol,
        underlying: trade.underlying || trade.symbol,
        optionType: trade.optionType,
        strikePrice: trade.strikePrice,
        expiryDate: trade.expiryDate ? trade.expiryDate.toISOString() : undefined,
        instrumentName: trade.instrumentName,
        assetClass: trade.assetClass,
        exchange: trade.exchange,
        marketSegment: trade.marketSegment,
        currency: trade.currency,
        direction: trade.direction,
        status: trade.status,
        strategyId: trade.strategyId?._id ? (trade.strategyId as any)._id.toString() : trade.strategyId?.toString(),
        strategyName: (trade.strategyId as any)?.name || trade.strategyName,
        tags: trade.tags,
        tradeDate: trade.tradeDate.toISOString().split('T')[0],
        entryTime: trade.entryTime.toISOString(),
        exitTime: trade.exitTime?.toISOString(),
        session: trade.session,
        tradeTitle: trade.tradeTitle,
        externalBrokerOrderRef: trade.externalBrokerOrderRef,
        importBatchId: trade.importBatchId,
        templateId: trade.templateId,
        executionMode: trade.executionMode,
        simpleExecution: trade.simpleExecution,
        fills: trade.fills,
        risk: trade.risk,
        thesis: trade.thesis,
        psychology: trade.psychology,
        calculated: trade.calculated,
        setup: trade.setup,
        screenshotIds: trade.screenshotIds.map((id) => id.toString()),
        attachments: formattedAttachments,
        auditLog: trade.auditLog,
        createdAt: trade.createdAt.toISOString(),
        updatedAt: trade.updatedAt.toISOString(),
      },
    });
  });

  // GET /:id/live - Real-time metric for a single open trade
  app.get('/:id/live', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    try {
      const metric = await LiveWatcherService.getSingleTradeLiveMetric(req.user!.id, req.params.id);
      if (!metric) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
        });
      }
      return reply.send({
        success: true,
        data: metric,
      });
    } catch (err: any) {
      req.log.error('Failed to get single trade live metric: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'LIVE_METRIC_FAILED',
          message: err.message || 'Failed to fetch live metric for trade',
        },
      });
    }
  });

  // Update trade
  app.put('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const existingTrade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!existingTrade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const parseResult = updateTradeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid update details', details: parseResult.error.format() },
      });
    }

    const existingExec = existingTrade.simpleExecution
      ? typeof (existingTrade.simpleExecution as any).toObject === 'function'
        ? (existingTrade.simpleExecution as any).toObject()
        : existingTrade.simpleExecution
      : {};

    const mergedSimpleExecution = parseResult.data.simpleExecution
      ? { ...existingExec, ...parseResult.data.simpleExecution }
      : existingTrade.simpleExecution;

    const mergedData = {
      ...existingTrade.toObject(),
      ...parseResult.data,
      setup: parseResult.data.setup
        ? { ...((existingTrade.setup as any)?.toObject ? (existingTrade.setup as any).toObject() : existingTrade.setup || {}), ...parseResult.data.setup }
        : existingTrade.setup,
      risk: {
        ...existingTrade.risk,
        ...parseResult.data.risk,
        ...(parseResult.data.risk?.initialStopLoss !== undefined
          ? {
              initialStopSource: parseResult.data.risk.initialStopSource ?? 'MANUAL',
              slReviewReason: undefined,
              slReviewCandidates: undefined,
            }
          : {}),
      },
      thesis: { ...existingTrade.thesis, ...parseResult.data.thesis },
      psychology: { ...existingTrade.psychology, ...parseResult.data.psychology },
      simpleExecution: mergedSimpleExecution,
      fills: parseResult.data.fills || existingTrade.fills,
    };

    // Validate classification rules and compute warnings on mergedData
    const classValidation = await validateTradeClassificationAndComputeWarnings(req.user!.id, {
      direction: mergedData.direction,
      strategyId: mergedData.strategyId ? mergedData.strategyId.toString() : undefined,
      setup: mergedData.setup,
      risk: mergedData.risk,
      thesis: mergedData.thesis,
      simpleExecution: mergedData.simpleExecution,
      assetClass: mergedData.assetClass || existingTrade.assetClass,
      optionType: mergedData.optionType || existingTrade.optionType,
      symbol: mergedData.symbol || existingTrade.symbol,
    });

    if (classValidation.error) {
      return reply.status(classValidation.error.status).send({
        success: false,
        error: {
          code: classValidation.error.code,
          message: classValidation.error.message,
        },
      });
    }

    const oldVariantKey = existingTrade.setup?.variantKey;
    const oldVariantStatus = existingTrade.setup?.variantStatus || 'UNCLASSIFIED';
    const newVariantKey = mergedData.setup?.variantKey;
    const newVariantStatus = mergedData.setup?.variantStatus || (newVariantKey ? 'CLASSIFIED' : 'UNCLASSIFIED');
    const classificationChanged = oldVariantKey !== newVariantKey || oldVariantStatus !== newVariantStatus;

    const oldNetPnL = existingTrade.calculated?.netPnL || 0;
    const newCalculated = computeTradeCalculations(mergedData);
    const isClosing = parseResult.data.status === 'CLOSED' && existingTrade.status !== 'CLOSED';

    const auditEntriesToPush: any[] = [
      {
        action: isClosing ? 'CLOSED' : 'UPDATED',
        timestamp: new Date(),
        changedBy: req.user!.email,
        details: {
          oldNetPnL,
          newNetPnL: newCalculated.netPnL,
          ...(isClosing && mergedSimpleExecution?.exitPrice ? { exitPrice: mergedSimpleExecution.exitPrice } : {}),
        },
      },
    ];

    if (classificationChanged) {
      auditEntriesToPush.push({
        action: 'CLASSIFIED',
        timestamp: new Date(),
        changedBy: req.user!.email || 'user',
        details: {
          previousVariantKey: oldVariantKey,
          newVariantKey: newVariantKey,
          previousStatus: oldVariantStatus,
          newStatus: newVariantStatus,
        },
      });
    }

    const updatePayload: any = {
      ...parseResult.data,
      setup: mergedData.setup,
      risk: mergedData.risk,
      thesis: mergedData.thesis,
      psychology: mergedData.psychology,
      simpleExecution: mergedData.simpleExecution,
      fills: mergedData.fills,
      calculated: newCalculated,
      $push: {
        auditLog: {
          $each: auditEntriesToPush,
        },
      },
    };

    if (parseResult.data.tradeDate) updatePayload.tradeDate = new Date(parseResult.data.tradeDate);
    if (parseResult.data.entryTime) updatePayload.entryTime = new Date(parseResult.data.entryTime);
    if (parseResult.data.exitTime) updatePayload.exitTime = new Date(parseResult.data.exitTime);

    if (!parseResult.data.strategyId) {
      delete updatePayload.strategyId;
      if (req.body.strategyId === '' || req.body.strategyId === null) {
        updatePayload.$unset = { ...updatePayload.$unset, strategyId: 1 };
      }
    }
    if (!parseResult.data.instrumentId) {
      delete updatePayload.instrumentId;
      if (req.body.instrumentId === '' || req.body.instrumentId === null) {
        updatePayload.$unset = { ...updatePayload.$unset, instrumentId: 1 };
      }
    }
    if (!parseResult.data.templateId) {
      delete updatePayload.templateId;
      if (req.body.templateId === '' || req.body.templateId === null) {
        updatePayload.$unset = { ...updatePayload.$unset, templateId: 1 };
      }
    }

    // Dynamically harmonize exchange, marketSegment, and assetClass
    const harmonized = await InstrumentClassifier.harmonizeTradeMeta({
      symbol: updatePayload.symbol || existingTrade.symbol,
      exchange: updatePayload.exchange || existingTrade.exchange,
      marketSegment: updatePayload.marketSegment || existingTrade.marketSegment,
      assetClass: updatePayload.assetClass || existingTrade.assetClass,
      userId: req.user?.id,
    });
    updatePayload.exchange = harmonized.exchange;
    updatePayload.marketSegment = harmonized.marketSegment;
    updatePayload.assetClass = harmonized.assetClass;

    // Ensure instrument exists if symbol changed or instrumentId is missing
    if (parseResult.data.symbol || !existingTrade.instrumentId) {
      const inst = await InstrumentService.ensureForTrade(req.user!.id, mergedData);
      updatePayload.instrumentId = inst._id;
      updatePayload.underlying = inst.symbol;
      if (!updatePayload.instrumentName && !existingTrade.instrumentName) {
        updatePayload.instrumentName = inst.displayName;
      }
    }

    const updated = await Trade.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      updatePayload,
      { new: true }
    );

    // Recalculate account balances authoritatively
    await AccountService.recalculateAccountBalances(existingTrade.accountId, req.user!.id);
    if (parseResult.data.accountId && parseResult.data.accountId !== existingTrade.accountId.toString()) {
      await AccountService.recalculateAccountBalances(parseResult.data.accountId, req.user!.id);
    }

    if (updated?.status === 'CLOSED') {
      if (existingTrade.status !== 'CLOSED') {
        // Transitioned to CLOSED (e.g. Quick Close): compute excursion, classify setup and auto-generate snapshot
        FyersService.computeExcursionForTrade(updated._id, req.user!.id).catch((err: any) => {
          req.log.warn('Auto excursion computation threw for trade %s: %s', updated._id, err.message);
        });
        PatternRecognitionService.classifyTrade(updated._id, req.user!.id).catch((err: any) => {
          req.log.warn('Auto setup classification threw for trade %s: %s', updated._id, err.message);
        });
        ChartGeneratorService.ensureTradeSnapshot(updated._id, req.user!.id).catch((err: any) => {
          req.log.warn('Auto snapshot generation threw for trade %s: %s', updated._id, err.message);
        });

        // Telegram Notification for Trade Closure
        User.findById(req.user!.id).lean().then((u) => {
          if (u) {
            TelegramAlertService.notifyTradeClosed(u, updated, {
              netPnL: updated.calculated?.netPnL || 0,
              realizedR: updated.calculated?.realizedRMultiple,
              exitPrice: updated.simpleExecution?.exitPrice || (updated as any).exits?.[0]?.price || 0,
            }).catch(() => {});
          }
        }).catch(() => {});
      } else {
        // Already closed trade was edited: mark snapshots as stale
        await ChartGeneratorService.markSnapshotsStale(updated._id, req.user!.id);
      }
    }

    return reply.send({
      success: true,
      data: updated,
      warnings: classValidation.warnings.length > 0 ? classValidation.warnings : undefined,
    });
  });

  // Adjust / Move Stop Loss on Broker (FYERS) and update SetupMint
  app.post('/:id/broker-sl', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const { stopPrice, executeBroker = true, idempotencyKey } = req.body || {};
    if (!stopPrice || isNaN(Number(stopPrice)) || Number(stopPrice) <= 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STOP_PRICE', message: 'Valid positive stop price is required' },
      });
    }

    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    // Idempotency lock
    const key = idempotencyKey || req.headers['x-idempotency-key'];
    const compositeKey = IdempotencyService.makeKey(req.user!.id, 'broker-sl', `${trade._id}:${key || stopPrice}`);
    let isLocked = false;
    try {
      const lock = IdempotencyService.acquireLock(compositeKey);
      if (lock.cachedResult) {
        return reply.send(lock.cachedResult);
      }
      isLocked = lock.isLocked;
    } catch (lockErr: any) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENT_EXECUTION', message: lockErr.message },
      });
    }

    let brokerResult: any = { executedOnBroker: false, action: 'JOURNAL_ONLY', message: 'Updated in SetupMint journal' };

    if (executeBroker) {
      try {
        brokerResult = await FyersService.executeBrokerStopLoss(req.user!.id, trade._id.toString(), Number(stopPrice));
      } catch (err: any) {
        if (isLocked) IdempotencyService.reject(compositeKey, err);
        req.log.error({ err, tradeId: trade._id }, 'FYERS broker Stop Loss execution failed');
        return reply.status(400).send({
          success: false,
          error: {
            code: 'BROKER_ORDER_ERROR',
            message: err.message || 'Failed to place or modify Stop Loss on FYERS broker',
          },
        });
      }
    }

    // Preserve original initialStopLoss at entry for accurate 1R multiple calculation
    const existingInitialStop = trade.risk?.initialStopLoss || trade.calculated?.stopMoveSummary?.initialStop;
    const initialStop = existingInitialStop ?? Number(stopPrice);

    // Compute original 1R risk amount if not already recorded
    const entryPrice = trade.simpleExecution?.entryPrice || trade.calculated?.averageEntryPrice || 0;
    const qty = trade.calculated?.openQuantity || trade.simpleExecution?.quantity || 1;
    const mult = trade.simpleExecution?.contractMultiplier || 1;
    const initialRisk = (trade.risk?.estimatedRiskAmount && trade.risk.estimatedRiskAmount > 0)
      ? trade.risk.estimatedRiskAmount
      : (trade.risk?.plannedRiskAmount && trade.risk.plannedRiskAmount > 0)
      ? trade.risk.plannedRiskAmount
      : (initialStop && entryPrice > 0)
      ? Math.abs(entryPrice - initialStop) * qty * mult
      : undefined;

    // Update trade in MongoDB
    const prevStop = trade.risk?.currentStopLoss ?? initialStop;
    const newStopPrice = Number(stopPrice);

    trade.risk = {
      ...(trade.risk || {}),
      initialStopLoss: initialStop,
      currentStopLoss: newStopPrice,
      estimatedRiskAmount: initialRisk,
      plannedRiskAmount: initialRisk,
      initialStopSource: brokerResult.executedOnBroker ? 'BROKER_ORDERBOOK' : 'MANUAL',
    };
    trade.psychology = {
      ...(trade.psychology || {}),
      stopLossMoved: true,
    };

    if (prevStop && newStopPrice !== prevStop) {
      const isLong = trade.direction === 'LONG';
      const isTrailed = isLong ? newStopPrice > prevStop : newStopPrice < prevStop;
      const moveType = isTrailed ? 'TRAILED_FAVORABLY' : 'WIDENED_RISK';
      const changePts = Math.abs(newStopPrice - prevStop);
      const changePct = prevStop > 0 ? (changePts / prevStop) * 100 : 0;

      if (!trade.stopLossMoveEvents) trade.stopLossMoveEvents = [];
      trade.stopLossMoveEvents.push({
        previousStop: prevStop,
        newStop: newStopPrice,
        changePoints: Number(changePts.toFixed(4)),
        changePercent: Number(changePct.toFixed(2)),
        moveType,
        movedAt: new Date(),
        orderId: brokerResult?.orderId,
        reason: brokerResult?.message || (brokerResult?.executedOnBroker ? 'FYERS Order Modified' : 'Manual SL Adjustment'),
      });

      const trailedCount = trade.stopLossMoveEvents.filter((e: any) => e.moveType === 'TRAILED_FAVORABLY').length;
      const widenedCount = trade.stopLossMoveEvents.filter((e: any) => e.moveType === 'WIDENED_RISK').length;
      const netRiskChangePoints = isLong
        ? Number((initialStop - newStopPrice).toFixed(4))
        : Number((newStopPrice - initialStop).toFixed(4));

      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.stopMoveSummary = {
        totalMoves: trade.stopLossMoveEvents.length,
        widenedCount,
        trailedCount,
        initialStop,
        finalStop: newStopPrice,
        netRiskChangePoints,
        hasWidenedRisk: widenedCount > 0,
        detectedAt: new Date(),
      };
    }

    trade.auditLog.push({
      action: 'SL_MODIFIED',
      timestamp: new Date(),
      changedBy: req.user!.email || 'user',
      details: {
        newStopLoss: Number(stopPrice),
        executedOnBroker: brokerResult.executedOnBroker,
        brokerAction: brokerResult.action,
        brokerOrderId: brokerResult.orderId,
        brokerMessage: brokerResult.message,
      },
    });

    await trade.save();
    await AccountService.recalculateAccountBalances(trade.accountId, req.user!.id);

    const responsePayload = {
      success: true,
      data: {
        trade,
        brokerResult,
      },
    };

    if (isLocked) IdempotencyService.resolve(compositeKey, responsePayload);
    return reply.send(responsePayload);
  });

  // Exit trade (50% partial or 100% full close) on Broker (FYERS) and update SetupMint
  app.post('/:id/broker-exit', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const { quantity, exitPrice, isFullClose = false, executeBroker = true, idempotencyKey } = req.body || {};
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const currentOpenQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1;
    const exitQty = Number(quantity) > 0 ? Number(quantity) : currentOpenQty;
    const resolvedExitPrice = Number(exitPrice) || trade.simpleExecution?.entryPrice || 100;
    const isReallyFullClose = isFullClose || exitQty >= currentOpenQty;

    // Idempotency lock
    const key = idempotencyKey || req.headers['x-idempotency-key'];
    const compositeKey = IdempotencyService.makeKey(req.user!.id, 'broker-exit', `${trade._id}:${key || exitQty}`);
    let isLocked = false;
    try {
      const lock = IdempotencyService.acquireLock(compositeKey);
      if (lock.cachedResult) {
        return reply.send(lock.cachedResult);
      }
      isLocked = lock.isLocked;
    } catch (lockErr: any) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENT_EXECUTION', message: lockErr.message },
      });
    }

    let brokerResult: any = { executedOnBroker: false, message: 'Updated in SetupMint journal' };

    if (executeBroker) {
      try {
        brokerResult = await FyersService.executeBrokerExit(req.user!.id, trade._id.toString(), {
          exitQty,
          isFullClose: isReallyFullClose,
        });
      } catch (err: any) {
        if (isLocked) IdempotencyService.reject(compositeKey, err);
        req.log.error({ err, tradeId: trade._id }, 'FYERS broker exit order failed');
        return reply.status(400).send({
          success: false,
          error: {
            code: 'BROKER_ORDER_ERROR',
            message: err.message || 'Failed to execute exit order on FYERS broker',
          },
        });
      }
    }

    // Determine actual effective exit price and execution slippage
    const effectiveExitPrice = (brokerResult.executedOnBroker && brokerResult.tradedPrice && brokerResult.tradedPrice > 0)
      ? brokerResult.tradedPrice
      : resolvedExitPrice;
    const slippagePoints = brokerResult.executedOnBroker ? (effectiveExitPrice - resolvedExitPrice) : 0;

    // Update trade record in MongoDB
    if (isReallyFullClose) {
      if (trade.executionMode === 'ADVANCED' && Array.isArray(trade.fills) && trade.fills.length > 0) {
        trade.fills.push({
          fillId: `exit_${Date.now()}`,
          type: 'EXIT',
          price: effectiveExitPrice,
          quantity: exitQty,
          timestamp: new Date(),
          brokerage: 20,
          exchangeFee: 0,
          taxes: 0,
          notes: brokerResult.executedOnBroker ? `FYERS execution (Slippage: ${slippagePoints.toFixed(2)} pts)` : undefined,
        });
      } else {
        trade.simpleExecution = {
          entryPrice: trade.simpleExecution?.entryPrice ?? 0,
          quantity: trade.simpleExecution?.quantity ?? 1,
          contractMultiplier: trade.simpleExecution?.contractMultiplier ?? 1,
          brokerage: trade.simpleExecution?.brokerage ?? 0,
          exchangeFees: trade.simpleExecution?.exchangeFees ?? 0,
          regulatoryFees: trade.simpleExecution?.regulatoryFees ?? 0,
          taxes: trade.simpleExecution?.taxes ?? 0,
          otherFees: trade.simpleExecution?.otherFees ?? 0,
          explicitAdjustments: trade.simpleExecution?.explicitAdjustments ?? 0,
          ...(trade.simpleExecution || {}),
          exitPrice: effectiveExitPrice,
        };
        trade.exitTime = new Date();
      }
      trade.status = 'CLOSED';
    } else {
      // Partial close: ensure trade is ADVANCED
      trade.executionMode = 'ADVANCED';
      if (!Array.isArray(trade.fills) || trade.fills.length === 0) {
        // Initial entry fill for original quantity
        trade.fills = [
          {
            fillId: `entry_${Date.now()}`,
            type: 'ENTRY',
            price: trade.simpleExecution?.entryPrice || effectiveExitPrice,
            quantity: currentOpenQty,
            timestamp: trade.entryTime || new Date(),
            brokerage: 20,
            exchangeFee: 0,
            taxes: 0,
          },
        ];
      }
      trade.fills.push({
        fillId: `exit_${Date.now()}`,
        type: 'EXIT',
        price: effectiveExitPrice,
        quantity: exitQty,
        timestamp: new Date(),
        brokerage: 20,
        exchangeFee: 0,
        taxes: 0,
        notes: brokerResult.executedOnBroker ? `FYERS partial exit (Slippage: ${slippagePoints.toFixed(2)} pts)` : undefined,
      });
      trade.status = 'OPEN';
    }

    const recalculated = computeTradeCalculations(trade.toObject());
    trade.calculated = recalculated;
    trade.auditLog.push({
      action: isReallyFullClose ? 'CLOSED' : 'PARTIALLY_CLOSED',
      timestamp: new Date(),
      changedBy: req.user!.email || 'user',
      details: {
        exitQuantity: exitQty,
        requestedPrice: resolvedExitPrice,
        effectiveExitPrice,
        slippagePoints,
        executedOnBroker: brokerResult.executedOnBroker,
        brokerOrderId: brokerResult.orderId,
        brokerMessage: brokerResult.message,
      },
    });

    await trade.save();
    await AccountService.recalculateAccountBalances(trade.accountId, req.user!.id);

    const responsePayload = {
      success: true,
      data: {
        trade,
        brokerResult,
        slippagePoints,
      },
    };

    if (isLocked) IdempotencyService.resolve(compositeKey, responsePayload);
    return reply.send(responsePayload);
  });

  // Execute Multi-Target Ladder Step: Book Partial Exit + Trail Stop Loss atomically
  app.post('/:id/broker-ladder-step', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const {
      targetIndex = 1,
      label = 'Ladder Step',
      exitQty = 0,
      exitPrice,
      newStopLoss,
      executeBroker = true,
      reason,
      idempotencyKey,
    } = req.body || {};

    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const currentOpenQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1;
    const requestedExitQty = Math.min(Number(exitQty) > 0 ? Number(exitQty) : 0, currentOpenQty);
    const resolvedExitPrice = Number(exitPrice) || trade.simpleExecution?.entryPrice || 0;
    const isFullClose = requestedExitQty >= currentOpenQty;

    // Idempotency lock
    const key = idempotencyKey || req.headers['x-idempotency-key'];
    const compositeKey = IdempotencyService.makeKey(req.user!.id, 'broker-ladder-step', `${trade._id}:${targetIndex}:${key || requestedExitQty}`);
    let isLocked = false;
    try {
      const lock = IdempotencyService.acquireLock(compositeKey);
      if (lock.cachedResult) {
        return reply.send(lock.cachedResult);
      }
      isLocked = lock.isLocked;
    } catch (lockErr: any) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENT_EXECUTION', message: lockErr.message },
      });
    }

    let brokerExitResult: any = { executedOnBroker: false, message: 'No broker exit executed' };
    let brokerSlResult: any = { executedOnBroker: false, message: 'No broker SL move executed' };

    // 1. If executing on broker, perform exit and SL adjustments
    if (executeBroker) {
      // a. Partial or full exit order
      if (requestedExitQty > 0) {
        try {
          brokerExitResult = await FyersService.executeBrokerExit(req.user!.id, trade._id.toString(), {
            exitQty: requestedExitQty,
            isFullClose,
          });
        } catch (err: any) {
          if (isLocked) IdempotencyService.reject(compositeKey, err);
          req.log.error({ err, tradeId: trade._id }, 'FYERS ladder step exit order failed');
          return reply.status(400).send({
            success: false,
            error: {
              code: 'BROKER_EXIT_ERROR',
              message: `Failed to exit ${requestedExitQty} lots on FYERS: ${err.message || 'Broker error'}`,
            },
          });
        }
      }

      // b. Trail Stop Loss order
      if (newStopLoss && Number(newStopLoss) > 0 && !isFullClose) {
        try {
          brokerSlResult = await FyersService.executeBrokerStopLoss(req.user!.id, trade._id.toString(), Number(newStopLoss));
        } catch (err: any) {
          req.log.error({ err, tradeId: trade._id }, 'FYERS ladder step SL modification failed');
          // Note: Exit already succeeded, so we inform user about SL warning
          brokerSlResult = {
            executedOnBroker: false,
            warning: true,
            message: `Exit executed, but trailing SL to ${newStopLoss} failed: ${err.message || 'Broker SL error'}`,
          };
        }
      }
    }

    // Determine actual effective exit price and execution slippage
    const effectiveExitPrice = (brokerExitResult.executedOnBroker && brokerExitResult.tradedPrice && brokerExitResult.tradedPrice > 0)
      ? brokerExitResult.tradedPrice
      : resolvedExitPrice;
    const slippagePoints = brokerExitResult.executedOnBroker ? (effectiveExitPrice - resolvedExitPrice) : 0;

    // 2. Record partial exit fills in MongoDB
    if (requestedExitQty > 0) {
      if (isFullClose) {
        if (trade.executionMode === 'ADVANCED' && Array.isArray(trade.fills) && trade.fills.length > 0) {
          trade.fills.push({
            fillId: `ladder_exit_${Date.now()}`,
            type: 'EXIT',
            price: effectiveExitPrice,
            quantity: requestedExitQty,
            timestamp: new Date(),
            brokerage: 20,
            exchangeFee: 0,
            taxes: 0,
            notes: `${label}: Full exit booked${brokerExitResult.executedOnBroker ? ` (Slippage: ${slippagePoints.toFixed(2)} pts)` : ''}`,
          });
        } else {
          trade.simpleExecution = {
            entryPrice: trade.simpleExecution?.entryPrice ?? 0,
            quantity: trade.simpleExecution?.quantity ?? 1,
            contractMultiplier: trade.simpleExecution?.contractMultiplier ?? 1,
            brokerage: trade.simpleExecution?.brokerage ?? 0,
            exchangeFees: trade.simpleExecution?.exchangeFees ?? 0,
            regulatoryFees: trade.simpleExecution?.regulatoryFees ?? 0,
            taxes: trade.simpleExecution?.taxes ?? 0,
            otherFees: trade.simpleExecution?.otherFees ?? 0,
            explicitAdjustments: trade.simpleExecution?.explicitAdjustments ?? 0,
            ...(trade.simpleExecution || {}),
            exitPrice: effectiveExitPrice,
          };
          trade.exitTime = new Date();
        }
        trade.status = 'CLOSED';
      } else {
        trade.executionMode = 'ADVANCED';
        if (!Array.isArray(trade.fills) || trade.fills.length === 0) {
          trade.fills = [
            {
              fillId: `entry_${Date.now()}`,
              type: 'ENTRY',
              price: trade.simpleExecution?.entryPrice || effectiveExitPrice,
              quantity: currentOpenQty,
              timestamp: trade.entryTime || new Date(),
              brokerage: 20,
              exchangeFee: 0,
              taxes: 0,
            },
          ];
        }
        trade.fills.push({
          fillId: `ladder_step_${targetIndex}_${Date.now()}`,
          type: 'EXIT',
          price: effectiveExitPrice,
          quantity: requestedExitQty,
          timestamp: new Date(),
          brokerage: 20,
          exchangeFee: 0,
          taxes: 0,
          notes: `${label}: Partial profit booked${brokerExitResult.executedOnBroker ? ` (Slippage: ${slippagePoints.toFixed(2)} pts)` : ''}`,
        });
        trade.status = 'OPEN';
      }
    }

    // 3. Update Stop Loss in MongoDB
    if (newStopLoss && Number(newStopLoss) > 0 && !isFullClose) {
      const existingInitialStop = trade.risk?.initialStopLoss || trade.calculated?.stopMoveSummary?.initialStop;
      const initialStop = existingInitialStop ?? trade.risk?.currentStopLoss ?? Number(newStopLoss);
      const prevStop = trade.risk?.currentStopLoss ?? initialStop;

      trade.risk = {
        ...(trade.risk || {}),
        initialStopLoss: initialStop,
        currentStopLoss: Number(newStopLoss),
        initialStopSource: trade.risk?.initialStopSource || (executeBroker ? 'BROKER_ORDERBOOK' : 'MANUAL'),
      };
      trade.psychology = {
        ...(trade.psychology || {}),
        stopLossMoved: true,
      };

      if (!trade.stopLossMoveEvents) trade.stopLossMoveEvents = [];
      trade.stopLossMoveEvents.push({
        previousStop: prevStop,
        newStop: Number(newStopLoss),
        changePoints: Math.abs(Number(newStopLoss) - prevStop),
        changePercent: prevStop > 0 ? (Math.abs(Number(newStopLoss) - prevStop) / prevStop) * 100 : 0,
        moveType: 'TRAILED_FAVORABLY',
        movedAt: new Date(),
        reason: reason || `${label}: Trailed stop to protect profit`,
      });
    }

    // 4. Recalculate trade analytics
    const recalculated = computeTradeCalculations(trade.toObject());
    trade.calculated = recalculated;

    trade.auditLog.push({
      action: `LADDER_STEP_${targetIndex}`,
      timestamp: new Date(),
      changedBy: req.user!.email || 'user',
      details: {
        label,
        targetIndex,
        exitQty: requestedExitQty,
        requestedPrice: resolvedExitPrice,
        effectiveExitPrice,
        slippagePoints,
        newStopLoss: Number(newStopLoss) || undefined,
        executedOnBroker: executeBroker,
        brokerExitResult,
        brokerSlResult,
      },
    });

    await trade.save();
    await AccountService.recalculateAccountBalances(trade.accountId, req.user!.id);

    const responsePayload = {
      success: true,
      data: {
        trade,
        brokerExitResult,
        brokerSlResult,
        slippagePoints,
      },
    };

    if (isLocked) IdempotencyService.resolve(compositeKey, responsePayload);
    return reply.send(responsePayload);
  });

  // Delete trade
  app.delete('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const accountId = trade.accountId;

    // Safely remove associated attachments from cloud storage and database
    const storage = getStorage();
    const attachments = await Attachment.find({ tradeId: req.params.id, userId: req.user!.id });
    for (const att of attachments) {
      try {
        await storage.delete(att.storedFilename);
      } catch (err: any) {
        req.log.warn('Failed to delete attachment object from storage: %s', err.message);
      }
    }
    await Attachment.deleteMany({ tradeId: req.params.id, userId: req.user!.id });

    await Trade.deleteOne({ _id: req.params.id });

    // Reconcile account balance after deletion
    await AccountService.recalculateAccountBalances(accountId, req.user!.id);

    return reply.send({ success: true, message: 'Trade and associated screenshots deleted successfully' });
  });

  // Duplicate trade
  app.post('/:id/duplicate', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const tradeObj: any = trade.toObject();
    delete tradeObj._id;
    delete tradeObj.id;
    delete tradeObj.createdAt;
    delete tradeObj.updatedAt;
    delete tradeObj.__v;

    // Reset date/times to current
    tradeObj.tradeDate = new Date();
    tradeObj.entryTime = new Date();
    tradeObj.exitTime = undefined;
    tradeObj.status = 'OPEN';
    tradeObj.tradeTitle = `${trade.tradeTitle || trade.symbol} (Copy)`;
    tradeObj.screenshotIds = [];
    tradeObj.auditLog = [
      {
        action: 'DUPLICATED',
        timestamp: new Date(),
        changedBy: req.user!.email,
        details: { sourceTradeId: req.params.id },
      },
    ];

    if (tradeObj.simpleExecution) {
      tradeObj.simpleExecution.exitPrice = undefined;
    }
    tradeObj.fills = [];

    const newCalculated = computeTradeCalculations(tradeObj);
    tradeObj.calculated = newCalculated;

    const inst = await InstrumentService.ensureForTrade(req.user!.id, tradeObj);
    tradeObj.instrumentId = inst._id;
    tradeObj.underlying = inst.symbol;

    const duplicated = await Trade.create(tradeObj);

    return reply.status(201).send({
      success: true,
      data: {
        id: duplicated._id.toString(),
        symbol: duplicated.symbol,
      },
    });
  });

  // Bulk Tagging
  app.post('/bulk-tag', async (req: any, reply) => {
    const { tradeIds, tagsToAdd } = req.body;
    if (!Array.isArray(tradeIds) || !Array.isArray(tagsToAdd)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_BODY', message: 'tradeIds and tagsToAdd must be arrays' },
      });
    }

    await Trade.updateMany(
      { _id: { $in: tradeIds }, userId: req.user!.id },
      { $addToSet: { tags: { $each: tagsToAdd } } }
    );

    return reply.send({ success: true, message: `Updated tags for ${tradeIds.length} trades` });
  });

  // Bulk Delete with comprehensive account reconciliation
  app.post('/bulk-delete', async (req: any, reply) => {
    const { tradeIds } = req.body;
    if (!Array.isArray(tradeIds)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_BODY', message: 'tradeIds must be an array' },
      });
    }

    // 1. Find all affected accounts first
    const tradesToDelete = await Trade.find(
      { _id: { $in: tradeIds }, userId: req.user!.id },
      { accountId: 1 }
    );

    const affectedAccountIds = Array.from(new Set(tradesToDelete.map((t) => t.accountId.toString())));

    // 2. Safely remove associated attachments from cloud storage and database
    const storage = getStorage();
    const attachments = await Attachment.find({ tradeId: { $in: tradeIds }, userId: req.user!.id });
    for (const att of attachments) {
      try {
        await storage.delete(att.storedFilename);
      } catch (err: any) {
        req.log.warn('Failed to delete attachment object from storage: %s', err.message);
      }
    }
    await Attachment.deleteMany({ tradeId: { $in: tradeIds }, userId: req.user!.id });

    // 3. Perform trade deletion
    await Trade.deleteMany({ _id: { $in: tradeIds }, userId: req.user!.id });

    // 4. Reconcile all affected accounts
    for (const accId of affectedAccountIds) {
      await AccountService.recalculateAccountBalances(accId, req.user!.id);
    }

    return reply.send({ success: true, message: `Deleted ${tradesToDelete.length} trades and reconciled balances` });
  });

  // Compute excursion metrics for a closed trade
  app.post(
    '/:id/excursion/compute',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const parsedBody = excursionComputeOptionsSchema.safeParse(req.body || {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid excursion compute parameters',
            details: parsedBody.error.format(),
          },
        });
      }

      const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
      if (!trade) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found or unauthorized' },
        });
      }

      if (trade.status !== 'CLOSED') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TRADE_NOT_CLOSED',
            message: 'Excursion can only be calculated for closed trades',
          },
        });
      }

      const requestedProvider = parsedBody.data.provider;

      // Check active provider sessions
      const fyersIntegration = await BrokerIntegration.findOne({
        userId: req.user!.id,
        broker: 'FYERS',
      });
      const fyersExpiry = fyersIntegration?.tokenExpiresAt || fyersIntegration?.authCodeExpiresAt;
      const isFyersValid = Boolean(
        fyersIntegration?.accessToken && fyersExpiry && new Date(fyersExpiry) > new Date()
      );

      const angelOneDoc = await MarketDataIntegration.findOne({
        userId: req.user!.id,
        provider: 'ANGEL_ONE',
      });
      const isAngelOneValid = Boolean(
        angelOneDoc?.tokenExpiresAt && new Date(angelOneDoc.tokenExpiresAt) > new Date()
      );

      if (requestedProvider === 'ANGEL_ONE' && !isAngelOneValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'MARKET_DATA_NOT_CONNECTED',
            message:
              'Active Angel One market data session is required. Please connect Angel One in Settings.',
          },
        });
      }

      if (requestedProvider === 'AUTO' && !isFyersValid && !isAngelOneValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'BROKER_NOT_CONNECTED',
            message:
              'Active market data session (FYERS or Angel One) is required. Please connect in Settings.',
          },
        });
      }

      try {
        const forceRefetch = parsedBody.data.forceRefetch ?? true;
        const excursion = await FyersService.computeExcursionForTrade(
          req.params.id,
          req.user!.id,
          forceRefetch,
          { provider: requestedProvider }
        );
        return reply.send({
          success: true,
          data: excursion,
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'COMPUTATION_FAILED',
            message: err.message || 'Failed to compute excursion metrics',
          },
        });
      }
    }
  );

  // Generate automated SVG execution charts from candlestick data
  app.post(
    '/:id/chart/generate',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const parsedBody = generateChartSchema.safeParse(req.body || {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid chart generation parameters',
            details: parsedBody.error.format(),
          },
        });
      }

      const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
      if (!trade) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found or unauthorized' },
        });
      }

      if (trade.status !== 'CLOSED') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TRADE_NOT_CLOSED',
            message: 'Automated execution charts can only be generated for closed trades',
          },
        });
      }

      try {
        const { force, provider, resolutions, paddingBefore, paddingAfter } = parsedBody.data;
        const results = await ChartGeneratorService.generateAutoChartsForTrade(
          trade._id,
          req.user!.id,
          {
            force,
            provider,
            resolutions,
            paddingBefore,
            paddingAfter,
          }
        );

        // If resolutions was explicitly requested, return the multi-item envelope
        if (resolutions && resolutions.length > 0) {
          return reply.status(200).send({
            success: true,
            data: {
              results,
            },
          });
        }

        // Legacy path (no resolutions specified): return single attachment or error
        const primary = results[0];
        if (!primary || primary.status === 'FAILED') {
          return reply.status(500).send({
            success: false,
            error: {
              code: primary?.errorCode || 'CHART_GENERATION_FAILED',
              message: 'Failed to generate automated chart screenshot',
            },
          });
        }

        return reply.status(201).send({
          success: true,
          data: primary.attachment,
        });
      } catch (err: any) {
        req.log.error('Auto chart generation failed for trade %s: %s', trade._id, err.message);
        return reply.status(500).send({
          success: false,
          error: {
            code: err.code || 'CHART_GENERATION_FAILED',
            message: err.message || 'Failed to generate automated chart screenshot',
          },
        });
      }
    }
  );

  // Detect and track stop-loss modifications and risk expansion (trailing vs widening)
  app.post(
    '/:id/stop-moves/detect',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
      if (!trade) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found or unauthorized' },
        });
      }

      const parseResult = stopMoveDetectionSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid stop move detection payload',
            details: parseResult.error.issues,
          },
        });
      }

      try {
        const result = await FyersService.detectStopMovesForTrade(
          trade._id,
          req.user!.id,
          { manualModifications: parseResult.data.manualModifications }
        );

        return reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        req.log.error('Stop move detection failed for trade %s: %s', trade._id, err.message);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'STOP_MOVE_DETECTION_FAILED',
            message: err.message || 'Failed to detect stop moves for trade',
          },
        });
      }
    }
  );

  // Get recorded stop-loss modifications and summary for a trade
  app.get(
    '/:id/stop-moves',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
      if (!trade) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found or unauthorized' },
        });
      }

      return reply.send({
        success: true,
        data: {
          stopLossMoveEvents: trade.stopLossMoveEvents || [],
          stopMoveSummary: trade.calculated?.stopMoveSummary || null,
        },
      });
    }
  );

  // GET /:id/interactive-candles - Retrieve candles & execution overlays for interactive TradingView chart
  app.get(
    '/:id/interactive-candles',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
      if (!trade) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found or unauthorized' },
        });
      }

      const query = (req.query || {}) as {
        resolution?: string;
        from?: string;
        to?: string;
        preloadBefore?: string | number;
        preloadAfter?: string | number;
        force?: string | boolean;
      };

      const resolution = (query.resolution || '5').trim();
      const validResolutions = ['1', '3', '5', '15', '30', '60', '240', 'D'];
      const targetRes = validResolutions.includes(resolution) ? resolution : '5';

      let baseRes = '5';
      let targetMinutes = 5;
      if (targetRes === '1') {
        baseRes = '1';
        targetMinutes = 1;
      } else if (targetRes === '3') {
        baseRes = '1';
        targetMinutes = 3;
      } else if (targetRes === '5') {
        baseRes = '5';
        targetMinutes = 5;
      } else if (targetRes === '15') {
        baseRes = '5';
        targetMinutes = 15;
      } else if (targetRes === '30') {
        baseRes = '5';
        targetMinutes = 30;
      } else if (targetRes === '60') {
        baseRes = '5';
        targetMinutes = 60;
      } else if (targetRes === '240') {
        baseRes = '5';
        targetMinutes = 240;
      } else if (targetRes === 'D') {
        baseRes = 'D';
        targetMinutes = 1440;
      }

      const sessionAnchor =
        trade.exchange === 'MCX' || trade.marketSegment === 'MCX' ? '09:00' : '09:15';

      const entryTime = trade.entryTime ? new Date(trade.entryTime) : new Date();
      const exitTime = trade.exitTime ? new Date(trade.exitTime) : entryTime;

      const pBefore = Math.max(20, Math.min(1000, Number(query.preloadBefore) || 150));
      const pAfter = Math.max(10, Math.min(500, Number(query.preloadAfter) || 50));
      const forceRefetch = query.force === 'true' || query.force === true;

      let rangeFrom: Date;
      let rangeTo: Date;

      if (query.from && query.to) {
        const parseTs = (v: string | number) => {
          const n = Number(v);
          if (!isNaN(n)) return new Date(n < 1e11 ? n * 1000 : n);
          return new Date(v);
        };
        rangeFrom = parseTs(query.from);
        rangeTo = parseTs(query.to);
      } else if (query.to && !query.from) {
        const toTs = Number(query.to);
        const toDate = !isNaN(toTs) ? new Date(toTs < 1e11 ? toTs * 1000 : toTs) : new Date(query.to);
        rangeTo = toDate;
        const rawDeltaMs = pBefore * targetMinutes * 60 * 1000 * 2.8;
        rangeFrom = new Date(rangeTo.getTime() - rawDeltaMs);
      } else {
        const est = estimateFetchRange(entryTime, exitTime, targetMinutes, pBefore, pAfter);
        rangeFrom = est.from;
        rangeTo = est.to;
      }

      let candlesResult: any = null;
      let rawCandles: any[] = [];

      // 1. Fast cache-first retrieval from MongoDB snapshot docs (when not forcing refetch)
      if (!forceRefetch) {
        const snapshots = await TradeCandleSnapshot.find({
          userId: req.user!.id,
          tradeId: trade._id,
        }).sort({ fetchedAt: -1 });

        // A. Look for exact resolution snapshot
        const exactSnap = snapshots.find((s) => s.resolution === targetRes);
        if (exactSnap && exactSnap.candles && exactSnap.candles.length > 0) {
          rawCandles = exactSnap.candles;
          baseRes = exactSnap.resolution;
          candlesResult = {
            provider: exactSnap.provider || 'FYERS',
            isUnderlyingFallback: Boolean(exactSnap.isUnderlyingFallback),
            symbol: exactSnap.symbol || trade.symbol,
          };
        } else {
          // B. Look for 5m or 1m snapshot from which to derive target resolution
          const snap5m = snapshots.find((s) => s.resolution === '5');
          const snap1m = snapshots.find((s) => s.resolution === '1');

          if (targetMinutes >= 5 && snap5m && snap5m.candles?.length) {
            rawCandles = snap5m.candles;
            baseRes = '5';
            candlesResult = {
              provider: snap5m.provider || 'FYERS',
              isUnderlyingFallback: Boolean(snap5m.isUnderlyingFallback),
              symbol: snap5m.symbol || trade.symbol,
            };
          } else if (snap1m && snap1m.candles?.length) {
            rawCandles = snap1m.candles;
            baseRes = '1';
            candlesResult = {
              provider: snap1m.provider || 'FYERS',
              isUnderlyingFallback: Boolean(snap1m.isUnderlyingFallback),
              symbol: snap1m.symbol || trade.symbol,
            };
          } else if (snapshots.length > 0 && snapshots[0].candles?.length) {
            rawCandles = snapshots[0].candles;
            baseRes = snapshots[0].resolution;
            candlesResult = {
              provider: snapshots[0].provider || 'FYERS',
              isUnderlyingFallback: Boolean(snapshots[0].isUnderlyingFallback),
              symbol: snapshots[0].symbol || trade.symbol,
            };
          }
        }

        // If range bounds were explicitly specified (e.g. paging older), ensure cached snapshot actually covers the window
        if (rawCandles.length > 0) {
          if (query.from) {
            const fromSec = Math.floor(rangeFrom.getTime() / 1000);
            rawCandles = rawCandles.filter((c: any) => {
              const cSec = c.t < 1e11 ? c.t : Math.floor(c.t / 1000);
              return cSec >= fromSec;
            });
          }
          if (query.to) {
            const toSec = Math.floor(rangeTo.getTime() / 1000);
            rawCandles = rawCandles.filter((c: any) => {
              const cSec = c.t < 1e11 ? c.t : Math.floor(c.t / 1000);
              return cSec <= toSec;
            });
          }
        }
      }

      // 2. If no cached candles found, or forceRefetch is true, query MarketDataService
      if (rawCandles.length === 0) {
        try {
          candlesResult = await MarketDataService.getCandlesWithFallback({
            trade,
            resolution: baseRes,
            from: rangeFrom,
            to: rangeTo,
            userId: req.user!.id,
            forceRefetch,
          });

          if (candlesResult && candlesResult.ok && candlesResult.candles?.length > 0) {
            rawCandles = candlesResult.candles;
          }
        } catch (err: any) {
          req.log.warn('MarketDataService fallback fetch threw for trade %s: %s', trade._id, err.message);
        }
      }

      // If still no candles found:
      if (rawCandles.length === 0) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NO_CANDLE_DATA',
            message: 'No candlestick data is available for this trade or timeframe yet.',
          },
        });
      }

      // 3. Aggregate if baseRes differs from targetRes
      let processedCandles = rawCandles;
      if (baseRes !== targetRes) {
        if (baseRes === '1' || baseRes === '5') {
          const agg = aggregateCandles(rawCandles as any, targetMinutes, sessionAnchor);
          processedCandles = agg.candles;
        }
      }

      // 4. Format into lightweight-charts schema (time in seconds, sorted ascending, deduplicated)
      const formatted = processedCandles
        .map((c: any) => ({
          time: Math.floor(c.t < 1e11 ? c.t : c.t / 1000),
          open: Number(c.o),
          high: Number(c.h),
          low: Number(c.l),
          close: Number(c.c),
          volume: Number(c.v || 0),
        }))
        .filter((c: any) => !isNaN(c.time) && !isNaN(c.open) && !isNaN(c.close))
        .sort((a: any, b: any) => a.time - b.time);

      const uniqueCandles: any[] = [];
      const seenTimes = new Set<number>();
      for (const c of formatted) {
        if (!seenTimes.has(c.time)) {
          seenTimes.add(c.time);
          uniqueCandles.push(c);
        }
      }

      let strategyName = trade.strategyName;
      if (trade.strategyId && !strategyName) {
        const strat = await Strategy.findById(trade.strategyId).select('name').lean();
        if (strat) strategyName = (strat as any).name;
      }

      const entryPrice =
        trade.simpleExecution?.entryPrice ??
        trade.fills?.find((f) => f.type === 'ENTRY')?.price ??
        trade.risk?.plannedEntryPrice ??
        0;

      const exitPrice =
        trade.simpleExecution?.exitPrice ??
        trade.fills?.find((f) => f.type === 'EXIT')?.price ??
        undefined;

      const quantity =
        trade.simpleExecution?.quantity ??
        trade.risk?.actualQuantity ??
        trade.risk?.suggestedQuantity ??
        0;

      const stopLoss = trade.risk?.initialStopLoss;
      const takeProfit = trade.risk?.plannedTarget;
      const netPnL = trade.calculated?.netPnL;
      const realizedRMultiple =
        trade.calculated?.realizedRMultiple ?? trade.risk?.realizedRMultiple;

      const tradeMeta = {
        id: trade._id.toString(),
        symbol: trade.symbol,
        underlying: trade.underlying,
        direction: trade.direction,
        entryPrice,
        exitPrice,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        stopLoss,
        takeProfit,
        pnl: netPnL,
        realizedRMultiple,
        quantity,
        exchange: trade.exchange || 'NSE',
        strategyName,
        setup: trade.setup,
      };

      return reply.send({
        success: true,
        data: {
          trade: tradeMeta,
          candles: uniqueCandles,
          resolution: targetRes,
          provider: candlesResult?.provider || 'FYERS',
          isUnderlyingFallback: Boolean(candlesResult?.isUnderlyingFallback),
          symbol: candlesResult?.symbol || trade.symbol,
          firstTime: uniqueCandles.length > 0 ? uniqueCandles[0].time : null,
          lastTime: uniqueCandles.length > 0 ? uniqueCandles[uniqueCandles.length - 1].time : null,
        },
      });
    }
  );
};


