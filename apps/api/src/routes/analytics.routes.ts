import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import Decimal from 'decimal.js';
import {
  EMOTIONS,
  MISTAKE_TAGS,
  excursionAnalyticsQuerySchema,
  whatIfRequestSchema,
  dateRangeSchema,
  buildDateRangeClause,
} from '@tradevault/shared';
import { Trade } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { computeWhatIf, WhatIfScopeTooLargeError } from '../services/what-if.service.js';
import {
  calculateExcursionAggregates,
  ITradeForExcursionAnalytics,
  aggregateSlippageMetrics,
  calculatePositionSizingDiagnostics,
  SizingAnalyticsTradeInput,
  calculateKillZoneAnalytics,
  KillZoneTradeInput,
} from '@tradevault/financial-engine';
import { AccountScopeService } from '../services/account-scope.service.js';

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/psychology', async (req: any, reply) => {
    const { startDate, endDate, accountId } = req.query;

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

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const filter: any = { userId: req.user!.id, status: 'CLOSED', accountId: { $in: accountIds } };

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const trades = await Trade.find(filter);

    // 1. Performance by discipline score (1 to 5)
    const disciplineMap = new Map<number, { count: number; netPnL: number; wins: number }>();
    for (let i = 1; i <= 5; i++) {
      disciplineMap.set(i, { count: 0, netPnL: 0, wins: 0 });
    }

    // 2. Performance by emotion before trade
    const emotionMap = new Map<string, { count: number; netPnL: number; wins: number }>();
    for (const e of EMOTIONS) {
      emotionMap.set(e.value, { count: 0, netPnL: 0, wins: 0 });
    }

    // 3. Mistake impact tracking (Dynamic across all MISTAKE_TAGS + legacy flags)
    const mistakeImpact: Record<string, { count: number; totalLoss: number }> = {};
    for (const m of MISTAKE_TAGS) {
      mistakeImpact[m.value] = { count: 0, totalLoss: 0 };
    }

    for (const t of trades) {
      const pnl = t.calculated?.netPnL || 0;
      const isWin = pnl > 0;

      // Discipline rating
      const rating = t.psychology?.disciplineScore || 3;
      const dRec = disciplineMap.get(rating) ?? { count: 0, netPnL: 0, wins: 0 };
      dRec.count++;
      dRec.netPnL += pnl;
      if (isWin) dRec.wins++;
      disciplineMap.set(rating, dRec);

      // Emotion
      const emo = t.psychology?.emotionBefore || 'NEUTRAL';
      const eRec = emotionMap.get(emo) ?? { count: 0, netPnL: 0, wins: 0 };
      eRec.count++;
      eRec.netPnL += pnl;
      if (isWin) eRec.wins++;
      emotionMap.set(emo, eRec);

      // Mistakes: collect unique mistakes for this trade (both legacy booleans and mistake tag array)
      const tradeMistakes = new Set<string>();
      if (t.psychology?.revengeTrading) tradeMistakes.add('REVENGE_TRADING');
      if (t.psychology?.overtrading) tradeMistakes.add('OVERTRADING');
      if (t.psychology?.prematureExit) tradeMistakes.add('PREMATURE_EXIT');
      if (t.psychology?.stopLossMoved) tradeMistakes.add('STOP_MOVED');
      if (t.psychology?.positionSizeViolation) tradeMistakes.add('SIZE_VIOLATION');
      if (Array.isArray(t.psychology?.mistakes)) {
        for (const m of t.psychology.mistakes) {
          if (m) tradeMistakes.add(m);
        }
      }

      for (const m of tradeMistakes) {
        if (!mistakeImpact[m]) {
          mistakeImpact[m] = { count: 0, totalLoss: 0 };
        }
        mistakeImpact[m].count++;
        if (pnl < 0) {
          mistakeImpact[m].totalLoss += Math.abs(pnl);
        }
      }
    }

    const performanceByDiscipline = Array.from(disciplineMap.entries()).map(([score, val]) => ({
      score,
      tradesCount: val.count,
      netPnL: Number(val.netPnL.toFixed(2)),
      winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
    }));

    const performanceByEmotion = Array.from(emotionMap.entries())
      .filter(([_, val]) => val.count > 0)
      .map(([emotion, val]) => ({
        emotion,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.netPnL - a.netPnL);

    const mistakeAnalysis = Object.entries(mistakeImpact)
      .map(([key, val]) => ({
        mistake: key,
        label: MISTAKE_TAGS.find((m) => m.value === key)?.label || key,
        occurrences: val.count,
        totalLoss: Number(val.totalLoss.toFixed(2)),
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss || b.occurrences - a.occurrences);

    return reply.send({
      success: true,
      data: {
        performanceByDiscipline,
        performanceByEmotion,
        mistakeAnalysis,
      },
    });
  });

  // Excursion performance aggregates and MAE vs MFE scatter
  app.get('/excursion', async (req: any, reply) => {
    const parsed = excursionAnalyticsQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.format() },
      });
    }

    const { accountId, strategyId, variantKey, startDate, endDate, session, customMfeSteps, funnelMode } = parsed.data;

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const baseFilter: any = {
      userId: req.user!.id,
      status: 'CLOSED',
      accountId: { $in: accountIds },
    };

    if (strategyId) baseFilter.strategyId = strategyId;
    if (variantKey) baseFilter['setup.variantKey'] = variantKey;
    if (session) baseFilter.session = session;
    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      baseFilter.tradeDate = dateClause.tradeDate;
    }

    const allClosedTrades = await Trade.find(baseFilter).sort({ tradeDate: -1 });

    const uncomputedReasonCounts: Record<string, number> = {};
    for (const t of allClosedTrades) {
      const status = t.calculated?.excursion?.status;
      if (status !== 'COMPUTED') {
        const reason = t.calculated?.excursion?.failureReason || status || 'PENDING';
        uncomputedReasonCounts[reason] = (uncomputedReasonCounts[reason] || 0) + 1;
      }
    }

    const formattedTrades: ITradeForExcursionAnalytics[] = allClosedTrades.map((t) => ({
      id: t._id.toString(),
      symbol: t.symbol,
      tradeDate: t.tradeDate,
      netPnL: t.calculated?.netPnL || 0,
      outcome: t.calculated?.outcome || 'BREAKEVEN',
      session: t.session,
      strategyId: t.strategyId?.toString(),
      variantKey: t.setup?.variantKey,
      mistakes: t.psychology?.mistakes,
      stopLossMoved: t.psychology?.stopLossMoved,
      assetClass: t.assetClass,
      underlying: t.underlying,
      optionType: t.optionType,
      strikePrice: t.strikePrice,
      tradeManagementPlan: (t as any).tradeManagementPlan,
      risk: t.risk,
      calculated: t.calculated as any,
    }));

    const result = calculateExcursionAggregates({
      allClosedTrades: formattedTrades,
      uncomputedReasonCounts,
      customMfeSteps,
      funnelMode,
    });

    // Provide legacy summary properties for seamless backward compatibility
    const legacySummary = {
      ...result.summary,
      avgMaeR: result.summary.maeR.mean !== undefined ? Number(result.summary.maeR.mean.toFixed(2)) : undefined,
      medianMaeR: result.summary.maeR.median !== undefined ? Number(result.summary.maeR.median.toFixed(2)) : undefined,
      p25MaeR: result.summary.maeR.p25 !== undefined ? Number(result.summary.maeR.p25.toFixed(2)) : undefined,
      p75MaeR: result.summary.maeR.p75 !== undefined ? Number(result.summary.maeR.p75.toFixed(2)) : undefined,
      avgMfeR: result.summary.mfeR.mean !== undefined ? Number(result.summary.mfeR.mean.toFixed(2)) : undefined,
      medianMfeR: result.summary.mfeR.median !== undefined ? Number(result.summary.mfeR.median.toFixed(2)) : undefined,
      avgExitEfficiency: result.summary.exitEfficiency.mean,
      medianExitEfficiency: result.summary.exitEfficiency.median,
      avgStopEfficiency: result.summary.stopEfficiency.mean,
      avgRLeftOnTable: result.summary.rLeftOnTable.mean !== undefined ? Number(result.summary.rLeftOnTable.mean.toFixed(2)) : undefined,
      medianRLeftOnTable: result.summary.rLeftOnTable.median !== undefined ? Number(result.summary.rLeftOnTable.median.toFixed(2)) : undefined,
      avgEntryQualityScore: result.summary.entryQualityScore?.mean !== undefined ? Number((result.summary.entryQualityScore.mean / 100).toFixed(2)) : undefined,
      heatFirstCount: result.summary.timeOrdering.heatFirstCount,
      runFirstCount: result.summary.timeOrdering.runFirstCount,
      heatFirstPercent: result.summary.timeOrdering.heatFirstPercent,
    };

    const slippageSummary = aggregateSlippageMetrics(allClosedTrades);

    return reply.send({
      success: true,
      data: {
        ...result,
        summary: legacySummary,
        slippage: slippageSummary,
      },
    });
  });

  // What-If Stop/Target Candle-Replay Simulation
  app.post('/what-if', async (req: any, reply) => {
    const parsed = whatIfRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid What-If simulation parameters',
          details: parsed.error.format(),
        },
      });
    }

    try {
      const result = await computeWhatIf(req.user!.id, parsed.data);
      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err instanceof WhatIfScopeTooLargeError || err.code === 'SCOPE_TOO_LARGE') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SCOPE_TOO_LARGE',
            message: err.message,
            details: {
              count: err.count,
              limit: err.limit,
            },
          },
        });
      }
      req.log.error(err, 'What-If simulation error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SIMULATION_ERROR',
          message: err.message || 'Internal simulation error occurred',
        },
      });
    }
  });

  // Dedicated Pyramiding & Scale-In Campaign Analytics
  app.get('/pyramiding', async (req: any, reply) => {
    const { startDate, endDate } = req.query;

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

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const filter: any = { userId: req.user!.id, accountId: { $in: accountIds } };

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    // Retrieve trades in scope, sorted chronologically
    const allTrades = await Trade.find(filter).sort({ entryTime: 1 }).lean();

    // 1. Group trades into campaigns:
    // First by explicit campaignId
    const campaignMap = new Map<string, any[]>();
    const unassignedTrades: any[] = [];

    for (const t of allTrades) {
      if (t.campaignId) {
        if (!campaignMap.has(t.campaignId)) {
          campaignMap.set(t.campaignId, []);
        }
        campaignMap.get(t.campaignId)!.push(t);
      } else {
        unassignedTrades.push(t);
      }
    }

    // 2. Smart Cluster Detection for legacy/unassigned trades (e.g. weekend ETH trades):
    const visited = new Set<string>();
    for (let i = 0; i < unassignedTrades.length; i++) {
      const base = unassignedTrades[i];
      const baseId = base._id.toString();
      if (visited.has(baseId)) continue;

      const cluster = [base];
      visited.add(baseId);

      const baseEntry = new Date(base.entryTime || base.tradeDate).getTime();
      const baseExit = base.exitTime ? new Date(base.exitTime).getTime() : Infinity;

      for (let j = i + 1; j < unassignedTrades.length; j++) {
        const candidate = unassignedTrades[j];
        const candId = candidate._id.toString();
        if (visited.has(candId)) continue;

        const sameAccount = String(candidate.accountId) === String(base.accountId);
        const sameSymbol = candidate.symbol === base.symbol;
        const sameDirection = candidate.direction === base.direction;

        if (sameAccount && sameSymbol && sameDirection) {
          const candEntry = new Date(candidate.entryTime || candidate.tradeDate).getTime();
          const candExit = candidate.exitTime ? new Date(candidate.exitTime).getTime() : Infinity;

          // Check if candidate opened while base was still open (or within 5 mins of exit), or exited together (within 120s)
          const openedWhileBaseOpen = candEntry >= baseEntry && candEntry <= baseExit + 300000;
          const exitedTogether = Math.abs(candExit - baseExit) <= 120000 && isFinite(baseExit);

          if (openedWhileBaseOpen || exitedTogether) {
            cluster.push(candidate);
            visited.add(candId);
          }
        }
      }

      if (cluster.length > 1) {
        const clusterCampId = `CMP_${base.symbol}_${baseId}`;
        campaignMap.set(clusterCampId, cluster);
      }
    }

    // 3. Compute Campaign Analytics
    const campaigns: any[] = [];
    let totalPyramidAlpha = 0;
    let totalCampaignPnL = 0;
    let totalBaseOnlyPnL = 0;
    let winningCampaignsCount = 0;
    let beProtectedCount = 0;

    for (const [campId, layerTrades] of campaignMap.entries()) {
      if (layerTrades.length < 2) continue; // Only multi-layer campaigns

      // Sort layers by entryTime
      layerTrades.sort((a, b) => new Date(a.entryTime || a.tradeDate).getTime() - new Date(b.entryTime || b.tradeDate).getTime());

      const baseTrade = layerTrades[0];
      const symbol = baseTrade.symbol;
      const direction = baseTrade.direction;

      let totalVolume = 0;
      let weightedEntrySum = 0;
      let campaignNetPnL = 0;
      let campaignGrossPnL = 0;
      let totalCosts = 0;

      const layers = layerTrades.map((t, idx) => {
        const qty = Number(t.simpleExecution?.quantity ?? t.calculated?.openQuantity ?? 1);
        const entry = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? 0);
        const exit = Number(t.simpleExecution?.exitPrice ?? t.calculated?.averageExitPrice ?? 0);
        const net = Number(t.calculated?.netPnL ?? 0);
        const gross = Number(t.calculated?.grossPnL ?? 0);
        const costs = Number(t.calculated?.totalCosts ?? 0);
        const rMult = t.calculated?.realizedRMultiple !== undefined ? Number(t.calculated.realizedRMultiple) : undefined;

        totalVolume += qty;
        weightedEntrySum += entry * qty;
        campaignNetPnL += net;
        campaignGrossPnL += gross;
        totalCosts += costs;

        // Check if base trade was BE protected when this layer was added
        const baseEntry = Number(baseTrade.simpleExecution?.entryPrice || 0);
        const baseSl = Number(baseTrade.risk?.currentStopLoss || 0);
        const isLong = direction === 'LONG';
        const isBeProtected = baseSl > 0 && (isLong ? baseSl >= baseEntry : baseSl <= baseEntry);

        return {
          id: t._id.toString(),
          ticket: t.tags?.find((tag: string) => tag.startsWith('MT5_TICKET_'))?.replace('MT5_TICKET_', '') || `#${idx + 1}`,
          layerIndex: idx,
          isParent: idx === 0,
          entryTime: t.entryTime || t.tradeDate,
          exitTime: t.exitTime,
          quantity: Number(qty.toFixed(2)),
          entryPrice: Number(entry.toFixed(2)),
          exitPrice: Number(exit.toFixed(2)),
          netPnL: Number(net.toFixed(2)),
          realizedR: rMult,
          isBeProtected: idx === 0 ? true : isBeProtected,
        };
      });

      const blendedEntry = totalVolume > 0 ? Number((weightedEntrySum / totalVolume).toFixed(2)) : 0;
      const baseEntry = Number(baseTrade.simpleExecution?.entryPrice ?? 0);
      const baseNetPnL = Number(baseTrade.calculated?.netPnL ?? 0);

      const baseOnlyPnL = Number(baseNetPnL.toFixed(2));
      const pyramidAlpha = Number((campaignNetPnL - baseOnlyPnL).toFixed(2));

      const allScaledLayersProtected = layers.slice(1).every((l) => l.isBeProtected);
      if (allScaledLayersProtected) beProtectedCount++;

      campaignNetPnL = Number(campaignNetPnL.toFixed(2));
      totalCampaignPnL += campaignNetPnL;
      totalBaseOnlyPnL += baseOnlyPnL;
      totalPyramidAlpha += pyramidAlpha;

      if (campaignNetPnL > 0) winningCampaignsCount++;

      const startTime = new Date(baseTrade.entryTime || baseTrade.tradeDate);
      const endTime = layerTrades[layerTrades.length - 1].exitTime
        ? new Date(layerTrades[layerTrades.length - 1].exitTime)
        : new Date();
      const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

      campaigns.push({
        campaignId: campId,
        symbol,
        direction,
        startTime,
        endTime,
        durationMinutes,
        layerCount: layerTrades.length,
        totalVolume: Number(totalVolume.toFixed(2)),
        blendedEntry,
        baseEntry,
        campaignNetPnL,
        baseOnlyPnL,
        pyramidAlpha,
        wasProtected: allScaledLayersProtected,
        status: layerTrades.every((t) => t.status === 'CLOSED') ? 'CLOSED' : 'OPEN',
        layers,
      });
    }

    // Sort campaigns descending by startTime
    campaigns.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const totalCampaigns = campaigns.length;
    const campaignWinRate = totalCampaigns > 0 ? Number(((winningCampaignsCount / totalCampaigns) * 100).toFixed(1)) : 0;
    const beProtectionRate = totalCampaigns > 0 ? Number(((beProtectedCount / totalCampaigns) * 100).toFixed(1)) : 0;
    const avgAlphaPerCampaign = totalCampaigns > 0 ? Number((totalPyramidAlpha / totalCampaigns).toFixed(2)) : 0;

    return reply.send({
      success: true,
      data: {
        summary: {
          totalCampaigns,
          winningCampaignsCount,
          campaignWinRate,
          totalCampaignPnL: Number(totalCampaignPnL.toFixed(2)),
          totalBaseOnlyPnL: Number(totalBaseOnlyPnL.toFixed(2)),
          totalPyramidAlpha: Number(totalPyramidAlpha.toFixed(2)),
          avgAlphaPerCampaign,
          beProtectionRate,
          avgLayersPerCampaign: totalCampaigns > 0 ? Number((campaigns.reduce((acc, c) => acc + c.layerCount, 0) / totalCampaigns).toFixed(1)) : 0,
        },
        campaigns,
      },
    });
  });

  // Dedicated Position Sizing Evolution & Diagnostics Analytics
  app.get('/sizing', async (req: any, reply) => {
    const { startDate, endDate, symbol } = req.query;

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

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const filter: any = { userId: req.user!.id, status: 'CLOSED', accountId: { $in: accountIds } };

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const trades = await Trade.find(filter).sort({ tradeDate: 1, entryTime: 1 }).lean();

    // Collect all unique traded symbols available in this account scope
    const availableSymbols = Array.from(
      new Set(trades.map((t: any) => (t.symbol || '').toUpperCase().trim()).filter(Boolean))
    ).sort();

    // Filter by specific symbol if selected
    const activeTrades = symbol && symbol !== 'ALL'
      ? trades.filter((t: any) => (t.symbol || '').toUpperCase().trim() === String(symbol).toUpperCase().trim())
      : trades;

    const tradeInputs: SizingAnalyticsTradeInput[] = activeTrades.map((t: any) => {
      let qty = t.simpleExecution?.quantity ?? t.calculated?.closedQuantity ?? t.calculated?.openQuantity ?? 0;
      if (!qty && Array.isArray(t.fills) && t.fills.length > 0) {
        qty = t.fills
          .filter((f: any) => f.fillType === 'ENTRY')
          .reduce((acc: number, f: any) => acc + (f.quantity || 0), 0);
      }
      return {
        id: t._id.toString(),
        tradeDate: t.tradeDate,
        entryTime: t.entryTime || t.tradeDate,
        symbol: t.symbol,
        direction: t.direction,
        quantity: qty,
        netPnL: t.calculated?.netPnL ?? 0,
        grossPnL: t.calculated?.grossPnL,
        realizedRMultiple: t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple,
        disciplineScore: t.psychology?.disciplineScore,
        status: t.status,
      };
    });

    const diagnostics = calculatePositionSizingDiagnostics(tradeInputs);

    return reply.send({
      success: true,
      data: {
        ...diagnostics,
        availableSymbols,
        selectedSymbol: symbol || 'ALL',
      },
    });
  });

  // Dedicated Forex & Market Session "Kill-Zone" Performance Analytics
  app.get('/killzones', async (req: any, reply) => {
    const { startDate, endDate, symbol } = req.query;

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

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const filter: any = { userId: req.user!.id, status: 'CLOSED', accountId: { $in: accountIds } };

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const trades = await Trade.find(filter).sort({ tradeDate: 1, entryTime: 1 }).lean();

    // Unique symbols in this account scope
    const availableSymbols = Array.from(
      new Set(trades.map((t: any) => (t.symbol || '').toUpperCase().trim()).filter(Boolean))
    ).sort();

    const activeTrades = symbol && symbol !== 'ALL'
      ? trades.filter((t: any) => (t.symbol || '').toUpperCase().trim() === String(symbol).toUpperCase().trim())
      : trades;

    const tradeInputs: KillZoneTradeInput[] = activeTrades.map((t: any) => ({
      id: t._id.toString(),
      symbol: t.symbol,
      exchange: t.exchange,
      marketSegment: t.marketSegment,
      entryTime: t.entryTime || t.tradeDate,
      tradeDate: t.tradeDate,
      exitTime: t.exitTime,
      netPnL: t.calculated?.netPnL ?? 0,
      grossPnL: t.calculated?.grossPnL,
      realizedR: t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple,
      tags: t.tags,
      status: t.status,
    }));

    const report = calculateKillZoneAnalytics(tradeInputs);

    return reply.send({
      success: true,
      data: {
        ...report,
        availableSymbols,
        selectedSymbol: symbol || 'ALL',
      },
    });
  });
};
