import { CommodityMaster, ICommodityMasterDoc } from '../db/models/CommodityMaster.js';
import { AngelOneInstrument } from '../db/models/AngelOneInstrument.js';

export interface ClassifiedMeta {
  assetClass: 'EQUITY' | 'FUTURES' | 'OPTIONS' | 'COMMODITY' | 'FOREX' | 'CRYPTO' | 'INDEX';
  exchange: string;
  marketSegment: string;
  isCommodity: boolean;
  underlying: string;
}

export class InstrumentClassifier {
  // In-memory cache of dynamic commodities loaded from MongoDB
  private static commoditySymbols = new Set<string>();
  private static commodityAliases = new Map<string, string>();
  private static isInitialized = false;

  /**
   * Loads dynamic commodities from MongoDB CommodityMaster into memory cache.
   * If MongoDB has no records yet, seeds default MCX commodity catalog dynamically.
   */
  static async loadCommodityRegistry(): Promise<void> {
    try {
      let records = await CommodityMaster.find({ isActive: true }).lean();

      if (records.length === 0) {
        // Seed initial dynamic catalog into database
        await this.seedInitialCatalog();
        records = await CommodityMaster.find({ isActive: true }).lean();
      }

      this.commoditySymbols.clear();
      this.commodityAliases.clear();

      for (const rec of records) {
        const root = rec.symbol.toUpperCase().trim();
        this.commoditySymbols.add(root);

        if (Array.isArray(rec.aliases)) {
          for (const alias of rec.aliases) {
            const cleanAlias = alias.toUpperCase().trim();
            this.commoditySymbols.add(cleanAlias);
            this.commodityAliases.set(cleanAlias, root);
          }
        }
      }

      this.isInitialized = true;
    } catch (err) {
      console.error('[InstrumentClassifier] Error loading dynamic commodity registry:', err);
    }
  }

  /**
   * Synchronously checks if a symbol or underlying matches the dynamic commodity catalog.
   */
  static isCommoditySync(symbol: string, segment?: string): boolean {
    const raw = (symbol || '').toUpperCase().trim();
    const seg = String(segment || '').toUpperCase().trim();
    if (seg.includes('COMMODITY') || seg.includes('MCX') || seg.includes('COM') || raw.startsWith('MCX:')) {
      return true;
    }

    const clean = symbol
      .toUpperCase()
      .trim()
      .replace(/^(NSE|BSE|MCX|BINANCE):/i, '');

    // Match against dynamic symbols
    for (const kw of this.commoditySymbols) {
      if (clean === kw || clean.startsWith(kw)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Synchronous classification for streaming CSV import and high-throughput feeds.
   * Evaluates authoritative segment -> dynamic commodity registry -> generic structural patterns.
   */
  static classifySync(symbol: string, segment?: string): ClassifiedMeta {
    const rawSym = symbol || '';
    const clean = rawSym
      .toUpperCase()
      .trim()
      .replace(/^(NSE|BSE|MCX|BINANCE):/i, '');
    const seg = String(segment || '').toUpperCase().trim();

    // 1. Authoritative Commodity check (exchange/segment metadata or dynamic registry)
    if (this.isCommoditySync(rawSym, seg)) {
      return {
        assetClass: 'COMMODITY',
        exchange: 'MCX',
        marketSegment: 'MCX',
        isCommodity: true,
        underlying: clean,
      };
    }

    // 2. Crypto detection (generic token pair structure)
    if (
      seg.includes('CRYPTO') ||
      rawSym.toUpperCase().startsWith('BINANCE:') ||
      clean.endsWith('USDT') ||
      clean.endsWith('USDC') ||
      clean.endsWith('BUSD')
    ) {
      return {
        assetClass: 'CRYPTO',
        exchange: 'BINANCE',
        marketSegment: 'CRYPTO',
        isCommodity: false,
        underlying: clean,
      };
    }

    // 3. Forex / Currency derivatives
    if (seg.includes('FOREX') || seg.includes('CURRENCY') || seg.includes('CD') || /^[A-Z]{3}\/[A-Z]{3}$/.test(clean)) {
      return {
        assetClass: 'FOREX',
        exchange: 'NSE',
        marketSegment: 'FOREX',
        isCommodity: false,
        underlying: clean,
      };
    }

    // 4. Derivatives: Options vs Futures by structural pattern (zero symbol hardcoding)
    if (seg.includes('FNO') || seg.includes('NFO') || seg.includes('BFO') || /CE$|PE$|CALL$|PUT$|FUT$|FUTURES$/i.test(clean)) {
      const isOption = /(?:\d+(?:CE|PE|CALL|PUT)|\s+(?:CE|PE|CALL|PUT))$/i.test(clean) || clean.includes('CE') || clean.includes('PE');
      return {
        assetClass: isOption ? 'OPTIONS' : 'FUTURES',
        exchange: seg.includes('BSE') || clean.startsWith('BSE:') ? 'BSE' : 'NSE',
        marketSegment: seg.includes('BSE') || clean.startsWith('BSE:') ? 'BSE_FNO' : 'NSE_FNO',
        isCommodity: false,
        underlying: clean,
      };
    }

    // 5. Default Cash Equity
    return {
      assetClass: 'EQUITY',
      exchange: seg.includes('BSE') || clean.startsWith('BSE:') ? 'BSE' : 'NSE',
      marketSegment: seg.includes('BSE') || clean.startsWith('BSE:') ? 'BSE_EQ' : 'NSE_EQ',
      isCommodity: false,
      underlying: clean,
    };
  }

  /**
   * Asynchronous, authoritative trade metadata harmonization for trade creation and updates.
   * Checks Broker explicit metadata -> Scrip Master DB (AngelOneInstrument) -> Dynamic Commodity Registry -> Pattern Fallback.
   */
  static async harmonizeTradeMeta(tradeLike: {
    symbol?: string;
    exchange?: string;
    marketSegment?: string;
    assetClass?: string;
    userId?: string;
  }): Promise<{
    exchange: string;
    marketSegment: string;
    assetClass: 'EQUITY' | 'FUTURES' | 'OPTIONS' | 'COMMODITY' | 'FOREX' | 'CRYPTO' | 'INDEX';
  }> {
    const sym = (tradeLike.symbol || '').toUpperCase().trim();
    const cleanSym = sym.replace(/^(NSE|BSE|MCX|BINANCE):/i, '').trim();
    const rawExchange = (tradeLike.exchange || '').toUpperCase().trim();
    const rawSegment = (tradeLike.marketSegment || '').toUpperCase().trim();

    // 1. Authoritative explicit broker segment / exchange
    if (rawExchange === 'MCX' || sym.startsWith('MCX:') || rawSegment === 'MCX' || rawSegment.includes('COM')) {
      return {
        exchange: 'MCX',
        marketSegment: 'MCX',
        assetClass: 'COMMODITY',
      };
    }

    // 2. Query dynamic CommodityMaster catalog
    if (!this.isInitialized) {
      await this.loadCommodityRegistry();
    }

    for (const kw of this.commoditySymbols) {
      if (cleanSym === kw || cleanSym.startsWith(kw)) {
        return {
          exchange: 'MCX',
          marketSegment: 'MCX',
          assetClass: 'COMMODITY',
        };
      }
    }

    // 3. Query Scrip Master catalog (AngelOneInstrument) if available
    try {
      const scrip = await AngelOneInstrument.findOne({
        tradingsymbol: cleanSym,
      })
        .select('exchange instrumenttype')
        .lean();

      if (scrip) {
        const scripExchange = scrip.exchange?.toUpperCase() || 'NSE';
        if (scripExchange === 'MCX' || scrip.instrumenttype?.includes('COM')) {
          return {
            exchange: 'MCX',
            marketSegment: 'MCX',
            assetClass: 'COMMODITY',
          };
        }

        const isOpt = scrip.instrumenttype?.includes('OPT');
        const isFut = scrip.instrumenttype?.includes('FUT');
        const isDeriv = isOpt || isFut;

        return {
          exchange: scripExchange,
          marketSegment: isDeriv
            ? scripExchange === 'BSE'
              ? 'BSE_FNO'
              : 'NSE_FNO'
            : scripExchange === 'BSE'
            ? 'BSE_EQ'
            : 'NSE_EQ',
          assetClass: isOpt ? 'OPTIONS' : isFut ? 'FUTURES' : (tradeLike.assetClass as any) || 'EQUITY',
        };
      }
    } catch {
      // Ignore DB query errors in standalone testing
    }

    // 4. Fall back to synchronous structural classifier
    const syncClassified = this.classifySync(sym, rawSegment);
    return {
      exchange: tradeLike.exchange || syncClassified.exchange,
      marketSegment: tradeLike.marketSegment || syncClassified.marketSegment,
      assetClass: (tradeLike.assetClass as any) || syncClassified.assetClass,
    };
  }

  /**
   * Seeds default dynamic MCX commodities into CommodityMaster if empty.
   */
  private static async seedInitialCatalog(): Promise<void> {
    const initialList = [
      {
        symbol: 'CRUDEOIL',
        displayName: 'Crude Oil',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['CRUDEOILM', 'CRUDEOILMINI'],
        contractMultiplier: 100,
        lotSize: 1,
        tickSize: 1.0,
      },
      {
        symbol: 'NATURALGAS',
        displayName: 'Natural Gas',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['NATGAS', 'NATGASMINI'],
        contractMultiplier: 1250,
        lotSize: 1,
        tickSize: 0.1,
      },
      {
        symbol: 'GOLD',
        displayName: 'Gold 1KG',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['GOLDM', 'GOLDGUINEA', 'GOLDPETAL'],
        contractMultiplier: 100,
        lotSize: 1,
        tickSize: 1.0,
      },
      {
        symbol: 'SILVER',
        displayName: 'Silver 30KG',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['SILVERM', 'SILVERMIC'],
        contractMultiplier: 30,
        lotSize: 1,
        tickSize: 1.0,
      },
      {
        symbol: 'COPPER',
        displayName: 'Copper',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['COPPERM'],
        contractMultiplier: 2500,
        lotSize: 1,
        tickSize: 0.05,
      },
      {
        symbol: 'ZINC',
        displayName: 'Zinc',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['ZINCMINI'],
        contractMultiplier: 5000,
        lotSize: 1,
        tickSize: 0.05,
      },
      {
        symbol: 'NICKEL',
        displayName: 'Nickel',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['NICKELMINI'],
        contractMultiplier: 1500,
        lotSize: 1,
        tickSize: 0.1,
      },
      {
        symbol: 'ALUMINIUM',
        displayName: 'Aluminium',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['ALUMINI'],
        contractMultiplier: 5000,
        lotSize: 1,
        tickSize: 0.05,
      },
      {
        symbol: 'LEAD',
        displayName: 'Lead',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['LEADMINI'],
        contractMultiplier: 5000,
        lotSize: 1,
        tickSize: 0.05,
      },
      {
        symbol: 'COTTON',
        displayName: 'Cotton',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['COTTONCANDY'],
        contractMultiplier: 25,
        lotSize: 1,
        tickSize: 10.0,
      },
      {
        symbol: 'MENTHAOIL',
        displayName: 'Mentha Oil',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: [],
        contractMultiplier: 360,
        lotSize: 1,
        tickSize: 0.1,
      },
      {
        symbol: 'MCXBULLDEX',
        displayName: 'MCX Bullion Index',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['BULLDEX'],
        contractMultiplier: 50,
        lotSize: 1,
        tickSize: 1.0,
      },
      {
        symbol: 'MCXENRGDEX',
        displayName: 'MCX Energy Index',
        exchange: 'MCX',
        marketSegment: 'MCX',
        aliases: ['ENRGDEX'],
        contractMultiplier: 125,
        lotSize: 1,
        tickSize: 1.0,
      },
    ];

    const ops = initialList.map((item) => ({
      updateOne: {
        filter: { symbol: item.symbol },
        update: { $setOnInsert: item },
        upsert: true,
      },
    }));

    await CommodityMaster.bulkWrite(ops, { ordered: false });
  }
}
