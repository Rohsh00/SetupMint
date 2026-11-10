import { ITradingAccountProfile } from '@tradevault/shared';

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

const GLOBAL_SPECS: Record<string, Partial<InstrumentSpec>> = {
  XAUUSD: {
    symbol: 'XAUUSD',
    displayName: 'Gold / US Dollar',
    assetClass: 'COMMODITY',
    exchange: 'GLOBAL',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 100,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    minLot: 0.01,
    maxLot: 100,
  },
  GOLD: {
    symbol: 'GOLD',
    displayName: 'MCX Gold Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 100,
    lotSize: 100,
    tickSize: 1,
    quantityIncrement: 100,
    pricePrecision: 2,
    minLot: 100,
    maxLot: 10000,
  },
  GOLDM: {
    symbol: 'GOLDM',
    displayName: 'MCX Gold Mini Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 10,
    lotSize: 10,
    tickSize: 1,
    quantityIncrement: 10,
    pricePrecision: 2,
    minLot: 10,
    maxLot: 5000,
  },
  EURUSD: {
    symbol: 'EURUSD',
    displayName: 'Euro / US Dollar',
    assetClass: 'FOREX',
    exchange: 'GLOBAL',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 100000,
    lotSize: 1,
    tickSize: 0.00001,
    quantityIncrement: 0.01,
    pricePrecision: 5,
    minLot: 0.01,
    maxLot: 100,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    displayName: 'British Pound / US Dollar',
    assetClass: 'FOREX',
    exchange: 'GLOBAL',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 100000,
    lotSize: 1,
    tickSize: 0.00001,
    quantityIncrement: 0.01,
    pricePrecision: 5,
    minLot: 0.01,
    maxLot: 100,
  },
  US30: {
    symbol: 'US30',
    displayName: 'Dow Jones Industrial Average CFD',
    assetClass: 'INDEX',
    exchange: 'GLOBAL',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 1,
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
    lotSize: 1,
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
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    minLot: 0.01,
    maxLot: 100,
  },
  CRUDEOIL: {
    symbol: 'CRUDEOIL',
    displayName: 'MCX Crude Oil Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 100,
    lotSize: 100,
    tickSize: 1,
    quantityIncrement: 100,
    pricePrecision: 2,
    minLot: 100,
    maxLot: 5000,
  },
  NIFTY: {
    symbol: 'NIFTY',
    displayName: 'NIFTY 50 Index / F&O',
    assetClass: 'INDEX',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 25,
    tickSize: 0.05,
    quantityIncrement: 25,
    pricePrecision: 2,
    minLot: 25,
    maxLot: 1800,
  },
  BANKNIFTY: {
    symbol: 'BANKNIFTY',
    displayName: 'NIFTY BANK Index / F&O',
    assetClass: 'INDEX',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 15,
    tickSize: 0.05,
    quantityIncrement: 15,
    pricePrecision: 2,
    minLot: 15,
    maxLot: 900,
  },
};

export class InstrumentSpecRegistry {
  static resolve(symbol: string, profile?: Partial<ITradingAccountProfile> | null): InstrumentSpec {
    const rawSymbol = (symbol || '').toUpperCase().trim();
    const cleanSymbol = rawSymbol.replace(/^NSE:|^MCX:|^GLOBAL:|\.FUT$|\.OPT$|\d{2}[A-Z]{3}FUT$/g, '');

    const baseSpec = GLOBAL_SPECS[cleanSymbol] || GLOBAL_SPECS[rawSymbol];

    // Determine regional defaults from profile if spec not matched
    const isIndian =
      profile?.marketRegion === 'IN' ||
      profile?.baseCurrency === 'INR' ||
      profile?.executionAdapterKey === 'FYERS';

    const defaultCurrency = profile?.baseCurrency || (isIndian ? 'INR' : 'USD');

    if (baseSpec) {
      return {
        symbol: rawSymbol,
        displayName: baseSpec.displayName || rawSymbol,
        assetClass: baseSpec.assetClass || 'EQUITY',
        exchange: baseSpec.exchange || (isIndian ? 'NSE' : 'GLOBAL'),
        marketSegment: baseSpec.marketSegment || (isIndian ? 'NSE_EQ' : 'FOREX'),
        quoteCurrency: baseSpec.quoteCurrency || defaultCurrency,
        contractMultiplier: baseSpec.contractMultiplier ?? 1,
        lotSize: baseSpec.lotSize ?? 1,
        tickSize: baseSpec.tickSize ?? (isIndian ? 0.05 : 0.01),
        quantityIncrement: baseSpec.quantityIncrement ?? 1,
        pricePrecision: baseSpec.pricePrecision ?? 2,
        minLot: baseSpec.minLot ?? (isIndian ? 1 : 0.01),
        maxLot: baseSpec.maxLot ?? 1000,
      };
    }

    return {
      symbol: rawSymbol,
      displayName: rawSymbol,
      assetClass: isIndian ? 'EQUITY' : 'FOREX',
      exchange: isIndian ? 'NSE' : 'GLOBAL',
      marketSegment: isIndian ? 'NSE_EQ' : 'FOREX',
      quoteCurrency: defaultCurrency,
      contractMultiplier: 1,
      lotSize: 1,
      tickSize: isIndian ? 0.05 : 0.01,
      quantityIncrement: isIndian ? 1 : 0.01,
      pricePrecision: 2,
      minLot: isIndian ? 1 : 0.01,
      maxLot: 1000,
    };
  }
}

