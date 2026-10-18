import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import {
  BUILT_IN_TEMPLATES,
  createTradeTemplateSchema,
  updateTradeTemplateSchema,
  ITradeTemplate,
} from '@tradevault/shared';
import { TradeTemplate, Trade } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';

export const templateRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Helper to aggregate trade performance stats for a user by templateId
  async function getTemplateStatsMap(userId: string) {
    const statsAgg = await Trade.aggregate([
      {
        $match: {
          userId: new (Trade.base.Types.ObjectId as any)(userId),
          templateId: { $exists: true, $ne: null },
          status: 'CLOSED',
        },
      },
      {
        $group: {
          _id: '$templateId',
          totalTrades: { $sum: 1 },
          winTrades: {
            $sum: { $cond: [{ $gt: ['$calculated.netPnL', 0] }, 1, 0] },
          },
          netPnL: { $sum: '$calculated.netPnL' },
          grossWin: {
            $sum: { $cond: [{ $gt: ['$calculated.netPnL', 0] }, '$calculated.netPnL', 0] },
          },
          grossLoss: {
            $sum: { $cond: [{ $lt: ['$calculated.netPnL', 0] }, { $abs: '$calculated.netPnL' }, 0] },
          },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    for (const stat of statsAgg) {
      if (stat._id) {
        statsMap.set(String(stat._id), stat);
      }
    }
    return statsMap;
  }

  function formatTemplateWithStats(template: any, isBuiltIn: boolean, stat?: any) {
    const totalTrades = stat ? stat.totalTrades : (template.usageCount || 0);
    const winTrades = stat ? stat.winTrades : 0;
    const netPnL = stat ? Number(stat.netPnL.toFixed(2)) : 0;
    const winRate = totalTrades > 0 ? Number(((winTrades / totalTrades) * 100).toFixed(1)) : 0;
    let profitFactor = 0;
    if (stat) {
      if (stat.grossLoss === 0) {
        profitFactor = stat.grossWin > 0 ? 999.99 : 0;
      } else {
        profitFactor = Number((stat.grossWin / stat.grossLoss).toFixed(2));
      }
    }

    return {
      id: template.id || template._id.toString(),
      name: template.name,
      description: template.description || '',
      group: template.group,
      markets: template.markets,
      direction: template.direction,
      strategyName: template.strategyName,
      slRule: template.slRule,
      minRR: template.minRR,
      titlePattern: template.titlePattern,
      tags: template.tags || [],
      confluences: template.confluences || [],
      checklist: template.checklist || [],
      timeWindow: template.timeWindow,
      expiryDayOnly: template.expiryDayOnly || false,
      session: template.session,
      isBuiltIn,
      isFavorite: template.isFavorite || false,
      usageCount: totalTrades,
      lastUsedAt: template.lastUsedAt,
      userId: template.userId ? template.userId.toString() : undefined,
      clonedFromId: template.clonedFromId,
      performance: {
        totalTrades,
        winTrades,
        winRate,
        netPnL,
        profitFactor,
      },
      createdAt: template.createdAt ? new Date(template.createdAt).toISOString() : undefined,
      updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : undefined,
    };
  }

  // GET /api/v1/templates - list all user and built-in templates with stats
  app.get('/', async (req, reply) => {
    const userId = req.user!.id;
    const statsMap = await getTemplateStatsMap(userId);

    // Fetch user templates
    const userTemplates = await TradeTemplate.find({ userId }).sort({
      isFavorite: -1,
      usageCount: -1,
      name: 1,
    });

    const formattedUserTemplates = userTemplates.map((t) => {
      const stat = statsMap.get(t._id.toString());
      return formatTemplateWithStats(t, false, stat);
    });

    // Format built-in templates
    const formattedBuiltIns = BUILT_IN_TEMPLATES.map((b) => {
      const stat = statsMap.get(b.id);
      return formatTemplateWithStats(b, true, stat);
    });

    // Custom/favorited templates first, followed by built-ins
    const allTemplates = [...formattedUserTemplates, ...formattedBuiltIns];

    return reply.send({
      success: true,
      data: allTemplates,
    });
  });

  // POST /api/v1/templates - create a custom user template
  app.post('/', async (req, reply) => {
    const parseResult = createTradeTemplateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid trade template details',
          details: parseResult.error.format(),
        },
      });
    }

    const userId = req.user!.id;
    const body = parseResult.data;

    // Check unique name for this user
    const existing = await TradeTemplate.findOne({ userId, name: body.name.trim() });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_TEMPLATE_NAME',
          message: `A template named '${body.name}' already exists in your library`,
        },
      });
    }

    const template = await TradeTemplate.create({
      ...body,
      name: body.name.trim(),
      userId,
      usageCount: 0,
    });

    const formatted = formatTemplateWithStats(template, false);

    return reply.status(201).send({
      success: true,
      data: formatted,
    });
  });

  // GET /api/v1/templates/:id - get single template by ID
  app.get('/:id', async (req: any, reply) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const statsMap = await getTemplateStatsMap(userId);

    // Check built-ins first
    const builtIn = BUILT_IN_TEMPLATES.find((b) => b.id === id);
    if (builtIn) {
      const stat = statsMap.get(builtIn.id);
      return reply.send({
        success: true,
        data: formatTemplateWithStats(builtIn, true, stat),
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The provided template id is not a valid identifier',
        },
      });
    }

    const template = await TradeTemplate.findOne({ _id: id, userId });
    if (!template) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Trade template not found',
        },
      });
    }

    const stat = statsMap.get(template._id.toString());
    return reply.send({
      success: true,
      data: formatTemplateWithStats(template, false, stat),
    });
  });

  // PUT /api/v1/templates/:id - update custom user template
  app.put('/:id', async (req: any, reply) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if built-in
    if (BUILT_IN_TEMPLATES.some((b) => b.id === id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BUILT_IN_READ_ONLY',
          message: 'Built-in templates cannot be modified directly. Save a copy as a custom template.',
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The provided template id is not a valid identifier',
        },
      });
    }

    const parseResult = updateTradeTemplateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid template update details',
          details: parseResult.error.format(),
        },
      });
    }

    const template = await TradeTemplate.findOne({ _id: id, userId });
    if (!template) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Trade template not found',
        },
      });
    }

    Object.assign(template, parseResult.data);
    await template.save();

    const statsMap = await getTemplateStatsMap(userId);
    const stat = statsMap.get(template._id.toString());

    return reply.send({
      success: true,
      data: formatTemplateWithStats(template, false, stat),
    });
  });

  // DELETE /api/v1/templates/:id - delete custom user template
  app.delete('/:id', async (req: any, reply) => {
    const { id } = req.params;
    const userId = req.user!.id;

    if (BUILT_IN_TEMPLATES.some((b) => b.id === id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BUILT_IN_READ_ONLY',
          message: 'Built-in templates cannot be deleted.',
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The provided template id is not a valid identifier',
        },
      });
    }

    const result = await TradeTemplate.deleteOne({ _id: id, userId });
    if (result.deletedCount === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Trade template not found',
        },
      });
    }

    return reply.send({
      success: true,
      message: 'Trade template deleted successfully',
    });
  });

  // POST /api/v1/templates/:id/favorite - toggle favorite status
  app.post('/:id/favorite', async (req: any, reply) => {
    const { id } = req.params;
    const userId = req.user!.id;

    if (BUILT_IN_TEMPLATES.some((b) => b.id === id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BUILT_IN_FAVORITE_UNSUPPORTED',
          message: 'Favoriting built-in templates directly is not supported. Save as custom template to favorite.',
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The provided template id is not a valid identifier',
        },
      });
    }

    const template = await TradeTemplate.findOne({ _id: id, userId });
    if (!template) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Trade template not found',
        },
      });
    }

    template.isFavorite = !template.isFavorite;
    await template.save();

    return reply.send({
      success: true,
      data: {
        id: template._id.toString(),
        isFavorite: template.isFavorite,
      },
    });
  });

  // POST /api/v1/templates/:id/use - increment usage count
  app.post('/:id/use', async (req: any, reply) => {
    const { id } = req.params;
    const userId = req.user!.id;

    if (mongoose.Types.ObjectId.isValid(id)) {
      await TradeTemplate.updateOne(
        { _id: id, userId },
        {
          $inc: { usageCount: 1 },
          $set: { lastUsedAt: new Date() },
        }
      );
    }

    return reply.send({
      success: true,
      message: 'Template usage updated',
    });
  });
};
