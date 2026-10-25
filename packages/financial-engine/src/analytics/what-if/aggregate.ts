import Decimal from 'decimal.js';
import { IWhatIfCellStats } from '@tradevault/shared';
import { IWhatIfTradeCellSimulation } from './types.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Aggregates simulation results across all in-scope trades for a single cell.
 * Implements Section 1.11 (apples-to-apples baseline on identical evaluable subset)
 * and Section 2.
 */
export function aggregateCell(simulations: IWhatIfTradeCellSimulation[]): IWhatIfCellStats {
  const total = simulations.length;
  const evaluables = simulations.filter((s) => s.status === 'EVALUABLE');
  const nEval = evaluables.length;
  const nCensored = total - nEval;

  if (nEval === 0) {
    return {
      nEval: 0,
      nCensored,
      nAmbiguous: 0,
      meanR_pess: 0,
      meanR_opt: 0,
      meanR_actual_sameSubset: 0,
      totalNet_pess: 0,
      totalNet_opt: 0,
      totalNet_actual: 0,
      winRate_pess: 0,
      winRate_opt: 0,
      profitFactor_pess: 0,
      profitFactor_opt: 0,
      stopHitRate: 0,
      targetHitRate: 0,
      exitsByPartialCandle: 0,
    };
  }

  let sumR_pess = new Decimal(0);
  let sumR_opt = new Decimal(0);
  let sumR_actual = new Decimal(0);

  let totalNet_pess = new Decimal(0);
  let totalNet_opt = new Decimal(0);
  let totalNet_actual = new Decimal(0);

  let winsPess = 0;
  let winsOpt = 0;

  let grossWinPess = new Decimal(0);
  let grossLossPess = new Decimal(0);
  let grossWinOpt = new Decimal(0);
  let grossLossOpt = new Decimal(0);

  let stopHits = 0;
  let targetHits = 0;
  let exitsByPartialCandle = 0;
  let nAmbiguous = 0;

  for (const s of evaluables) {
    if (s.ambiguous) nAmbiguous++;

    sumR_pess = sumR_pess.plus(s.pess.r);
    sumR_opt = sumR_opt.plus(s.opt.r);
    sumR_actual = sumR_actual.plus(s.actualSameSubset.r);

    totalNet_pess = totalNet_pess.plus(s.pess.netPnL);
    totalNet_opt = totalNet_opt.plus(s.opt.netPnL);
    totalNet_actual = totalNet_actual.plus(s.actualSameSubset.netPnL);

    if (s.pess.netPnL.greaterThan(0)) {
      winsPess++;
      grossWinPess = grossWinPess.plus(s.pess.netPnL);
    } else if (s.pess.netPnL.lessThan(0)) {
      grossLossPess = grossLossPess.plus(s.pess.netPnL.abs());
    }

    if (s.opt.netPnL.greaterThan(0)) {
      winsOpt++;
      grossWinOpt = grossWinOpt.plus(s.opt.netPnL);
    } else if (s.opt.netPnL.lessThan(0)) {
      grossLossOpt = grossLossOpt.plus(s.opt.netPnL.abs());
    }

    if (s.pess.outcome === 'STOP') stopHits++;
    if (s.opt.outcome === 'TARGET') targetHits++;

    if (s.pess.viaPartialCandle || s.opt.viaPartialCandle) {
      exitsByPartialCandle++;
    }
  }

  const dNEval = new Decimal(nEval);

  const meanR_pess = sumR_pess.dividedBy(dNEval).toNumber();
  const meanR_opt = sumR_opt.dividedBy(dNEval).toNumber();
  const meanR_actual_sameSubset = sumR_actual.dividedBy(dNEval).toNumber();

  const winRate_pess = Number(((winsPess / nEval) * 100).toFixed(2));
  const winRate_opt = Number(((winsOpt / nEval) * 100).toFixed(2));

  // Profit factor with 999.99 convention
  let profitFactor_pess = 0;
  if (grossLossPess.isZero()) {
    profitFactor_pess = grossWinPess.isZero() ? 0 : 999.99;
  } else {
    profitFactor_pess = Number(grossWinPess.dividedBy(grossLossPess).toFixed(2));
  }

  let profitFactor_opt = 0;
  if (grossLossOpt.isZero()) {
    profitFactor_opt = grossWinOpt.isZero() ? 0 : 999.99;
  } else {
    profitFactor_opt = Number(grossWinOpt.dividedBy(grossLossOpt).toFixed(2));
  }

  const stopHitRate = Number(((stopHits / nEval) * 100).toFixed(2));
  const targetHitRate = Number(((targetHits / nEval) * 100).toFixed(2));

  return {
    nEval,
    nCensored,
    nAmbiguous,
    meanR_pess: Number(meanR_pess.toFixed(4)),
    meanR_opt: Number(meanR_opt.toFixed(4)),
    meanR_actual_sameSubset: Number(meanR_actual_sameSubset.toFixed(4)),
    totalNet_pess: Number(totalNet_pess.toFixed(2)),
    totalNet_opt: Number(totalNet_opt.toFixed(2)),
    totalNet_actual: Number(totalNet_actual.toFixed(2)),
    winRate_pess,
    winRate_opt,
    profitFactor_pess,
    profitFactor_opt,
    stopHitRate,
    targetHitRate,
    exitsByPartialCandle,
  };
}
