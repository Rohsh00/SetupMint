import BaseDecimal from 'decimal.js';

/**
 * Isolated Decimal constructor configured with 30 significant digits of precision
 * and standard half-up rounding (`ROUND_HALF_UP`, i.e. 0.005 -> 0.01).
 *
 * Cloned via `Decimal.clone(...)` so any global `Decimal.set(...)` calls elsewhere
 * in the process or third-party dependencies cannot alter SetupMint calculations.
 */
export const CalcDecimal: typeof BaseDecimal = BaseDecimal.clone({
  precision: 30,
  rounding: BaseDecimal.ROUND_HALF_UP,
});
export type CalcDecimal = BaseDecimal;

export namespace CalcDecimal {
  export type Value = BaseDecimal.Value;
  export type Instance = BaseDecimal;
  export type Constructor = BaseDecimal.Constructor;
  export type Rounding = BaseDecimal.Rounding;
  export type Config = BaseDecimal.Config;
}

export type DecimalValue = BaseDecimal.Value;

/**
 * Coerce a numeric, string, or Decimal value into an isolated `CalcDecimal` instance.
 */
export function toCalcDecimal(value: BaseDecimal.Value): CalcDecimal {
  return new CalcDecimal(value);
}

/**
 * Round a value to `precision` decimal places using standard `ROUND_HALF_UP`.
 */
export function roundHalfUp(
  value: BaseDecimal.Value,
  precision = 2
): CalcDecimal {
  return new CalcDecimal(
    new CalcDecimal(value).toFixed(precision, CalcDecimal.ROUND_HALF_UP)
  );
}

/**
 * Convert a Decimal value rounded HALF_UP to `precision` decimal places into a JS number
 * for storage or serialization.
 */
export function toMoneyNumber(
  value: BaseDecimal.Value,
  precision = 2
): number {
  return Number(
    new CalcDecimal(value).toFixed(precision, CalcDecimal.ROUND_HALF_UP)
  );
}

export default CalcDecimal;

