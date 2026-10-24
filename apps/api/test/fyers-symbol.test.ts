import { describe, it, expect } from 'vitest';
import { formatFyersSymbol } from '../src/services/fyers-symbol.js';

describe('formatFyersSymbol', () => {
  it('formats standard NSE cash equities with -EQ suffix', () => {
    expect(
      formatFyersSymbol({
        underlying: 'SBIN',
        assetClass: 'EQUITY',
        marketSegment: 'NSE_EQ',
      })
    ).toBe('NSE:SBIN-EQ');

    expect(
      formatFyersSymbol({
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
      })
    ).toBe('NSE:RELIANCE-EQ');
  });

  it('preserves already fully-qualified FYERS symbols', () => {
    expect(
      formatFyersSymbol({
        symbol: 'NSE:TCS-EQ',
      })
    ).toBe('NSE:TCS-EQ');

    expect(
      formatFyersSymbol({
        symbol: 'MCX:CRUDEOIL24NOVFUT',
      })
    ).toBe('MCX:CRUDEOIL24NOVFUT');
  });

  it('formats BSE cash equities', () => {
    expect(
      formatFyersSymbol({
        underlying: 'INFY',
        exchange: 'BSE',
        marketSegment: 'BSE_EQ',
        assetClass: 'EQUITY',
      })
    ).toBe('BSE:INFY');
  });

  it('formats index and equity futures', () => {
    expect(
      formatFyersSymbol({
        underlying: 'NIFTY',
        assetClass: 'FUTURES',
        marketSegment: 'NSE_FNO',
        expiryDate: '2024-10-31', // Oct 2024
      })
    ).toBe('NSE:NIFTY24OCTFUT');

    expect(
      formatFyersSymbol({
        underlying: 'BANKNIFTY',
        assetClass: 'FUTURES',
        expiryDate: '2025-01-30',
      })
    ).toBe('NSE:BANKNIFTY25JANFUT');
  });

  it('formats MCX commodity futures', () => {
    expect(
      formatFyersSymbol({
        underlying: 'CRUDEOIL',
        assetClass: 'COMMODITY',
        exchange: 'MCX',
        marketSegment: 'MCX',
        expiryDate: '2024-11-19',
      })
    ).toBe('MCX:CRUDEOIL24NOVFUT');
  });

  it('formats monthly options contracts', () => {
    // 2024-10-31 is the last Thursday of October 2024 -> Monthly option
    expect(
      formatFyersSymbol({
        underlying: 'NIFTY',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        optionType: 'CALL',
        strikePrice: 24500,
        expiryDate: '2024-10-31',
      })
    ).toBe('NSE:NIFTY24OCT24500CE');

    expect(
      formatFyersSymbol({
        underlying: 'NIFTY',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        optionType: 'PUT',
        strikePrice: 24000,
        expiryDate: '2024-10-31',
      })
    ).toBe('NSE:NIFTY24OCT24000PE');
  });

  it('formats weekly options contracts with FYERS character codes', () => {
    // 2025-01-07 is the first week of Jan 2025 -> 25 + '1' + '07' + 24500 + 'CE'
    expect(
      formatFyersSymbol({
        underlying: 'NIFTY',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        optionType: 'CALL',
        strikePrice: 24500,
        expiryDate: '2025-01-07',
      })
    ).toBe('NSE:NIFTY2510724500CE');

    // 2024-10-08 is weekly October option -> month code 'O'
    expect(
      formatFyersSymbol({
        underlying: 'NIFTY',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        optionType: 'CALL',
        strikePrice: 24500,
        expiryDate: '2024-10-08',
      })
    ).toBe('NSE:NIFTY24O0824500CE');

    // 2024-11-14 is weekly November option -> month code 'N'
    expect(
      formatFyersSymbol({
        underlying: 'BANKNIFTY',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        optionType: 'PUT',
        strikePrice: 51200,
        expiryDate: '2024-11-14',
      })
    ).toBe('NSE:BANKNIFTY24N1451200PE');

    // 2024-12-05 is weekly December option -> month code 'D'
    expect(
      formatFyersSymbol({
        underlying: 'NIFTY',
        assetClass: 'OPTIONS',
        marketSegment: 'NSE_FNO',
        optionType: 'CALL',
        strikePrice: 24800,
        expiryDate: '2024-12-05',
      })
    ).toBe('NSE:NIFTY24D0524800CE');
  });
});
