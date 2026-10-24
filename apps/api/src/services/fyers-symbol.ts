import moment from 'moment';

export interface IFyersSymbolInput {
  symbol?: string;
  underlying?: string;
  assetClass?: string;
  exchange?: string;
  marketSegment?: string;
  optionType?: 'CALL' | 'PUT' | string;
  strikePrice?: number;
  expiryDate?: Date | string | null;
}

/**
 * Maps a trade's specifications to the standard FYERS API v3 symbol format.
 *
 * Conventions:
 * 1. Cash Equities: NSE:SBIN-EQ, BSE:TCS-A
 * 2. Futures: NSE:NIFTY24OCTFUT, MCX:CRUDEOIL24NOVFUT
 * 3. Monthly Options: NSE:NIFTY24OCT24500CE
 * 4. Weekly Options: NSE:NIFTY24O0724500CE (YY + Month Code 1-9,O,N,D + 2-digit Day + Strike + CE/PE)
 */
export function formatFyersSymbol(input: IFyersSymbolInput): string {
  const rawSymbol = String(input.symbol || '').trim();

  // If rawSymbol is already a fully qualified FYERS symbol with prefix, validate and return
  if (rawSymbol.includes(':')) {
    const [ex, sym] = rawSymbol.split(':');
    const upperEx = ex.toUpperCase();
    if (upperEx === 'NSE' || upperEx === 'BSE' || upperEx === 'MCX') {
      return `${upperEx}:${sym.toUpperCase()}`;
    }
  }

  // Determine exchange
  let exchange = (input.exchange || 'NSE').toUpperCase();
  if (input.marketSegment === 'MCX' || exchange === 'MCX') {
    exchange = 'MCX';
  } else if (input.marketSegment === 'BSE_EQ' || exchange === 'BSE') {
    exchange = 'BSE';
  }

  // Normalize underlying ticker (strip broker artifacts)
  let underlying = (input.underlying || rawSymbol).toUpperCase().trim();
  underlying = underlying.replace(/-EQ$|-BE$/, '');
  if (underlying.includes(':')) {
    underlying = underlying.split(':')[1];
  }

  const assetClass = (input.assetClass || 'EQUITY').toUpperCase();

  // 1. Cash Equity
  if (assetClass === 'EQUITY' || input.marketSegment === 'NSE_EQ' || input.marketSegment === 'BSE_EQ') {
    if (exchange === 'BSE') {
      return `BSE:${underlying}`;
    }
    return `NSE:${underlying}-EQ`;
  }

  const expiry = input.expiryDate ? moment(input.expiryDate) : null;

  // 2. Futures
  if (assetClass === 'FUTURES' || (assetClass === 'COMMODITY' && (!input.optionType || input.optionType === 'NONE'))) {
    if (expiry && expiry.isValid()) {
      const yy = expiry.format('YY');
      const mmm = expiry.format('MMM').toUpperCase();
      return `${exchange}:${underlying}${yy}${mmm}FUT`;
    }
    // If rawSymbol already has FUT pattern, prefix it
    if (/FUT$/i.test(rawSymbol)) {
      return `${exchange}:${rawSymbol.toUpperCase()}`;
    }
    return `${exchange}:${underlying}FUT`;
  }

  // 3. Options
  if (assetClass === 'OPTIONS' || input.optionType === 'CALL' || input.optionType === 'PUT') {
    const optType =
      input.optionType === 'PUT' || input.optionType === 'PE' || /PE$/i.test(rawSymbol)
        ? 'PE'
        : 'CE';

    let strike = '';
    if (input.strikePrice !== undefined && input.strikePrice !== null) {
      strike = String(Math.round(input.strikePrice));
    } else {
      const strikeMatch = rawSymbol.match(/(\d+(?:\.\d+)?)(?:CE|PE)$/i);
      if (strikeMatch) strike = strikeMatch[1];
    }

    if (expiry && expiry.isValid()) {
      const yy = expiry.format('YY');

      // Check if this expiry is the monthly expiry (last Thursday / last week of month)
      const isLastWeekOfMonth = expiry.clone().add(7, 'days').month() !== expiry.month();

      if (isLastWeekOfMonth) {
        // Monthly Option: {EX}:{UNDERLYING}{YY}{MMM}{STRIKE}{OPT}
        const mmm = expiry.format('MMM').toUpperCase();
        return `${exchange}:${underlying}${yy}${mmm}${strike}${optType}`;
      } else {
        // Weekly Option: {EX}:{UNDERLYING}{YY}{M}{DD}{STRIKE}{OPT}
        const monthNum = expiry.month() + 1; // 1-12
        let monthChar = String(monthNum);
        if (monthNum === 10) monthChar = 'O';
        else if (monthNum === 11) monthChar = 'N';
        else if (monthNum === 12) monthChar = 'D';

        const dd = expiry.format('DD');
        return `${exchange}:${underlying}${yy}${monthChar}${dd}${strike}${optType}`;
      }
    }

    // Fallback if rawSymbol has full pattern
    if (/CE$|PE$/i.test(rawSymbol)) {
      return `${exchange}:${rawSymbol.toUpperCase()}`;
    }

    return `${exchange}:${underlying}${strike}${optType}`;
  }

  return `${exchange}:${underlying}`;
}
