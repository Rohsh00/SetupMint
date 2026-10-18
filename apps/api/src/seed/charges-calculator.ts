import { AssetClass, MarketSegment } from '@tradevault/shared';

export interface ChargesBreakdown {
  brokerage: number;
  exchangeFees: number;
  regulatoryFees: number; // SEBI charges + Stamp duty
  taxes: number; // STT/CTT + GST
  totalCosts: number;
}

export class IndianChargesCalculator {
  /**
   * Calculates realistic Indian regulatory charges, brokerage, STT/CTT, and GST.
   */
  static calculate(
    assetClass: AssetClass,
    marketSegment: MarketSegment,
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    contractMultiplier: number = 1
  ): ChargesBreakdown {
    const buyTurnover = entryPrice * quantity * contractMultiplier;
    const sellTurnover = exitPrice * quantity * contractMultiplier;
    const totalTurnover = buyTurnover + sellTurnover;

    // 1. FYERS Brokerage: flat ₹20 per executed leg (₹40 round-trip)
    const brokerage = 40.0;

    let exchangeFees = 0;
    let stt = 0;
    let stampDuty = 0;
    let sebiTurnover = totalTurnover * 0.000001; // ₹10 per crore

    if (assetClass === 'EQUITY') {
      // NSE Cash Intraday
      exchangeFees = totalTurnover * 0.0000297;
      stt = sellTurnover * 0.00025; // 0.025% on sell side
      stampDuty = buyTurnover * 0.00003; // 0.003% on buy side
    } else if (assetClass === 'FUTURES') {
      // Index / Stock Futures
      exchangeFees = totalTurnover * 0.0000173;
      stt = sellTurnover * 0.0002; // 0.02% on sell side
      stampDuty = buyTurnover * 0.00002; // 0.002% on buy side
    } else if (assetClass === 'OPTIONS') {
      // Options on premium turnover
      exchangeFees = totalTurnover * 0.00035;
      stt = sellTurnover * 0.001; // 0.1% on sell side premium
      stampDuty = buyTurnover * 0.00003; // 0.003% on buy side
    } else if (assetClass === 'COMMODITY') {
      // MCX Non-agri futures
      exchangeFees = totalTurnover * 0.000021;
      stt = sellTurnover * 0.0001; // CTT 0.01% on sell side
      stampDuty = buyTurnover * 0.00002; // 0.002% on buy side
    } else {
      exchangeFees = totalTurnover * 0.00002;
    }

    // GST is 18% on (Brokerage + Exchange fees + SEBI fees)
    const gst = (brokerage + exchangeFees + sebiTurnover) * 0.18;

    const round2 = (val: number) => Number(val.toFixed(2));

    const finalBrokerage = round2(brokerage);
    const finalExchangeFees = round2(exchangeFees);
    const finalRegulatoryFees = round2(sebiTurnover + stampDuty);
    const finalTaxes = round2(stt + gst);
    const totalCosts = round2(finalBrokerage + finalExchangeFees + finalRegulatoryFees + finalTaxes);

    return {
      brokerage: finalBrokerage,
      exchangeFees: finalExchangeFees,
      regulatoryFees: finalRegulatoryFees,
      taxes: finalTaxes,
      totalCosts,
    };
  }
}
