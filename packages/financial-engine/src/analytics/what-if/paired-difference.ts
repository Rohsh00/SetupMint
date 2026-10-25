import { WhatIfVerdict, MIN_RELIABLE_SAMPLE } from '@tradevault/shared';
import { Mulberry32PRNG } from '../../prng.js';
import { IWhatIfTradeCellSimulation } from './types.js';

export interface IBootstrapIntervalResult {
  intervalPess: [number, number];
  intervalOpt: [number, number];
  meanDiffPess: number;
  meanDiffOpt: number;
  verdict: WhatIfVerdict;
}

/**
 * Computes paired differences d_i = R_sim - R_actual per trade, performs a deterministic
 * 10,000-iteration seeded bootstrap to construct 90% confidence intervals (5th to 95th percentile),
 * and assigns the statistical verdict.
 *
 * Verdict logic (Section 2):
 *   BETTER_ROBUST: PESSIMISTIC lower bound > 0 and nEval >= 30
 *   WORSE_ROBUST:  OPTIMISTIC upper bound < 0 and nEval >= 30
 *   INCONCLUSIVE:  otherwise (including nEval < 30 or intervals crossing zero)
 */
export function computePairedDifferencesAndVerdict(
  simulations: IWhatIfTradeCellSimulation[],
  stopR: number | null,
  targetR: number | null,
  scopeKey: string = 'default',
  resamples: number = 10_000
): IBootstrapIntervalResult {
  const evaluables = simulations.filter((s) => s.status === 'EVALUABLE');
  const nEval = evaluables.length;

  if (nEval === 0) {
    return {
      intervalPess: [0, 0],
      intervalOpt: [0, 0],
      meanDiffPess: 0,
      meanDiffOpt: 0,
      verdict: 'INCONCLUSIVE',
    };
  }

  // Extract paired differences: d = R_sim - R_actual
  const diffsPess = new Float64Array(nEval);
  const diffsOpt = new Float64Array(nEval);

  let sumDiffPess = 0;
  let sumDiffOpt = 0;

  for (let i = 0; i < nEval; i++) {
    const s = evaluables[i];
    const actualR = s.actualSameSubset.r.toNumber();
    const dPess = s.pess.r.toNumber() - actualR;
    const dOpt = s.opt.r.toNumber() - actualR;

    diffsPess[i] = dPess;
    diffsOpt[i] = dOpt;

    sumDiffPess += dPess;
    sumDiffOpt += dOpt;
  }

  const meanDiffPess = sumDiffPess / nEval;
  const meanDiffOpt = sumDiffOpt / nEval;

  // If nEval is 1, bootstrap interval is trivially [mean, mean]
  if (nEval < 2) {
    return {
      intervalPess: [Number(meanDiffPess.toFixed(4)), Number(meanDiffPess.toFixed(4))],
      intervalOpt: [Number(meanDiffOpt.toFixed(4)), Number(meanDiffOpt.toFixed(4))],
      meanDiffPess: Number(meanDiffPess.toFixed(4)),
      meanDiffOpt: Number(meanDiffOpt.toFixed(4)),
      verdict: 'INCONCLUSIVE',
    };
  }

  // Deterministic PRNG seeded by hash of scope + cell + policy
  const seedPessStr = `${scopeKey}_${stopR}_${targetR}_PESS`;
  const prngPess = new Mulberry32PRNG(seedPessStr);

  const bootstrapMeansPess = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let sampleSum = 0;
    for (let i = 0; i < nEval; i++) {
      const idx = prngPess.nextInt(0, nEval - 1);
      sampleSum += diffsPess[idx];
    }
    bootstrapMeansPess[b] = sampleSum / nEval;
  }

  bootstrapMeansPess.sort();
  // 90% confidence interval: 5th percentile to 95th percentile
  const idx05 = Math.floor(resamples * 0.05);
  const idx95 = Math.floor(resamples * 0.95);

  const pessLower = bootstrapMeansPess[idx05];
  const pessUpper = bootstrapMeansPess[idx95];

  // Bootstrap for Optimistic
  const seedOptStr = `${scopeKey}_${stopR}_${targetR}_OPT`;
  const prngOpt = new Mulberry32PRNG(seedOptStr);

  const bootstrapMeansOpt = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let sampleSum = 0;
    for (let i = 0; i < nEval; i++) {
      const idx = prngOpt.nextInt(0, nEval - 1);
      sampleSum += diffsOpt[idx];
    }
    bootstrapMeansOpt[b] = sampleSum / nEval;
  }

  bootstrapMeansOpt.sort();
  const optLower = bootstrapMeansOpt[idx05];
  const optUpper = bootstrapMeansOpt[idx95];

  // Statistical Verdict Assignment
  let verdict: WhatIfVerdict = 'INCONCLUSIVE';
  if (nEval >= MIN_RELIABLE_SAMPLE) {
    if (pessLower > 0) {
      verdict = 'BETTER_ROBUST';
    } else if (optUpper < 0) {
      verdict = 'WORSE_ROBUST';
    }
  }

  return {
    intervalPess: [Number(pessLower.toFixed(4)), Number(pessUpper.toFixed(4))],
    intervalOpt: [Number(optLower.toFixed(4)), Number(optUpper.toFixed(4))],
    meanDiffPess: Number(meanDiffPess.toFixed(4)),
    meanDiffOpt: Number(meanDiffOpt.toFixed(4)),
    verdict,
  };
}
