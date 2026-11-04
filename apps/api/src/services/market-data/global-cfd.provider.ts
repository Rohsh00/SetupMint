import mongoose from 'mongoose';
import { ITradeCandle } from '@tradevault/shared';
import { CandleFetchParams, CandleProviderResult, ICandleProvider } from './types.js';

export interface GlobalLiveQuote {
  symbol: string;
  tvTicker: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  changeAbs: number;
  timestamp: Date;
}

const TV_TICKER_MAP: Record<string, string[]> = {
  XAUUSD: ['BLACKBULL:XAUUSD', 'OANDA:XAUUSD', 'FOREXCOM:XAUUSD'],
  GOLD: ['BLACKBULL:XAUUSD', 'OANDA:XAUUSD'],
  XAGUSD: ['OANDA:XAGUSD', 'FOREXCOM:XAGUSD'],
  SILVER: ['OANDA:XAGUSD'],
  ETHUSD: ['COINBASE:ETHUSD', 'BINANCE:ETHUSD', 'BINANCE:ETHUSDT'],
  ETHUSDT: ['BINANCE:ETHUSDT', 'COINBASE:ETHUSD'],
  BTCUSD: ['COINBASE:BTCUSD', 'BINANCE:BTCUSD', 'BINANCE:BTCUSDT'],
  BTCUSDT: ['BINANCE:BTCUSDT', 'COINBASE:BTCUSD'],
  SOLUSD: ['COINBASE:SOLUSD', 'BINANCE:SOLUSDT'],
  EURUSD: ['OANDA:EURUSD', 'FX:EURUSD'],
  GBPUSD: ['OANDA:GBPUSD', 'FX:GBPUSD'],
  USDJPY: ['OANDA:USDJPY', 'FX:USDJPY'],
  AUDUSD: ['OANDA:AUDUSD', 'FX:AUDUSD'],
  USDCAD: ['OANDA:USDCAD', 'FX:USDCAD'],
  USDCHF: ['OANDA:USDCHF', 'FX:USDCHF'],
  NZDUSD: ['OANDA:NZDUSD', 'FX:NZDUSD'],
  GBPJPY: ['OANDA:GBPJPY', 'FX:GBPJPY'],
  EURJPY: ['OANDA:EURJPY', 'FX:EURJPY'],
  NAS100: ['OANDA:NAS100USD', 'FOREXCOM:NSXUSD'],
  USTEC: ['OANDA:NAS100USD', 'FOREXCOM:NSXUSD'],
  NDX: ['OANDA:NAS100USD'],
  US30: ['OANDA:US30USD', 'FOREXCOM:DJI'],
  DJ30: ['OANDA:US30USD'],
  SPX500: ['OANDA:SPX500USD', 'FOREXCOM:SPXUSD'],
  US500: ['OANDA:SPX500USD'],
  GER40: ['OANDA:DE30EUR'],
  DAX: ['OANDA:DE30EUR'],
  USOIL: ['TVC:USOIL', 'OANDA:WTICOUSD'],
  WTI: ['TVC:USOIL'],
  UKOIL: ['TVC:UKOIL', 'OANDA:BCOUSD'],
  NIFTY: ['NSE:NIFTY'],
  NIFTY50: ['NSE:NIFTY'],
  BANKNIFTY: ['NSE:BANKNIFTY'],
  FINNIFTY: ['NSE:FINNIFTY'],
  MIDCPNIFTY: ['NSE:MIDCPNIFTY'],
  SENSEX: ['BSE:SENSEX'],
  RELIANCE: ['NSE:RELIANCE'],
  HDFCBANK: ['NSE:HDFCBANK'],
  CRUDEOIL: ['MCX:CRUDEOIL1!', 'TVC:USOIL'],
};

const BINANCE_KLINE_MAP: Record<string, string> = {
  XAUUSD: 'PAXGUSDT',
  GOLD: 'PAXGUSDT',
  ETHUSD: 'ETHUSDT',
  ETHUSDT: 'ETHUSDT',
  BTCUSD: 'BTCUSDT',
  BTCUSDT: 'BTCUSDT',
  SOLUSD: 'SOLUSDT',
};

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: 'GC=F',
  GOLD: 'GC=F',
  XAGUSD: 'SI=F',
  ETHUSD: 'ETH-USD',
  BTCUSD: 'BTC-USD',
  SOLUSD: 'SOL-USD',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X',
  USDCHF: 'USDCHF=X',
  NZDUSD: 'NZDUSD=X',
  GBPJPY: 'GBPJPY=X',
  EURJPY: 'EURJPY=X',
  NAS100: 'NQ=F',
  USTEC: 'NQ=F',
  US30: 'YM=F',
  SPX500: 'ES=F',
  US500: 'ES=F',
  USOIL: 'CL=F',
  CRUDEOIL: 'CL=F',
  NIFTY: '^NSEI',
  NIFTY50: '^NSEI',
  BANKNIFTY: '^NSEBANK',
  FINNIFTY: 'NIFTY_FIN_SERVICE.NS',
  MIDCPNIFTY: 'NIFTY_MID_SELECT.NS',
  SENSEX: '^BSESN',
  RELIANCE: 'RELIANCE.NS',
  HDFCBANK: 'HDFCBANK.NS',
};

function normalizeCleanSymbol(rawSymbol: string): string {
  const upper = String(rawSymbol || '').trim().toUpperCase();
  const withoutExchange = upper.includes(':') ? upper.split(':').pop()! : upper;

  if (withoutExchange.includes('BANKNIFTY')) return 'BANKNIFTY';
  if (withoutExchange.includes('FINNIFTY')) return 'FINNIFTY';
  if (withoutExchange.includes('MIDCPNIFTY')) return 'MIDCPNIFTY';
  if (withoutExchange.includes('NIFTY')) return 'NIFTY';
  if (withoutExchange.includes('SENSEX')) return 'SENSEX';
  if (withoutExchange.includes('CRUDEOIL')) return 'CRUDEOIL';
  if (withoutExchange.includes('XAUUSD')) return 'XAUUSD';

  return withoutExchange.replace(/[^A-Z0-9]/g, '');
}

export class GlobalCfdCandleProvider implements ICandleProvider {
  readonly name = 'FYERS' as const; // Conforms to ICandleProvider union for seamless persistence

  private static quoteCache = new Map<string, { quote: GlobalLiveQuote; expiresAt: number }>();
  private static readonly QUOTE_TTL_MS = 4000;

  static isSupportedGlobalSymbol(rawSymbol: string, exchange?: string, assetClass?: string): boolean {
    const clean = normalizeCleanSymbol(rawSymbol);
    if (TV_TICKER_MAP[clean] || BINANCE_KLINE_MAP[clean] || YAHOO_SYMBOL_MAP[clean]) {
      return true;
    }
    const ex = String(exchange || '').toUpperCase();
    const ac = String(assetClass || '').toUpperCase();
    if (ex === 'FOREX' || ex === 'CRYPTO' || ac === 'FOREX' || ac === 'CRYPTO') {
      return clean.endsWith('USD') || clean.endsWith('USDT') || clean.endsWith('JPY') || clean.endsWith('EUR');
    }
    return false;
  }

  /**
   * Fetches real-time TradingView CFD/Forex/Crypto quotes via scanner.tradingview.com
   * with automatic fallback to Binance / Yahoo Finance.
   */
  static async getLiveQuotes(symbols: string[]): Promise<Map<string, GlobalLiveQuote>> {
    const result = new Map<string, GlobalLiveQuote>();
    const now = Date.now();
    const toFetch: string[] = [];

    for (const raw of symbols) {
      const clean = normalizeCleanSymbol(raw);
      if (!clean) continue;
      const cached = this.quoteCache.get(clean);
      if (cached && cached.expiresAt > now) {
        result.set(raw, cached.quote);
        result.set(clean, cached.quote);
      } else {
        toFetch.push(clean);
      }
    }

    if (toFetch.length === 0) {
      return result;
    }

    const uniqueClean = Array.from(new Set(toFetch));
    const tickerToClean = new Map<string, string>();
    const tickers: string[] = [];

    for (const clean of uniqueClean) {
      const candidates = TV_TICKER_MAP[clean] || [`OANDA:${clean}`, `FX:${clean}`, `BINANCE:${clean}`];
      for (const t of candidates) {
        tickers.push(t);
        if (!tickerToClean.has(t)) {
          tickerToClean.set(t, clean);
        }
      }
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const response = await fetch('https://scanner.tradingview.com/global/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: { tickers },
          columns: ['close', 'change', 'change_abs', 'high', 'low', 'open'],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const payload = (await response.json()) as {
          data?: Array<{ s: string; d: Array<number | null> }>;
        };
        for (const row of payload.data || []) {
          const clean = tickerToClean.get(row.s);
          if (!clean || result.has(clean)) continue;
          const [close, changePct, changeAbs, high, low, open] = row.d || [];
          if (typeof close === 'number' && close > 0) {
            const quote: GlobalLiveQuote = {
              symbol: clean,
              tvTicker: row.s,
              ltp: close,
              open: typeof open === 'number' ? open : close,
              high: typeof high === 'number' ? high : close,
              low: typeof low === 'number' ? low : close,
              changePct: typeof changePct === 'number' ? changePct : 0,
              changeAbs: typeof changeAbs === 'number' ? changeAbs : 0,
              timestamp: new Date(),
            };
            this.quoteCache.set(clean, { quote, expiresAt: Date.now() + this.QUOTE_TTL_MS });
            result.set(clean, quote);
          }
        }
      }
    } catch {
      // Fallback to Binance spot ticker if TradingView scanner is unreachable
    }

    // Fallback for any missing symbols via Binance public vision API
    for (const clean of uniqueClean) {
      if (result.has(clean)) continue;
      const binanceSym = BINANCE_KLINE_MAP[clean];
      if (!binanceSym) continue;
      try {
        const res = await fetch(
          `https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(binanceSym)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { price?: string };
          const ltp = Number(data?.price);
          if (Number.isFinite(ltp) && ltp > 0) {
            const quote: GlobalLiveQuote = {
              symbol: clean,
              tvTicker: `BINANCE:${binanceSym}`,
              ltp,
              open: ltp,
              high: ltp,
              low: ltp,
              changePct: 0,
              changeAbs: 0,
              timestamp: new Date(),
            };
            this.quoteCache.set(clean, { quote, expiresAt: Date.now() + this.QUOTE_TTL_MS });
            result.set(clean, quote);
          }
        }
      } catch {
        // Ignore individual fallback error
      }
    }

    // Ensure raw input keys also map to resolved quotes
    for (const raw of symbols) {
      const clean = normalizeCleanSymbol(raw);
      const q = result.get(clean);
      if (q) {
        result.set(raw, q);
      }
    }

    return result;
  }

  static getTradingViewWidgetSymbol(rawSymbol: string): string {
    const clean = normalizeCleanSymbol(rawSymbol);
    const candidates = TV_TICKER_MAP[clean];
    if (candidates && candidates.length > 0) {
      // Prefer OANDA / COINBASE / FX for TradingView embed widget compatibility
      const oandaOrFx = candidates.find(
        (c) => c.startsWith('OANDA:') || c.startsWith('FX:') || c.startsWith('COINBASE:') || c.startsWith('FOREXCOM:')
      );
      return oandaOrFx || candidates[0];
    }
    return `OANDA:${clean || 'XAUUSD'}`;
  }

  private static calibrateSpotCandles(
    candles: ITradeCandle[],
    cleanSymbol: string,
    isFuturesProxy: boolean,
    trade: any,
    liveQuote?: GlobalLiveQuote
  ): ITradeCandle[] {
    if (!candles || candles.length === 0) return candles;

    const decimals = cleanSymbol.includes('EUR') || cleanSymbol.includes('GBP') || cleanSymbol.includes('AUD') || cleanSymbol.includes('NZD') || cleanSymbol.includes('CAD') || cleanSymbol.includes('CHF')
      ? 5
      : cleanSymbol.includes('JPY')
      ? 3
      : 2;

    let basisOffset = 0;
    const lastCandle = candles[candles.length - 1];
    const nowSec = Math.floor(Date.now() / 1000);
    const isRecentWindow = Math.abs(nowSec - lastCandle.t) <= 6 * 3600;

    const rawEntryPrice = Number(
      trade?.simpleExecution?.entryPrice ??
        trade?.fills?.find((f: any) => f.type === 'ENTRY')?.price ??
        trade?.risk?.plannedEntryPrice ??
        trade?.entryPrice ??
        0
    );
    const entryTimeMs = trade?.entryTime ? new Date(trade.entryTime).getTime() : 0;
    const entryTimeSec = entryTimeMs > 0 ? Math.floor(entryTimeMs / 1000) : 0;

    // 1. If we have a trade entryTime inside the candle window, check if futures basis shift is needed
    if (rawEntryPrice > 0 && entryTimeSec > 0) {
      let closest = candles[0];
      let minDiff = Math.abs(candles[0].t - entryTimeSec);
      for (const c of candles) {
        const d = Math.abs(c.t - entryTimeSec);
        if (d < minDiff) {
          minDiff = d;
          closest = c;
        }
      }
      if (minDiff <= 3600) {
        const insideBar = rawEntryPrice >= closest.l && rawEntryPrice <= closest.h;
        if (!insideBar) {
          const mid = (closest.h + closest.l) / 2;
          const relDiff = Math.abs(rawEntryPrice - mid) / rawEntryPrice;
          if (relDiff > 0.0003 && relDiff < 0.03) {
            basisOffset = rawEntryPrice - closest.c;
          }
        }
      }
    }

    // 2. Otherwise, if using a futures proxy (GC=F, NQ=F, YM=F, ES=F) on a live/recent window, align with TradingView Spot LTP
    if (basisOffset === 0 && isFuturesProxy && isRecentWindow && liveQuote && liveQuote.ltp > 0) {
      const relDiff = Math.abs(liveQuote.ltp - lastCandle.c) / liveQuote.ltp;
      if (relDiff > 0.0002 && relDiff < 0.03) {
        basisOffset = liveQuote.ltp - lastCandle.c;
      }
    }

    const calibrated = candles.map((c) => {
      if (basisOffset === 0) return c;
      return {
        t: c.t,
        o: Number((c.o + basisOffset).toFixed(decimals)),
        h: Number((c.h + basisOffset).toFixed(decimals)),
        l: Number((c.l + basisOffset).toFixed(decimals)),
        c: Number((c.c + basisOffset).toFixed(decimals)),
        v: c.v,
      };
    });

    // 3. If window is live and we have a real-time TradingView quote, update the forming bar close
    if (isRecentWindow && liveQuote && liveQuote.ltp > 0 && calibrated.length > 0) {
      const tip = calibrated[calibrated.length - 1];
      const relGap = Math.abs(liveQuote.ltp - tip.c) / liveQuote.ltp;
      if (relGap < 0.008) {
        tip.c = Number(liveQuote.ltp.toFixed(decimals));
        if (tip.c > tip.h) tip.h = tip.c;
        if (tip.c < tip.l) tip.l = tip.c;
      }
    }

    return calibrated;
  }

  async supports(trade: any, _userId: string | mongoose.Types.ObjectId): Promise<boolean> {
    return GlobalCfdCandleProvider.isSupportedGlobalSymbol(
      trade?.symbol || trade?.underlying || '',
      trade?.exchange,
      trade?.assetClass
    );
  }

  async getCandles(params: CandleFetchParams): Promise<CandleProviderResult> {
    const clean = normalizeCleanSymbol(params.trade?.symbol || params.trade?.underlying || '');
    const resolution = String(params.resolution || '5');
    const fromMs = params.from.getTime();
    const toMs = params.to.getTime();

    let liveQuote: GlobalLiveQuote | undefined;
    try {
      const quotesMap = await GlobalCfdCandleProvider.getLiveQuotes([clean]);
      liveQuote = quotesMap.get(clean);
    } catch {
      // Optional live quote enrichment
    }

    // 1. Try Yahoo Finance chart endpoint first (accurate for XAUUSD/GC=F, Forex pairs, Indices, Crypto)
    const yahooSym = YAHOO_SYMBOL_MAP[clean];
    if (yahooSym) {
      try {
        const intervalMap: Record<string, string> = {
          '1': '1m',
          '5': '5m',
          '15': '15m',
          '30': '30m',
          '60': '60m',
          '240': '60m',
          D: '1d',
        };
        const interval = intervalMap[resolution] || '5m';
        const period1 = Math.max(0, Math.floor(fromMs / 1000) - 3600);
        const period2 = Math.floor(toMs / 1000) + 3600;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          yahooSym
        )}?interval=${interval}&period1=${period1}&period2=${period2}`;

        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          const resultObj = data?.chart?.result?.[0];
          const timestamps: number[] = resultObj?.timestamp || [];
          const quote = resultObj?.indicators?.quote?.[0] || {};
          const rawCandles: ITradeCandle[] = [];

          for (let i = 0; i < timestamps.length; i++) {
            const tSec = timestamps[i];
            const o = quote.open?.[i];
            const h = quote.high?.[i];
            const l = quote.low?.[i];
            const c = quote.close?.[i];
            const v = quote.volume?.[i] ?? 0;
            if (
              typeof tSec === 'number' &&
              typeof o === 'number' &&
              typeof h === 'number' &&
              typeof l === 'number' &&
              typeof c === 'number'
            ) {
              rawCandles.push({
                t: tSec,
                o: Number(o.toFixed(4)),
                h: Number(h.toFixed(4)),
                l: Number(l.toFixed(4)),
                c: Number(c.toFixed(4)),
                v: Number(v) || 0,
              });
            }
          }

          if (rawCandles.length > 0) {
            const isFuturesProxy = yahooSym.endsWith('=F');
            const candles = GlobalCfdCandleProvider.calibrateSpotCandles(
              rawCandles,
              clean,
              isFuturesProxy,
              params.trade,
              liveQuote
            );
            return {
              ok: true,
              candles,
              resolution,
              provider: 'FYERS',
              isUnderlyingFallback: false,
              symbol: clean,
              droppedRowsCount: 0,
            };
          }
        }
      } catch {
        // Proceed to Binance fallback
      }
    }

    // 2. Try Binance Klines API (24/7 high-resolution historical candles for ETHUSD, BTCUSD, XAUUSD via PAXGUSDT)
    const binanceSym = BINANCE_KLINE_MAP[clean];
    if (binanceSym) {
      try {
        const intervalMap: Record<string, string> = {
          '1': '1m',
          '5': '5m',
          '15': '15m',
          '30': '30m',
          '60': '1h',
          '240': '4h',
          D: '1d',
        };
        const interval = intervalMap[resolution] || '5m';
        const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(
          binanceSym
        )}&interval=${interval}&startTime=${fromMs}&endTime=${toMs}&limit=1000`;

        const res = await fetch(url);
        if (res.ok) {
          const rows = (await res.json()) as any[];
          const rawCandles: ITradeCandle[] = [];
          for (const r of rows || []) {
            if (Array.isArray(r) && r.length >= 6) {
              rawCandles.push({
                t: Math.floor(Number(r[0]) / 1000),
                o: Number(parseFloat(r[1]).toFixed(4)),
                h: Number(parseFloat(r[2]).toFixed(4)),
                l: Number(parseFloat(r[3]).toFixed(4)),
                c: Number(parseFloat(r[4]).toFixed(4)),
                v: Number(parseFloat(r[5])) || 0,
              });
            }
          }
          if (rawCandles.length > 0) {
            const candles = GlobalCfdCandleProvider.calibrateSpotCandles(
              rawCandles,
              clean,
              false,
              params.trade,
              liveQuote
            );
            return {
              ok: true,
              candles,
              resolution,
              provider: 'FYERS',
              isUnderlyingFallback: false,
              symbol: clean,
              droppedRowsCount: 0,
            };
          }
        }
      } catch {
        // Ignore
      }
    }

    return {
      ok: false,
      reason: 'EMPTY_RESULT',
      message: `No global CFD/Forex/Crypto historical candles found for ${clean}`,
    };
  }

  /**
   * Standalone live candle & quote stream for Prop Firm instruments (XAUUSD, EURUSD, NAS100, US30, BTCUSD, ETHUSD).
   */
  static async getLiveSymbolCandles(params: {
    symbol: string;
    resolution?: string;
    bars?: number;
  }) {
    const clean = normalizeCleanSymbol(params.symbol || 'XAUUSD');
    const resolution = String(params.resolution || '5');
    const bars = Math.max(40, Math.min(500, Number(params.bars) || 180));

    const resMinutes =
      resolution === '1'
        ? 1
        : resolution === '5'
        ? 5
        : resolution === '15'
        ? 15
        : resolution === '30'
        ? 30
        : resolution === '60'
        ? 60
        : resolution === 'D'
        ? 1440
        : 5;

    const now = new Date();
    const lookbackMs = bars * resMinutes * 60 * 1000 * 1.8;
    const from = new Date(now.getTime() - lookbackMs);

    const provider = new GlobalCfdCandleProvider();
    const [quotesMap, candleRes] = await Promise.all([
      GlobalCfdCandleProvider.getLiveQuotes([clean]),
      provider.getCandles({
        trade: { symbol: clean, exchange: 'FOREX' },
        resolution,
        from,
        to: now,
        userId: '000000000000000000000000',
      }),
    ]);

    const quote = quotesMap.get(clean) || null;
    const rawCandles = candleRes.ok ? candleRes.candles : [];

    // Deduplicate and format for lightweight-charts
    const formatted = rawCandles
      .map((c) => ({
        time: Math.floor(c.t < 1e11 ? c.t : c.t / 1000),
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        close: Number(c.c),
        volume: Number(c.v || 0),
      }))
      .sort((a, b) => a.time - b.time);

    const uniqueCandles: typeof formatted = [];
    const seen = new Set<number>();
    for (const c of formatted) {
      if (!seen.has(c.time)) {
        seen.add(c.time);
        uniqueCandles.push(c);
      }
    }

    return {
      symbol: clean,
      tvTicker: GlobalCfdCandleProvider.getTradingViewWidgetSymbol(clean),
      resolution,
      quote,
      candles: uniqueCandles,
    };
  }
}

