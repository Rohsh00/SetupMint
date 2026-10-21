import crypto from 'crypto';
import mongoose from 'mongoose';
import { BrokerIntegration, TradingAccount, Trade } from '../db/models/index.js';
import { calculateFIFOExecution, calculateIndianCharges } from '@tradevault/financial-engine';
import { MarketSegment, AssetClass } from '@tradevault/shared';
import { AccountService } from './account.service.js';

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

/**
 * Parses FYERS symbol string into normalized metadata (e.g. "NSE:SBIN-EQ" -> "SBIN", "NSE_EQ", "EQUITY")
 */
export function parseFyersSymbol(rawSymbol: string): {
  cleanSymbol: string;
  exchange: string;
  marketSegment: MarketSegment;
  assetClass: AssetClass;
} {
  let exchange = 'NSE';
  let sym = (rawSymbol || '').trim();
  if (sym.includes(':')) {
    const parts = sym.split(':');
    exchange = parts[0].toUpperCase();
    sym = parts[1];
  }
  let cleanSymbol = sym;
  let assetClass: AssetClass = 'EQUITY';
  let marketSegment: MarketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_EQ';

  if (cleanSymbol.endsWith('-EQ') || cleanSymbol.endsWith('-BE')) {
    cleanSymbol = cleanSymbol.replace(/-EQ|-BE$/, '');
    assetClass = 'EQUITY';
    marketSegment = exchange === 'BSE' ? 'BSE_EQ' : 'NSE_EQ';
  } else if (/CE$|PE$/i.test(cleanSymbol)) {
    assetClass = 'OPTIONS';
    marketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_FNO';
  } else if (/FUT$/i.test(cleanSymbol)) {
    assetClass = exchange === 'MCX' ? 'COMMODITY' : 'FUTURES';
    marketSegment = exchange === 'MCX' ? 'MCX' : 'NSE_FNO';
  } else if (exchange === 'MCX') {
    assetClass = 'COMMODITY';
    marketSegment = 'MCX';
  }

  return { cleanSymbol, exchange, marketSegment, assetClass };
}

/**
 * Resolves standard contract multiplier for Indian exchange commodities and derivatives
 */
export function resolveContractMultiplier(cleanSymbol: string, exchange: string): number {
  const sym = (cleanSymbol || '').toUpperCase();
  if (exchange === 'MCX') {
    if (sym.startsWith('CRUDEOILM')) return 10;
    if (sym.startsWith('CRUDEOIL')) return 100;
    if (sym.startsWith('NATGASMINI') || sym.startsWith('NATURALGASMINI')) return 250;
    if (sym.startsWith('NATGAS') || sym.startsWith('NATURALGAS')) return 1250;
    if (sym.startsWith('GOLDM')) return 10;
    if (sym.startsWith('GOLDGUINEA')) return 1;
    if (sym.startsWith('GOLD')) return 100;
    if (sym.startsWith('SILVERMIC')) return 1;
    if (sym.startsWith('SILVERM')) return 5;
    if (sym.startsWith('SILVER')) return 30;
    if (sym.startsWith('COPPER')) return 2500;
    if (sym.startsWith('ZINC')) return 5000;
    if (sym.startsWith('ALUMINI')) return 1000;
    if (sym.startsWith('ALUMINIUM')) return 5000;
  }
  return 1;
}

export class FyersService {
  private static readonly FYERS_API_BASE = 'https://api-t1.fyers.in/api/v3';

  /**
   * Generates the FYERS OAuth login URL
   */
  static generateLoginUrl(appId: string, redirectUri: string, state: string): string {
    return `${this.FYERS_API_BASE}/generate-authcode?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  /**
   * Exchanges an authorization code for a daily access token using SHA-256 hash of appId:secretKey
   */
  static async validateAuthCode(appId: string, secretKey: string, authCode: string): Promise<string> {
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

    return data.access_token;
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

    const { appId, accessToken } = integration;
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

    // Find or create user's FYERS trading account
    let account = await TradingAccount.findOne({
      userId: uId,
      $or: [
        { broker: 'FYERS' },
        { name: 'FYERS Trading Account' },
        { name: new RegExp('^FYERS', 'i') },
      ],
    });

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
      const { exchange, marketSegment, assetClass } = sample.meta;

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
          const multiplier = resolveContractMultiplier(cleanSymbol, exchange);
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
          // 2. Secondary fallback: Match on symbol, direction, entry price, and time window
          const existing = await Trade.findOne({
            userId: uId,
            $or: [
              ...(fillIdsToMatch.length > 0 ? [{ 'fills.fillId': { $in: fillIdsToMatch } }] : []),
              {
                symbol: cleanSymbol,
                direction: grp.direction,
                'simpleExecution.entryPrice': avgEntry,
                entryTime: {
                  $gte: new Date(grp.entryTime.getTime() - 2 * 60 * 1000),
                  $lte: new Date(grp.entryTime.getTime() + 2 * 60 * 1000),
                },
              },
              {
                symbol: cleanSymbol,
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

            duplicateTradesCount++;
            return;
          }

          await Trade.create({
            userId: uId,
            accountId: account._id,
            symbol: cleanSymbol,
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
