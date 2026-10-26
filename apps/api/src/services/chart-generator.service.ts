import crypto from 'crypto';
import mongoose from 'mongoose';
import moment from 'moment';
import { Trade, Attachment, TradeCandleSnapshot, IAttachmentDoc, User } from '../db/models/index.js';
import { getStorage } from '../storage/index.js';
import {
  ITradeCandle,
  CandleProviderName,
  CandleFallbackProvider,
  ChartResolution,
  CHART_RESOLUTIONS,
  CHART_RESOLUTION_LABELS,
  DEFAULT_CHART_PADDING_CANDLES,
  MAX_RENDERED_CANDLES,
  IChartGenerateResult,
} from '@tradevault/shared';
import {
  aggregateCandles,
  selectChartWindow,
  estimateFetchRange,
  resolveSnapshotTimeframes,
} from '@tradevault/financial-engine';
import { MarketDataService } from './market-data/index.js';

export interface ChartGeneratorOptions {
  width?: number;
  height?: number;
  theme?: 'dark' | 'light';
  resolution?: string;
  timeframe?: string;
  provider?: CandleProviderName;
  isUnderlyingFallback?: boolean;
  appliedBefore?: number;
  appliedAfter?: number;
  entryIndex?: number;
  exitIndex?: number;
  strategyName?: string;
}

export interface GenerateChartsOptions {
  force?: boolean;
  provider?: CandleFallbackProvider;
  resolutions?: ChartResolution[];
  paddingBefore?: number;
  paddingAfter?: number;
  settingsSource?: string;
  strategyName?: string;
}

function resolutionOrder(r: string): number {
  const map: Record<string, number> = { '1': 1, '5': 2, '15': 3, '30': 4, '60': 5, '240': 6, 'D': 7 };
  return map[r] || 99;
}

export class ChartGeneratorService {
  /**
   * Generates a sleek, high-fidelity dark mode TradingView-style SVG candlestick chart
   * with complete trade execution markers (Entry, Exit, Stop Loss, Target, MAE/MFE,
   * shaded execution window, and timeframe padding indicator).
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
    const netPnl = Number(trade.calculated?.netPnL ?? trade.calculated?.netPnl ?? trade.netPnl ?? 0);
    const rMultiple = trade.calculated?.realizedRMultiple !== undefined
      ? Number(trade.calculated.realizedRMultiple)
      : trade.calculated?.realizedR !== undefined
      ? Number(trade.calculated.realizedR)
      : undefined;
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
      const timeLabel = resolution === 'D' ? moment(tMs).format('DD MMM') : moment(tMs).format('HH:mm');

      timeGridSvg += `
    <line x1="${cx}" y1="${plotY0}" x2="${cx}" y2="${plotY1}" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,4" />
    <text x="${cx}" y="${plotY1 + 20}" font-family="'JetBrains Mono', monospace" font-size="10" fill="#64748b" text-anchor="middle">${timeLabel}</text>`;
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

    // Identify entry and exit candle indices to draw pinpoint markers and shaded band
    const entryMs = trade.entryTime ? moment(trade.entryTime).valueOf() : null;
    const exitMs = trade.exitTime ? moment(trade.exitTime).valueOf() : null;

    let closestEntryIdx = options.entryIndex !== undefined ? options.entryIndex : -1;
    let closestExitIdx = options.exitIndex !== undefined ? options.exitIndex : -1;

    if (closestEntryIdx === -1 || closestExitIdx === -1) {
      let minEntryDiff = Infinity;
      let minExitDiff = Infinity;

      for (let i = 0; i < candleCount; i++) {
        const c = sortedCandles[i];
        const tMs = c.t > 1e11 ? c.t : c.t * 1000;
        if (entryMs !== null && closestEntryIdx === -1) {
          const diff = Math.abs(tMs - entryMs);
          if (diff < minEntryDiff) {
            minEntryDiff = diff;
            closestEntryIdx = i;
          }
        }
        if (exitMs !== null && closestExitIdx === -1) {
          const diff = Math.abs(tMs - exitMs);
          if (diff < minExitDiff) {
            minExitDiff = diff;
            closestExitIdx = i;
          }
        }
      }
    }

    // Shaded Active Trade Span Band
    let shadedBandSvg = '';
    if (closestEntryIdx !== -1 && closestExitIdx !== -1 && closestExitIdx >= closestEntryIdx) {
      const entryX = plotX0 + (closestEntryIdx + 0.5) * stepX;
      const exitX = plotX0 + (closestExitIdx + 0.5) * stepX;
      const bandX = entryX - barWidth / 2;
      const bandWidth = Math.max(barWidth, exitX - entryX + barWidth);

      shadedBandSvg = `
    <!-- Active Trade Execution Shaded Band -->
    <rect x="${bandX}" y="${plotY0}" width="${bandWidth}" height="${plotHeight}" fill="#0ea5e9" fill-opacity="0.06" stroke="#0ea5e9" stroke-opacity="0.2" stroke-dasharray="3,3" />`;
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

    // Entry Marker Badge on specific candle
    if (closestEntryIdx >= 0 && closestEntryIdx < candleCount && entryPrice > 0) {
      const c = sortedCandles[closestEntryIdx];
      const cx = plotX0 + (closestEntryIdx + 0.5) * stepX;
      const isLong = direction === 'LONG';
      const anchorY = isLong ? priceToY(c.l) + 16 : priceToY(c.h) - 16;
      const badgeColor = isLong ? '#10b981' : '#f43f5e';
      const label = `${isLong ? '▲ BUY' : '▼ SELL'} @ ${entryPrice.toFixed(1)}`;

      overlaysSvg += `
    <!-- Entry Marker -->
    <circle cx="${cx}" cy="${priceToY(entryPrice)}" r="4" fill="#0ea5e9" stroke="#ffffff" stroke-width="1.5" />
    <rect x="${cx - 40}" y="${anchorY - 9}" width="80" height="18" rx="4" fill="#0f172a" stroke="${badgeColor}" stroke-width="1.5" />
    <text x="${cx}" y="${anchorY + 4}" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="700" fill="${badgeColor}" text-anchor="middle">${label}</text>`;
    }

    // Exit Marker Badge on specific candle
    if (closestExitIdx >= 0 && closestExitIdx < candleCount && exitPrice > 0) {
      const c = sortedCandles[closestExitIdx];
      const cx = plotX0 + (closestExitIdx + 0.5) * stepX;
      const isProfitable = netPnl >= 0;
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

    const timeframeStr = options.timeframe || (resolution === 'D' ? '1D' : `${resolution}m`);
    let paddingStr = '';
    if (options.appliedBefore !== undefined && options.appliedAfter !== undefined) {
      paddingStr = ` -${options.appliedBefore}/+${options.appliedAfter}`;
    }
    const timeframeDisplay = `${timeframeStr}${paddingStr}`;
    const tfChipWidth = Math.max(40, timeframeDisplay.length * 8 + 14);

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

    const provider = options.provider || 'FYERS';
    const isUnderlying = Boolean(options.isUnderlyingFallback);

    let badgeLabel = '⚡ FYERS AUTO CHART';
    let badgeBg = '#083344';
    let badgeBorder = '#06b6d4';
    let badgeText = '#22d3ee';
    let watermarkSource = 'FYERS API v3';

    if (provider === 'ANGEL_ONE') {
      badgeLabel = '⚡ ANGEL ONE AUTO CHART';
      badgeBg = '#451a03';
      badgeBorder = '#d97706';
      badgeText = '#fbbf24';
      watermarkSource = 'Angel One SmartAPI';
    } else if (isUnderlying) {
      badgeLabel = '⚡ UNDERLYING PROXY';
      badgeBg = '#3b0764';
      badgeBorder = '#9333ea';
      badgeText = '#c084fc';
      watermarkSource = 'Underlying Proxy';
    }

    const watermarkStr = `SetupMint Visual Trade Audit • ${watermarkSource} • ${moment().format('YYYY-MM-DD HH:mm:ss')} IST`;
    const stratName = options.strategyName || trade.strategyName;
    const stratStr = stratName ? ` • Strategy: ${stratName}` : '';

    const tfChipX = plotX0 + symbolStr.length * 11 + 10;
    const dirChipX = tfChipX + tfChipWidth + 8;

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
  
  <!-- Timeframe & Padding Chip -->
  <rect x="${tfChipX}" y="18" width="${tfChipWidth}" height="20" rx="4" fill="#1e293b" />
  <text x="${tfChipX + tfChipWidth / 2}" y="32" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">
    ${timeframeDisplay}
  </text>

  <!-- Direction Chip -->
  <rect x="${dirChipX}" y="18" width="52" height="20" rx="4" fill="${directionColor}" fill-opacity="0.18" stroke="${directionColor}" stroke-width="1" />
  <text x="${dirChipX + 26}" y="32" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="${directionColor}" text-anchor="middle">
    ${direction}
  </text>

  <!-- Date Range Subheader -->
  <text x="${plotX0}" y="52" font-family="'JetBrains Mono', monospace" font-size="11" fill="#64748b">
    ${dateStr}${exitDateStr ? ` → ${exitDateStr}` : ''}${stratStr}
  </text>

  <!-- PnL Outcome Pill (Top Right) -->
  <rect x="${plotX1 - 130}" y="18" width="130" height="26" rx="5" fill="${pnlColor}" fill-opacity="0.15" stroke="${pnlColor}" stroke-width="1" />
  <text x="${plotX1 - 65}" y="35" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="700" fill="${pnlColor}" text-anchor="middle">
    ${pnlLabel}
  </text>

  <!-- Provider AUTO CHART Badge -->
  <rect x="${plotX1 - 310}" y="18" width="170" height="26" rx="5" fill="${badgeBg}" stroke="${badgeBorder}" stroke-width="1" />
  <text x="${plotX1 - 225}" y="35" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${badgeText}" text-anchor="middle">
    ${badgeLabel}
  </text>

  <!-- Price Gridlines -->
  ${priceGridSvg}

  <!-- Time Gridlines -->
  ${timeGridSvg}

  <!-- Active Trade Duration Shaded Band -->
  ${shadedBandSvg}

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
   * Generates automated SVG execution charts for a closed trade across requested user timeframes
   * and custom candle padding before entry and after exit.
   */
  static async generateAutoChartsForTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: GenerateChartsOptions = {}
  ): Promise<IChartGenerateResult[]> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const trade = await Trade.findOne({ _id: tId, userId: uId });
    if (!trade) {
      const err: any = new Error('Trade not found or unauthorized');
      err.code = 'TRADE_NOT_FOUND';
      throw err;
    }

    if (trade.status !== 'CLOSED' || !trade.exitTime) {
      const err: any = new Error('Automated execution charts can only be generated for closed trades');
      err.code = 'TRADE_NOT_CLOSED';
      throw err;
    }

    const holdMinutes = Math.max(1, moment(trade.exitTime).diff(moment(trade.entryTime), 'minutes'));
    let defaultRes: ChartResolution = holdMinutes <= 240 ? '1' : '5';

    let targetResolutions: ChartResolution[];
    if (options.resolutions && options.resolutions.length > 0) {
      targetResolutions = options.resolutions;
    } else {
      // Check if trade already has a cached snapshot (legacy single-chart path)
      const existingSnapshot = await TradeCandleSnapshot.findOne({
        userId: uId,
        tradeId: trade._id,
      }).sort({ fetchedAt: -1 });

      if (
        existingSnapshot?.resolution &&
        ['1', '5', '15', '30', '60', '240', 'D'].includes(existingSnapshot.resolution as any)
      ) {
        defaultRes = existingSnapshot.resolution as ChartResolution;
      }
      targetResolutions = [defaultRes];
    }

    const paddingBefore =
      options.paddingBefore !== undefined ? options.paddingBefore : DEFAULT_CHART_PADDING_CANDLES;
    const paddingAfter =
      options.paddingAfter !== undefined ? options.paddingAfter : DEFAULT_CHART_PADDING_CANDLES;

    // Sort timeframes in ascending order
    const sortedResolutions = [...targetResolutions].sort(
      (a, b) => resolutionOrder(a) - resolutionOrder(b)
    );

    // Fetch existing AUTO_CHART attachments for this trade
    const existingAutoCharts = await Attachment.find({
      userId: uId,
      tradeId: trade._id,
      category: 'AUTO_CHART',
    });

    const currentAttachmentsCount = trade.screenshotIds ? trade.screenshotIds.length : 0;
    let availableSlots = 12 - currentAttachmentsCount;

    const results: IChartGenerateResult[] = [];
    const actionableResolutions: ChartResolution[] = [];

    // Pre-evaluate cap and existing items
    for (const res of sortedResolutions) {
      const timeframeLabel = CHART_RESOLUTION_LABELS[res] || `${res}m`;
      const existing = existingAutoCharts.find(
        (a) =>
          a.timeframe === timeframeLabel ||
          (res === 'D' && (a.timeframe === 'Daily' || a.timeframe === '1D')) ||
          a.timeframe === `${res}m`
      );

      if (existing && !options.force) {
        results.push({
          resolution: res,
          timeframe: timeframeLabel,
          status: 'SKIPPED_EXISTS',
          attachment: this.formatAttachmentDoc(existing),
          requestedBefore: paddingBefore,
          requestedAfter: paddingAfter,
          appliedBefore: existing.chartMeta?.appliedBefore ?? paddingBefore,
          appliedAfter: existing.chartMeta?.appliedAfter ?? paddingAfter,
          truncated: Boolean(existing.chartMeta?.truncated),
          warnings: [],
        });
        continue;
      }

      // Check slot availability if net-new attachment
      if (!existing) {
        if (availableSlots <= 0) {
          results.push({
            resolution: res,
            timeframe: timeframeLabel,
            status: 'FAILED',
            errorCode: 'ATTACHMENT_LIMIT_EXCEEDED',
            requestedBefore: paddingBefore,
            requestedAfter: paddingAfter,
            appliedBefore: 0,
            appliedAfter: 0,
            truncated: false,
            warnings: [],
          });
          continue;
        }
        availableSlots--;
      }

      actionableResolutions.push(res);
    }

    if (actionableResolutions.length === 0) {
      return results.sort((a, b) => resolutionOrder(a.resolution) - resolutionOrder(b.resolution));
    }

    // Group actionable resolutions by base provider resolution:
    // '1' -> base '1' (target: 1m)
    // '5', '15', '30', '60' -> base '5' (derive via aggregateCandles)
    // 'D' -> base 'D' (target: 1D)
    const baseGroups = new Map<string, Array<{ resolution: ChartResolution; targetMinutes: number }>>();

    for (const res of actionableResolutions) {
      let baseRes = '5';
      let targetMins = 5;

      if (res === '1') {
        baseRes = '1';
        targetMins = 1;
      } else if (res === '5') {
        baseRes = '5';
        targetMins = 5;
      } else if (res === '15') {
        baseRes = '5';
        targetMins = 15;
      } else if (res === '30') {
        baseRes = '5';
        targetMins = 30;
      } else if (res === '60') {
        baseRes = '5';
        targetMins = 60;
      } else if (res === '240') {
        baseRes = '5';
        targetMins = 240;
      } else if (res === 'D') {
        baseRes = 'D';
        targetMins = 1440;
      }

      let group = baseGroups.get(baseRes);
      if (!group) {
        group = [];
        baseGroups.set(baseRes, group);
      }
      group.push({ resolution: res, targetMinutes: targetMins });
    }

    const storage = getStorage();
    const sessionAnchor =
      trade.exchange === 'MCX' || trade.marketSegment === 'MCX' ? '09:00' : '09:15';

    // Process each base resolution group sequentially
    for (const [baseRes, groupItems] of baseGroups.entries()) {
      // Compute union fetch range across all target resolutions in this base group
      let unionFromMs = Infinity;
      let unionToMs = -Infinity;

      for (const item of groupItems) {
        const range = estimateFetchRange(
          trade.entryTime,
          trade.exitTime,
          item.targetMinutes,
          paddingBefore,
          paddingAfter
        );
        if (range.from.getTime() < unionFromMs) unionFromMs = range.from.getTime();
        if (range.to.getTime() > unionToMs) unionToMs = range.to.getTime();
      }

      let fetchFrom = new Date(unionFromMs);
      const fetchTo = new Date(unionToMs);
      let isLookbackClamped = false;

      // Lookback clamp check for Angel One fallback lookback ceilings
      const nowMs = Date.now();
      const maxLookbackDays = baseRes === '1' ? 30 : baseRes === '5' ? 90 : 365;
      const lookbackLimitMs = nowMs - maxLookbackDays * 86_400_000;

      if (fetchFrom.getTime() < lookbackLimitMs) {
        if (new Date(trade.entryTime).getTime() >= lookbackLimitMs) {
          fetchFrom = new Date(lookbackLimitMs);
          isLookbackClamped = true;
        }
      }

      // Fetch base candles via MarketDataService sequential fallback chain
      const candleResult = await MarketDataService.getCandlesWithFallback({
        trade,
        resolution: baseRes,
        from: fetchFrom,
        to: fetchTo,
        userId: uId,
        forceRefetch: options.force,
        provider: options.provider || 'AUTO',
      });

      if (!candleResult.ok) {
        for (const item of groupItems) {
          const timeframeLabel = CHART_RESOLUTION_LABELS[item.resolution] || `${item.resolution}m`;
          results.push({
            resolution: item.resolution,
            timeframe: timeframeLabel,
            status: 'FAILED',
            errorCode: candleResult.reason || 'CHART_GENERATION_FAILED',
            requestedBefore: paddingBefore,
            requestedAfter: paddingAfter,
            appliedBefore: 0,
            appliedAfter: 0,
            truncated: false,
            warnings: [],
          });
        }
        continue;
      }

      const baseCandles = candleResult.candles;

      // Generate charts for each target resolution in this group
      for (const item of groupItems) {
        const timeframeLabel = CHART_RESOLUTION_LABELS[item.resolution] || `${item.resolution}m`;
        let targetCandles = baseCandles;

        if (item.targetMinutes > (baseRes === '1' ? 1 : baseRes === '5' ? 5 : 1440)) {
          // Derive higher timeframe via aggregateCandles
          const aggRes = aggregateCandles(baseCandles, item.targetMinutes, sessionAnchor);
          targetCandles = aggRes.candles;
        }

        const windowResult = selectChartWindow(
          targetCandles,
          trade.entryTime,
          trade.exitTime,
          paddingBefore,
          paddingAfter,
          MAX_RENDERED_CANDLES
        );

        const warnings: string[] = [];
        if (isLookbackClamped) {
          warnings.push('PADDING_REDUCED_LOOKBACK');
        }
        if (
          windowResult.appliedBefore < paddingBefore ||
          windowResult.appliedAfter < paddingAfter
        ) {
          warnings.push('PADDING_REDUCED_DATA');
        }
        if (windowResult.truncated) {
          warnings.push('WINDOW_TRUNCATED');
        }
        if (candleResult.isUnderlyingFallback) {
          warnings.push('UNDERLYING_FALLBACK');
        }

        // Render clean SVG chart
        const svgString = this.generateChartSvg(windowResult.candles, trade, {
          resolution: item.resolution,
          timeframe: timeframeLabel,
          width: 960,
          height: 520,
          provider: candleResult.provider,
          isUnderlyingFallback: candleResult.isUnderlyingFallback,
          appliedBefore: windowResult.appliedBefore,
          appliedAfter: windowResult.appliedAfter,
          entryIndex: windowResult.entryIndex,
          exitIndex: windowResult.exitIndex,
          strategyName: options.strategyName || trade.strategyName,
        });

        const svgBuffer = Buffer.from(svgString, 'utf-8');

        // Check if an attachment of the SAME timeframe already exists (to replace)
        const existingSameTimeframe = existingAutoCharts.find(
          (a) =>
            a.timeframe === timeframeLabel ||
            (item.resolution === 'D' && (a.timeframe === 'Daily' || a.timeframe === '1D')) ||
            a.timeframe === `${item.resolution}m`
        );

        if (existingSameTimeframe && options.force) {
          try {
            await storage.delete(existingSameTimeframe.storedFilename);
          } catch {
            // ignore missing storage object
          }
          await Attachment.deleteOne({ _id: existingSameTimeframe._id });
          await Trade.findByIdAndUpdate(trade._id, {
            $pull: { screenshotIds: existingSameTimeframe._id },
          });
        }

        // Save new SVG to Cloudflare R2 / S3
        const safeFilename = `${crypto.randomUUID()}.svg`;
        await storage.save(safeFilename, svgBuffer, 'image/svg+xml');

        // Create Attachment record
        const attachment = await Attachment.create({
          userId: uId,
          tradeId: trade._id,
          originalName: `${trade.symbol}_autochart_${timeframeLabel}.svg`,
          storedFilename: safeFilename,
          mimeType: 'image/svg+xml',
          sizeBytes: svgBuffer.length,
          category: 'AUTO_CHART',
          description: `${timeframeLabel} chart, ${paddingBefore} before / ${paddingAfter} after`,
          timeframe: timeframeLabel,
          chartTimestamp: moment(trade.entryTime).toISOString(),
          chartMeta: {
            resolution: item.resolution,
            paddingBefore,
            paddingAfter,
            appliedBefore: windowResult.appliedBefore,
            appliedAfter: windowResult.appliedAfter,
            truncated: windowResult.truncated,
            generatedAt: new Date(),
            settingsSource: options.settingsSource,
            isStale: false,
          },
        });

        // Link to trade.screenshotIds
        await Trade.findByIdAndUpdate(trade._id, {
          $addToSet: { screenshotIds: attachment._id },
        });

        results.push({
          resolution: item.resolution,
          timeframe: timeframeLabel,
          status: existingSameTimeframe ? 'REPLACED' : 'CREATED',
          attachment: this.formatAttachmentDoc(attachment),
          requestedBefore: paddingBefore,
          requestedAfter: paddingAfter,
          appliedBefore: windowResult.appliedBefore,
          appliedAfter: windowResult.appliedAfter,
          truncated: windowResult.truncated,
          warnings,
        });
      }
    }

    return results.sort((a, b) => resolutionOrder(a.resolution) - resolutionOrder(b.resolution));
  }

  /**
   * Backwards compatible single-chart creation method.
   */
  static async createAndSaveAutoChartForTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: { force?: boolean; provider?: CandleFallbackProvider } = {}
  ): Promise<IAttachmentDoc> {
    const results = await this.generateAutoChartsForTrade(tradeId, userId, {
      force: options.force,
      provider: options.provider,
    });

    const successItem = results.find(
      (r) => r.status === 'CREATED' || r.status === 'REPLACED' || r.status === 'SKIPPED_EXISTS'
    );

    if (successItem && successItem.attachment) {
      const doc = await Attachment.findById(successItem.attachment.id);
      if (doc) return doc;
    }

    throw new Error(
      results[0]?.errorCode || 'Failed to generate automated chart screenshot'
    );
  }

  private static formatAttachmentDoc(att: any): any {
    return {
      id: att._id ? att._id.toString() : att.id,
      tradeId: att.tradeId ? att.tradeId.toString() : undefined,
      userId: att.userId ? att.userId.toString() : undefined,
      originalName: att.originalName,
      storedFilename: att.storedFilename,
      category: att.category,
      caption: att.description,
      description: att.description,
      timeframe: att.timeframe,
      chartTimestamp: att.chartTimestamp,
      chartMeta: att.chartMeta
        ? {
            resolution: att.chartMeta.resolution,
            paddingBefore: att.chartMeta.paddingBefore,
            paddingAfter: att.chartMeta.paddingAfter,
            appliedBefore: att.chartMeta.appliedBefore,
            appliedAfter: att.chartMeta.appliedAfter,
            truncated: att.chartMeta.truncated,
            generatedAt: att.chartMeta.generatedAt
              ? new Date(att.chartMeta.generatedAt).toISOString()
              : undefined,
            settingsSource: att.chartMeta.settingsSource,
            isStale: Boolean(att.chartMeta.isStale),
          }
        : undefined,
      sizeBytes: att.sizeBytes,
      mimeType: att.mimeType,
      downloadUrl: `/api/v1/attachments/${att._id || att.id}/download`,
      createdAt: att.createdAt ? new Date(att.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Ensures automated snapshot SVG(s) exist for a closed trade, driven by the user's
   * Pattern Detection settings & instrument overrides.
   *
   * Idempotent (force: false by default, SKIPPED_EXISTS), respects the 12-screenshot cap
   * with net-new accounting, prioritizing LTF first if only 1 slot fits.
   */
  static async ensureTradeSnapshot(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: { force?: boolean } = {}
  ): Promise<IChartGenerateResult[]> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    const trade = await Trade.findOne({ _id: tId, userId: uId });
    if (!trade || trade.status !== 'CLOSED' || !trade.exitTime) {
      return [];
    }

    const user = await User.findById(uId).select('patternDetectionSettings').lean();
    const resolved = resolveSnapshotTimeframes(
      trade.toObject ? trade.toObject() : trade,
      (user as any)?.patternDetectionSettings
    );

    // Evaluate 12-screenshot cap with net-new accounting
    const currentAttachmentsCount = trade.screenshotIds ? trade.screenshotIds.length : 0;
    let availableSlots = 12 - currentAttachmentsCount;

    const existingAutoCharts = await Attachment.find({
      userId: uId,
      tradeId: trade._id,
      category: 'AUTO_CHART',
    });

    // Check which resolutions need net-new slots
    const targetResolutions: ChartResolution[] = [];
    for (const res of resolved.resolutions) {
      const timeframeLabel = CHART_RESOLUTION_LABELS[res] || `${res}m`;
      const existing = existingAutoCharts.find(
        (a) =>
          a.timeframe === timeframeLabel ||
          (res === 'D' && (a.timeframe === 'Daily' || a.timeframe === '1D')) ||
          a.timeframe === `${res}m`
      );

      if (existing) {
        // Already exists: can be skipped (or replaced if force=true) without net-new slot
        targetResolutions.push(res);
      } else if (availableSlots > 0) {
        // Net-new slot available
        targetResolutions.push(res);
        availableSlots--;
      }
    }

    if (targetResolutions.length === 0) {
      return [];
    }

    return this.generateAutoChartsForTrade(trade._id, uId, {
      resolutions: targetResolutions,
      paddingBefore: DEFAULT_CHART_PADDING_CANDLES,
      paddingAfter: DEFAULT_CHART_PADDING_CANDLES,
      force: Boolean(options.force),
      settingsSource: resolved.settingsDescription,
      strategyName: resolved.preferredStrategyName || trade.strategyName,
    });
  }

  /**
   * Marks existing AUTO_CHART snapshots for a trade as stale.
   * Called when a closed trade is edited or modified so the UI can prompt the user to regenerate.
   */
  static async markSnapshotsStale(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<void> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;

    await Attachment.updateMany(
      { userId: uId, tradeId: tId, category: 'AUTO_CHART' },
      { $set: { 'chartMeta.isStale': true } }
    );
  }
}
