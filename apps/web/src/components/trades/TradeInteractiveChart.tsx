import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  Chip,
  Tooltip,
  CircularProgress,
  Button,
  ButtonGroup,
  IconButton,
  Switch,
  FormControlLabel,
  Alert,
  useTheme,
  Collapse,
} from '@mui/material';
import {
  ZoomOutMapRounded,
  FullscreenRounded,
  FullscreenExitRounded,
  RefreshRounded,
  TuneRounded,
  CandlestickChartRounded,
  LayersRounded,
  TrendingUpRounded,
  TrendingDownRounded,
  WarningAmberRounded,
  AutoAwesomeRounded,
  ImageRounded,
} from '@mui/icons-material';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  LineStyle,
  LineType,
  CrosshairMode,
  createSeriesMarkers,
  ColorType,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { api } from '../../lib/api.js';
import { calculateRLadderLevels } from '@tradevault/financial-engine';
import { IAttachment, ITradeFill, IStopLossMoveEvent } from '@tradevault/shared';

export interface TradeInteractiveChartProps {
  trade: any;
  attachments?: IAttachment[];
  onRefreshTrade?: () => void;
}

const AVAILABLE_RESOLUTIONS: Array<{ key: string; label: string }> = [
  { key: '1', label: '1m' },
  { key: '5', label: '5m' },
  { key: '15', label: '15m' },
  { key: '30', label: '30m' },
  { key: '60', label: '1h' },
  { key: 'D', label: '1D' },
];

interface OverlayToggles {
  entryExit: boolean;
  fills: boolean;
  keyLevels: boolean;
  rLadder: boolean;
  stopTrail: boolean;
  excursion: boolean;
  liquidity: boolean;
  windowBand: boolean;
}

const STORAGE_KEY_OVERLAYS = 'setupmint_chart_overlay_toggles';

const DEFAULT_OVERLAYS: OverlayToggles = {
  entryExit: true,
  fills: true,
  keyLevels: true,
  rLadder: true,
  stopTrail: true,
  excursion: true,
  liquidity: true,
  windowBand: true,
};

function getSavedOverlays(): OverlayToggles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OVERLAYS);
    if (raw) {
      return { ...DEFAULT_OVERLAYS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_OVERLAYS;
}

export function TradeInteractiveChart({
  trade,
  attachments = [],
  onRefreshTrade,
}: TradeInteractiveChartProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  // Determine initial resolution: trade duration <= 4h -> 5m, else 15m
  const defaultResolution = useMemo(() => {
    if (trade?.entryTime && trade?.exitTime) {
      const durMs = new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime();
      if (!isNaN(durMs) && durMs > 0 && durMs <= 4 * 60 * 60 * 1000) {
        return '5';
      }
      return '15';
    }
    return '5';
  }, [trade?.entryTime, trade?.exitTime]);

  const [resolution, setResolution] = useState<string>(defaultResolution);
  const [overlays, setOverlays] = useState<OverlayToggles>(getSavedOverlays);
  const [showOverlayToolbar, setShowOverlayToolbar] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Data streaming state
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isNoCandleData, setIsNoCandleData] = useState(false);
  const [candlesData, setCandlesData] = useState<any[]>([]);
  const [providerName, setProviderName] = useState<string>('FYERS');
  const [isUnderlyingProxy, setIsUnderlyingProxy] = useState<boolean>(false);

  // Crosshair HUD detail
  const [hoveredCandle, setHoveredCandle] = useState<{
    timeStr: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    pct: number;
  } | null>(null);

  // References for chart canvas
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const windowBandSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const stopTrailSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersPluginRef = useRef<any | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  // State refs for async callbacks
  const candlesRef = useRef<any[]>([]);
  const firstTimeRef = useRef<number | null>(null);
  const isLoadingOlderRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const resolutionRef = useRef<string>(resolution);
  resolutionRef.current = resolution;
  const isInitialLoadRef = useRef(true);

  // Save overlays to localStorage
  const handleToggleOverlay = (key: keyof OverlayToggles) => {
    setOverlays((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY_OVERLAYS, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Find latest saved AUTO_CHART attachment (for 404 NO_CANDLE_DATA fallback)
  const latestSavedSnapshot = useMemo(() => {
    const list = (attachments || []).filter((a) => a.category === 'AUTO_CHART');
    if (list.length === 0) return null;
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
  }, [attachments]);

  // Snaps an epoch timestamp (seconds) to the nearest candle time
  const findClosestCandleTime = useCallback((targetSec: number, candles: any[]): number | null => {
    if (!candles || candles.length === 0) return null;
    let closest = candles[0].time;
    let minDiff = Math.abs(candles[0].time - targetSec);

    for (const c of candles) {
      const diff = Math.abs(c.time - targetSec);
      if (diff < minDiff) {
        minDiff = diff;
        closest = c.time;
      }
    }
    return closest;
  }, []);

  // Primary method applying series data, overlays, price lines, and markers
  const applyOverlaysAndData = useCallback(
    (candles: any[]) => {
      if (!candlestickSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) {
        return;
      }
      if (candles.length === 0) return;

      const cs = candlestickSeriesRef.current;
      const vol = volumeSeriesRef.current;

      // 1. Candlestick series
      const formattedCandles = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      cs.setData(formattedCandles);

      // 2. Volume series
      const formattedVolumes = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.38)' : 'rgba(244, 63, 94, 0.38)',
      }));
      vol.setData(formattedVolumes);

      // 3. Clear existing price lines
      for (const pl of priceLinesRef.current) {
        try {
          cs.removePriceLine(pl);
        } catch {}
      }
      priceLinesRef.current = [];

      const isLong = trade.direction === 'LONG';
      const entryPrice =
        trade.simpleExecution?.entryPrice ??
        trade.calculated?.averageEntryPrice ??
        trade.entryPrice ??
        0;
      const exitPrice =
        trade.simpleExecution?.exitPrice ??
        trade.calculated?.averageExitPrice ??
        trade.exitPrice;
      const stopLoss = trade.risk?.initialStopLoss;
      const plannedTarget = trade.risk?.plannedTarget;
      const plannedEntry = trade.risk?.plannedEntryPrice;

      // 4. Horizontal Price Lines (Key Levels)
      if (overlays.keyLevels) {
        // Initial Stop Loss Line (Red)
        if (stopLoss && stopLoss > 0) {
          try {
            const slLine = cs.createPriceLine({
              price: Number(stopLoss),
              color: '#ef4444',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Stop Loss',
            });
            priceLinesRef.current.push(slLine);
          } catch {}
        }

        // Planned Target Line (Green)
        if (plannedTarget && plannedTarget > 0) {
          try {
            const tpLine = cs.createPriceLine({
              price: Number(plannedTarget),
              color: '#10b981',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Planned Target',
            });
            priceLinesRef.current.push(tpLine);
          } catch {}
        }

        // Planned Entry Price Line (Grey dashed)
        if (plannedEntry && plannedEntry > 0 && Math.abs(plannedEntry - entryPrice) > 0.05) {
          try {
            const peLine = cs.createPriceLine({
              price: Number(plannedEntry),
              color: '#94a3b8',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Planned Entry',
            });
            priceLinesRef.current.push(peLine);
          } catch {}
        }

        // Weighted Average Entry Price (or execution entry)
        if (entryPrice > 0) {
          try {
            const entryLine = cs.createPriceLine({
              price: Number(entryPrice),
              color: '#3b82f6',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `Entry (${isLong ? 'LONG' : 'SHORT'})`,
            });
            priceLinesRef.current.push(entryLine);
          } catch {}
        }

        // Exit Price Line
        if (exitPrice && exitPrice > 0) {
          try {
            const exitLine = cs.createPriceLine({
              price: Number(exitPrice),
              color: '#f59e0b',
              lineWidth: 1,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: 'Exit',
            });
            priceLinesRef.current.push(exitLine);
          } catch {}
        }
      }

      // 5. 1R / 2R / 3R Target Ladder (Derived from |entry - stopLoss| via @tradevault/financial-engine)
      if (overlays.rLadder && entryPrice > 0 && stopLoss && stopLoss > 0) {
        try {
          const rLevels = calculateRLadderLevels(
            isLong ? 'LONG' : 'SHORT',
            Number(entryPrice),
            Number(stopLoss),
            [1, 2, 3]
          );

          for (const lvl of rLevels) {
            const rLine = cs.createPriceLine({
              price: lvl.price,
              color: '#06b6d4',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: lvl.label,
            });
            priceLinesRef.current.push(rLine);
          }
        } catch {}
      }

      // 6. Liquidity Level & Sweep Extreme Lines
      if (overlays.liquidity && trade.setup) {
        const liqLevel = trade.setup.liquidityLevel;
        const sweepExtreme = trade.setup.sweepExtreme;

        if (liqLevel && Number(liqLevel) > 0) {
          try {
            const liqLine = cs.createPriceLine({
              price: Number(liqLevel),
              color: '#eab308',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Liquidity Level',
            });
            priceLinesRef.current.push(liqLine);
          } catch {}
        }

        if (sweepExtreme && Number(sweepExtreme) > 0) {
          try {
            const sweepLine = cs.createPriceLine({
              price: Number(sweepExtreme),
              color: '#a855f7',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Sweep Extreme',
            });
            priceLinesRef.current.push(sweepLine);
          } catch {}
        }
      }

      // 7. Markers: Entry, Exit, Fills, and MFE/MAE Excursion
      const markers: any[] = [];

      // A. Primary Entry Marker
      if (overlays.entryExit && trade.entryTime && entryPrice > 0) {
        const entrySec = Math.floor(new Date(trade.entryTime).getTime() / 1000);
        const snappedTime = findClosestCandleTime(entrySec, candles);
        if (snappedTime) {
          markers.push({
            time: snappedTime as UTCTimestamp,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: '#10b981',
            shape: isLong ? 'arrowUp' : 'arrowDown',
            text: `ENTRY @ ₹${Number(entryPrice).toLocaleString('en-IN')}`,
          });
        }
      }

      // B. Primary Exit Marker
      if (overlays.entryExit && trade.exitTime && exitPrice && Number(exitPrice) > 0) {
        const exitSec = Math.floor(new Date(trade.exitTime).getTime() / 1000);
        const snappedTime = findClosestCandleTime(exitSec, candles);
        if (snappedTime) {
          markers.push({
            time: snappedTime as UTCTimestamp,
            position: isLong ? 'aboveBar' : 'belowBar',
            color: '#f43f5e',
            shape: isLong ? 'arrowDown' : 'arrowUp',
            text: `EXIT @ ₹${Number(exitPrice).toLocaleString('en-IN')}`,
          });
        }
      }

      // C. ADVANCED Multi-Fill Markers (sized by quantity)
      if (overlays.fills && Array.isArray(trade.fills) && trade.fills.length > 0) {
        const avgQty =
          trade.fills.reduce((sum: number, f: ITradeFill) => sum + (f.quantity || 1), 0) /
          trade.fills.length;

        for (const fill of trade.fills) {
          if (!fill.timestamp || !fill.price) continue;
          const fillSec = Math.floor(new Date(fill.timestamp).getTime() / 1000);
          const snapped = findClosestCandleTime(fillSec, candles);
          if (!snapped) continue;

          const isFillEntry = fill.type === 'ENTRY';
          const sizeRel = Math.min(3, Math.max(1, Math.round((fill.quantity || avgQty) / avgQty)));

          markers.push({
            time: snapped as UTCTimestamp,
            position: isFillEntry
              ? isLong
                ? 'belowBar'
                : 'aboveBar'
              : isLong
              ? 'aboveBar'
              : 'belowBar',
            color: isFillEntry ? '#3b82f6' : '#f59e0b',
            shape: isFillEntry ? (isLong ? 'arrowUp' : 'arrowDown') : 'circle',
            text: `${fill.type} ${fill.quantity} @ ₹${fill.price}`,
            size: sizeRel,
          });
        }
      }

      // D. MFE & MAE Excursion Markers
      if (overlays.excursion && trade.calculated?.excursion && trade.entryTime) {
        const exc = trade.calculated.excursion;
        const entryMs = new Date(trade.entryTime).getTime();

        if (typeof exc.timeToMfeMinutes === 'number' && exc.timeToMfeMinutes >= 0) {
          const mfeMs = entryMs + exc.timeToMfeMinutes * 60 * 1000;
          const snappedMfe = findClosestCandleTime(Math.floor(mfeMs / 1000), candles);
          if (snappedMfe) {
            const mfeRText = exc.mfeR !== undefined ? `+${exc.mfeR.toFixed(1)}R` : `+${exc.mfePoints}pts`;
            markers.push({
              time: snappedMfe as UTCTimestamp,
              position: isLong ? 'aboveBar' : 'belowBar',
              color: '#10b981',
              shape: 'circle',
              text: `MFE (${mfeRText})`,
              size: 2,
            });
          }
        }

        if (typeof exc.timeToMaeMinutes === 'number' && exc.timeToMaeMinutes >= 0) {
          const maeMs = entryMs + exc.timeToMaeMinutes * 60 * 1000;
          const snappedMae = findClosestCandleTime(Math.floor(maeMs / 1000), candles);
          if (snappedMae) {
            const maeRText = exc.maeR !== undefined ? `-${exc.maeR.toFixed(1)}R` : `-${exc.maePoints}pts`;
            markers.push({
              time: snappedMae as UTCTimestamp,
              position: isLong ? 'belowBar' : 'aboveBar',
              color: '#f43f5e',
              shape: 'circle',
              text: `MAE (${maeRText})`,
              size: 2,
            });
          }
        }
      }

      // Attach or replace series markers
      // Sort markers chronologically (required by Lightweight Charts)
      const sortedMarkers = markers.sort((a, b) => (a.time as number) - (b.time as number));

      if (markersPluginRef.current) {
        try {
          markersPluginRef.current.setMarkers(sortedMarkers);
        } catch {}
      } else if (sortedMarkers.length > 0) {
        try {
          markersPluginRef.current = createSeriesMarkers(cs, sortedMarkers);
        } catch {}
      }

      // 8. Stop-loss move stepped trail
      if (overlays.stopTrail && stopTrailSeriesRef.current && Array.isArray(trade.stopLossMoveEvents)) {
        const events = trade.stopLossMoveEvents.filter(
          (e: IStopLossMoveEvent) => e.movedAt && e.newStop > 0
        );
        if (events.length > 0) {
          const trailPoints = events
            .map((e: IStopLossMoveEvent) => {
              const sec = Math.floor(new Date(e.movedAt).getTime() / 1000);
              const snapped = findClosestCandleTime(sec, candles);
              return snapped ? { time: snapped as UTCTimestamp, value: e.newStop } : null;
            })
            .filter(Boolean)
            .sort((a: any, b: any) => (a!.time as number) - (b!.time as number));

          if (trailPoints.length > 0) {
            stopTrailSeriesRef.current.setData(trailPoints as any);
          }
        } else {
          stopTrailSeriesRef.current.setData([]);
        }
      } else if (stopTrailSeriesRef.current) {
        stopTrailSeriesRef.current.setData([]);
      }

      // 9. Entry -> Exit Window Shaded Band
      if (overlays.windowBand && windowBandSeriesRef.current && trade.entryTime && trade.exitTime) {
        const entrySec = Math.floor(new Date(trade.entryTime).getTime() / 1000);
        const exitSec = Math.floor(new Date(trade.exitTime).getTime() / 1000);

        const windowPoints = candles
          .filter((c) => c.time >= entrySec && c.time <= exitSec)
          .map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.high,
          }));

        if (windowPoints.length > 0) {
          windowBandSeriesRef.current.setData(windowPoints);
        } else {
          windowBandSeriesRef.current.setData([]);
        }
      } else if (windowBandSeriesRef.current) {
        windowBandSeriesRef.current.setData([]);
      }
    },
    [trade, overlays, findClosestCandleTime]
  );

  // Fetch candle data for trade and resolution
  const fetchCandleStream = useCallback(
    async (targetResolution: string, force = false) => {
      if (!trade?._id && !trade?.id) return;
      const tradeId = trade.id || trade._id;

      try {
        setLoading(true);
        setErrorMsg(null);
        setIsNoCandleData(false);
        isInitialLoadRef.current = true;
        hasMoreHistoryRef.current = true;

        const resp = await api.trades.getInteractiveCandles(tradeId, {
          resolution: targetResolution,
          force,
          preloadBefore: 180,
          preloadAfter: 60,
        });

        if (resp && Array.isArray(resp.candles) && resp.candles.length > 0) {
          candlesRef.current = resp.candles;
          firstTimeRef.current = resp.firstTime;
          setCandlesData(resp.candles);
          setProviderName(resp.provider || 'FYERS');
          setIsUnderlyingProxy(Boolean(resp.isUnderlyingFallback));

          applyOverlaysAndData(resp.candles);

          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }

          // Release initial load lock after viewport settles so fitContent does not trigger older history fetch
          setTimeout(() => {
            isInitialLoadRef.current = false;
          }, 500);
        } else {
          setIsNoCandleData(true);
        }
      } catch (err: any) {
        if (err.status === 404 || err.message?.includes('NO_CANDLE_DATA')) {
          setIsNoCandleData(true);
        } else {
          setErrorMsg(err.message || 'Failed to stream candlestick market data.');
        }
      } finally {
        setLoading(false);
      }
    },
    [trade, applyOverlaysAndData]
  );

  // Initialize and clean up chart canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Reset chart instance if container re-mounts
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const width = container.clientWidth || 960;
    const height = isFullscreen ? window.innerHeight - 120 : 540;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0b0f19' : '#ffffff' },
        textColor: isDark ? '#94a3b8' : '#475569',
        fontFamily: `'JetBrains Mono', system-ui, -apple-system, sans-serif`,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#64748b' : '#94a3b8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        },
        horzLine: {
          color: isDark ? '#64748b' : '#94a3b8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 3,
      },
    });

    // 1. Shaded Window Band series (bottom layer)
    const windowBandSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(59, 130, 246, 0.10)',
      bottomColor: 'rgba(59, 130, 246, 0.01)',
      lineColor: 'transparent',
      lineWidth: 1,
      priceScaleId: '',
    });

    // 2. Candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    // 3. Volume histogram overlay at bottom
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(16, 185, 129, 0.38)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // 4. Stepped line series for trailing stop-loss modification trail
    const stopTrailSeries = chart.addSeries(LineSeries, {
      color: '#d97706',
      lineWidth: 2,
      lineType: LineType.WithSteps,
      priceScaleId: 'right',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;
    windowBandSeriesRef.current = windowBandSeries;
    stopTrailSeriesRef.current = stopTrailSeries;
    markersPluginRef.current = null;

    // Crosshair HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoveredCandle(null);
        return;
      }
      const bar: any = param.seriesData.get(candlestickSeries);
      const volBar: any = param.seriesData.get(volumeSeries);

      if (bar) {
        const pct = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0;
        const timeStr = new Date((param.time as number) * 1000).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        setHoveredCandle({
          timeStr,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: volBar?.value || 0,
          pct,
        });
      }
    });

    // Pan listener to load older history
    chart.timeScale().subscribeVisibleLogicalRangeChange(async (logicalRange) => {
      if (
        !logicalRange ||
        logicalRange.from > 5 ||
        isInitialLoadRef.current ||
        isLoadingOlderRef.current ||
        !hasMoreHistoryRef.current ||
        !firstTimeRef.current ||
        candlesRef.current.length < 20
      ) {
        return;
      }

      try {
        isLoadingOlderRef.current = true;
        const tradeId = trade.id || trade._id;
        const currentReqRes = resolutionRef.current;
        const resp = await api.trades.getInteractiveCandles(tradeId, {
          resolution: currentReqRes,
          to: firstTimeRef.current - 1,
          preloadBefore: 120,
        });

        // Abort if resolution changed while request was in-flight
        if (resolutionRef.current !== currentReqRes) return;

        if (resp && Array.isArray(resp.candles) && resp.candles.length > 0) {
          const existingSet = new Set(candlesRef.current.map((c) => c.time));
          const newOlder = resp.candles.filter((c) => !existingSet.has(c.time));

          if (newOlder.length === 0) {
            hasMoreHistoryRef.current = false;
          } else {
            const combined = [...newOlder, ...candlesRef.current].sort((a, b) => a.time - b.time);
            candlesRef.current = combined;
            firstTimeRef.current = combined[0].time;
            setCandlesData(combined);
            applyOverlaysAndData(combined);
          }
        } else {
          hasMoreHistoryRef.current = false;
        }
      } catch {
        hasMoreHistoryRef.current = false;
      } finally {
        isLoadingOlderRef.current = false;
      }
    });

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width: newWidth, height: newHeight } = entries[0].contentRect;
      if (newWidth > 0 && chartRef.current) {
        chartRef.current.applyOptions({
          width: newWidth,
          height: isFullscreen ? window.innerHeight - 120 : newHeight || 540,
        });
      }
    });
    ro.observe(container);

    // Initial fetch
    fetchCandleStream(resolution);

    return () => {
      ro.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [trade?._id, trade?.id, isDark, isFullscreen]);

  // Handle resolution change
  const handleChangeResolution = (newRes: string) => {
    if (newRes === resolution) return;
    setResolution(newRes);
    resolutionRef.current = newRes;
    fetchCandleStream(newRes);
  };

  // Re-apply overlays when toggles change without refetching candles
  useEffect(() => {
    if (candlesRef.current.length > 0) {
      applyOverlaysAndData(candlesRef.current);
    }
  }, [overlays, applyOverlaysAndData]);

  const handleFitContent = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const isWin = (trade?.calculated?.netPnL || 0) > 0;
  const isLoss = (trade?.calculated?.netPnL || 0) < 0;

  return (
    <Card
      elevation={2}
      sx={{
        borderRadius: 2.5,
        overflow: 'hidden',
        border: `1px solid ${muiTheme.palette.divider}`,
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        width: isFullscreen ? '100vw' : '100%',
        height: isFullscreen ? '100vh' : 'auto',
        zIndex: isFullscreen ? 1400 : 1,
        bgcolor: isDark ? '#0b0f19' : '#ffffff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Chart Top Header & Toolbar */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* Left: Symbol & Metadata */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CandlestickChartRounded color="primary" sx={{ fontSize: 24 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1.1rem' }}>
              {trade.symbol}
            </Typography>
          </Box>

          <Chip
            label={trade.direction || 'LONG'}
            size="small"
            icon={trade.direction === 'LONG' ? <TrendingUpRounded /> : <TrendingDownRounded />}
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              bgcolor: isWin
                ? 'rgba(16, 185, 129, 0.15)'
                : isLoss
                ? 'rgba(244, 63, 94, 0.15)'
                : 'rgba(148, 163, 184, 0.15)',
              color: isWin ? '#10b981' : isLoss ? '#f43f5e' : '#94a3b8',
              border: `1px solid ${
                isWin ? 'rgba(16, 185, 129, 0.3)' : isLoss ? 'rgba(244, 63, 94, 0.3)' : 'transparent'
              }`,
            }}
          />

          {isUnderlyingProxy && (
            <Tooltip title="Candlestick data loaded from underlying index/scrip proxy (derivative contract history unavailable)">
              <Chip
                label="Underlying Proxy"
                size="small"
                sx={{
                  bgcolor: 'rgba(147, 51, 234, 0.15)',
                  color: '#c084fc',
                  border: '1px solid rgba(147, 51, 234, 0.3)',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                }}
              />
            </Tooltip>
          )}

          <Chip
            label={providerName}
            size="small"
            sx={{
              bgcolor: providerName === 'ANGEL_ONE' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(6, 182, 212, 0.12)',
              color: providerName === 'ANGEL_ONE' ? '#fbbf24' : '#22d3ee',
              border: `1px solid ${providerName === 'ANGEL_ONE' ? 'rgba(217, 119, 6, 0.3)' : 'rgba(6, 182, 212, 0.3)'}`,
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          />
        </Box>

        {/* Center: Timeframe Switcher */}
        <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 1.5 }}>
          {AVAILABLE_RESOLUTIONS.map((res) => (
            <Button
              key={res.key}
              onClick={() => handleChangeResolution(res.key)}
              variant={resolution === res.key ? 'contained' : 'outlined'}
              disabled={loading}
              sx={{
                px: 1.5,
                py: 0.4,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'none',
              }}
            >
              {res.label}
            </Button>
          ))}
        </ButtonGroup>

        {/* Right: Controls & Overlays Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            startIcon={<LayersRounded />}
            onClick={() => setShowOverlayToolbar((prev) => !prev)}
            variant={showOverlayToolbar ? 'contained' : 'outlined'}
            color={showOverlayToolbar ? 'primary' : 'inherit'}
            sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'none' }}
          >
            Overlays
          </Button>

          <Tooltip title="Fit chart viewport">
            <IconButton size="small" onClick={handleFitContent} disabled={loading || isNoCandleData}>
              <ZoomOutMapRounded fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Refresh candlestick data">
            <IconButton
              size="small"
              onClick={() => fetchCandleStream(resolution, true)}
              disabled={loading}
            >
              <RefreshRounded fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            <IconButton size="small" onClick={handleToggleFullscreen}>
              {isFullscreen ? <FullscreenExitRounded fontSize="small" /> : <FullscreenRounded fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Overlay Toggle Bar (Collapsible) */}
      <Collapse in={showOverlayToolbar}>
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 245, 249, 0.7)',
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 1 }}>
            LAYERS:
          </Typography>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.entryExit}
                onChange={() => handleToggleOverlay('entryExit')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>Entry/Exit</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.fills}
                onChange={() => handleToggleOverlay('fills')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>Fills & Avg Entry</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.keyLevels}
                onChange={() => handleToggleOverlay('keyLevels')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>SL & Target</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.rLadder}
                onChange={() => handleToggleOverlay('rLadder')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>1R / 2R / 3R Targets</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.stopTrail}
                onChange={() => handleToggleOverlay('stopTrail')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>Trailing Stop Trail</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.excursion}
                onChange={() => handleToggleOverlay('excursion')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>MFE / MAE</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.liquidity}
                onChange={() => handleToggleOverlay('liquidity')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>Liquidity / Sweep</Typography>}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.windowBand}
                onChange={() => handleToggleOverlay('windowBand')}
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>Execution Window</Typography>}
          />
        </Box>
      </Collapse>

      {/* Crosshair HUD Metric Bar */}
      <Box
        sx={{
          px: 2,
          py: 0.6,
          bgcolor: isDark ? '#080c14' : '#f8fafc',
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2.5,
          fontFamily: `'JetBrains Mono', monospace`,
          fontSize: '0.75rem',
          minHeight: 28,
        }}
      >
        {hoveredCandle ? (
          <>
            <Typography variant="caption" sx={{ fontFamily: 'inherit', color: 'text.secondary' }}>
              {hoveredCandle.timeStr}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
                O: <strong>₹{hoveredCandle.open}</strong>
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
                H: <strong>₹{hoveredCandle.high}</strong>
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
                L: <strong>₹{hoveredCandle.low}</strong>
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
                C: <strong>₹{hoveredCandle.close}</strong>
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'inherit',
                  color: hoveredCandle.pct >= 0 ? '#10b981' : '#f43f5e',
                  fontWeight: 700,
                }}
              >
                {hoveredCandle.pct >= 0 ? '+' : ''}
                {hoveredCandle.pct.toFixed(2)}%
              </Typography>
              {hoveredCandle.volume > 0 && (
                <Typography variant="caption" sx={{ fontFamily: 'inherit', color: 'text.secondary' }}>
                  Vol: <strong>{hoveredCandle.volume.toLocaleString('en-IN')}</strong>
                </Typography>
              )}
            </Box>
          </>
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            Hover cursor over canvas for candlestick details & timestamps
          </Typography>
        )}
      </Box>

      {/* Main Canvas Body or Fallback */}
      <Box sx={{ position: 'relative', flex: 1, minHeight: isFullscreen ? 'auto' : 540 }}>
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: isDark ? 'rgba(11, 15, 25, 0.7)' : 'rgba(255, 255, 255, 0.7)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
            }}
          >
            <CircularProgress size={32} color="primary" />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Streaming {AVAILABLE_RESOLUTIONS.find((r) => r.key === resolution)?.label} historical candles...
            </Typography>
          </Box>
        )}

        {errorMsg && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{errorMsg}</Alert>
          </Box>
        )}

        {/* 404 NO_CANDLE_DATA Fallback: Show permanent SVG snapshot */}
        {isNoCandleData && !loading ? (
          <Box
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minHeight: 460,
            }}
          >
            <Alert
              severity="warning"
              icon={<WarningAmberRounded />}
              sx={{ maxWidth: 700, width: '100%', borderRadius: 2 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Broker Historical Lookback Expired
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Interactive candlestick data is no longer available from FYERS or Angel One for this historical period.
                SetupMint preserved your server-generated permanent SVG snapshot below so your visual trade history is never lost.
              </Typography>
            </Alert>

            {latestSavedSnapshot ? (
              <Box
                sx={{
                  maxWidth: 960,
                  width: '100%',
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: `1px solid ${muiTheme.palette.divider}`,
                }}
              >
                <img
                  src={api.attachments.resolveAttachmentUrl(latestSavedSnapshot)}
                  alt={`Saved Snapshot (${latestSavedSnapshot.timeframe || 'Auto'})`}
                  crossOrigin="anonymous"
                  style={{ width: '100%', display: 'block' }}
                />
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ImageRounded sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No saved SVG snapshot exists for this trade yet.
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          /* Interactive Lightweight Charts Container */
          <div
            ref={containerRef}
            style={{
              width: '100%',
              height: isFullscreen ? 'calc(100vh - 120px)' : '540px',
            }}
          />
        )}
      </Box>
    </Card>
  );
}
