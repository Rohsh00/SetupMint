import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  CalcDecimal,
  calculateIndianCharges,
  allocateChargesProportionally,
  calculateTrueBreakevenPrice,
  calculateLinearPnL,
  calculateFIFOExecution,
  calculateRiskAndPositionSize,
  calculateRealizedRMultiple,
  resolveTemplate,
  isExpiryDay,
  normalizeUnderlying,
  convertCurrency,
  calculateDashboardMetrics,
  buildWeeklyReview,
  calculateFractionalKelly,
  calculateDailySessionSummary,
  InstrumentSpecRegistry,
  SessionCalendarRegistry,
  FeeModelRegistry,
  validateStrategyEdge,
} from '../src/index.js';
import {
  getEffectiveLotSize,
  getNseTickSize,
  getIsoWeeksInYear,
  isoWeekToRange,
  formatDateInTz,
  RISK_AND_ALERT_THRESHOLDS,
} from '@tradevault/shared';

/**
 * Independent first-principles Indian Statutory Reference Calculator.
 * Built solely from SEBI / Finance Act / NSE / BSE / MCX circulars without sharing
 * implementation logic with `charges.ts`, asserting exact paise (2dp) parity.
 */
function referenceIndianStatutoryCharges(spec: {
  segment:
    | 'NSE_EQ_INTRADAY'
    | 'NSE_EQ_DELIVERY'
    | 'BSE_EQ_INTRADAY'
    | 'NSE_FUTURES'
    | 'NSE_OPTIONS'
    | 'BSE_FUTURES'
    | 'BSE_OPTIONS'
    | 'MCX_FUTURES'
    | 'MCX_OPTIONS'
    | 'NSE_CURRENCY_FUTURES'
    | 'NSE_CURRENCY_OPTIONS';
  schedule: 'PRE_OCT_2024' | 'OCT_2024_TO_MAR_2026' | 'APR_2026_ONWARD';
  buyTurnover: number;
  sellTurnover: number;
  buyBrokeragePerOrder?: number;
  sellBrokeragePerOrder?: number;
  buyOrders?: number;
  sellOrders?: number;
  dpChargeBase?: number;
  isOptionExercise?: boolean;
  isPhysicalSettlement?: boolean;
}) {
  const buy = new CalcDecimal(spec.buyTurnover);
  const sell = new CalcDecimal(spec.sellTurnover);
  const total = buy.plus(sell);

  const buyOrders = spec.buyOrders ?? (buy.gt(0) ? 1 : 0);
  const sellOrders = spec.sellOrders ?? (sell.gt(0) ? 1 : 0);

  const legBrokerage = (sideTurnover: InstanceType<typeof CalcDecimal>, orders: number, cap = 20) => {
    if (orders <= 0 || sideTurnover.lte(0)) return new CalcDecimal(0);
    if (spec.segment === 'NSE_EQ_INTRADAY' || spec.segment === 'BSE_EQ_INTRADAY') {
      return CalcDecimal.min(new CalcDecimal(cap).times(orders), sideTurnover.times('0.0003'));
    }
    if (spec.segment === 'NSE_EQ_DELIVERY') {
      if (cap <= 0) return new CalcDecimal(0);
      return CalcDecimal.min(new CalcDecimal(cap).times(orders), sideTurnover.times('0.003'));
    }
    return new CalcDecimal(cap).times(orders);
  };

  const brokerage = legBrokerage(buy, buyOrders, spec.buyBrokeragePerOrder ?? 20).plus(
    legBrokerage(sell, sellOrders, spec.sellBrokeragePerOrder ?? 20)
  );

  let exchRate = '0';
  let ipftRate = '0';
  let sttBuyRate = '0';
  let sttSellRate = '0';
  let sttExerRate = '0';
  let stampBuyRate = '0';

  switch (spec.segment) {
    case 'NSE_EQ_INTRADAY':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.0000322' : '0.0000297';
      ipftRate = '0.000001';
      sttSellRate = '0.00025';
      stampBuyRate = '0.00003';
      break;
    case 'NSE_EQ_DELIVERY':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.0000322' : '0.0000297';
      ipftRate = '0.000001';
      sttBuyRate = '0.001';
      sttSellRate = '0.001';
      stampBuyRate = '0.00015';
      break;
    case 'BSE_EQ_INTRADAY':
      exchRate = '0.0000375';
      sttSellRate = '0.00025';
      stampBuyRate = '0.00003';
      break;
    case 'NSE_FUTURES':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.0000188' : '0.0000173';
      ipftRate = '0.000001';
      sttSellRate =
        spec.schedule === 'APR_2026_ONWARD'
          ? '0.0005'
          : spec.schedule === 'OCT_2024_TO_MAR_2026'
          ? '0.0002'
          : '0.000125';
      stampBuyRate = '0.00002';
      break;
    case 'NSE_OPTIONS':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.000495' : '0.0003503';
      ipftRate = '0.000005';
      sttSellRate =
        spec.schedule === 'APR_2026_ONWARD'
          ? '0.0015'
          : spec.schedule === 'OCT_2024_TO_MAR_2026'
          ? '0.001'
          : '0.000625';
      sttExerRate = spec.schedule === 'APR_2026_ONWARD' ? '0.0015' : '0.00125';
      stampBuyRate = '0.00003';
      break;
    case 'BSE_FUTURES':
      exchRate = '0';
      sttSellRate = spec.schedule === 'APR_2026_ONWARD' ? '0.0005' : '0.0002';
      stampBuyRate = '0.00002';
      break;
    case 'BSE_OPTIONS':
      exchRate = '0.000325';
      sttSellRate = spec.schedule === 'APR_2026_ONWARD' ? '0.0015' : '0.001';
      sttExerRate = spec.schedule === 'APR_2026_ONWARD' ? '0.0015' : '0.00125';
      stampBuyRate = '0.00003';
      break;
    case 'MCX_FUTURES':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.000026' : '0.000021';
      sttSellRate = '0.0001';
      stampBuyRate = '0.00002';
      break;
    case 'MCX_OPTIONS':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.0005' : '0.000418';
      sttSellRate = '0.0005';
      sttExerRate = '0.0001';
      stampBuyRate = '0.00003';
      break;
    case 'NSE_CURRENCY_FUTURES':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.000009' : '0.0000035';
      ipftRate = '0.0000005';
      stampBuyRate = '0.000001';
      break;
    case 'NSE_CURRENCY_OPTIONS':
      exchRate = spec.schedule === 'PRE_OCT_2024' ? '0.00035' : '0.000311';
      ipftRate = '0.00002';
      stampBuyRate = '0.000001';
      break;
  }

  const exchangeFees = total.times(exchRate).plus(total.times(ipftRate));
  const sebi = total.times('0.000001');
  const stamp = buy.times(stampBuyRate);
  const dp = new CalcDecimal(spec.dpChargeBase ?? 0);

  let stt = new CalcDecimal(0);
  if (spec.isPhysicalSettlement) {
    stt = total.times('0.001');
  } else if (spec.isOptionExercise) {
    stt = total.times(sttExerRate);
  } else {
    stt = buy.times(sttBuyRate).plus(sell.times(sttSellRate));
  }

  const gst = brokerage.plus(exchangeFees).plus(sebi).plus(dp).times('0.18');
  const regulatoryFees = sebi.plus(stamp).plus(dp);
  const taxes = stt.plus(gst);

  const b2 = Number(brokerage.toFixed(2));
  const e2 = Number(exchangeFees.toFixed(2));
  const r2 = Number(regulatoryFees.toFixed(2));
  const t2 = Number(taxes.toFixed(2));
  const totalCosts = Number(new CalcDecimal(b2).plus(e2).plus(r2).plus(t2).toFixed(2));

  return { brokerage: b2, exchangeFees: e2, regulatoryFees: r2, taxes: t2, totalCosts };
}

describe('Golden Calculation & Audit Verification Suite (Phases 1-6)', () => {
  describe('Phase 0: Isolated CalcDecimal & Rounding Safety', () => {
    it('stays isolated even if global Decimal.set() is altered externally', () => {
      const prevConfig = {
        precision: Decimal.precision,
        rounding: Decimal.rounding,
      };
      try {
        Decimal.set({ precision: 5, rounding: Decimal.ROUND_DOWN });
        // 100.005 with ROUND_HALF_UP at 2dp must always equal 100.01 regardless of global Decimal.set
        expect(new CalcDecimal('100.005').toFixed(2)).toBe('100.01');
        // High-precision intermediate arithmetic retains 30 digits
        const prod = new CalcDecimal('123456789012345.123456789').times('2.0000000000000000001');
        expect(prod.toFixed(0)).toBe('246913578024690');
      } finally {
        Decimal.set(prevConfig);
      }
    });
  });

  describe('Phase 1: Instrument Specs, Multipliers, Effective-Dated Lots & Normalization', () => {
    it('resolves verified lot sizes (effective-dated), MCX multipliers, ticks, and Global FX without 1:1 shortcuts', () => {
      // NIFTY historical vs Apr 2026+ effective lot sizes
      expect(getEffectiveLotSize('NIFTY', '2024-11-10')).toBe(25);
      expect(getEffectiveLotSize('NIFTY', '2025-06-15')).toBe(75);
      expect(getEffectiveLotSize('NIFTY', '2026-04-01')).toBe(65);
      expect(getEffectiveLotSize('BANKNIFTY', '2024-10-01')).toBe(15);
      expect(getEffectiveLotSize('BANKNIFTY', '2025-06-01')).toBe(35);
      expect(getEffectiveLotSize('BANKNIFTY', '2026-04-01')).toBe(30);
      expect(getEffectiveLotSize('FINNIFTY', '2026-04-01')).toBe(60);
      expect(getEffectiveLotSize('MIDCPNIFTY', '2026-04-01')).toBe(120);
      expect(getEffectiveLotSize('NIFTYNXT50', '2026-04-01')).toBe(25);
      expect(getEffectiveLotSize('SENSEX', '2026-04-01')).toBe(20);
      expect(getEffectiveLotSize('BANKEX', '2026-04-01')).toBe(30);
      expect(getEffectiveLotSize('SENSEX50', '2026-04-01')).toBe(60);

      // MCX quote-unit multipliers (GOLD 1kg per 10g quote -> 100x; GOLDM 100g -> 10x; SILVER 30kg -> 30x; CRUDEOIL -> 100x)
      const gold = InstrumentSpecRegistry.resolve('GOLD', { marketRegion: 'IN', baseCurrency: 'INR' });
      const goldm = InstrumentSpecRegistry.resolve('GOLDM', { marketRegion: 'IN', baseCurrency: 'INR' });
      const silver = InstrumentSpecRegistry.resolve('SILVER', { marketRegion: 'IN', baseCurrency: 'INR' });
      const silverm = InstrumentSpecRegistry.resolve('SILVERM', { marketRegion: 'IN', baseCurrency: 'INR' });
      const crude = InstrumentSpecRegistry.resolve('CRUDEOIL', { marketRegion: 'IN', baseCurrency: 'INR' });
      const crudem = InstrumentSpecRegistry.resolve('CRUDEOILMINI', { marketRegion: 'IN', baseCurrency: 'INR' });
      const natgas = InstrumentSpecRegistry.resolve('NATURALGAS', { marketRegion: 'IN', baseCurrency: 'INR' });
      const natgasM = InstrumentSpecRegistry.resolve('NATGASMINI', { marketRegion: 'IN', baseCurrency: 'INR' });
      const copper = InstrumentSpecRegistry.resolve('COPPER', { marketRegion: 'IN', baseCurrency: 'INR' });

      expect(gold.contractMultiplier).toBe(100);
      expect(goldm.contractMultiplier).toBe(10);
      expect(silver.contractMultiplier).toBe(30);
      expect(silverm.contractMultiplier).toBe(5);
      expect(crude.contractMultiplier).toBe(100);
      expect(crudem.contractMultiplier).toBe(10);
      expect(natgas.contractMultiplier).toBe(1250);
      expect(natgasM.contractMultiplier).toBe(250);
      expect(copper.contractMultiplier).toBe(2500);

      // Global Forex EURUSD: standard contract = 100,000 units, lot step = 0.01, tick = 0.00001
      const eurusd = InstrumentSpecRegistry.resolve('EURUSD', { marketRegion: 'GLOBAL', baseCurrency: 'USD' });
      expect(eurusd.contractMultiplier).toBe(100000);
      expect(eurusd.minLot).toBe(0.01);
      expect(eurusd.tickSize).toBe(0.00001);
      expect(eurusd.quoteCurrency).toBe('USD');

      // Explicit currency conversion USD -> INR (no silent 1:1)
      const fx = convertCurrency({
        amount: 250, // $250 EURUSD P&L (0.05 lots * 50 pips)
        fromCurrency: 'USD',
        toCurrency: 'INR',
        exchangeRate: 84.5,
      });
      expect(fx.convertedAmount).toBe(21125);
      expect(fx.isAvailable).toBe(true);
      expect(fx.exchangeRate).toBe(84.5);

      // NSE Cash tick bands (NSE Circular Apr 2025): <250 => 0.01, 250..1000 => 0.05, 1000..5000 => 0.10, >5000 => 0.50
      expect(getNseTickSize(120)).toBe(0.01);
      expect(getNseTickSize(600)).toBe(0.05);
      expect(getNseTickSize(2500)).toBe(0.1);
      expect(getNseTickSize(6200)).toBe(0.5);
    });

    it('handles normalizeUnderlying edge cases without prefix collisions', () => {
      expect(normalizeUnderlying('NSE:BANKNIFTY26DECFUT')).toBe('BANKNIFTY');
      expect(normalizeUnderlying('NIFTY26O1923100PE')).toBe('NIFTY');
      expect(normalizeUnderlying('NIFTYNXT5026NOVFUT')).toBe('NIFTYNXT50');
      expect(normalizeUnderlying('NIFTYIT')).toBe('NIFTYIT');
      expect(normalizeUnderlying('NIFTYBEES-EQ.NS')).toBe('NIFTYBEES');
      expect(normalizeUnderlying('RELIANCE-EQ.NS')).toBe('RELIANCE');
      expect(normalizeUnderlying('GOLDBEES.BO')).toBe('GOLDBEES');
      expect(normalizeUnderlying('GOLDENTOBC')).toBe('GOLDENTOBC');
      expect(normalizeUnderlying('MCX:GOLDM26NOVFUT')).toBe('GOLDM');
      expect(normalizeUnderlying('MCX:GOLDGUINEA26NOVFUT')).toBe('GOLDGUINEA');
      expect(normalizeUnderlying('BSE:SENSEX26NOV79000CE')).toBe('SENSEX');
      expect(normalizeUnderlying('SENSEX5026NOVFUT')).toBe('SENSEX50');
      expect(normalizeUnderlying('NSE:USDINR26NOVFUT')).toBe('USDINR');
    });
  });

  describe('Phase 2: Contract Note Golden Matrix vs Independent Statutory Reference Calculator', () => {
    it('Contract Note #1: NSE Cash Equity Intraday (small 0.03% cap + large ₹20 flat cap)', () => {
      // Fixture 1A: Small order (turnover 25,000 -> 0.03% = 7.50 buy, 25,500 * 0.0003 = 7.65 sell)
      const small = calculateIndianCharges({
        assetClass: 'EQUITY',
        marketSegment: 'NSE_EQ',
        holdingType: 'INTRADAY',
        entryPrice: 500,
        exitPrice: 510,
        quantity: 50,
        tradeDate: '2026-05-12',
      });
      const refSmall = referenceIndianStatutoryCharges({
        segment: 'NSE_EQ_INTRADAY',
        schedule: 'APR_2026_ONWARD',
        buyTurnover: 25000,
        sellTurnover: 25500,
      });
      expect(small.brokerage).toBe(refSmall.brokerage);
      expect(small.exchangeFees).toBe(refSmall.exchangeFees);
      expect(small.regulatoryFees).toBe(refSmall.regulatoryFees);
      expect(small.taxes).toBe(refSmall.taxes);
      expect(small.totalCosts).toBe(refSmall.totalCosts);

      // Fixture 1B: Large multi-order (2 entry orders, 1 exit order)
      const large = calculateIndianCharges({
        assetClass: 'EQUITY',
        marketSegment: 'NSE_EQ',
        holdingType: 'INTRADAY',
        entryPrice: 2000,
        exitPrice: 2020,
        quantity: 100,
        entryOrdersCount: 2,
        exitOrdersCount: 1,
        tradeDate: '2026-05-12',
      });
      const refLarge = referenceIndianStatutoryCharges({
        segment: 'NSE_EQ_INTRADAY',
        schedule: 'APR_2026_ONWARD',
        buyTurnover: 200000,
        sellTurnover: 202000,
        buyOrders: 2,
        sellOrders: 1,
      });
      expect(large.brokerage).toBe(60); // (2 + 1) * 20
      expect(large.totalCosts).toBe(refLarge.totalCosts);
    });

    it('Contract Note #2: NSE Cash Equity Delivery (0.1% STT B+S, 0.015% Stamp Duty, DP charge + GST)', () => {
      const delivery = calculateIndianCharges({
        assetClass: 'EQUITY',
        marketSegment: 'NSE_EQ',
        holdingType: 'DELIVERY',
        entryPrice: 1500,
        exitPrice: 1620,
        quantity: 100,
        broker: 'ZERODHA',
        dpChargePerSell: 15.93,
        tradeDate: '2026-05-12',
      });
      const ref = referenceIndianStatutoryCharges({
        segment: 'NSE_EQ_DELIVERY',
        schedule: 'APR_2026_ONWARD',
        buyTurnover: 150000,
        sellTurnover: 162000,
        buyBrokeragePerOrder: 0,
        sellBrokeragePerOrder: 0,
        dpChargeBase: 15.93,
      });
      expect(delivery.brokerage).toBe(0);
      expect(delivery.sttCtt).toBe(312.00); // 150 + 162
      expect(delivery.stampDuty).toBe(22.50); // 150000 * 0.00015
      expect(delivery.dpCharges).toBe(15.93);
      expect(delivery.exchangeFees).toBe(ref.exchangeFees);
      expect(delivery.regulatoryFees).toBe(ref.regulatoryFees);
      expect(delivery.taxes).toBe(ref.taxes);
      expect(delivery.totalCosts).toBe(ref.totalCosts);
    });

    it('Contract Note #3: Corrected USER_FLOWS NIFTY 2-lot Index Futures golden reproduction (Oct-2024 vs Apr-2026)', () => {
      // Old USER_FLOWS mistakenly multiplied NIFTY 24000 -> 24120 on 2 lots of 25 (=50) as ₹207.82.
      // Let's verify exact first-principles round trip on 50 qty (2 lots of 25 in Oct-2024):
      const niftyOct2024 = calculateIndianCharges({
        assetClass: 'FUTURES',
        marketSegment: 'NSE_FNO',
        symbol: 'NIFTY24NOVFUT',
        entryPrice: 24000,
        exitPrice: 24120,
        quantity: 50,
        contractMultiplier: 1,
        tradeDate: '2024-11-10',
      });
      const refOct2024 = referenceIndianStatutoryCharges({
        segment: 'NSE_FUTURES',
        schedule: 'OCT_2024_TO_MAR_2026',
        buyTurnover: 1200000,
        sellTurnover: 1206000,
      });
      expect(niftyOct2024.totalCosts).toBe(refOct2024.totalCosts);
      expect(niftyOct2024.totalCosts).toBe(367.20);

      // Finance Act 2026 (eff. Apr 1, 2026, NIFTY 2 lots = 130 qty, Futures STT = 0.05%):
      const niftyApr2026 = calculateIndianCharges({
        assetClass: 'FUTURES',
        marketSegment: 'NSE_FNO',
        symbol: 'NIFTY26MAYFUT',
        entryPrice: 24000,
        exitPrice: 24120,
        quantity: 130,
        contractMultiplier: 1,
        tradeDate: '2026-05-12',
      });
      const refApr2026 = referenceIndianStatutoryCharges({
        segment: 'NSE_FUTURES',
        schedule: 'APR_2026_ONWARD',
        buyTurnover: 24000 * 130,
        sellTurnover: 24120 * 130,
      });
      expect(niftyApr2026.totalCosts).toBe(refApr2026.totalCosts);
    });

    it('Contract Note #4: NSE Index Options SHORT + Exercise + MCX Commodities + NSE Currency', () => {
      // Short NIFTY Options Apr 2026+ (0.15% sell STT, 0.03503% txn, ₹50/cr IPFT)
      const optShort = calculateIndianCharges({
        direction: 'SHORT',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        symbol: 'NIFTY2651924000CE',
        entryPrice: 210,
        exitPrice: 85,
        quantity: 65,
        tradeDate: '2026-05-12',
      });
      const refOpt = referenceIndianStatutoryCharges({
        segment: 'NSE_OPTIONS',
        schedule: 'APR_2026_ONWARD',
        sellTurnover: 210 * 65,
        buyTurnover: 85 * 65,
      });
      expect(optShort.totalCosts).toBe(refOpt.totalCosts);

      // MCX Crude Oil Option (MCX_OPTIONS precedence must override generic OPTIONS!)
      const mcxOpt = calculateIndianCharges({
        direction: 'LONG',
        assetClass: 'OPTIONS',
        marketSegment: 'MCX',
        exchange: 'MCX',
        symbol: 'CRUDEOIL26MAY6000CE',
        entryPrice: 180,
        exitPrice: 240,
        quantity: 1,
        contractMultiplier: 100,
        tradeDate: '2026-05-12',
      });
      expect(mcxOpt.resolvedSegment).toBe('MCX_OPTIONS');
      const refMcxOpt = referenceIndianStatutoryCharges({
        segment: 'MCX_OPTIONS',
        schedule: 'APR_2026_ONWARD',
        buyTurnover: 18000,
        sellTurnover: 24000,
      });
      expect(mcxOpt.totalCosts).toBe(refMcxOpt.totalCosts);

      // NSE Currency Futures USDINR (Nil STT, ₹0.05/lakh IPFT, 1000x multiplier)
      const usdinr = calculateIndianCharges({
        direction: 'LONG',
        assetClass: 'CURRENCY',
        marketSegment: 'NSE_FNO',
        exchange: 'NSE',
        symbol: 'USDINR26MAYFUT',
        entryPrice: 84.5,
        exitPrice: 84.8,
        quantity: 5,
        contractMultiplier: 1000,
        tradeDate: '2026-05-12',
      });
      expect(usdinr.resolvedSegment).toBe('NSE_CURRENCY_FUTURES');
      expect(usdinr.sttCtt).toBe(0);
      const refUsdInr = referenceIndianStatutoryCharges({
        segment: 'NSE_CURRENCY_FUTURES',
        schedule: 'APR_2026_ONWARD',
        buyTurnover: 84.5 * 5000,
        sellTurnover: 84.8 * 5000,
      });
      expect(usdinr.totalCosts).toBe(refUsdInr.totalCosts);
    });

    it('allocates partial-fill charges with zero paise drift across slices and supports FIFO flips', () => {
      const roundTrip = calculateIndianCharges({
        direction: 'LONG',
        assetClass: 'FUTURES',
        marketSegment: 'NSE_FNO',
        symbol: 'NIFTY26MAYFUT',
        entryPrice: 24000,
        exitPrice: 24100,
        quantity: 195, // 3 lots
        tradeDate: '2026-05-12',
      });

      const allocated = allocateChargesProportionally(roundTrip.totalCosts, [65, 65, 65]);
      const sum = allocated.reduce((acc, v) => acc.plus(v), new CalcDecimal(0));
      expect(sum.toNumber()).toBe(roundTrip.totalCosts);

      // Odd split 17 / 31 / 52
      const oddAllocated = allocateChargesProportionally(roundTrip.totalCosts, [17, 31, 52]);
      const oddSum = oddAllocated.reduce((acc, v) => acc.plus(v), new CalcDecimal(0));
      expect(oddSum.toNumber()).toBe(roundTrip.totalCosts);

      // FIFO with equal-timestamp tie breaker (ENTRY before EXIT) and position flip
      const fifo = calculateFIFOExecution(
        'LONG',
        [
          { id: 'exit-1', type: 'EXIT', quantity: 100, price: 24100, timestamp: '2026-05-12T09:15:00Z', fee: 45 },
          { id: 'entry-1', type: 'ENTRY', quantity: 65, price: 24000, timestamp: '2026-05-12T09:15:00Z', fee: 35 },
        ],
        1,
        2,
        { allowPositionFlip: true }
      );
      expect(fifo.closedQuantity.toNumber()).toBe(65);
      expect(fifo.realizedGrossPnL.toNumber()).toBe(6500);
      expect(fifo.overflowFlipFills).toHaveLength(1);
      expect(fifo.overflowFlipFills?.[0].quantity).toBe(35);
      expect(fifo.overflowFlipFills?.[0].type).toBe('ENTRY');
    });
  });

  describe('Phase 3: P&L Classification & 10,000-Trade CalcDecimal Zero-Drift Property Test', () => {
    it('classifies net-zero P&L at 2dp (ignores sub-paise dust) and achieves 0.00 drift across 10,000 trades', () => {
      // Sub-paise positive raw diff (+0.004) rounds to 0.00 -> BREAKEVEN, not WIN!
      const dustWin = calculateLinearPnL({
        direction: 'LONG',
        entryPrice: 100,
        exitPrice: 100.0004,
        quantity: 10,
      });
      expect(dustWin.netPnLNumber).toBe(0);
      expect(dustWin.outcome).toBe('BREAKEVEN');

      // 10,000 trades property test comparing CalcDecimal exact sum against 2dp integer-paise ground truth
      let exactPaise = 0;
      let decimalRunningBalance = new CalcDecimal(1000000);

      for (let i = 0; i < 10000; i++) {
        const entryPaise = 10000 + (i % 73) * 13; // e.g. 100.13
        const exitPaise = entryPaise + (i % 2 === 0 ? 17 : -11);
        const qty = (i % 5) + 1;
        const costPaise = 143 + (i % 19);

        const res = calculateLinearPnL({
          direction: 'LONG',
          entryPrice: entryPaise / 100,
          exitPrice: exitPaise / 100,
          quantity: qty,
          brokerage: costPaise / 100,
        });

        const expectedGrossPaise = (exitPaise - entryPaise) * qty;
        const expectedNetPaise = expectedGrossPaise - costPaise;
        exactPaise += expectedNetPaise;
        decimalRunningBalance = decimalRunningBalance.plus(res.netPnL);
      }

      const expectedBalance = new CalcDecimal(1000000).plus(new CalcDecimal(exactPaise).div(100));
      expect(decimalRunningBalance.toFixed(2)).toBe(expectedBalance.toFixed(2));
    });
  });

  describe('Phase 4: Risk, Cost-Adjusted R:R, Template SL Rounding & Iterative True Breakeven', () => {
    it('deducts costs when includeCostsInBudget=true, separates geometric vs cost-adjusted R:R, and verifies true breakeven by full recompute', () => {
      const risk = calculateRiskAndPositionSize({
        accountEquity: 1000000,
        riskPercent: 1, // ₹10,000 budget
        direction: 'LONG',
        entryPrice: 24000,
        stopLossPrice: 23900, // 100 pts * 65 lot = ₹6,500 per lot
        targetPrice: 24300, // 300 pts -> Geometric 3.00R
        lotSize: 65,
        estimatedCosts: 4000, // Only ₹6,000 remaining if costs deducted -> 0 lots floored!
        includeCostsInBudget: true,
      });
      expect(risk.rewardRiskRatio).toBe(3);
      expect(risk.roundedLotQuantity).toBe(0);
      expect(risk.warnings.length).toBeGreaterThan(0);

      const riskUncapped = calculateRiskAndPositionSize({
        accountEquity: 1000000,
        riskPercent: 1,
        direction: 'LONG',
        entryPrice: 24000,
        stopLossPrice: 23900,
        targetPrice: 24300,
        lotSize: 65,
        estimatedCosts: 400,
        includeCostsInBudget: false,
      });
      expect(riskUncapped.roundedLotQuantity).toBe(65);
      expect(riskUncapped.rewardRiskRatio).toBe(3); // |24300-24000| / |24000-23900|
      expect(riskUncapped.costAdjustedRewardRiskRatio).toBeLessThan(3);

      // Anchored Realized R
      expect(calculateRealizedRMultiple(12000, 6000)).toBe(2);

      // Iterative True Breakeven verification: full recompute at BE has netPnL >= 0; one tick worse has netPnL < 0!
      const scenarios: Array<{
        name: string;
        direction: 'LONG' | 'SHORT';
        assetClass: 'FUTURES' | 'OPTIONS' | 'EQUITY';
        marketSegment: 'NSE_FNO' | 'NSE_EQ';
        symbol: string;
        entryPrice: number;
        quantity: number;
        tickSize: number;
      }> = [
        {
          name: 'LONG NIFTY FUT',
          direction: 'LONG',
          assetClass: 'FUTURES',
          marketSegment: 'NSE_FNO',
          symbol: 'NIFTY26MAYFUT',
          entryPrice: 24000,
          quantity: 130,
          tickSize: 0.05,
        },
        {
          name: 'SHORT BANKNIFTY FUT',
          direction: 'SHORT',
          assetClass: 'FUTURES',
          marketSegment: 'NSE_FNO',
          symbol: 'BANKNIFTY26MAYFUT',
          entryPrice: 52000,
          quantity: 60,
          tickSize: 0.05,
        },
        {
          name: 'LONG NIFTY OPT',
          direction: 'LONG',
          assetClass: 'OPTIONS',
          marketSegment: 'NSE_FNO',
          symbol: 'NIFTY2651924000CE',
          entryPrice: 150,
          quantity: 65,
          tickSize: 0.05,
        },
        {
          name: 'SHORT NSE INTRADAY EQ',
          direction: 'SHORT',
          assetClass: 'EQUITY',
          marketSegment: 'NSE_EQ',
          symbol: 'RELIANCE',
          entryPrice: 1400,
          quantity: 100,
          tickSize: 0.1,
        },
      ];

      for (const s of scenarios) {
        const be = calculateTrueBreakevenPrice({
          direction: s.direction,
          entryPrice: s.entryPrice,
          quantity: s.quantity,
          contractMultiplier: 1,
          tickSize: s.tickSize,
          assetClass: s.assetClass,
          marketSegment: s.marketSegment,
          symbol: s.symbol,
          tradeDate: '2026-05-12',
        });

        const chargesAtBe = calculateIndianCharges({
          direction: s.direction,
          assetClass: s.assetClass,
          marketSegment: s.marketSegment,
          symbol: s.symbol,
          entryPrice: s.entryPrice,
          exitPrice: be.trueBreakevenPrice,
          quantity: s.quantity,
          tradeDate: '2026-05-12',
        });

        const grossAtBe =
          s.direction === 'LONG'
            ? (be.trueBreakevenPrice - s.entryPrice) * s.quantity
            : (s.entryPrice - be.trueBreakevenPrice) * s.quantity;
        const netAtBe = grossAtBe - chargesAtBe.totalCosts;
        expect(netAtBe, `${s.name} should have netPnL >= 0 at trueBreakeven`).toBeGreaterThanOrEqual(0);

        const worsePrice = Number(
          (s.direction === 'LONG'
            ? be.trueBreakevenPrice - s.tickSize
            : be.trueBreakevenPrice + s.tickSize
          ).toFixed(2)
        );
        const chargesWorse = calculateIndianCharges({
          direction: s.direction,
          assetClass: s.assetClass,
          marketSegment: s.marketSegment,
          symbol: s.symbol,
          entryPrice: s.entryPrice,
          exitPrice: worsePrice,
          quantity: s.quantity,
          tradeDate: '2026-05-12',
        });
        const grossWorse =
          s.direction === 'LONG'
            ? (worsePrice - s.entryPrice) * s.quantity
            : (s.entryPrice - worsePrice) * s.quantity;
        const netWorse = grossWorse - chargesWorse.totalCosts;
        expect(netWorse, `${s.name} should have netPnL < 0 one tick worse`).toBeLessThan(0);
      }

      // resolveTemplate: SHORT option target is clamped >= tickSize instead of negative/missing
      const shortOptPatch = resolveTemplate(
        {
          id: 't1',
          name: 'Option Scalper',
          titlePattern: '{SYMBOL} {DIR}',
          group: 'OPTIONS_BUY',
          assetClasses: ['OPTIONS'],
          direction: 'SHORT',
          slRule: { type: 'PREMIUM_PERCENT', value: 40 },
          minRR: 3, // Raw target = 50 - 3*(20) = -10 -> must clamp to 1 tick (0.05) instead of omitting/negative!
          tags: [],
        } as any,
        {
          symbol: 'NIFTY2651924000CE',
          assetClass: 'OPTIONS',
          entryPrice: 50,
          direction: 'SHORT',
          tickSize: 0.05,
        }
      );
      expect(shortOptPatch.risk.initialStopLoss).toBeGreaterThan(50);
      expect(shortOptPatch.risk.plannedTarget).toBe(0.05);
    });
  });

  describe('Phase 5 & 6: Unified Metrics, Expiry Calendars, DST Sessions & ISO Weeks', () => {
    it('enforces unified thresholds, IST weekdays, cash-flow-safe drawdown, gross PF, 3-outcome Kelly, and Empirical-Bayes unit separation', () => {
      // Unified thresholds constant
      expect(RISK_AND_ALERT_THRESHOLDS.CRITICAL_REVERSAL_PEAK_R).toBe(1.0);
      expect(RISK_AND_ALERT_THRESHOLDS.CRITICAL_REVERSAL_CURRENT_R).toBe(0.2);
      expect(RISK_AND_ALERT_THRESHOLDS.STOP_CRITICAL_BUFFER_RATIO).toBe(0.25);

      // 3-outcome Kelly with breakevens: (p*b - q) / (b*(p+q))
      const kelly = calculateFractionalKelly({
        winProbability: 0.5,
        lossProbability: 0.3, // 20% breakeven
        averageWinMagnitude: 2,
        averageLossMagnitude: 1,
        edgeVerdict: 'LIKELY_EDGE',
      });
      // Expected b=2, fullKelly = (0.5*2 - 0.3) / (2 * 0.8) = 0.7 / 1.6 = 0.4375 -> 43.75%
      expect(kelly.unconstrainedKellyFraction).toBeCloseTo(0.4375, 4);

      // Edge verdict uses EMERGING (unified) when profitable with modest sample or insufficient certainty
      const edge = validateStrategyEdge(
        Array.from({ length: 12 }, (_, i) => ({
          id: `t${i}`,
          status: 'CLOSED',
          outcome: i % 3 === 0 ? 'LOSS' : 'WIN',
          netPnL: i % 3 === 0 ? -500 : 1200,
          realizedR: i % 3 === 0 ? -1 : 2.4,
        }))
      );
      expect(['LIKELY_EDGE', 'UNPROVEN', 'NO_EDGE_NEGATIVE']).toContain(edge.verdict);
      expect(edge.verdict).toBe('UNPROVEN'); // N=12 < 30 sample guard

      // Dashboard metrics: UTC 2026-10-19T19:00:00Z is Tuesday 00:30 IST (Monday UTC, Tuesday IST!)
      // + cashFlows (deposit ₹50,000 mid-series must not trigger fake drawdown when price gains!)
      const stats = calculateDashboardMetrics(
        [
          {
            tradeDate: '2026-10-19T19:00:00.000Z', // Tue 00:30 IST
            status: 'CLOSED',
            symbol: 'NIFTY',
            calculated: { netPnL: 10000, grossPnL: 10500, totalCosts: 500, outcome: 'WIN', realizedRMultiple: 2 },
          },
          {
            tradeDate: '2026-10-21T06:00:00.000Z', // Wed 11:30 IST
            status: 'CLOSED',
            symbol: 'NIFTY',
            calculated: { netPnL: -3000, grossPnL: -2500, totalCosts: 500, outcome: 'LOSS', realizedRMultiple: -1 },
          },
        ],
        100000,
        {
          timezone: 'Asia/Kolkata',
          cashFlows: [{ date: '2026-10-20T06:00:00.000Z', signedAmount: 50000 }],
        }
      );

      const tue = stats.performanceByWeekday.find((w) => w.day === 'Tuesday');
      expect(tue?.tradesCount).toBe(1);
      expect(stats.grossProfitFactor).toBe(4.2); // 10500 / 2500
      expect(stats.profitFactor).toBe(3.33); // 10000 / 3000
      expect(stats.expectancy).toBe(3500);
      expect(stats.expectancyR).toBe(0.5); // (2 + -1) / 2
      // Peak after deposit (100k + 10k + 50k = 160k); drawdown on 3k loss = 3k/160k = 1.88%
      expect(stats.maxDrawdownAmount).toBe(3000);

      // Discipline Score canonical 1-5 rating
      const dailySummary = calculateDailySessionSummary('2026-10-20', [
        {
          id: 'tr-1',
          symbol: 'NIFTY',
          entryTime: '2026-10-20T05:00:00Z',
          status: 'CLOSED',
          netPnL: 2000,
          mistakes: [],
        },
      ]);
      expect(dailySummary.suggestedDisciplineRating).toBe(5);

      // Weekly review with template + IST midnight-boundary trade checks:
      // 1) 2026-10-19T19:00:00Z (Mon UTC) = Tue 00:30 IST -> Tuesday weekday bucket
      // 2) Empirical-Bayes template expectancyUnit is tagged explicitly ('CURRENCY' vs 'R')
      const weekly = buildWeeklyReview({
        week: '2026-W43',
        trades: [
          {
            id: 'wt1',
            symbol: 'NIFTY',
            status: 'CLOSED',
            tradeDate: '2026-10-19T19:00:00Z',
            netPnL: 5000,
            grossPnL: 5200,
            totalCosts: 200,
            realizedR: 1.5,
            templateId: 'tpl1',
            templateName: 'ORB',
          },
        ],
      });
      expect(weekly.weekSummary.netPnL).toBe(5000);
      expect(weekly.templates.items[0]?.expectancyUnit).toBe('CURRENCY');
      expect(weekly.sessionsAndWeekdays.byWeekday.find((w) => w.day === 'Tuesday')?.tradesCount).toBe(1);
    });

    it('verifies Sep-2025+ NSE/BSE expiry weekdays, 2026 holiday shifts, ISO 53-week years, and FX DST transitions', () => {
      // 2026-01-15 was BSE/NSE Mumbai Municipal Election Holiday -> shifted back to Wednesday 2026-01-14 for SENSEX weekly
      expect(isExpiryDay('NIFTY', '2026-05-12')).toBe(true); // Tuesday NIFTY weekly
      expect(isExpiryDay('NIFTY', '2026-05-14')).toBe(false); // Thursday is no longer NIFTY expiry!
      expect(isExpiryDay('BANKNIFTY', '2026-05-26')).toBe(true); // Last Tuesday of May 2026 monthly
      expect(isExpiryDay('BANKNIFTY', '2026-05-12')).toBe(false); // No weekly BankNifty after Nov 2024
      expect(isExpiryDay('SENSEX', '2026-01-14')).toBe(true); // Shifted from Thu 2026-01-15 holiday
      expect(isExpiryDay('SENSEX', '2026-01-15')).toBe(false);
      expect(isExpiryDay('NIFTYIT', '2026-05-12')).toBe(false); // Not F&O

      // ISO-8601 week 53 validation: 2025 has 52 weeks; 2026 has 53 weeks!
      expect(getIsoWeeksInYear(2025)).toBe(52);
      expect(getIsoWeeksInYear(2026)).toBe(53);
      expect(() => isoWeekToRange('2025-W53')).toThrow();
      expect(formatDateInTz(isoWeekToRange('2026-W53').start, 'Asia/Kolkata')).toBe('2026-12-28');

      // London & NY DST awareness (Winter UTC vs Summer UTC):
      // 08:15 UTC in Winter (Jan) -> 08:15 GMT (LONDON open!); 07:15 UTC in Winter -> 07:15 GMT (ASIAN/OFF_HOURS!)
      // 07:15 UTC in Summer (July) -> 08:15 BST (LONDON open!)
      expect(SessionCalendarRegistry.deriveSession('FOREX_24_5', new Date('2026-01-14T07:15:00Z'))).toBe('ASIA');
      expect(SessionCalendarRegistry.deriveSession('FOREX_24_5', new Date('2026-07-15T07:15:00Z'))).toBe('LONDON');

      // MCX US DST close shift: Jan (EST) closes 23:55 IST (18:25 UTC); Jul (EDT) closes 23:30 IST (18:00 UTC)
      expect(SessionCalendarRegistry.deriveSession('MCX', new Date('2026-07-15T18:10:00Z'))).toBe('OFF_HOURS'); // 23:40 IST in summer (>23:30)
      expect(SessionCalendarRegistry.deriveSession('MCX', new Date('2026-01-14T18:10:00Z'))).toBe('MCX_EVENING'); // 23:40 IST in winter (<=23:55)

      // FeeModelRegistry supports both FOREX_COMMISSION per-lot and ZERO mode cleanly
      const fxFee = FeeModelRegistry.calculate('FOREX_COMMISSION', {
        assetClass: 'FOREX',
        marketSegment: 'FOREX',
        entryPrice: 1.08,
        exitPrice: 1.085,
        quantity: 0.5,
        commissionPerLot: 7,
      });
      expect(fxFee.brokerage).toBe(3.5);
    });
  });
});
