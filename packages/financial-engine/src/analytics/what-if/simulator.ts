import Decimal from 'decimal.js';
import {
  IWhatIfCellResult,
  IWhatIfBaseline,
  IWhatIfDrillDescriptors,
  IWhatIfScope,
  IWhatIfCalibration,
  IWhatIfResponse,
  IWhatIfExclusionsCount,
} from '@tradevault/shared';
import {
  IWhatIfTradeInput,
  IWhatIfSnapshotInput,
  IWhatIfEligibleTrade,
  IWhatIfEngineOptions,
  IWhatIfTradeCellSimulation,
} from './types.js';
import { classifyEligibility } from './eligibility.js';
import { simulateTradeCell } from './cell-result.js';
import { aggregateCell } from './aggregate.js';
import { computePairedDifferencesAndVerdict } from './paired-difference.js';
import { splitChronologicalHoldout, checkHoldsOutOfSample } from './holdout.js';
import { runCalibrationCheck } from './calibration.js';
import { computeWhatIfExcursionDistributions } from './excursion-distribution.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IRunWhatIfSimulationParams {
  trades: IWhatIfTradeInput[];
  snapshotsByTradeId: Map<string, IWhatIfSnapshotInput>;
  options: IWhatIfEngineOptions;
  scopeKey?: string;
}

/**
 * Main coordinator for What-If Candle-Replay Simulation.
 * Pure, deterministic, zero Date.now() / DOM dependencies.
 */
export function runWhatIfSimulation(params: IRunWhatIfSimulationParams): IWhatIfResponse {
  const { trades, snapshotsByTradeId, options, scopeKey = 'whatif' } = params;

  // 1. Classification & Eligibility
  const eligibleTrades: IWhatIfEligibleTrade[] = [];
  const exclusionsCount: IWhatIfExclusionsCount = {
    EXCLUDED_MULTI_FILL: 0,
    EXCLUDED_NO_STOP: 0,
    EXCLUDED_NO_CANDLES: 0,
    EXCLUDED_UNDERLYING_FALLBACK: 0,
    EXCLUDED_MANAGED_STOP: 0,
    EXCLUDED_OTHER: 0,
  };

  const exclusionDrillMap: IWhatIfDrillDescriptors['exclusions'] = {
    EXCLUDED_MULTI_FILL: { count: 0, tradeIds: [], trades: [] },
    EXCLUDED_NO_STOP: { count: 0, tradeIds: [], trades: [] },
    EXCLUDED_NO_CANDLES: { count: 0, tradeIds: [], trades: [] },
    EXCLUDED_UNDERLYING_FALLBACK: { count: 0, tradeIds: [], trades: [] },
    EXCLUDED_MANAGED_STOP: { count: 0, tradeIds: [], trades: [] },
    EXCLUDED_OTHER: { count: 0, tradeIds: [], trades: [] },
  };

  const resolutionCounts: Record<string, number> = {};
  const costModelCounts: Record<string, number> = { RECOMPUTED: 0, ACTUAL_FALLBACK: 0 };

  for (const trade of trades) {
    const tradeId = (trade._id?.toString() || trade.id || '').toString();
    const snapshot = snapshotsByTradeId.get(tradeId);

    const eligibility = classifyEligibility(trade, snapshot, {
      excludeManagedStopTrades: options.excludeManagedStopTrades,
      resolutionPolicy: options.resolutionPolicy,
    });

    if (eligibility.eligible) {
      eligibleTrades.push(eligibility.input);
      const res = eligibility.input.resolution;
      resolutionCounts[res] = (resolutionCounts[res] || 0) + 1;
    } else {
      const reason = eligibility.reason;
      exclusionsCount[reason] = (exclusionsCount[reason] || 0) + 1;

      const drill = exclusionDrillMap[reason];
      drill.count++;
      drill.tradeIds.push(tradeId);
      if (drill.trades && drill.trades.length < 50) {
        drill.trades.push({
          tradeId,
          symbol: trade.symbol,
          direction: trade.direction,
          entryTime: new Date(trade.entryTime).toISOString(),
          exitTime: trade.exitTime ? new Date(trade.exitTime).toISOString() : undefined,
          entryPrice: trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0,
          actualExitPrice: trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice ?? 0,
          initialStopLoss: trade.risk?.initialStopLoss,
          plannedTarget: trade.risk?.plannedTarget,
          realizedR: trade.calculated?.realizedRMultiple,
          reason: eligibility.details,
        });
      }
    }
  }

  // 2. Chronological Holdout Split
  const holdoutSplit = splitChronologicalHoldout(eligibleTrades, options.holdoutFraction);

  // 3. Calibration Check (Identity Gate)
  const calibration: IWhatIfCalibration = runCalibrationCheck(eligibleTrades, {
    fillModel: options.fillModel,
    slippageTicks: options.slippageTicks,
  });

  // 4. Baseline Computation on all eligible trades
  let sumBaselineNet = new Decimal(0);
  let sumBaselineR = new Decimal(0);
  let baselineWins = 0;
  let grossWinBaseline = new Decimal(0);
  let grossLossBaseline = new Decimal(0);

  for (const t of eligibleTrades) {
    sumBaselineNet = sumBaselineNet.plus(t.actualNetPnL);
    sumBaselineR = sumBaselineR.plus(t.actualR);
    if (t.actualNetPnL.greaterThan(0)) {
      baselineWins++;
      grossWinBaseline = grossWinBaseline.plus(t.actualNetPnL);
    } else if (t.actualNetPnL.lessThan(0)) {
      grossLossBaseline = grossLossBaseline.plus(t.actualNetPnL.abs());
    }
  }

  const nEligible = eligibleTrades.length;
  let baselineProfitFactor = 0;
  if (grossLossBaseline.isZero()) {
    baselineProfitFactor = grossWinBaseline.isZero() ? 0 : 999.99;
  } else {
    baselineProfitFactor = Number(grossWinBaseline.dividedBy(grossLossBaseline).toFixed(2));
  }

  const baseline: IWhatIfBaseline = {
    nEligible,
    meanR_actual: nEligible > 0 ? Number(sumBaselineR.dividedBy(nEligible).toFixed(4)) : 0,
    totalNet_actual: Number(sumBaselineNet.toFixed(2)),
    winRate_actual: nEligible > 0 ? Number(((baselineWins / nEligible) * 100).toFixed(2)) : 0,
    profitFactor_actual: baselineProfitFactor,
  };

  // 5. Grid Simulation
  const cells: IWhatIfCellResult[] = [];
  const ambiguousDrillList: IWhatIfDrillDescriptors['ambiguous'] = [];
  const censoredDrillList: IWhatIfDrillDescriptors['censored'] = [];

  for (const stopR of options.stopRGrid) {
    for (const targetR of options.targetRGrid) {
      const tradeSimulations: IWhatIfTradeCellSimulation[] = [];

      for (const trade of eligibleTrades) {
        const sim = simulateTradeCell({
          trade,
          stopR,
          targetR,
          options: {
            fillModel: options.fillModel,
            slippageTicks: options.slippageTicks,
          },
        });
        tradeSimulations.push(sim);

        if (sim.costModel === 'ACTUAL_FALLBACK') {
          costModelCounts.ACTUAL_FALLBACK++;
        } else {
          costModelCounts.RECOMPUTED++;
        }
      }

      // Track Ambiguous & Censored trade IDs
      const ambiguousTradeIds = tradeSimulations
        .filter((s) => s.status === 'EVALUABLE' && s.ambiguous)
        .map((s) => s.tradeId);
      if (ambiguousTradeIds.length > 0) {
        ambiguousDrillList.push({
          stopR,
          targetR,
          count: ambiguousTradeIds.length,
          tradeIds: ambiguousTradeIds,
        });
      }

      const censoredTradeIds = tradeSimulations
        .filter((s) => s.status === 'CENSORED')
        .map((s) => s.tradeId);
      if (censoredTradeIds.length > 0) {
        censoredDrillList.push({
          stopR,
          targetR,
          count: censoredTradeIds.length,
          tradeIds: censoredTradeIds,
        });
      }

      // Partition simulations into In-Sample and Holdout
      const inSampleSims = tradeSimulations.filter((s) =>
        holdoutSplit.inSampleTradeIds.has(s.tradeId)
      );
      const holdoutSims = tradeSimulations.filter((s) =>
        holdoutSplit.holdoutTradeIds.has(s.tradeId)
      );

      // Aggregate statistics
      const allStats = aggregateCell(tradeSimulations);
      const inSampleStats = aggregateCell(inSampleSims);
      const holdoutStats = aggregateCell(holdoutSims);

      // Paired bootstrap differences and verdicts
      const bootstrapAll = computePairedDifferencesAndVerdict(
        tradeSimulations,
        stopR,
        targetR,
        `${scopeKey}_ALL`,
        10_000
      );

      const bootstrapInSample = computePairedDifferencesAndVerdict(
        inSampleSims,
        stopR,
        targetR,
        `${scopeKey}_IN`,
        10_000
      );

      const bootstrapHoldout = computePairedDifferencesAndVerdict(
        holdoutSims,
        stopR,
        targetR,
        `${scopeKey}_HOLD`,
        10_000
      );

      const holdsOutOfSample = checkHoldsOutOfSample(
        bootstrapInSample.verdict,
        bootstrapHoldout.verdict,
        holdoutStats.nEval
      );

      cells.push({
        stopR,
        targetR,
        all: allStats,
        inSample: inSampleStats,
        holdout: holdoutStats,
        verdict: bootstrapAll.verdict,
        holdsOutOfSample,
        bootstrapIntervalPess: bootstrapAll.intervalPess,
        bootstrapIntervalOpt: bootstrapAll.intervalOpt,
      });
    }
  }

  // 6. Winners' MAE & All Trades' MFE distributions
  const excursionDists = computeWhatIfExcursionDistributions(eligibleTrades);

  const scope: IWhatIfScope = {
    tradesInScope: trades.length,
    nEligible,
    exclusions: exclusionsCount,
    resolutionCounts,
    costModelCounts,
  };

  const drillDescriptors: IWhatIfDrillDescriptors = {
    ambiguous: ambiguousDrillList,
    censored: censoredDrillList,
    exclusions: exclusionDrillMap,
  };

  return {
    meta: {
      filters: {},
      fillModel: options.fillModel,
      slippageTicks: options.slippageTicks,
      resolutionPolicy: options.resolutionPolicy,
      excludeManagedStopTrades: options.excludeManagedStopTrades,
      holdoutFraction: options.holdoutFraction,
      generatedAt: new Date().toISOString(),
    },
    scope,
    calibration,
    baseline,
    cells,
    drillDescriptors,
    winnersMaeDistribution: excursionDists.winnersMaeDistribution,
    allTradesMfeDistribution: excursionDists.allTradesMfeDistribution,
  };
}
