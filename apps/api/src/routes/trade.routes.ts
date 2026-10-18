import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import {
  calculateFIFOExecution,
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
} from '@tradevault/financial-engine';
import { createTradeSchema, updateTradeSchema, tradeFilterQuerySchema, TradeOutcome } from '@tradevault/shared';
import { TradingAccount, Trade, Strategy, Instrument, Attachment } from '../db/models/index.js';
import { getStorage } from '../storage/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
import { validateObjectIdParam } from '../middleware/validate.js';

export const tradeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Helper function to calculate trade details using financial engine
  function computeTradeCalculations(body: any) {
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
      const mult = exec.contractMultiplier || 1;
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
      totalCosts = Number(fifo.totalCosts.toFixed(2));
      netPnL = Number(fifo.realizedNetPnL.toFixed(2));
      outcome = body.status === 'OPEN' ? 'OPEN' : fifo.outcome;
      closedQty = fifo.closedQuantity.toNumber();
      openQty = fifo.openQuantity.toNumber();
      avgEntry = Number(fifo.weightedAvgEntryPrice.toFixed(4));
      avgExit = fifo.weightedAvgExitPrice ? Number(fifo.weightedAvgExitPrice.toFixed(4)) : undefined;
    }

    // Holding time
    let holdingTimeMinutes: number | undefined;
    if (body.entryTime && body.exitTime) {
      const diffMs = new Date(body.exitTime).getTime() - new Date(body.entryTime).getTime();
      if (diffMs > 0) {
        holdingTimeMinutes = Math.round(diffMs / 60000);
      }
    }

    // Realized R-Multiple
    let plannedRisk = body.risk?.riskBudgetAmount || body.risk?.estimatedRiskAmount;
    if (!plannedRisk && body.risk?.plannedEntryPrice && body.risk?.initialStopLoss) {
      const dist = Math.abs(body.risk.plannedEntryPrice - body.risk.initialStopLoss);
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
      session,
      startDate,
      endDate,
      tags,
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
    if (session) filter.session = session;

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
      symbol: t.symbol,
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
      importBatchId: t.importBatchId,
      executionMode: t.executionMode,
      simpleExecution: t.simpleExecution,
      fills: t.fills,
      risk: t.risk,
      thesis: t.thesis,
      psychology: t.psychology,
      calculated: t.calculated,
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

    const trade = await Trade.create({
      ...body,
      userId: req.user!.id,
      tradeDate: new Date(body.tradeDate),
      entryTime: new Date(body.entryTime),
      exitTime: body.exitTime ? new Date(body.exitTime) : undefined,
      calculated,
      auditLog: [
        {
          action: 'CREATED',
          timestamp: new Date(),
          changedBy: req.user!.email,
          details: { initialPnl: calculated.netPnL },
        },
      ],
    });

    // Recalculate account realized P&L and balance authoritatively
    await AccountService.recalculateAccountBalances(account._id, req.user!.id);

    return reply.status(201).send({
      success: true,
      data: {
        id: trade._id.toString(),
        symbol: trade.symbol,
        netPnL: trade.calculated.netPnL,
        outcome: trade.calculated.outcome,
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
    }));

    return reply.send({
      success: true,
      data: {
        id: trade._id.toString(),
        userId: trade.userId.toString(),
        accountId: trade.accountId?._id ? (trade.accountId as any)._id.toString() : trade.accountId?.toString(),
        accountName: (trade.accountId as any)?.name || 'Account',
        symbol: trade.symbol,
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
        executionMode: trade.executionMode,
        simpleExecution: trade.simpleExecution,
        fills: trade.fills,
        risk: trade.risk,
        thesis: trade.thesis,
        psychology: trade.psychology,
        calculated: trade.calculated,
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
      risk: { ...existingTrade.risk, ...parseResult.data.risk },
      thesis: { ...existingTrade.thesis, ...parseResult.data.thesis },
      psychology: { ...existingTrade.psychology, ...parseResult.data.psychology },
      simpleExecution: mergedSimpleExecution,
      fills: parseResult.data.fills || existingTrade.fills,
    };

    const oldNetPnL = existingTrade.calculated?.netPnL || 0;
    const newCalculated = computeTradeCalculations(mergedData);
    const isClosing = parseResult.data.status === 'CLOSED' && existingTrade.status !== 'CLOSED';

    const updatePayload: any = {
      ...parseResult.data,
      risk: mergedData.risk,
      thesis: mergedData.thesis,
      psychology: mergedData.psychology,
      simpleExecution: mergedData.simpleExecution,
      fills: mergedData.fills,
      calculated: newCalculated,
      $push: {
        auditLog: {
          action: isClosing ? 'CLOSED' : 'UPDATED',
          timestamp: new Date(),
          changedBy: req.user!.email,
          details: {
            oldNetPnL,
            newNetPnL: newCalculated.netPnL,
            ...(isClosing && mergedSimpleExecution?.exitPrice ? { exitPrice: mergedSimpleExecution.exitPrice } : {}),
          },
        },
      },
    };

    if (parseResult.data.tradeDate) updatePayload.tradeDate = new Date(parseResult.data.tradeDate);
    if (parseResult.data.entryTime) updatePayload.entryTime = new Date(parseResult.data.entryTime);
    if (parseResult.data.exitTime) updatePayload.exitTime = new Date(parseResult.data.exitTime);

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

    return reply.send({ success: true, data: updated });
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
};
