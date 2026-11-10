import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createInstrumentSchema, dateRangeSchema } from '@tradevault/shared';
import { Instrument, Trade, TradingAccount } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validate.js';
import { InstrumentService } from '../services/instrument.service.js';
import { AccountScopeService, resolveAccountContext } from '../services/account-scope.service.js';

const updateInstrumentRequestSchema = createInstrumentSchema.partial().extend({
  applyToTrades: z.boolean().optional(),
  recomputeAutoFees: z.boolean().optional(),
});

export const instrumentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // List only the current user's instruments (strict tenant + scope isolation, no presets)
  app.get('/', async (req, reply) => {
    const { startDate, endDate } = (req.query || {}) as any;
    if (startDate || endDate) {
      const dateRangeResult = dateRangeSchema.safeParse({ startDate, endDate });
      if (!dateRangeResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: dateRangeResult.error.issues.map((i) => i.message).join(', ') || 'Invalid date range',
            details: dateRangeResult.error.format(),
          },
        });
      }
    }

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const accountIds = accountCtx.accountIds;

    if (scope.mode !== 'ALL' && accountIds.length === 0) {
      return reply.send({
        success: true,
        data: [],
      });
    }

    const userInstruments = await Instrument.find({ userId: req.user!.id }).sort({ symbol: 1 });
    const tradedSummaries = await InstrumentService.getTradedSummary(req.user!.id, { startDate, endDate }, accountIds);

    let scopedInstruments = userInstruments;
    if (scope.mode !== 'ALL') {
      const [allTimeScopedSummaries, allTimeGlobalSummaries] = await Promise.all([
        startDate || endDate
          ? InstrumentService.getTradedSummary(req.user!.id, undefined, accountIds)
          : Promise.resolve(tradedSummaries),
        InstrumentService.getTradedSummary(req.user!.id, undefined),
      ]);

      const scopedCurrencies = new Set(
        accountCtx.currencies.map((c) => c.toUpperCase())
      );

      scopedInstruments = userInstruments.filter((inst) => {
        const idStr = inst._id.toString();
        const scopedCount = allTimeScopedSummaries.get(idStr)?.tradeCount ?? 0;
        if (scopedCount > 0) return true;

        // If never traded in ANY account, keep only if custom/untraded instrument matches scoped currency
        const globalCount = allTimeGlobalSummaries.get(idStr)?.tradeCount ?? 0;
        if (globalCount === 0) {
          const instCurrency = String(inst.quoteCurrency || accountCtx.primaryCurrency || 'USD').toUpperCase();
          return scopedCurrencies.size === 0 || scopedCurrencies.has(instCurrency);
        }

        // Traded only in out-of-scope accounts -> exclude from this scope
        return false;
      });
    }

    const formatted = scopedInstruments.map((i) => {
      const summary = tradedSummaries.get(i._id.toString());
      return {
        id: i._id.toString(),
        userId: i.userId?.toString(),
        symbol: i.symbol,
        displayName: i.displayName,
        assetClass: i.assetClass,
        exchange: i.exchange,
        marketSegment: i.marketSegment,
        quoteCurrency: i.quoteCurrency,
        contractMultiplier: i.contractMultiplier,
        lotSize: i.lotSize,
        tickSize: i.tickSize,
        quantityIncrement: i.quantityIncrement,
        pricePrecision: i.pricePrecision,
        isActive: i.isActive,
        source: i.source || 'CUSTOM',
        needsReview: Boolean(i.needsReview),
        tradeCount: summary?.tradeCount ?? 0,
        netPnL: summary?.netPnL ?? 0,
        firstTradedAt: summary?.firstTradedAt,
        lastTradedAt: summary?.lastTradedAt,
        expiryDate: i.expiryDate?.toISOString(),
        optionType: i.optionType,
        strikePrice: i.strikePrice,
        description: i.description,
        createdAt: i.createdAt?.toISOString(),
        updatedAt: i.updatedAt?.toISOString(),
      };
    });

    return reply.send({
      success: true,
      data: formatted,
    });
  });

  // Create custom instrument
  app.post('/', async (req, reply) => {
    const parseResult = createInstrumentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid instrument specifications', details: parseResult.error.format() },
      });
    }

    const symbol = parseResult.data.symbol.toUpperCase().trim();
    const existing = await Instrument.findOne({ userId: req.user!.id, symbol });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE_INSTRUMENT', message: `Instrument with symbol ${symbol} already exists` },
      });
    }

    const inst = await Instrument.create({
      ...parseResult.data,
      symbol,
      userId: req.user!.id,
      source: 'CUSTOM',
      needsReview: false,
      expiryDate: parseResult.data.expiryDate ? new Date(parseResult.data.expiryDate) : undefined,
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: inst._id.toString(),
        userId: inst.userId?.toString(),
        symbol: inst.symbol,
        displayName: inst.displayName,
        assetClass: inst.assetClass,
        exchange: inst.exchange,
        marketSegment: inst.marketSegment,
        quoteCurrency: inst.quoteCurrency,
        contractMultiplier: inst.contractMultiplier,
        lotSize: inst.lotSize,
        tickSize: inst.tickSize,
        quantityIncrement: inst.quantityIncrement,
        pricePrecision: inst.pricePrecision,
        isActive: inst.isActive,
        source: inst.source,
        needsReview: inst.needsReview,
        tradeCount: 0,
        netPnL: 0,
      },
    });
  });

  // Preview update impact on trades (writes nothing)
  app.post('/:id/preview-update', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const inst = await Instrument.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!inst) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Instrument not found' },
      });
    }

    const preview = await InstrumentService.previewUpdate(req.user!.id, req.params.id, req.body || {});
    return reply.send({
      success: true,
      data: preview,
    });
  });

  // Update instrument
  app.put('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const parseResult = updateInstrumentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid update', details: parseResult.error.format() },
      });
    }

    try {
      const result = await InstrumentService.applyUpdate(
        req.user!.id,
        req.params.id,
        parseResult.data,
        req.user!.email
      );

      return reply.send({
        success: true,
        data: result.instrument,
        tradesModified: result.affectedTradeCount,
        affectedTradeCount: result.affectedTradeCount,
      });
    } catch (err: any) {
      if (err.message === 'INSTRUMENT_NOT_FOUND') {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Instrument not found' },
        });
      }
      if (err.code === 'DUPLICATE_INSTRUMENT' || err.statusCode === 409) {
        return reply.status(409).send({
          success: false,
          error: { code: 'DUPLICATE_INSTRUMENT', message: err.message },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'UPDATE_FAILED', message: err.message },
      });
    }
  });

  // Delete instrument (blocked when trades reference it)
  app.delete('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const inst = await Instrument.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!inst) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Instrument not found' },
      });
    }

    const tradeCount = await Trade.countDocuments({ userId: req.user!.id, instrumentId: req.params.id });
    if (tradeCount > 0) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'INSTRUMENT_IN_USE',
          message: `Cannot delete instrument ${inst.symbol} because ${tradeCount} trade(s) reference it. Delete or reassign those trades first.`,
        },
      });
    }

    await Instrument.deleteOne({ _id: req.params.id, userId: req.user!.id });
    return reply.send({ success: true, message: 'Instrument deleted successfully' });
  });
};
