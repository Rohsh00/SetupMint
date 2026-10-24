import crypto from 'crypto';
import mongoose from 'mongoose';
import moment from 'moment';
import { Trade, Attachment, TradeCandleSnapshot, IAttachmentDoc } from '../db/models/index.js';
import { getStorage } from '../storage/index.js';
import { ITradeCandle } from '@tradevault/shared';

export interface ChartGeneratorOptions {
  width?: number;
  height?: number;
  theme?: 'dark' | 'light';
  resolution?: string;
}

export class ChartGeneratorService {
  /**
   * Generates a sleek, high-fidelity dark mode TradingView-style SVG candlestick chart
   * with complete trade execution markers (Entry, Exit, Stop Loss, Target, MAE/MFE).
   */
  static generateChartSvg(
    candles: ITradeCandle[],
    trade: any,
    options: ChartGeneratorOptions = {}
  ): string {
    const width = options.width || 960;
    const height = options.height || 520;
    const resolution = options.resolution || '5';

    // SVG Canvas margins
    const marginTop = 70;
    const marginRight = 90;
    const marginBottom = 50;
    const marginLeft = 20;

    const plotX0 = marginLeft;
    const plotY0 = marginTop;
    const plotX1 = width - marginRight;
    const plotY1 = height - marginBottom;
    const plotWidth = plotX1 - plotX0;
    const plotHeight = plotY1 - plotY0;

    // Normalization & sorting of candles
    const sortedCandles = [...candles].sort((a, b) => {
      const aMs = a.t > 1e11 ? a.t : a.t * 1000;
      const bMs = b.t > 1e11 ? b.t : b.t * 1000;
      return aMs - bMs;
    });

    if (sortedCandles.length === 0) {
      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#0b0f19" rx="8" />
  <text x="${width / 2}" y="${height / 2}" font-family="system-ui, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">
    No historical candlestick data available for chart generation
  </text>
</svg>`;
    }

    // Trade execution points
    const entryPrice = Number(
      trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? trade.entryPrice ?? 0
    );
    const exitPrice = Number(
      trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice ?? trade.exitPrice ?? 0
    );
    const stopLoss = trade.risk?.initialStopLoss ? Number(trade.risk.initialStopLoss) : undefined;
    const target = trade.risk?.plannedTarget ? Number(trade.risk.plannedTarget) : undefined;
    const direction = trade.direction || 'LONG';
    const netPnl = Number(trade.calculated?.netPnl ?? trade.netPnl ?? 0);
    const rMultiple = trade.calculated?.realizedR !== undefined ? Number(trade.calculated.realizedR) : undefined;
    const excursion = trade.calculated?.excursion;

    // Calculate vertical price scaling bounds
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const c of sortedCandles) {
      if (c.l < minPrice) minPrice = c.l;
      if (c.h > maxPrice) maxPrice = c.h;
    }

    if (entryPrice > 0) {
      if (entryPrice < minPrice) minPrice = entryPrice;
      if (entryPrice > maxPrice) maxPrice = entryPrice;
    }
    if (exitPrice > 0) {
      if (exitPrice < minPrice) minPrice = exitPrice;
      if (exitPrice > maxPrice) maxPrice = exitPrice;
    }
    if (stopLoss && stopLoss > 0) {
      if (stopLoss < minPrice) minPrice = stopLoss;
      if (stopLoss > maxPrice) maxPrice = stopLoss;
    }
    if (target && target > 0) {
      if (target < minPrice) minPrice = target;
      if (target > maxPrice) maxPrice = target;
    }

    if (minPrice === Infinity || maxPrice === -Infinity || minPrice === maxPrice) {
      minPrice = (entryPrice || 100) * 0.95;
      maxPrice = (entryPrice || 100) * 1.05;
    }

    const priceSpan = maxPrice - minPrice;
    const pricePadding = priceSpan > 0 ? priceSpan * 0.08 : maxPrice * 0.05;
    const yMinPrice = minPrice - pricePadding;
    const yMaxPrice = maxPrice + pricePadding;

    const priceToY = (price: number): number => {
      const clamped = Math.max(yMinPrice, Math.min(yMaxPrice, price));
      const ratio = (yMaxPrice - clamped) / (yMaxPrice - yMinPrice);
      return plotY0 + ratio * plotHeight;
    };

    // Horizontal Price Gridlines (5 levels)
    const priceTicksCount = 5;
    let priceGridSvg = '';
    for (let i = 0; i < priceTicksCount; i++) {
      const tickPrice = yMinPrice + ((yMaxPrice - yMinPrice) / (priceTicksCount - 1)) * i;
      const y = priceToY(tickPrice);
      const formattedPrice = tickPrice.toFixed(tickPrice < 10 ? 3 : tickPrice < 1000 ? 2 : 1);

      priceGridSvg += `
    <line x1="${plotX0}" y1="${y}" x2="${plotX1}" y2="${y}" stroke="#1e293b" stroke-width="1" stroke-dasharray="3,3" />
    <text x="${plotX1 + 10}" y="${y + 4}" font-family="'JetBrains Mono', monospace" font-size="10" fill="#64748b">${formattedPrice}</text>`;
    }

    // Candle step & dynamic bar width
    const candleCount = sortedCandles.length;
    const stepX = plotWidth / candleCount;
    const barWidth = Math.max(2, Math.min(22, stepX * 0.72));

    // Time Milestones (vertical lines & time ticks on bottom)
    let timeGridSvg = '';
    const timeTickInterval = Math.max(1, Math.floor(candleCount / 6));
    for (let i = 0; i < candleCount; i += timeTickInterval) {
      const c = sortedCandles[i];
      const cx = plotX0 + (i + 0.5) * stepX;
      const tMs = c.t > 1e11 ? c.t : c.t * 1000;
      const timeLabel = moment(tMs).format('HH:mm');

      timeGridSvg += `
    <line x1="${cx}" y1="${plotY0}" x2="${cx}" y2="${plotY1}" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,4" />
    <text x="${cx}" y="${plotY1 + 20}" font-family="'JetBrains Mono', monospace" font-size="10" fill="#64748b" text-anchor="middle">${timeLabel}</text>`;
    }

    // Render Candlesticks
    let candlesSvg = '';
    for (let i = 0; i < candleCount; i++) {
      const c = sortedCandles[i];
      const cx = plotX0 + (i + 0.5) * stepX;
      const isBullish = c.c >= c.o;
      const color = isBullish ? '#10b981' : '#f43f5e';

      const yHigh = priceToY(c.h);
      const yLow = priceToY(c.l);
      const yOpen = priceToY(c.o);
      const yClose = priceToY(c.c);

      const bodyY = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

      candlesSvg += `
    <!-- Candle ${i} -->
    <line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="1.2" />
    <rect x="${cx - barWidth / 2}" y="${bodyY}" width="${barWidth}" height="${bodyHeight}" fill="${color}" rx="1" />`;
    }

    // Execution Overlays
    let overlaysSvg = '';

    // Stop Loss Line (Red dashed)
    if (stopLoss && stopLoss > 0) {
      const ySL = priceToY(stopLoss);
      overlaysSvg += `
    <line x1="${plotX0}" y1="${ySL}" x2="${plotX1}" y2="${ySL}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5,4" />
    <rect x="${plotX1 + 6}" y="${ySL - 10}" width="78" height="20" rx="3" fill="#ef4444" fill-opacity="0.2" stroke="#ef4444" stroke-width="1" />
    <text x="${plotX1 + 45}" y="${ySL + 4}" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#ef4444" text-anchor="middle">SL: ${stopLoss.toFixed(1)}</text>`;
    }

    // Target Line (Green dashed)
    if (target && target > 0) {
      const yTP = priceToY(target);
      overlaysSvg += `
    <line x1="${plotX0}" y1="${yTP}" x2="${plotX1}" y2="${yTP}" stroke="#10b981" stroke-width="1.5" stroke-dasharray="5,4" />
    <rect x="${plotX1 + 6}" y="${yTP - 10}" width="78" height="20" rx="3" fill="#10b981" fill-opacity="0.2" stroke="#10b981" stroke-width="1" />
    <text x="${plotX1 + 45}" y="${yTP + 4}" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#10b981" text-anchor="middle">TP: ${target.toFixed(1)}</text>`;
    }

    // Entry Line (Cyan / Sky)
    if (entryPrice > 0) {
      const yEntry = priceToY(entryPrice);
      overlaysSvg += `
    <line x1="${plotX0}" y1="${yEntry}" x2="${plotX1}" y2="${yEntry}" stroke="#0ea5e9" stroke-width="1.5" stroke-dasharray="4,2" />
    <rect x="${plotX1 + 6}" y="${yEntry - 10}" width="78" height="20" rx="3" fill="#0284c7" />
    <text x="${plotX1 + 45}" y="${yEntry + 4}" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">ENT: ${entryPrice.toFixed(1)}</text>`;
    }

    // Exit Line (Purple / Violet)
    if (exitPrice > 0) {
      const yExit = priceToY(exitPrice);
      overlaysSvg += `
    <line x1="${plotX0}" y1="${yExit}" x2="${plotX1}" y2="${yExit}" stroke="#8b5cf6" stroke-width="1.5" stroke-dasharray="4,2" />
    <rect x="${plotX1 + 6}" y="${yExit - 10}" width="78" height="20" rx="3" fill="#7c3aed" />
    <text x="${plotX1 + 45}" y="${yExit + 4}" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">EXIT: ${exitPrice.toFixed(1)}</text>`;
    }

    // Identify entry and exit candle indices to draw pinpoint markers
    const entryMs = trade.entryTime ? moment(trade.entryTime).valueOf() : null;
    const exitMs = trade.exitTime ? moment(trade.exitTime).valueOf() : null;

    let closestEntryIdx = -1;
    let minEntryDiff = Infinity;
    let closestExitIdx = -1;
    let minExitDiff = Infinity;

    if (entryMs !== null || exitMs !== null) {
      for (let i = 0; i < candleCount; i++) {
        const c = sortedCandles[i];
        const tMs = c.t > 1e11 ? c.t : c.t * 1000;
        if (entryMs !== null) {
          const diff = Math.abs(tMs - entryMs);
          if (diff < minEntryDiff) {
            minEntryDiff = diff;
            closestEntryIdx = i;
          }
        }
        if (exitMs !== null) {
          const diff = Math.abs(tMs - exitMs);
          if (diff < minExitDiff) {
            minExitDiff = diff;
            closestExitIdx = i;
          }
        }
      }
    }

    // Entry Marker Badge on specific candle
    if (closestEntryIdx !== -1 && entryPrice > 0) {
      const c = sortedCandles[closestEntryIdx];
      const cx = plotX0 + (closestEntryIdx + 0.5) * stepX;
      const isLong = direction === 'LONG';
      const anchorY = isLong ? priceToY(c.l) + 16 : priceToY(c.h) - 16;
      const arrowY = isLong ? anchorY - 6 : anchorY + 6;
      const badgeColor = isLong ? '#10b981' : '#f43f5e';
      const label = `${isLong ? '▲ BUY' : '▼ SELL'} @ ${entryPrice.toFixed(1)}`;

      overlaysSvg += `
    <!-- Entry Marker -->
    <circle cx="${cx}" cy="${priceToY(entryPrice)}" r="4" fill="#0ea5e9" stroke="#ffffff" stroke-width="1.5" />
    <rect x="${cx - 40}" y="${anchorY - 9}" width="80" height="18" rx="4" fill="#0f172a" stroke="${badgeColor}" stroke-width="1.5" />
    <text x="${cx}" y="${anchorY + 4}" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="700" fill="${badgeColor}" text-anchor="middle">${label}</text>`;
    }

    // Exit Marker Badge on specific candle
    if (closestExitIdx !== -1 && exitPrice > 0) {
      const c = sortedCandles[closestExitIdx];
      const cx = plotX0 + (closestExitIdx + 0.5) * stepX;
      const isProfitable = netPnl >= 0;
      const exitBadgeColor = isProfitable ? '#10b981' : '#f43f5e';
      const anchorY = priceToY(c.h) - 18;
      const label = `✕ EXIT @ ${exitPrice.toFixed(1)}`;

      overlaysSvg += `
    <!-- Exit Marker -->
    <circle cx="${cx}" cy="${priceToY(exitPrice)}" r="4" fill="#8b5cf6" stroke="#ffffff" stroke-width="1.5" />
    <rect x="${cx - 40}" y="${anchorY - 9}" width="80" height="18" rx="4" fill="#0f172a" stroke="#8b5cf6" stroke-width="1.5" />
    <text x="${cx}" y="${anchorY + 4}" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="700" fill="#a78bfa" text-anchor="middle">${label}</text>`;
    }

    // Header Content
    const symbolStr = trade.symbol || 'UNKNOWN';
    const dateStr = trade.entryTime ? moment(trade.entryTime).format('DD MMM YYYY, HH:mm') : '';
    const exitDateStr = trade.exitTime ? moment(trade.exitTime).format('HH:mm') : '';
    const timeframeStr = `${resolution}m`;
    const directionColor = direction === 'LONG' ? '#10b981' : '#f43f5e';
    const pnlColor = netPnl >= 0 ? '#10b981' : '#f43f5e';
    const pnlPrefix = netPnl >= 0 ? '+' : '';
    const rMultipleStr = rMultiple !== undefined ? ` (${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R)` : '';
    const pnlLabel = `${pnlPrefix}₹${Math.abs(netPnl).toFixed(2)}${rMultipleStr}`;

    // Excursion HUD Box (if computed)
    let excursionHudSvg = '';
    if (excursion && excursion.status === 'COMPUTED') {
      const mfePts = Number(excursion.mfePoints || 0).toFixed(1);
      const maePts = Number(excursion.maePoints || 0).toFixed(1);
      const mfeRStr = excursion.mfeR !== undefined ? ` (+${Math.abs(Number(excursion.mfeR)).toFixed(1)}R)` : '';
      const maeRStr = excursion.maeR !== undefined ? ` (-${Math.abs(Number(excursion.maeR)).toFixed(1)}R)` : '';
      const effStr = excursion.exitEfficiency !== undefined ? `${(excursion.exitEfficiency * 100).toFixed(0)}%` : 'N/A';

      excursionHudSvg = `
    <!-- Excursion HUD -->
    <rect x="${plotX0 + 8}" y="${plotY0 + 8}" width="280" height="28" rx="5" fill="#0f172a" fill-opacity="0.85" stroke="#334155" stroke-width="1" />
    <text x="${plotX0 + 16}" y="${plotY0 + 26}" font-family="'JetBrains Mono', monospace" font-size="10" fill="#94a3b8">
      <tspan fill="#10b981" font-weight="700">MFE:</tspan> +${mfePts}${mfeRStr}  
      <tspan fill="#f43f5e" font-weight="700">MAE:</tspan> -${maePts}${maeRStr}  
      <tspan fill="#38bdf8" font-weight="700">Eff:</tspan> ${effStr}
    </text>`;
    }

    const watermarkStr = `SetupMint Visual Trade Audit • FYERS API v3 • ${moment().format('YYYY-MM-DD HH:mm:ss')} IST`;

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="chartBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
  </defs>

  <!-- Canvas Background -->
  <rect width="${width}" height="${height}" fill="url(#chartBg)" rx="8" />

  <!-- Chart Border Frame -->
  <rect x="${plotX0}" y="${plotY0}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="#1e293b" stroke-width="1" />

  <!-- Header Section -->
  <text x="${plotX0}" y="34" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="#f8fafc" letter-spacing="-0.02em">
    ${symbolStr}
  </text>
  
  <!-- Timeframe Chip -->
  <rect x="${plotX0 + symbolStr.length * 11 + 10}" y="18" width="38" height="20" rx="4" fill="#1e293b" />
  <text x="${plotX0 + symbolStr.length * 11 + 29}" y="32" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="600" fill="#94a3b8" text-anchor="middle">
    ${timeframeStr}
  </text>

  <!-- Direction Chip -->
  <rect x="${plotX0 + symbolStr.length * 11 + 54}" y="18" width="52" height="20" rx="4" fill="${directionColor}" fill-opacity="0.18" stroke="${directionColor}" stroke-width="1" />
  <text x="${plotX0 + symbolStr.length * 11 + 80}" y="32" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="${directionColor}" text-anchor="middle">
    ${direction}
  </text>

  <!-- Date Range Subheader -->
  <text x="${plotX0}" y="52" font-family="'JetBrains Mono', monospace" font-size="11" fill="#64748b">
    ${dateStr}${exitDateStr ? ` → ${exitDateStr}` : ''}
  </text>

  <!-- PnL Outcome Pill (Top Right) -->
  <rect x="${plotX1 - 130}" y="18" width="130" height="26" rx="5" fill="${pnlColor}" fill-opacity="0.15" stroke="${pnlColor}" stroke-width="1" />
  <text x="${plotX1 - 65}" y="35" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="700" fill="${pnlColor}" text-anchor="middle">
    ${pnlLabel}
  </text>

  <!-- FYERS AUTO CHART Badge -->
  <rect x="${plotX1 - 275}" y="18" width="135" height="26" rx="5" fill="#083344" stroke="#06b6d4" stroke-width="1" />
  <text x="${plotX1 - 207}" y="35" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#22d3ee" text-anchor="middle">
    ⚡ FYERS AUTO CHART
  </text>

  <!-- Price Gridlines -->
  ${priceGridSvg}

  <!-- Time Gridlines -->
  ${timeGridSvg}

  <!-- Candlesticks -->
  ${candlesSvg}

  <!-- Execution Overlays & Levels -->
  ${overlaysSvg}

  <!-- Excursion HUD Box -->
  ${excursionHudSvg}

  <!-- Watermark & Generation Time -->
  <text x="${plotX0}" y="${height - 12}" font-family="'JetBrains Mono', monospace" font-size="10" fill="#475569">
    ${watermarkStr}
  </text>
</svg>`;
  }

  /**
   * Generates an automated SVG execution chart for a closed trade using cached FYERS candles,
   * uploads to Cloudflare R2 / S3 storage, creates an Attachment record with category 'AUTO_CHART',
   * and links it to trade.screenshotIds.
   */
  static async createAndSaveAutoChartForTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: { force?: boolean } = {}
  ): Promise<IAttachmentDoc> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const trade = await Trade.findOne({ _id: tId, userId: uId });
    if (!trade) {
      throw new Error('Trade not found or unauthorized');
    }

    if (trade.status !== 'CLOSED' || !trade.exitTime) {
      throw new Error('Automated execution charts can only be generated for closed trades');
    }

    // Check if an AUTO_CHART attachment already exists for this trade
    const existingAutoChart = await Attachment.findOne({
      userId: uId,
      tradeId: trade._id,
      category: 'AUTO_CHART',
    });

    if (existingAutoChart && !options.force) {
      return existingAutoChart;
    }

    // 1. Retrieve cached candle snapshot
    let snapshot = await TradeCandleSnapshot.findOne({
      userId: uId,
      tradeId: trade._id,
    }).sort({ fetchedAt: -1 });

    // 2. If no snapshot cached, dynamically invoke excursion computation which fetches and caches candles
    if (!snapshot || !snapshot.candles || snapshot.candles.length === 0) {
      const { FyersService } = await import('./fyers.service.js');
      await FyersService.computeExcursionForTrade(trade._id, uId, false);

      snapshot = await TradeCandleSnapshot.findOne({
        userId: uId,
        tradeId: trade._id,
      }).sort({ fetchedAt: -1 });
    }

    if (!snapshot || !snapshot.candles || snapshot.candles.length === 0) {
      throw new Error(
        `Cannot generate automated chart: no historical candles cached or available for ${trade.symbol}`
      );
    }

    // 3. Render clean SVG chart
    const svgString = this.generateChartSvg(snapshot.candles, trade, {
      resolution: snapshot.resolution || '5',
      width: 960,
      height: 520,
    });
    const svgBuffer = Buffer.from(svgString, 'utf-8');

    const storage = getStorage();

    // 4. If replacing an existing chart, remove old object from storage
    if (existingAutoChart) {
      try {
        await storage.delete(existingAutoChart.storedFilename);
      } catch {
        // ignore missing object in storage
      }
      await Attachment.deleteOne({ _id: existingAutoChart._id });
      await Trade.findByIdAndUpdate(trade._id, {
        $pull: { screenshotIds: existingAutoChart._id },
      });
    }

    // 5. Store to Cloudflare R2 / S3
    const safeFilename = `${crypto.randomUUID()}.svg`;
    await storage.save(safeFilename, svgBuffer, 'image/svg+xml');

    // 6. Create Attachment record
    const attachment = await Attachment.create({
      userId: uId,
      tradeId: trade._id,
      originalName: `${trade.symbol}_autochart_${snapshot.resolution}m.svg`,
      storedFilename: safeFilename,
      mimeType: 'image/svg+xml',
      sizeBytes: svgBuffer.length,
      category: 'AUTO_CHART',
      description: `Automated execution chart generated from FYERS ${snapshot.resolution}m historical candles`,
      timeframe: `${snapshot.resolution}m`,
      chartTimestamp: moment(trade.entryTime).toISOString(),
    });

    // 7. Link to trade.screenshotIds
    await Trade.findByIdAndUpdate(trade._id, {
      $addToSet: { screenshotIds: attachment._id },
    });

    return attachment;
  }
}
