import { ANOMALY_CHECKED_COLLECTIONS } from './constants.js';

/**
 * Compares current manifest with previous backup manifest to detect suspicious data loss.
 *
 * @param {Object} currentManifest - Current backup manifest with collections counts
 * @param {Object|null} previousManifest - Previous backup manifest
 * @param {number} [maxDropPercent=10] - Threshold percentage for flagging suspicious drops
 * @returns {{ isSuspicious: boolean, isFirstBackup: boolean, reasons: string[], comparisons: Object }}
 */
export function detectAnomalies(currentManifest, previousManifest, maxDropPercent = 10) {
  if (!previousManifest || !previousManifest.collections) {
    return {
      isSuspicious: false,
      isFirstBackup: true,
      reasons: [],
      comparisons: {},
    };
  }

  const reasons = [];
  const comparisons = {};
  let isSuspicious = false;

  for (const col of ANOMALY_CHECKED_COLLECTIONS) {
    const prev = Number(previousManifest.collections[col] || 0);
    const curr = Number(currentManifest.collections?.[col] || 0);

    const comparison = {
      previous: prev,
      current: curr,
      dropPercent: 0,
      droppedToZero: false,
      exceededThreshold: false,
    };

    if (prev > 0 && curr === 0) {
      comparison.droppedToZero = true;
      comparison.dropPercent = 100;
      isSuspicious = true;
      reasons.push(
        `Critical collection "${col}" dropped to 0 documents from previous count of ${prev}!`
      );
    } else if (prev > 0 && curr < prev) {
      const dropPct = ((prev - curr) / prev) * 100;
      comparison.dropPercent = parseFloat(dropPct.toFixed(2));
      if (dropPct > maxDropPercent) {
        comparison.exceededThreshold = true;
        isSuspicious = true;
        reasons.push(
          `Collection "${col}" count dropped by ${dropPct.toFixed(1)}% (${prev} -> ${curr}), exceeding max allowed drop threshold of ${maxDropPercent}%!`
        );
      }
    }

    comparisons[col] = comparison;
  }

  return {
    isSuspicious,
    isFirstBackup: false,
    reasons,
    comparisons,
  };
}
