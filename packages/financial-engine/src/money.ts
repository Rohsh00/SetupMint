import Decimal from './decimal.js';

export interface MoneyJSON {
  amount: number;
  currency: string;
}

export class Money {
  public readonly amount: Decimal;
  public readonly currency: string;

  constructor(amount: number | string | Decimal, currency: string) {
    if (!currency || typeof currency !== 'string' || currency.trim() === '') {
      throw new Error('Currency code is required for Money instantiation');
    }
    this.amount = new Decimal(amount || 0);
    this.currency = currency.toUpperCase().trim();
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot perform operation between ${this.currency} and ${other.currency} without an explicit exchange rate.`
      );
    }
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  times(factor: number | string | Decimal): Money {
    return new Money(this.amount.times(new Decimal(factor)), this.currency);
  }

  dividedBy(divisor: number | string | Decimal): Money {
    const d = new Decimal(divisor);
    if (d.isZero()) {
      throw new Error('Division by zero');
    }
    return new Money(this.amount.dividedBy(d), this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThan(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  toNumber(precision = 2): number {
    return Number(this.amount.toFixed(precision));
  }

  toString(precision = 2): string {
    return this.amount.toFixed(precision);
  }

  toJSON(): MoneyJSON {
    return {
      amount: this.toNumber(2),
      currency: this.currency,
    };
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  static from(amount: number | string | Decimal, currency: string): Money {
    return new Money(amount, currency);
  }
}

/**
 * Accumulates monetary values into a per-currency breakdown map.
 */
export function addByCurrency(
  breakdown: Record<string, Decimal>,
  amount: number | string | Decimal,
  currency: string
): void {
  const code = (currency || 'USD').toUpperCase().trim();
  const dAmount = new Decimal(amount || 0);
  if (!breakdown[code]) {
    breakdown[code] = new Decimal(0);
  }
  breakdown[code] = breakdown[code].plus(dAmount);
}

/**
 * Converts a Record<string, Decimal> to standard numeric amounts.
 */
export function byCurrencyToNumbers(
  breakdown: Record<string, Decimal>,
  precision = 2
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [curr, dec] of Object.entries(breakdown)) {
    result[curr] = Number(dec.toFixed(precision));
  }
  return result;
}

/**
 * Universal money formatter using Intl.NumberFormat.
 * NEVER hardcodes ₹ or $ symbols.
 */
export function formatMoney(
  amount: number | string | Decimal | null | undefined,
  currency: string,
  optionsOrPrecision?:
    | number
    | {
        precision?: number;
        signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
        locale?: string;
      }
): string {
  if (amount === undefined || amount === null || amount === '') {
    return '—';
  }

  const d = new Decimal(amount);
  if (d.isNaN()) {
    return '—';
  }

  const options =
    typeof optionsOrPrecision === 'number'
      ? { precision: optionsOrPrecision }
      : optionsOrPrecision || {};

  const precision = options.precision ?? 2;
  const num = Number(d.toFixed(precision));
  const curr = (currency || 'USD').toUpperCase().trim();

  // Pick suitable locale or default
  let locale = options.locale;
  if (!locale) {
    if (curr === 'INR') locale = 'en-IN';
    else if (curr === 'EUR') locale = 'de-DE';
    else if (curr === 'GBP') locale = 'en-GB';
    else if (curr === 'JPY') locale = 'ja-JP';
    else locale = 'en-US';
  }

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      signDisplay: options.signDisplay || 'auto',
    });
    return formatter.format(num);
  } catch {
    // Fallback if currency code is custom or non-standard
    const sign = num < 0 ? '-' : options.signDisplay === 'always' && num > 0 ? '+' : '';
    return `${sign}${curr} ${Math.abs(num).toFixed(precision)}`;
  }
}
