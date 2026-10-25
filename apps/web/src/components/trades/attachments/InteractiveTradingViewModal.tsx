import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
  Button,
  ButtonGroup,
  useTheme,
  Alert,
} from '@mui/material';
import {
  CloseRounded,
  FullscreenRounded,
  FullscreenExitRounded,
  ZoomOutMapRounded,
  TrackChangesRounded,
  RefreshRounded,
  ShowChartRounded,
  TrendingUpRounded,
  TrendingDownRounded,
  LayersRounded,
  AccessTimeRounded,
} from '@mui/icons-material';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  CrosshairMode,
  createSeriesMarkers,
  ColorType,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { api } from '../../../lib/api.js';

export interface InteractiveTradingViewModalProps {
  open: boolean;
  onClose: () => void;
  tradeId: string;
  initialResolution?: string;
  symbol?: string;
}

const AVAILABLE_RESOLUTIONS: Array<{ key: string; label: string; desc: string }> = [
  { key: '1', label: '1m', desc: '1 Minute' },
  { key: '3', label: '3m', desc: '3 Minutes' },
  { key: '5', label: '5m', desc: '5 Minutes' },
  { key: '15', label: '15m', desc: '15 Minutes' },
  { key: '30', label: '30m', desc: '30 Minutes' },
  { key: '60', label: '1h', desc: '1 Hour' },
  { key: '240', label: '4h', desc: '4 Hours (Trend TF)' },
  { key: 'D', label: '1D', desc: 'Daily' },
];

export function InteractiveTradingViewModal({
  open,
  onClose,
  tradeId,
  initialResolution = '5',
  symbol: fallbackSymbol,
}: InteractiveTradingViewModalProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [resolution, setResolution] = useState<string>(initialResolution);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trade metadata returned from API
  const [tradeData, setTradeData] = useState<any | null>(null);
  const [candlesData, setCandlesData] = useState<any[]>([]);
  const [providerName, setProviderName] = useState<string>('FYERS');
  const [isUnderlying, setIsUnderlying] = useState(false);

  // Crosshair HUD hover state
  const [hoveredCandle, setHoveredCandle] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    changePct: number;
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersPluginRef = useRef<any | null>(null);

  // Keep track of loaded bounds
  const firstTimeRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const resolutionRef = useRef<string>(resolution);
  resolutionRef.current = resolution;

  // Format currency
  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Find closest candle time to an execution timestamp
  const findClosestCandleTime = useCallback((targetEpochSec: number, candles: any[]): number | null => {
    if (!candles || candles.length === 0) return null;
    let closestTime = candles[0].time;
    let minDiff = Math.abs(candles[0].time - targetEpochSec);

    for (const c of candles) {
      const diff = Math.abs(c.time - targetEpochSec);
      if (diff < minDiff) {
        minDiff = diff;
        closestTime = c.time;
      }
    }
    return closestTime;
  }, []);

  // Update chart series, price lines, and markers
  const applyDataToChart = useCallback(
    (candles: any[], trade: any) => {
      if (!candlestickSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) {
        return;
      }

      const csSeries = candlestickSeriesRef.current;
      const volSeries = volumeSeriesRef.current;

      // 1. Candlestick series data
      const chartCandles = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      csSeries.setData(chartCandles);

      // 2. Volume series data
      const chartVolumes = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)',
      }));
      volSeries.setData(chartVolumes);

      // 3. Clear existing price lines
      // Note: in lightweight-charts, removing existing lines requires reference, or re-adding
      // We will attach trade level price lines
      if (trade) {
        const isLong = trade.direction === 'LONG';

        // Entry Price Line
        if (trade.entryPrice) {
          try {
            csSeries.createPriceLine({
              price: trade.entryPrice,
              color: '#10b981',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `Entry (${trade.direction || 'BUY'})`,
            });
          } catch {
            // ignore
          }
        }

        // Exit Price Line
        if (trade.exitPrice) {
          try {
            csSeries.createPriceLine({
              price: trade.exitPrice,
              color: '#f59e0b',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: 'Exit',
            });
          } catch {
            // ignore
          }
        }

        // Stop Loss Line
        if (trade.stopLoss) {
          try {
            csSeries.createPriceLine({
              price: trade.stopLoss,
              color: '#f43f5e',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Stop Loss',
            });
          } catch {
            // ignore
          }
        }

        // Take Profit Line
        if (trade.takeProfit) {
          try {
            csSeries.createPriceLine({
              price: trade.takeProfit,
              color: '#06b6d4',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'Target (TP)',
            });
          } catch {
            // ignore
          }
        }

        // 4. Overlaid Markers for Entry and Exit
        const markers: any[] = [];
        if (trade.entryTime && trade.entryPrice) {
          const entrySec = Math.floor(new Date(trade.entryTime).getTime() / 1000);
          const snappedTime = findClosestCandleTime(entrySec, candles);
          if (snappedTime) {
            markers.push({
              time: snappedTime as UTCTimestamp,
              position: isLong ? 'belowBar' : 'aboveBar',
              color: '#10b981',
              shape: isLong ? 'arrowUp' : 'arrowDown',
              text: `ENTRY @ ₹${trade.entryPrice}`,
            });
          }
        }

        if (trade.exitTime && trade.exitPrice) {
          const exitSec = Math.floor(new Date(trade.exitTime).getTime() / 1000);
          const snappedTime = findClosestCandleTime(exitSec, candles);
          if (snappedTime) {
            markers.push({
              time: snappedTime as UTCTimestamp,
              position: isLong ? 'aboveBar' : 'belowBar',
              color: '#f43f5e',
              shape: isLong ? 'arrowDown' : 'arrowUp',
              text: `EXIT @ ₹${trade.exitPrice}`,
            });
          }
        }

        if (markersPluginRef.current) {
          markersPluginRef.current.setMarkers(markers);
        } else if (markers.length > 0) {
          try {
            markersPluginRef.current = createSeriesMarkers(csSeries, markers);
          } catch {
            // ignore
          }
        }
      }
    },
    [findClosestCandleTime]
  );

  // Fetch candles from backend
  const fetchCandles = useCallback(
    async (res: string, force = false) => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const resp = await api.trades.getInteractiveCandles(tradeId, {
          resolution: res,
          force,
          preloadBefore: 180,
          preloadAfter: 60,
        });

        if (resp && resp.candles && resp.candles.length > 0) {
          setTradeData(resp.trade);
          setCandlesData(resp.candles);
          setProviderName(resp.provider || 'FYERS');
          setIsUnderlying(resp.isUnderlyingFallback);
          firstTimeRef.current = resp.firstTime;
          lastTimeRef.current = resp.lastTime;
          setHasMoreHistory(true);

          // Apply data to chart
          applyDataToChart(resp.candles, resp.trade);

          // Auto-fit content
          if (chartInstanceRef.current) {
            chartInstanceRef.current.timeScale().fitContent();
          }
        } else {
          setErrorMsg('No candle data available for this timeframe.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load interactive chart candles.');
      } finally {
        setLoading(false);
      }
    },
    [tradeId, applyDataToChart]
  );

  // Fetch older candles when user pans left
  const fetchOlderHistory = useCallback(async () => {
    if (loadingMore || !hasMoreHistory || !firstTimeRef.current) return;

    try {
      setLoadingMore(true);
      const toTime = firstTimeRef.current - 1;

      const resp = await api.trades.getInteractiveCandles(tradeId, {
        resolution: resolutionRef.current,
        to: toTime,
        preloadBefore: 150,
      });

      if (resp && resp.candles && resp.candles.length > 0) {
        // Prepend candles
        setCandlesData((prev) => {
          const seen = new Set(prev.map((c) => c.time));
          const newCandles = resp.candles.filter((c) => !seen.has(c.time));
          if (newCandles.length === 0) {
            setHasMoreHistory(false);
            return prev;
          }
          const combined = [...newCandles, ...prev].sort((a, b) => a.time - b.time);
          firstTimeRef.current = combined[0].time;
          applyDataToChart(combined, tradeData);
          return combined;
        });
      } else {
        setHasMoreHistory(false);
      }
    } catch {
      setHasMoreHistory(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreHistory, tradeId, tradeData, applyDataToChart]);

  // Initialize TradingView Lightweight Chart canvas
  useEffect(() => {
    if (!open || !chartContainerRef.current) return;

    const container = chartContainerRef.current;

    // Create chart instance
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontFamily: `'JetBrains Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 3,
      },
    });

    // Add Candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    // Add Volume series (Histogram overlay at bottom)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(16, 185, 129, 0.45)',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // Overlay over main pane
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartInstanceRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair move listener for HUD details
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoveredCandle(null);
        return;
      }

      const bar: any = param.seriesData.get(candlestickSeries);
      const volBar: any = param.seriesData.get(volumeSeries);

      if (bar) {
        const chg = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0;
        const dateStr = new Date((param.time as number) * 1000).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        setHoveredCandle({
          time: dateStr,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: volBar?.value || 0,
          changePct: chg,
        });
      }
    });

    // Infinite scroll / lazy loading on pan left
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (logicalRange && logicalRange.from < 5) {
        fetchOlderHistory();
      }
    });

    // Resize observer for responsive layout
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    // Initial fetch
    fetchCandles(resolution);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersPluginRef.current = null;
    };
  }, [open, resolution, fetchCandles, fetchOlderHistory]);

  // Handle switching timeframe
  const handleResolutionChange = (newRes: string) => {
    if (newRes === resolution) return;
    setResolution(newRes);
    fetchCandles(newRes);
  };

  // Focus zoom on trade execution range
  const handleFocusExecution = () => {
    if (!chartInstanceRef.current || !tradeData || candlesData.length === 0) return;

    const entrySec = tradeData.entryTime ? Math.floor(new Date(tradeData.entryTime).getTime() / 1000) : null;
    const exitSec = tradeData.exitTime ? Math.floor(new Date(tradeData.exitTime).getTime() / 1000) : entrySec;

    if (entrySec && exitSec) {
      const entryCandleTime = findClosestCandleTime(entrySec, candlesData);
      const exitCandleTime = findClosestCandleTime(exitSec, candlesData);

      if (entryCandleTime && exitCandleTime) {
        // Find indices
        const entryIdx = candlesData.findIndex((c) => c.time === entryCandleTime);
        const exitIdx = candlesData.findIndex((c) => c.time === exitCandleTime);

        if (entryIdx !== -1 && exitIdx !== -1) {
          const fromIdx = Math.max(0, Math.min(entryIdx, exitIdx) - 15);
          const toIdx = Math.min(candlesData.length - 1, Math.max(entryIdx, exitIdx) + 15);

          chartInstanceRef.current.timeScale().setVisibleLogicalRange({
            from: fromIdx,
            to: toIdx,
          });
        }
      }
    }
  };

  const pnl = tradeData?.pnl ?? tradeData?.netPnL;
  const isPnlPositive = pnl !== undefined && pnl >= 0;
  const displaySymbol = tradeData?.symbol || fallbackSymbol || 'SYMBOL';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullScreen={isFullscreen}
      slotProps={{
        paper: {
          sx: {
            width: isFullscreen ? '100vw' : '94vw',
            height: isFullscreen ? '100vh' : '90vh',
            maxWidth: '1800px',
            maxHeight: '1000px',
            m: isFullscreen ? 0 : 2,
            borderRadius: isFullscreen ? 0 : 3,
            backgroundColor: '#090d16',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          },
        },
      }}
    >
      {/* 1. Header Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.5,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0b101d',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        {/* Left: Symbol & Badges */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShowChartRounded sx={{ color: '#06b6d4', fontSize: 24 }} />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
                fontSize: '1.15rem',
                color: '#fff',
                fontFamily: `'JetBrains Mono', monospace`,
                letterSpacing: '-0.02em',
              }}
            >
              {displaySymbol}
            </Typography>
          </Box>

          {/* Direction Badge */}
          {tradeData?.direction && (
            <Chip
              icon={
                tradeData.direction === 'LONG' ? (
                  <TrendingUpRounded sx={{ fontSize: 14, color: '#10b981 !important' }} />
                ) : (
                  <TrendingDownRounded sx={{ fontSize: 14, color: '#f43f5e !important' }} />
                )
              }
              label={tradeData.direction}
              size="small"
              sx={{
                fontWeight: 800,
                fontSize: '0.7rem',
                fontFamily: `'JetBrains Mono', monospace`,
                backgroundColor:
                  tradeData.direction === 'LONG' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: tradeData.direction === 'LONG' ? '#10b981' : '#f43f5e',
                border: `1px solid ${tradeData.direction === 'LONG' ? '#10b98144' : '#f43f5e44'}`,
              }}
            />
          )}

          {/* Realized PnL Badge */}
          {pnl !== undefined && (
            <Chip
              label={`${isPnlPositive ? '+' : ''}${formatCurrency(pnl)} ${
                tradeData?.realizedRMultiple !== undefined ? `(${tradeData.realizedRMultiple > 0 ? '+' : ''}${tradeData.realizedRMultiple}R)` : ''
              }`}
              size="small"
              sx={{
                fontWeight: 800,
                fontSize: '0.72rem',
                fontFamily: `'JetBrains Mono', monospace`,
                backgroundColor: isPnlPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                color: isPnlPositive ? '#34d399' : '#fb7185',
                border: `1px solid ${isPnlPositive ? '#10b98155' : '#f43f5e55'}`,
              }}
            />
          )}

          {/* Strategy / Setup Badge */}
          {(tradeData?.strategyName || tradeData?.setup?.variantKey) && (
            <Chip
              icon={<LayersRounded sx={{ fontSize: 13, color: '#a78bfa !important' }} />}
              label={`${tradeData.strategyName || 'Strategy'}${
                tradeData.setup?.variantKey ? ` • ${tradeData.setup.variantKey}` : ''
              }`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.6875rem',
                fontFamily: `'JetBrains Mono', monospace`,
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                color: '#c4b5fd',
                border: '1px solid rgba(139, 92, 246, 0.3)',
              }}
            />
          )}

          {/* Underlying or Provider tag */}
          <Chip
            label={isUnderlying ? `Underlying Feed (${providerName})` : `${providerName} Real Feed`}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
            }}
          />
        </Box>

        {/* Right: Window Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}>
            <IconButton
              size="small"
              onClick={() => setIsFullscreen(!isFullscreen)}
              sx={{ color: '#94a3b8', '&:hover': { color: '#fff' } }}
            >
              {isFullscreen ? <FullscreenExitRounded /> : <FullscreenRounded />}
            </IconButton>
          </Tooltip>

          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: '#94a3b8',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              '&:hover': { backgroundColor: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e' },
            }}
          >
            <CloseRounded />
          </IconButton>
        </Box>
      </Box>

      {/* 2. Controls Toolbar & Timeframe Switcher */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1,
          backgroundColor: '#0c1221',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        {/* Timeframe Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            variant="caption"
            sx={{
              color: '#64748b',
              fontWeight: 700,
              fontSize: '0.72rem',
              mr: 0.5,
              display: { xs: 'none', sm: 'inline-block' },
            }}
          >
            Timeframe:
          </Typography>

          <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 1.5, overflow: 'hidden' }}>
            {AVAILABLE_RESOLUTIONS.map((res) => {
              const active = resolution === res.key;
              return (
                <Tooltip key={res.key} title={res.desc}>
                  <Button
                    onClick={() => handleResolutionChange(res.key)}
                    disabled={loading}
                    sx={{
                      px: 1.25,
                      py: 0.35,
                      minWidth: 36,
                      fontSize: '0.75rem',
                      fontWeight: active ? 800 : 600,
                      fontFamily: `'JetBrains Mono', monospace`,
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      color: active ? '#fff' : '#94a3b8',
                      backgroundColor: active ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                      boxShadow: active ? 'inset 0 0 10px rgba(6, 182, 212, 0.4)' : 'none',
                      '&:hover': {
                        backgroundColor: active
                          ? 'rgba(6, 182, 212, 0.35)'
                          : 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                      },
                    }}
                  >
                    {res.label}
                  </Button>
                </Tooltip>
              );
            })}
          </ButtonGroup>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TrackChangesRounded sx={{ color: '#10b981' }} />}
            onClick={handleFocusExecution}
            disabled={loading || candlesData.length === 0}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#e2e8f0',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              '&:hover': {
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
              },
            }}
          >
            Focus Execution
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<ZoomOutMapRounded sx={{ color: '#06b6d4' }} />}
            onClick={() => chartInstanceRef.current?.timeScale().fitContent()}
            disabled={loading || candlesData.length === 0}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#e2e8f0',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              '&:hover': {
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
              },
            }}
          >
            Fit All
          </Button>

          <Tooltip title="Refetch historical candles with force refresh">
            <IconButton
              size="small"
              onClick={() => fetchCandles(resolution, true)}
              disabled={loading}
              sx={{
                color: '#94a3b8',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                '&:hover': { color: '#06b6d4', borderColor: '#06b6d4' },
              }}
            >
              <RefreshRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 3. Crosshair HUD & Trade Execution Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 0.75,
          backgroundColor: '#090d16',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          fontSize: '0.75rem',
          fontFamily: `'JetBrains Mono', monospace`,
          color: '#94a3b8',
          flexWrap: 'wrap',
          gap: 1.5,
          minHeight: 36,
        }}
      >
        {/* Left: Real-time Candle Details from Crosshair */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {hoveredCandle ? (
            <>
              <Box sx={{ color: '#cbd5e1', fontWeight: 700 }}>{hoveredCandle.time}</Box>
              <Box>
                O: <span style={{ color: '#fff', fontWeight: 600 }}>{hoveredCandle.open.toFixed(2)}</span>
              </Box>
              <Box>
                H: <span style={{ color: '#10b981', fontWeight: 600 }}>{hoveredCandle.high.toFixed(2)}</span>
              </Box>
              <Box>
                L: <span style={{ color: '#f43f5e', fontWeight: 600 }}>{hoveredCandle.low.toFixed(2)}</span>
              </Box>
              <Box>
                C: <span style={{ color: hoveredCandle.close >= hoveredCandle.open ? '#10b981' : '#f43f5e', fontWeight: 700 }}>{hoveredCandle.close.toFixed(2)}</span>
              </Box>
              <Box>
                Vol: <span style={{ color: '#94a3b8' }}>{hoveredCandle.volume.toLocaleString('en-IN')}</span>
              </Box>
              <Box
                sx={{
                  color: hoveredCandle.changePct >= 0 ? '#10b981' : '#f43f5e',
                  fontWeight: 700,
                }}
              >
                {hoveredCandle.changePct >= 0 ? '+' : ''}
                {hoveredCandle.changePct.toFixed(2)}%
              </Box>
            </>
          ) : (
            <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic' }}>
              Hover over candles to inspect precise OHLCV • Scroll mouse wheel to zoom in/out • Pan left to load history
            </Typography>
          )}
        </Box>

        {/* Right: Trade Markers Legend */}
        {tradeData && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {tradeData.entryPrice && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span>Entry: ₹{tradeData.entryPrice}</span>
              </Box>
            )}

            {tradeData.exitPrice && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <span>Exit: ₹{tradeData.exitPrice}</span>
              </Box>
            )}

            {tradeData.stopLoss && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 2, backgroundColor: '#f43f5e' }} />
                <span>SL: ₹{tradeData.stopLoss}</span>
              </Box>
            )}

            {tradeData.takeProfit && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 2, backgroundColor: '#06b6d4' }} />
                <span>Target: ₹{tradeData.takeProfit}</span>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* 4. Main Chart Canvas Area */}
      <Box sx={{ flex: 1, position: 'relative', width: '100%', minHeight: 0 }}>
        {/* Loading Spinner */}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(9, 13, 22, 0.75)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              backdropFilter: 'blur(3px)',
              gap: 1.5,
            }}
          >
            <CircularProgress size={36} sx={{ color: '#06b6d4' }} />
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
              Streaming {AVAILABLE_RESOLUTIONS.find((r) => r.key === resolution)?.label || resolution} historical candles...
            </Typography>
          </Box>
        )}

        {/* Loading More Indicator (when panning left) */}
        {loadingMore && (
          <Box
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 9,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: 2,
              px: 1.5,
              py: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              backdropFilter: 'blur(4px)',
            }}
          >
            <CircularProgress size={14} sx={{ color: '#06b6d4' }} />
            <Typography variant="caption" sx={{ color: '#cbd5e1', fontSize: '0.7rem', fontWeight: 600 }}>
              Loading earlier history...
            </Typography>
          </Box>
        )}

        {/* Error Alert Overlay */}
        {errorMsg && !loading && (
          <Box
            sx={{
              position: 'absolute',
              top: '30%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 8,
              width: '90%',
              maxWidth: 520,
            }}
          >
            <Alert
              severity="warning"
              variant="filled"
              action={
                <Button color="inherit" size="small" onClick={() => fetchCandles(resolution, true)}>
                  Retry
                </Button>
              }
              sx={{ borderRadius: 2, backgroundColor: '#1e293b', border: '1px solid rgba(245, 158, 11, 0.4)' }}
            >
              {errorMsg}
            </Alert>
          </Box>
        )}

        {/* Canvas DOM Node */}
        <Box
          ref={chartContainerRef}
          sx={{
            width: '100%',
            height: '100%',
          }}
        />
      </Box>
    </Dialog>
  );
}
