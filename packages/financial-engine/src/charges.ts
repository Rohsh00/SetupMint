import Decimal from 'decimal.js';
import { AssetClass, MarketSegment } from '@tradevault/shared';

// Ensure 30-digit precision with banker's rounding (ROUND_HALF_UP)
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface CalculateChargesParams {
  assetClass: AssetClass;
  marketSegment?: MarketSegment;
  entryPrice: number | string | Decimal;
  exitPrice?: number | string | Decimal | null;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  brokerFlatFeePerLeg?: number | string | Decimal;
  broker?: string;
  isSingleLeg?: boolean;
}

export interface ChargesBreakdown {
  brokerage: number;
  exchangeFees: number;
  regulatoryFees: number; // SEBI charges + Stamp duty
  taxes: number; // STT/CTT + GST
  totalCosts: number;
  sebiTurnover: number;
  stampDuty: number;
  sttCtt: number;
  gst: number;
  brokerageDecimal: Decimal;
  exchangeFeesDecimal: Decimal;
  regulatoryFeesDecimal: Decimal;
  taxesDecimal: Decimal;
  totalCostsDecimal: Decimal;
}

/**
 * Calculates Indian regulatory charges, brokerage, STT/CTT, stamp duty, SEBI turnover fees, and GST
 * using Decimal.js with 30-digit precision.
 */
export function calculateIndianCharges(params: CalculateChargesParams): ChargesBreakdown {
  const dEntry = new Decimal(params.entryPrice || 0);
  const dQty = new Decimal(params.quantity || 0);
  const dMultiplier = params.contractMultiplier ? new Decimal(params.contractMultiplier) : new Decimal(1);

  if (dQty.isNegative()) {
    throw new Error('Quantity cannot be negative');
  }

  const buyTurnover = dEntry.times(dQty).times(dMultiplier);

  let sellTurnover: Decimal;
  let isClosed = false;

  if (params.exitPrice !== undefined && params.exitPrice !== null && params.exitPrice !== '') {
    const dExit = new Decimal(params.exitPrice);
    sellTurnover = dExit.times(dQty).times(dMultiplier);
    isClosed = true;
  } else {
    // If open / single leg and not explicitly closing, estimate round-trip with entry price
    // unless isSingleLeg is explicitly true
    sellTurnover = params.isSingleLeg ? new Decimal(0) : buyTurnover;
    isClosed = !params.isSingleLeg;
  }

  const totalTurnover = buyTurnover.plus(sellTurnover);

  // Brokerage calculation
  let legFee = new Decimal(20); // Default ₹20 per executed leg
  if (params.brokerFlatFeePerLeg !== undefined) {
    legFee = new Decimal(params.brokerFlatFeePerLeg);
  } else if (params.broker) {
    const brokerUpper = params.broker.toUpperCase();
    if (brokerUpper === 'FINVASIA') {
      legFee = new Decimal(0);
    } else if (brokerUpper === 'ZERODHA' || brokerUpper === 'FYERS' || brokerUpper === 'ANGELONE' || brokerUpper === 'UPSTOX') {
      legFee = new Decimal(20);
    }
  }

  const legs = params.isSingleLeg ? 1 : 2;
  const brokerage = legFee.times(legs);

  let exchangeFeeRate = new Decimal('0.00002'); // default
  let sttRate = new Decimal(0);
  let stampDutyRate = new Decimal(0);

  // SEBI turnover fee: ₹10 per crore (0.0001% = 0.000001)
  const sebiTurnover = totalTurnover.times('0.000001');

  const assetClass = params.assetClass;
  const segment = params.marketSegment;

  if (assetClass === 'EQUITY' || segment === 'NSE_EQ' || segment === 'BSE_EQ') {
    // NSE Cash Intraday
    exchangeFeeRate = new Decimal('0.0000297'); // 0.00297%
    sttRate = new Decimal('0.00025');           // 0.025% on sell side
    stampDutyRate = new Decimal('0.00003');     // 0.003% on buy side
  } else if (assetClass === 'FUTURES' || (segment === 'NSE_FNO' && assetClass !== 'OPTIONS')) {
    // Index / Stock Futures
    exchangeFeeRate = new Decimal('0.0000173'); // 0.00173%
    sttRate = new Decimal('0.0002');            // 0.02% on sell side
    stampDutyRate = new Decimal('0.00002');     // 0.002% on buy side
  } else if (assetClass === 'OPTIONS') {
    // Options on premium turnover
    exchangeFeeRate = new Decimal('0.00035');   // 0.035% on premium
    sttRate = new Decimal('0.001');             // 0.1% on sell side premium
    stampDutyRate = new Decimal('0.00003');     // 0.003% on buy side
  } else if (assetClass === 'COMMODITY' || segment === 'MCX') {
    // MCX Non-agri futures
    exchangeFeeRate = new Decimal('0.000021');  // 0.0021%
    sttRate = new Decimal('0.0001');            // CTT 0.01% on sell side
    stampDutyRate = new Decimal('0.00002');     // 0.002% on buy side
  }

  const exchangeFees = totalTurnover.times(exchangeFeeRate);
  const sttCtt = sellTurnover.times(sttRate);
  const stampDuty = buyTurnover.times(stampDutyRate);

  // GST is 18% on (Brokerage + Exchange fees + SEBI fees)
  const gst = brokerage.plus(exchangeFees).plus(sebiTurnover).times('0.18');

  const regulatoryFees = sebiTurnover.plus(stampDuty);
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
    brokerageDecimal: new Decimal(finalBrokerage),
    exchangeFeesDecimal: new Decimal(finalExchangeFees),
    regulatoryFeesDecimal: new Decimal(finalRegulatoryFees),
    taxesDecimal: new Decimal(finalTaxes),
    totalCostsDecimal: new Decimal(finalTotalCosts),
  };
}

export class IndianChargesCalculator {
  /**
   * Static calculator compatible with original seed signature and enhanced with broker flat fees.
   */
  static calculate(
    assetClass: AssetClass,
    marketSegment: MarketSegment,
    entryPrice: number | string | Decimal,
    exitPrice: number | string | Decimal | null | undefined,
    quantity: number | string | Decimal,
    contractMultiplier: number | string | Decimal = 1,
    brokerFlatFeePerLeg: number | string | Decimal = 20,
    broker?: string
  ): ChargesBreakdown {
    return calculateIndianCharges({
      assetClass,
      marketSegment,
      entryPrice,
      exitPrice,
      quantity,
      contractMultiplier,
      brokerFlatFeePerLeg,
      broker,
    });
  }
}

/**
 * Calculates the exact stop price needed for a position to achieve True Breakeven (Net P&L = 0)
 * after accounting for all brokerage, exchange fees, SEBI charges, STT/CTT, and GST.
 */
export function calculateTrueBreakevenPrice(params: {
  direction: 'LONG' | 'SHORT' | string;
  entryPrice: number | string | Decimal;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  estimatedCharges: number | string | Decimal;
  tickSize?: number | string | Decimal;
}): {
  trueBreakevenPrice: number;
  nominalBreakevenPrice: number;
  feeBufferPoints: number;
} {
  const dEntry = new Decimal(params.entryPrice || 0);
  const dQty = new Decimal(params.quantity || 1);
  const dMult = params.contractMultiplier ? new Decimal(params.contractMultiplier) : new Decimal(1);
  const dFees = new Decimal(params.estimatedCharges || 0);
  const dTick = params.tickSize ? new Decimal(params.tickSize) : new Decimal('0.05');

  const totalEffectiveUnits = dQty.times(dMult);
  if (totalEffectiveUnits.isZero() || dEntry.isZero()) {
    return {
      trueBreakevenPrice: Number(dEntry.toFixed(2)),
      nominalBreakevenPrice: Number(dEntry.toFixed(2)),
      feeBufferPoints: 0,
    };
  }

  // Points required to offset the charges
  const feePoints = dFees.dividedBy(totalEffectiveUnits);

  // For LONG: price must be higher than entry to cover fees: entryPrice + feePoints
  // For SHORT: price must be lower than entry to cover fees: entryPrice - feePoints
  const isLong = params.direction === 'LONG';
  const rawTrueBe = isLong ? dEntry.plus(feePoints) : dEntry.minus(feePoints);

  // Round to tick size: For LONG round up to guarantee fees covered; for SHORT round down
  const tickDiv = rawTrueBe.dividedBy(dTick);
  const roundedTicks = isLong ? tickDiv.ceil() : tickDiv.floor();
  const trueBePrice = roundedTicks.times(dTick);

  return {
    trueBreakevenPrice: Number(trueBePrice.toFixed(2)),
    nominalBreakevenPrice: Number(dEntry.toFixed(2)),
    feeBufferPoints: Number(feePoints.toFixed(2)),
  };
}

export const calculateTrueBreakeven = calculateTrueBreakevenPrice;

