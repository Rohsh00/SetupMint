import Decimal from 'decimal.js';
import { roundToTick } from '../../templates.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IComputedLevels {
  stopPrice: Decimal | null;
  targetPrice: Decimal | null;
}

/**
 * Computes hypothetical stop and target price levels in price space.
 * Rounded to the instrument tick increment via roundToTick.
 *
 * LONG:
 *   stopPrice = roundToTick(entry - stopR * unitRisk, tickSize)
 *   targetPrice = roundToTick(entry + targetR * unitRisk, tickSize)
 *
 * SHORT:
 *   stopPrice = roundToTick(entry + stopR * unitRisk, tickSize)
 *   targetPrice = roundToTick(entry - targetR * unitRisk, tickSize)
 */
export function computeLevels(
  entryPrice: Decimal,
  direction: 'LONG' | 'SHORT',
  unitRisk: Decimal,
  stopR: number | null,
  targetR: number | null,
  tickSize: Decimal | number = 0.05
): IComputedLevels {
  let stopPrice: Decimal | null = null;
  let targetPrice: Decimal | null = null;

  if (stopR !== null && stopR !== undefined) {
    const dStopR = new Decimal(stopR);
    if (direction === 'LONG') {
      const raw = entryPrice.minus(dStopR.times(unitRisk));
      stopPrice = roundToTick(raw, tickSize);
    } else {
      const raw = entryPrice.plus(dStopR.times(unitRisk));
      stopPrice = roundToTick(raw, tickSize);
    }
  }

  if (targetR !== null && targetR !== undefined) {
    const dTargetR = new Decimal(targetR);
    if (direction === 'LONG') {
      const raw = entryPrice.plus(dTargetR.times(unitRisk));
      targetPrice = roundToTick(raw, tickSize);
    } else {
      const raw = entryPrice.minus(dTargetR.times(unitRisk));
      targetPrice = roundToTick(raw, tickSize);
    }
  }

  return {
    stopPrice,
    targetPrice,
  };
}
