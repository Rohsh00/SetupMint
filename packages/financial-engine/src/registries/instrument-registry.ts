import {
  ITradingAccountProfile,
  getEffectiveLotSize,
  getNseTickSize,
  getPresetSpec,
} from '@tradevault/shared';
import { normalizeUnderlying } from '../chart-helpers.js';

export interface InstrumentSpec {
  symbol: string;
  displayName: string;
  assetClass: 'EQUITY' | 'FUTURES' | 'OPTIONS' | 'COMMODITY' | 'FOREX' | 'CRYPTO' | 'INDEX';
  exchange: string;
  marketSegment: string;
  quoteCurrency: string;
  contractMultiplier: number;
  lotSize: number;
  tickSize: number;
  quantityIncrement: number;
  pricePrecision: number;
  minLot: number;
  maxLot: number;
}

/**
 * Fallback CFD/spot specs not covered directly in PRESET_INSTRUMENTS.
 * All MCX contracts use contractMultiplier for quote-unit conversion (e.g. 100 per 10g = 1kg)
 * and lotSize = 1 so multipliers are never double-counted.
 */
const CFD_FALLBACK_SPECS: Record<string, Partial<InstrumentSpec>> = {
  US30: {
    symbol: 'US30',
    displayName: 'Dow Jones Industrial Average CFD',
    assetClass: 'INDEX',
    exchange: 'GLOBAL',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 0.01,
    tickSize: 1,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    minLot: 0.01,
    maxLot: 100,
  },
  NAS100: {
    symbol: 'NAS100',
    displayName: 'NASDAQ 100 Index CFD',
    assetClass: 'INDEX',
    exchange: 'GLOBAL',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 0.01,
    tickSize: 0.1,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    minLot: 0.01,
    maxLot: 100,
  },
  USOIL: {
    symbol: 'USOIL',
    displayName: 'WTI Crude Oil CFD',
    assetClass: 'COMMODITY',
    exchange: 'GLOBAL',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 1000,
    lotSize: 0.01,
    tickSize: 0.01,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    minLot: 0.01,
    maxLot: 100,
  },
};

export class InstrumentSpecRegistry {
  static resolve(
    symbol: string,
    profile?: Partial<ITradingAccountProfile> | null,
    asOfDate?: Date | string
  ): InstrumentSpec {
    const rawSymbol = (symbol || '').toUpperCase().trim();
    const baseSymbol = normalizeUnderlying(rawSymbol);
    const isOptionContract = /(CE|PE)$/i.test(rawSymbol) && /\d+(?:\.\d+)?\s*(?:CE|PE)$/i.test(rawSymbol);

    // 1. Authoritative shared preset lookup (supports date-effective NSE/BSE index lot sizes)
    const preset = getPresetSpec(baseSymbol, asOfDate) || getPresetSpec(rawSymbol, asOfDate);

    // Determine regional defaults from profile if spec not matched
    const isIndian =
      profile?.marketRegion === 'IN' ||
      profile?.baseCurrency === 'INR' ||
      profile?.executionAdapterKey === 'FYERS';

    const defaultCurrency = profile?.baseCurrency || (isIndian ? 'INR' : 'USD');

    if (preset) {
      const effectiveLotSize =
        getEffectiveLotSize(preset.symbol, asOfDate) ?? preset.lotSize ?? 1;
      const effectiveIncrement =
        preset.marketSegment === 'FOREX' || preset.marketSegment === 'CRYPTO'
          ? preset.quantityIncrement ?? effectiveLotSize
          : effectiveLotSize > 1
          ? effectiveLotSize
          : preset.quantityIncrement ?? 1;

      const resolvedAssetClass = isOptionContract ? 'OPTIONS' : preset.assetClass;
      const tickSize =
        isOptionContract && (preset.marketSegment === 'NSE_FNO' || preset.marketSegment === 'BSE_FNO')
          ? getNseTickSize(0, 'OPTIONS', preset.marketSegment, true)
          : preset.tickSize;

      return {
        symbol: rawSymbol,
        displayName: preset.displayName || rawSymbol,
        assetClass: resolvedAssetClass,
        exchange: preset.exchange,
        marketSegment: preset.marketSegment,
        quoteCurrency: preset.quoteCurrency || defaultCurrency,
        contractMultiplier: preset.contractMultiplier ?? 1,
        lotSize: effectiveLotSize,
        tickSize,
        quantityIncrement: effectiveIncrement,
        pricePrecision: preset.pricePrecision ?? 2,
        minLot: effectiveIncrement,
        maxLot:
          preset.marketSegment === 'FOREX' || preset.marketSegment === 'CRYPTO'
            ? 100
            : Math.max(1000, effectiveLotSize * 50),
      };
    }

    const baseSpec = CFD_FALLBACK_SPECS[baseSymbol] || CFD_FALLBACK_SPECS[rawSymbol];
    if (baseSpec) {
      return {
        symbol: rawSymbol,
        displayName: baseSpec.displayName || rawSymbol,
        assetClass: baseSpec.assetClass || 'EQUITY',
        exchange: baseSpec.exchange || (isIndian ? 'NSE' : 'GLOBAL'),
        marketSegment: baseSpec.marketSegment || (isIndian ? 'NSE_EQ' : 'FOREX'),
        quoteCurrency: baseSpec.quoteCurrency || defaultCurrency,
        contractMultiplier: baseSpec.contractMultiplier ?? 1,
        lotSize: baseSpec.lotSize ?? 0.01,
        tickSize: baseSpec.tickSize ?? (isIndian ? 0.05 : 0.01),
        quantityIncrement: baseSpec.quantityIncrement ?? 0.01,
        pricePrecision: baseSpec.pricePrecision ?? 2,
        minLot: baseSpec.minLot ?? (isIndian ? 1 : 0.01),
        maxLot: baseSpec.maxLot ?? 1000,
      };
    }

    return {
      symbol: rawSymbol,
      displayName: rawSymbol,
      assetClass: isIndian ? (isOptionContract ? 'OPTIONS' : 'EQUITY') : 'FOREX',
      exchange: isIndian ? 'NSE' : 'GLOBAL',
      marketSegment: isIndian ? (isOptionContract ? 'NSE_FNO' : 'NSE_EQ') : 'FOREX',
      quoteCurrency: defaultCurrency,
      contractMultiplier: 1,
      lotSize: isIndian ? 1 : 0.01,
      tickSize: isIndian ? 0.05 : 0.01,
      quantityIncrement: isIndian ? 1 : 0.01,
      pricePrecision: 2,
      minLot: isIndian ? 1 : 0.01,
      maxLot: 1000,
    };
  }
}
