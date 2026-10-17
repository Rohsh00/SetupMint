import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createInstrumentSchema, PRESET_INSTRUMENTS } from '@tradevault/shared';
import { Instrument } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validate.js';

export const instrumentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // List all instruments (global presets + user custom)
  app.get('/', async (req, reply) => {
    const userCustom = await Instrument.find({ userId: req.user!.id }).sort({ symbol: 1 });

    // Seed presets into response if not already saved in database
    const customSymbols = new Set(userCustom.map((i) => i.symbol));

    const presetsFormatted = PRESET_INSTRUMENTS.filter((p) => !customSymbols.has(p.symbol)).map(
      (p, idx) => ({
        id: `preset-${p.symbol}`,
        ...p,
        isPreset: true,
      })
    );

    const userFormatted = userCustom.map((i) => ({
      id: i._id.toString(),
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
      expiryDate: i.expiryDate?.toISOString(),
      optionType: i.optionType,
      strikePrice: i.strikePrice,
      description: i.description,
      isPreset: false,
    }));

    return reply.send({
      success: true,
      data: [...userFormatted, ...presetsFormatted],
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

    const { symbol } = parseResult.data;
    const existing = await Instrument.findOne({ userId: req.user!.id, symbol });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE_INSTRUMENT', message: `Instrument with symbol ${symbol} already exists` },
      });
    }

    const inst = await Instrument.create({
      ...parseResult.data,
      userId: req.user!.id,
      expiryDate: parseResult.data.expiryDate ? new Date(parseResult.data.expiryDate) : undefined,
    });

    return reply.status(201).send({ success: true, data: inst });
  });

  // Update instrument
  app.put('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const parseResult = createInstrumentSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid update', details: parseResult.error.format() },
      });
    }

    const inst = await Instrument.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { $set: parseResult.data },
      { new: true }
    );

    if (!inst) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Custom instrument not found or cannot edit preset' },
      });
    }

    return reply.send({ success: true, data: inst });
  });

  // Delete custom instrument
  app.delete('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    await Instrument.deleteOne({ _id: req.params.id, userId: req.user!.id });
    return reply.send({ success: true, message: 'Instrument deleted successfully' });
  });
};
