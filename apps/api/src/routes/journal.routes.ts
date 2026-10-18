import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { dailyJournalSchema } from '@tradevault/shared';
import { DailyJournal, Trade } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateDateParam } from '../middleware/validate.js';

export const journalRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Get calendar summary for a month
  app.get('/calendar', async (req: any, reply) => {
    const { yearMonth } = req.query; // format 'YYYY-MM'
    const currentYM = yearMonth || new Date().toISOString().slice(0, 7);

    const [yearStr, monthStr] = currentYM.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // Aggregate trades by day
    const trades = await Trade.find({
      userId: req.user!.id,
      tradeDate: { $gte: startOfMonth, $lte: endOfMonth },
    });

    const dayMap = new Map<string, { netPnL: number; tradesCount: number; winCount: number; lossCount: number }>();

    for (const t of trades) {
      const dStr = t.tradeDate.toISOString().split('T')[0];
      const rec = dayMap.get(dStr) ?? { netPnL: 0, tradesCount: 0, winCount: 0, lossCount: 0 };
      const pnl = t.calculated?.netPnL || 0;
      rec.netPnL += pnl;
      rec.tradesCount++;
      if (pnl > 0) rec.winCount++;
      else if (pnl < 0) rec.lossCount++;
      dayMap.set(dStr, rec);
    }

    // Get journal reviews for the month
    const journals = await DailyJournal.find({
      userId: req.user!.id,
      date: new RegExp(`^${currentYM}`),
    });

    const journalMap = new Map<string, any>();
    for (const j of journals) {
      journalMap.set(j.date, j);
    }

    // Build day items
    const days: any[] = [];
    const numDays = new Date(year, month, 0).getDate();

    for (let d = 1; d <= numDays; d++) {
      const dayFormatted = d < 10 ? `0${d}` : `${d}`;
      const dateStr = `${currentYM}-${dayFormatted}`;
      const dayData = dayMap.get(dateStr) ?? { netPnL: 0, tradesCount: 0, winCount: 0, lossCount: 0 };
      const journalEntry = journalMap.get(dateStr);

      days.push({
        date: dateStr,
        dayNumber: d,
        netPnL: Number(dayData.netPnL.toFixed(2)),
        tradesCount: dayData.tradesCount,
        winCount: dayData.winCount,
        lossCount: dayData.lossCount,
        hasJournal: !!journalEntry,
        disciplineRating: journalEntry?.disciplineRating,
        marketBias: journalEntry?.marketBias,
        emotionalState: journalEntry?.emotionalState,
      });
    }

    return reply.send({
      success: true,
      data: {
        yearMonth: currentYM,
        days,
      },
    });
  });

  // Get daily review for specific date
  app.get('/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const { date } = req.params; // format YYYY-MM-DD

    const journal = await DailyJournal.findOne({ userId: req.user!.id, date })
      .populate('bestTradeId', 'symbol calculated.netPnL')
      .populate('worstTradeId', 'symbol calculated.netPnL');

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const trades = await Trade.find({
      userId: req.user!.id,
      tradeDate: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ entryTime: 1 });

    const totalNetPnL = trades.reduce((sum, t) => sum + (t.calculated?.netPnL || 0), 0);

    return reply.send({
      success: true,
      data: {
        date,
        journal: journal || null,
        trades,
        summary: {
          tradesCount: trades.length,
          netPnL: Number(totalNetPnL.toFixed(2)),
        },
      },
    });
  });

  // Upsert daily review
  app.post('/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const parseResult = dailyJournalSchema.safeParse({ ...req.body, date: req.params.date });
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid journal review', details: parseResult.error.format() },
      });
    }

    const { date, ...rest } = parseResult.data;

    const journal = await DailyJournal.findOneAndUpdate(
      { userId: req.user!.id, date },
      { $set: rest },
      { upsert: true, new: true }
    );

    return reply.send({ success: true, data: journal });
  });

  // Delete daily review
  app.delete('/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const { date } = req.params;
    await DailyJournal.deleteOne({ userId: req.user!.id, date });
    return reply.send({ success: true, message: 'Journal entry deleted' });
  });
};
