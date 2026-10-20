import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import mongoose from 'mongoose';
import {
  calculateSimpleExecutionPnL,
  calculateFIFOExecution,
  calculateIndianCharges,
  deriveSessionFromTime,
} from '@tradevault/financial-engine';
import { Trade, TradingAccount, BrokerImportMapping, SupportedImportBroker } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';

const TRADE_HEADER_KEYWORDS = [
  'symbol',
  'scrip',
  'ticker',
  'instrument',
  'tradename',
  'date',
  'time',
  'side',
  'trade_type',
  'direction',
  'buysell',
  'type',
  'qty',
  'quantity',
  'shares',
  'lots',
  'price',
  'traded price',
  'trade price',
  'rate',
  'order',
  'trade',
  'order_id',
  'trade_id',
  'isin',
  'entry',
  'exit',
];

export function extractTableFromCsv(csvContent: string): { headers: string[]; records: Record<string, string>[] } {
  const rawRows: string[][] = parse(csvContent, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (rawRows.length === 0) {
    return { headers: [], records: [] };
  }

  // Find the header row index by scoring trade keyword matches
  let headerRowIdx = -1;
  let maxScore = 0;

  for (let i = 0; i < Math.min(rawRows.length, 35); i++) {
    const row = rawRows[i];
    if (row.length < 3) continue;

    let score = 0;
    for (const cell of row) {
      const clean = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (TRADE_HEADER_KEYWORDS.some((kw) => clean === kw || clean.includes(kw))) {
        score++;
      }
    }

    if (score >= 2 && score > maxScore) {
      maxScore = score;
      headerRowIdx = i;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }

  const rawHeaders = rawRows[headerRowIdx];
  const seenHeaders = new Map<string, number>();
  const headers = rawHeaders.map((h, colIdx) => {
    let name = String(h || '').trim();
    if (!name) name = `Column_${colIdx + 1}`;
    const count = seenHeaders.get(name) || 0;
    seenHeaders.set(name, count + 1);
    return count > 0 ? `${name}_${count + 1}` : name;
  });

  const records: Record<string, string>[] = [];
  const dataRows = rawRows.slice(headerRowIdx + 1);

  for (const row of dataRows) {
    if (!row || row.length === 0 || row.every((c) => !c || !String(c).trim())) {
      continue;
    }

    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      let cell = row[c] !== undefined ? String(row[c]).trim() : '';
      if (cell.startsWith('=')) {
        cell = cell.replace(/^="?|"?$/g, '').replace(/^"|"$/g, '').trim();
      }
      record[headers[c]] = cell;
    }
    records.push(record);
  }

  return { headers, records };
}

export function parseCleanFloat(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function cleanId(val: any): string | undefined {
  if (!val) return undefined;
  let str = String(val).trim();
  str = str.replace(/^="?|"?$/g, '').replace(/^"|"$/g, '').trim();
  return str || undefined;
}

function detectBrokerFromHeaders(headers: string[]): SupportedImportBroker {
  const normalized = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rawJoined = headers.map((h) => h.toLowerCase()).join(' ');

  // Zerodha Console / Kite Tradebook
  if (
    normalized.includes('isin') ||
    normalized.includes('tradetype') ||
    (normalized.includes('orderexecutiontime') && normalized.includes('tradeid')) ||
    (rawJoined.includes('trade date') && rawJoined.includes('series') && rawJoined.includes('order id'))
  ) {
    return 'ZERODHA';
  }

  // FYERS Tradebook (API format or MyAccount Tradebook export with OMS order ID / Symbol name / Traded price)
  if (
    normalized.includes('omsorderid') ||
    (normalized.includes('exchangeorderid') && (normalized.includes('tradedprice') || normalized.includes('symbolcode'))) ||
    ((normalized.includes('tradeno') || normalized.includes('tradenumber')) &&
      (normalized.includes('tradevalue') || (normalized.includes('side') && normalized.includes('qty'))))
  ) {
    return 'FYERS';
  }

  // Angel One
  if (
    rawJoined.includes('scrip / contract') ||
    rawJoined.includes('client code') ||
    rawJoined.includes('net rate') ||
    (normalized.includes('scrip') && normalized.includes('rate') && normalized.includes('tradeno'))
  ) {
    return 'ANGEL_ONE';
  }

  // Upstox Tradebook
  if (
    normalized.includes('scrip') &&
    (normalized.includes('product') || normalized.includes('orderno') || normalized.includes('side'))
  ) {
    return 'UPSTOX';
  }

  return 'CUSTOM';
}

function getDefaultMappingForBroker(broker: SupportedImportBroker, headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  const findHeader = (patterns: string[]): string => {
    for (const pat of patterns) {
      const match = headers.find((h) => {
        const clean = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = pat.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean === target || clean.includes(target);
      });
      if (match) return match;
    }
    return '';
  };

  if (broker === 'ZERODHA') {
    mapping.tradeDate = findHeader(['trade_date', 'trade date', 'order_execution_time', 'date']);
    mapping.symbol = findHeader(['symbol', 'scrip']);
    mapping.direction = findHeader(['trade_type', 'type', 'buysell', 'side']);
    mapping.price = findHeader(['price', 'trade_price', 'rate']);
    mapping.quantity = findHeader(['quantity', 'qty']);
    mapping.orderId = findHeader(['order_id', 'order id']);
    mapping.tradeId = findHeader(['trade_id', 'trade id']);
    mapping.segment = findHeader(['segment']);
  } else if (broker === 'FYERS') {
    mapping.tradeDate = findHeader(['date & time', 'date and time', 'trade date', 'trade_date', 'date']);
    mapping.symbol = findHeader(['symbol name', 'symbol', 'symbol code', 'scrip']);
    mapping.direction = findHeader(['side', 'type', 'direction', 'buy/sell']);
    mapping.price = findHeader(['traded price', 'trade price', 'price', 'rate']);
    mapping.quantity = findHeader(['qty', 'quantity']);
    mapping.orderId = findHeader(['exchange order id', 'order no', 'order_no', 'order id', 'orderid']);
    mapping.tradeId = findHeader(['oms order id', 'trade no', 'trade_no', 'trade id', 'tradeid']);
    mapping.segment = findHeader(['segment']);
  } else if (broker === 'ANGEL_ONE') {
    mapping.tradeDate = findHeader(['trade date', 'trade_date', 'date']);
    mapping.symbol = findHeader(['scrip / contract', 'scrip', 'symbol']);
    mapping.direction = findHeader(['buy/sell', 'buysell', 'type', 'side']);
    mapping.price = findHeader(['rate', 'net rate', 'price']);
    mapping.quantity = findHeader(['quantity', 'qty']);
    mapping.orderId = findHeader(['order no', 'order id']);
    mapping.tradeId = findHeader(['trade no', 'trade id']);
    mapping.segment = findHeader(['segment']);
  } else if (broker === 'UPSTOX') {
    mapping.tradeDate = findHeader(['date', 'time', 'trade_date']);
    mapping.symbol = findHeader(['scrip', 'symbol']);
    mapping.direction = findHeader(['side', 'type', 'buy/sell']);
    mapping.price = findHeader(['price', 'rate']);
    mapping.quantity = findHeader(['quantity', 'qty']);
    mapping.orderId = findHeader(['order no', 'order_no', 'order id']);
    mapping.tradeId = findHeader(['trade id', 'trade_id']);
    mapping.segment = findHeader(['segment']);
  } else {
    // Custom / Generic
    mapping.tradeDate = findHeader(['date & time', 'date and time', 'tradeDate', 'date', 'trade date', 'time']);
    mapping.symbol = findHeader(['symbol name', 'symbol', 'ticker', 'instrument', 'scrip']);
    mapping.direction = findHeader(['direction', 'side', 'type', 'buysell']);
    mapping.exitPrice = findHeader(['exitprice', 'sellprice', 'closeprice', 'exit', 'close']);
    if (mapping.exitPrice) {
      mapping.entryPrice = findHeader(['entryprice', 'buyprice', 'openprice', 'price']);
    } else {
      mapping.entryPrice = findHeader(['entryprice', 'buyprice', 'openprice']);
      mapping.price = findHeader(['traded price', 'trade price', 'price', 'rate']);
    }
    mapping.quantity = findHeader(['quantity', 'qty', 'shares', 'lots']);
    mapping.orderId = findHeader(['exchange order id', 'order id', 'order no', 'order_id', 'orderno']);
    mapping.tradeId = findHeader(['oms order id', 'trade id', 'trade no', 'trade_id', 'tradeno']);
    mapping.segment = findHeader(['segment', 'market']);
    mapping.totalCosts = findHeader(['fee', 'fees', 'brokerage', 'costs', 'charges']);
    mapping.notes = findHeader(['notes', 'comments']);
    mapping.strategy = findHeader(['setup', 'strategy']);
  }

  // Remove empty keys
  for (const k of Object.keys(mapping)) {
    if (!mapping[k]) delete mapping[k];
  }

  return mapping;
}

function parseFlexibleDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();

  // Try standard ISO or new Date(trimmed)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // Try DD-MM-YYYY or DD/MM/YYYY
  const parts = trimmed.split(/[-/ :T]/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const hours = parts[3] ? parseInt(parts[3], 10) : 9;
    const mins = parts[4] ? parseInt(parts[4], 10) : 15;
    const secs = parts[5] ? parseInt(parts[5], 10) : 0;
    const parsed = new Date(Date.UTC(year, month, day, hours, mins, secs));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function deriveInstrumentMeta(symbol: string, segment?: string): { assetClass: any; marketSegment: any } {
  const sym = symbol.toUpperCase().trim();
  const seg = String(segment || '').toUpperCase().trim();

  // 1. Commodity check first (covers MCX commodities which often have FUT suffix e.g. GOLDM26NOVFUT, CRUDEOILM26OCTFUT)
  const isCommodity =
    seg.includes('COMMODITY') ||
    seg.includes('MCX') ||
    ['CRUDEOIL', 'NATURALGAS', 'NATGAS', 'GOLD', 'SILVER', 'COPPER', 'ZINC', 'NICKEL', 'LEAD', 'ALUMINIUM'].some(
      (c) => sym.startsWith(c)
    );

  if (isCommodity) {
    return { assetClass: 'COMMODITY', marketSegment: 'MCX' };
  }

  // 2. Crypto
  if (sym.includes('USDT') || sym.includes('BTC') || sym.includes('ETH')) {
    return { assetClass: 'CRYPTO', marketSegment: 'CRYPTO' };
  }

  // 3. Derivatives (Options / Futures)
  if (sym.includes('CE') || sym.includes('PE')) {
    return { assetClass: 'OPTIONS', marketSegment: 'NSE_FNO' };
  }

  if (sym.includes('FUT')) {
    return { assetClass: 'FUTURES', marketSegment: 'NSE_FNO' };
  }

  return { assetClass: 'EQUITY', marketSegment: 'NSE_EQ' };
}

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
    reply.header(
      'Content-Disposition',
      `attachment; filename="tradevault-export-${new Date().toISOString().split('T')[0]}.csv"`
    );
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
    reply.header(
      'Content-Disposition',
      `attachment; filename="setupmint-backup-${new Date().toISOString().split('T')[0]}.json"`
    );
    return reply.send(trades);
  });

  // CSV Import Preview with Broker Format Detection
  app.post('/import/preview', async (req: any, reply) => {
    let csvContent = '';

    if (req.isMultipart && req.isMultipart()) {
      const data = await req.file();
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: 'No CSV file uploaded' },
        });
      }
      const buffer = await data.toBuffer();
      csvContent = buffer.toString('utf-8');
    } else if (req.body && typeof req.body.csvText === 'string') {
      csvContent = req.body.csvText;
    } else {
      try {
        const data = await req.file();
        if (data) {
          const buffer = await data.toBuffer();
          csvContent = buffer.toString('utf-8');
        }
      } catch {
        // Ignore multipart error
      }
      if (!csvContent) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: 'No CSV file or text provided' },
        });
      }
    }

    let headers: string[] = [];
    let records: Record<string, string>[] = [];
    try {
      const extracted = extractTableFromCsv(csvContent);
      headers = extracted.headers;
      records = extracted.records;
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CSV_PARSE_ERROR', message: `Invalid CSV format: ${err.message}` },
      });
    }

    if (records.length === 0 || headers.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPTY_CSV', message: 'CSV file contains no data rows' },
      });
    }

    const detectedBroker = detectBrokerFromHeaders(headers);

    // Check if user has a saved custom mapping for this broker
    let mapping: Record<string, string> | null = null;
    const savedMappingDoc = await BrokerImportMapping.findOne({
      userId: req.user!.id,
      broker: detectedBroker,
    });

    if (savedMappingDoc && savedMappingDoc.mapping) {
      mapping =
        savedMappingDoc.mapping instanceof Map
          ? Object.fromEntries(savedMappingDoc.mapping)
          : (savedMappingDoc.mapping as Record<string, string>);
    } else {
      mapping = getDefaultMappingForBroker(detectedBroker, headers);
    }

    // Determine if this looks like a raw single-leg execution log (e.g. broker tradebook with Buy/Sell per row)
    const activeMapping = mapping || {};
    const isRawExecutionLog = Boolean(
      (activeMapping.price || activeMapping.rate) &&
        (activeMapping.direction || activeMapping.trade_type || activeMapping.side) &&
        !activeMapping.exitPrice
    );

    return reply.send({
      success: true,
      data: {
        totalRows: records.length,
        headers,
        detectedBroker,
        availableBrokers: ['ZERODHA', 'FYERS', 'ANGEL_ONE', 'UPSTOX', 'CUSTOM'],
        suggestedMapping: mapping,
        isRawExecutionLog,
        hasSavedMapping: Boolean(savedMappingDoc),
        previewRows: records.slice(0, 10),
        allRows: records,
      },
    });
  });

  // Broker Mappings: List
  app.get('/mappings', async (req: any, reply) => {
    const mappings = await BrokerImportMapping.find({ userId: req.user!.id });
    return reply.send({
      success: true,
      data: mappings.map((m) => ({
        id: m._id,
        broker: m.broker,
        name: m.name,
        mapping: m.mapping instanceof Map ? Object.fromEntries(m.mapping) : m.mapping,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    });
  });

  // Broker Mappings: Get by Broker
  app.get('/mappings/:broker', async (req: any, reply) => {
    const broker = req.params.broker.toUpperCase();
    const mapping = await BrokerImportMapping.findOne({ userId: req.user!.id, broker });
    if (!mapping) {
      return reply.status(404).send({
        success: false,
        error: { code: 'MAPPING_NOT_FOUND', message: `No saved mapping for broker ${broker}` },
      });
    }
    return reply.send({
      success: true,
      data: {
        id: mapping._id,
        broker: mapping.broker,
        name: mapping.name,
        mapping: mapping.mapping instanceof Map ? Object.fromEntries(mapping.mapping) : mapping.mapping,
      },
    });
  });

  // Broker Mappings: Upsert
  app.post('/mappings', async (req: any, reply) => {
    const { broker, name, mapping } = req.body || {};
    if (!broker || !mapping) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'broker and mapping are required' },
      });
    }

    const brokerUpper = broker.toUpperCase() as SupportedImportBroker;
    const doc = await BrokerImportMapping.findOneAndUpdate(
      { userId: req.user!.id, broker: brokerUpper },
      {
        name: name || `${brokerUpper} Mapping`,
        mapping,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return reply.send({
      success: true,
      data: {
        id: doc._id,
        broker: doc.broker,
        name: doc.name,
        mapping: doc.mapping instanceof Map ? Object.fromEntries(doc.mapping) : doc.mapping,
      },
    });
  });

  // CSV Import Commit (Supports FIFO Round-Trip Grouping, Auto-Charges, and Batch Tracking)
  app.post('/import/commit', async (req: any, reply) => {
    const { accountId, rows, mapping, broker, saveMapping } = req.body || {};

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

    // Optional: save or update broker mapping for user
    if (saveMapping && broker) {
      try {
        const brokerUpper = broker.toUpperCase() as SupportedImportBroker;
        await BrokerImportMapping.findOneAndUpdate(
          { userId: req.user!.id, broker: brokerUpper },
          { name: `${brokerUpper} Tradebook Mapping`, mapping },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err: any) {
        req.log.warn(`Failed to auto-save broker mapping: ${err.message}`);
      }
    }

    const importBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let importedCount = 0;
    let duplicateCount = 0;
    const errors: Array<{ row: number; symbol?: string; message: string }> = [];

    // Check if mapping represents raw executions (one row per fill/execution) vs completed trades (entry + exit in same row)
    const isCompletedTradeFormat = Boolean(mapping.entryPrice && mapping.exitPrice);

    if (isCompletedTradeFormat) {
      // -------------------------------------------------------------
      // Mode A: Completed Trade Rows (Simple Mode)
      // -------------------------------------------------------------
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const rawDate = row[mapping.tradeDate];
          const tradeDate = parseFlexibleDate(rawDate);
          const symbolVal = String(row[mapping.symbol] || '').toUpperCase().trim();
          const dirRaw = String(row[mapping.direction] || 'LONG').toUpperCase();
          const direction =
            dirRaw.includes('SHORT') || dirRaw === 'S' || dirRaw === 'SELL' ? 'SHORT' : 'LONG';

          const entryPrice = parseCleanFloat(row[mapping.entryPrice]);
          const exitPrice = parseCleanFloat(row[mapping.exitPrice]);
          const quantity = parseCleanFloat(row[mapping.quantity]);

          if (!symbolVal || entryPrice <= 0 || quantity <= 0) {
            errors.push({
              row: i + 1,
              symbol: symbolVal || undefined,
              message: 'Missing symbol, invalid entry price, or invalid quantity',
            });
            continue;
          }

          // Check for duplicate trade
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

          const segmentVal = mapping.segment ? row[mapping.segment] : row['Segment'] || row['segment'];
          const { assetClass, marketSegment } = deriveInstrumentMeta(symbolVal, segmentVal);
          const exchange = marketSegment === 'MCX' ? 'MCX' : symbolVal.startsWith('SENSEX') || symbolVal.startsWith('BANKEX') ? 'BSE' : 'NSE';

          // Auto-calculate statutory charges via financial engine
          const charges = calculateIndianCharges({
            assetClass,
            marketSegment,
            entryPrice,
            exitPrice: exitPrice > 0 ? exitPrice : undefined,
            quantity,
            contractMultiplier: 1,
            broker: account.broker,
          });

          const pnlRes = calculateSimpleExecutionPnL(direction as any, {
            entryPrice,
            exitPrice: exitPrice > 0 ? exitPrice : undefined,
            quantity,
            contractMultiplier: 1,
            brokerage: charges.brokerage,
            exchangeFees: charges.exchangeFees,
            regulatoryFees: charges.regulatoryFees,
            taxes: charges.taxes,
            otherFees: 0,
            explicitAdjustments: 0,
          });

          const session = deriveSessionFromTime(tradeDate, exchange, marketSegment);

          await Trade.create({
            userId: req.user!.id,
            accountId: account._id,
            symbol: symbolVal,
            assetClass,
            exchange,
            marketSegment,
            currency: account.baseCurrency,
            direction,
            status: exitPrice > 0 ? 'CLOSED' : 'OPEN',
            tradeDate,
            entryTime: tradeDate,
            exitTime: exitPrice > 0 ? tradeDate : undefined,
            session,
            tags: ['IMPORTED'],
            importBatchId,
            executionMode: 'SIMPLE',
            simpleExecution: {
              entryPrice,
              exitPrice: exitPrice > 0 ? exitPrice : undefined,
              quantity,
              contractMultiplier: 1,
              brokerage: charges.brokerage,
              exchangeFees: charges.exchangeFees,
              regulatoryFees: charges.regulatoryFees,
              taxes: charges.taxes,
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
              notes: mapping.notes ? row[mapping.notes] : undefined,
            },
            calculated: {
              grossPnL: pnlRes.grossPnLNumber,
              totalCosts: charges.totalCosts,
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
                details: { importBatchId, broker },
              },
            ],
          });

          importedCount++;
        } catch (err: any) {
          errors.push({ row: i + 1, message: err.message });
        }
      }
    } else {
      // -------------------------------------------------------------
      // Mode B: Raw Executions Grouped via FIFO (Advanced Mode)
      // -------------------------------------------------------------
      interface RawExecution {
        rowIdx: number;
        timestamp: Date;
        symbol: string;
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
        orderId?: string;
        tradeId?: string;
        segment?: string;
      }

      const parsedExecutions: RawExecution[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const symbolVal = String(row[mapping.symbol] || '').toUpperCase().trim();
          const rawPrice = row[mapping.price] || row[mapping.entryPrice] || row[mapping.rate];
          const rawQty = row[mapping.quantity] || row[mapping.qty];
          const rawDir = String(row[mapping.direction] || '').toUpperCase().trim();

          const price = parseCleanFloat(rawPrice);
          const quantity = parseCleanFloat(rawQty);

          if (!symbolVal || price <= 0 || quantity <= 0) {
            errors.push({
              row: i + 1,
              symbol: symbolVal || undefined,
              message: 'Invalid symbol, price, or quantity',
            });
            continue;
          }

          const isBuy =
            rawDir.includes('BUY') || rawDir === 'B' || rawDir === '1' || rawDir === 'LONG';
          const isSell =
            rawDir.includes('SELL') || rawDir === 'S' || rawDir === '-1' || rawDir === 'SHORT';

          if (!isBuy && !isSell) {
            errors.push({
              row: i + 1,
              symbol: symbolVal,
              message: `Unrecognized direction / side: "${rawDir}"`,
            });
            continue;
          }

          const timestamp = parseFlexibleDate(row[mapping.tradeDate]);

          parsedExecutions.push({
            rowIdx: i + 1,
            timestamp,
            symbol: symbolVal,
            side: isBuy ? 'BUY' : 'SELL',
            price,
            quantity,
            orderId: mapping.orderId ? cleanId(row[mapping.orderId]) : undefined,
            tradeId: mapping.tradeId ? cleanId(row[mapping.tradeId]) : undefined,
            segment: mapping.segment ? row[mapping.segment] : row['Segment'] || row['segment'],
          });
        } catch (err: any) {
          errors.push({ row: i + 1, message: err.message });
        }
      }

      // Group raw executions by symbol
      const executionsBySymbol = new Map<string, RawExecution[]>();
      for (const exec of parsedExecutions) {
        const list = executionsBySymbol.get(exec.symbol) || [];
        list.push(exec);
        executionsBySymbol.set(exec.symbol, list);
      }

      // For each symbol, match round-trip trades chronologically using FIFO
      for (const [symbol, execList] of executionsBySymbol.entries()) {
        execList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.rowIdx - b.rowIdx);

        const segmentVal = execList[0]?.segment;
        const { assetClass, marketSegment } = deriveInstrumentMeta(symbol, segmentVal);
        const exchange = marketSegment === 'MCX' ? 'MCX' : symbol.startsWith('SENSEX') || symbol.startsWith('BANKEX') ? 'BSE' : 'NSE';

        interface ActiveTradeGroup {
          direction: 'LONG' | 'SHORT';
          fills: Array<{
            fillId: string;
            type: 'ENTRY' | 'EXIT';
            price: number;
            quantity: number;
            timestamp: Date;
          }>;
          openQuantity: number;
          entryTime: Date;
        }

        let currentGroup: ActiveTradeGroup | null = null;

        const finalizeTrade = async (group: ActiveTradeGroup) => {
          try {
            const fifoSummary = calculateFIFOExecution(
              group.direction,
              group.fills.map((f) => ({
                fillId: f.fillId,
                type: f.type,
                price: f.price,
                quantity: f.quantity,
                timestamp: f.timestamp.toISOString(),
              })),
              1
            );

            const tradeDate = group.entryTime;
            const avgEntry = fifoSummary.weightedAvgEntryPrice.toNumber();
            const avgExit = fifoSummary.weightedAvgExitPrice
              ? fifoSummary.weightedAvgExitPrice.toNumber()
              : undefined;
            const closedQty = fifoSummary.closedQuantity.toNumber();
            const openQty = fifoSummary.openQuantity.toNumber();

            // Check for duplicate trade
            const existing = await Trade.findOne({
              userId: req.user!.id,
              accountId: account._id,
              symbol,
              tradeDate,
              'calculated.averageEntryPrice': avgEntry,
              'calculated.closedQuantity': closedQty,
            });

            if (existing) {
              duplicateCount++;
              return;
            }

            // Auto-calculate charges for round trip
            const totalTradeQty = group.fills
              .filter((f) => f.type === 'ENTRY')
              .reduce((sum, f) => sum + f.quantity, 0);

            const charges = calculateIndianCharges({
              assetClass,
              marketSegment,
              entryPrice: avgEntry,
              exitPrice: avgExit,
              quantity: totalTradeQty,
              contractMultiplier: 1,
              broker: account.broker,
            });

            const grossPnL = fifoSummary.realizedGrossPnL.toNumber();
            const totalCosts = charges.totalCosts;
            const netPnL = grossPnL - totalCosts;

            const lastExitFill = group.fills
              .filter((f) => f.type === 'EXIT')
              .slice(-1)[0];
            const exitTime = lastExitFill ? lastExitFill.timestamp : undefined;
            const session = deriveSessionFromTime(group.entryTime, exchange, marketSegment);

            await Trade.create({
              userId: req.user!.id,
              accountId: account._id,
              symbol,
              assetClass,
              exchange,
              marketSegment,
              currency: account.baseCurrency,
              direction: group.direction,
              status: fifoSummary.isFullyClosed ? 'CLOSED' : 'OPEN',
              tradeDate,
              entryTime: group.entryTime,
              exitTime,
              session,
              tags: ['IMPORTED'],
              importBatchId,
              executionMode: 'ADVANCED',
              simpleExecution: {
                contractMultiplier: 1,
                entryPrice: avgEntry,
                exitPrice: avgExit,
                quantity: totalTradeQty,
                brokerage: charges.brokerage,
                exchangeFees: charges.exchangeFees,
                regulatoryFees: charges.regulatoryFees,
                taxes: charges.taxes,
                otherFees: 0,
                explicitAdjustments: 0,
              },
              fills: group.fills.map((f) => ({
                fillId: f.fillId,
                type: f.type,
                price: f.price,
                quantity: f.quantity,
                timestamp: f.timestamp,
                fee: 0,
              })),
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
              },
              calculated: {
                grossPnL,
                totalCosts,
                netPnL,
                outcome: fifoSummary.outcome,
                closedQuantity: closedQty,
                openQuantity: openQty,
                averageEntryPrice: avgEntry,
                averageExitPrice: avgExit,
              },
              screenshotIds: [],
              auditLog: [
                {
                  action: 'IMPORTED_CSV_FIFO',
                  timestamp: new Date(),
                  changedBy: req.user!.email,
                  details: { importBatchId, broker, fillCount: group.fills.length },
                },
              ],
            });

            importedCount++;
          } catch (err: any) {
            errors.push({ row: 0, symbol, message: `FIFO Matching error: ${err.message}` });
          }
        };

        for (const exec of execList) {
          const isExecBuy = exec.side === 'BUY';

          if (!currentGroup) {
            // First execution sets trade direction
            const direction = isExecBuy ? 'LONG' : 'SHORT';
            currentGroup = {
              direction,
              fills: [
                {
                  fillId: exec.tradeId || exec.orderId || `fill_${exec.rowIdx}`,
                  type: 'ENTRY',
                  price: exec.price,
                  quantity: exec.quantity,
                  timestamp: exec.timestamp,
                },
              ],
              openQuantity: exec.quantity,
              entryTime: exec.timestamp,
            };
          } else {
            // Active position exists
            const isScaleIn =
              (currentGroup.direction === 'LONG' && isExecBuy) ||
              (currentGroup.direction === 'SHORT' && !isExecBuy);

            if (isScaleIn) {
              // Add entry fill
              currentGroup.fills.push({
                fillId: exec.tradeId || exec.orderId || `fill_${exec.rowIdx}`,
                type: 'ENTRY',
                price: exec.price,
                quantity: exec.quantity,
                timestamp: exec.timestamp,
              });
              currentGroup.openQuantity += exec.quantity;
            } else {
              // Exit execution
              if (exec.quantity <= currentGroup.openQuantity) {
                currentGroup.fills.push({
                  fillId: exec.tradeId || exec.orderId || `fill_${exec.rowIdx}`,
                  type: 'EXIT',
                  price: exec.price,
                  quantity: exec.quantity,
                  timestamp: exec.timestamp,
                });
                currentGroup.openQuantity -= exec.quantity;

                if (currentGroup.openQuantity === 0) {
                  // Fully closed trade
                  await finalizeTrade(currentGroup);
                  currentGroup = null;
                }
              } else {
                // Position flip: exit remaining open quantity, then open opposite position
                const closeQty: number = currentGroup.openQuantity;
                const newOpenQty: number = exec.quantity - closeQty;

                currentGroup.fills.push({
                  fillId: (exec.tradeId || exec.orderId || `fill_${exec.rowIdx}`) + '_close',
                  type: 'EXIT',
                  price: exec.price,
                  quantity: closeQty,
                  timestamp: exec.timestamp,
                });
                currentGroup.openQuantity = 0;
                await finalizeTrade(currentGroup);

                // Start new flipped trade
                const flippedDirection = isExecBuy ? 'LONG' : 'SHORT';
                currentGroup = {
                  direction: flippedDirection,
                  fills: [
                    {
                      fillId: (exec.tradeId || exec.orderId || `fill_${exec.rowIdx}`) + '_open',
                      type: 'ENTRY',
                      price: exec.price,
                      quantity: newOpenQty,
                      timestamp: exec.timestamp,
                    },
                  ],
                  openQuantity: newOpenQty,
                  entryTime: exec.timestamp,
                };
              }
            }
          }
        }

        // If there's an open position at the end of data for this symbol
        if (currentGroup && currentGroup.fills.length > 0) {
          await finalizeTrade(currentGroup);
          currentGroup = null;
        }
      }
    }

    // Reconcile target account if trades were imported
    if (importedCount > 0) {
      await AccountService.recalculateAccountBalances(account._id, req.user!.id);
    }

    return reply.send({
      success: true,
      data: {
        batchId: importBatchId,
        importedCount,
        duplicateCount,
        errorCount: errors.length,
        errors,
      },
    });
  });

  // Undo Import Batch
  app.post('/import/undo', async (req: any, reply) => {
    let { batchId } = req.body || {};

    if (!batchId) {
      // Find the most recent import batch for this user
      const latestTrade = await Trade.findOne({
        userId: req.user!.id,
        importBatchId: { $exists: true, $ne: null },
      }).sort({ createdAt: -1 });

      if (!latestTrade || !latestTrade.importBatchId) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NO_IMPORT_BATCH', message: 'No import batch found to undo' },
        });
      }
      batchId = latestTrade.importBatchId;
    }

    // Find all trades for this batch
    const tradesToUndo = await Trade.find({ userId: req.user!.id, importBatchId: batchId });
    if (tradesToUndo.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: `Import batch "${batchId}" not found or already deleted` },
      });
    }

    // Collect affected accounts
    const affectedAccountIds = [...new Set(tradesToUndo.map((t) => t.accountId.toString()))];

    // Delete the batch
    const deleteRes = await Trade.deleteMany({ userId: req.user!.id, importBatchId: batchId });

    // Reconcile all affected accounts
    for (const accId of affectedAccountIds) {
      await AccountService.recalculateAccountBalances(accId, req.user!.id);
    }

    return reply.send({
      success: true,
      data: {
        batchId,
        deletedCount: deleteRes.deletedCount,
        affectedAccounts: affectedAccountIds,
      },
    });
  });

  // List Recent Import Batches
  app.get('/import/batches', async (req: any, reply) => {
    const batches = await Trade.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user!.id),
          importBatchId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$importBatchId',
          tradeCount: { $sum: 1 },
          accountId: { $first: '$accountId' },
          createdAt: { $first: '$createdAt' },
          symbols: { $addToSet: '$symbol' },
          totalNetPnL: { $sum: '$calculated.netPnL' },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
    ]);

    return reply.send({
      success: true,
      data: batches.map((b) => ({
        batchId: b._id,
        tradeCount: b.tradeCount,
        accountId: b.accountId,
        createdAt: b.createdAt,
        symbols: b.symbols,
        totalNetPnL: b.totalNetPnL,
      })),
    });
  });
};
