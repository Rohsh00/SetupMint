import crypto from 'crypto';
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import moment from 'moment';
import {
  BrokerIntegration,
  TradingAccount,
  Trade,
  BrokerFundsSnapshot,
  AccountTransaction,
  TradeCandleSnapshot,
} from '../db/models/index.js';
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
        const netPnL = trade.calculated?.netPnL ?? 0;
        const realizedR = calculateRealizedRMultiple(netPnL, plannedRisk);
        trade.risk.realizedRMultiple = realizedR;
        if (trade.calculated) {
          trade.calculated.realizedRMultiple = realizedR;
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
    const closedTradeIds: string[] = [];
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
              }

              existing.markModified('calculated');
              existing.markModified('fills');
              existing.markModified('simpleExecution');

              await existing.save();
              syncedTradesCount++;
              if (fifoSummary.isFullyClosed) {
                closedTradeIds.push(existing._id.toString());
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
            closedTradeIds.push(createdTrade._id.toString());
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

    // Fire-and-forget background auto-snapshot generation for closed trades (cap 25, 220ms pacing)
    if (closedTradeIds.length > 0) {
      (async () => {
        const batchToProcess = closedTradeIds.slice(0, 25);
        for (const tId of batchToProcess) {
          try {
            await ChartGeneratorService.ensureTradeSnapshot(tId, uId);
          } catch (err: any) {
            console.warn(`[FYERS Sync] Snapshot auto-generation failed for trade ${tId}:`, err.message);
          }
          await new Promise((r) => setTimeout(r, 220));
        }
      })().catch(() => {});
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

    // Adaptive resolution rule:
    // Holds <= 240m (4 hours) -> 1m resolution ('1')
    // Holds > 240m up to 30 days -> 5m resolution ('5')
    // Longer holds -> Daily ('D')
    const holdMinutes = Math.max(1, moment(trade.exitTime).diff(moment(trade.entryTime), 'minutes'));
    const resolution = holdMinutes <= 240 ? '1' : holdMinutes <= 43200 ? '5' : 'D';
    const barMinutes = resolution === '1' ? 1 : resolution === '5' ? 5 : 1440;

    const from = moment(trade.entryTime).subtract(5 * barMinutes, 'minutes').toDate();
    const to = moment(trade.exitTime).add(5 * barMinutes, 'minutes').toDate();

    const candleResult = await MarketDataService.getCandlesWithFallback({
      trade,
      resolution,
      from,
      to,
      userId: uId,
      forceRefetch,
      provider: options?.provider || 'AUTO',
    });

    if (!candleResult.ok) {
      trade.calculated = trade.calculated || ({} as any);
      trade.calculated.excursion = {
        status: 'UNAVAILABLE',
        failureReason: candleResult.message || `No candles available (${candleResult.reason})`,
        source: options?.provider === 'ANGEL_ONE' ? 'ANGEL_ONE_HISTORY' : 'FYERS_HISTORY',
        resolution,
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
        computedAt: new Date(),
      };
      await trade.save();
      return trade.calculated.excursion;
    }

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
      failureReason: result.failureReason,
      maePoints: result.maePoints,
      mfePoints: result.mfePoints,
      maeAmount: result.maeAmount,
      mfeAmount: result.mfeAmount,
      maeR: result.maeR,
      mfeR: result.mfeR,
      exitEfficiency: result.exitEfficiency,
      stopEfficiency: result.stopEfficiency,
      stopHit: result.stopHit,
      reversedAfterStopHit: result.reversedAfterStopHit,
      timeToMfeMinutes: result.timeToMfeMinutes,
      timeToMaeMinutes: result.timeToMaeMinutes,
      candleCount: result.candleCount,
      excursionFlags: result.excursionFlags,
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
   * Detects trailing and widening stop loss modifications for a trade,
   * evaluates risk expansion, and flags STOP_MOVED mistake suggestions.
   */
  static async detectStopMovesForTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: { manualModifications?: any[] } = {}
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
      const integration = await BrokerIntegration.findOne({ userId: uId, broker: 'FYERS' });
      if (integration?.appId && integration?.accessToken) {
        try {
          const accessToken = decryptSecret(integration.accessToken) as string;
          const orderBook = await this.fetchOrderbook(integration.appId, accessToken);
          const normalized = this.normalizeOrderbook(orderBook);

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
            const matchesSymbol = ord.symbol === symbol || ord.symbol === trade.symbol;
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
        } catch {
          // If broker is offline and no manual modifications, proceed with empty
        }
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
}
