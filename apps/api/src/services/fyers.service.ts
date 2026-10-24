import crypto from 'crypto';
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import {
  BrokerIntegration,
  TradingAccount,
  Trade,
  BrokerFundsSnapshot,
  AccountTransaction,
} from '../db/models/index.js';
import { calculateFIFOExecution, calculateIndianCharges } from '@tradevault/financial-engine';
import {
  IBrokerAuthTokens,
  IBrokerFundLimit,
  IBrokerFundsSnapshot,
  MarketSegment,
  AssetClass,
  OptionType,
} from '@tradevault/shared';
import { AccountService } from './account.service.js';
import { InstrumentService } from './instrument.service.js';
import { decryptSecret } from './crypto.service.js';
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
  let formattedSymbol = sym;
  let assetClass: AssetClass = 'EQUITY';
  let marketSegment: MarketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_EQ';
  let optionType: OptionType | undefined;
  let strikePrice: number | undefined;
  let expiryDate: Date | undefined;
  let isDerivative = false;

  if (cleanSymbol.endsWith('-EQ') || cleanSymbol.endsWith('-BE')) {
    cleanSymbol = cleanSymbol.replace(/-EQ|-BE$/, '');
    formattedSymbol = cleanSymbol;
    assetClass = 'EQUITY';
    marketSegment = exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ';
  } else if (/CE$|PE$|CALL$|PUT$/i.test(cleanSymbol)) {
    assetClass = 'OPTIONS';
    marketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_FNO';
    optionType = /CE$|CALL$/i.test(cleanSymbol) ? 'CALL' : 'PUT';
    isDerivative = true;

    const optMatch = cleanSymbol.match(/(?:(?:\d{2}[A-Z]{3}|\d{2}[0-9OND]\d{2})\s*)?(\d+(?:\.\d+)?)\s*(?:CE|PE|CALL|PUT)$/i);
    if (optMatch && optMatch[1]) {
      strikePrice = parseFloat(optMatch[1]);
      formattedSymbol = `${underlying} ${strikePrice} ${optionType === 'CALL' ? 'CE' : 'PE'}`;
    } else {
      formattedSymbol = `${underlying} ${optionType === 'CALL' ? 'CE' : 'PE'}`;
    }
  } else if (/FUT$|FUTURES$/i.test(cleanSymbol)) {
    assetClass = exchange === 'MCX' ? 'COMMODITY' : 'FUTURES';
    marketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_FNO';
    isDerivative = true;
    formattedSymbol = `${underlying} FUT`;
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
      timestamp: Date;
      direction: 'LONG' | 'SHORT';
      price: number;
      quantity: number;
      meta: ReturnType<typeof parseFyersSymbol>;
    }>>();

    for (const raw of executions) {
      const meta = parseFyersSymbol(raw.symbol);
      const timestamp = parseFyersDateTime(raw.orderDateTime);
      const direction = raw.side === 1 ? 'LONG' : 'SHORT';
      const list = executionsBySymbol.get(meta.cleanSymbol) || [];
      list.push({
        raw,
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
    const batchId = `fyers_sync_${Date.now()}`;

    // For each symbol, match fills chronologically via FIFO
    for (const [cleanSymbol, execList] of executionsBySymbol.entries()) {
      execList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
          ? `${inst.displayName || underlying} ${strikePrice} ${optionType === 'CALL' ? 'CE' : 'PE'}`
          : `${inst.displayName || underlying} FUT`
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
          // 2. Secondary fallback: Match on symbol (clean, formatted, or raw), direction, entry price, and time window
          const existing = await Trade.findOne({
            userId: uId,
            $or: [
              ...(fillIdsToMatch.length > 0 ? [{ 'fills.fillId': { $in: fillIdsToMatch } }] : []),
              {
                symbol: { $in: [cleanSymbol, formattedSymbol, sample.raw.symbol] },
                direction: grp.direction,
                'simpleExecution.entryPrice': avgEntry,
                entryTime: {
                  $gte: new Date(grp.entryTime.getTime() - 2 * 60 * 1000),
                  $lte: new Date(grp.entryTime.getTime() + 2 * 60 * 1000),
                },
              },
              {
                symbol: { $in: [cleanSymbol, formattedSymbol, sample.raw.symbol] },
                direction: grp.direction,
                'simpleExecution.entryPrice': avgEntry,
                'simpleExecution.quantity': totalTradeQty,
                tradeDate: {
                  $gte: new Date(grp.entryTime.getTime() - 24 * 60 * 60 * 1000),
                  $lte: new Date(grp.entryTime.getTime() + 24 * 60 * 60 * 1000),
                },
              },
            ],
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
            if (formattedSymbol && existing.symbol !== formattedSymbol) {
              existing.symbol = formattedSymbol;
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

            // If existing trade was OPEN and the new sync data has closed it:
            if (existing.status === 'OPEN' && fifoSummary.isFullyClosed) {
              existing.status = 'CLOSED';
              existing.exitTime = exitTime;
              if (existing.simpleExecution) {
                existing.simpleExecution.contractMultiplier = multiplier;
                existing.simpleExecution.exitPrice = avgExit;
                existing.simpleExecution.brokerage = charges.brokerage;
                existing.simpleExecution.exchangeFees = charges.exchangeFees;
                existing.simpleExecution.regulatoryFees = charges.regulatoryFees;
                existing.simpleExecution.taxes = charges.taxes;
              }
              existing.fills = grp.fills.map((f) => ({
                fillId: f.fillId,
                timestamp: f.timestamp,
                type: f.type,
                price: f.price,
                quantity: f.quantity,
                fee: 0,
              }));
              existing.calculated = {
                ...existing.calculated,
                averageEntryPrice: avgEntry,
                averageExitPrice: avgExit,
                closedQuantity: closedQty,
                openQuantity: fifoSummary.openQuantity.toNumber(),
                totalCosts: charges.totalCosts,
                grossPnL,
                netPnL,
                outcome: netPnL > 0 ? 'WIN' : netPnL < 0 ? 'LOSS' : 'BREAKEVEN',
              };
              await existing.save();
              syncedTradesCount++;
              return;
            }

            if (updated) {
              await existing.save();
            }
            duplicateTradesCount++;
            return;
          }

          await Trade.create({
            userId: uId,
            accountId: account._id,
            instrumentId: inst._id,
            underlying: inst.symbol,
            instrumentName: inst.displayName,
            symbol: formattedSymbol,
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
          });

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
            currentGroup.fills.push({
              fillId: makeFillId(exec),
              type: 'EXIT',
              price: exec.price,
              quantity: exec.quantity,
              timestamp: exec.timestamp,
            });
            currentGroup.openQuantity = Math.max(0, currentGroup.openQuantity - exec.quantity);

            if (currentGroup.openQuantity === 0) {
              await commitTrade(currentGroup);
              currentGroup = null;
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
}
