import Decimal from 'decimal.js';
import { FeeModelKey, AssetClass, MarketSegment, Direction } from '@tradevault/shared';
import { calculateIndianCharges, ChargesBreakdown } from '../charges.js';

export interface FeeCalculationParams {
  direction?: Direction | 'LONG' | 'SHORT' | string;
  assetClass: AssetClass;
  marketSegment?: MarketSegment;
  entryPrice: number | string | Decimal;
  exitPrice?: number | string | Decimal | null;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  brokerFlatFeePerLeg?: number | string | Decimal;
  broker?: string;
  currency?: string;
  isSingleLeg?: boolean;
  spreadPips?: number | string | Decimal;
  swapAmount?: number | string | Decimal;
  commissionPerLot?: number | string | Decimal;
  lots?: number | string | Decimal;
}

export interface IFeeModel {
  key: FeeModelKey;
  name: string;
  description: string;
  calculateCharges(params: FeeCalculationParams): ChargesBreakdown;
}

export class IndiaStatutoryFeeModel implements IFeeModel {
  readonly key: FeeModelKey = 'INDIA_STATUTORY';
  readonly name = 'India Statutory & Regulatory Fees';
  readonly description =
    'Standard Indian brokerage (₹20/leg cap), STT/CTT, Exchange Turnover, SEBI charges, Stamp Duty, and 18% GST.';

  calculateCharges(params: FeeCalculationParams): ChargesBreakdown {
    return calculateIndianCharges(params);
  }
}

export class ForexCommissionFeeModel implements IFeeModel {
  readonly key: FeeModelKey = 'FOREX_COMMISSION';
  readonly name = 'Forex / CFD Commission & Spread Model';
  readonly description =
    'Standard per-lot round-turn commission (default $7/lot, $3.50/leg), plus explicit spread costs and overnight swap financing.';

  calculateCharges(params: FeeCalculationParams): ChargesBreakdown {
    const qty = new Decimal(params.quantity || 0);
    const legs = params.isSingleLeg ? 1 : 2;

    // Default $3.50 per leg per 1.0 standard lot ($7.00 round turn per lot)
    const commPerLegPerLot = params.commissionPerLot !== undefined
      ? new Decimal(params.commissionPerLot).dividedBy(2)
      : params.brokerFlatFeePerLeg !== undefined
      ? new Decimal(params.brokerFlatFeePerLeg)
      : new Decimal(3.5);

    const brokerageDec = commPerLegPerLot.times(qty).times(legs);
    const swapDec = params.swapAmount ? new Decimal(params.swapAmount).abs() : new Decimal(0);

    // Spread cost calculation if provided (spreadPips * pipValue * qty)
    let exchangeFeesDec = new Decimal(0);
    if (params.spreadPips) {
      const pips = new Decimal(params.spreadPips);
      // approximate standard pip value: $10 per lot for 0.0001
      const pipValue = new Decimal(10);
      exchangeFeesDec = pips.times(pipValue).times(qty);
    }

    const totalCostsDec = brokerageDec.plus(swapDec).plus(exchangeFeesDec);
    const zero = new Decimal(0);

    return {
      brokerage: Number(brokerageDec.toFixed(2)),
      exchangeFees: Number(exchangeFeesDec.toFixed(2)),
      regulatoryFees: 0,
      taxes: Number(swapDec.toFixed(2)), // swap mapped to other/carrying charges
      totalCosts: Number(totalCostsDec.toFixed(2)),
      sebiTurnover: 0,
      stampDuty: 0,
      sttCtt: 0,
      gst: 0,
      brokerageDecimal: brokerageDec,
      exchangeFeesDecimal: exchangeFeesDec,
      regulatoryFeesDecimal: zero,
      taxesDecimal: swapDec,
      totalCostsDecimal: totalCostsDec,
    };
  }
}

export class ZeroFeeModel implements IFeeModel {
  readonly key: FeeModelKey = 'NONE';
  readonly name = 'Zero / Included Fees';
  readonly description = 'Zero transaction fees, commission-free simulation or challenge.';

  calculateCharges(): ChargesBreakdown {
    const zero = new Decimal(0);
    return {
      brokerage: 0,
      exchangeFees: 0,
      regulatoryFees: 0,
      taxes: 0,
      totalCosts: 0,
      sebiTurnover: 0,
      stampDuty: 0,
      sttCtt: 0,
      gst: 0,
      brokerageDecimal: zero,
      exchangeFeesDecimal: zero,
      regulatoryFeesDecimal: zero,
      taxesDecimal: zero,
      totalCostsDecimal: zero,
    };
  }
}

export class CustomFeeModel implements IFeeModel {
  readonly key: FeeModelKey = 'CUSTOM';
  readonly name = 'Custom Fee Model';
  readonly description = 'User-defined flat fee or custom commission schedule.';

  calculateCharges(params: FeeCalculationParams): ChargesBreakdown {
    const flatPerLeg = params.brokerFlatFeePerLeg !== undefined
      ? new Decimal(params.brokerFlatFeePerLeg)
      : new Decimal(0);
    const legs = params.isSingleLeg ? 1 : 2;
    const brokerageDec = flatPerLeg.times(legs);
    const zero = new Decimal(0);

    return {
      brokerage: Number(brokerageDec.toFixed(2)),
      exchangeFees: 0,
      regulatoryFees: 0,
      taxes: 0,
      totalCosts: Number(brokerageDec.toFixed(2)),
      sebiTurnover: 0,
      stampDuty: 0,
      sttCtt: 0,
      gst: 0,
      brokerageDecimal: brokerageDec,
      exchangeFeesDecimal: zero,
      regulatoryFeesDecimal: zero,
      taxesDecimal: zero,
      totalCostsDecimal: brokerageDec,
    };
  }
}

const feeModels: Record<FeeModelKey, IFeeModel> = {
  INDIA_STATUTORY: new IndiaStatutoryFeeModel(),
  FOREX_COMMISSION: new ForexCommissionFeeModel(),
  NONE: new ZeroFeeModel(),
  CUSTOM: new CustomFeeModel(),
};

export class FeeModelRegistry {
  static get(key: FeeModelKey | string): IFeeModel {
    const normalized = (key || 'NONE').toUpperCase().trim() as FeeModelKey;
    return feeModels[normalized] || feeModels.NONE;
  }

  static calculate(key: FeeModelKey | string, params: FeeCalculationParams): ChargesBreakdown {
    const model = this.get(key);
    return model.calculateCharges(params);
  }

  static calculateFees(key: FeeModelKey | string, params: FeeCalculationParams): ChargesBreakdown {
    return this.calculate(key, params);
  }

  static list(): IFeeModel[] {
    return Object.values(feeModels);
  }
}
