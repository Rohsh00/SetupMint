import moment from 'moment';
import { IAngelOneInstrumentDoc } from '../../../db/models/AngelOneInstrument.js';

export interface AngelOneSymbolResult {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
}

export interface TradeForMapping {
  symbol: string;
  underlying?: string;
  assetClass: string;
  exchange: string;
  marketSegment: string;
  optionType?: 'CE' | 'PE';
  strikePrice?: number;
  expiryDate?: Date | string;
}

/**
 * Pure function to map a trade to an authoritative Angel One symbol and token.
 * Never guesses or fabricates tokens; returns null if no authoritative match exists.
 */
export function mapTradeToAngelOneSymbol(
  trade: TradeForMapping,
  candidates: IAngelOneInstrumentDoc[]
): AngelOneSymbolResult | null {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const rawUnderlying = (trade.underlying || trade.symbol || '').trim().toUpperCase();
  const assetClass = (trade.assetClass || '').toUpperCase();
  const segment = (trade.marketSegment || '').toUpperCase();

  // 1. Index Spot / Equity Cash matching
  if (assetClass === 'EQUITY' || assetClass === 'INDEX' || segment === 'NSE_EQ' || segment === 'BSE_EQ') {
    const exchange = trade.exchange?.toUpperCase() === 'BSE' ? 'BSE' : 'NSE';

    // Index tokens in Angel One
    if (assetClass === 'INDEX' || rawUnderlying === 'NIFTY' || rawUnderlying === 'BANKNIFTY') {
      const indexCandidate = candidates.find(
        (c) =>
          c.exchange === exchange &&
          (c.name === rawUnderlying || c.tradingsymbol === rawUnderlying) &&
          (c.instrumenttype === 'INDEX' || c.instrumenttype === '' || c.instrumenttype === 'AMXIDX')
      );
      if (indexCandidate) {
        return {
          exchange: indexCandidate.exchange,
          tradingsymbol: indexCandidate.tradingsymbol,
          symboltoken: indexCandidate.symboltoken,
        };
      }
    }

    // Equity Cash matching: tradingsymbol usually ends with '-EQ' on NSE
    const equityMatch = candidates.find((c) => {
      if (c.exchange !== exchange) return false;
      const isEqName = c.name === rawUnderlying;
      const isEqSymbol =
        c.tradingsymbol === `${rawUnderlying}-EQ` ||
        c.tradingsymbol === rawUnderlying ||
        c.tradingsymbol === `${rawUnderlying}-BE`;
      return isEqName && isEqSymbol;
    });

    if (equityMatch) {
      return {
        exchange: equityMatch.exchange,
        tradingsymbol: equityMatch.tradingsymbol,
        symboltoken: equityMatch.symboltoken,
      };
    }
  }

  // 2. Derivatives matching (Options and Futures)
  if (assetClass === 'OPTIONS' || assetClass === 'FUTURES' || segment === 'NSE_FNO' || segment === 'MCX') {
    const isMCX = segment === 'MCX' || trade.exchange?.toUpperCase() === 'MCX';
    const targetExchange = isMCX ? 'MCX' : trade.exchange?.toUpperCase() === 'BSE' ? 'BFO' : 'NFO';

    let formattedExpiry = '';
    if (trade.expiryDate) {
      // Angel One Scrip Master uses 'DD-MMM-YYYY' (e.g. '28-OCT-2026')
      formattedExpiry = moment(trade.expiryDate).format('DD-MMM-YYYY').toUpperCase();
    }

    if (assetClass === 'OPTIONS') {
      const targetOptionType = trade.optionType?.toUpperCase();
      const targetStrike = trade.strikePrice ? Number(trade.strikePrice) : undefined;

      const optionMatch = candidates.find((c) => {
        if (c.exchange !== targetExchange) return false;
        if (c.name !== rawUnderlying) return false;

        // Verify option type from tradingsymbol suffix
        if (targetOptionType && !c.tradingsymbol.endsWith(targetOptionType)) {
          return false;
        }

        // Verify strike price
        if (targetStrike !== undefined && c.strike !== undefined && c.strike > 0) {
          // Angel One strike might be scaled (e.g. 19500 vs 1950000 or exact)
          const strikeDiff = Math.abs(c.strike - targetStrike);
          const strikeScaledDiff = Math.abs(c.strike / 100 - targetStrike);
          if (strikeDiff > 0.05 && strikeScaledDiff > 0.05) {
            return false;
          }
        }

        // Verify expiry if specified
        if (formattedExpiry && c.expiry) {
          const candExpiry = c.expiry.trim().toUpperCase();
          if (candExpiry !== formattedExpiry) {
            // Also check 'DDMMMYYYY' or 'DDMMMYY' formats
            const candM = moment(candExpiry, ['DD-MMM-YYYY', 'DDMMMYYYY', 'DD-MMM-YY']);
            const targetM = moment(formattedExpiry, ['DD-MMM-YYYY']);
            if (!candM.isValid() || !targetM.isValid() || !candM.isSame(targetM, 'day')) {
              return false;
            }
          }
        }

        return true;
      });

      if (optionMatch) {
        return {
          exchange: optionMatch.exchange,
          tradingsymbol: optionMatch.tradingsymbol,
          symboltoken: optionMatch.symboltoken,
        };
      }
    }

    if (assetClass === 'FUTURES') {
      const futureMatch = candidates.find((c) => {
        if (c.exchange !== targetExchange) return false;
        if (c.name !== rawUnderlying) return false;
        if (!c.instrumenttype?.includes('FUT')) return false;

        if (formattedExpiry && c.expiry) {
          const candM = moment(c.expiry.trim().toUpperCase(), ['DD-MMM-YYYY', 'DDMMMYYYY', 'DD-MMM-YY']);
          const targetM = moment(formattedExpiry, ['DD-MMM-YYYY']);
          if (!candM.isValid() || !targetM.isValid() || !candM.isSame(targetM, 'day')) {
            return false;
          }
        }

        return true;
      });

      if (futureMatch) {
        return {
          exchange: futureMatch.exchange,
          tradingsymbol: futureMatch.tradingsymbol,
          symboltoken: futureMatch.symboltoken,
        };
      }
    }
  }

  // 3. Fallback: match by tradingsymbol exact string
  const cleanSym = trade.symbol.trim().toUpperCase();
  const directMatch = candidates.find((c) => c.tradingsymbol === cleanSym);
  if (directMatch) {
    return {
      exchange: directMatch.exchange,
      tradingsymbol: directMatch.tradingsymbol,
      symboltoken: directMatch.symboltoken,
    };
  }

  return null;
}
