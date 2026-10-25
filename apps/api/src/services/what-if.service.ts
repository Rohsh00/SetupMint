import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  WhatIfRequestInput,
  IWhatIfResponse,
  MAX_WHAT_IF_TRADES_SCOPE,
  DEFAULT_STOP_R_GRID,
  DEFAULT_TARGET_R_GRID,
} from '@tradevault/shared';
import { runWhatIfSimulation, IWhatIfSnapshotInput } from '@tradevault/financial-engine';
import { Trade, TradeCandleSnapshot } from '../db/models/index.js';

interface ICacheEntry {
  expiresAt: number;
  data: IWhatIfResponse;
}

const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const MAX_CACHE_ENTRIES = 50;
const whatIfCache = new Map<string, ICacheEntry>();

function getCacheKey(userId: string, input: WhatIfRequestInput, latestTradeUpdateEpoch: number): string {
  const raw = `${userId}:${JSON.stringify(input)}:${latestTradeUpdateEpoch}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export class WhatIfScopeTooLargeError extends Error {
  code = 'SCOPE_TOO_LARGE';
  count: number;
  limit: number;

  constructor(count: number, limit: number) {
    super(
      `What-If simulation scope is too large (${count} trades found, maximum allowed is ${limit}). Please narrow your date range or filters.`
    );
    this.name = 'WhatIfScopeTooLargeError';
    this.count = count;
    this.limit = limit;
  }
}

/**
 * Computes What-If Stop/Target candle-replay simulation for a user.
 */
export async function computeWhatIf(
  userId: string,
  input: WhatIfRequestInput
): Promise<IWhatIfResponse> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const { filters = {} } = input;

  // 1. Build Trade query filter
  const tradeFilter: any = {
    userId: userObjectId,
    status: 'CLOSED',
  };

  if (filters.accountId) {
    tradeFilter.accountId = new mongoose.Types.ObjectId(filters.accountId);
  }
  if (filters.strategyId) {
    tradeFilter.strategyId = new mongoose.Types.ObjectId(filters.strategyId);
  }
  if (filters.variantKey) {
    tradeFilter['setup.variantKey'] = filters.variantKey;
  }
  if (filters.session) {
    tradeFilter.session = filters.session;
  }
  if (filters.direction) {
    tradeFilter.direction = filters.direction;
  }
  if (filters.assetClass) {
    tradeFilter.assetClass = filters.assetClass;
  }
  if (filters.marketSegment) {
    tradeFilter.marketSegment = filters.marketSegment;
  }
  if (filters.startDate || filters.endDate) {
    tradeFilter.tradeDate = {};
    if (filters.startDate) tradeFilter.tradeDate.$gte = new Date(filters.startDate);
    if (filters.endDate) tradeFilter.tradeDate.$lte = new Date(filters.endDate);
  }

  // 2. Count trades to enforce scope limits before loading large documents
  const count = await Trade.countDocuments(tradeFilter);
  if (count > MAX_WHAT_IF_TRADES_SCOPE) {
    throw new WhatIfScopeTooLargeError(count, MAX_WHAT_IF_TRADES_SCOPE);
  }

  // Find latest updatedAt timestamp for cache key invalidation
  const latestTrade = await Trade.findOne(tradeFilter)
    .sort({ updatedAt: -1 })
    .select('updatedAt')
    .lean();
  const latestTradeUpdateEpoch = latestTrade?.updatedAt
    ? new Date(latestTrade.updatedAt).getTime()
    : 0;

  // 3. Cache lookup
  const cacheKey = getCacheKey(userId, input, latestTradeUpdateEpoch);
  const cached = whatIfCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // 4. Fetch closed trades in chronological order
  const trades = await Trade.find(tradeFilter)
    .sort({ tradeDate: 1, entryTime: 1, _id: 1 })
    .lean();

  if (trades.length === 0) {
    const emptyResult = runWhatIfSimulation({
      trades: [],
      snapshotsByTradeId: new Map(),
      options: {
        stopRGrid: input.stopRGrid || (DEFAULT_STOP_R_GRID as any),
        targetRGrid: input.targetRGrid || (DEFAULT_TARGET_R_GRID as any),
        fillModel: input.fillModel || 'GAP_AWARE',
        slippageTicks: input.slippageTicks ?? 0,
        resolutionPolicy: input.resolutionPolicy || 'FINEST_AVAILABLE',
        excludeManagedStopTrades: input.excludeManagedStopTrades ?? true,
        holdoutFraction: input.holdoutFraction ?? 0.3,
      },
      scopeKey: cacheKey.substring(0, 16),
    });
    return emptyResult;
  }

  // 5. Batch-load snapshots in 250-trade chunks
  const tradeIds = trades.map((t) => t._id);
  const chunks = chunkArray(tradeIds, 250);
  const snapshotsByTradeId = new Map<string, IWhatIfSnapshotInput>();

  for (const chunk of chunks) {
    const snapshotDocs = await TradeCandleSnapshot.find({
      userId: userObjectId,
      tradeId: { $in: chunk },
    })
      .select('tradeId resolution candles isUnderlyingFallback coverageFrom coverageTo')
      .lean();

    for (const snap of snapshotDocs) {
      const tid = snap.tradeId.toString();
      const existing = snapshotsByTradeId.get(tid);

      // Resolution policy selection
      if (input.resolutionPolicy === 'ONE_MINUTE_ONLY') {
        if (snap.resolution === '1') {
          snapshotsByTradeId.set(tid, {
            tradeId: tid,
            resolution: snap.resolution,
            candles: snap.candles,
            isUnderlyingFallback: snap.isUnderlyingFallback,
            coverageFrom: snap.coverageFrom,
            coverageTo: snap.coverageTo,
          });
        }
      } else {
        // FINEST_AVAILABLE: prefer '1' over '5'
        if (!existing || (existing.resolution === '5' && snap.resolution === '1')) {
          snapshotsByTradeId.set(tid, {
            tradeId: tid,
            resolution: snap.resolution,
            candles: snap.candles,
            isUnderlyingFallback: snap.isUnderlyingFallback,
            coverageFrom: snap.coverageFrom,
            coverageTo: snap.coverageTo,
          });
        }
      }
    }
  }

  // 6. Run pure simulation engine
  const simulationResult = runWhatIfSimulation({
    trades: trades as any,
    snapshotsByTradeId,
    options: {
      stopRGrid: input.stopRGrid || (DEFAULT_STOP_R_GRID as any),
      targetRGrid: input.targetRGrid || (DEFAULT_TARGET_R_GRID as any),
      fillModel: input.fillModel || 'GAP_AWARE',
      slippageTicks: input.slippageTicks ?? 0,
      resolutionPolicy: input.resolutionPolicy || 'FINEST_AVAILABLE',
      excludeManagedStopTrades: input.excludeManagedStopTrades ?? true,
      holdoutFraction: input.holdoutFraction ?? 0.3,
    },
    scopeKey: cacheKey.substring(0, 16),
  });

  // Preserve request filters in response meta
  simulationResult.meta.filters = filters;

  // 7. Store in LRU cache
  if (whatIfCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = whatIfCache.keys().next().value;
    if (oldestKey) whatIfCache.delete(oldestKey);
  }
  whatIfCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    data: simulationResult,
  });

  return simulationResult;
}
