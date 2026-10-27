import Decimal from 'decimal.js';
import moment from 'moment';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type SLOrderSide = 'BUY' | 'SELL';
export type SLOrderFinalStatus = 'FILLED' | 'CANCELLED' | 'OPEN' | 'REJECTED';
export type SLMatchConfidence = 'HIGH' | 'AMBIGUOUS' | 'NONE';

export interface INormalizedOrderbookRow {
  orderId: string;
  symbol: string;
  side: SLOrderSide | number; // 1 = BUY, -1 = SELL or 'BUY' | 'SELL'
  orderType: number; // 3 = SL-M, 4 = SL-L
  stopPrice: number | string | Decimal;
  price?: number | string | Decimal;
  quantity: number | string | Decimal;
  status: SLOrderFinalStatus | number | string;
  orderDateTime: Date | string | number;
  productType?: string;
  message?: string;
}

export interface ISLMatchTradeInput {
  symbol: string;
  cleanSymbol?: string;
  formattedSymbol?: string;
  underlying?: string;
  direction: 'LONG' | 'SHORT';
  entryTime: Date | string;
  exitTime?: Date | string | null;
  entryPrice?: number | string | Decimal;
  entryQty: number | string | Decimal;
  fills?: Array<{
    type: 'ENTRY' | 'EXIT';
    price: number | string | Decimal;
    quantity: number | string | Decimal;
    timestamp: Date | string;
  }>;
  tickSize?: number | string | Decimal;
}

export interface ISLOrderCandidate {
  orderId: string;
  orderType: number;
  stopPrice: number;
  price?: number;
  quantity: number;
  side: SLOrderSide;
  status: SLOrderFinalStatus;
  orderDateTime: string;
  isCorrectSide: boolean;
  productType?: string;
  reason?: string;
}

export interface ISLMatchResult {
  initialStop?: number;
  source: 'BROKER_ORDERBOOK';
  matchedOrderId?: string;
  finalStatus?: SLOrderFinalStatus;
  confidence: SLMatchConfidence;
  candidates: ISLOrderCandidate[];
  ambiguityReason?: string;
  orderModifications?: Array<{
    stopPrice: number;
    modifiedAt: Date;
    orderId: string;
    orderType: number;
    reason?: string;
  }>;
}

export interface ISLMatchOptions {
  timeToleranceSeconds?: number;
  quantityTolerance?: number;
}

function normalizeSide(rawSide: SLOrderSide | number | string): SLOrderSide {
  if (typeof rawSide === 'number') {
    return rawSide === 1 ? 'BUY' : 'SELL';
  }
  const s = String(rawSide).trim().toUpperCase();
  if (s === '1' || s === 'BUY' || s === 'B') return 'BUY';
  return 'SELL';
}

function normalizeStatus(rawStatus: SLOrderFinalStatus | number | string): SLOrderFinalStatus {
  if (typeof rawStatus === 'number') {
    switch (rawStatus) {
      case 1:
      case 7:
        return 'CANCELLED';
      case 2:
        return 'FILLED';
      case 5:
        return 'REJECTED';
      case 4:
      case 6:
      default:
        return 'OPEN';
    }
  }
  const s = String(rawStatus).trim().toUpperCase();
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED') return 'CANCELLED';
  if (s === 'FILLED' || s === 'TRADED' || s === 'COMPLETE') return 'FILLED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'OPEN';
}

function cleanSymbolString(sym: string): string {
  if (!sym) return '';
  let clean = sym.trim().toUpperCase();
  if (clean.includes(':')) {
    clean = clean.split(':')[1].trim();
  }
  return clean.replace(/-EQ|-BE$/, '');
}

/**
 * Pure matcher for identifying initial Stop Loss orders from broker orderbook
 * for a round-trip FIFO trade.
 */
export function matchSLOrderFromOrderbook(
  trade: ISLMatchTradeInput,
  orderbookRows: INormalizedOrderbookRow[],
  options?: ISLMatchOptions
): ISLMatchResult {
  const timeToleranceMs = (options?.timeToleranceSeconds ?? 60) * 1000;
  const qtyTolerance = options?.quantityTolerance ?? 0;

  if (!orderbookRows || orderbookRows.length === 0) {
    return {
      source: 'BROKER_ORDERBOOK',
      confidence: 'NONE',
      candidates: [],
    };
  }

  // Determine entry and exit time window with tolerance
  const entryMom = moment(trade.entryTime);
  const exitMom = trade.exitTime ? moment(trade.exitTime) : moment().add(1, 'hour');

  const windowStart = entryMom.clone().subtract(timeToleranceMs, 'milliseconds');
  const windowEnd = exitMom.clone().add(timeToleranceMs, 'milliseconds');

  // Candidate symbol matching set
  const tradeSymbols = new Set<string>();
  if (trade.symbol) {
    tradeSymbols.add(trade.symbol.trim().toUpperCase());
    tradeSymbols.add(cleanSymbolString(trade.symbol));
  }
  if (trade.cleanSymbol) {
    tradeSymbols.add(trade.cleanSymbol.trim().toUpperCase());
    tradeSymbols.add(cleanSymbolString(trade.cleanSymbol));
  }
  if (trade.formattedSymbol) {
    tradeSymbols.add(trade.formattedSymbol.trim().toUpperCase());
    tradeSymbols.add(cleanSymbolString(trade.formattedSymbol));
  }
  if (trade.underlying) {
    tradeSymbols.add(trade.underlying.trim().toUpperCase());
    tradeSymbols.add(cleanSymbolString(trade.underlying));
  }

  // Opposite side rule:
  // For LONG trade: entry was BUY, exit/stop order must be SELL.
  // For SHORT trade: entry was SELL, exit/stop order must be BUY.
  const expectedStopSide: SLOrderSide = trade.direction === 'LONG' ? 'SELL' : 'BUY';

  // Determine trade entry price for directional check
  let entryPriceDecimal: Decimal;
  if (trade.entryPrice !== undefined && trade.entryPrice !== null) {
    entryPriceDecimal = new Decimal(trade.entryPrice);
  } else if (trade.fills && trade.fills.length > 0) {
    const entryFills = trade.fills.filter((f) => f.type === 'ENTRY');
    let totalCost = new Decimal(0);
    let totalQty = new Decimal(0);
    for (const f of entryFills) {
      const q = new Decimal(f.quantity);
      totalCost = totalCost.plus(new Decimal(f.price).times(q));
      totalQty = totalQty.plus(q);
    }
    entryPriceDecimal = totalQty.greaterThan(0) ? totalCost.dividedBy(totalQty) : new Decimal(0);
  } else {
    entryPriceDecimal = new Decimal(0);
  }

  const tradeEntryQtyDecimal = new Decimal(trade.entryQty || 0);

  // Filter raw orders for potential SL candidates
  const candidateRows: Array<{
    row: INormalizedOrderbookRow;
    orderId: string;
    stopPriceDecimal: Decimal;
    qtyDecimal: Decimal;
    mom: moment.Moment;
    side: SLOrderSide;
    status: SLOrderFinalStatus;
    isCorrectSide: boolean;
  }> = [];

  for (const row of orderbookRows) {
    // 1. Order Type check: Must be SL-M (3) or SL-L (4)
    if (row.orderType !== 3 && row.orderType !== 4) {
      continue;
    }

    // 2. Stop price must be positive
    let stopDecimal: Decimal;
    try {
      stopDecimal = new Decimal(row.stopPrice || 0);
      if (stopDecimal.lessThanOrEqualTo(0)) continue;
    } catch {
      continue;
    }

    // 3. Symbol match
    const rawSym = String(row.symbol || '').trim().toUpperCase();
    const cleanSym = cleanSymbolString(rawSym);
    const matchesSymbol = tradeSymbols.has(rawSym) || tradeSymbols.has(cleanSym);
    if (!matchesSymbol) {
      continue;
    }

    // 4. Side check: must be opposite side to entry
    const side = normalizeSide(row.side);
    if (side !== expectedStopSide) {
      continue;
    }

    // 5. Time window check
    const ordMom = moment(row.orderDateTime);
    if (!ordMom.isValid() || !ordMom.isBetween(windowStart, windowEnd, undefined, '[]')) {
      continue;
    }

    // 6. Directional validity (validate correct side of entry)
    let isCorrectSide = false;
    if (entryPriceDecimal.greaterThan(0)) {
      if (trade.direction === 'LONG') {
        // LONG stop must be strictly BELOW entry price
        isCorrectSide = stopDecimal.lessThan(entryPriceDecimal);
      } else {
        // SHORT stop must be strictly ABOVE entry price
        isCorrectSide = stopDecimal.greaterThan(entryPriceDecimal);
      }
    } else {
      isCorrectSide = true;
    }

    const qtyDecimal = new Decimal(row.quantity || 0);
    const status = normalizeStatus(row.status);
    const orderId = String(row.orderId || '').trim();

    candidateRows.push({
      row,
      orderId,
      stopPriceDecimal: stopDecimal,
      qtyDecimal,
      mom: ordMom,
      side,
      status,
      isCorrectSide,
    });
  }

  // Group candidate rows by orderId to handle modifications/trailing stops of the same order
  const orderGroups = new Map<string, typeof candidateRows>();
  for (const c of candidateRows) {
    const list = orderGroups.get(c.orderId) || [];
    list.push(c);
    orderGroups.set(c.orderId, list);
  }

  // For each order group, sort chronologically and evaluate initial placement
  interface IOrderGroupSummary {
    orderId: string;
    firstRow: (typeof candidateRows)[0];
    lastRow: (typeof candidateRows)[0];
    initialStopPrice: Decimal;
    finalStatus: SLOrderFinalStatus;
    quantity: Decimal;
    rows: typeof candidateRows;
    isInitialStopCorrectSide: boolean;
  }

  const groupSummaries: IOrderGroupSummary[] = [];

  for (const [orderId, rows] of orderGroups.entries()) {
    rows.sort((a, b) => a.mom.valueOf() - b.mom.valueOf());
    const firstRow = rows[0];
    const lastRow = rows[rows.length - 1];

    // Directional check is determined on the initial placement of the order
    const isInitialStopCorrectSide = firstRow.isCorrectSide;

    groupSummaries.push({
      orderId,
      firstRow,
      lastRow,
      initialStopPrice: firstRow.stopPriceDecimal,
      finalStatus: lastRow.status,
      quantity: firstRow.qtyDecimal,
      rows,
      isInitialStopCorrectSide,
    });
  }

  // All extracted candidate representations for debugging / inspection
  const candidates: ISLOrderCandidate[] = [];
  for (const group of groupSummaries) {
    for (const c of group.rows) {
      // If the order was initially placed on the correct side, then this order is valid,
      // and subsequent trailed modifications (even if moved beyond entry into profit) remain valid.
      const isCorrect = group.isInitialStopCorrectSide ? true : c.isCorrectSide;
      candidates.push({
        orderId: c.orderId,
        orderType: c.row.orderType,
        stopPrice: c.stopPriceDecimal.toNumber(),
        price: c.row.price ? new Decimal(c.row.price).toNumber() : undefined,
        quantity: c.qtyDecimal.toNumber(),
        side: c.side,
        status: c.status,
        orderDateTime: c.mom.toISOString(),
        isCorrectSide: isCorrect,
        productType: c.row.productType,
        reason: c.row.message,
      });
    }
  }

  // Discard order groups whose initial placement was on the wrong side of entry
  const validOrderGroups = groupSummaries.filter((g) => g.isInitialStopCorrectSide);

  if (validOrderGroups.length === 0) {
    return {
      source: 'BROKER_ORDERBOOK',
      confidence: 'NONE',
      candidates,
    };
  }

  // Filter groups that match quantity
  // Quantity check: matches trade entryQty (or within tolerance)
  const matchesQty = (groupQty: Decimal): boolean => {
    if (tradeEntryQtyDecimal.isZero()) return true;
    if (groupQty.equals(tradeEntryQtyDecimal)) return true;
    const diff = groupQty.minus(tradeEntryQtyDecimal).abs().toNumber();
    return diff <= qtyTolerance;
  };

  const qtyMatchedGroups = validOrderGroups.filter((g) => matchesQty(g.quantity));

  // If quantity-matched groups exist, focus on them; otherwise fallback to all valid groups
  const eligibleGroups = qtyMatchedGroups.length > 0 ? qtyMatchedGroups : validOrderGroups;

  // Single candidate group -> HIGH confidence
  if (eligibleGroups.length === 1) {
    const matched = eligibleGroups[0];
    const modifications = matched.rows.map((r) => ({
      stopPrice: r.stopPriceDecimal.toNumber(),
      modifiedAt: r.mom.toDate(),
      orderId: r.orderId,
      orderType: r.row.orderType,
      reason: r.row.message,
    }));

    return {
      source: 'BROKER_ORDERBOOK',
      initialStop: matched.initialStopPrice.toNumber(),
      matchedOrderId: matched.orderId,
      finalStatus: matched.finalStatus,
      confidence: 'HIGH',
      candidates,
      orderModifications: modifications,
    };
  }

  // If more than 1 eligible group:
  // Check if all groups have identical initial stop price and identical quantity
  const firstStop = eligibleGroups[0].initialStopPrice;
  const allIdenticalStops = eligibleGroups.every((g) => g.initialStopPrice.equals(firstStop));

  if (allIdenticalStops) {
    // If all distinct orders placed have identical trigger price (e.g. multiple split orders placed at identical stop)
    // We pick the earliest order as the primary matched order
    eligibleGroups.sort((a, b) => a.firstRow.mom.valueOf() - b.firstRow.mom.valueOf());
    const primary = eligibleGroups[0];
    const modifications = primary.rows.map((r) => ({
      stopPrice: r.stopPriceDecimal.toNumber(),
      modifiedAt: r.mom.toDate(),
      orderId: r.orderId,
      orderType: r.row.orderType,
      reason: r.row.message,
    }));

    return {
      source: 'BROKER_ORDERBOOK',
      initialStop: primary.initialStopPrice.toNumber(),
      matchedOrderId: primary.orderId,
      finalStatus: primary.finalStatus,
      confidence: 'HIGH',
      candidates,
      orderModifications: modifications,
    };
  }

  // Multiple candidate groups with conflicting stops -> AMBIGUOUS
  const candidateIds = eligibleGroups.map((g) => `${g.orderId} (SL: ${g.initialStopPrice.toNumber()})`).join(', ');
  return {
    source: 'BROKER_ORDERBOOK',
    confidence: 'AMBIGUOUS',
    candidates,
    ambiguityReason: `Ambiguous SL candidates found: ${candidateIds}`,
  };
}
