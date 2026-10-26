import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { HolidayService } from '../services/holiday.service.js';
import { HolidayCalendar } from '../db/models/HolidayCalendar.js';

export const holidayRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Public / Authenticated read endpoint for exchange holidays
  app.get('/', async (req: any, reply) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const exchange = (req.query.exchange || 'NSE').toUpperCase();

    const holidays = await HolidayService.getTradingHolidays(year, exchange);
    const details = await HolidayCalendar.find({ exchange, year })
      .sort({ date: 1 })
      .lean();

    return reply.send({
      success: true,
      data: {
        exchange,
        year,
        dates: holidays,
        holidays: details,
      },
    });
  });

  // Authenticated endpoint to trigger external holiday sync (from Upstox API)
  app.post('/sync', { preHandler: [requireAuth] }, async (req: any, reply) => {
    try {
      const result = await HolidayService.syncFromUpstox();
      return reply.send({
        success: true,
        message: `Successfully synchronized ${result.syncedCount} market holidays from external feed.`,
        data: result,
      });
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: {
          code: 'EXTERNAL_SYNC_FAILED',
          message: err.message || 'Failed to sync market holidays from external feed.',
        },
      });
    }
  });

  // Authenticated endpoint to add custom or emergency market holiday
  app.post('/', { preHandler: [requireAuth] }, async (req: any, reply) => {
    const { date, exchange = 'NSE', description, morningSessionClosed = true, eveningSessionClosed = true, isSpecialTrading = false } = req.body || {};

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: 'Date must be formatted as YYYY-MM-DD.',
        },
      });
    }

    const year = parseInt(date.slice(0, 4), 10);
    const created = await HolidayCalendar.findOneAndUpdate(
      { exchange: exchange.toUpperCase(), date, segment: 'ALL' },
      {
        exchange: exchange.toUpperCase(),
        segment: 'ALL',
        date,
        year,
        description: description || 'Ad-Hoc Market Holiday',
        isTradingHoliday: !isSpecialTrading,
        morningSessionClosed,
        eveningSessionClosed,
        isSpecialTrading,
        source: 'MANUAL',
      },
      { upsert: true, new: true }
    );

    return reply.status(201).send({
      success: true,
      data: created,
    });
  });
};
