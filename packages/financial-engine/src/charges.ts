import Decimal from './decimal.js';
import {
  AssetClass,
  Direction,
  MarketSegment,
  getPairQuoteCurrency,
} from '@tradevault/shared';

export { getPairQuoteCurrency };

// Uses isolated CalcDecimal (30-digit precision, standard ROUND_HALF_UP)

export type IndianRateScheduleKey =
  | 'PRE_OCT_2024'
  | 'OCT_2024_TO_MAR_2026'
  | 'APR_2026_ONWARD';

export type ResolvedChargeSegment =
  | 'NSE_EQ_INTRADAY'
  | 'NSE_EQ_DELIVERY'
  | 'BSE_EQ_INTRADAY'
  | 'BSE_EQ_DELIVERY'
  | 'NSE_FUTURES'
  | 'NSE_OPTIONS'
  | 'BSE_FUTURES'
  | 'BSE_OPTIONS'
  | 'MCX_FUTURES'
  | 'MCX_OPTIONS'
  | 'NSE_CURRENCY_FUTURES'
  | 'NSE_CURRENCY_OPTIONS';

export interface StatutoryRateSpec {
  scheduleKey: IndianRateScheduleKey;
  effectiveFrom: string;
  citation: string;
  exchangeTxnRate: Decimal;
  ipftRate: Decimal;
  sebiRate: Decimal;
  sttCttBuyRate: Decimal;
  sttCttSellRate: Decimal;
  sttExerciseRate: Decimal;
  stampDutyBuyRate: Decimal;
  gstRate: Decimal;
}

export interface CalculateChargesParams {
  direction?: Direction | 'LONG' | 'SHORT' | string;
  assetClass: AssetClass;
  marketSegment?: MarketSegment;
  exchange?: string;
  symbol?: string;
  holdingType?: 'INTRADAY' | 'DELIVERY';
  entryPrice: number | string | Decimal;
  exitPrice?: number | string | Decimal | null;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  brokerFlatFeePerLeg?: number | string | Decimal;
  broker?: string;
  currency?: string;
  tradeDate?: Date | string;
  isSingleLeg?: boolean;
  /**
   * Explicit leg side when `isSingleLeg` is true (e.g. 'SELL' when computing charges for
   * a partial/closing exit leg of an initially LONG trade so STT applies on the sell leg).
   */
  legSide?: 'BUY' | 'SELL';
  /** Number of executed entry orders (defaults to 1). Discount brokerage caps apply per order. */
  entryOrdersCount?: number;
  /** Number of executed exit orders (defaults to 1 when closed, 0 when open single-leg). */
  exitOrdersCount?: number;
  /** True when charging STT for ITM option exercise on expiry. */
  isOptionExercise?: boolean;
  /** True when stock derivative settles physically into equity delivery on expiry. */
  isPhysicalSettlement?: boolean;
  /** Optional CDSL/NSDL DP charge applied once per closed/selling delivery trade (default 0 unless passed). */
  dpChargePerSell?: number | string | Decimal;
  /** When true, rounds STT/CTT component to nearest whole Rupee per IT Act STT Rule 6. */
  roundSttToInteger?: boolean;
}

export interface ChargesBreakdown {
  brokerage: number;
  exchangeFees: number;
  regulatoryFees: number; // SEBI charges + Stamp duty (+ DP charges if applicable)
  taxes: number; // STT/CTT + GST
  totalCosts: number;
  sebiTurnover: number;
  stampDuty: number;
  sttCtt: number;
  gst: number;
  exchangeTxnFee?: number;
  ipft?: number;
  dpCharges?: number;
  rateSchedule?: IndianRateScheduleKey;
  resolvedSegment?: ResolvedChargeSegment;
  brokerageDecimal: Decimal;
  exchangeFeesDecimal: Decimal;
  regulatoryFeesDecimal: Decimal;
  taxesDecimal: Decimal;
  totalCostsDecimal: Decimal;
}

function toIstDateString(dateInput?: Date | string): string {
  if (!dateInput) {
    return toIstDateString(new Date());
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput.trim())) {
    return dateInput.trim().slice(0, 10);
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return toIstDateString(new Date());
  }
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(
    ist.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Resolve effective regulatory rate schedule from IST trade date.
 * - PRE_OCT_2024: Before 2024-10-01
 * - OCT_2024_TO_MAR_2026: 2024-10-01 .. 2026-03-31 (Finance (No.2) Act 2024 + SEBI True-to-Label)
 * - APR_2026_ONWARD: >= 2026-04-01 (Finance Act 2026 / NSE/FATAX/73524 / BSE 20260331-7)
 */
export function resolveRateScheduleKey(tradeDate?: Date | string): IndianRateScheduleKey {
  const dateStr = toIstDateString(tradeDate);
  if (dateStr < '2024-10-01') return 'PRE_OCT_2024';
  if (dateStr < '2026-04-01') return 'OCT_2024_TO_MAR_2026';
  return 'APR_2026_ONWARD';
}

function isInrCurrencyDerivativeSymbol(symbol?: string): boolean {
  if (!symbol) return false;
  const upper = symbol.toUpperCase().replace(/^(NSE|BSE):/, '');
  return /^(USDINR|EURINR|GBPINR|JPYINR|EURUSD|GBPUSD|USDJPY)(\d|FUT|OPT|$)/.test(upper) &&
    /(INR)/.test(upper);
}

export function resolveIndianChargeSegment(
  params: Pick<CalculateChargesParams, 'assetClass' | 'marketSegment' | 'exchange' | 'symbol' | 'holdingType'>
): ResolvedChargeSegment {
  const sym = (params.symbol || '').toUpperCase().trim();
  const exch = (params.exchange || '').toUpperCase().trim();
  const seg = params.marketSegment;
  const asset = params.assetClass;
  const isDelivery = params.holdingType === 'DELIVERY';

  // 1. Indian Currency Derivatives (NSE/BSE CDS — e.g. USDINR, EURINR, GBPINR, JPYINR)
  if (isInrCurrencyDerivativeSymbol(sym)) {
    return asset === 'OPTIONS' || /(CE|PE)$/i.test(sym)
      ? 'NSE_CURRENCY_OPTIONS'
      : 'NSE_CURRENCY_FUTURES';
  }

  // 2. MCX Commodities (MUST precede generic OPTIONS check so MCX options use MCX rates!)
  if (seg === 'MCX' || exch === 'MCX' || asset === 'COMMODITY') {
    const isOpt = asset === 'OPTIONS' || /\d+(CE|PE)$/i.test(sym);
    return isOpt ? 'MCX_OPTIONS' : 'MCX_FUTURES';
  }

  // 3. BSE F&O (SENSEX, BANKEX, SENSEX50)
  if (seg === 'BSE_FNO' || (exch === 'BSE' && (asset === 'FUTURES' || asset === 'OPTIONS' || asset === 'INDEX'))) {
    const isOpt = asset === 'OPTIONS' || /\d+(CE|PE)$/i.test(sym);
    return isOpt ? 'BSE_OPTIONS' : 'BSE_FUTURES';
  }

  // 4. NSE F&O
  if (asset === 'OPTIONS') {
    return 'NSE_OPTIONS';
  }
  if (asset === 'FUTURES' || asset === 'INDEX' || seg === 'NSE_FNO') {
    return 'NSE_FUTURES';
  }

  // 5. BSE Cash Equity
  if (seg === 'BSE_EQ' || exch === 'BSE') {
    return isDelivery ? 'BSE_EQ_DELIVERY' : 'BSE_EQ_INTRADAY';
  }

  // 6. NSE Cash Equity (Intraday default vs Delivery)
  return isDelivery ? 'NSE_EQ_DELIVERY' : 'NSE_EQ_INTRADAY';
}

/**
 * Returns the date-effective statutory tax & fee rate table with circular citations.
 */
export function getIndianStatutoryRates(
  segment: ResolvedChargeSegment,
  tradeDate?: Date | string
): StatutoryRateSpec {
  const scheduleKey = resolveRateScheduleKey(tradeDate);
  const sebiRate = new Decimal('0.000001'); // ₹10 / crore (SEBI (Payment of Fees) Regulations)
  const gstRate = new Decimal('0.18'); // 18% GST on Brokerage + Exch Txn + IPFT + SEBI

  // Effective date label
  const effectiveFrom =
    scheduleKey === 'PRE_OCT_2024'
      ? '2023-04-01'
      : scheduleKey === 'OCT_2024_TO_MAR_2026'
      ? '2024-10-01'
      : '2026-04-01';

  switch (segment) {
    case 'NSE_EQ_INTRADAY':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'Finance Act + NSE True-to-Label (0.00297% eff. 2024-10-01; 0.00322% prior)',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.0000322') : new Decimal('0.0000297'),
        ipftRate: new Decimal('0.000001'), // ₹10 / crore
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate: new Decimal('0.00025'), // 0.025% sell
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00003'), // 0.003% buy
        gstRate,
      };

    case 'NSE_EQ_DELIVERY':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'Finance Act STT 0.1% B+S; Indian Stamp Act 0.015% B; NSE True-to-Label',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.0000322') : new Decimal('0.0000297'),
        ipftRate: new Decimal('0.000001'),
        sebiRate,
        sttCttBuyRate: new Decimal('0.001'), // 0.1% buy
        sttCttSellRate: new Decimal('0.001'), // 0.1% sell
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00015'), // 0.015% buy
        gstRate,
      };

    case 'BSE_EQ_INTRADAY':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'BSE Notice Equity Txn 0.00375%; STT 0.025% S; Stamp 0.003% B',
        exchangeTxnRate: new Decimal('0.0000375'),
        ipftRate: new Decimal(0),
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate: new Decimal('0.00025'),
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00003'),
        gstRate,
      };

    case 'BSE_EQ_DELIVERY':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'BSE Notice Equity Delivery 0.00375%; STT 0.1% B+S; Stamp 0.015% B',
        exchangeTxnRate: new Decimal('0.0000375'),
        ipftRate: new Decimal(0),
        sebiRate,
        sttCttBuyRate: new Decimal('0.001'),
        sttCttSellRate: new Decimal('0.001'),
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00015'),
        gstRate,
      };

    case 'NSE_FUTURES':
      return {
        scheduleKey,
        effectiveFrom,
        citation:
          scheduleKey === 'APR_2026_ONWARD'
            ? 'Finance Act 2026 & NSE/FATAX/73524 (0.05% STT eff. 2026-04-01)'
            : scheduleKey === 'OCT_2024_TO_MAR_2026'
            ? 'Finance (No.2) Act 2024 (0.02% STT) & NSE/FAOP/64161 (0.00173% eff. 2024-10-01)'
            : 'Pre-Oct 2024 (0.0125% STT, 0.00188% exch)',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.0000188') : new Decimal('0.0000173'),
        ipftRate: new Decimal('0.000001'), // ₹10 / crore
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate:
          scheduleKey === 'PRE_OCT_2024'
            ? new Decimal('0.000125')
            : scheduleKey === 'OCT_2024_TO_MAR_2026'
            ? new Decimal('0.0002')
            : new Decimal('0.0005'),
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00002'), // 0.002% buy
        gstRate,
      };

    case 'NSE_OPTIONS':
      return {
        scheduleKey,
        effectiveFrom,
        citation:
          scheduleKey === 'APR_2026_ONWARD'
            ? 'Finance Act 2026 & NSE/FATAX/73524 (0.15% STT sale & exer eff. 2026-04-01)'
            : scheduleKey === 'OCT_2024_TO_MAR_2026'
            ? 'Finance (No.2) Act 2024 (0.10% STT) & NSE True-to-Label (0.03503% eff. 2024-10-01)'
            : 'Pre-Oct 2024 (0.0625% STT, 0.0495% exch)',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.000495') : new Decimal('0.0003503'),
        ipftRate: new Decimal('0.000005'), // ₹50 / crore on options premium
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate:
          scheduleKey === 'PRE_OCT_2024'
            ? new Decimal('0.000625')
            : scheduleKey === 'OCT_2024_TO_MAR_2026'
            ? new Decimal('0.001')
            : new Decimal('0.0015'),
        sttExerciseRate:
          scheduleKey === 'APR_2026_ONWARD' ? new Decimal('0.0015') : new Decimal('0.00125'),
        stampDutyBuyRate: new Decimal('0.00003'), // 0.003% buy
        gstRate,
      };

    case 'BSE_FUTURES':
      return {
        scheduleKey,
        effectiveFrom,
        citation:
          scheduleKey === 'APR_2026_ONWARD'
            ? 'Finance Act 2026 & BSE 20260331-7 (0.05% STT; BSE Futures txn 0%)'
            : 'BSE F&O Futures (0% exch txn)',
        exchangeTxnRate: new Decimal(0),
        ipftRate: new Decimal(0),
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate:
          scheduleKey === 'PRE_OCT_2024'
            ? new Decimal('0.000125')
            : scheduleKey === 'OCT_2024_TO_MAR_2026'
            ? new Decimal('0.0002')
            : new Decimal('0.0005'),
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00002'),
        gstRate,
      };

    case 'BSE_OPTIONS':
      return {
        scheduleKey,
        effectiveFrom,
        citation:
          scheduleKey === 'APR_2026_ONWARD'
            ? 'Finance Act 2026 & BSE 20260331-7 (0.15% STT; 0.0325% exch txn)'
            : 'BSE True-to-Label (0.0325% Sensex/Bankex Options)',
        exchangeTxnRate: new Decimal('0.000325'),
        ipftRate: new Decimal(0),
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate:
          scheduleKey === 'PRE_OCT_2024'
            ? new Decimal('0.000625')
            : scheduleKey === 'OCT_2024_TO_MAR_2026'
            ? new Decimal('0.001')
            : new Decimal('0.0015'),
        sttExerciseRate:
          scheduleKey === 'APR_2026_ONWARD' ? new Decimal('0.0015') : new Decimal('0.00125'),
        stampDutyBuyRate: new Decimal('0.00003'),
        gstRate,
      };

    case 'MCX_FUTURES':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'MCX Master Circular MCX/F&A/226/2025 & MCX/F&A/233/2026 (0.0021% txn; 0.01% CTT; no client IPFT)',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.000026') : new Decimal('0.000021'),
        ipftRate: new Decimal(0), // MCX funds IPF from exchange revenue; no separate client IPFT levy
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate: new Decimal('0.0001'), // 0.01% non-agri CTT sell
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.00002'), // 0.002% buy
        gstRate,
      };

    case 'MCX_OPTIONS':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'MCX Master Circular MCX/F&A/226/2025 & MCX/F&A/233/2026 (0.0418% txn; 0.05% CTT; no client IPFT)',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.0005') : new Decimal('0.000418'),
        ipftRate: new Decimal(0), // MCX funds IPF from exchange revenue; no separate client IPFT levy
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate: new Decimal('0.0005'), // 0.05% CTT on sell premium
        sttExerciseRate: new Decimal('0.0001'),
        stampDutyBuyRate: new Decimal('0.00003'), // 0.003% buy
        gstRate,
      };

    case 'NSE_CURRENCY_FUTURES':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'NSE CDS Circular (0.00035% eff. 2024-10-01; 0.0009% prior); Nil STT; 0.0001% Stamp',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.000009') : new Decimal('0.0000035'),
        ipftRate: new Decimal('0.0000005'), // ₹0.05 / lakh
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate: new Decimal(0),
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.000001'), // 0.0001% buy
        gstRate,
      };

    case 'NSE_CURRENCY_OPTIONS':
      return {
        scheduleKey,
        effectiveFrom,
        citation: 'NSE CDS Options Circular (0.0311% eff. 2024-10-01; 0.035% prior); Nil STT',
        exchangeTxnRate:
          scheduleKey === 'PRE_OCT_2024' ? new Decimal('0.00035') : new Decimal('0.000311'),
        ipftRate: new Decimal('0.00002'), // ₹2 / lakh
        sebiRate,
        sttCttBuyRate: new Decimal(0),
        sttCttSellRate: new Decimal(0),
        sttExerciseRate: new Decimal(0),
        stampDutyBuyRate: new Decimal('0.000001'),
        gstRate,
      };
  }
}

/**
 * Calculates Indian regulatory charges, brokerage, STT/CTT, stamp duty, SEBI turnover fees,
 * IPFT, optional DP charges, and 18% GST using isolated 30-digit CalcDecimal arithmetic.
 */
export function calculateIndianCharges(params: CalculateChargesParams): ChargesBreakdown {
  const normBroker = (params.broker || '').toUpperCase().replace(/[\s_-]/g, '');
  const pairQuote = getPairQuoteCurrency(params.symbol);
  const isInrCurrDeriv = isInrCurrencyDerivativeSymbol(params.symbol);
  const isNonIndian =
    !isInrCurrDeriv &&
    (params.currency === 'USD' ||
      params.currency === 'EUR' ||
      params.currency === 'GBP' ||
      params.currency === 'USDT' ||
      params.assetClass === 'FOREX' ||
      params.assetClass === 'CRYPTO' ||
      params.marketSegment === 'FOREX' ||
      params.marketSegment === 'CRYPTO' ||
      params.marketSegment === 'US_EQUITY' ||
      params.marketSegment === 'CME' ||
      (pairQuote !== undefined && pairQuote !== 'INR') ||
      ['ELEFIN', 'MT5', 'FTMO', 'THE5ERS'].includes(normBroker));

  if (isNonIndian) {
    const flatPerLeg =
      params.brokerFlatFeePerLeg !== undefined
        ? new Decimal(params.brokerFlatFeePerLeg)
        : new Decimal(0);
    const legs = params.isSingleLeg ? 1 : 2;
    const brokerage = flatPerLeg.times(legs);
    const finalBrokerage = Number(brokerage.toFixed(2));
    const zero = new Decimal(0);
    return {
      brokerage: finalBrokerage,
      exchangeFees: 0,
      regulatoryFees: 0,
      taxes: 0,
      totalCosts: finalBrokerage,
      sebiTurnover: 0,
      stampDuty: 0,
      sttCtt: 0,
      gst: 0,
      exchangeTxnFee: 0,
      ipft: 0,
      dpCharges: 0,
      brokerageDecimal: new Decimal(finalBrokerage),
      exchangeFeesDecimal: zero,
      regulatoryFeesDecimal: zero,
      taxesDecimal: zero,
      totalCostsDecimal: new Decimal(finalBrokerage),
    };
  }

  const dEntry = new Decimal(params.entryPrice || 0);
  const dQty = new Decimal(params.quantity || 0);
  const dMultiplier = params.contractMultiplier
    ? new Decimal(params.contractMultiplier)
    : new Decimal(1);

  if (dQty.isNegative()) {
    throw new Error('Quantity cannot be negative');
  }

  const entryTurnover = dEntry.times(dQty).times(dMultiplier);
  const isShort = params.direction === 'SHORT';
  const hasExit =
    params.exitPrice !== undefined && params.exitPrice !== null && params.exitPrice !== '';

  let buyTurnover: Decimal;
  let sellTurnover: Decimal;
  let entryOrders = params.entryOrdersCount ?? 1;
  let exitOrders = params.exitOrdersCount ?? (params.isSingleLeg && !hasExit ? 0 : 1);

  if (hasExit) {
    const dExit = new Decimal(params.exitPrice!);
    const exitTurnover = dExit.times(dQty).times(dMultiplier);
    if (isShort) {
      sellTurnover = entryTurnover;
      buyTurnover = exitTurnover;
    } else {
      buyTurnover = entryTurnover;
      sellTurnover = exitTurnover;
    }
  } else if (params.isSingleLeg) {
    // Support explicit legSide so single closing fills of LONG positions incur SELL STT
    const singleSideIsSell =
      params.legSide ? params.legSide === 'SELL' : isShort;
    if (singleSideIsSell) {
      sellTurnover = entryTurnover;
      buyTurnover = new Decimal(0);
      if (params.exitOrdersCount === undefined && params.entryOrdersCount === undefined) {
        entryOrders = params.legSide === 'SELL' && !isShort ? 0 : 1;
        exitOrders = params.legSide === 'SELL' && !isShort ? 1 : 0;
      }
    } else {
      buyTurnover = entryTurnover;
      sellTurnover = new Decimal(0);
      if (params.exitOrdersCount === undefined && params.entryOrdersCount === undefined) {
        // Closing BUY fill of an initially SHORT trade incurs 1 exit order on buy side
        entryOrders = params.legSide === 'BUY' && isShort ? 0 : 1;
        exitOrders = params.legSide === 'BUY' && isShort ? 1 : 0;
      }
    }
  } else {
    // Round-trip estimate using entry price on both sides
    buyTurnover = entryTurnover;
    sellTurnover = entryTurnover;
  }

  const totalTurnover = buyTurnover.plus(sellTurnover);
  const resolvedSegment = resolveIndianChargeSegment(params);
  const rates = getIndianStatutoryRates(resolvedSegment, params.tradeDate);

  // Per-executed-order brokerage cap:
  // - Finvasia / explicit 0: ₹0
  // - Equity Intraday: min(legCap, turnover * 0.03%) per executed order
  // - Equity Delivery: ₹0 (Zerodha/AngelOne/Finvasia) or min(legCap, turnover * 0.3%) (FYERS)
  // - F&O / MCX / CDS: flat legCap per executed order
  let legCap = new Decimal(20);
  if (params.brokerFlatFeePerLeg !== undefined) {
    legCap = new Decimal(params.brokerFlatFeePerLeg);
  } else if (normBroker === 'FINVASIA') {
    legCap = new Decimal(0);
  } else if (
    resolvedSegment === 'NSE_EQ_DELIVERY' ||
    resolvedSegment === 'BSE_EQ_DELIVERY'
  ) {
    if (normBroker === 'FYERS') {
      legCap = new Decimal(20);
    } else {
      legCap = new Decimal(0);
    }
  }

  const computeLegBrokerage = (legTurnover: Decimal, ordersCount: number): Decimal => {
    if (ordersCount <= 0 || legCap.lte(0)) return new Decimal(0);
    if (
      resolvedSegment === 'NSE_EQ_INTRADAY' ||
      resolvedSegment === 'BSE_EQ_INTRADAY'
    ) {
      // Percentage cap applies per order (`0.03%` total turnover of that side vs `ordersCount * legCap`)
      if (legTurnover.lte(0)) return new Decimal(0);
      return Decimal.min(legCap.times(ordersCount), legTurnover.times('0.0003'));
    }
    if (
      resolvedSegment === 'NSE_EQ_DELIVERY' ||
      resolvedSegment === 'BSE_EQ_DELIVERY'
    ) {
      if (legTurnover.lte(0)) return new Decimal(0);
      return Decimal.min(legCap.times(ordersCount), legTurnover.times('0.003'));
    }
    return legCap.times(ordersCount);
  };

  const buyOrders = isShort ? exitOrders : entryOrders;
  const sellOrders = isShort ? entryOrders : exitOrders;
  const brokerage = computeLegBrokerage(buyTurnover, buyOrders).plus(
    computeLegBrokerage(sellTurnover, sellOrders)
  );

  // Statutory & exchange fee components
  const exchangeTxnFee = totalTurnover.times(rates.exchangeTxnRate);
  const ipft = totalTurnover.times(rates.ipftRate);
  const exchangeFees = exchangeTxnFee.plus(ipft);
  const sebiTurnover = totalTurnover.times(rates.sebiRate);
  const stampDuty = buyTurnover.times(rates.stampDutyBuyRate);

  let sttCtt: Decimal;
  if (params.isPhysicalSettlement) {
    // Physical settlement of equity F&O contracts attracts delivery STT (0.1% on both/settlement value)
    sttCtt = sellTurnover.times('0.001').plus(buyTurnover.times('0.001'));
  } else if (params.isOptionExercise) {
    sttCtt = sellTurnover.plus(buyTurnover).times(rates.sttExerciseRate);
  } else {
    sttCtt = buyTurnover
      .times(rates.sttCttBuyRate)
      .plus(sellTurnover.times(rates.sttCttSellRate));
  }

  if (params.roundSttToInteger) {
    sttCtt = new Decimal(sttCtt.toFixed(0, Decimal.ROUND_HALF_UP));
  }

  const dpBase =
    (resolvedSegment === 'NSE_EQ_DELIVERY' || resolvedSegment === 'BSE_EQ_DELIVERY') &&
    sellTurnover.gt(0) &&
    params.dpChargePerSell !== undefined
      ? new Decimal(params.dpChargePerSell)
      : new Decimal(0);

  // GST is 18% on (Brokerage + ExchangeTxn + IPFT + SEBI + DP Base)
  const gst = brokerage
    .plus(exchangeFees)
    .plus(sebiTurnover)
    .plus(dpBase)
    .times(rates.gstRate);

  const regulatoryFees = sebiTurnover.plus(stampDuty).plus(dpBase);
  const taxes = sttCtt.plus(gst);

  const finalBrokerage = Number(brokerage.toFixed(2));
  const finalExchangeFees = Number(exchangeFees.toFixed(2));
  const finalRegulatoryFees = Number(regulatoryFees.toFixed(2));
  const finalTaxes = Number(taxes.toFixed(2));
  const finalTotalCosts = Number(
    new Decimal(finalBrokerage)
      .plus(finalExchangeFees)
      .plus(finalRegulatoryFees)
      .plus(finalTaxes)
      .toFixed(2)
  );

  return {
    brokerage: finalBrokerage,
    exchangeFees: finalExchangeFees,
    regulatoryFees: finalRegulatoryFees,
    taxes: finalTaxes,
    totalCosts: finalTotalCosts,
    sebiTurnover: Number(sebiTurnover.toFixed(2)),
    stampDuty: Number(stampDuty.toFixed(2)),
    sttCtt: Number(sttCtt.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    exchangeTxnFee: Number(exchangeTxnFee.toFixed(2)),
    ipft: Number(ipft.toFixed(2)),
    dpCharges: Number(dpBase.toFixed(2)),
    rateSchedule: rates.scheduleKey,
    resolvedSegment,
    brokerageDecimal: new Decimal(finalBrokerage),
    exchangeFeesDecimal: new Decimal(finalExchangeFees),
    regulatoryFeesDecimal: new Decimal(finalRegulatoryFees),
    taxesDecimal: new Decimal(finalTaxes),
    totalCostsDecimal: new Decimal(finalTotalCosts),
  };
}

/**
 * Allocates exact round-trip total charges proportionally across an array of weightable
 * fills or slices using largest-remainder paise distribution so `sum(allocated) === totalCosts`
 * to the exact paise (`0.00`).
 */
export function allocateChargesProportionally(
  totalCosts: number | string | Decimal,
  weights: Array<number | string | Decimal>,
  precision = 2
): Decimal[] {
  if (weights.length === 0) return [];
  const scale = new Decimal(10).pow(precision);
  const targetUnits = new Decimal(
    new Decimal(totalCosts).times(scale).toFixed(0, Decimal.ROUND_HALF_UP)
  );
  const dWeights = weights.map((w) => Decimal.max(0, new Decimal(w)));
  const totalWeight = dWeights.reduce((acc, w) => acc.plus(w), new Decimal(0));

  if (totalWeight.lte(0)) {
    // Fallback equal allocation when all weights are 0
    return allocateChargesProportionally(
      totalCosts,
      weights.map(() => 1),
      precision
    );
  }

  const exactShares = dWeights.map((w) => targetUnits.times(w).dividedBy(totalWeight));
  const floored = exactShares.map((s) => s.floor());
  const remainders = exactShares.map((s, idx) => ({
    idx,
    rem: s.minus(floored[idx]),
  }));

  const currentSum = floored.reduce((acc, u) => acc.plus(u), new Decimal(0));
  let diff = targetUnits.minus(currentSum).toNumber();

  remainders.sort((a, b) => b.rem.minus(a.rem).toNumber());
  for (let i = 0; i < remainders.length && diff > 0; i++) {
    floored[remainders[i].idx] = floored[remainders[i].idx].plus(1);
    diff--;
  }

  return floored.map((units) => units.dividedBy(scale));
}

export class IndianChargesCalculator {
  static calculate(
    assetClass: AssetClass,
    marketSegment: MarketSegment,
    entryPrice: number | string | Decimal,
    exitPrice: number | string | Decimal | null | undefined,
    quantity: number | string | Decimal,
    contractMultiplier: number | string | Decimal = 1,
    brokerFlatFeePerLeg: number | string | Decimal = 20,
    broker?: string,
    direction?: Direction | 'LONG' | 'SHORT' | string,
    currency?: string,
    tradeDate?: Date | string
  ): ChargesBreakdown {
    return calculateIndianCharges({
      direction,
      assetClass,
      marketSegment,
      entryPrice,
      exitPrice,
      quantity,
      contractMultiplier,
      brokerFlatFeePerLeg,
      broker,
      currency,
      tradeDate,
    });
  }
}

/**
 * Calculates the exact exit price required for True Breakeven (Net P&L >= 0 after all fees/taxes),
 * rounded in the safe direction to the instrument's tick increment (`LONG`: ceil up, `SHORT`: floor down).
 *
 * When segment/assetClass is provided, runs fixed-point iteration + tick-by-tick full statutory
 * verification so `NetPnL(trueBreakevenPrice) >= 0` AND `NetPnL(oneTickWorse) < 0`.
 */
export function calculateTrueBreakevenPrice(params: {
  direction: 'LONG' | 'SHORT' | string;
  entryPrice: number | string | Decimal;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  estimatedCharges: number | string | Decimal;
  tickSize?: number | string | Decimal;
  pricePrecision?: number;
  assetClass?: AssetClass;
  marketSegment?: MarketSegment;
  exchange?: string;
  symbol?: string;
  holdingType?: 'INTRADAY' | 'DELIVERY';
  broker?: string;
  brokerFlatFeePerLeg?: number | string | Decimal;
  currency?: string;
  tradeDate?: Date | string;
  dpChargePerSell?: number | string | Decimal;
  roundSttToInteger?: boolean;
}): {
  trueBreakevenPrice: number;
  nominalBreakevenPrice: number;
  feeBufferPoints: number;
  verifiedChargesAtBreakeven?: number;
  verifiedNetPnLAtBreakeven?: number;
} {
  const dEntry = new Decimal(params.entryPrice || 0);
  const dQty = new Decimal(params.quantity || 1);
  const dMult = params.contractMultiplier
    ? new Decimal(params.contractMultiplier)
    : new Decimal(1);
  const dFees = new Decimal(params.estimatedCharges || 0);
  const dTick = params.tickSize ? new Decimal(params.tickSize) : new Decimal('0.05');

  const tickStr = dTick.toString();
  const inferredTickPrecision = tickStr.includes('.') ? tickStr.split('.')[1].length : 0;
  const pricePrecision = params.pricePrecision ?? Math.max(2, inferredTickPrecision);

  const totalEffectiveUnits = dQty.times(dMult);
  if (totalEffectiveUnits.isZero() || dEntry.isZero() || dTick.lte(0)) {
    return {
      trueBreakevenPrice: Number(dEntry.toFixed(pricePrecision)),
      nominalBreakevenPrice: Number(dEntry.toFixed(pricePrecision)),
      feeBufferPoints: 0,
    };
  }

  const isLong = params.direction === 'LONG';
  const roundSafeToTick = (raw: Decimal): Decimal => {
    const ticks = raw.dividedBy(dTick);
    return (isLong ? ticks.ceil() : ticks.floor()).times(dTick);
  };

  // Initial solve from estimatedCharges
  let feePoints = dFees.dividedBy(totalEffectiveUnits);
  let rawTrueBe = isLong ? dEntry.plus(feePoints) : dEntry.minus(feePoints);
  let trueBePrice = roundSafeToTick(rawTrueBe);

  // Full statutory fixed-point refinement + exact tick boundary check if assetClass provided
  if (params.assetClass) {
    const evalNetAt = (exitPx: Decimal): { charges: ChargesBreakdown; net: Decimal } => {
      const charges = calculateIndianCharges({
        direction: params.direction,
        assetClass: params.assetClass!,
        marketSegment: params.marketSegment,
        exchange: params.exchange,
        symbol: params.symbol,
        holdingType: params.holdingType,
        entryPrice: dEntry,
        exitPrice: exitPx,
        quantity: dQty,
        contractMultiplier: dMult,
        broker: params.broker,
        brokerFlatFeePerLeg: params.brokerFlatFeePerLeg,
        currency: params.currency,
        tradeDate: params.tradeDate,
        dpChargePerSell: params.dpChargePerSell,
        roundSttToInteger: params.roundSttToInteger,
      });
      const gross = isLong
        ? exitPx.minus(dEntry).times(totalEffectiveUnits)
        : dEntry.minus(exitPx).times(totalEffectiveUnits);
      const net = gross.minus(charges.totalCostsDecimal);
      return { charges, net };
    };

    // Fixed-point iterations to incorporate exit-price-dependent STT/exchange/GST
    let candidate = dEntry.plus(
      isLong
        ? evalNetAt(dEntry).charges.totalCostsDecimal.dividedBy(totalEffectiveUnits)
        : evalNetAt(dEntry).charges.totalCostsDecimal.dividedBy(totalEffectiveUnits).neg()
    );
    for (let i = 0; i < 6; i++) {
      const safeCandidate = Decimal.max(dTick, candidate);
      const { charges } = evalNetAt(safeCandidate);
      const next = isLong
        ? dEntry.plus(charges.totalCostsDecimal.dividedBy(totalEffectiveUnits))
        : dEntry.minus(charges.totalCostsDecimal.dividedBy(totalEffectiveUnits));
      if (next.minus(candidate).abs().lt(dTick.times('0.01'))) {
        candidate = next;
        break;
      }
      candidate = next;
    }

    trueBePrice = Decimal.max(dTick, roundSafeToTick(candidate));

    // Exact boundary walk: guarantee NetPnL(trueBePrice) >= 0 AND NetPnL(oneTickWorse) < 0
    for (let step = 0; step < 25; step++) {
      const cur = evalNetAt(trueBePrice);
      if (cur.net.lt(0)) {
        trueBePrice = isLong ? trueBePrice.plus(dTick) : Decimal.max(dTick, trueBePrice.minus(dTick));
      } else {
        const worse = isLong ? trueBePrice.minus(dTick) : trueBePrice.plus(dTick);
        if (worse.gt(0) && evalNetAt(worse).net.gte(0)) {
          trueBePrice = worse;
        } else {
          break;
        }
      }
    }

    const finalCheck = evalNetAt(trueBePrice);
    feePoints = finalCheck.charges.totalCostsDecimal.dividedBy(totalEffectiveUnits);

    return {
      trueBreakevenPrice: Number(trueBePrice.toFixed(pricePrecision)),
      nominalBreakevenPrice: Number(dEntry.toFixed(pricePrecision)),
      feeBufferPoints: Number(feePoints.toFixed(Math.max(2, pricePrecision))),
      verifiedChargesAtBreakeven: finalCheck.charges.totalCosts,
      verifiedNetPnLAtBreakeven: Number(finalCheck.net.toFixed(2)),
    };
  }

  return {
    trueBreakevenPrice: Number(trueBePrice.toFixed(pricePrecision)),
    nominalBreakevenPrice: Number(dEntry.toFixed(pricePrecision)),
    feeBufferPoints: Number(feePoints.toFixed(Math.max(2, pricePrecision))),
  };
}

export const calculateTrueBreakeven = calculateTrueBreakevenPrice;
