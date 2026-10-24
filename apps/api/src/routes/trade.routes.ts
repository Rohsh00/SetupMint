import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import {
  calculateFIFOExecution,
  calculateIndianCharges,
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
} from '@tradevault/financial-engine';
import {
  createTradeSchema,
  updateTradeSchema,
  tradeFilterQuerySchema,
  bulkClassifySchema,
  stopMoveDetectionSchema,
  TradeOutcome,
} from '@tradevault/shared';
import { TradingAccount, Trade, Strategy, Instrument, Attachment, TradeTemplate, BrokerIntegration } from '../db/models/index.js';
import { getStorage } from '../storage/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
import { InstrumentService } from '../services/instrument.service.js';
import { FyersService } from '../services/fyers.service.js';
import { ChartGeneratorService } from '../services/chart-generator.service.js';
import { validateObjectIdParam } from '../middleware/validate.js';

export const tradeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Helper function to calculate trade details using financial engine
  function computeTradeCalculations(body: any) {
    return InstrumentService.computeTradeCalculations(body);
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

      // Direction validation: dynamic check against variant's configured expected direction
      if (variant.expected?.direction && tradeData.direction && tradeData.direction !== variant.expected.direction) {
        return {
          error: {
            status: 400,
            code: 'DIRECTION_MISMATCH',
            message: `Variant expects direction ${variant.expected.direction}, but trade direction is ${tradeData.direction}`,
          },
          warnings: [],
        };
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


  // List trades with pagination, global filtering, and sorting
  app.get('/', async (req, reply) => {
    const queryResult = tradeFilterQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Invalid query parameters', details: queryResult.error.format() },
      });
    }

    const {
      page,
      limit,
      search,
      accountId,
      symbol,
      assetClass,
      direction,
      status,
      outcome,
      strategyId,
      templateId,
      session,
      startDate,
      endDate,
      tags,
      variantKey,
      variantStatus,
      entryModel,
      sortBy,
      sortOrder,
    } = queryResult.data;

    const filter: any = { userId: req.user!.id };

    if (accountId) filter.accountId = accountId;
    if (symbol) filter.symbol = new RegExp(symbol.trim(), 'i');
    if (assetClass) filter.assetClass = assetClass;
    if (direction) filter.direction = direction;
    if (status) filter.status = status;
    if (outcome) filter['calculated.outcome'] = outcome;
    if (strategyId) filter.strategyId = strategyId;
    if (templateId) filter.templateId = templateId;
    if (session) filter.session = session;
    if (variantKey) filter['setup.variantKey'] = variantKey;
    if (variantStatus) filter['setup.variantStatus'] = variantStatus;
    if (entryModel) filter['setup.entryModel'] = entryModel;

    if (startDate || endDate) {
      filter.tradeDate = {};
      if (startDate) filter.tradeDate.$gte = new Date(startDate);
      if (endDate) filter.tradeDate.$lte = new Date(endDate);
    }

    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim());
      filter.tags = { $in: tagList };
    }

    if (search) {
      filter.$or = [
        { symbol: new RegExp(search, 'i') },
        { tradeTitle: new RegExp(search, 'i') },
        { 'psychology.notes': new RegExp(search, 'i') },
        { 'thesis.entryRationale': new RegExp(search, 'i') },
      ];
    }

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

    const formattedTrades = trades.map((t) => ({
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
      tags: t.tags,
      tradeDate: t.tradeDate.toISOString().split('T')[0],
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime?.toISOString(),
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
      screenshotIds: t.screenshotIds.map((id) => id.toString()),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return reply.send({
      success: true,
      data: formattedTrades,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  });

  // Create trade
  app.post('/', async (req, reply) => {
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

    // Auto-harmonize exchange, marketSegment, and assetClass for MCX / Commodities
    const sym = (tradeData.symbol || '').toUpperCase();
    if (
      tradeData.exchange === 'MCX' ||
      sym.startsWith('MCX:') ||
      /^(CRUDEOIL|NATGAS|NATURALGAS|GOLD|SILVER|COPPER|ZINC|NICKEL|ALUMINIUM|LEAD)/i.test(sym.replace(/^MCX:/i, ''))
    ) {
      tradeData.exchange = 'MCX';
      tradeData.marketSegment = 'MCX';
      tradeData.assetClass = 'COMMODITY';
    }

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
      risk: { ...existingTrade.risk, ...parseResult.data.risk },
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

    // Auto-harmonize exchange, marketSegment, and assetClass for MCX / Commodities
    const updateSym = (updatePayload.symbol || existingTrade.symbol || '').toUpperCase();
    if (
      updatePayload.exchange === 'MCX' ||
      updateSym.startsWith('MCX:') ||
      /^(CRUDEOIL|NATGAS|NATURALGAS|GOLD|SILVER|COPPER|ZINC|NICKEL|ALUMINIUM|LEAD)/i.test(updateSym.replace(/^MCX:/i, ''))
    ) {
      updatePayload.exchange = 'MCX';
      updatePayload.marketSegment = 'MCX';
      updatePayload.assetClass = 'COMMODITY';
    }

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

    return reply.send({
      success: true,
      data: updated,
      warnings: classValidation.warnings.length > 0 ? classValidation.warnings : undefined,
    });
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

      // Check active FYERS session
      const integration = await BrokerIntegration.findOne({
        userId: req.user!.id,
        broker: 'FYERS',
      });
      const tokenExpiry = integration?.tokenExpiresAt || integration?.authCodeExpiresAt;
      const isTokenValid = Boolean(
        integration?.accessToken && tokenExpiry && new Date(tokenExpiry) > new Date()
      );

      if (!isTokenValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'BROKER_NOT_CONNECTED',
            message: 'Active FYERS broker session is required. Please reconnect FYERS in Settings.',
          },
        });
      }

      try {
        const excursion = await FyersService.computeExcursionForTrade(
          req.params.id,
          req.user!.id,
          true
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

  // Generate automated SVG execution chart from FYERS candlestick data
  app.post(
    '/:id/chart/generate',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
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
        const force = Boolean(req.body?.force);
        const attachment = await ChartGeneratorService.createAndSaveAutoChartForTrade(
          trade._id,
          req.user!.id,
          { force }
        );

        return reply.status(201).send({
          success: true,
          data: {
            id: attachment._id.toString(),
            tradeId: trade._id.toString(),
            originalName: attachment.originalName,
            category: attachment.category,
            caption: attachment.description,
            description: attachment.description,
            timeframe: attachment.timeframe,
            chartTimestamp: attachment.chartTimestamp,
            sizeBytes: attachment.sizeBytes,
            mimeType: attachment.mimeType,
            downloadUrl: `/api/v1/attachments/${attachment._id}/download`,
            uploadedAt: attachment.createdAt.toISOString(),
          },
        });
      } catch (err: any) {
        req.log.error('Auto chart generation failed for trade %s: %s', trade._id, err.message);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'CHART_GENERATION_FAILED',
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
};


