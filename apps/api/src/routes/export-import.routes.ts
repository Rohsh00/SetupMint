import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { calculateSimpleExecutionPnL } from '@tradevault/financial-engine';
import { Trade, TradingAccount } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';

export const exportImportRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // CSV Export
  app.get('/csv', async (req: any, reply) => {
    const { accountId, startDate, endDate } = req.query;

    const filter: any = { userId: req.user!.id };
    if (accountId) filter.accountId = accountId;
    if (startDate || endDate) {
      filter.tradeDate = {};
      if (startDate) filter.tradeDate.$gte = new Date(startDate);
      if (endDate) filter.tradeDate.$lte = new Date(endDate);
    }

    const trades = await Trade.find(filter)
      .sort({ tradeDate: -1 })
      .populate('accountId', 'name')
      .populate('strategyId', 'name');

    const rows = trades.map((t) => ({
      TradeDate: t.tradeDate.toISOString().split('T')[0],
      Account: (t.accountId as any)?.name || 'Default',
      Symbol: t.symbol,
      AssetClass: t.assetClass,
      Direction: t.direction,
      Status: t.status,
      Strategy: (t.strategyId as any)?.name || t.strategyName || '',
      EntryPrice: t.simpleExecution?.entryPrice || t.calculated?.averageEntryPrice || '',
      ExitPrice: t.simpleExecution?.exitPrice || t.calculated?.averageExitPrice || '',
      Quantity: t.simpleExecution?.quantity || t.calculated?.closedQuantity || '',
      GrossPnL: t.calculated?.grossPnL ?? 0,
      TotalCosts: t.calculated?.totalCosts ?? 0,
      NetPnL: t.calculated?.netPnL ?? 0,
      Outcome: t.calculated?.outcome || '',
      RealizedRMultiple: t.calculated?.realizedRMultiple ?? '',
      HoldingTimeMinutes: t.calculated?.holdingTimeMinutes ?? '',
      DisciplineScore: t.psychology?.disciplineScore ?? '',
      EmotionBefore: t.psychology?.emotionBefore ?? '',
      Tags: t.tags?.join(';') || '',
      Notes: t.psychology?.notes || '',
    }));

    const csvData = stringify(rows, { header: true });

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="tradevault-export-${new Date().toISOString().split('T')[0]}.csv"`);
    return reply.send(csvData);
  });

  // JSON Export
  app.get('/json', async (req: any, reply) => {
    const { accountId, startDate, endDate } = req.query;

    const filter: any = { userId: req.user!.id };
    if (accountId) filter.accountId = accountId;
    if (startDate || endDate) {
      filter.tradeDate = {};
      if (startDate) filter.tradeDate.$gte = new Date(startDate);
      if (endDate) filter.tradeDate.$lte = new Date(endDate);
    }

    const trades = await Trade.find(filter).sort({ tradeDate: -1 });

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="tradevault-backup-${new Date().toISOString().split('T')[0]}.json"`);
    return reply.send(trades);
  });

  // CSV Import Preview
  app.post('/import/preview', async (req: any, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No CSV file uploaded' },
      });
    }

    const buffer = await data.toBuffer();
    const csvContent = buffer.toString('utf-8');

    let records: any[] = [];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CSV_PARSE_ERROR', message: `Invalid CSV format: ${err.message}` },
      });
    }

    if (records.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPTY_CSV', message: 'CSV file contains no data rows' },
      });
    }

    const headers = Object.keys(records[0]);

    // Intelligent column auto-mapping
    const suggestedMapping: Record<string, string> = {};
    for (const h of headers) {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['date', 'tradedate', 'entrydate', 'time'].includes(lower)) suggestedMapping['tradeDate'] = h;
      else if (['symbol', 'ticker', 'instrument', 'scrip'].includes(lower)) suggestedMapping['symbol'] = h;
      else if (['direction', 'side', 'type', 'buysell'].includes(lower)) suggestedMapping['direction'] = h;
      else if (['entryprice', 'buyprice', 'openprice', 'price'].includes(lower)) suggestedMapping['entryPrice'] = h;
      else if (['exitprice', 'sellprice', 'closeprice'].includes(lower)) suggestedMapping['exitPrice'] = h;
      else if (['quantity', 'qty', 'shares', 'lots'].includes(lower)) suggestedMapping['quantity'] = h;
      else if (['fee', 'fees', 'brokerage', 'costs', 'charges'].includes(lower)) suggestedMapping['totalCosts'] = h;
      else if (['notes', 'comments'].includes(lower)) suggestedMapping['notes'] = h;
      else if (['setup', 'strategy'].includes(lower)) suggestedMapping['strategy'] = h;
    }

    return reply.send({
      success: true,
      data: {
        totalRows: records.length,
        headers,
        suggestedMapping,
        previewRows: records.slice(0, 5),
      },
    });
  });

  // CSV Import Commit
  app.post('/import/commit', async (req: any, reply) => {
    const { accountId, rows, mapping } = req.body;

    if (!accountId || !Array.isArray(rows) || !mapping) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'accountId, rows array, and mapping required' },
      });
    }

    const account = await TradingAccount.findOne({ _id: accountId, userId: req.user!.id });
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Target trading account not found' },
      });
    }

    let importedCount = 0;
    let duplicateCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dateVal = row[mapping.tradeDate] || new Date().toISOString().split('T')[0];
        const symbolVal = String(row[mapping.symbol] || '').toUpperCase().trim();
        const dirVal = String(row[mapping.direction] || 'LONG').toUpperCase().includes('SHORT') ||
          String(row[mapping.direction] || '').toUpperCase() === 'S' ||
          String(row[mapping.direction] || '').toUpperCase() === 'SELL'
            ? 'SHORT'
            : 'LONG';

        const entryPrice = parseFloat(row[mapping.entryPrice]) || 0;
        const exitPrice = parseFloat(row[mapping.exitPrice]) || 0;
        const quantity = parseFloat(row[mapping.quantity]) || 1;
        const costs = parseFloat(row[mapping.totalCosts]) || 0;

        if (!symbolVal || entryPrice <= 0 || quantity <= 0) {
          errors.push(`Row ${i + 1}: Missing symbol, invalid entry price, or invalid quantity`);
          continue;
        }

        const tradeDate = new Date(dateVal);

        // Check for duplicates
        const existing = await Trade.findOne({
          userId: req.user!.id,
          accountId: account._id,
          symbol: symbolVal,
          tradeDate,
          'simpleExecution.entryPrice': entryPrice,
          'simpleExecution.quantity': quantity,
        });

        if (existing) {
          duplicateCount++;
          continue;
        }

        const pnlRes = calculateSimpleExecutionPnL(dirVal as any, {
          entryPrice,
          exitPrice: exitPrice > 0 ? exitPrice : undefined,
          quantity,
          contractMultiplier: 1,
          brokerage: costs,
          exchangeFees: 0,
          regulatoryFees: 0,
          taxes: 0,
          otherFees: 0,
          explicitAdjustments: 0,
        });

        await Trade.create({
          userId: req.user!.id,
          accountId: account._id,
          symbol: symbolVal,
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          currency: account.baseCurrency,
          direction: dirVal,
          status: exitPrice > 0 ? 'CLOSED' : 'OPEN',
          tradeDate,
          entryTime: tradeDate,
          exitTime: exitPrice > 0 ? tradeDate : undefined,
          tags: ['IMPORTED'],
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice,
            exitPrice: exitPrice > 0 ? exitPrice : undefined,
            quantity,
            contractMultiplier: 1,
            brokerage: costs,
            exchangeFees: 0,
            regulatoryFees: 0,
            taxes: 0,
            otherFees: 0,
            explicitAdjustments: 0,
          },
          fills: [],
          risk: { riskRuleViolations: [] },
          thesis: { confluences: [], customTechnicalLabels: [] },
          psychology: {
            disciplineScore: 4,
            checklistCompleted: true,
            rulesFollowed: true,
            mistakes: [],
            revengeTrading: false,
            overtrading: false,
            prematureExit: false,
            stopLossMoved: false,
            positionSizeViolation: false,
            notes: row[mapping.notes],
          },
          calculated: {
            grossPnL: pnlRes.grossPnLNumber,
            totalCosts: pnlRes.totalCostsNumber,
            netPnL: pnlRes.netPnLNumber,
            outcome: pnlRes.outcome,
            closedQuantity: exitPrice > 0 ? quantity : 0,
            openQuantity: exitPrice > 0 ? 0 : quantity,
            averageEntryPrice: entryPrice,
            averageExitPrice: exitPrice > 0 ? exitPrice : undefined,
          },
          screenshotIds: [],
          auditLog: [
            {
              action: 'IMPORTED_CSV',
              timestamp: new Date(),
              changedBy: req.user!.email,
            },
          ],
        });

        importedCount++;
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    // Reconcile target account if trades were imported
    if (importedCount > 0) {
      await AccountService.recalculateAccountBalances(account._id, req.user!.id);
    }

    return reply.send({
      success: true,
      data: {
        importedCount,
        duplicateCount,
        errors,
      },
    });
  });
};
