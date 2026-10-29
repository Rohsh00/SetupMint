import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import {
  calculateSimpleExecutionPnL,
  calculateFIFOExecution,
  calculateIndianCharges,
  deriveSessionFromTime,
} from '@tradevault/financial-engine';
import {
  AccountTransaction,
  BrokerImportMapping,
  Strategy,
  SupportedImportBroker,
  Trade,
  TradingAccount,
} from '../db/models/index.js';
import {
  AccountTransactionSource,
  BrokerImportKind,
  TransactionType,
  dateRangeSchema,
  buildDateRangeClause,
} from '@tradevault/shared';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
import { InstrumentService } from '../services/instrument.service.js';
import { InstrumentClassifier } from '../services/instrument-classifier.service.js';
import { ChartGeneratorService } from '../services/chart-generator.service.js';
import { FyersService } from '../services/fyers.service.js';
import { PatternRecognitionService } from '../services/pattern-recognition.service.js';

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

const LEDGER_HEADER_KEYWORDS = [
  'date',
  'transactiontype',
  'transaction_type',
  'description',
  'narration',
  'particulars',
  'remarks',
  'credit',
  'creditamount',
  'credit_amount',
  'debit',
  'debitamount',
  'debit_amount',
  'balance',
  'runningbalance',
  'running_balance',
  'fundsadded',
  'fundswithdrawn',
  'amount',
];

export function extractTableFromCsv(
  csvContent: string,
  headerKeywords: string[] = TRADE_HEADER_KEYWORDS
): { headers: string[]; records: Record<string, string>[] } {
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
      if (headerKeywords.some((kw) => clean === kw || clean.includes(kw))) {
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

function cleanLedgerHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getLedgerHeader(headers: string[], patterns: string[]): string {
  for (const pattern of patterns) {
    const target = cleanLedgerHeaderKey(pattern);
    const match = headers.find((h) => {
      const clean = cleanLedgerHeaderKey(h);
      return clean === target || clean.includes(target);
    });
    if (match) return match;
  }
  return '';
}

function getDefaultLedgerMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {
    date: getLedgerHeader(headers, ['date & time', 'date and time', 'transaction date', 'trade date', 'date']),
    transactionType: getLedgerHeader(headers, [
      'transaction type',
      'transaction_type',
      'voucher type',
      'entry type',
      'type',
    ]),
    description: getLedgerHeader(headers, [
      'description',
      'narration',
      'particulars',
      'remarks',
      'details',
      'transaction details',
    ]),
    credit: getLedgerHeader(headers, [
      'credit amount',
      'credit_amount',
      'credit',
      'funds added',
      'deposit',
      'payin',
    ]),
    debit: getLedgerHeader(headers, [
      'debit amount',
      'debit_amount',
      'debit',
      'funds withdrawn',
      'withdrawal',
      'payout',
    ]),
    balance: getLedgerHeader(headers, [
      'running balance',
      'running_balance',
      'closing balance',
      'closing_balance',
      'balance',
    ]),
  };

  for (const key of Object.keys(mapping)) {
    if (!mapping[key]) delete mapping[key];
  }

  return mapping;
}

function sanitizeCsvCell(value: string): string {
  if (!value) return '';
  let cell = value.trim();
  if (cell.startsWith('=')) {
    cell = cell.replace(/^="?|"?$/g, '').replace(/^"|"$/g, '').trim();
  }
  if (/^[=+\-@\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }
  return cell;
}

function parseLedgerAmount(value: any): Decimal | null {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;
  const cleaned = str.replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  try {
    const dec = new Decimal(cleaned);
    if (dec.isNaN()) return null;
    return dec;
  } catch {
    return null;
  }
}

function parseFlexibleDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();

  // If already standard ISO with UTC 'Z' or explicit offset e.g. "+05:30"
  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // If string contains explicit English month name (e.g. "16 Oct 2026, 10:48:23 AM")
  if (/[a-zA-Z]{3,}/.test(trimmed) && !/^\d+/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Detect AM / PM
  const isPM = /\bpm\b/i.test(trimmed);
  const isAM = /\bam\b/i.test(trimmed);

  const cleaned = trimmed.replace(/,/g, ' ').trim();
  const parts = cleaned.split(/[\s\-\/:T]+/).filter(Boolean);

  if (parts.length >= 3) {
    let day = 1;
    let month = 0;
    let year = 2026;

    if (parts[0].length === 4) {
      // YYYY-MM-DD
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (isNaN(parseInt(parts[1], 10))) {
      // e.g. "16 Oct 2026"
      day = parseInt(parts[0], 10);
      const mStr = parts[1].toLowerCase();
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const foundMonth = months.findIndex((m) => mStr.startsWith(m));
      month = foundMonth === -1 ? 0 : foundMonth;
      year = parseInt(parts[2], 10);
    } else {
      // DD-MM-YYYY or DD/MM/YYYY
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }

    let hours = parts[3] ? parseInt(parts[3], 10) : 9;
    const mins = parts[4] ? parseInt(parts[4], 10) : (parts[3] ? 0 : 15);
    const secs = parts[5] && !isNaN(parseInt(parts[5], 10)) ? parseInt(parts[5], 10) : 0;

    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }

    // Indian brokers (FYERS, Zerodha, Angel One, Upstox) report local time in IST (UTC+5:30)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const utcEpoch = Date.UTC(year, month, day, hours, mins, secs) - istOffsetMs;
    const parsed = new Date(utcEpoch);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

function deriveInstrumentMeta(symbol: string, segment?: string): { assetClass: any; marketSegment: any } {
  const classified = InstrumentClassifier.classifySync(symbol, segment);
  return {
    assetClass: classified.assetClass,
    marketSegment: classified.marketSegment,
  };
}

type LedgerRowType = 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'IGNORE';

interface LedgerClassification {
  type: LedgerRowType;
  amount: Decimal;
  reason: string;
}

function parseLedgerDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;

  if (/^\d{10,13}$/.test(trimmed)) {
    const epoch = Number(trimmed);
    const parsed = new Date(trimmed.length === 10 ? epoch * 1000 : epoch);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  if (/[a-zA-Z]{3,}/.test(trimmed) && !/^\d+$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  const isPM = /\bpm\b/i.test(trimmed);
  const isAM = /\bam\b/i.test(trimmed);
  const cleaned = trimmed.replace(/,/g, ' ').trim();
  const parts = cleaned.split(/[\s\-\/:T]+/).filter(Boolean);

  if (parts.length >= 3) {
    let day = 1;
    let month = 0;
    let year = 2026;

    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (isNaN(parseInt(parts[1], 10))) {
      day = parseInt(parts[0], 10);
      const mStr = parts[1].toLowerCase();
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const foundMonth = months.findIndex((m) => mStr.startsWith(m));
      if (foundMonth === -1) return null;
      month = foundMonth;
      year = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }

    let hours = parts[3] ? parseInt(parts[3], 10) : 0;
    const mins = parts[4] ? parseInt(parts[4], 10) : 0;
    const secs = parts[5] && !isNaN(parseInt(parts[5], 10)) ? parseInt(parts[5], 10) : 0;

    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }

    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const parsed = new Date(Date.UTC(year, month, day, hours, mins, secs) - istOffsetMs);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function classifyLedgerRow(input: {
  externalType: string;
  description: string;
  credit: Decimal | null;
  debit: Decimal | null;
}): LedgerClassification {
  const externalType = (input.externalType || '').toUpperCase().trim();
  const description = input.description || '';
  const credit = input.credit && !input.credit.isZero() ? input.credit.abs() : null;
  const debit = input.debit && !input.debit.isZero() ? input.debit.abs() : null;

  const isDepositType =
    externalType === '1' ||
    /\bBR\b/.test(externalType) ||
    /FUNDS?\s+ADDED|DEPOSIT|PAYIN|PAY-IN|MONEY\s+ADDED/.test(externalType);
  const isWithdrawalType =
    externalType === '2' ||
    /\bBP\b/.test(externalType) ||
    /FUNDS?\s+WITHDRAWN|WITHDRAWAL|PAYOUT|PAY-OUT|MONEY\s+WITHDRAWN/.test(externalType);
  const isTradingType =
    externalType === '3' ||
    externalType === '5' ||
    /\bSJ\b|\bMTF\b|TRADING/.test(externalType);
  const isAdjustmentType =
    externalType === '4' ||
    /\bJV\b|NON.?TRADING|CHARGE|BROKERAGE|GST|STT|SEBI|STAMP|DPC|INTEREST|ADJUSTMENT/.test(
      `${externalType} ${description}`
    );

  const signedAmount = (credit || new Decimal(0)).minus(debit || new Decimal(0));

  if (isDepositType) {
    if (credit) return { type: 'DEPOSIT', amount: credit, reason: 'Funds added' };
    return { type: 'IGNORE', amount: new Decimal(0), reason: 'Funds-added row has no credit amount' };
  }

  if (isWithdrawalType) {
    if (debit) return { type: 'WITHDRAWAL', amount: debit, reason: 'Funds withdrawn' };
    return { type: 'IGNORE', amount: new Decimal(0), reason: 'Withdrawal row has no debit amount' };
  }

  if (isTradingType) {
    return { type: 'IGNORE', amount: new Decimal(0), reason: 'Trading ledger row defaults to ignore' };
  }

  if (isAdjustmentType) {
    if (!signedAmount.isZero()) {
      return { type: 'ADJUSTMENT', amount: signedAmount, reason: 'Non-trading adjustment' };
    }
    return { type: 'IGNORE', amount: new Decimal(0), reason: 'Zero-value adjustment' };
  }

  if (/FUNDS?\s+ADDED|DEPOSIT|PAYIN|PAY-IN|MONEY\s+ADDED/i.test(description) && credit) {
    return { type: 'DEPOSIT', amount: credit, reason: 'Description indicates funds added' };
  }
  if (/FUNDS?\s+WITHDRAWN|WITHDRAWAL|PAYOUT|PAY-OUT|MONEY\s+WITHDRAWN/i.test(description) && debit) {
    return { type: 'WITHDRAWAL', amount: debit, reason: 'Description indicates funds withdrawn' };
  }
  if (!signedAmount.isZero()) {
    return {
      type: 'ADJUSTMENT',
      amount: signedAmount,
      reason: 'Unrecognized ledger row treated as adjustment and requires review',
    };
  }

  return { type: 'IGNORE', amount: new Decimal(0), reason: 'No usable amount or transaction type' };
}

function buildLedgerIdempotencyKey(input: {
  accountId: string;
  type: Exclude<LedgerRowType, 'IGNORE'>;
  date: Date;
  amount: Decimal;
  description: string;
}): string {
  const normalizedDescription = (input.description || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return crypto
    .createHash('sha256')
    .update(
      [
        input.accountId,
        'FYERS_LEDGER',
        input.type,
        input.date.toISOString(),
        input.amount.toFixed(2),
        normalizedDescription,
      ].join('|')
    )
    .digest('hex');
}

function normalizeLedgerRecord(
  record: Record<string, string>,
  mapping: Record<string, string>,
  rowIndex: number
): {
  rowIndex: number;
  rawDate: string;
  date: string | null;
  dateISO: string | null;
  type: LedgerRowType;
  amount: number;
  amountString: string;
  description: string;
  runningBalance: number | null;
  externalType: string;
  reason: string;
  error?: string;
} {
  const rawDate = mapping.date ? String(record[mapping.date] || '').trim() : '';
  const date = parseLedgerDate(rawDate);
  const credit = parseLedgerAmount(mapping.credit ? record[mapping.credit] : undefined);
  const debit = parseLedgerAmount(mapping.debit ? record[mapping.debit] : undefined);
  const runningBalance = parseLedgerAmount(mapping.balance ? record[mapping.balance] : undefined);
  const externalType = mapping.transactionType
    ? sanitizeCsvCell(String(record[mapping.transactionType] || ''))
    : '';
  const description = mapping.description
    ? sanitizeCsvCell(String(record[mapping.description] || ''))
    : '';
  const classification = classifyLedgerRow({ externalType, description, credit, debit });

  return {
    rowIndex,
    rawDate,
    date: date ? date.toISOString() : null,
    dateISO: date ? date.toISOString() : null,
    type: classification.type,
    amount: classification.amount.toNumber(),
    amountString: classification.amount.toFixed(2),
    description,
    runningBalance: runningBalance ? runningBalance.toNumber() : null,
    externalType,
    reason: classification.reason,
    error: date ? undefined : 'Invalid or missing date',
  };
}

export const exportImportRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // CSV Export
  app.get('/csv', async (req: any, reply) => {
    const { accountId, startDate, endDate } = req.query;

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

    const filter: any = { userId: req.user!.id };
    if (accountId) filter.accountId = accountId;

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const trades = await Trade.find(filter)
      .sort({ tradeDate: -1 })
      .populate('accountId', 'name')
      .populate('strategyId', 'name variants');

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
      SetupVariantKey: t.setup?.variantKey || '',
      SetupVariantName: (t.strategyId as any)?.variants?.find((v: any) => v.key === t.setup?.variantKey)?.name || '',
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

    const filter: any = { userId: req.user!.id };
    if (accountId) filter.accountId = accountId;

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
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

    const importKind: BrokerImportKind =
      req.query?.importKind === 'CASH_FLOWS' || req.body?.importKind === 'CASH_FLOWS'
        ? 'CASH_FLOWS'
        : 'TRADES';
    const accountId =
      typeof req.query?.accountId === 'string'
        ? req.query.accountId
        : typeof req.body?.accountId === 'string'
          ? req.body.accountId
          : undefined;

    if (accountId && !mongoose.isValidObjectId(accountId)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_ACCOUNT', message: 'Invalid accountId' },
      });
    }

    let headers: string[] = [];
    let records: Record<string, string>[] = [];
    try {
      const extracted = extractTableFromCsv(
        csvContent,
        importKind === 'CASH_FLOWS' ? LEDGER_HEADER_KEYWORDS : TRADE_HEADER_KEYWORDS
      );
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

    if (importKind === 'CASH_FLOWS') {
      const requestedBroker =
        typeof req.query?.broker === 'string'
          ? req.query.broker
          : typeof req.body?.broker === 'string'
            ? req.body.broker
            : 'FYERS';
      const ledgerBroker = requestedBroker.toUpperCase() as SupportedImportBroker;

      const savedLedgerMapping = await BrokerImportMapping.findOne({
        userId: req.user!.id,
        broker: ledgerBroker,
        importKind: 'CASH_FLOWS',
      });

      const ledgerMapping =
        savedLedgerMapping?.mapping instanceof Map
          ? Object.fromEntries(savedLedgerMapping.mapping)
          : (savedLedgerMapping?.mapping as Record<string, string> | undefined) ||
            getDefaultLedgerMapping(headers);

      const normalizedRows = records.map((record, index) =>
        normalizeLedgerRecord(record, ledgerMapping, index + 1)
      );

      let existingKeys = new Set<string>();
      if (accountId) {
        const candidateKeys = normalizedRows
          .filter((row) => row.type !== 'IGNORE' && row.dateISO)
          .map((row) =>
            buildLedgerIdempotencyKey({
              accountId,
              type: row.type as Exclude<LedgerRowType, 'IGNORE'>,
              date: new Date(row.dateISO as string),
              amount: new Decimal(row.amountString),
              description: row.description,
            })
          );

        if (candidateKeys.length > 0) {
          const existing = await AccountTransaction.find({
            userId: req.user!.id,
            accountId,
            idempotencyKey: { $in: candidateKeys },
          }).select('idempotencyKey');
          existingKeys = new Set(existing.map((tx) => tx.idempotencyKey).filter(Boolean) as string[]);
        }
      }

      const rowsWithDuplicates = normalizedRows.map((row) => {
        if (!accountId || row.type === 'IGNORE' || !row.dateISO) {
          return { ...row, duplicate: false };
        }
        const key = buildLedgerIdempotencyKey({
          accountId,
          type: row.type as Exclude<LedgerRowType, 'IGNORE'>,
          date: new Date(row.dateISO),
          amount: new Decimal(row.amountString),
          description: row.description,
        });
        return { ...row, duplicate: existingKeys.has(key) };
      });

      const summary = rowsWithDuplicates.reduce(
        (acc, row) => {
          if (row.duplicate) acc.duplicateCount += 1;
          if (row.error) acc.errorCount += 1;
          if (row.type === 'DEPOSIT') acc.depositCount += 1;
          if (row.type === 'WITHDRAWAL') acc.withdrawalCount += 1;
          if (row.type === 'ADJUSTMENT') acc.adjustmentCount += 1;
          if (row.type === 'IGNORE') acc.ignoredCount += 1;
          return acc;
        },
        {
          depositCount: 0,
          withdrawalCount: 0,
          adjustmentCount: 0,
          ignoredCount: 0,
          duplicateCount: 0,
          errorCount: 0,
        }
      );

      return reply.send({
        success: true,
        data: {
          importKind: 'CASH_FLOWS',
          totalRows: records.length,
          headers,
          detectedBroker: ledgerBroker,
          availableBrokers: ['FYERS', 'ZERODHA', 'ANGEL_ONE', 'UPSTOX', 'CUSTOM'],
          suggestedMapping: ledgerMapping,
          hasSavedMapping: Boolean(savedLedgerMapping),
          requiresAccountForDuplicateCheck: !accountId,
          summary,
          previewRows: rowsWithDuplicates.slice(0, 10),
          allRows: rowsWithDuplicates,
        },
      });
    }

    const detectedBroker = detectBrokerFromHeaders(headers);

    // Check if user has a saved custom mapping for this broker
    let mapping: Record<string, string> | null = null;
    const savedMappingDoc = await BrokerImportMapping.findOne({
      userId: req.user!.id,
      broker: detectedBroker,
      importKind: 'TRADES',
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
        importKind: 'TRADES',
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
        importKind: m.importKind,
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
    const importKind = (req.query?.importKind === 'CASH_FLOWS' ? 'CASH_FLOWS' : 'TRADES') as BrokerImportKind;
    const mapping = await BrokerImportMapping.findOne({ userId: req.user!.id, broker, importKind });
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
        importKind: mapping.importKind,
        name: mapping.name,
        mapping: mapping.mapping instanceof Map ? Object.fromEntries(mapping.mapping) : mapping.mapping,
      },
    });
  });

  // Broker Mappings: Upsert
  app.post('/mappings', async (req: any, reply) => {
    const { broker, name, mapping, importKind } = req.body || {};
    if (!broker || !mapping) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'broker and mapping are required' },
      });
    }

    const brokerUpper = broker.toUpperCase() as SupportedImportBroker;
    const kind: BrokerImportKind = importKind === 'CASH_FLOWS' ? 'CASH_FLOWS' : 'TRADES';
    const doc = await BrokerImportMapping.findOneAndUpdate(
      { userId: req.user!.id, broker: brokerUpper, importKind: kind },
      {
        name: name || `${brokerUpper} ${kind === 'CASH_FLOWS' ? 'Ledger' : 'Tradebook'} Mapping`,
        mapping,
        importKind: kind,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return reply.send({
      success: true,
      data: {
        id: doc._id,
        broker: doc.broker,
        importKind: doc.importKind,
        name: doc.name,
        mapping: doc.mapping instanceof Map ? Object.fromEntries(doc.mapping) : doc.mapping,
      },
    });
  });

  // CSV Import Commit (Supports FIFO Round-Trip Grouping, Auto-Charges, and Batch Tracking)
  app.post('/import/commit', async (req: any, reply) => {
    const { accountId, rows, mapping, broker, saveMapping } = req.body || {};
    const importKind: BrokerImportKind =
      req.body?.importKind === 'CASH_FLOWS' ? 'CASH_FLOWS' : 'TRADES';

    if (!accountId || !Array.isArray(rows) || (importKind === 'TRADES' && !mapping)) {
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

    if (importKind === 'CASH_FLOWS') {
      if (saveMapping && broker && mapping) {
        try {
          const brokerUpper = broker.toUpperCase() as SupportedImportBroker;
          await BrokerImportMapping.findOneAndUpdate(
            { userId: req.user!.id, broker: brokerUpper, importKind: 'CASH_FLOWS' },
            { name: `${brokerUpper} Ledger Mapping`, mapping, importKind: 'CASH_FLOWS' },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } catch (err: any) {
          req.log.warn(`Failed to auto-save ledger mapping: ${err.message}`);
        }
      }

      const importBatchId = `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      let importedCount = 0;
      let duplicateCount = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const rowNumber = Number(row.rowIndex) || i + 1;

        if (row.action === 'IGNORE' || row.type === 'IGNORE') {
          continue;
        }

        const type = String(row.type || '').toUpperCase() as LedgerRowType;
        if (!['DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT'].includes(type)) {
          errors.push({ row: rowNumber, message: `Unsupported transaction type "${row.type}"` });
          continue;
        }

        const date = parseLedgerDate(row.dateISO || row.date || row.rawDate);
        if (!date) {
          errors.push({ row: rowNumber, message: 'Invalid or missing transaction date' });
          continue;
        }

        let amount: Decimal;
        try {
          amount = new Decimal(String(row.amountString ?? row.amount ?? ''));
        } catch {
          errors.push({ row: rowNumber, message: 'Invalid transaction amount' });
          continue;
        }

        if (!amount.isFinite() || amount.isZero()) {
          errors.push({ row: rowNumber, message: 'Transaction amount must not be zero' });
          continue;
        }

        if (type !== 'ADJUSTMENT' && amount.lt(0)) {
          errors.push({ row: rowNumber, message: 'Deposit and withdrawal amounts must be positive' });
          continue;
        }

        const normalizedAmount =
          type === 'ADJUSTMENT' ? amount : amount.abs();
        const description = sanitizeCsvCell(String(row.description || ''));
        const externalType = sanitizeCsvCell(String(row.externalType || ''));
        const idempotencyKey = buildLedgerIdempotencyKey({
          accountId: account._id.toString(),
          type: type as Exclude<LedgerRowType, 'IGNORE'>,
          date,
          amount: normalizedAmount,
          description,
        });

        const existing = await AccountTransaction.findOne({
          userId: req.user!.id,
          accountId: account._id,
          idempotencyKey,
        }).select('_id');

        if (existing) {
          duplicateCount++;
          continue;
        }

        try {
          await AccountTransaction.create({
            userId: req.user!.id,
            accountId: account._id,
            type: type as TransactionType,
            amount: mongoose.Types.Decimal128.fromString(normalizedAmount.toFixed(2)),
            currency: account.baseCurrency,
            date,
            notes:
              description ||
              `FYERS ledger import${externalType ? ` (${externalType})` : ''}`,
            source: 'BROKER_LEDGER_IMPORT' as AccountTransactionSource,
            status: 'CONFIRMED',
            idempotencyKey,
            importBatchId,
          });
          importedCount++;
        } catch (err: any) {
          if (err?.code === 11000) {
            duplicateCount++;
          } else {
            errors.push({ row: rowNumber, message: err.message || 'Failed to save transaction' });
          }
        }
      }

      const balanceSummary =
        importedCount > 0
          ? await AccountService.recalculateAccountBalances(account._id, req.user!.id)
          : null;

      return reply.send({
        success: true,
        data: {
          importKind: 'CASH_FLOWS',
          batchId: importBatchId,
          importedCount,
          duplicateCount,
          errorCount: errors.length,
          errors,
          balanceSummary,
        },
      });
    }

      // Optional: save or update broker mapping for user
    if (saveMapping && broker) {
      try {
        const brokerUpper = broker.toUpperCase() as SupportedImportBroker;
        await BrokerImportMapping.findOneAndUpdate(
          { userId: req.user!.id, broker: brokerUpper, importKind: 'TRADES' },
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
    const closedTradeIds: string[] = [];
    const errors: Array<{ row: number; symbol?: string; message: string }> = [];

    const instrumentCache = new Map<string, any>();
    const getOrEnsureInstrument = async (
      sym: string,
      meta?: { assetClass?: any; exchange?: string; marketSegment?: any }
    ) => {
      const underlying = InstrumentService.normalizeUnderlying(sym);
      if (instrumentCache.has(underlying)) {
        return instrumentCache.get(underlying);
      }
      const inst = await InstrumentService.ensureForTrade(req.user!.id, {
        symbol: sym,
        assetClass: meta?.assetClass,
        exchange: meta?.exchange,
        marketSegment: meta?.marketSegment,
        currency: account.baseCurrency,
        simpleExecution: { contractMultiplier: 1 },
      });
      instrumentCache.set(underlying, inst);
      return inst;
    };

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
          const inst = await getOrEnsureInstrument(symbolVal, { assetClass, exchange, marketSegment });

          let strategyId: any = undefined;
          let strategyName: string | undefined = undefined;
          const stratNameOrKey = mapping.strategy ? row[mapping.strategy] : row['Strategy'];
          if (stratNameOrKey) {
            const strat = await Strategy.findOne({
              userId: req.user!.id,
              name: { $regex: new RegExp(`^${stratNameOrKey.trim()}$`, 'i') },
            });
            if (strat) {
              strategyId = strat._id;
              strategyName = strat.name;
            } else {
              strategyName = stratNameOrKey.trim();
            }
          }

          let setup: any = undefined;
          const variantKeyVal = mapping.setupVariantKey ? row[mapping.setupVariantKey] : row['SetupVariantKey'];
          if (variantKeyVal) {
            setup = {
              variantKey: variantKeyVal.trim(),
              variantStatus: 'CLASSIFIED',
            };
          }

          const createdTrade = await Trade.create({
            userId: req.user!.id,
            accountId: account._id,
            instrumentId: inst._id,
            strategyId,
            strategyName,
            setup,
            symbol: symbolVal,
            underlying: inst.symbol,
            instrumentName: inst.displayName,
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

          if (exitPrice > 0) {
            closedTradeIds.push(createdTrade._id.toString());
          }

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
            const inst = await getOrEnsureInstrument(symbol, { assetClass, exchange, marketSegment });

            const createdTrade = await Trade.create({
              userId: req.user!.id,
              accountId: account._id,
              instrumentId: inst._id,
              symbol,
              underlying: inst.symbol,
              instrumentName: inst.displayName,
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

            if (fifoSummary.isFullyClosed) {
              closedTradeIds.push(createdTrade._id.toString());
            }

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

    // Fire-and-forget background auto-snapshot & excursion generation for closed trades (cap 25, 220ms pacing)
    if (closedTradeIds.length > 0) {
      (async () => {
        const batchToProcess = closedTradeIds.slice(0, 25);
        for (const tId of batchToProcess) {
          try {
            await FyersService.computeExcursionForTrade(tId, req.user!.id);
            await PatternRecognitionService.classifyTrade(tId, req.user!.id);
            await ChartGeneratorService.ensureTradeSnapshot(tId, req.user!.id);
          } catch (err: any) {
            req.log.warn('CSV import auto-snapshot/excursion/setup generation threw for trade %s: %s', tId, err.message);
          }
          await new Promise((r) => setTimeout(r, 220));
        }
      })().catch(() => {});
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
      // Find the most recent import batch for this user (trades or ledger)
      const latestTrade = await Trade.findOne({
        userId: req.user!.id,
        importBatchId: { $exists: true, $ne: null },
      }).sort({ createdAt: -1 });

      const latestLedgerTx = await AccountTransaction.findOne({
        userId: req.user!.id,
        importBatchId: { $exists: true, $ne: null },
        source: 'BROKER_LEDGER_IMPORT',
      }).sort({ createdAt: -1 });

      let candidateBatchId: string | undefined;
      if (latestTrade?.importBatchId && latestLedgerTx?.importBatchId) {
        const tradeTime = latestTrade.createdAt?.getTime() || 0;
        const ledgerTime = latestLedgerTx.createdAt?.getTime() || 0;
        candidateBatchId = ledgerTime >= tradeTime ? latestLedgerTx.importBatchId : latestTrade.importBatchId;
      } else {
        candidateBatchId = latestTrade?.importBatchId || latestLedgerTx?.importBatchId;
      }

      if (!candidateBatchId) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NO_IMPORT_BATCH', message: 'No import batch found to undo' },
        });
      }
      batchId = candidateBatchId;
    }

    // Find all trades for this batch
    const tradesToUndo = await Trade.find({ userId: req.user!.id, importBatchId: batchId });
    const ledgerTxsToUndo = await AccountTransaction.find({
      userId: req.user!.id,
      importBatchId: batchId,
      source: 'BROKER_LEDGER_IMPORT',
    });

    if (tradesToUndo.length === 0 && ledgerTxsToUndo.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: `Import batch "${batchId}" not found or already deleted` },
      });
    }

    // Collect affected accounts
    const affectedAccountIds = [
      ...new Set([
        ...tradesToUndo.map((t) => t.accountId.toString()),
        ...ledgerTxsToUndo.map((t) => t.accountId.toString()),
      ]),
    ];

    // Delete the batch
    const tradeDeleteRes = await Trade.deleteMany({ userId: req.user!.id, importBatchId: batchId });
    const ledgerDeleteRes = await AccountTransaction.deleteMany({
      userId: req.user!.id,
      importBatchId: batchId,
      source: 'BROKER_LEDGER_IMPORT',
    });

    // Reconcile all affected accounts
    for (const accId of affectedAccountIds) {
      await AccountService.recalculateAccountBalances(accId, req.user!.id);
    }

    return reply.send({
      success: true,
      data: {
        batchId,
        deletedCount: tradeDeleteRes.deletedCount + ledgerDeleteRes.deletedCount,
        tradeDeletedCount: tradeDeleteRes.deletedCount,
        ledgerDeletedCount: ledgerDeleteRes.deletedCount,
        affectedAccounts: affectedAccountIds,
      },
    });
  });

  // List Recent Import Batches
  app.get('/import/batches', async (req: any, reply) => {
    const userObjId = new mongoose.Types.ObjectId(req.user!.id);

    const [tradeBatches, ledgerBatches] = await Promise.all([
      Trade.aggregate([
        {
          $match: {
            userId: userObjId,
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
            kind: { $first: 'TRADES' },
          },
        },
      ]),
      AccountTransaction.aggregate([
        {
          $match: {
            userId: userObjId,
            importBatchId: { $exists: true, $ne: null },
            source: 'BROKER_LEDGER_IMPORT',
          },
        },
        {
          $group: {
            _id: '$importBatchId',
            ledgerCount: { $sum: 1 },
            accountId: { $first: '$accountId' },
            createdAt: { $first: '$createdAt' },
            totalAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'WITHDRAWAL'] },
                  { $multiply: ['$amount', -1] },
                  '$amount',
                ],
              },
            },
            kind: { $first: 'CASH_FLOWS' },
          },
        },
      ]),
    ]);

    const combined = [
      ...tradeBatches.map((b) => ({
        batchId: b._id,
        importKind: 'TRADES' as const,
        tradeCount: b.tradeCount,
        ledgerCount: 0,
        accountId: b.accountId,
        createdAt: b.createdAt,
        symbols: b.symbols,
        totalNetPnL: b.totalNetPnL,
        totalAmount: undefined,
      })),
      ...ledgerBatches.map((b) => ({
        batchId: b._id,
        importKind: 'CASH_FLOWS' as const,
        tradeCount: 0,
        ledgerCount: b.ledgerCount,
        accountId: b.accountId,
        createdAt: b.createdAt,
        symbols: [],
        totalNetPnL: undefined,
        totalAmount: b.totalAmount != null ? Number(b.totalAmount.toString()) : 0,
      })),
    ]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 20);

    return reply.send({
      success: true,
      data: combined,
    });
  });
};
