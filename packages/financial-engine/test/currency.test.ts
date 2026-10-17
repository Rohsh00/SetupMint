import { describe, it, expect } from 'vitest';
import { convertCurrency } from '../src/currency.js';

describe('Financial Engine - Currency Conversion', () => {
  it('returns identical amount when from and to currencies match', () => {
    const res = convertCurrency({
      amount: 1500.5,
      fromCurrency: 'INR',
      toCurrency: 'INR',
    });

    expect(res.isAvailable).toBe(true);
    expect(res.convertedAmount).toBe(1500.5);
    expect(res.exchangeRate).toBe(1);
  });

  it('converts correctly when explicit exchange rate is provided', () => {
    // 100 USD to INR @ 83.50
    const res = convertCurrency({
      amount: 100,
      fromCurrency: 'USD',
      toCurrency: 'INR',
      exchangeRate: 83.5,
    });

    expect(res.isAvailable).toBe(true);
    expect(res.convertedAmount).toBe(8350.0);
  });

  it('marks isAvailable: false and refuses silent 1:1 fallback when rate is missing', () => {
    const res = convertCurrency({
      amount: 100,
      fromCurrency: 'USD',
      toCurrency: 'INR',
      // no exchangeRate provided
    });

    expect(res.isAvailable).toBe(false);
    expect(res.convertedAmount).toBeUndefined();
    expect(res.notes).toContain('No silent 1:1 fallback permitted');
  });
});
