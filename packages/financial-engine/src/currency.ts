import Decimal from 'decimal.js';

export interface CurrencyConversionParams {
  amount: number | string | Decimal;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate?: number | string | Decimal | null;
}

export interface CurrencyConversionResult {
  convertedAmount?: number;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate?: number;
  isAvailable: boolean;
  notes?: string;
}

/**
 * Deterministic currency conversion.
 * If fromCurrency equals toCurrency, returns identical amount without conversion.
 * If currencies differ and an explicit exchange rate is missing, marks isAvailable: false.
 * NEVER assumes 1:1 conversion between different currencies silently.
 */
export function convertCurrency(params: CurrencyConversionParams): CurrencyConversionResult {
  const dAmount = new Decimal(params.amount);
  const from = params.fromCurrency.toUpperCase().trim();
  const to = params.toCurrency.toUpperCase().trim();

  if (from === to) {
    return {
      convertedAmount: Number(dAmount.toFixed(4)),
      fromCurrency: from,
      toCurrency: to,
      exchangeRate: 1,
      isAvailable: true,
    };
  }

  if (
    params.exchangeRate === undefined ||
    params.exchangeRate === null ||
    new Decimal(params.exchangeRate).lessThanOrEqualTo(0)
  ) {
    return {
      convertedAmount: undefined,
      fromCurrency: from,
      toCurrency: to,
      exchangeRate: undefined,
      isAvailable: false,
      notes: `Exchange rate from ${from} to ${to} is unavailable. No silent 1:1 fallback permitted.`,
    };
  }

  const dRate = new Decimal(params.exchangeRate);
  const converted = dAmount.times(dRate);

  return {
    convertedAmount: Number(converted.toFixed(4)),
    fromCurrency: from,
    toCurrency: to,
    exchangeRate: Number(dRate.toFixed(6)),
    isAvailable: true,
  };
}
