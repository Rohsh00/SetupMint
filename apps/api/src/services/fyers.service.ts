import crypto from 'crypto';
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import moment from 'moment';
import {
  BrokerIntegration,
  TradingAccount,
  Trade,
  User,
  Instrument,
  BrokerFundsSnapshot,
  AccountTransaction,
  TradeCandleSnapshot,
} from '../db/models/index.js';
import { TelegramAlertService } from './telegram-alert.service.js';
import {
  calculateFIFOExecution,
  calculateIndianCharges,
  calculateExcursion,
  detectStopMoves,
  matchSLOrderFromOrderbook,
  INormalizedOrderbookRow,
  calculateRealizedRMultiple,
} from '@tradevault/financial-engine';
import {
  IBrokerAuthTokens,
  IBrokerFundLimit,
  IBrokerFundsSnapshot,
  MarketSegment,
  AssetClass,
  OptionType,
  ITradeCandle,
  IExcursionBackfillResponse,
  CandleFallbackProvider,
} from '@tradevault/shared';
import { AccountService } from './account.service.js';
import { InstrumentService } from './instrument.service.js';
import { decryptSecret } from './crypto.service.js';
import { formatFyersSymbol } from './fyers-symbol.js';
import { MarketDataService } from './market-data/index.js';
import { ChartGeneratorService } from './chart-generator.service.js';
import { config } from '../config.js';

export interface IFyersExecutionRaw {
  clientId: string;
  orderDateTime: string; // "21-Oct-2026 13:51:12"
  orderNumber: string;
  exchangeOrderNo?: string;
  tradeNumber: string;
  tradePrice: number;
  tradeValue: number;
  tradedQty: number;
  orderType: number;
  side: number; // 1 = BUY, -1 = SELL
  productType: string; // "CNC", "INTRADAY", "MARGIN"
  segment: number;
  exchange: number;
  fyToken: string;
  symbol: string; // "NSE:SBIN-EQ" or "NSE:NIFTY..."
  row?: number;
  orderTag?: string;
}

export interface IFyersSyncResult {
  syncedTradesCount: number;
  duplicateTradesCount: number;
  totalExecutions: number;
  accountId: string;
  accountName: string;
  lastSyncAt: Date;
  backfilledClosedTradesCount?: number;
}

export interface IFyersFundsResult {
  snapshot: IBrokerFundsSnapshot;
  exact: {
    totalBalance: Decimal;
    clearBalance: Decimal;
    availableBalance: Decimal;
    realizedPnL: Decimal;
    utilizedAmount: Decimal;
    fundLimits: Array<{
      id?: number;
      title: string;
      equityAmount: Decimal;
      commodityAmount: Decimal;
    }>;
  };
}

const IST_TOKEN_EXPIRY_HOUR_UTC = 1;
const IST_TOKEN_EXPIRY_MINUTE_UTC = 0;

/**
 * FYERS daily access tokens expire at 06:30 IST (01:00 UTC).
 */
export function getNextFyersTokenExpiry(now: Date = new Date()): Date {
  const expiry = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      IST_TOKEN_EXPIRY_HOUR_UTC,
      IST_TOKEN_EXPIRY_MINUTE_UTC,
      0,
      0
    )
  );
  if (now.getTime() >= expiry.getTime()) {
    expiry.setUTCDate(expiry.getUTCDate() + 1);
  }
  return expiry;
}

function normalizeFundTitle(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseFundAmount(value: unknown): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    const parsed = new Decimal(String(value).replace(/,/g, ''));
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

export function normalizeFyersFunds(raw: any[]): IFyersFundsResult {
  const limits = Array.isArray(raw) ? raw : [];

  const exactFundLimits = limits.map((item) => ({
    id: item?.id != null ? Number(item.id) : undefined,
    title: String(item?.title || '').trim(),
    equityAmount: parseFundAmount(item?.equityAmount),
    commodityAmount: parseFundAmount(item?.commodityAmount),
  }));

  const findLimit = (...titles: string[]) => {
    for (const title of titles) {
      const target = normalizeFundTitle(title);
      const match = exactFundLimits.find((item) => normalizeFundTitle(item.title) === target);
      if (match) return match;
    }
    return undefined;
  };

  const total = findLimit('Total Balance', 'Total');
  const clear = findLimit('Clear Balance', 'Cleared Balance');
  const available = findLimit('Available Balance');
  const realized = findLimit('Realized Profit and Loss', 'Realised Profit and Loss', 'Realized P&L');
  const utilized = findLimit('Utilized Amount', 'Utilised Amount', 'Amount Utilized');

  const totalBalance = total?.equityAmount ?? new Decimal(0);
  const availableBalance = available?.equityAmount ?? totalBalance;
  const clearBalance = clear?.equityAmount ?? availableBalance;
  const realizedPnL = realized?.equityAmount ?? new Decimal(0);
  const utilizedAmount = utilized?.equityAmount ?? new Decimal(0);

  const fundLimits: IBrokerFundLimit[] = exactFundLimits.map((item) => ({
    id: item.id,
    title: item.title,
    equityAmount: item.equityAmount.toNumber(),
    commodityAmount: item.commodityAmount.toNumber(),
  }));

  return {
    snapshot: {
      broker: 'FYERS',
      fetchedAt: new Date().toISOString(),
      totalBalance: totalBalance.toNumber(),
      clearBalance: clearBalance.toNumber(),
      availableBalance: availableBalance.toNumber(),
      realizedPnL: realizedPnL.toNumber(),
      utilizedAmount: utilizedAmount.toNumber(),
      fundLimits,
    },
    exact: {
      totalBalance,
      clearBalance,
      availableBalance,
      realizedPnL,
      utilizedAmount,
      fundLimits: exactFundLimits,
    },
  };
}

/**
 * Parses FYERS orderDateTime strings like "21-Oct-2026 13:51:12" in Indian Standard Time (IST)
 */
export function parseFyersDateTime(raw: string): Date {
  if (!raw) return new Date();
  const trimmed = String(raw).trim();

  // Try parsing "DD-MMM-YYYY HH:mm:ss"
  const match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const mStr = match[2].toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.findIndex((m) => mStr.startsWith(m));
    const year = parseInt(match[3], 10);
    const hours = parseInt(match[4], 10);
    const mins = parseInt(match[5], 10);
    const secs = parseInt(match[6], 10);

    // IST is UTC + 5:30
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const utcEpoch = Date.UTC(year, month === -1 ? 0 : month, day, hours, mins, secs) - istOffsetMs;
    return new Date(utcEpoch);
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

export interface ParsedFyersSymbol {
  rawSymbol: string;
  cleanSymbol: string;
  formattedSymbol: string;
  underlying: string;
  exchange: string;
  marketSegment: MarketSegment;
  assetClass: AssetClass;
  optionType?: OptionType;
  strikePrice?: number;
  expiryDate?: Date;
  isDerivative: boolean;
}

/**
 * Parses FYERS symbol string into normalized metadata, underlying asset, and derivative details.
 * Strips broker prefixes, detects options strikes/types, futures, and links to root underlying.
 * e.g. "NSE:NIFTY26OCT22650CE" -> underlying: "NIFTY", formatted: "NIFTY 22650 CE", strike: 22650, optionType: "CALL"
 */
export function parseFyersSymbol(rawSymbol: string): ParsedFyersSymbol {
  let exchange = 'NSE';
  let sym = (rawSymbol || '').trim();
  if (sym.includes(':')) {
    const parts = sym.split(':');
    exchange = parts[0].toUpperCase();
    sym = parts[1];
  }
  sym = sym.trim();
  const underlying = InstrumentService.normalizeUnderlying(rawSymbol);

  let cleanSymbol = sym;
  let formattedSymbol = underlying;
  let assetClass: AssetClass = 'EQUITY';
  let marketSegment: MarketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_EQ';
  let optionType: OptionType | undefined;
  let strikePrice: number | undefined;
  let expiryDate: Date | undefined;
  let isDerivative = false;

  if (cleanSymbol.endsWith('-EQ') || cleanSymbol.endsWith('-BE')) {
    cleanSymbol = cleanSymbol.replace(/-EQ|-BE$/, '');
    formattedSymbol = underlying;
    assetClass = 'EQUITY';
    marketSegment = exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ';
  } else if (/CE$|PE$|CALL$|PUT$/i.test(cleanSymbol)) {
    assetClass = 'OPTIONS';
    marketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_FNO';
    optionType = /CE$|CALL$/i.test(cleanSymbol) ? 'CALL' : 'PUT';
    isDerivative = true;

    const weeklyMatch = cleanSymbol.match(/(?:[A-Z]+)(\d{2})([1-9OND])(\d{2})(\d+(?:\.\d+)?)(?:CE|PE|CALL|PUT)$/i);
    if (weeklyMatch) {
      const yy = 2000 + parseInt(weeklyMatch[1], 10);
      const mCode = weeklyMatch[2].toUpperCase();
      const monthIndex = mCode === 'O' ? 9 : mCode === 'N' ? 10 : mCode === 'D' ? 11 : parseInt(mCode, 10) - 1;
      const dd = parseInt(weeklyMatch[3], 10);
      expiryDate = new Date(Date.UTC(yy, monthIndex, dd));
      strikePrice = parseFloat(weeklyMatch[4]);
    } else {
      const monthlyOptMatch = cleanSymbol.match(/(?:[A-Z]+)(\d{2})([A-Z]{3})(\d+(?:\.\d+)?)(?:CE|PE|CALL|PUT)$/i);
      if (monthlyOptMatch) {
        const yy = 2000 + parseInt(monthlyOptMatch[1], 10);
        const mmm = monthlyOptMatch[2].toUpperCase();
        strikePrice = parseFloat(monthlyOptMatch[3]);
        const m = moment(`${yy}-${mmm}-01`, 'YYYY-MMM-DD');
        if (m.isValid()) {
          expiryDate = m.endOf('month').toDate();
        }
      } else {
        const optMatch = cleanSymbol.match(/(?:(?:\d{2}[A-Z]{3}|\d{2}[0-9OND]\d{2})\s*)?(\d+(?:\.\d+)?)\s*(?:CE|PE|CALL|PUT)$/i);
        if (optMatch && optMatch[1]) {
          strikePrice = parseFloat(optMatch[1]);
        }
      }
    }
    formattedSymbol = underlying;
  } else if (/FUT$|FUTURES$/i.test(cleanSymbol)) {
    assetClass = exchange === 'MCX' ? 'COMMODITY' : 'FUTURES';
    marketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_FNO';
    isDerivative = true;
    const futMatch = cleanSymbol.match(/(?:[A-Z]+)(\d{2})([A-Z]{3})FUT$/i);
    if (futMatch) {
      const yy = 2000 + parseInt(futMatch[1], 10);
      const mmm = futMatch[2].toUpperCase();
      const m = moment(`${yy}-${mmm}-01`, 'YYYY-MMM-DD');
      if (m.isValid()) {
        expiryDate = m.endOf('month').toDate();
      }
    }
    formattedSymbol = underlying;
  } else if (exchange === 'MCX') {
    assetClass = 'COMMODITY';
    marketSegment = 'MCX';
    formattedSymbol = underlying;
  }

  return {
    rawSymbol,
    cleanSymbol,
    formattedSymbol,
    underlying,
    exchange,
    marketSegment,
    assetClass,
    optionType,
    strikePrice,
    expiryDate,
    isDerivative,
  };
}

export class FyersService {
  private static get FYERS_API_BASE(): string {
    return config.fyersApiBase.replace(/\/$/, '');
  }

  private static quotesCache = new Map<
    string,
    {
      data: {
        ltp: number;
        change?: number;
        changePercent?: number;
        high?: number;
        low?: number;
        open?: number;
        prevClose?: number;
        timestamp?: number;
      };
      cachedAt: number;
    }
  >();

  /**
   * Generates the FYERS OAuth login URL
   */
  static generateLoginUrl(appId: string, redirectUri: string, state: string): string {
    return `${this.FYERS_API_BASE}/generate-authcode?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  /**
   * Exchanges an authorization code for a daily access token using SHA-256 hash of appId:secretKey
   */
  static async validateAuthCode(
    appId: string,
    secretKey: string,
    authCode: string
  ): Promise<IBrokerAuthTokens & { clientId?: string; clientName?: string }> {
    const cleanAppId = appId.trim();
    const cleanSecret = secretKey.trim();
    const cleanCode = authCode.trim();

    const combined = `${cleanAppId}:${cleanSecret}`;
    const appIdHash = crypto.createHash('sha256').update(combined).digest('hex');

    const res = await fetch(`${this.FYERS_API_BASE}/validate-authcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash,
        code: cleanCode,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok' || !data.access_token) {
      const errDetails = data.message || `Code: ${data.code || res.status}`;
      throw new Error(`FYERS Authentication Rejected: ${errDetails}`);
    }

    let clientId: string | undefined = data.client_id;
    let clientName: string | undefined;

    // Fetch authentic profile immediately using the validated access token
    try {
      const profile = await this.fetchProfile(cleanAppId, data.access_token);
      if (profile?.fy_id) {
        clientId = profile.fy_id;
        clientName = profile.name;
      }
    } catch {
      clientId = clientId || cleanAppId.split('-')[0];
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: getNextFyersTokenExpiry().toISOString(),
      clientId: clientId || cleanAppId.split('-')[0] || undefined,
      clientName,
    };
  }

  /**
   * Fetches authentic FYERS profile details to retrieve the genuine user client ID (fy_id) and account name.
   */
  static async fetchProfile(
    appId: string,
    accessToken: string
  ): Promise<{ fy_id: string; name: string; email_id?: string }> {
    const res = await fetch(`${this.FYERS_API_BASE}/profile`, {
      method: 'GET',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok' || !data.data) {
      throw new Error(
        data.message || `Failed to fetch FYERS profile (code: ${data.code || res.status})`
      );
    }

    return {
      fy_id: data.data.fy_id,
      name: data.data.name,
      email_id: data.data.email_id,
    };
  }

  /**
   * Fetches normalized FYERS funds data using the v3 funds endpoint.
   */
  static async fetchFunds(appId: string, accessToken: string): Promise<IFyersFundsResult> {
    const res = await fetch(`${this.FYERS_API_BASE}/funds`, {
      method: 'GET',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(
        data.message || `Failed to fetch FYERS funds (code: ${data.code || res.status})`
      );
    }

    return normalizeFyersFunds(data.fund_limit || []);
  }

  /**
   * Synchronizes live FYERS funds for a specific account or user's linked/primary FYERS account,
   * stores an immutable BrokerFundsSnapshot, and creates a pending reconciliation adjustment if drifted.
   */
  static async syncFundsForAccount(
    accountId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<{
    account: any;
    snapshot: any;
    currentBalance: number;
    brokerBalance: number;
    drift: number;
    tolerance: number;
    suggestionCreated: boolean;
    skipReason?: string;
    pendingTransaction: any;
  }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const accId = typeof accountId === 'string' ? new mongoose.Types.ObjectId(accountId) : accountId;

    const account = await TradingAccount.findOne({
      _id: accId,
      userId: uId,
    });
    if (!account) {
      throw new Error('Account not found');
    }

    const integration = await BrokerIntegration.findOne({
      userId: uId,
      broker: 'FYERS',
    });
    if (!integration || !integration.appId || !integration.accessToken) {
      throw new Error('FYERS session is missing or expired. Reconnect FYERS.');
    }

    const tokenExpiry = integration.tokenExpiresAt || integration.authCodeExpiresAt;
    if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
      throw new Error('FYERS daily session has expired. Reconnect FYERS to authorize today.');
    }

    let accessToken: string;
    try {
      accessToken = decryptSecret(integration.accessToken) as string;
    } catch {
      throw new Error('FYERS session could not be decrypted. Please reconnect FYERS.');
    }

    // Refresh authentic client ID if missing or matching app-id prefix
    if (!integration.clientId || integration.clientId === integration.appId.split('-')[0]) {
      try {
        const profile = await this.fetchProfile(integration.appId, accessToken);
        if (profile?.fy_id) {
          integration.clientId = profile.fy_id;
          await integration.save();
        }
      } catch {
        // Continue even if profile endpoint is temporarily unreachable
      }
    }

    const effectiveClientId = integration.clientId || integration.appId.split('-')[0] || 'FYERS';

    // Auto-link account if not linked or if broker matches FYERS
    if (!account.brokerLink || !account.brokerLink.clientId) {
      account.brokerLink = {
        broker: 'FYERS',
        clientId: effectiveClientId,
        linkedAt: new Date(),
      };
      await account.save();
    }

    if (!integration.linkedAccountId) {
      integration.linkedAccountId = account._id;
      await integration.save();
    }

    const funds = await this.fetchFunds(integration.appId, accessToken);
    const fetchedAt = new Date(funds.snapshot.fetchedAt);

    const snapshot = await BrokerFundsSnapshot.create({
      userId: uId,
      accountId: account._id,
      broker: 'FYERS',
      clientId: account.brokerLink.clientId,
      fetchedAt,
      totalBalance: mongoose.Types.Decimal128.fromString(
        funds.exact.totalBalance.toFixed(2)
      ),
      clearBalance: mongoose.Types.Decimal128.fromString(
        funds.exact.clearBalance.toFixed(2)
      ),
      availableBalance: mongoose.Types.Decimal128.fromString(
        funds.exact.availableBalance.toFixed(2)
      ),
      realizedPnL: mongoose.Types.Decimal128.fromString(
        funds.exact.realizedPnL.toFixed(2)
      ),
      utilizedAmount: mongoose.Types.Decimal128.fromString(
        funds.exact.utilizedAmount.toFixed(2)
      ),
      fundLimits: funds.exact.fundLimits.map((limit) => ({
        id: limit.id,
        title: limit.title,
        equityAmount: mongoose.Types.Decimal128.fromString(
          limit.equityAmount.toFixed(2)
        ),
        commodityAmount: mongoose.Types.Decimal128.fromString(
          limit.commodityAmount.toFixed(2)
        ),
      })),
    });

    const currentBalance = new Decimal(account.currentBalance.toString());
    const brokerBalance = funds.exact.clearBalance;
    const drift = brokerBalance.minus(currentBalance);
    const tolerance = new Decimal(config.fyersFundsDriftTolerance);

    const openOrPlannedTrades = await Trade.countDocuments({
      userId: uId,
      accountId: account._id,
      status: { $in: ['OPEN', 'PLANNED'] },
    });

    let pendingTransaction = await AccountTransaction.findOne({
      userId: uId,
      accountId: account._id,
      source: 'BROKER_SYNC',
      status: 'PENDING_REVIEW',
    }).sort({ createdAt: -1 });

    let suggestionCreated = false;
    let skipReason: string | undefined;

    if (drift.abs().lte(tolerance)) {
      skipReason = 'WITHIN_TOLERANCE';
    } else if (openOrPlannedTrades > 0) {
      skipReason = 'OPEN_OR_PLANNED_TRADES';
    } else if (!pendingTransaction) {
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(
          [
            'fyers-funds',
            account._id.toString(),
            account.brokerLink.clientId,
            fetchedAt.toISOString().slice(0, 10),
            brokerBalance.toFixed(2),
            currentBalance.toFixed(2),
          ].join('|')
        )
        .digest('hex');

      const existingForKey = await AccountTransaction.findOne({
        userId: uId,
        accountId: account._id,
        idempotencyKey,
      });

      if (existingForKey) {
        pendingTransaction =
          existingForKey.status === 'PENDING_REVIEW' ? existingForKey : null;
        skipReason = 'ALREADY_REVIEWED_FOR_THIS_DRIFT';
      } else {
        pendingTransaction = await AccountTransaction.create({
          userId: uId,
          accountId: account._id,
          type: 'ADJUSTMENT',
          amount: mongoose.Types.Decimal128.fromString(drift.toFixed(2)),
          currency: account.baseCurrency,
          date: fetchedAt,
          notes: `FYERS Clear Balance ₹${brokerBalance.toFixed(2)} vs SetupMint ₹${currentBalance.toFixed(2)} (drift ₹${drift.toFixed(2)})`,
          source: 'BROKER_SYNC',
          status: 'PENDING_REVIEW',
          idempotencyKey,
        });
        suggestionCreated = true;
      }
    } else {
      skipReason = 'PENDING_REVIEW_EXISTS';
    }

    integration.lastFundsSyncAt = new Date();
    integration.set('fundsSyncError', undefined);
    await integration.save();

    return {
      account,
      snapshot,
      currentBalance: currentBalance.toNumber(),
      brokerBalance: brokerBalance.toNumber(),
      drift: drift.toNumber(),
      tolerance: tolerance.toNumber(),
      suggestionCreated,
      skipReason,
      pendingTransaction,
    };
  }

  /**
   * Finds or creates user's FYERS trading account and performs live funds synchronization.
   */
  static async syncFundsForUser(
    userId: string | mongoose.Types.ObjectId
  ): Promise<any> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    if (!integration || !integration.appId || !integration.accessToken) {
      throw new Error('FYERS broker is not connected or session has expired.');
    }

    let account = integration.linkedAccountId
      ? await TradingAccount.findOne({ _id: integration.linkedAccountId, userId: uId })
      : null;

    if (!account) {
      account = await TradingAccount.findOne({
        userId: uId,
        $or: [
          { broker: 'FYERS' },
          { broker: new RegExp('^fyers$', 'i') },
          { name: 'FYERS Trading Account' },
          { name: new RegExp('^FYERS', 'i') },
        ],
      });
    }

    if (!account) {
      account = await TradingAccount.create({
        userId: uId,
        name: 'FYERS Trading Account',
        broker: 'FYERS',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: mongoose.Types.Decimal128.fromString('0.00'),
        currentBalance: mongoose.Types.Decimal128.fromString('0.00'),
        realizedPnL: mongoose.Types.Decimal128.fromString('0.00'),
        brokerLink: {
          broker: 'FYERS',
          clientId: integration.clientId || integration.appId.split('-')[0] || 'FYERS',
          linkedAt: new Date(),
        },
      });
      integration.linkedAccountId = account._id;
      await integration.save();
    }

    return this.syncFundsForAccount(account._id, uId);
  }

  /**
   * Queries the FYERS Tradebook API for current-day executions
   */
  static async fetchTradebook(appId: string, accessToken: string): Promise<IFyersExecutionRaw[]> {
    const res = await fetch(`${this.FYERS_API_BASE}/tradebook`, {
      method: 'GET',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(data.message || `Failed to fetch FYERS tradebook (code: ${data.code || res.status})`);
    }

    return (data.tradeBook || []) as IFyersExecutionRaw[];
  }

  /**
   * Queries the FYERS Orderbook API for current-day orders
   */
  static async fetchOrderbook(appId: string, accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.FYERS_API_BASE}/orders`, {
      method: 'GET',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(data.message || `Failed to fetch FYERS orderbook (code: ${data.code || res.status})`);
    }

    return (data.orderBook || []) as any[];
  }

  /**
   * Normalizes raw FYERS orderbook entries into standardized INormalizedOrderbookRow items
   */
  static normalizeOrderbook(rawOrders: any[]): INormalizedOrderbookRow[] {
    if (!Array.isArray(rawOrders)) return [];
    return rawOrders.map((ord: any) => ({
      orderId: String(ord.id || ord.orderNumber || ''),
      symbol: String(ord.symbol || ''),
      side: ord.side, // 1 for BUY, -1 for SELL
      orderType: Number(ord.type),
      stopPrice: Number(ord.stopPrice || 0),
      price: ord.price ? Number(ord.price) : undefined,
      quantity: Number(ord.qty ?? ord.quantity ?? ord.filledQty ?? 0),
      status: ord.status,
      orderDateTime: parseFyersDateTime(ord.orderDateTime),
      productType: ord.productType,
      message: ord.message,
    }));
  }

  /**
   * Matches Stop Loss orders from normalized orderbook and populates initialStopLoss,
   * initialStopSource, realizedRMultiple, and auditLog on trade.
   * If matched order has modifications, automatically updates stop-moves.
   * If ambiguous, sets review reason.
   */
  static applySLOrderMatchingToTrade(
    trade: any,
    normalizedOrders: INormalizedOrderbookRow[],
    meta: {
      cleanSymbol?: string;
      formattedSymbol?: string;
      underlyingSymbol?: string;
      multiplier?: number;
      tickSize?: number;
    }
  ): { applied: boolean; confidence: string; initialStop?: number; reason?: string } {
    // Never overwrite an existing stop (e.g. entered manually)
    if (trade.risk?.initialStopLoss != null && Number(trade.risk.initialStopLoss) > 0) {
      return { applied: false, confidence: 'ALREADY_SET', initialStop: trade.risk.initialStopLoss };
    }

    const avgEntry = trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0;
    const totalQty = trade.simpleExecution?.quantity ?? trade.calculated?.closedQuantity ?? trade.calculated?.openQuantity ?? 0;
    const multiplier = meta.multiplier ?? trade.simpleExecution?.contractMultiplier ?? 1;

    const matchResult = matchSLOrderFromOrderbook(
      {
        symbol: trade.symbol,
        cleanSymbol: meta.cleanSymbol,
        formattedSymbol: meta.formattedSymbol,
        underlying: meta.underlyingSymbol || trade.underlying,
        direction: trade.direction,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        entryPrice: avgEntry,
        entryQty: totalQty,
        fills: trade.fills?.map((f: any) => ({
          type: f.type,
          price: f.price,
          quantity: f.quantity,
          timestamp: f.timestamp,
        })),
        tickSize: meta.tickSize || 0.05,
      },
      normalizedOrders
    );

    if (matchResult.confidence === 'HIGH' && matchResult.initialStop) {
      trade.risk = trade.risk || {};
      trade.risk.initialStopLoss = matchResult.initialStop;
      trade.risk.initialStopSource = 'BROKER_ORDERBOOK';
      trade.risk.slReviewReason = undefined;
      trade.risk.slReviewCandidates = undefined;

      // Recompute planned risk and realized R-multiple
      if (avgEntry > 0) {
        const dist = Math.abs(avgEntry - matchResult.initialStop);
        const plannedRisk = dist * totalQty * multiplier;
        trade.risk.estimatedRiskAmount = plannedRisk;
        const isClosed = trade.status === 'CLOSED' || (trade as any).isFullyClosed;
        if (isClosed) {
          const netPnL = trade.calculated?.netPnL ?? 0;
          const realizedR = calculateRealizedRMultiple(netPnL, plannedRisk);
          trade.risk.realizedRMultiple = realizedR;
          if (trade.calculated) {
            trade.calculated.realizedRMultiple = realizedR;
          }
        } else {
          // Open trades do not have a realized R-multiple yet (unrealized R is calculated live)
          trade.risk.realizedRMultiple = undefined;
          if (trade.calculated) {
            trade.calculated.realizedRMultiple = undefined;
          }
        }
      }

      trade.auditLog = trade.auditLog || [];
      trade.auditLog.push({
        action: 'SL_AUTO_FILLED',
        timestamp: new Date(),
        changedBy: 'system',
        details: {
          orderId: matchResult.matchedOrderId,
          finalStatus: matchResult.finalStatus,
          source: 'BROKER_ORDERBOOK',
          initialStopLoss: matchResult.initialStop,
        },
      });

      // Stop-move detection for matched order modifications
      if (matchResult.orderModifications && matchResult.orderModifications.length > 0) {
        const smResult = detectStopMoves({
          direction: trade.direction,
          entryPrice: avgEntry,
          initialStopLoss: matchResult.initialStop,
          modifications: matchResult.orderModifications,
        });

        trade.stopLossMoveEvents = smResult.moves.map((m: any) => ({
          previousStop: m.previousStop,
          newStop: m.newStop,
          changePoints: m.changePoints,
          changePercent: m.changePercent,
          moveType: m.moveType,
          movedAt: moment(m.movedAt).toDate(),
          orderId: m.orderId,
          orderType: m.orderType,
          reason: m.reason,
        }));

        trade.calculated = trade.calculated || {};
        trade.calculated.stopMoveSummary = {
          totalMoves: smResult.summary.totalMoves,
          widenedCount: smResult.summary.widenedCount,
          trailedCount: smResult.summary.trailedCount,
          initialStop: smResult.summary.initialStop,
          finalStop: smResult.summary.finalStop,
          netRiskChangePoints: smResult.summary.netRiskChangePoints,
          hasWidenedRisk: smResult.summary.hasWidenedRisk,
          detectedAt: new Date(),
        };

        if (smResult.summary.hasWidenedRisk) {
          trade.psychology = trade.psychology || {};
          trade.psychology.stopLossMoved = true;
          trade.psychology.mistakes = trade.psychology.mistakes || [];
          if (!trade.psychology.mistakes.includes('STOP_MOVED')) {
            trade.psychology.mistakes.push('STOP_MOVED');
          }
        }
      }

      return { applied: true, confidence: 'HIGH', initialStop: matchResult.initialStop };
    }

    if (matchResult.confidence === 'AMBIGUOUS') {
      trade.risk = trade.risk || {};
      trade.risk.slReviewReason = 'SL ambiguous - confirm';
      trade.risk.slReviewCandidates = matchResult.candidates;

      trade.auditLog = trade.auditLog || [];
      trade.auditLog.push({
        action: 'SL_MATCH_AMBIGUOUS',
        timestamp: new Date(),
        changedBy: 'system',
        details: {
          reason: 'SL ambiguous - confirm',
          candidates: matchResult.candidates,
        },
      });

      return { applied: false, confidence: 'AMBIGUOUS', reason: matchResult.ambiguityReason };
    }

    return { applied: false, confidence: 'NONE' };
  }

  /**
   * Synchronizes trades from FYERS into SetupMint journal with automatic FIFO pairing, statutory fee calculation, and deduplication
   */
  static async syncTradesForUser(userId: string | mongoose.Types.ObjectId): Promise<IFyersSyncResult> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    if (!integration || !integration.appId || !integration.accessToken) {
      throw new Error('FYERS broker is not connected or session has expired. Please authenticate first.');
    }

    const appId = integration.appId;
    let accessToken: string;
    try {
      accessToken = decryptSecret(integration.accessToken) as string;
    } catch {
      throw new Error('FYERS session could not be decrypted. Please reconnect FYERS.');
    }

    integration.status = 'SYNCING';
    await integration.save();

    let executions: IFyersExecutionRaw[] = [];
    try {
      executions = await this.fetchTradebook(appId, accessToken);
    } catch (err: any) {
      integration.status = 'ERROR';
      integration.syncHistory.unshift({
        timestamp: new Date(),
        status: 'FAILED',
        syncedCount: 0,
        reconciledCount: 0,
        error: err.message || 'Tradebook fetch error',
      });
      await integration.save();
      throw err;
    }

    // Fetch FYERS current-day orderbook once per sync (fail-safe: orderbook errors never abort sync)
    let rawOrderbook: any[] = [];
    try {
      rawOrderbook = await this.fetchOrderbook(appId, accessToken);
    } catch (obErr: any) {
      console.warn('[FYERS Sync] Orderbook fetch failed; proceeding without SL matching:', obErr?.message || obErr);
    }
    const normalizedOrders = this.normalizeOrderbook(rawOrderbook);

    // Prefer the account explicitly linked to this FYERS client.
    let account = integration.linkedAccountId
      ? await TradingAccount.findOne({
          _id: integration.linkedAccountId,
          userId: uId,
        })
      : null;

    if (!account) {
      account = await TradingAccount.findOne({
        userId: uId,
        $or: [
          { broker: 'FYERS' },
          { broker: new RegExp('^fyers$', 'i') },
          { name: 'FYERS Trading Account' },
          { name: new RegExp('^FYERS', 'i') },
        ],
      });
    }

    if (account) {
      if (account.status === 'ARCHIVED') {
        account.status = 'ACTIVE';
        await account.save();
      }
    } else {
      let candidateName = 'FYERS Trading Account';
      let count = 1;
      while (await TradingAccount.findOne({ userId: uId, name: candidateName })) {
        candidateName = `FYERS Trading Account ${++count}`;
      }

      account = await TradingAccount.create({
        userId: uId,
        name: candidateName,
        broker: 'FYERS',
        accountNumber: `FY-${appId.split('-')[0] || 'LIVE'}`,
        baseCurrency: 'INR',
        initialBalance: mongoose.Types.Decimal128.fromString('500000'),
        currentBalance: mongoose.Types.Decimal128.fromString('500000'),
        status: 'ACTIVE',
      });
    }

    if (executions.length === 0) {
      integration.status = 'CONNECTED';
      integration.lastSyncAt = new Date();
      integration.syncHistory.unshift({
        timestamp: new Date(),
        status: 'SUCCESS',
        syncedCount: 0,
        reconciledCount: 0,
      });
      await integration.save();

      return {
        syncedTradesCount: 0,
        duplicateTradesCount: 0,
        totalExecutions: 0,
        accountId: account._id.toString(),
        accountName: account.name,
        lastSyncAt: integration.lastSyncAt,
      };
    }

    // Group executions by clean symbol
    const executionsBySymbol = new Map<string, Array<{
      raw: IFyersExecutionRaw;
      index: number;
      timestamp: Date;
      direction: 'LONG' | 'SHORT';
      price: number;
      quantity: number;
      meta: ReturnType<typeof parseFyersSymbol>;
    }>>();

    for (let i = 0; i < executions.length; i++) {
      const raw = executions[i];
      const meta = parseFyersSymbol(raw.symbol);
      const timestamp = parseFyersDateTime(raw.orderDateTime);
      const direction = raw.side === 1 ? 'LONG' : 'SHORT';
      const list = executionsBySymbol.get(meta.cleanSymbol) || [];
      list.push({
        raw,
        index: i,
        timestamp,
        direction,
        price: Number(raw.tradePrice),
        quantity: Number(raw.tradedQty),
        meta,
      });
      executionsBySymbol.set(meta.cleanSymbol, list);
    }

    let syncedTradesCount = 0;
    let duplicateTradesCount = 0;
    const closedTradeIds = new Set<string>();
    const batchId = `fyers_sync_${Date.now()}`;

    // For each symbol, match fills chronologically via FIFO
    for (const [cleanSymbol, execList] of executionsBySymbol.entries()) {
      execList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.index - b.index);
      const sample = execList[0];
      const {
        exchange,
        marketSegment,
        assetClass,
        underlying,
        formattedSymbol,
        optionType,
        strikePrice,
        expiryDate,
        isDerivative,
      } = sample.meta;

      // 1. Dynamic instrument resolution: Ensure underlying exists in user's instruments
      const inst = await InstrumentService.ensureForTrade(uId, {
        symbol: underlying,
        assetClass,
        exchange,
        marketSegment,
        currency: account.baseCurrency,
      });

      // 2. Fully dynamic contract multiplier from user's instrument
      const multiplier = inst?.contractMultiplier || 1;

      // 3. Descriptive formatted title
      const tradeTitle = isDerivative
        ? optionType && strikePrice
          ? `${strikePrice} ${optionType === 'CALL' ? 'CE' : 'PE'}`
          : (inst.displayName || underlying)
        : (inst.displayName || underlying);

      interface ActiveGroup {
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

      let currentGroup: ActiveGroup | null = null;

      const makeFillId = (execItem: { raw: IFyersExecutionRaw; price: number; quantity: number; timestamp: Date }): string => {
        if (execItem.raw.tradeNumber) return String(execItem.raw.tradeNumber).trim();
        if (execItem.raw.orderNumber) {
          return `${execItem.raw.orderNumber}-${execItem.price}-${execItem.quantity}-${execItem.timestamp.getTime()}`;
        }
        return `fyer_${cleanSymbol}_${execItem.price}_${execItem.quantity}_${execItem.timestamp.getTime()}`;
      };

      const commitTrade = async (grp: ActiveGroup) => {
        try {
          const fifoSummary = calculateFIFOExecution(
            grp.direction,
            grp.fills.map((f) => ({
              fillId: f.fillId,
              type: f.type,
              price: f.price,
              quantity: f.quantity,
              timestamp: f.timestamp.toISOString(),
            })),
            multiplier
          );

          const avgEntry = fifoSummary.weightedAvgEntryPrice.toNumber();
          const avgExit = fifoSummary.weightedAvgExitPrice ? fifoSummary.weightedAvgExitPrice.toNumber() : undefined;
          const closedQty = fifoSummary.closedQuantity.toNumber();
          const tradeDate = grp.entryTime;
          const totalTradeQty = grp.fills.filter((f) => f.type === 'ENTRY').reduce((sum, f) => sum + f.quantity, 0);

          // Calculate Indian Statutory Charges with FYERS Flat ₹20 Brokerage
          const charges = calculateIndianCharges({
            assetClass,
            marketSegment,
            entryPrice: avgEntry,
            exitPrice: avgExit,
            quantity: totalTradeQty,
            contractMultiplier: multiplier,
            broker: 'FYERS',
          });

          const grossPnL = fifoSummary.realizedGrossPnL.toNumber();
          const netPnL = grossPnL - charges.totalCosts;
          const lastExitFill = grp.fills.filter((f) => f.type === 'EXIT').slice(-1)[0];
          const exitTime = lastExitFill ? lastExitFill.timestamp : undefined;

          const fillIdsToMatch = grp.fills.map((f) => f.fillId).filter(Boolean);

          // Robust Idempotency Check:
          // 1. Primary: Match on unique execution fill IDs (survives user updates, date changes, strategy tagging, account reassignments)
          // 2. Secondary fallback: Match on symbol (clean, formatted, or raw), direction, entry price, and tight time window (+/- 5 min)
          const matchClauses: any[] = [];
          if (fillIdsToMatch.length > 0) {
            matchClauses.push({ 'fills.fillId': { $in: fillIdsToMatch } });
          }
          matchClauses.push({
            symbol: { $in: [cleanSymbol, formattedSymbol, sample.raw.symbol] },
            direction: grp.direction,
            'simpleExecution.entryPrice': avgEntry,
            entryTime: {
              $gte: new Date(grp.entryTime.getTime() - 5 * 60 * 1000),
              $lte: new Date(grp.entryTime.getTime() + 5 * 60 * 1000),
            },
          });

          const existing = await Trade.findOne({
            userId: uId,
            $or: matchClauses,
          });

          if (existing) {
            let updated = false;
            if (!existing.instrumentId || existing.instrumentId.toString() !== inst._id.toString()) {
              existing.instrumentId = inst._id;
              updated = true;
            }
            if (!existing.underlying || existing.underlying !== inst.symbol) {
              existing.underlying = inst.symbol;
              updated = true;
            }
            if (!existing.instrumentName || existing.instrumentName !== inst.displayName) {
              existing.instrumentName = inst.displayName;
              updated = true;
            }
            if (inst.symbol && existing.symbol !== inst.symbol) {
              existing.symbol = inst.symbol;
              updated = true;
            }
            if (tradeTitle && (!existing.tradeTitle || existing.tradeTitle === cleanSymbol || existing.tradeTitle === sample.raw.symbol)) {
              existing.tradeTitle = tradeTitle;
              updated = true;
            }
            if (optionType && !existing.optionType) {
              existing.optionType = optionType;
              updated = true;
            }
            if (strikePrice && !existing.strikePrice) {
              existing.strikePrice = strikePrice;
              updated = true;
            }
            if (expiryDate && !existing.expiryDate) {
              existing.expiryDate = expiryDate;
              updated = true;
            }

            // If existing trade was OPEN and the new sync data has closed it, or added new fills:
            const hasNewFills = grp.fills.length !== (existing.fills?.length || 0);
            const isClosing = existing.status === 'OPEN' && fifoSummary.isFullyClosed;

            if (isClosing || (existing.status === 'OPEN' && hasNewFills) || (existing.status === 'CLOSED' && hasNewFills)) {
              existing.status = fifoSummary.isFullyClosed ? 'CLOSED' : 'OPEN';
              existing.exitTime = exitTime;
              existing.simpleExecution = {
                contractMultiplier: multiplier,
                entryPrice: avgEntry,
                exitPrice: avgExit,
                quantity: totalTradeQty,
                brokerage: charges.brokerage,
                exchangeFees: charges.exchangeFees,
                regulatoryFees: charges.regulatoryFees,
                taxes: charges.taxes,
                otherFees: existing.simpleExecution?.otherFees || 0,
                explicitAdjustments: existing.simpleExecution?.explicitAdjustments || 0,
              };

              existing.fills = grp.fills.map((f) => ({
                fillId: f.fillId,
                timestamp: f.timestamp,
                type: f.type,
                price: f.price,
                quantity: f.quantity,
                fee: 0,
              })) as any;

              if (!existing.calculated) {
                existing.calculated = {} as any;
              }
              existing.calculated.averageEntryPrice = avgEntry;
              existing.calculated.averageExitPrice = avgExit;
              existing.calculated.closedQuantity = closedQty;
              existing.calculated.openQuantity = fifoSummary.openQuantity.toNumber();
              existing.calculated.totalCosts = charges.totalCosts;
              existing.calculated.grossPnL = grossPnL;
              existing.calculated.netPnL = netPnL;

              // When partially exiting an open position, adjust peak MFE to reflect current remaining open quantity
              if (!fifoSummary.isFullyClosed && existing.calculated.liveMfeSummary && totalTradeQty > 0) {
                const openRatio = fifoSummary.openQuantity.toNumber() / totalTradeQty;
                const prevPeakNet = existing.calculated.liveMfeSummary.peakFloatingNetPnL || 0;
                // Re-scale recorded peak MTM to remaining open quantity
                existing.calculated.liveMfeSummary.peakFloatingNetPnL = Number((prevPeakNet * openRatio).toFixed(2));
              }
              if (exitTime) {
                existing.calculated.holdingTimeMinutes = Math.max(
                  0,
                  Math.round((exitTime.getTime() - grp.entryTime.getTime()) / (1000 * 60))
                );
              }
              existing.calculated.outcome = !fifoSummary.isFullyClosed
                ? 'OPEN'
                : netPnL > 0
                ? 'WIN'
                : netPnL < 0
                ? 'LOSS'
                : 'BREAKEVEN';

              // Check for modified resting Stop Loss on open positions
              if (!fifoSummary.isFullyClosed && normalizedOrders && normalizedOrders.length > 0) {
                const isShort = existing.direction === 'SHORT';
                const expectedSide = isShort ? 1 : -1;
                const restingOrder = normalizedOrders.find((o: any) => {
                  if (o.status !== 6 && o.status !== 4) return false;
                  if (o.side !== expectedSide) return false;
                  const match = o.symbol === formattedSymbol || o.symbol === existing.symbol || (o.symbol && o.symbol.includes(existing.underlying));
                  return match && (o.orderType === 4 || o.orderType === 3 || Number(o.stopPrice || 0) > 0);
                });
                if (restingOrder && Number(restingOrder.stopPrice || restingOrder.price) > 0) {
                  const currentSl = Number(restingOrder.stopPrice || restingOrder.price);
                  if (existing.risk?.currentStopLoss !== currentSl) {
                    existing.risk = existing.risk || {};
                    existing.risk.currentStopLoss = currentSl;
                    existing.markModified('risk');
                  }
                }
              }

              // If existing trade has no initial stop loss, attempt to auto-fill from orderbook
              if (!existing.risk?.initialStopLoss) {
                this.applySLOrderMatchingToTrade(existing, normalizedOrders, {
                  cleanSymbol,
                  formattedSymbol,
                  underlyingSymbol: inst.symbol,
                  multiplier,
                  tickSize: inst.tickSize,
                });
                existing.markModified('risk');
                existing.markModified('stopLossMoveEvents');
                existing.markModified('psychology');
                existing.markModified('auditLog');
              } else if (fifoSummary.isFullyClosed) {
                // If trade is now closed and has a resting SL/planned risk, calculate final realized R
                const riskAmt = existing.risk.estimatedRiskAmount || existing.risk.plannedRiskAmount;
                if (riskAmt && riskAmt > 0) {
                  const realizedR = calculateRealizedRMultiple(netPnL, riskAmt);
                  existing.risk.realizedRMultiple = realizedR;
                  existing.calculated.realizedRMultiple = realizedR;
                  existing.markModified('risk');
                }
              }

              existing.markModified('calculated');
              existing.markModified('fills');
              existing.markModified('simpleExecution');

              await existing.save();
              syncedTradesCount++;
              if (fifoSummary.isFullyClosed) {
                closedTradeIds.add(existing._id.toString());
              }
              return;
            }

            if (!existing.risk?.initialStopLoss) {
              const matched = this.applySLOrderMatchingToTrade(existing, normalizedOrders, {
                cleanSymbol,
                formattedSymbol,
                underlyingSymbol: inst.symbol,
                multiplier,
                tickSize: inst.tickSize,
              });
              if (matched.applied || matched.confidence === 'AMBIGUOUS') {
                existing.markModified('risk');
                existing.markModified('calculated');
                existing.markModified('stopLossMoveEvents');
                existing.markModified('psychology');
                existing.markModified('auditLog');
                updated = true;
              }
            }

            // If existing trade was already CLOSED, check if it is missing excursion computation or setup classification
            if (existing.status === 'CLOSED') {
              const needsExcursion =
                !existing.calculated?.excursion?.status || existing.calculated?.excursion?.status === 'PENDING';
              const needsSetup =
                !existing.setup?.variantStatus || existing.setup?.variantStatus === 'UNCLASSIFIED';
              if (needsExcursion || needsSetup) {
                closedTradeIds.add(existing._id.toString());
              }
            }

            if (updated) {
              await existing.save();
            }
            duplicateTradesCount++;
            return;
          }

          const tradePayload: any = {
            userId: uId,
            accountId: account._id,
            instrumentId: inst._id,
            underlying: inst.symbol,
            instrumentName: inst.displayName,
            symbol: inst.symbol,
            tradeTitle,
            optionType,
            strikePrice,
            expiryDate,
            assetClass,
            exchange,
            marketSegment,
            currency: account.baseCurrency,
            direction: grp.direction,
            status: fifoSummary.isFullyClosed ? 'CLOSED' : 'OPEN',
            tradeDate,
            entryTime: grp.entryTime,
            exitTime,
            tags: ['FYERS_AUTO_SYNC'],
            importBatchId: batchId,
            executionMode: 'ADVANCED',
            simpleExecution: {
              contractMultiplier: multiplier,
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
            fills: grp.fills.map((f) => ({
              fillId: f.fillId,
              timestamp: f.timestamp,
              type: f.type,
              price: f.price,
              quantity: f.quantity,
              fee: 0,
            })),
            risk: {
              riskRuleViolations: [],
            },
            calculated: {
              averageEntryPrice: avgEntry,
              averageExitPrice: avgExit,
              closedQuantity: closedQty,
              openQuantity: fifoSummary.openQuantity.toNumber(),
              totalCosts: charges.totalCosts,
              grossPnL,
              netPnL,
              outcome: !fifoSummary.isFullyClosed
                ? 'OPEN'
                : netPnL > 0
                ? 'WIN'
                : netPnL < 0
                ? 'LOSS'
                : 'BREAKEVEN',
            },
          };

          this.applySLOrderMatchingToTrade(tradePayload, normalizedOrders, {
            cleanSymbol,
            formattedSymbol,
            underlyingSymbol: inst.symbol,
            multiplier,
            tickSize: inst.tickSize,
          });

          const createdTrade = await Trade.create(tradePayload);

          if (fifoSummary.isFullyClosed) {
            closedTradeIds.add(createdTrade._id.toString());
          }

          syncedTradesCount++;
        } catch (e) {
          console.error('[FYERS Sync] Error committing trade to journal:', e);
        }
      };

      for (const exec of execList) {
        if (!currentGroup) {
          currentGroup = {
            direction: exec.direction,
            fills: [
              {
                fillId: makeFillId(exec),
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
          const isSameDirection = exec.direction === currentGroup.direction;
          if (isSameDirection) {
            // Scaling into existing position
            currentGroup.fills.push({
              fillId: makeFillId(exec),
              type: 'ENTRY',
              price: exec.price,
              quantity: exec.quantity,
              timestamp: exec.timestamp,
            });
            currentGroup.openQuantity += exec.quantity;
          } else {
            // Exiting position
            if (exec.quantity <= currentGroup.openQuantity) {
              currentGroup.fills.push({
                fillId: makeFillId(exec),
                type: 'EXIT',
                price: exec.price,
                quantity: exec.quantity,
                timestamp: exec.timestamp,
              });
              currentGroup.openQuantity -= exec.quantity;

              if (currentGroup.openQuantity === 0) {
                await commitTrade(currentGroup);
                currentGroup = null;
              }
            } else {
              // Position reversal: split into exit fill and new reversed entry fill
              const closingQty: number = currentGroup.openQuantity;
              const remainingQty: number = exec.quantity - closingQty;

              currentGroup.fills.push({
                fillId: makeFillId(exec),
                type: 'EXIT',
                price: exec.price,
                quantity: closingQty,
                timestamp: exec.timestamp,
              });
              currentGroup.openQuantity = 0;
              await commitTrade(currentGroup);

              // Open new group for reversed position
              currentGroup = {
                direction: exec.direction,
                fills: [
                  {
                    fillId: `${makeFillId(exec)}-rev`,
                    type: 'ENTRY',
                    price: exec.price,
                    quantity: remainingQty,
                    timestamp: exec.timestamp,
                  },
                ],
                openQuantity: remainingQty,
                entryTime: exec.timestamp,
              };
            }
          }
        }
      }

      // If position is still open at end of executions
      if (currentGroup && currentGroup.fills.length > 0) {
        await commitTrade(currentGroup);
      }
    }

    // Recalculate account balance
    if (syncedTradesCount > 0) {
      await AccountService.recalculateAccountBalances(account._id, uId);
    }

    // Automated post-close backfill pipeline for closed trades:
    // 1. Orderbook SL & stop move detection
    // 2. 1m/5m historical excursion (MFE, MAE, R left on table, exit efficiency)
    // 3. Strategy setup variant pattern recognition (4H trend + 5M setup)
    // 4. Multi-resolution SVG chart snapshot attachments
    const closedTradeList = Array.from(closedTradeIds);
    let backfilledClosedTradesCount = 0;

    if (closedTradeList.length > 0) {
      // Synchronously backfill the primary batch (up to 10 trades) at the time of trade fetch
      const inlineBatch = closedTradeList.slice(0, 10);
      for (const tId of inlineBatch) {
        try {
          await this.backfillSingleClosedTrade(tId, uId, { normalizedOrders });
          backfilledClosedTradesCount++;

          // Send Telegram Trade Closed notification
          const closedDoc = await Trade.findById(tId).lean();
          if (closedDoc && closedDoc.calculated) {
            const userDoc = await User.findById(uId).lean();
            if (userDoc) {
              TelegramAlertService.notifyTradeClosed(userDoc, closedDoc, {
                netPnL: closedDoc.calculated.netPnL || 0,
                realizedR: closedDoc.calculated.realizedRMultiple,
                exitPrice: closedDoc.calculated.averageExitPrice || 0,
                exitReason: 'FYERS Broker Exit',
              }).catch(() => {});
            }
          }
        } catch (err: any) {
          console.warn(`[FYERS Sync] Auto-backfill failed for closed trade ${tId}:`, err?.message || err);
        }
      }

      // If more than 10 closed trades were returned, process remainder in background with pacing
      if (closedTradeList.length > 10) {
        const remainingBatch = closedTradeList.slice(10);
        (async () => {
          for (const tId of remainingBatch) {
            try {
              await this.backfillSingleClosedTrade(tId, uId, { normalizedOrders });
            } catch (err: any) {
              console.warn(`[FYERS Sync Background] Auto-backfill failed for trade ${tId}:`, err?.message || err);
            }
            await new Promise((r) => setTimeout(r, 220));
          }
        })().catch(() => {});
      }
    }

    integration.status = 'CONNECTED';
    integration.lastSyncAt = new Date();
    integration.syncHistory.unshift({
      timestamp: new Date(),
      status: 'SUCCESS',
      syncedCount: syncedTradesCount,
      reconciledCount: duplicateTradesCount,
    });
    if (integration.syncHistory.length > 20) {
      integration.syncHistory = integration.syncHistory.slice(0, 20);
    }
    await integration.save();

    return {
      syncedTradesCount,
      duplicateTradesCount,
      totalExecutions: executions.length,
      accountId: account._id.toString(),
      accountName: account.name,
      lastSyncAt: integration.lastSyncAt,
      backfilledClosedTradesCount,
    };
  }

  /**
   * Fetches historical OHLCV candles from FYERS data API v3 (/data/history).
   * Supports chunking up to 90 days per request for intraday, rate limit backoff,
   * and token decryption.
   */
  static async getHistoricalCandles(
    userId: string | mongoose.Types.ObjectId,
    symbol: string,
    resolution: string = '1',
    from: Date | string | number,
    to: Date | string | number
  ): Promise<ITradeCandle[]> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    if (!integration || !integration.appId || !integration.accessToken) {
      throw new Error('FYERS broker session is missing or expired. Please connect FYERS in Settings.');
    }

    const tokenExpiry = integration.tokenExpiresAt || integration.authCodeExpiresAt;
    if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
      throw new Error('FYERS daily session has expired. Reconnect FYERS to authorize today.');
    }

    let accessToken: string;
    try {
      accessToken = decryptSecret(integration.accessToken) as string;
    } catch {
      throw new Error('FYERS session could not be decrypted. Please reconnect FYERS.');
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    const cleanResolution = resolution.trim();

    const fromEpochSec = Math.floor(moment(from).valueOf() / 1000);
    const toEpochSec = Math.floor(moment(to).valueOf() / 1000);

    if (toEpochSec < fromEpochSec) {
      throw new Error('End date precedes start date');
    }

    // Historical API base URL (replace /api/v3 with /data)
    const dataApiBase = this.FYERS_API_BASE.replace(/\/api\/v3\/?$/, '') + '/data';

    // FYERS limit: up to 100 days per request for intraday resolutions (< 1D)
    const maxRangeSec = cleanResolution === 'D' || cleanResolution === '1D' ? 365 * 86400 : 90 * 86400;

    const chunks: Array<{ fromSec: number; toSec: number }> = [];
    let curFrom = fromEpochSec;
    while (curFrom <= toEpochSec) {
      const curTo = Math.min(curFrom + maxRangeSec, toEpochSec);
      chunks.push({ fromSec: curFrom, toSec: curTo });
      curFrom = curTo + 1;
    }

    const allCandles: ITradeCandle[] = [];

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      const queryParams = new URLSearchParams({
        symbol: cleanSymbol,
        resolution: cleanResolution,
        date_format: '0',
        range_from: String(chunk.fromSec),
        range_to: String(chunk.toSec),
        cont_flag: '1',
        oi_flag: '0',
      });

      const url = `${dataApiBase}/history?${queryParams.toString()}`;

      // Rate limit backoff retry loop (max 3 attempts)
      let attempts = 0;
      let success = false;

      while (attempts < 3 && !success) {
        attempts++;
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `${integration.appId}:${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (res.status === 429) {
            // Rate limited: backoff and retry
            await new Promise((r) => setTimeout(r, 600 * attempts));
            continue;
          }

          const data = (await res.json()) as any;
          if (data && data.s === 'ok' && Array.isArray(data.candles)) {
            for (const item of data.candles) {
              if (Array.isArray(item) && item.length >= 5) {
                allCandles.push({
                  t: Number(item[0]),
                  o: Number(item[1]),
                  h: Number(item[2]),
                  l: Number(item[3]),
                  c: Number(item[4]),
                  v: item[5] !== undefined ? Number(item[5]) : undefined,
                });
              }
            }
            success = true;
          } else {
            success = true; // Non-ok response (e.g. no candles for derivative)
          }
        } catch {
          if (attempts >= 3) break;
          await new Promise((r) => setTimeout(r, 400 * attempts));
        }
      }

      // Small throttle between chunk calls to respect 5 req/sec cap
      if (cIdx < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 220));
      }
    }

    // Deduplicate candles by timestamp
    const candleMap = new Map<number, ITradeCandle>();
    for (const c of allCandles) {
      candleMap.set(c.t, c);
    }
    return Array.from(candleMap.values()).sort((a, b) => a.t - b.t);
  }

  /**
   * Computes MAE/MFE and exit efficiency for a closed trade using FYERS historical candles.
   * If cached in TradeCandleSnapshot, reuses cached snapshot unless forceRefetch is true.
   */
  static async computeExcursionForTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    forceRefetch: boolean = false,
    options?: { provider?: CandleFallbackProvider }
  ): Promise<any> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const trade = await Trade.findOne({ _id: tId, userId: uId });
    if (!trade) {
      throw new Error('Trade not found or unauthorized');
    }

    if (trade.status !== 'CLOSED' || !trade.exitTime) {
      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.excursion = {
        status: 'UNAVAILABLE',
        failureReason: 'Excursion can only be calculated for closed trades',
        source: 'FYERS_HISTORY',
        computedAt: new Date(),
      };
      await trade.save();
      return trade.calculated.excursion;
    }

    // 1m resolution prioritized; fallback to 5m / D if 1m is outside lookback window
    let resolution = '1';
    let barMinutes = 1;
    let from = moment(trade.entryTime).subtract(5 * barMinutes, 'minutes').toDate();
    let to = moment(trade.exitTime).add(5 * barMinutes, 'minutes').toDate();

    let candleResult = await MarketDataService.getCandlesWithFallback({
      trade,
      resolution,
      from,
      to,
      userId: uId,
      forceRefetch,
      provider: options?.provider || 'AUTO',
    });

    // If 1m unavailable from provider, fallback to 5m, then D
    if (!candleResult.ok || !candleResult.candles || candleResult.candles.length === 0) {
      const fallbackRes = '5';
      barMinutes = 5;
      from = moment(trade.entryTime).subtract(5 * barMinutes, 'minutes').toDate();
      to = moment(trade.exitTime).add(5 * barMinutes, 'minutes').toDate();
      const res5 = await MarketDataService.getCandlesWithFallback({
        trade,
        resolution: fallbackRes,
        from,
        to,
        userId: uId,
        forceRefetch,
        provider: options?.provider || 'AUTO',
      });
      if (res5.ok && res5.candles && res5.candles.length > 0) {
        candleResult = res5;
        resolution = fallbackRes;
      } else {
        // Try Daily for swing holds
        const resD = await MarketDataService.getCandlesWithFallback({
          trade,
          resolution: 'D',
          from: moment(trade.entryTime).subtract(1, 'day').toDate(),
          to: moment(trade.exitTime).add(1, 'day').toDate(),
          userId: uId,
          forceRefetch,
          provider: options?.provider || 'AUTO',
        });
        if (resD.ok && resD.candles && resD.candles.length > 0) {
          candleResult = resD;
          resolution = 'D';
        }
      }
    }

    if (!candleResult.ok) {
      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.excursion = {
        status: 'UNAVAILABLE',
        failureReason: candleResult.message || `No candles available (${candleResult.reason})`,
        source: options?.provider === 'ANGEL_ONE' ? 'ANGEL_ONE_HISTORY' : 'FYERS_HISTORY',
        resolution,
        isLowResolution: resolution !== '1',
        excursionVersion: 2,
        thresholdVersion: 'v2',
        computedAt: new Date(),
      };
      await trade.save();
      return trade.calculated.excursion;
    }

    const candles = candleResult.candles;
    const providerUsed = candleResult.provider;
    const isUnderlyingFallback = candleResult.isUnderlyingFallback;

    // Guard: Option contracts cannot use spot underlying candles directly (e.g. NIFTY spot 23,000 vs 15.00 option premium)
    const isOptionTrade =
      trade.assetClass === 'OPTIONS' ||
      Boolean(trade.optionType) ||
      Boolean(trade.strikePrice) ||
      /(\d+(?:CE|PE))$/i.test(trade.symbol);

    if (isUnderlyingFallback && isOptionTrade) {
      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.excursion = {
        status: 'UNAVAILABLE',
        failureReason:
          'Option contract candles unavailable; cannot calculate MAE/MFE using spot underlying index without delta translation',
        source: 'UNDERLYING_FALLBACK',
        resolution,
        isLowResolution: resolution !== '1',
        isUnderlyingFallback: true,
        excursionVersion: 2,
        thresholdVersion: 'v2',
        computedAt: new Date(),
      };
      await trade.save();
      return trade.calculated.excursion;
    }

    // Retrieve user settings & instrument specs for precision
    const user = await User.findById(uId).select('patternDetectionSettings').lean();
    const excursionSettings = (user as any)?.patternDetectionSettings?.excursionSettings;

    const instrument = await Instrument.findOne({
      userId: uId,
      symbol: trade.underlying || trade.symbol,
    })
      .select('tickSize')
      .lean();

    // Compute excursion metrics using financial-engine
    const entryPrice = trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0;
    const exitPrice = trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice ?? 0;
    const quantity = trade.simpleExecution?.quantity ?? trade.calculated?.closedQuantity ?? 1;
    const contractMultiplier = trade.simpleExecution?.contractMultiplier ?? 1;
    const plannedRisk = trade.risk?.estimatedRiskAmount || trade.risk?.riskBudgetAmount || 0;

    const result = calculateExcursion({
      direction: trade.direction,
      entryPrice,
      exitPrice,
      stopLoss: trade.risk?.initialStopLoss,
      target: trade.risk?.plannedTarget,
      quantity,
      contractMultiplier,
      candles,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      plannedRiskAmount: plannedRisk > 0 ? plannedRisk : undefined,
      resolution,
      totalCharges: trade.calculated?.totalCosts,
      tickSize: instrument?.tickSize,
      settings: excursionSettings,
      tradeManagementPlan: (trade as any).tradeManagementPlan,
      hasTrailedStop: (trade.calculated?.stopMoveSummary?.trailedCount || 0) > 0,
      realizedR: trade.calculated?.realizedRMultiple,
    });

    const source =
      providerUsed === 'ANGEL_ONE'
        ? 'ANGEL_ONE_HISTORY'
        : isUnderlyingFallback
        ? 'UNDERLYING_FALLBACK'
        : 'FYERS_HISTORY';

    trade.calculated = trade.calculated || ({} as any);
    trade.calculated.excursion = {
      status: result.status,
      computedAt: new Date(),
      source,
      provider: providerUsed,
      isUnderlyingFallback,
      resolution,
      isLowResolution: result.isLowResolution,
      failureReason: result.failureReason,
      excursionVersion: result.excursionVersion,
      thresholdVersion: result.thresholdVersion,
      maePoints: result.maePoints,
      mfePoints: result.mfePoints,
      maeAmount: result.maeAmount,
      mfeAmount: result.mfeAmount,
      maeR: result.maeR,
      mfeR: result.mfeR,
      feeAdjustedMaePoints: result.feeAdjustedMaePoints,
      feeAdjustedMfePoints: result.feeAdjustedMfePoints,
      feeAdjustedMaeAmount: result.feeAdjustedMaeAmount,
      feeAdjustedMfeAmount: result.feeAdjustedMfeAmount,
      feeAdjustedMaeR: result.feeAdjustedMaeR,
      feeAdjustedMfeR: result.feeAdjustedMfeR,
      rLeftOnTable: result.rLeftOnTable,
      exitEfficiency: result.exitEfficiency,
      stopEfficiency: result.stopEfficiency,
      entryQualityScore: result.entryQualityScore,
      earlyMfePoints: result.earlyMfePoints,
      earlyMaePoints: result.earlyMaePoints,
      maeBeforeMfe: result.maeBeforeMfe,
      timeOrdering: result.timeOrdering,
      stopHit: result.stopHit,
      reversedAfterStopHit: result.reversedAfterStopHit,
      timeToMfeMinutes: result.timeToMfeMinutes,
      timeToMaeMinutes: result.timeToMaeMinutes,
      candleCount: result.candleCount,
      excursionFlags: result.excursionFlags,
      warnings: result.warnings,
    };

    await trade.save();

    // Trigger auto-chart screenshot generation if trade is closed and has candles
    try {
      const { ChartGeneratorService } = await import('./chart-generator.service.js');
      await ChartGeneratorService.createAndSaveAutoChartForTrade(trade._id, uId, {
        force: false,
        provider: options?.provider,
      });
    } catch {
      // Non-fatal if chart generation or storage fails
    }

    return trade.calculated.excursion;
  }

  /**
   * Backfills excursion analytics for closed trades in bounded batches.
   * Leverages the fallback chain (FYERS -> Angel One -> Underlying proxy).
   */
  static async batchBackfillExcursion(
    userId: string | mongoose.Types.ObjectId,
    options: {
      accountId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      provider?: CandleFallbackProvider;
      forceRecompute?: boolean;
    } = {}
  ): Promise<IExcursionBackfillResponse> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const requestedProvider = options.provider || 'AUTO';

    // Verify session validity
    const fyersIntegration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    const fyersExpiry = fyersIntegration?.tokenExpiresAt || fyersIntegration?.authCodeExpiresAt;
    const isFyersConnected = Boolean(
      fyersIntegration?.accessToken && fyersExpiry && new Date(fyersExpiry) > new Date()
    );

    const { MarketDataIntegration } = await import('../db/models/MarketDataIntegration.js');
    const angelOneDoc = await MarketDataIntegration.findOne({ userId: uId, provider: 'ANGEL_ONE' });
    const isAngelOneConnected = Boolean(
      angelOneDoc?.tokenExpiresAt && new Date(angelOneDoc.tokenExpiresAt) > new Date()
    );

    if (requestedProvider === 'ANGEL_ONE' && !isAngelOneConnected) {
      throw new Error('Angel One market data session is missing or expired. Connect Angel One in Settings.');
    } else if (requestedProvider === 'AUTO' && !isFyersConnected && !isAngelOneConnected) {
      throw new Error(
        'No market data provider (FYERS or Angel One) is connected. Connect FYERS or Angel One in Settings.'
      );
    }

    const filter: any = {
      userId: uId,
      status: 'CLOSED',
    };

    if (!options.forceRecompute) {
      filter.$or = [
        { 'calculated.excursion.status': 'PENDING' },
        { 'calculated.excursion': { $exists: false } },
        { 'calculated.excursion.status': { $exists: false } },
      ];
    }

    if (options.accountId) {
      filter.accountId = new mongoose.Types.ObjectId(options.accountId);
    }
    if (options.startDate || options.endDate) {
      filter.tradeDate = {};
      if (options.startDate) filter.tradeDate.$gte = new Date(options.startDate);
      if (options.endDate) filter.tradeDate.$lte = new Date(options.endDate);
    }

    const totalMatching = await Trade.countDocuments(filter);
    const limit = Math.min(Math.max(1, options.limit || 50), 200);

    const batch = await Trade.find(filter).sort({ tradeDate: -1 }).limit(limit);

    let computed = 0;
    let unavailable = 0;
    let failed = 0;
    let fyersFilled = 0;
    let angelOneFilled = 0;

    for (const trade of batch) {
      try {
        const res = await this.computeExcursionForTrade(trade._id, uId, false, {
          provider: requestedProvider,
        });
        if (res.status === 'COMPUTED') {
          computed++;
          if (res.provider === 'ANGEL_ONE' || res.source === 'ANGEL_ONE_HISTORY') {
            angelOneFilled++;
          } else {
            fyersFilled++;
          }
        } else if (res.status === 'UNAVAILABLE') {
          unavailable++;
        } else {
          failed++;
        }
      } catch (err: any) {
        failed++;
        trade.calculated = trade.calculated || ({} as any);
        trade.calculated.excursion = {
          status: 'FAILED',
          failureReason: err.message || 'Excursion backfill failed',
          source: requestedProvider === 'ANGEL_ONE' ? 'ANGEL_ONE_HISTORY' : 'FYERS_HISTORY',
          computedAt: new Date(),
        };
        await trade.save();
      }

      // Small delay between trade calculations to respect provider API limits
      await new Promise((r) => setTimeout(r, 200));
    }

    return {
      processed: batch.length,
      computed,
      unavailable,
      failed,
      remaining: Math.max(0, totalMatching - batch.length),
      fyersFilled,
      angelOneFilled,
    };
  }

  /**
   * Automated post-close backfill pipeline for a single closed trade:
   * 1. Detect stop-loss moves & trailing ratchet events from broker orderbook
   * 2. Compute 1m/5m historical excursion (MFE, MAE, R left on table, exit efficiency) & cache candles
   * 3. Run pattern recognition (4H trend + 5M setup) and auto-classify strategy setup variant
   * 4. Ensure visual SVG chart snapshot attachments
   */
  static async backfillSingleClosedTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options?: { normalizedOrders?: any[] }
  ): Promise<{
    tradeId: string;
    stopMoves: boolean;
    excursion: boolean;
    setupClassified: boolean;
    snapshot: boolean;
  }> {
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const summary = {
      tradeId: tId.toString(),
      stopMoves: false,
      excursion: false,
      setupClassified: false,
      snapshot: false,
    };

    // 1. Detect Stop Moves from FYERS Orderbook (reuses in-memory orderbook if provided)
    try {
      await this.detectStopMovesForTrade(tId, uId, {
        normalizedOrders: options?.normalizedOrders,
      });
      summary.stopMoves = true;
    } catch (err: any) {
      console.warn(`[Auto-Backfill] Stop moves detection failed for trade ${tId}:`, err?.message || err);
    }

    // 2. Compute Excursion Analytics (MAE/MFE, R left on table, exit efficiency) & cache candles
    try {
      await this.computeExcursionForTrade(tId, uId, false);
      summary.excursion = true;
    } catch (err: any) {
      console.warn(`[Auto-Backfill] Excursion computation failed for trade ${tId}:`, err?.message || err);
    }

    // 3. Run 4H Trend + 5M Setup Pattern Recognition and Auto-Classify Setup Variant
    try {
      const { PatternRecognitionService } = await import('./pattern-recognition.service.js');
      await PatternRecognitionService.classifyTrade(tId, uId);
      summary.setupClassified = true;
    } catch (err: any) {
      console.warn(`[Auto-Backfill] Setup pattern classification failed for trade ${tId}:`, err?.message || err);
    }

    // 4. Ensure Visual SVG Chart Snapshots
    try {
      const { ChartGeneratorService } = await import('./chart-generator.service.js');
      await ChartGeneratorService.ensureTradeSnapshot(tId, uId);
      summary.snapshot = true;
    } catch (err: any) {
      console.warn(`[Auto-Backfill] Chart snapshot generation failed for trade ${tId}:`, err?.message || err);
    }

    return summary;
  }

  /**
   * Detects trailing and widening stop loss modifications for a trade,
   * evaluates risk expansion, and flags STOP_MOVED mistake suggestions.
   */
  static async detectStopMovesForTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: { manualModifications?: any[]; normalizedOrders?: any[] } = {}
  ): Promise<any> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const trade = await Trade.findOne({ _id: tId, userId: uId });
    if (!trade) {
      throw new Error('Trade not found or unauthorized');
    }

    let rawModifications = options.manualModifications || [];

    // If manual modifications were not explicitly provided, attempt to pull from FYERS orderbook
    if (rawModifications.length === 0) {
      let normalized = options.normalizedOrders;
      if (!normalized) {
        const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
        if (integration?.appId && integration?.accessToken) {
          try {
            const accessToken = decryptSecret(integration.accessToken) as string;
            const orderBook = await this.fetchOrderbook(integration.appId, accessToken);
            normalized = this.normalizeOrderbook(orderBook);
          } catch {
            // If broker is offline and no manual modifications, proceed with empty
          }
        }
      }

      if (normalized && normalized.length > 0) {
        // Find orders matching this trade's symbol
        const symbol = formatFyersSymbol({
          symbol: trade.symbol,
          underlying: trade.underlying,
          assetClass: trade.assetClass,
          exchange: trade.exchange,
          marketSegment: trade.marketSegment,
          optionType: trade.optionType,
          strikePrice: trade.strikePrice,
          expiryDate: trade.expiryDate,
        });

        // If initialStopLoss was not pre-set, attempt to auto-fill from orderbook
        if (!trade.risk?.initialStopLoss) {
          this.applySLOrderMatchingToTrade(trade, normalized, {
            formattedSymbol: symbol,
            underlyingSymbol: trade.underlying,
          });
          await trade.save();
        }

        const tradeStart = moment(trade.entryTime).subtract(5, 'minutes');
        const tradeEnd = trade.exitTime ? moment(trade.exitTime).add(5, 'minutes') : moment().add(5, 'minutes');

        const stopOrders = normalized.filter((ord) => {
          const normSym = InstrumentService.normalizeUnderlying(ord.symbol);
          const matchesSymbol =
            ord.symbol === symbol ||
            ord.symbol === trade.symbol ||
            normSym === trade.underlying ||
            (ord.symbol && ord.symbol.includes(trade.underlying)) ||
            (trade.symbol && trade.symbol.includes(ord.symbol));
          if (!matchesSymbol) return false;
          const hasStop = Number(ord.stopPrice || 0) > 0 || ord.orderType === 3 || ord.orderType === 4;
          if (!hasStop) return false;
          const ordTime = moment(ord.orderDateTime);
          return ordTime.isValid() && ordTime.isBetween(tradeStart, tradeEnd, undefined, '[]');
        });

        rawModifications = stopOrders.map((ord) => ({
          stopPrice: Number(ord.stopPrice),
          modifiedAt: moment(ord.orderDateTime).toDate(),
          orderId: ord.orderId,
          orderType: ord.orderType,
          reason: ord.message || 'FYERS Stop Order',
        }));
      }
    }

    const entryPrice = trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0;
    const initialStop = trade.risk?.initialStopLoss;

    const result = detectStopMoves({
      direction: trade.direction,
      entryPrice,
      initialStopLoss: initialStop,
      modifications: rawModifications,
    });

    if (result.moves.length > 0 || (options.manualModifications && options.manualModifications.length > 0)) {
      trade.stopLossMoveEvents = result.moves.map((m: any) => ({
        previousStop: m.previousStop,
        newStop: m.newStop,
        changePoints: m.changePoints,
        changePercent: m.changePercent,
        moveType: m.moveType,
        movedAt: moment(m.movedAt).toDate(),
        orderId: m.orderId,
        orderType: m.orderType,
        reason: m.reason,
      }));

      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.stopMoveSummary = {
        totalMoves: result.summary.totalMoves,
        widenedCount: result.summary.widenedCount,
        trailedCount: result.summary.trailedCount,
        initialStop: result.summary.initialStop,
        finalStop: result.summary.finalStop,
        netRiskChangePoints: result.summary.netRiskChangePoints,
        hasWidenedRisk: result.summary.hasWidenedRisk,
        detectedAt: new Date(),
      };
    } else if (trade.stopLossMoveEvents && trade.stopLossMoveEvents.length > 0) {
      // Preserve previously captured stop move events
      const trailedCount = trade.stopLossMoveEvents.filter((e: any) => e.moveType === 'TRAILED_FAVORABLY').length;
      const widenedCount = trade.stopLossMoveEvents.filter((e: any) => e.moveType === 'WIDENED_RISK').length;
      const lastEvt = trade.stopLossMoveEvents[trade.stopLossMoveEvents.length - 1];
      const finalStop = lastEvt?.newStop ?? trade.risk?.currentStopLoss ?? initialStop;
      const isLong = trade.direction === 'LONG';
      const netRiskChangePoints = isLong
        ? Number(((initialStop || finalStop) - finalStop).toFixed(4))
        : Number((finalStop - (initialStop || finalStop)).toFixed(4));

      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.stopMoveSummary = {
        totalMoves: trade.stopLossMoveEvents.length,
        widenedCount,
        trailedCount,
        initialStop: initialStop || trade.stopLossMoveEvents[0]?.previousStop,
        finalStop,
        netRiskChangePoints,
        hasWidenedRisk: widenedCount > 0,
        detectedAt: new Date(),
      };
    } else if (trade.risk?.currentStopLoss && initialStop && trade.risk.currentStopLoss !== initialStop) {
      // Synthesize move from initialStop to currentStopLoss
      const curStop = trade.risk.currentStopLoss;
      const isLong = trade.direction === 'LONG';
      const isTrailed = isLong ? curStop > initialStop : curStop < initialStop;
      const moveType = isTrailed ? 'TRAILED_FAVORABLY' : 'WIDENED_RISK';
      const changePts = Math.abs(curStop - initialStop);
      const changePct = initialStop > 0 ? (changePts / initialStop) * 100 : 0;

      trade.stopLossMoveEvents = [
        {
          previousStop: initialStop,
          newStop: curStop,
          changePoints: Number(changePts.toFixed(4)),
          changePercent: Number(changePct.toFixed(2)),
          moveType,
          movedAt: trade.exitTime ? moment(trade.exitTime).subtract(1, 'minute').toDate() : new Date(),
          reason: 'Trailed Stop Loss (Verified from resting order)',
        },
      ];

      const netRiskChangePoints = isLong
        ? Number((initialStop - curStop).toFixed(4))
        : Number((curStop - initialStop).toFixed(4));

      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.stopMoveSummary = {
        totalMoves: 1,
        widenedCount: isTrailed ? 0 : 1,
        trailedCount: isTrailed ? 1 : 0,
        initialStop,
        finalStop: curStop,
        netRiskChangePoints,
        hasWidenedRisk: !isTrailed,
        detectedAt: new Date(),
      };
    } else {
      trade.stopLossMoveEvents = [];
      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.stopMoveSummary = {
        totalMoves: 0,
        widenedCount: 0,
        trailedCount: 0,
        initialStop: initialStop || 0,
        finalStop: initialStop || 0,
        netRiskChangePoints: 0,
        hasWidenedRisk: false,
        detectedAt: new Date(),
      };
    }

    if (result.summary.hasWidenedRisk) {
      trade.psychology = trade.psychology || ({} as any);
      trade.psychology.stopLossMoved = true;
      trade.psychology.mistakes = trade.psychology.mistakes || [];
      if (!trade.psychology.mistakes.includes('STOP_MOVED')) {
        trade.psychology.mistakes.push('STOP_MOVED');
      }

      trade.auditLog = trade.auditLog || [];
      trade.auditLog.push({
        action: 'STOP_MOVED_DETECTED',
        timestamp: new Date(),
        changedBy: 'system',
        details: {
          widenedCount: result.summary.widenedCount,
          netRiskChangePoints: result.summary.netRiskChangePoints,
        },
      });
    }

    await trade.save();

    return {
      stopLossMoveEvents: trade.stopLossMoveEvents,
      stopMoveSummary: trade.calculated.stopMoveSummary,
      mistakeSuggestions: result.mistakeSuggestions,
      flags: result.flags,
    };
  }

  /**
   * Backfills initial stop loss from FYERS orderbook for current-day trades missing initialStopLoss.
   * Dry-run mode by default; apply with dryRun: false.
   */
  static async backfillSLFromOrderbook(
    userId: string | mongoose.Types.ObjectId,
    options?: { dryRun?: boolean; tradeIds?: string[] }
  ): Promise<{
    dryRun: boolean;
    totalEligibleTrades: number;
    matchedCount: number;
    ambiguousCount: number;
    skippedCount: number;
    trades: Array<{
      tradeId: string;
      symbol: string;
      direction: string;
      initialStop?: number;
      confidence: string;
      reason?: string;
    }>;
  }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const isDryRun = options?.dryRun ?? true;

    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    if (!integration || !integration.appId || !integration.accessToken) {
      throw new Error('FYERS broker is not connected or session has expired.');
    }

    let accessToken: string;
    try {
      accessToken = decryptSecret(integration.accessToken) as string;
    } catch {
      throw new Error('FYERS session could not be decrypted.');
    }

    const rawOrderbook = await this.fetchOrderbook(integration.appId, accessToken);
    const normalizedOrders = this.normalizeOrderbook(rawOrderbook);

    // Current-day trades missing initialStopLoss
    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();

    const query: any = {
      userId: uId,
      tradeDate: { $gte: todayStart, $lte: todayEnd },
      $or: [
        { 'risk.initialStopLoss': { $exists: false } },
        { 'risk.initialStopLoss': null },
        { 'risk.initialStopLoss': 0 },
      ],
    };

    if (options?.tradeIds && options.tradeIds.length > 0) {
      query._id = { $in: options.tradeIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const trades = await Trade.find(query).sort({ entryTime: 1 });
    const results: Array<{
      tradeId: string;
      symbol: string;
      direction: string;
      initialStop?: number;
      confidence: string;
      reason?: string;
    }> = [];

    let matchedCount = 0;
    let ambiguousCount = 0;
    let skippedCount = 0;
    const affectedAccountIds = new Set<string>();

    for (const trade of trades) {
      const matchResult = this.applySLOrderMatchingToTrade(trade, normalizedOrders, {
        underlyingSymbol: trade.underlying,
      });

      if (matchResult.applied) {
        matchedCount++;
        results.push({
          tradeId: trade._id.toString(),
          symbol: trade.symbol,
          direction: trade.direction,
          initialStop: matchResult.initialStop,
          confidence: matchResult.confidence,
        });
        if (!isDryRun) {
          trade.markModified('risk');
          trade.markModified('calculated');
          trade.markModified('auditLog');
          trade.markModified('stopLossMoveEvents');
          trade.markModified('psychology');
          await trade.save();
          if (trade.accountId) {
            affectedAccountIds.add(trade.accountId.toString());
          }
        }
      } else if (matchResult.confidence === 'AMBIGUOUS') {
        ambiguousCount++;
        results.push({
          tradeId: trade._id.toString(),
          symbol: trade.symbol,
          direction: trade.direction,
          confidence: 'AMBIGUOUS',
          reason: matchResult.reason,
        });
        if (!isDryRun) {
          trade.markModified('risk');
          trade.markModified('auditLog');
          await trade.save();
        }
      } else {
        skippedCount++;
        results.push({
          tradeId: trade._id.toString(),
          symbol: trade.symbol,
          direction: trade.direction,
          confidence: 'NONE',
          reason: 'No matching SL order found in current-day orderbook',
        });
      }
    }

    if (!isDryRun && affectedAccountIds.size > 0) {
      for (const accId of affectedAccountIds) {
        await AccountService.recalculateAccountBalances(accId, uId);
      }
    }

    return {
      dryRun: isDryRun,
      totalEligibleTrades: trades.length,
      matchedCount,
      ambiguousCount,
      skippedCount,
      trades: results,
    };
  }

  /**
   * Fetches real-time market quotes (LTP, open, high, low, close, change) for a list of FYERS symbols.
   * Employs an in-memory cache (3s TTL) to prevent exhausting FYERS daily 5,000 requests limit (HTTP 429).
   * Automatically falls back to /positions to extract live LTP if /data/quotes is rate-limited.
   */
  static async getMarketQuotes(
    userId: mongoose.Types.ObjectId | string,
    fyersSymbols: string[]
  ): Promise<Map<string, { ltp: number; change?: number; changePercent?: number; high?: number; low?: number; open?: number; prevClose?: number; timestamp?: number }>> {
    const quotesMap = new Map<string, { ltp: number; change?: number; changePercent?: number; high?: number; low?: number; open?: number; prevClose?: number; timestamp?: number }>();
    if (!fyersSymbols || fyersSymbols.length === 0) return quotesMap;

    const uniqueSymbols = Array.from(new Set(fyersSymbols.filter(Boolean)));
    const now = Date.now();
    const CACHE_TTL_MS = 3000;

    // Check cache first
    const missingSymbols: string[] = [];
    for (const sym of uniqueSymbols) {
      const cached = this.quotesCache.get(sym);
      if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
        quotesMap.set(sym, cached.data);
      } else {
        missingSymbols.push(sym);
      }
    }

    if (missingSymbols.length === 0) {
      return quotesMap;
    }

    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
    if (!integration || !integration.appId || !integration.accessToken) {
      return quotesMap;
    }

    const tokenExpiry = integration.tokenExpiresAt || integration.authCodeExpiresAt;
    if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
      return quotesMap;
    }

    let accessToken = '';
    try {
      const decrypted = decryptSecret(integration.accessToken);
      if (!decrypted) return quotesMap;
      accessToken = decrypted;
    } catch {
      return quotesMap;
    }

    const dataApiBase = this.FYERS_API_BASE.replace(/\/api\/v3\/?$/, '') + '/data';
    let quotesApiRateLimited = false;

    // FYERS supports up to 50 symbols per batch
    const batchSize = 50;
    for (let i = 0; i < missingSymbols.length; i += batchSize) {
      const batch = missingSymbols.slice(i, i + batchSize);
      const url = `${dataApiBase}/quotes?symbols=${encodeURIComponent(batch.join(','))}`;

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `${integration.appId}:${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 429) {
          quotesApiRateLimited = true;
          break;
        }

        if (!res.ok) continue;
        const data = (await res.json()) as any;
        if (data && data.s === 'ok' && Array.isArray(data.d)) {
          for (const item of data.d) {
            if (item && item.s === 'ok' && item.v && typeof item.v.lp === 'number') {
              const symKey = item.n || item.v.symbol || item.v.original_name;
              const quoteData = {
                ltp: item.v.lp,
                change: typeof item.v.ch === 'number' ? item.v.ch : undefined,
                changePercent: typeof item.v.chp === 'number' ? item.v.chp : undefined,
                high: typeof item.v.high_price === 'number' ? item.v.high_price : undefined,
                low: typeof item.v.low_price === 'number' ? item.v.low_price : undefined,
                open: typeof item.v.open_price === 'number' ? item.v.open_price : undefined,
                prevClose: typeof item.v.prev_close_price === 'number' ? item.v.prev_close_price : undefined,
                timestamp: typeof item.v.tt === 'number' ? item.v.tt * 1000 : Date.now(),
              };
              if (symKey) {
                quotesMap.set(symKey, quoteData);
                this.quotesCache.set(symKey, { data: quoteData, cachedAt: now });
              }
              if (item.n) {
                quotesMap.set(item.n, quoteData);
                this.quotesCache.set(item.n, { data: quoteData, cachedAt: now });
              }
              if (item.v?.symbol) {
                quotesMap.set(item.v.symbol, quoteData);
                this.quotesCache.set(item.v.symbol, { data: quoteData, cachedAt: now });
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[FyersService] Failed to fetch quotes for batch: ${err.message}`);
      }
    }

    // Fallback: If quotes API is rate-limited (429) or symbols are still missing, query live /positions
    const stillMissing = missingSymbols.filter((s) => !quotesMap.has(s));
    if (stillMissing.length > 0 || quotesApiRateLimited) {
      try {
        const positionsRes = await fetch(`${this.FYERS_API_BASE}/positions`, {
          method: 'GET',
          headers: {
            Authorization: `${integration.appId}:${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (positionsRes.ok) {
          const posJson = (await positionsRes.json()) as any;
          if (posJson && Array.isArray(posJson.netPositions)) {
            for (const p of posJson.netPositions) {
              if (p && typeof p.ltp === 'number' && p.ltp > 0 && p.symbol) {
                const quoteData = {
                  ltp: p.ltp,
                  change: typeof p.ch === 'number' ? p.ch : undefined,
                  changePercent: typeof p.chp === 'number' ? p.chp : undefined,
                  timestamp: Date.now(),
                };
                quotesMap.set(p.symbol, quoteData);
                this.quotesCache.set(p.symbol, { data: quoteData, cachedAt: now });

                const rawSym = p.symbol.includes(':') ? p.symbol.split(':')[1] : p.symbol;
                quotesMap.set(rawSym, quoteData);
                this.quotesCache.set(rawSym, { data: quoteData, cachedAt: now });

                const underlying = InstrumentService.normalizeUnderlying(p.symbol);
                if (underlying) {
                  quotesMap.set(underlying, quoteData);
                  this.quotesCache.set(underlying, { data: quoteData, cachedAt: now });
                }
              }
            }
          }
        }
      } catch (posErr: any) {
        console.warn(`[FyersService] Failed to fetch fallback quotes from /positions: ${posErr.message}`);
      }
    }

    return quotesMap;
  }

  /**
   * Places a new order synchronously via FYERS API v3 POST /orders/sync
   */
  static async placeOrder(appId: string, accessToken: string, orderPayload: any): Promise<any> {
    const res = await fetch(`${this.FYERS_API_BASE}/orders/sync`, {
      method: 'POST',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(data.message || `Failed to place FYERS order (code: ${data.code || res.status})`);
    }
    return data;
  }

  /**
   * Modifies an existing pending order synchronously via FYERS API v3 PATCH /orders/sync
   */
  static async modifyOrder(
    appId: string,
    accessToken: string,
    modifyPayload: {
      id: string;
      type: number;
      stopPrice?: number;
      limitPrice?: number;
      qty?: number;
    }
  ): Promise<any> {
    const res = await fetch(`${this.FYERS_API_BASE}/orders/sync`, {
      method: 'PATCH',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(modifyPayload),
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(data.message || `Failed to modify FYERS order (code: ${data.code || res.status})`);
    }
    return data;
  }

  /**
   * Cancels a pending order synchronously via FYERS API v3 DELETE /orders/sync
   */
  static async cancelOrder(appId: string, accessToken: string, orderId: string): Promise<any> {
    const res = await fetch(`${this.FYERS_API_BASE}/orders/sync`, {
      method: 'DELETE',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: orderId }),
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(data.message || `Failed to cancel FYERS order (code: ${data.code || res.status})`);
    }
    return data;
  }

  /**
   * Squares off positions via FYERS API v3 DELETE /positions
   */
  static async exitPositions(
    appId: string,
    accessToken: string,
    payload: { id?: string; pending_orders_cancel?: number }
  ): Promise<any> {
    const res = await fetch(`${this.FYERS_API_BASE}/positions`, {
      method: 'DELETE',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as any;
    if (!res.ok || data.s !== 'ok') {
      throw new Error(data.message || `Failed to exit FYERS positions (code: ${data.code || res.status})`);
    }
    return data;
  }

  /**
   * Returns exchange freeze quantity per order (NSE / MCX).
   * Orders larger than freeze quantity are automatically sliced into compliant child orders.
   */
  static getFreezeQuantity(symbol: string): number {
    const s = symbol.toUpperCase();
    if (s.includes('NIFTY') && !s.includes('BANKNIFTY') && !s.includes('FINNIFTY') && !s.includes('MIDCPNIFTY')) {
      return 1800;
    }
    if (s.includes('BANKNIFTY')) {
      return 900;
    }
    if (s.includes('FINNIFTY')) {
      return 1800;
    }
    if (s.includes('MIDCPNIFTY')) {
      return 2800;
    }
    if (s.includes('SENSEX')) {
      return 1000;
    }
    if (s.includes('CRUDEOIL')) {
      return 10000;
    }
    return 100000;
  }

  /**
   * Polls FYERS order status after placement to capture actual exchange execution price (tradedPrice)
   * rather than relying solely on the client's estimated LTP.
   */
  static async pollTradedFillPrice(
    appId: string,
    accessToken: string,
    orderId: string,
    maxAttempts = 3
  ): Promise<{ tradedPrice?: number; status?: string; tradedQty?: number }> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const orderbook = await this.fetchOrderbook(appId, accessToken);
        const order = orderbook.find((o: any) => o.id === orderId);
        if (order) {
          const tradedPrice = Number(order.tradedPrice || order.avgPrice || order.price || 0);
          const tradedQty = Number(order.filledQty || order.tradedQty || 0);
          const status = order.status === 2 ? 'FILLED' : order.status === 1 ? 'CANCELLED' : order.status === 5 ? 'REJECTED' : 'PENDING';
          if (tradedPrice > 0 || status === 'FILLED') {
            return { tradedPrice, status, tradedQty };
          }
        }
      } catch {}
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    return {};
  }

  /**
   * Checks whether an open position has a live, resting Stop Loss order on the broker's orderbook.
   * If not, the position is flagged as a "Naked Position" exposing uncontrolled exchange risk.
   */
  static async checkRestingStopLossOrder(
    userId: string | mongoose.Types.ObjectId,
    tradeId: string
  ): Promise<{ hasRestingSl: boolean; slPrice?: number; orderId?: string; message: string }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const trade = await Trade.findOne({ _id: tradeId, userId: uId });
    if (!trade) return { hasRestingSl: false, message: 'Trade not found' };

    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS', status: 'CONNECTED' });
    if (!integration || !integration.appId || !integration.accessToken) {
      return { hasRestingSl: false, message: 'No active FYERS session' };
    }

    const accessToken = decryptSecret(integration.accessToken) as string;
    const appId = integration.appId;

    try {
      const orderbook = await this.fetchOrderbook(appId, accessToken);
      const isShort = trade.direction === 'SHORT';
      const expectedSide = isShort ? 1 : -1;

      const slOrder = orderbook.find((o: any) => {
        if (o.status !== 6 && o.status !== 4) return false;
        if (o.side !== expectedSide) return false;
        const normSym = InstrumentService.normalizeUnderlying(o.symbol);
        const match = normSym === trade.underlying || o.symbol.includes(trade.underlying) || trade.symbol.includes(o.symbol);
        return match && (o.type === 4 || o.type === 3 || Number(o.stopPrice || 0) > 0);
      });

      if (slOrder) {
        return {
          hasRestingSl: true,
          slPrice: Number(slOrder.stopPrice || slOrder.price),
          orderId: slOrder.id,
          message: `Resting SL active at ₹${slOrder.stopPrice || slOrder.price}`,
        };
      }
      return { hasRestingSl: false, message: 'No resting SL order found on FYERS orderbook (Naked Position)' };
    } catch (e: any) {
      return { hasRestingSl: false, message: e.message || 'Error checking orderbook' };
    }
  }

  /**
   * Executes or modifies a live Stop Loss order on FYERS exchange for an active trade.
   */
  static async executeBrokerStopLoss(
    userId: string | mongoose.Types.ObjectId,
    tradeId: string,
    newStopPrice: number
  ): Promise<{
    executedOnBroker: boolean;
    action: 'MODIFIED' | 'PLACED' | 'JOURNAL_ONLY';
    orderId?: string;
    message: string;
  }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const trade = await Trade.findOne({ _id: tradeId, userId: uId });
    if (!trade) {
      throw new Error('Trade not found');
    }

    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS', status: 'CONNECTED' });
    if (!integration || !integration.appId || !integration.accessToken) {
      return {
        executedOnBroker: false,
        action: 'JOURNAL_ONLY',
        message: 'No active FYERS connection. Updated in SetupMint journal only.',
      };
    }

    const accessToken = decryptSecret(integration.accessToken) as string;
    const appId = integration.appId;

    // Fetch positions from FYERS to identify the real live open position
    const positionsRes = await fetch(`${this.FYERS_API_BASE}/positions`, {
      method: 'GET',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const positionsData = (await positionsRes.json()) as any;
    const netPositions = positionsData?.netPositions || [];

    const matchedPos = netPositions.find((p: any) => {
      if (!p || p.netQty === 0) return false;
      const parsed = InstrumentService.normalizeUnderlying(p.symbol);
      return parsed === trade.underlying || p.symbol.includes(trade.underlying) || trade.symbol.includes(p.symbol);
    });

    if (!matchedPos) {
      return {
        executedOnBroker: false,
        action: 'JOURNAL_ONLY',
        message: 'No open position found in FYERS for this symbol. Updated in SetupMint journal only.',
      };
    }

    // Fetch orderbook to check if there is an active pending stop-loss order
    const orderBook = await this.fetchOrderbook(appId, accessToken);
    const pendingOrders = orderBook.filter(
      (o: any) =>
        (o.status === 6 || o.status === 4) &&
        o.symbol === matchedPos.symbol
    );

    // Stop order side is opposite of position:
    // If netQty < 0 (SHORT), stop order is BUY (side 1)
    // If netQty > 0 (LONG), stop order is SELL (side -1)
    const expectedSide = matchedPos.netQty < 0 ? 1 : -1;
    const pendingSlOrder = pendingOrders.find(
      (o: any) => o.side === expectedSide && (o.type === 4 || o.type === 3 || Number(o.stopPrice || 0) > 0)
    );

    const tick = 0.05;
    const cleanStopPrice = Number((Math.round(newStopPrice / tick) * tick).toFixed(2));
    const limitPrice = expectedSide === 1
      ? Number((cleanStopPrice + 0.5).toFixed(2))
      : Number((cleanStopPrice - 0.5).toFixed(2));

    if (pendingSlOrder) {
      // Modify existing pending order
      await this.modifyOrder(appId, accessToken, {
        id: pendingSlOrder.id,
        type: pendingSlOrder.type || 4,
        stopPrice: cleanStopPrice,
        limitPrice: pendingSlOrder.type === 4 ? limitPrice : undefined,
        qty: Math.abs(matchedPos.netQty),
      });

      return {
        executedOnBroker: true,
        action: 'MODIFIED',
        orderId: pendingSlOrder.id,
        message: `FYERS Stop Loss order #${pendingSlOrder.id} modified to ₹${cleanStopPrice} on exchange.`,
      };
    } else {
      // Place a new SL-Limit order (type 4) on FYERS
      const placePayload = {
        symbol: matchedPos.symbol,
        qty: Math.abs(matchedPos.netQty),
        type: 4, // SL-L
        side: expectedSide,
        productType: matchedPos.productType || 'MARGIN',
        limitPrice: limitPrice,
        stopPrice: cleanStopPrice,
        validity: 'DAY',
        disclosedQty: 0,
        offlineOrder: false,
        stopLoss: 0,
        takeProfit: 0,
        orderTag: 'SMSL',
      };

      const placeRes = await this.placeOrder(appId, accessToken, placePayload);
      return {
        executedOnBroker: true,
        action: 'PLACED',
        orderId: placeRes.id,
        message: `New FYERS Stop Loss order #${placeRes.id} placed at ₹${newStopPrice} on exchange.`,
      };
    }
  }

  /**
   * Executes a market exit or position square-off on FYERS exchange for an active trade.
   */
  static async executeBrokerExit(
    userId: string | mongoose.Types.ObjectId,
    tradeId: string,
    options: {
      exitQty: number;
      isFullClose?: boolean;
    }
  ): Promise<{
    executedOnBroker: boolean;
    orderId?: string;
    tradedPrice?: number;
    tradedQty?: number;
    orderStatus?: string;
    slicedCount?: number;
    message: string;
  }> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const trade = await Trade.findOne({ _id: tradeId, userId: uId });
    if (!trade) {
      throw new Error('Trade not found');
    }

    const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS', status: 'CONNECTED' });
    if (!integration || !integration.appId || !integration.accessToken) {
      return {
        executedOnBroker: false,
        message: 'No active FYERS connection. Updated in SetupMint journal only.',
      };
    }

    const accessToken = decryptSecret(integration.accessToken) as string;
    const appId = integration.appId;

    // Fetch positions from FYERS
    const positionsRes = await fetch(`${this.FYERS_API_BASE}/positions`, {
      method: 'GET',
      headers: {
        Authorization: `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const positionsData = (await positionsRes.json()) as any;
    const netPositions = positionsData?.netPositions || [];

    const matchedPos = netPositions.find((p: any) => {
      if (!p || p.netQty === 0) return false;
      const parsed = InstrumentService.normalizeUnderlying(p.symbol);
      return parsed === trade.underlying || p.symbol.includes(trade.underlying) || trade.symbol.includes(p.symbol);
    });

    if (!matchedPos) {
      return {
        executedOnBroker: false,
        message: 'No open position found in FYERS for this symbol. Updated in SetupMint journal only.',
      };
    }

    const openQty = Math.abs(matchedPos.netQty);
    const exitQty = Math.min(options.exitQty, openQty);
    const isFull = options.isFullClose || exitQty >= openQty;
    const exitSide = matchedPos.netQty < 0 ? 1 : -1;
    const freezeQty = this.getFreezeQuantity(matchedPos.symbol);

    if (isFull && exitQty <= freezeQty) {
      try {
        await this.exitPositions(appId, accessToken, {
          id: matchedPos.id,
          pending_orders_cancel: 1,
        });
        return {
          executedOnBroker: true,
          message: `Full position on ${matchedPos.symbol} squared off in FYERS and pending orders cancelled.`,
        };
      } catch {
        // Fallback: submit market exit order directly
      }
    }

    // Execute order with pre-flight freeze quantity slicing if order is large
    const orderIds: string[] = [];
    let remainingToExit = exitQty;
    let sliceCount = 0;

    while (remainingToExit > 0) {
      const currentSlice = Math.min(remainingToExit, freezeQty);
      const res = await this.placeOrder(appId, accessToken, {
        symbol: matchedPos.symbol,
        qty: currentSlice,
        type: 2, // MARKET
        side: exitSide,
        productType: matchedPos.productType || 'MARGIN',
        limitPrice: 0,
        stopPrice: 0,
        validity: 'DAY',
        disclosedQty: 0,
        offlineOrder: false,
        stopLoss: 0,
        takeProfit: 0,
        orderTag: isFull ? 'SMFull' : 'SMPart',
      });
      orderIds.push(res.id);
      remainingToExit -= currentSlice;
      sliceCount++;
    }

    const primaryOrderId = orderIds[0];
    const fillInfo = primaryOrderId
      ? await this.pollTradedFillPrice(appId, accessToken, primaryOrderId)
      : {};

    // Adjust pending Stop Loss quantity if one exists
    try {
      const orderBook = await this.fetchOrderbook(appId, accessToken);
      const remainingQty = openQty - exitQty;
      const pendingSlOrder = orderBook.find(
        (o: any) =>
          o.status === 6 &&
          o.symbol === matchedPos.symbol &&
          o.side === exitSide &&
          (o.type === 4 || o.type === 3 || Number(o.stopPrice || 0) > 0)
      );
      if (pendingSlOrder) {
        if (remainingQty > 0) {
          await this.modifyOrder(appId, accessToken, {
            id: pendingSlOrder.id,
            type: pendingSlOrder.type,
            stopPrice: Number(pendingSlOrder.stopPrice),
            limitPrice: pendingSlOrder.limitPrice ? Number(pendingSlOrder.limitPrice) : undefined,
            qty: remainingQty,
          });
        } else if (isFull) {
          await this.cancelOrder(appId, accessToken, pendingSlOrder.id);
        }
      }
    } catch (slErr) {
      console.warn('Failed to adjust pending SL qty after exit:', slErr);
    }

    const sliceMsg = sliceCount > 1 ? ` (sliced into ${sliceCount} exchange freeze-compliant orders)` : '';
    const fillMsg = fillInfo.tradedPrice ? ` Filled at ₹${fillInfo.tradedPrice}.` : '';

    return {
      executedOnBroker: true,
      orderId: primaryOrderId,
      tradedPrice: fillInfo.tradedPrice,
      tradedQty: fillInfo.tradedQty ?? exitQty,
      orderStatus: fillInfo.status ?? 'FILLED',
      slicedCount: sliceCount,
      message: `${isFull ? 'Full' : 'Partial'} market exit for ${exitQty} units placed on FYERS (Order #${primaryOrderId})${sliceMsg}.${fillMsg}`,
    };
  }
}
