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
  calculateActionableSummary,
  IActionableSummaryTradeInput,
} from '@tradevault/financial-engine';
import { AccountScopeService, resolveAccountContext } from '../services/account-scope.service.js';
import { AnalyticsAiAdvisorService } from '../services/analytics-ai-advisor.service.js';

function applyCommonAnalyticsFilters(filter: any, query: any) {
  const { symbol, direction, session, strategyId } = query || {};
  if (symbol && symbol !== 'ALL') {
    filter.symbol = { $regex: new RegExp(`^${String(symbol).trim()}$`, 'i') };
  }
  if (direction && direction !== 'ALL') {
    const dirUpper = String(direction).toUpperCase().trim();
    if (dirUpper === 'LONG' || dirUpper === 'BUY') {
      filter.direction = { $in: ['LONG', 'BUY'] };
    } else if (dirUpper === 'SHORT' || dirUpper === 'SELL') {
      filter.direction = { $in: ['SHORT', 'SELL'] };
    } else {
      filter.direction = direction;
    }
  }
  if (session && session !== 'ALL') {
    filter.session = session;
  }
  if (strategyId && strategyId !== 'ALL') {
    filter.strategyId = strategyId;
  }
}

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/psychology', async (req: any, reply) => {
    const { startDate, endDate, accountId, symbol } = req.query;

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
    applyCommonAnalyticsFilters(filter, req.query);
    applyCommonAnalyticsFilters(filter, req.query);

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const availableSymbols = Array.from(
      new Set(
        (
          await Trade.find({ userId: req.user!.id, accountId: { $in: accountIds } })
            .distinct('symbol')
        )
          .map((s: any) => String(s || '').toUpperCase().trim())
          .filter(Boolean)
      )
    ).sort();

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
        availableSymbols,
        selectedSymbol: symbol || 'ALL',
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

    const { accountId, strategyId, variantKey, startDate, endDate, session, customMfeSteps, funnelMode, symbol } = parsed.data;

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const baseFilter: any = {
      userId: req.user!.id,
      status: 'CLOSED',
      accountId: { $in: accountIds },
    };

    if (symbol && symbol !== 'ALL') {
      baseFilter.symbol = { $regex: new RegExp(`^${String(symbol).trim()}$`, 'i') };
    }
    if (strategyId && strategyId !== 'ALL') baseFilter.strategyId = strategyId;
    if (variantKey) baseFilter['setup.variantKey'] = variantKey;
    if (session && (session as string) !== 'ALL') baseFilter.session = session;
    if (req.query.direction && req.query.direction !== 'ALL') {
      const dirUpper = String(req.query.direction).toUpperCase().trim();
      if (dirUpper === 'LONG' || dirUpper === 'BUY') {
        baseFilter.direction = { $in: ['LONG', 'BUY'] };
      } else if (dirUpper === 'SHORT' || dirUpper === 'SELL') {
        baseFilter.direction = { $in: ['SHORT', 'SELL'] };
      } else {
        baseFilter.direction = req.query.direction;
      }
    }
    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      baseFilter.tradeDate = dateClause.tradeDate;
    }

    const availableSymbols = Array.from(
      new Set(
        (
          await Trade.find({ userId: req.user!.id, accountId: { $in: accountIds }, status: 'CLOSED' })
            .distinct('symbol')
        )
          .map((s: any) => String(s || '').toUpperCase().trim())
          .filter(Boolean)
      )
    ).sort();

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
      avgPostExitRunBeyondExitR: result.summary.postExitRunBeyondExitR?.mean !== undefined ? Number(result.summary.postExitRunBeyondExitR.mean.toFixed(2)) : undefined,
      medianPostExitRunBeyondExitR: result.summary.postExitRunBeyondExitR?.median !== undefined ? Number(result.summary.postExitRunBeyondExitR.median.toFixed(2)) : undefined,
      avgPostExitMfeR: result.summary.postExitMfeR?.mean !== undefined ? Number(result.summary.postExitMfeR.mean.toFixed(2)) : undefined,
      medianPostExitMfeR: result.summary.postExitMfeR?.median !== undefined ? Number(result.summary.postExitMfeR.median.toFixed(2)) : undefined,
      runnerLeftOnTableCount: result.summary.runnerLeftOnTableCount ?? 0,
      prematureExitCount: result.summary.prematureExitCount ?? 0,
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
        availableSymbols,
        selectedSymbol: symbol || 'ALL',
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

    const filter: any = { userId: req.user!.id, accountId: { $in: accountIds } };
    applyCommonAnalyticsFilters(filter, req.query);

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const availableSymbols = Array.from(
      new Set(
        (
          await Trade.find({ userId: req.user!.id, accountId: { $in: accountIds } })
            .distinct('symbol')
        )
          .map((s: any) => String(s || '').toUpperCase().trim())
          .filter(Boolean)
      )
    ).sort();

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
        availableSymbols,
        selectedSymbol: symbol || 'ALL',
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
    applyCommonAnalyticsFilters(filter, req.query);

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
        exitTime: t.exitTime || (Array.isArray(t.fills) && t.fills.find((f: any) => f.fillType === 'EXIT')?.timestamp) || undefined,
        symbol: t.symbol,
        direction: t.direction,
        quantity: qty,
        netPnL: t.calculated?.netPnL ?? 0,
        grossPnL: t.calculated?.grossPnL,
        realizedRMultiple: t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple,
        disciplineScore: t.psychology?.disciplineScore,
        status: t.status,
        strategyId: t.strategyId?.toString(),
        strategyName: t.strategyName || t.setup?.setupName,
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
    applyCommonAnalyticsFilters(filter, req.query);

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

  // Dedicated Gold & Macro News Catalyst Impact Analytics
  app.get('/news-impact', async (req: any, reply) => {
    const { startDate, endDate, symbol, newsWindowMinutes, catalystTier } = req.query;

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
    applyCommonAnalyticsFilters(filter, req.query);

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const trades = await Trade.find(filter).sort({ tradeDate: 1, entryTime: 1 }).lean();

    // Available symbols
    const availableSymbols = Array.from(
      new Set(trades.map((t: any) => (t.symbol || '').toUpperCase().trim()).filter(Boolean))
    ).sort();

    const activeTrades = symbol && symbol !== 'ALL'
      ? trades.filter((t: any) => (t.symbol || '').toUpperCase().trim() === String(symbol).toUpperCase().trim())
      : trades;

    // Adaptive catalyst window (15m, 30m, 60m, 120m) & event tiers
    const windowMins = Math.max(5, Math.min(240, Number(newsWindowMinutes) || 30));
    const tier = catalystTier === 'TIER_1' ? 'TIER_1' : 'ALL';

    // Identify trades taken around high-impact news catalysts vs calm conditions
    const newsRegex = tier === 'TIER_1'
      ? /CPI|NFP|FOMC|POWELL|FED|RATE|PAYROLL/i
      : /NEWS|CPI|NFP|FOMC|FED|PPI|RATE|POWELL|CATALYST|PAYROLL|GDP|UNEMPLOYMENT|RETAIL|PMI|ISM/i;
    
    // Macro release UTC minutes:
    // Tier 1 releases: 12:30 UTC (750m), 13:30 UTC (810m), 18:00 UTC (1080m), 18:30 UTC (1110m)
    // All releases: + 14:00 UTC (840m), 19:00 UTC (1140m), 12:00 UTC (720m)
    const targets = tier === 'TIER_1'
      ? [750, 810, 1080, 1110]
      : [720, 750, 810, 840, 1080, 1110, 1140, 1200];

    const isMacroReleaseTime = (dateObj: Date) => {
      const day = dateObj.getUTCDay();
      if (day === 0 || day === 6) return false;
      const mins = dateObj.getUTCHours() * 60 + dateObj.getUTCMinutes();
      return targets.some((t) => Math.abs(mins - t) <= windowMins);
    };

    const newsTrades: any[] = [];
    const calmTrades: any[] = [];

    for (const t of activeTrades) {
      const entryDate = new Date(t.entryTime || t.tradeDate);
      const tagsStr = (t.tags || []).join(' ');
      const notesStr = String((t as any).notes || t.psychology?.notes || '') + ' ' + String((t as any).setupName || '') + ' ' + String(t.strategyName || '');
      const isExplicitNews = newsRegex.test(tagsStr) || newsRegex.test(notesStr);
      const isNewsTiming = isMacroReleaseTime(entryDate);

      if (isExplicitNews || isNewsTiming) {
        newsTrades.push({ ...t, newsTag: isExplicitNews ? 'EXPLICIT_NEWS' : 'RELEASE_WINDOW' });
      } else {
        calmTrades.push(t);
      }
    }

    const calcCohort = (tList: any[]) => {
      let netPnL = 0;
      let grossPnL = 0;
      let wins = 0;
      let losses = 0;
      let sumWin = 0;
      let sumLoss = 0;
      let sumR = 0;
      let rCount = 0;
      let totalSwap = 0;
      let totalSpreadCost = 0;

      for (const tr of tList) {
        const net = Number(tr.calculated?.netPnL ?? 0);
        const gross = Number(tr.calculated?.grossPnL ?? net);
        const r = tr.calculated?.realizedRMultiple ?? tr.risk?.realizedRMultiple;
        const swap = Number(tr.simpleExecution?.otherFees ?? 0);
        const spreadCost = Number(tr.simpleExecution?.spreadCost ?? 0);

        netPnL += net;
        grossPnL += gross;
        totalSwap += swap;
        totalSpreadCost += spreadCost;

        if (net > 0) {
          wins++;
          sumWin += net;
        } else if (net < 0) {
          losses++;
          sumLoss += Math.abs(net);
        }

        if (typeof r === 'number' && Number.isFinite(r)) {
          sumR += r;
          rCount++;
        }
      }

      const total = tList.length;
      const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0;
      const profitFactor = sumLoss > 0 ? Number((sumWin / sumLoss).toFixed(2)) : (sumWin > 0 ? 999.99 : 0);
      const avgWin = wins > 0 ? Number((sumWin / wins).toFixed(2)) : 0;
      const avgLoss = losses > 0 ? Number((sumLoss / losses).toFixed(2)) : 0;
      const avgR = rCount > 0 ? Number((sumR / rCount).toFixed(2)) : 0;
      const expectancy = total > 0 ? Number((netPnL / total).toFixed(2)) : 0;

      return {
        tradeCount: total,
        tradeIds: tList.map((t: any) => t._id.toString()),
        winCount: wins,
        lossCount: losses,
        winRate,
        netPnL: Number(netPnL.toFixed(2)),
        grossPnL: Number(grossPnL.toFixed(2)),
        profitFactor,
        avgWin,
        avgLoss,
        avgR,
        expectancy,
        totalSwap: Number(totalSwap.toFixed(2)),
        totalSpreadCost: Number(totalSpreadCost.toFixed(2)),
      };
    };

    const newsStats = calcCohort(newsTrades);
    const calmStats = calcCohort(calmTrades);
    const overallStats = calcCohort(activeTrades);

    // Friction summary (Spread & Swap)
    const totalFrictionCost = Number((overallStats.totalSwap + overallStats.totalSpreadCost).toFixed(2));
    const friction = {
      totalSwap: overallStats.totalSwap,
      totalSpreadCost: overallStats.totalSpreadCost,
      totalFrictionCost,
      frictionSharePercent: overallStats.grossPnL !== 0
        ? Number(((totalFrictionCost / Math.abs(overallStats.grossPnL)) * 100).toFixed(1))
        : 0,
    };

    return reply.send({
      success: true,
      data: {
        symbol: symbol || 'ALL',
        availableSymbols,
        newsStats,
        calmStats,
        overallStats,
        friction,
        activeWindowMinutes: windowMins,
        activeTier: tier,
      },
    });
  });

  // Dedicated Actionable Analytics Summary & Playbook ("Do's & Don'ts" Engine)
  app.get('/summary', async (req: any, reply) => {
    const { startDate, endDate, symbol, timezone } = req.query;

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
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const accountIds = accountCtx.accountIds;

    const filter: any = { userId: req.user!.id, status: 'CLOSED', accountId: { $in: accountIds } };
    applyCommonAnalyticsFilters(filter, req.query);

    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    const trades = await Trade.find(filter)
      .sort({ tradeDate: 1, entryTime: 1 })
      .populate('strategyId', 'name')
      .lean();

    // Unique symbols in this account scope
    const availableSymbols = Array.from(
      new Set(
        (
          await Trade.find({ userId: req.user!.id, accountId: { $in: accountIds } })
            .distinct('symbol')
        )
          .map((s: any) => String(s || '').toUpperCase().trim())
          .filter(Boolean)
      )
    ).sort();

    const activeTrades = symbol && symbol !== 'ALL'
      ? trades.filter((t: any) => (t.symbol || '').toUpperCase().trim() === String(symbol).toUpperCase().trim())
      : trades;

    const tradeInputs: IActionableSummaryTradeInput[] = activeTrades.map((t: any) => {
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
        exitTime: t.exitTime,
        symbol: t.symbol,
        direction: t.direction,
        currency: (t.currency || 'USD').toUpperCase(),
        strategyId: t.strategyId?._id ? t.strategyId._id.toString() : (t.strategyId ? t.strategyId.toString() : undefined),
        strategyName: t.strategyId?.name || t.strategyName || 'Discretionary',
        status: t.status,
        session: t.session,
        assetClass: t.assetClass,
        quantity: qty,
        calculated: {
          netPnL: t.calculated?.netPnL ?? 0,
          grossPnL: t.calculated?.grossPnL,
          totalCosts: t.calculated?.totalCosts,
          realizedRMultiple: t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple,
          holdingTimeMinutes: t.calculated?.holdingTimeMinutes,
          outcome: t.calculated?.outcome,
          excursion: t.calculated?.excursion ? {
            maeR: t.calculated.excursion.maeR,
            mfeR: t.calculated.excursion.mfeR,
            exitEfficiency: t.calculated.excursion.exitEfficiency,
            reversedAfterStopHit: t.calculated.excursion.reversedAfterStopHit,
            stopHit: t.calculated.excursion.stopHit,
          } : undefined,
        },
        risk: t.risk ? {
          plannedRiskAmount: t.risk.plannedRiskAmount,
          riskPercent: t.risk.riskPercent,
          initialStopLoss: t.risk.initialStopLoss,
          currentStopLoss: t.risk.currentStopLoss,
          plannedTarget: t.risk.plannedTarget,
        } : undefined,
        psychology: t.psychology ? {
          disciplineScore: t.psychology.disciplineScore,
          emotionBefore: t.psychology.emotionBefore,
          rulesFollowed: t.psychology.rulesFollowed,
          mistakes: t.psychology.mistakes,
          stopLossMoved: t.psychology.stopLossMoved,
          revengeTrading: t.psychology.revengeTrading,
          overtrading: t.psychology.overtrading,
          prematureExit: t.psychology.prematureExit,
          positionSizeViolation: t.psychology.positionSizeViolation,
        } : undefined,
      };
    });

    const primaryCurrency = (accountCtx.primaryCurrency && accountCtx.primaryCurrency !== 'MULTI' ? accountCtx.primaryCurrency : null) || tradeInputs[0]?.currency || 'USD';
    const effectiveTz = timezone || accountCtx.primaryTimezone || 'Asia/Kolkata';

    const report = calculateActionableSummary(tradeInputs, {
      currency: primaryCurrency,
      timezone: effectiveTz,
    });

    return reply.send({
      success: true,
      data: {
        ...report,
        availableSymbols,
        selectedSymbol: symbol || 'ALL',
        currency: primaryCurrency,
        isMultiCurrency: accountCtx.isMultiCurrency,
      },
    });
  });

  // Comprehensive AI Analytics Advisor & Quantitative Desk Audit
  app.post('/ai-audit', async (req: any, reply) => {
    const scope = (req.headers['x-account-scope'] as string) || (req.query?.scope as string) || req.body?.scope;
    const { startDate, endDate, symbol, direction, session, strategyId, forceRegenerate } = req.body || {};

    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const accountIds = accountCtx.accountIds;

    const filter: any = {
      userId: req.user!.id,
      accountId: { $in: accountIds },
      status: 'CLOSED',
    };

    if (startDate || endDate) {
      const dateClause = buildDateRangeClause(startDate, endDate);
      if (dateClause) Object.assign(filter, dateClause);
    }

    applyCommonAnalyticsFilters(filter, { symbol, direction, session, strategyId });

    const trades = await Trade.find(filter).sort({ tradeDate: -1, exitTime: -1 }).lean();

    const primaryCurrency = (accountCtx.primaryCurrency && accountCtx.primaryCurrency !== 'MULTI' ? accountCtx.primaryCurrency : null) || trades[0]?.currency || 'USD';

    const filterParts: string[] = [];
    if (symbol && symbol !== 'ALL') filterParts.push(`Symbol: ${symbol}`);
    if (direction && direction !== 'ALL') filterParts.push(`Direction: ${direction}`);
    if (session && session !== 'ALL') filterParts.push(`Session: ${session}`);
    if (strategyId && strategyId !== 'ALL') filterParts.push(`Strategy: ${strategyId}`);
    if (startDate && endDate) filterParts.push(`Period: ${startDate} to ${endDate}`);

    const audit = await AnalyticsAiAdvisorService.generateAudit({
      userId: req.user!.id,
      trades,
      scopeCurrency: primaryCurrency,
      scopeLabel: typeof scope === 'string' ? scope : undefined,
      filterSummary: filterParts.length > 0 ? filterParts.join(', ') : undefined,
      forceRegenerate: Boolean(forceRegenerate),
    });

    return reply.send({
      success: true,
      data: audit,
    });
  });
};
