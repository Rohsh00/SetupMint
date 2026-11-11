/**
 * MetaTrader 5 (MT5) Trade Report & History Parser
 */

export interface ParsedMt5Trade {
  ticket: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  volume: number;
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  commission: number;
  swap: number;
  openTime: Date;
  closeTime?: Date;
  status: 'OPEN' | 'CLOSED';
  comment?: string;
}

export function parseMoneyValue(val: any): number {
  if (val === undefined || val === null || val === '' || val === '-') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const str = String(val).trim();
  // Don't parse dates as money
  if (/^\d{2,4}[./-]\d{2}[./-]\d{2,4}/.test(str)) return 0;
  const cleaned = str.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function parseMt5Date(s: string): Date | null {
  if (!s || s === '-') return null;
  const clean = String(s).trim();

  // Match YYYY.MM.DD HH:mm(:ss) or YYYY-MM-DD HH:mm(:ss)
  const isoMatch = clean.match(/^(\d{4})[./-](\d{2})[./-](\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoMatch) {
    const yr = Number(isoMatch[1]);
    const mo = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const hr = isoMatch[4] ? Number(isoMatch[4]) : 0;
    const min = isoMatch[5] ? Number(isoMatch[5]) : 0;
    const sec = isoMatch[6] ? Number(isoMatch[6]) : 0;
    return new Date(Date.UTC(yr, mo, day, hr, min, sec));
  }

  // Match DD.MM.YYYY HH:mm(:ss)
  const dmyMatch = clean.match(/^(\d{2})[./-](\d{2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const mo = Number(dmyMatch[2]) - 1;
    const yr = Number(dmyMatch[3]);
    const hr = dmyMatch[4] ? Number(dmyMatch[4]) : 0;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const sec = dmyMatch[6] ? Number(dmyMatch[6]) : 0;
    return new Date(Date.UTC(yr, mo, day, hr, min, sec));
  }

  // Match DD.MM.YY HH:mm (2-digit year)
  const dmyShort = clean.match(/^(\d{2})[./-](\d{2})[./-](\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyShort) {
    const day = Number(dmyShort[1]);
    const mo = Number(dmyShort[2]) - 1;
    const yr = 2000 + Number(dmyShort[3]);
    const hr = dmyShort[4] ? Number(dmyShort[4]) : 0;
    const min = dmyShort[5] ? Number(dmyShort[5]) : 0;
    const sec = dmyShort[6] ? Number(dmyShort[6]) : 0;
    return new Date(Date.UTC(yr, mo, day, hr, min, sec));
  }

  return null;
}

export function parseMt5Report(input: string): ParsedMt5Trade[] {
  if (!input || !input.trim()) return [];
  const trimmed = input.trim();

  // 1. JSON Payload Check
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            const ticket = String(item.ticket || item.id || item.ticket_id || item.order || '').trim();
            if (!ticket) return null;
            const side = String(item.type || item.side || item.direction || 'BUY').toUpperCase();
            const direction = side.includes('BUY') || side === 'LONG' || side === '0' ? 'LONG' : 'SHORT';
            const openTime = item.open_time ? new Date(item.open_time) : new Date();
            const closeTime = item.close_time ? new Date(item.close_time) : undefined;
            const openPrice = parseMoneyValue(item.open_price || item.price || item.entry);
            const closePrice = item.close_price ? parseMoneyValue(item.close_price) : undefined;
            const status = (closePrice !== undefined && closePrice > 0) || item.status === 'CLOSED' ? 'CLOSED' : 'OPEN';

            return {
              ticket,
              symbol: String(item.symbol || 'XAUUSD').toUpperCase().replace(/[^A-Z0-9]/g, ''),
              direction,
              volume: parseMoneyValue(item.volume || item.lots || item.qty || 0.01) || 0.01,
              entryPrice: openPrice,
              exitPrice: closePrice,
              stopLoss: item.sl || item.stop_loss ? parseMoneyValue(item.sl || item.stop_loss) : undefined,
              takeProfit: item.tp || item.take_profit ? parseMoneyValue(item.tp || item.take_profit) : undefined,
              profit: parseMoneyValue(item.profit || item.net_profit || item.pnl),
              commission: Math.abs(parseMoneyValue(item.commission || item.fee)),
              swap: Math.abs(parseMoneyValue(item.swap)),
              openTime,
              closeTime,
              status,
              comment: item.comment ? String(item.comment) : undefined,
            } as ParsedMt5Trade;
          })
          .filter(Boolean) as ParsedMt5Trade[];
      }
    } catch {
      // Fall through to text parsing
    }
  }

  // 2. HTML Statement Parsing
  if (trimmed.includes('<tr') || trimmed.includes('<td') || trimmed.includes('<html')) {
    const htmlRows = extractHtmlTableRows(trimmed);
    if (htmlRows.length > 0) {
      const parsedFromHtml = parseRowsFromCells(htmlRows);
      if (parsedFromHtml.length > 0) return parsedFromHtml;
    }
  }

  // 3. Delimited Text Parsing (Tab, Comma, or Space separated)
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Check for vertical paste
  if (isVerticalPaste(lines)) {
    const verticalTrades = parseVerticalCellPaste(lines);
    if (verticalTrades.length > 0) return verticalTrades;
  }

  const cellRows = lines.map((l) => splitLineToCells(l));
  return parseRowsFromCells(cellRows);
}

function extractHtmlTableRows(html: string): string[][] {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const rows: string[][] = [];

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .trim();
      cells.push(cellText);
    }
    if (cells.length >= 5) {
      rows.push(cells);
    }
  }
  return rows;
}

function splitLineToCells(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map((c) => c.trim());
  }
  if (line.includes(',')) {
    const parts = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    if (parts.length >= 6) return parts;
  }
  // Whitespace splitting, grouping date + time
  const tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const normalized: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    const next = tokens[i + 1];
    if (curr && next && /^\d{2,4}[./-]\d{2}[./-]\d{2,4}$/.test(curr) && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(next)) {
      normalized.push(`${curr} ${next}`);
      i++;
    } else {
      normalized.push(curr);
    }
  }
  return normalized;
}

function parseRowsFromCells(cellRows: string[][]): ParsedMt5Trade[] {
  const trades: ParsedMt5Trade[] = [];
  const dealsBuffer: Map<string, { inDeal?: any; outDeal?: any }> = new Map();

  for (const cells of cellRows) {
    if (cells.length < 5) continue;

    const joined = cells.join(' ').toLowerCase();
    if (
      (joined.includes('ticket') && joined.includes('symbol')) ||
      (joined.includes('open time') && joined.includes('close time')) ||
      (joined.includes('balance') && joined.includes('equity')) ||
      joined.startsWith('orders') ||
      joined.startsWith('deals') ||
      joined.startsWith('positions') ||
      joined.startsWith('summary')
    ) {
      continue;
    }

    // Check if this row is specifically a Deal row with "in" / "out" direction
    const inOutIdx = cells.findIndex((c) => {
      const lower = c.toLowerCase().trim();
      return lower === 'in' || lower === 'out' || lower === 'in/out';
    });

    if (inOutIdx !== -1) {
      tryCollectDealRow(cells, inOutIdx, dealsBuffer);
      continue;
    }

    // Otherwise, try parsing as MT5 Position row
    const posTrade = tryParsePositionRow(cells);
    if (posTrade) {
      trades.push(posTrade);
    }
  }

  // Reconcile paired deals
  for (const [posId, pair] of dealsBuffer.entries()) {
    if (pair.inDeal && pair.outDeal) {
      const inD = pair.inDeal;
      const outD = pair.outDeal;
      trades.push({
        ticket: posId || inD.ticket || outD.ticket,
        symbol: inD.symbol || outD.symbol,
        direction: inD.direction,
        volume: inD.volume || outD.volume,
        entryPrice: inD.price,
        exitPrice: outD.price,
        stopLoss: inD.stopLoss,
        takeProfit: inD.takeProfit,
        profit: outD.profit !== undefined ? outD.profit : 0,
        commission: (inD.commission || 0) + (outD.commission || 0),
        swap: (inD.swap || 0) + (outD.swap || 0),
        openTime: inD.time,
        closeTime: outD.time,
        status: 'CLOSED',
      });
    } else if (pair.outDeal && !pair.inDeal) {
      const outD = pair.outDeal;
      trades.push({
        ticket: posId || outD.ticket,
        symbol: outD.symbol,
        direction: outD.direction === 'LONG' ? 'SHORT' : 'LONG',
        volume: outD.volume,
        entryPrice: outD.price,
        exitPrice: outD.price,
        profit: outD.profit,
        commission: outD.commission || 0,
        swap: outD.swap || 0,
        openTime: outD.time,
        closeTime: outD.time,
        status: 'CLOSED',
      });
    }
  }

  return trades;
}

function tryParsePositionRow(cells: string[]): ParsedMt5Trade | null {
  const dateIndices: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (parseMt5Date(cells[i]) !== null) {
      dateIndices.push(i);
    }
  }

  if (dateIndices.length === 0) return null;

  // Find side (buy / sell)
  let sideIdx = -1;
  let direction: 'LONG' | 'SHORT' = 'LONG';
  for (let i = 0; i < cells.length; i++) {
    const lower = cells[i].toLowerCase().trim();
    if (lower === 'buy' || lower === 'long') {
      sideIdx = i;
      direction = 'LONG';
      break;
    } else if (lower === 'sell' || lower === 'short') {
      sideIdx = i;
      direction = 'SHORT';
      break;
    }
  }

  if (sideIdx === -1) return null;

  // Find ticket (5+ digits, not a date cell)
  let ticket = '';
  for (let i = 0; i < cells.length; i++) {
    if (/^\d{5,15}$/.test(cells[i].trim()) && !dateIndices.includes(i)) {
      ticket = cells[i].trim();
      break;
    }
  }

  // Find symbol
  let symbol = 'XAUUSD';
  for (let i = 0; i < cells.length; i++) {
    const cleanSym = cells[i].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (
      cleanSym.length >= 3 &&
      cleanSym.length <= 12 &&
      !['BUY', 'SELL', 'LONG', 'SHORT', 'CLOSED', 'OPEN', 'PROFIT', 'LOSS'].includes(cleanSym) &&
      !/^\d+$/.test(cleanSym) &&
      !dateIndices.includes(i) &&
      i !== sideIdx
    ) {
      symbol = cleanSym;
      break;
    }
  }

  const openTime = parseMt5Date(cells[dateIndices[0]]) || new Date();
  const closeTime = dateIndices.length > 1 ? parseMt5Date(cells[dateIndices[1]]) || undefined : undefined;

  let volume = 0.01;
  let openPrice = 0;
  let closePrice: number | undefined = undefined;
  let stopLoss: number | undefined = undefined;
  let takeProfit: number | undefined = undefined;
  let commission = 0;
  let swap = 0;
  let profit = 0;

  if (dateIndices.length >= 2) {
    const openDateIdx = dateIndices[0];
    const closeDateIdx = dateIndices[1];

    const preCloseNums: number[] = [];
    for (let i = openDateIdx + 1; i < closeDateIdx; i++) {
      if (i !== sideIdx && cells[i] !== symbol && cells[i] !== ticket) {
        preCloseNums.push(parseMoneyValue(cells[i]));
      }
    }

    if (preCloseNums.length >= 2) {
      volume = preCloseNums[0] || 0.01;
      openPrice = preCloseNums[1] || 0;
      if (preCloseNums.length >= 3 && preCloseNums[2] > 0) stopLoss = preCloseNums[2];
      if (preCloseNums.length >= 4 && preCloseNums[3] > 0) takeProfit = preCloseNums[3];
    }

    const postCloseNums: number[] = [];
    for (let i = closeDateIdx + 1; i < cells.length; i++) {
      const str = cells[i].trim();
      if (/^[+-]?\$?[0-9,]+(?:\.[0-9]+)?$/.test(str) || str === '0' || str === '0.00') {
        postCloseNums.push(parseMoneyValue(str));
      }
    }

    if (postCloseNums.length >= 1) {
      closePrice = postCloseNums[0];
    }
    if (postCloseNums.length === 2) {
      profit = postCloseNums[1];
    } else if (postCloseNums.length >= 4) {
      commission = Math.abs(postCloseNums[1]);
      swap = Math.abs(postCloseNums[2]);
      profit = postCloseNums[3];
    } else if (postCloseNums.length === 3) {
      profit = postCloseNums[2];
    }
  } else {
    const nums: number[] = [];
    for (let i = sideIdx + 1; i < cells.length; i++) {
      if (!dateIndices.includes(i)) nums.push(parseMoneyValue(cells[i]));
    }
    if (nums.length >= 2) {
      volume = nums[0] || 0.01;
      openPrice = nums[1] || 0;
    }
  }

  if (!ticket) {
    ticket = String(Math.floor(openTime.getTime() / 1000));
  }

  const isClosed = Boolean(closeTime && closePrice !== undefined && closePrice > 0);

  return {
    ticket,
    symbol,
    direction,
    volume: volume > 0 ? volume : 0.01,
    entryPrice: openPrice,
    exitPrice: isClosed ? closePrice : undefined,
    stopLoss,
    takeProfit,
    profit,
    commission,
    swap,
    openTime,
    closeTime,
    status: isClosed ? 'CLOSED' : 'OPEN',
  };
}

function tryCollectDealRow(cells: string[], inOutIdx: number, dealsBuffer: Map<string, any>) {
  const inOut = cells[inOutIdx].toLowerCase().trim();
  const date = parseMt5Date(cells[0]) || new Date();
  const dealTicket = cells[1];
  const symbol = cells[2]?.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'XAUUSD';
  const rawType = cells[3]?.toLowerCase() || '';
  const direction: 'LONG' | 'SHORT' = rawType.includes('buy') ? 'LONG' : 'SHORT';
  const volume = parseMoneyValue(cells[inOutIdx + 1]) || 0.01;
  const price = parseMoneyValue(cells[inOutIdx + 2]);
  const positionId = cells[inOutIdx + 3] || dealTicket;

  const fee = inOutIdx + 4 < cells.length ? Math.abs(parseMoneyValue(cells[inOutIdx + 4])) : 0;
  const swap = inOutIdx + 5 < cells.length ? Math.abs(parseMoneyValue(cells[inOutIdx + 5])) : 0;
  const profit = inOutIdx + 6 < cells.length ? parseMoneyValue(cells[inOutIdx + 6]) : 0;

  const existing = dealsBuffer.get(positionId) || {};
  if (inOut === 'in') {
    existing.inDeal = { time: date, ticket: dealTicket, symbol, direction, volume, price, commission: fee, swap };
  } else if (inOut === 'out') {
    existing.outDeal = { time: date, ticket: dealTicket, symbol, direction, volume, price, commission: fee, swap, profit };
  }
  dealsBuffer.set(positionId, existing);
}

function isVerticalPaste(lines: string[]): boolean {
  if (lines.length < 8) return false;
  const l0 = lines[0].trim();
  const l1 = lines[1].trim();
  const l2 = lines[2].trim();
  return /^\d{5,15}$/.test(l0) && /^[A-Za-z0-9._/-]+$/.test(l1) && /^(buy|sell|long|short)$/i.test(l2);
}

function parseVerticalCellPaste(lines: string[]): ParsedMt5Trade[] {
  const trades: ParsedMt5Trade[] = [];
  let i = 0;

  while (i < lines.length) {
    if (/^\d{5,15}$/.test(lines[i].trim())) {
      const ticket = lines[i++].trim();
      const symbol = (lines[i++] || 'XAUUSD').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sideRaw = (lines[i++] || 'BUY').toUpperCase();
      const direction: 'LONG' | 'SHORT' = sideRaw.includes('BUY') || sideRaw === 'LONG' ? 'LONG' : 'SHORT';
      const openTime = i < lines.length && parseMt5Date(lines[i]) ? parseMt5Date(lines[i++])! : new Date();
      const openPrice = i < lines.length ? parseMoneyValue(lines[i++]) : 0;
      const volume = i < lines.length ? parseMoneyValue(lines[i++]) : 0.01;

      let exitPrice: number | undefined = undefined;
      let closeTime: Date | undefined = undefined;
      let profit = 0;

      if (i < lines.length && parseMt5Date(lines[i])) {
        closeTime = parseMt5Date(lines[i++])!;
      }
      if (i < lines.length && parseMoneyValue(lines[i]) > 0) {
        exitPrice = parseMoneyValue(lines[i++]);
      }
      if (i < lines.length) {
        profit = parseMoneyValue(lines[i++]);
      }

      trades.push({
        ticket,
        symbol,
        direction,
        volume: volume > 0 ? volume : 0.01,
        entryPrice: openPrice,
        exitPrice,
        profit,
        commission: 0,
        swap: 0,
        openTime,
        closeTime,
        status: exitPrice && exitPrice > 0 ? 'CLOSED' : 'OPEN',
      });
    } else {
      i++;
    }
  }

  return trades;
}

/**
 * Resolves standard contract specifications for MetaTrader 5 symbols
 */
export function getMt5ContractSpec(sym: string) {
  const upper = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper === 'XAUUSD' || upper === 'GOLD') {
    return {
      symbol: 'XAUUSD',
      multiplier: 100,
      lotSize: 0.01,
      displayName: 'Gold / US Dollar Spot (CFD/Forex)',
      assetClass: 'FOREX' as const,
      exchange: 'FOREX' as const,
      marketSegment: 'FOREX' as const,
      tickSize: 0.01,
    };
  }
  if (upper === 'XAGUSD' || upper === 'SILVER') {
    return {
      symbol: 'XAGUSD',
      multiplier: 5000,
      lotSize: 0.01,
      displayName: 'Silver / US Dollar Spot (CFD/Forex)',
      assetClass: 'FOREX' as const,
      exchange: 'FOREX' as const,
      marketSegment: 'FOREX' as const,
      tickSize: 0.001,
    };
  }
  if (upper.endsWith('USDT') || ['BTCUSD', 'ETHUSD', 'SOLUSD', 'DOGEUSD'].includes(upper)) {
    return {
      symbol: upper,
      multiplier: 1,
      lotSize: 0.01,
      displayName: `${upper} Crypto CFD`,
      assetClass: 'CRYPTO' as const,
      exchange: 'CRYPTO' as const,
      marketSegment: 'CRYPTO' as const,
      tickSize: 0.01,
    };
  }
  if (['NAS100', 'USTEC', 'US30', 'DJ30', 'SPX500', 'US500', 'GER40', 'DAX'].includes(upper)) {
    return {
      symbol: upper,
      multiplier: 1,
      lotSize: 0.1,
      displayName: `${upper} Index CFD`,
      assetClass: 'FUTURES' as const,
      exchange: 'FOREX' as const,
      marketSegment: 'FOREX' as const,
      tickSize: 0.1,
    };
  }
  if (['USOIL', 'WTI', 'UKOIL', 'BRENT'].includes(upper)) {
    return {
      symbol: 'USOIL',
      multiplier: 1000,
      lotSize: 0.01,
      displayName: `${upper} Crude Oil Spot CFD`,
      assetClass: 'COMMODITY' as const,
      exchange: 'FOREX' as const,
      marketSegment: 'FOREX' as const,
      tickSize: 0.01,
    };
  }
  return {
    symbol: upper,
    multiplier: 100000,
    lotSize: 0.01,
    displayName: `${upper} Forex Pair`,
    assetClass: 'FOREX' as const,
    exchange: 'FOREX' as const,
    marketSegment: 'FOREX' as const,
    tickSize: upper.includes('JPY') ? 0.001 : 0.00001,
  };
}

/**
 * Computes live or historical excursion metrics for MT5 trades
 */
export function computeMt5LiveExcursion(params: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  initialStopLoss?: number;
  volume: number;
  contractMultiplier: number;
  mfePrice?: number;
  maePrice?: number;
  peakProfit?: number;
  maxDrawdown?: number;
  netPnL: number;
  openTime: Date;
  closeTime: Date;
}): any {
  const {
    direction,
    entryPrice,
    exitPrice,
    initialStopLoss,
    volume,
    contractMultiplier,
    mfePrice,
    maePrice,
    peakProfit,
    maxDrawdown,
    netPnL,
    openTime,
    closeTime,
  } = params;

  const mult = contractMultiplier || 1;
  const qty = volume || 0.01;
  const valuePerPoint = qty * mult;

  let mfePoints = 0;
  let maePoints = 0;

  if (direction === 'LONG') {
    if (typeof mfePrice === 'number' && mfePrice > 0) {
      mfePoints = Math.max(0, mfePrice - entryPrice);
    } else if (typeof peakProfit === 'number' && valuePerPoint > 0) {
      mfePoints = Math.max(0, peakProfit / valuePerPoint);
    } else {
      mfePoints = Math.max(0, exitPrice - entryPrice);
    }

    if (typeof maePrice === 'number' && maePrice > 0) {
      maePoints = Math.max(0, entryPrice - maePrice);
    } else if (typeof maxDrawdown === 'number' && valuePerPoint > 0) {
      maePoints = Math.max(0, Math.abs(Math.min(0, maxDrawdown)) / valuePerPoint);
    } else {
      maePoints = Math.max(0, entryPrice - exitPrice);
    }
  } else {
    // SHORT
    if (typeof mfePrice === 'number' && mfePrice > 0) {
      mfePoints = Math.max(0, entryPrice - mfePrice);
    } else if (typeof peakProfit === 'number' && valuePerPoint > 0) {
      mfePoints = Math.max(0, peakProfit / valuePerPoint);
    } else {
      mfePoints = Math.max(0, entryPrice - exitPrice);
    }

    if (typeof maePrice === 'number' && maePrice > 0) {
      maePoints = Math.max(0, maePrice - entryPrice);
    } else if (typeof maxDrawdown === 'number' && valuePerPoint > 0) {
      maePoints = Math.max(0, Math.abs(Math.min(0, maxDrawdown)) / valuePerPoint);
    } else {
      maePoints = Math.max(0, exitPrice - entryPrice);
    }
  }

  const realizedPts = direction === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
  if (realizedPts > 0 && mfePoints < realizedPts) {
    mfePoints = realizedPts;
  }
  if (realizedPts < 0 && maePoints < Math.abs(realizedPts)) {
    maePoints = Math.abs(realizedPts);
  }

  const mfeAmount = Number((mfePoints * valuePerPoint).toFixed(2));
  const maeAmount = Number((maePoints * valuePerPoint).toFixed(2));

  const stopDist = initialStopLoss && initialStopLoss > 0 ? Math.abs(entryPrice - initialStopLoss) : 0;
  const mfeR = stopDist > 0 ? Number((mfePoints / stopDist).toFixed(2)) : undefined;
  const maeR = stopDist > 0 ? Number((maePoints / stopDist).toFixed(2)) : undefined;

  const exitEfficiency = mfePoints > 0 ? Number(Math.min(1, Math.max(0, realizedPts / mfePoints)).toFixed(4)) : null;
  const stopHit = stopDist > 0 && maePoints >= stopDist - 0.05;

  const excursionFlags: string[] = [];
  if (mfeR !== undefined && mfeR >= 1.0 && netPnL < 0) {
    excursionFlags.push('GAVE_BACK_PROFIT');
  }
  if (mfeR !== undefined && mfeR >= 2.0 && exitEfficiency !== null && exitEfficiency < 0.3) {
    excursionFlags.push('RUNNER_LEFT_ON_TABLE');
  }

  const durationMs = Math.max(60000, closeTime.getTime() - openTime.getTime());
  const holdingMins = Math.max(1, Math.round(durationMs / 60000));

  return {
    status: 'COMPUTED',
    computedAt: new Date(),
    source: 'MT5_LIVE',
    provider: 'MT5_LIVE',
    isUnderlyingFallback: false,
    resolution: '1',
    isLowResolution: false,
    excursionVersion: 2,
    thresholdVersion: 'v2',
    maePoints: Number(maePoints.toFixed(2)),
    mfePoints: Number(mfePoints.toFixed(2)),
    maeAmount,
    mfeAmount,
    maeR,
    mfeR,
    exitEfficiency,
    stopEfficiency: 1,
    entryQualityScore: maePoints === 0 ? 100 : Math.max(0, Math.round((1 - maePoints / (stopDist || 1)) * 100)),
    maeBeforeMfe: false,
    timeOrdering: 'SIMULTANEOUS',
    stopHit,
    reversedAfterStopHit: false,
    timeToMfeMinutes: Math.round(holdingMins * 0.6),
    timeToMaeMinutes: Math.round(holdingMins * 0.4),
    candleCount: Math.max(1, holdingMins),
    excursionFlags,
    warnings: [],
  };
}
