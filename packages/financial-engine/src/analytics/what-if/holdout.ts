import { HOLDOUT_FRACTION, MIN_HOLDOUT_SAMPLE } from '@tradevault/shared';
import { IWhatIfEligibleTrade, IWhatIfTradeCellSimulation } from './types.js';

export interface IHoldoutSplit {
  inSampleTradeIds: Set<string>;
  holdoutTradeIds: Set<string>;
  splitIndex: number;
  totalEligible: number;
}

/**
 * Splits eligible trades chronologically by exit time into In-Sample (e.g. 70%) and Holdout (e.g. 30%).
 * Implements Section 2.
 */
export function splitChronologicalHoldout(
  trades: IWhatIfEligibleTrade[],
  holdoutFraction: number = HOLDOUT_FRACTION
): IHoldoutSplit {
  const fraction = Math.max(0.2, Math.min(0.5, holdoutFraction));
  // Sort chronologically by exit time (tie-break by entry time)
  const sorted = [...trades].sort((a, b) => {
    if (a.exitTimeMs !== b.exitTimeMs) {
      return a.exitTimeMs - b.exitTimeMs;
    }
    return a.entryTimeMs - b.entryTimeMs;
  });

  const totalEligible = sorted.length;
  const inSampleCount = Math.floor(totalEligible * (1 - fraction));

  const inSampleTradeIds = new Set<string>();
  const holdoutTradeIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i].tradeId;
    if (i < inSampleCount) {
      inSampleTradeIds.add(id);
    } else {
      holdoutTradeIds.add(id);
    }
  }

  return {
    inSampleTradeIds,
    holdoutTradeIds,
    splitIndex: inSampleCount,
    totalEligible,
  };
}

/**
 * Checks whether a cell holds out-of-sample according to Section 2 rules:
 * - HOLDOUT verdict has the same sign as IN_SAMPLE
 * - HOLDOUT nEval >= 15
 */
export function checkHoldsOutOfSample(
  inSampleVerdict: string,
  holdoutVerdict: string,
  holdoutNEval: number
): boolean {
  if (holdoutNEval < MIN_HOLDOUT_SAMPLE) {
    return false;
  }

  if (inSampleVerdict === 'INCONCLUSIVE' || holdoutVerdict === 'INCONCLUSIVE') {
    return false;
  }

  return (
    (inSampleVerdict === 'BETTER_ROBUST' && holdoutVerdict === 'BETTER_ROBUST') ||
    (inSampleVerdict === 'WORSE_ROBUST' && holdoutVerdict === 'WORSE_ROBUST')
  );
}
