import { describe, it, expect } from 'vitest';
import { IndianChargesCalculator, calculateIndianCharges } from '../src/charges.js';

describe('Financial Engine - Indian Statutory Charges Calculator', () => {
  it('calculates NSE Cash Equities (NSE_EQ) charges accurately', () => {
    // Buy 100 shares @ 2500, Sell 100 shares @ 2550
    // Buy turnover = 250,000, Sell turnover = 255,000, Total = 505,000
    // Brokerage = ₹40.00 (2 legs @ ₹20)
    // Exchange fee = 505,000 * 0.0000297 = 14.9985 -> 15.00
    // SEBI fee = 505,000 * 0.000001 = 0.505 -> 0.51
    // Stamp duty (buy only) = 250,000 * 0.00003 = 7.50
    // STT (sell only) = 255,000 * 0.00025 = 63.75
    // GST (18% on Brokerage + Exchange + SEBI) = (40 + 14.9985 + 0.505) * 0.18 = 55.5035 * 0.18 = 9.99063 -> 9.99
    // Regulatory fees = SEBI + Stamp Duty = 0.505 + 7.50 = 8.005 -> 8.01
    // Taxes = STT + GST = 63.75 + 9.99 = 73.74
    // Total costs = Brokerage (40) + Exchange (15.00) + Regulatory (8.01) + Taxes (73.74) = 136.75
    const charges = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 2500,
      exitPrice: 2550,
      quantity: 100,
      contractMultiplier: 1,
    });

    expect(charges.brokerage).toBe(40.00);
    expect(charges.exchangeFees).toBe(15.00);
    expect(charges.regulatoryFees).toBe(8.01);
    expect(charges.taxes).toBe(73.74);
    expect(charges.totalCosts).toBe(136.75);
  });

  it('calculates NSE Index / Stock Futures charges correctly', () => {
    // 1 lot NIFTY (25 qty): Buy @ 24,000, Sell @ 24,100
    // Buy turnover = 600,000, Sell turnover = 602,500, Total = 1,202,500
    // Brokerage = ₹40.00
    // Exchange fee = 1,202,500 * 0.0000173 = 20.80325 -> 20.80
    // SEBI fee = 1,202,500 * 0.000001 = 1.2025
    // Stamp duty = 600,000 * 0.00002 = 12.00
    // STT = 602,500 * 0.0002 = 120.50
    // GST = (40 + 20.80325 + 1.2025) * 0.18 = 62.00575 * 0.18 = 11.161035 -> 11.16
    // Regulatory fees = 1.2025 + 12 = 13.2025 -> 13.20
    // Taxes = 120.50 + 11.161035 = 131.661035 -> 131.66
    const charges = calculateIndianCharges({
      assetClass: 'FUTURES',
      marketSegment: 'NSE_FNO',
      entryPrice: 24000,
      exitPrice: 24100,
      quantity: 25,
      contractMultiplier: 1,
    });

    expect(charges.brokerage).toBe(40.00);
    expect(charges.exchangeFees).toBe(20.80);
    expect(charges.regulatoryFees).toBe(13.20);
    expect(charges.taxes).toBe(131.66);
    expect(charges.totalCosts).toBe(205.66);
  });

  it('calculates NSE Options on premium turnover correctly', () => {
    // 1 lot NIFTY Option (25 qty): Buy premium @ 150, Sell premium @ 220
    // Buy premium turnover = 150 * 25 = 3,750
    // Sell premium turnover = 220 * 25 = 5,500
    // Total turnover = 9,250
    // Brokerage = ₹40.00
    // Exchange fee = 9,250 * 0.00035 = 3.2375 -> 3.24
    // SEBI fee = 9,250 * 0.000001 = 0.00925
    // Stamp duty = 3,750 * 0.00003 = 0.1125
    // STT = 5,500 * 0.001 = 5.50
    // GST = (40 + 3.2375 + 0.00925) * 0.18 = 43.24675 * 0.18 = 7.784415 -> 7.78
    // Regulatory = 0.00925 + 0.1125 = 0.12175 -> 0.12
    // Taxes = 5.50 + 7.784415 = 13.284415 -> 13.28
    const charges = IndianChargesCalculator.calculate(
      'OPTIONS',
      'NSE_FNO',
      150,
      220,
      25,
      1
    );

    expect(charges.brokerage).toBe(40.00);
    expect(charges.exchangeFees).toBe(3.24);
    expect(charges.regulatoryFees).toBe(0.12);
    expect(charges.taxes).toBe(13.28);
    expect(charges.totalCosts).toBe(56.64);
  });

  it('calculates MCX Commodity futures charges with contract multipliers', () => {
    // 1 lot Crude Oil (100 bbls multiplier): Buy @ 6000, Sell @ 6050, qty 1
    // Buy turnover = 6000 * 1 * 100 = 600,000
    // Sell turnover = 6050 * 1 * 100 = 605,000
    // Total turnover = 1,205,000
    // Brokerage = 40.00
    // Exchange fee = 1,205,000 * 0.000021 = 25.305 -> 25.31
    // SEBI fee = 1,205,000 * 0.000001 = 1.205
    // Stamp duty = 600,000 * 0.00002 = 12.00
    // CTT = 605,000 * 0.0001 = 60.50
    // GST = (40 + 25.305 + 1.205) * 0.18 = 66.51 * 0.18 = 11.9718 -> 11.97
    // Regulatory = 1.205 + 12 = 13.205 -> 13.21
    // Taxes = 60.50 + 11.9718 = 72.4718 -> 72.47
    const charges = IndianChargesCalculator.calculate(
      'COMMODITY',
      'MCX',
      6000,
      6050,
      1,
      100
    );

    expect(charges.brokerage).toBe(40.00);
    expect(charges.exchangeFees).toBe(25.31);
    expect(charges.regulatoryFees).toBe(13.21);
    expect(charges.taxes).toBe(72.47);
    expect(charges.totalCosts).toBe(150.99);
  });

  it('supports per-broker flat fees and zero-brokerage brokers', () => {
    // Zero-brokerage broker (Finvasia)
    const finvasiaCharges = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 1000,
      exitPrice: 1050,
      quantity: 50,
      broker: 'Finvasia',
    });
    expect(finvasiaCharges.brokerage).toBe(0.00);

    // Custom flat fee: ₹10 per leg (₹20 round trip)
    const customCharges = calculateIndianCharges({
      assetClass: 'FUTURES',
      marketSegment: 'NSE_FNO',
      entryPrice: 20000,
      exitPrice: 20100,
      quantity: 10,
      brokerFlatFeePerLeg: 10,
    });
    expect(customCharges.brokerage).toBe(20.00);

    // Single executed leg (e.g. entry only for open trade)
    const openLegCharges = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 1000,
      quantity: 10,
      isSingleLeg: true,
      brokerFlatFeePerLeg: 20,
    });
    expect(openLegCharges.brokerage).toBe(20.00);
  });

  it('rejects negative quantity', () => {
    expect(() =>
      calculateIndianCharges({
        assetClass: 'EQUITY',
        entryPrice: 100,
        quantity: -10,
      })
    ).toThrow('Quantity cannot be negative');
  });
});
