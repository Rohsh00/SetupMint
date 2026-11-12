import { describe, it, expect } from 'vitest';
import { IndianChargesCalculator, calculateIndianCharges } from '../src/charges.js';

describe('Financial Engine - Indian Statutory Charges Calculator', () => {
  it('calculates NSE Cash Equities (NSE_EQ) charges accurately', () => {
    // Buy 100 shares @ 2500, Sell 100 shares @ 2550 (eff. Oct 2024+ True-to-Label + IPFT)
    // Buy turnover = 250,000, Sell turnover = 255,000, Total = 505,000
    // Brokerage = ₹40.00 (2 legs @ min(₹20, 0.03%))
    // Exchange txn = 505,000 * 0.0000297 = 14.9985; IPFT = 505,000 * 0.000001 = 0.505 -> Exch total = 15.5035 -> 15.50
    // SEBI fee = 505,000 * 0.000001 = 0.505
    // Stamp duty (buy only) = 250,000 * 0.00003 = 7.50
    // STT (sell only) = 255,000 * 0.00025 = 63.75
    // GST (18% on Brokerage + Exch Txn + IPFT + SEBI) = 56.0085 * 0.18 = 10.08153 -> 10.08
    // Regulatory fees = SEBI + Stamp Duty = 0.505 + 7.50 = 8.005 -> 8.01
    // Taxes = STT + GST = 63.75 + 10.08153 = 73.83153 -> 73.83
    // Total costs = Brokerage (40) + Exchange (15.50) + Regulatory (8.01) + Taxes (73.83) = 137.34
    const charges = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 2500,
      exitPrice: 2550,
      quantity: 100,
      contractMultiplier: 1,
      tradeDate: '2024-11-01',
    });

    expect(charges.brokerage).toBe(40.00);
    expect(charges.exchangeFees).toBe(15.50);
    expect(charges.regulatoryFees).toBe(8.01);
    expect(charges.taxes).toBe(73.83);
    expect(charges.totalCosts).toBe(137.34);
  });

  it('calculates NSE Index / Stock Futures charges correctly across Oct-2024 and Finance Act 2026 schedules', () => {
    // 1 lot NIFTY (25 qty in Nov 2024): Buy @ 24,000, Sell @ 24,100
    // Buy turnover = 600,000, Sell turnover = 602,500, Total = 1,202,500
    // Brokerage = ₹40.00
    // Exchange txn = 1,202,500 * 0.0000173 = 20.80325; IPFT = 1,202,500 * 0.000001 = 1.2025 -> 22.00575 -> 22.01
    // SEBI fee = 1.2025; Stamp duty = 12.00 -> Regulatory = 13.20
    // Oct-2024 STT = 602,500 * 0.0002 = 120.50; GST = 63.20825 * 0.18 = 11.377485 -> Taxes = 131.88
    const chargesOct2024 = calculateIndianCharges({
      assetClass: 'FUTURES',
      marketSegment: 'NSE_FNO',
      entryPrice: 24000,
      exitPrice: 24100,
      quantity: 25,
      contractMultiplier: 1,
      tradeDate: '2024-11-01',
    });

    expect(chargesOct2024.brokerage).toBe(40.00);
    expect(chargesOct2024.exchangeFees).toBe(22.01);
    expect(chargesOct2024.regulatoryFees).toBe(13.20);
    expect(chargesOct2024.taxes).toBe(131.88);
    expect(chargesOct2024.totalCosts).toBe(207.09);

    // Finance Act 2026 (eff. 2026-04-01, NSE/FATAX/73524): Futures STT = 0.05% (301.25)
    const chargesApr2026 = calculateIndianCharges({
      assetClass: 'FUTURES',
      marketSegment: 'NSE_FNO',
      entryPrice: 24000,
      exitPrice: 24100,
      quantity: 25,
      contractMultiplier: 1,
      tradeDate: '2026-04-02',
    });
    expect(chargesApr2026.sttCtt).toBe(301.25);
    expect(chargesApr2026.taxes).toBe(312.63);
  });

  it('calculates NSE Options on premium turnover correctly across Oct-2024 and Apr-2026 schedules', () => {
    // 1 lot NIFTY Option (25 qty): Buy premium @ 150, Sell premium @ 220
    // Total premium turnover = 9,250; Exch 0.03503% (3.240275) + IPFT ₹50/cr (0.04625) = 3.29
    const charges = calculateIndianCharges({
      assetClass: 'OPTIONS',
      marketSegment: 'NSE_FNO',
      entryPrice: 150,
      exitPrice: 220,
      quantity: 25,
      contractMultiplier: 1,
      tradeDate: '2024-11-01',
    });

    expect(charges.brokerage).toBe(40.00);
    expect(charges.exchangeFees).toBe(3.29);
    expect(charges.regulatoryFees).toBe(0.12);
    expect(charges.taxes).toBe(13.29);
    expect(charges.totalCosts).toBe(56.70);

    // Finance Act 2026 (eff. 2026-04-01): Equity Options sell STT = 0.15% (8.25)
    const charges2026 = calculateIndianCharges({
      assetClass: 'OPTIONS',
      marketSegment: 'NSE_FNO',
      entryPrice: 150,
      exitPrice: 220,
      quantity: 25,
      contractMultiplier: 1,
      tradeDate: '2026-04-02',
    });
    expect(charges2026.sttCtt).toBe(8.25);
    expect(charges2026.taxes).toBe(16.04);
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

    // Single executed leg (e.g. entry only for open trade) on ₹10,000 turnover:
    // Intraday equity brokerage = min(₹20, 0.03% of ₹10,000) = ₹3.00
    const openLegSmall = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 1000,
      quantity: 10,
      isSingleLeg: true,
      brokerFlatFeePerLeg: 20,
    });
    expect(openLegSmall.brokerage).toBe(3.00);

    // Single executed leg above ₹66,667 turnover hits the ₹20 flat cap
    const openLegCapped = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 1000,
      quantity: 100,
      isSingleLeg: true,
      brokerFlatFeePerLeg: 20,
    });
    expect(openLegCapped.brokerage).toBe(20.00);

    // Broker normalization: 'ANGEL ONE', 'ANGEL_ONE', 'angel one' should all match ANGELONE
    const angel1 = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 1000,
      quantity: 100,
      broker: 'ANGEL ONE',
    });
    expect(angel1.brokerage).toBe(40.00);

    const angel2 = calculateIndianCharges({
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      entryPrice: 1000,
      quantity: 100,
      broker: 'angel_one',
    });
    expect(angel2.brokerage).toBe(40.00);
  });

  it('correctly calculates SHORT trade statutory charges with STT on entry sell and Stamp Duty on exit buy', () => {
    // 1 lot NIFTY Option (25 qty) SHORT in Nov 2024: Sell @ 200, Buy to cover @ 20
    // Exch 0.03503% + IPFT 0.0005% = 5500 * 0.0003553 = 1.95415 -> 1.95
    const shortCharges = calculateIndianCharges({
      direction: 'SHORT',
      assetClass: 'OPTIONS',
      marketSegment: 'NSE_FNO',
      entryPrice: 200,
      exitPrice: 20,
      quantity: 25,
      contractMultiplier: 1,
      tradeDate: '2024-11-01',
    });

    expect(shortCharges.brokerage).toBe(40.00);
    expect(shortCharges.exchangeFees).toBe(1.95);
    expect(shortCharges.stampDuty).toBe(0.02);
    expect(shortCharges.sttCtt).toBe(5.00);
    expect(shortCharges.gst).toBe(7.55);
    expect(shortCharges.regulatoryFees).toBe(0.02);
    expect(shortCharges.taxes).toBe(12.55);
    expect(shortCharges.totalCosts).toBe(54.52);
  });

  it('correctly calculates single-leg open SHORT position charges (STT on entry sell, zero Stamp Duty)', () => {
    // Open SHORT leg in Nov 2024: Sell @ 200, Qty 25
    // Exchange fees = 5000 * 0.0003553 = 1.7765 -> 1.78
    const openShort = calculateIndianCharges({
      direction: 'SHORT',
      assetClass: 'OPTIONS',
      marketSegment: 'NSE_FNO',
      entryPrice: 200,
      quantity: 25,
      contractMultiplier: 1,
      isSingleLeg: true,
      tradeDate: '2024-11-01',
    });

    expect(openShort.brokerage).toBe(20.00);
    expect(openShort.exchangeFees).toBe(1.78);
    expect(openShort.stampDuty).toBe(0.00);
    expect(openShort.sttCtt).toBe(5.00);
    expect(openShort.gst).toBe(3.92);
    expect(openShort.totalCosts).toBe(30.71);
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
