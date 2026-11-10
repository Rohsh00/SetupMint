import React, { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ZoomOutMapRoundedIcon from '@mui/icons-material/ZoomOutMapRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  CrosshairMode,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import { api } from '../../lib/api.js';
import { formatPrice, getCurrencySymbol } from '../../lib/utils.js';
import { useAccountScope } from '../../context/AccountScopeContext.js';
import { useAuth } from '../../context/AuthContext.js';

export interface PropPositionOverlay {
  tradeId?: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss?: number | null;
  target?: number | null;
  quantity?: number;
  currentLtp?: number;
  dailyBreachPrice?: number | null;
}

export interface LiveMarketChartProps {
  initialSymbol?: string;
  accountId?: string;
  mode?: 'AUTO' | 'PROP' | 'NORMAL';
  compact?: boolean;
  height?: number;
  lockedSymbol?: boolean;
  positionOverlay?: PropPositionOverlay | null;
  showIndicators?: boolean;
  showVolume?: boolean;
  showTradeLevels?: boolean;
  onSettingsChange?: (settings: { showIndicators?: boolean; showVolume?: boolean; showTradeLevels?: boolean }) => void;
}

export type PropLiveMarketChartProps = LiveMarketChartProps;

const PROP_SYMBOLS = [
  { key: 'XAUUSD', label: 'XAUUSD (Gold)' },
  { key: 'EURUSD', label: 'EURUSD' },
  { key: 'GBPUSD', label: 'GBPUSD' },
  { key: 'USDJPY', label: 'USDJPY' },
  { key: 'NAS100', label: 'NAS100' },
  { key: 'US30', label: 'US30' },
  { key: 'BTCUSD', label: 'BTCUSD' },
  { key: 'ETHUSD', label: 'ETHUSD' },
];

const NORMAL_SYMBOLS = [
  { key: 'NIFTY', label: 'NIFTY 50' },
  { key: 'BANKNIFTY', label: 'BANK NIFTY' },
  { key: 'FINNIFTY', label: 'FINNIFTY' },
  { key: 'SENSEX', label: 'SENSEX' },
  { key: 'CRUDEOIL', label: 'Crude Oil' },
  { key: 'GOLD', label: 'Gold (MCX)' },
  { key: 'RELIANCE', label: 'Reliance' },
  { key: 'HDFCBANK', label: 'HDFC Bank' },
];

const RESOLUTIONS = [
  { key: '1', label: '1m' },
  { key: '5', label: '5m' },
  { key: '15', label: '15m' },
  { key: '30', label: '30m' },
  { key: '60', label: '1h' },
  { key: 'D', label: '1D' },
];

export function LiveMarketChart({
  initialSymbol,
  accountId,
  mode = 'AUTO',
  compact = false,
  height = 420,
  lockedSymbol = false,
  positionOverlay = null,
  showIndicators: propShowIndicators,
  showVolume: propShowVolume,
  showTradeLevels: propShowTradeLevels,
  onSettingsChange,
}: LiveMarketChartProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const { isPropMode, currency: activeCurrency, activeAccount } = useAccountScope();
  const { user } = useAuth();
  const displayDefaults = user?.liveWatcherSettings?.displaySettings;

  const [showIndicators, setShowIndicators] = useState<boolean>(() =>
    propShowIndicators !== undefined
      ? propShowIndicators
      : displayDefaults?.showChartIndicators ?? true
  );
  const [showVolume, setShowVolume] = useState<boolean>(() =>
    propShowVolume !== undefined
      ? propShowVolume
      : displayDefaults?.showChartVolume ?? true
  );
  const [showTradeLevels, setShowTradeLevels] = useState<boolean>(() =>
    propShowTradeLevels !== undefined
      ? propShowTradeLevels
      : displayDefaults?.showChartTradeLevels ?? true
  );

  useEffect(() => {
    if (propShowIndicators !== undefined) setShowIndicators(propShowIndicators);
  }, [propShowIndicators]);
  useEffect(() => {
    if (propShowVolume !== undefined) setShowVolume(propShowVolume);
  }, [propShowVolume]);
  useEffect(() => {
    if (propShowTradeLevels !== undefined) setShowTradeLevels(propShowTradeLevels);
  }, [propShowTradeLevels]);

  const [chartSettingsAnchor, setChartSettingsAnchor] = useState<null | HTMLElement>(null);

  const effectiveMode = mode === 'AUTO' ? (isPropMode ? 'PROP' : 'NORMAL') : mode;
  const activeSymbols = effectiveMode === 'NORMAL' ? NORMAL_SYMBOLS : PROP_SYMBOLS;
  const defaultSym = initialSymbol || (effectiveMode === 'NORMAL' ? 'NIFTY' : 'XAUUSD');

  const [symbol, setSymbol] = useState<string>(defaultSym.toUpperCase());
  const [resolution, setResolution] = useState<string>('5');
  const [chartMode, setChartMode] = useState<'SETUPMINT' | 'TRADINGVIEW'>('SETUPMINT');
  const [expandedHeight, setExpandedHeight] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [streamData, setStreamData] = useState<any | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{
    timeStr: string;
    open: number;
    high: number;
    low: number;
    close: number;
    pct: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const isFirstFitRef = useRef<boolean>(true);

  useEffect(() => {
    if (initialSymbol) {
      setSymbol(initialSymbol.toUpperCase());
    } else {
      setSymbol(effectiveMode === 'NORMAL' ? 'NIFTY' : 'XAUUSD');
    }
  }, [initialSymbol, effectiveMode]);

  const activeHeight = expandedHeight ? Math.max(height + 200, 620) : height;

  const fetchLiveCandles = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const res = await api.accounts.propCandles({
        symbol,
        resolution,
        bars: 180,
        accountId,
      });
      const payload = (res as any)?.data || res;
      if (payload) {
        setStreamData(payload);
      }
    } catch {
      // Keep existing candles if transient network error occurs
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Fetch on symbol/resolution change + 5-second live polling
  useEffect(() => {
    isFirstFitRef.current = true;
    fetchLiveCandles(false);
    const timer = setInterval(() => {
      fetchLiveCandles(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [symbol, resolution, accountId]);

  // Initialize lightweight-charts canvas when in SETUPMINT mode
  useEffect(() => {
    if (chartMode !== 'SETUPMINT') return;
    const container = containerRef.current;
    if (!container) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const decimals =
      symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('AUD') || symbol.includes('NZD')
        ? 5
        : symbol.includes('JPY')
        ? 3
        : 2;
    const minMove = decimals === 5 ? 0.00001 : decimals === 3 ? 0.001 : 0.01;

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: activeHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0B0F19' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
        fontFamily: `'JetBrains Mono', monospace`,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#64748B' : '#94A3B8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1E293B' : '#F1F5F9',
        },
        horzLine: {
          color: isDark ? '#64748B' : '#94A3B8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1E293B' : '#F1F5F9',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#1E293B' : '#E2E8F0',
        autoScale: true,
        scaleMargins: { top: 0.12, bottom: 0.2 },
      },
      timeScale: {
        borderColor: isDark ? '#1E293B' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 8,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderUpColor: '#10B981',
      borderDownColor: '#F43F5E',
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
      priceFormat: {
        type: 'price',
        precision: decimals,
        minMove,
      },
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(16, 185, 129, 0.28)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoveredBar(null);
        return;
      }
      const bar: any = param.seriesData.get(candleSeries);
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
        setHoveredBar({
          timeStr: `${timeStr} IST`,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          pct,
        });
      }
    });

    const ro = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width: newWidth } = entries[0].contentRect;
      if (newWidth > 0 && chartRef.current) {
        chartRef.current.applyOptions({ width: newWidth, height: activeHeight });
      }
    });
    ro.observe(container);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current = volSeries;
    priceLinesRef.current = [];

    return () => {
      ro.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartMode, symbol, isDark, activeHeight]);

  // Apply candle data & horizontal risk price lines whenever streamData or positionOverlay updates
  useEffect(() => {
    if (chartMode !== 'SETUPMINT') return;
    if (!candleSeriesRef.current || !volSeriesRef.current || !chartRef.current) return;
    if (!streamData || !Array.isArray(streamData.candles) || streamData.candles.length === 0) return;

    const candles = streamData.candles.map((c: any) => ({
      time: c.time as UTCTimestamp,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));

    // If positionOverlay has a live currentLtp, keep the tip candle synced with it
    if (positionOverlay?.currentLtp && candles.length > 0) {
      const tip = candles[candles.length - 1];
      const relDiff = Math.abs(positionOverlay.currentLtp - tip.close) / positionOverlay.currentLtp;
      if (relDiff < 0.01) {
        tip.close = positionOverlay.currentLtp;
        if (tip.close > tip.high) tip.high = tip.close;
        if (tip.close < tip.low) tip.low = tip.close;
      }
    }

    const volumes = streamData.candles.map((c: any) => ({
      time: c.time as UTCTimestamp,
      value: Number(c.volume || 0),
      color: Number(c.close) >= Number(c.open) ? 'rgba(16, 185, 129, 0.32)' : 'rgba(244, 63, 94, 0.32)',
    }));

    candleSeriesRef.current.setData(candles);
    if (showVolume) {
      volSeriesRef.current.setData(volumes);
    } else {
      volSeriesRef.current.setData([]);
    }

    // Clear old price lines
    for (const pl of priceLinesRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(pl);
      } catch {}
    }
    priceLinesRef.current = [];

    if (showTradeLevels) {
      // Combine explicit positionOverlay with any activeOverlays returned by the API for this symbol
      const overlaysToDraw: PropPositionOverlay[] = positionOverlay
        ? [positionOverlay]
        : Array.isArray(streamData.activeOverlays)
        ? streamData.activeOverlays
        : [];

      for (const ov of overlaysToDraw) {
        if (ov.entryPrice > 0) {
          const entryLine = candleSeriesRef.current.createPriceLine({
            price: ov.entryPrice,
            color: '#3B82F6',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${ov.direction} ENTRY (${ov.quantity || ''} lots)`,
          });
          priceLinesRef.current.push(entryLine);
        }
        if (ov.stopLoss && ov.stopLoss > 0) {
          const slLine = candleSeriesRef.current.createPriceLine({
            price: ov.stopLoss,
            color: '#EF4444',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: 'STOP LOSS (SL)',
          });
          priceLinesRef.current.push(slLine);
        }
        if (ov.target && ov.target > 0) {
          const tpLine = candleSeriesRef.current.createPriceLine({
            price: ov.target,
            color: '#10B981',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'TARGET (1:2 RR)',
          });
          priceLinesRef.current.push(tpLine);
        }
        if (ov.dailyBreachPrice && ov.dailyBreachPrice > 0) {
          const breachLine = candleSeriesRef.current.createPriceLine({
            price: ov.dailyBreachPrice,
            color: '#F97316',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: '3% DAILY BREACH LEVEL',
          });
          priceLinesRef.current.push(breachLine);
        }
      }
    }

    if (isFirstFitRef.current) {
      chartRef.current.timeScale().fitContent();
      isFirstFitRef.current = false;
    }
  }, [streamData, positionOverlay, chartMode, showVolume, showTradeLevels]);

  const quote = streamData?.quote;
  const liveLtp = positionOverlay?.currentLtp || quote?.ltp || streamData?.candles?.[streamData?.candles?.length - 1]?.close || 0;
  const tvWidgetSymbol = streamData?.tvTicker || `OANDA:${symbol}`;
  const tvInterval = resolution === 'D' ? 'D' : resolution;

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${muiTheme.palette.divider}`,
        bgcolor: isDark ? '#0B0F19' : '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      {/* Top Control Bar */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          bgcolor: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(248, 250, 252, 0.9)',
        }}
      >
        {/* Left: Symbol Switcher + Live Spot Price */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <CandlestickChartRoundedIcon sx={{ fontSize: 18, color: '#8B5CF6' }} />
          {!lockedSymbol ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              {activeSymbols.map((s) => (
                <Chip
                  key={s.key}
                  size="small"
                  label={s.key}
                  onClick={() => setSymbol(s.key)}
                  sx={{
                    height: 22,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    bgcolor:
                      symbol === s.key
                        ? '#8B5CF6'
                        : isDark
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(0,0,0,0.05)',
                    color: symbol === s.key ? '#FFFFFF' : 'text.primary',
                    '&:hover': {
                      bgcolor: symbol === s.key ? '#7C3AED' : 'rgba(139, 92, 246, 0.15)',
                    },
                  }}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: '-0.01em' }}>
              {symbol} LIVE CHART
            </Typography>
          )}

          {liveLtp > 0 && (
            <Chip
              size="small"
              label={`${getCurrencySymbol(activeAccount?.profile?.baseCurrency || activeAccount?.baseCurrency || (activeCurrency !== 'MULTI' ? activeCurrency : 'USD'))}${formatPrice(liveLtp)} ${
                quote?.changePct !== undefined
                  ? `(${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%)`
                  : ''
              }`}
              sx={{
                height: 22,
                fontWeight: 800,
                fontSize: '0.72rem',
                fontVariantNumeric: 'tabular-nums',
                bgcolor:
                  (quote?.changePct ?? 0) >= 0
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                color: (quote?.changePct ?? 0) >= 0 ? '#10B981' : '#EF4444',
                border: `1px solid ${
                  (quote?.changePct ?? 0) >= 0
                    ? 'rgba(16, 185, 129, 0.35)'
                    : 'rgba(239, 68, 68, 0.35)'
                }`,
              }}
            />
          )}

          <Chip
            size="small"
            label="● LIVE SPOT (5s)"
            sx={{
              height: 20,
              fontSize: '0.625rem',
              fontWeight: 800,
              bgcolor: 'rgba(16, 185, 129, 0.12)',
              color: '#10B981',
            }}
          />
        </Box>

        {/* Right: Timeframe Switcher + Chart Engine Mode Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ButtonGroup size="small" variant="outlined">
            {RESOLUTIONS.map((r) => (
              <Button
                key={r.key}
                onClick={() => setResolution(r.key)}
                variant={resolution === r.key ? 'contained' : 'outlined'}
                sx={{
                  px: 1,
                  py: 0.2,
                  minWidth: 34,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  ...(resolution === r.key
                    ? { bgcolor: '#8B5CF6', '&:hover': { bgcolor: '#7C3AED' } }
                    : {}),
                }}
              >
                {r.label}
              </Button>
            ))}
          </ButtonGroup>

          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="SetupMint Risk Chart — Plots live Entry, Stop Loss, and 1:2 RR Target lines directly on spot-calibrated candles">
              <Button
                variant={chartMode === 'SETUPMINT' ? 'contained' : 'outlined'}
                onClick={() => setChartMode('SETUPMINT')}
                startIcon={<LayersRoundedIcon sx={{ fontSize: 13 }} />}
                sx={{
                  px: 1,
                  py: 0.2,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  ...(chartMode === 'SETUPMINT'
                    ? { bgcolor: '#10B981', '&:hover': { bgcolor: '#059669' } }
                    : {}),
                }}
              >
                Risk Overlay
              </Button>
            </Tooltip>
            <Tooltip title="TradingView Advanced Chart — Full indicators, drawing tools, EMAs, and multi-timeframe analysis">
              <Button
                variant={chartMode === 'TRADINGVIEW' ? 'contained' : 'outlined'}
                onClick={() => setChartMode('TRADINGVIEW')}
                sx={{
                  px: 1,
                  py: 0.2,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  ...(chartMode === 'TRADINGVIEW'
                    ? { bgcolor: '#3B82F6', '&:hover': { bgcolor: '#2563EB' } }
                    : {}),
                }}
              >
                TradingView Widget
              </Button>
            </Tooltip>
          </ButtonGroup>

          {chartMode === 'SETUPMINT' && (
            <Tooltip title="Fit candles & SL/TP lines to view">
              <IconButton
                size="small"
                onClick={() => chartRef.current?.timeScale().fitContent()}
                sx={{ p: 0.5 }}
              >
                <ZoomOutMapRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="Refresh live candles">
            <IconButton size="small" onClick={() => fetchLiveCandles(false)} sx={{ p: 0.5 }}>
              <RefreshRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Chart Display Elements">
            <IconButton
              size="small"
              onClick={(e) => setChartSettingsAnchor(e.currentTarget)}
              sx={{ p: 0.5 }}
            >
              <TuneRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={chartSettingsAnchor}
            open={Boolean(chartSettingsAnchor)}
            onClose={() => setChartSettingsAnchor(null)}
            slotProps={{
              paper: {
                sx: {
                  borderRadius: 2,
                  minWidth: 220,
                  bgcolor: isDark ? '#1E293B' : '#FFFFFF',
                  border: `1px solid ${muiTheme.palette.divider}`,
                  boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.5)' : '0 10px 25px rgba(0,0,0,0.1)',
                },
              },
            }}
          >
            <MenuItem
              onClick={() => {
                const next = !showVolume;
                setShowVolume(next);
                onSettingsChange?.({ showVolume: next, showTradeLevels, showIndicators });
              }}
              sx={{ py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {showVolume ? <CheckRoundedIcon fontSize="small" sx={{ color: '#10B981' }} /> : <Box sx={{ width: 18 }} />}
              </ListItemIcon>
              <ListItemText primary={<Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Volume Histogram</Typography>} />
            </MenuItem>
            <MenuItem
              onClick={() => {
                const next = !showTradeLevels;
                setShowTradeLevels(next);
                onSettingsChange?.({ showVolume, showTradeLevels: next, showIndicators });
              }}
              sx={{ py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {showTradeLevels ? <CheckRoundedIcon fontSize="small" sx={{ color: '#10B981' }} /> : <Box sx={{ width: 18 }} />}
              </ListItemIcon>
              <ListItemText primary={<Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Trade Lines (SL/TP/Entry)</Typography>} />
            </MenuItem>
            <MenuItem
              onClick={() => {
                const next = !showIndicators;
                setShowIndicators(next);
                onSettingsChange?.({ showVolume, showTradeLevels, showIndicators: next });
              }}
              sx={{ py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {showIndicators ? <CheckRoundedIcon fontSize="small" sx={{ color: '#10B981' }} /> : <Box sx={{ width: 18 }} />}
              </ListItemIcon>
              <ListItemText primary={<Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>OHLC &amp; Live Bar Stats</Typography>} />
            </MenuItem>
          </Menu>

          {!compact && (
            <Tooltip title={expandedHeight ? 'Standard height' : 'Expand chart height'}>
              <IconButton
                size="small"
                onClick={() => setExpandedHeight((prev) => !prev)}
                sx={{ p: 0.5 }}
              >
                {expandedHeight ? (
                  <CloseFullscreenRoundedIcon sx={{ fontSize: 16 }} />
                ) : (
                  <OpenInFullRoundedIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Crosshair OHLC HUD Bar (SetupMint Mode) */}
      {chartMode === 'SETUPMINT' && hoveredBar && showIndicators && (
        <Box
          sx={{
            px: 1.5,
            py: 0.4,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
            fontSize: '0.7rem',
            fontFamily: `'JetBrains Mono', monospace`,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            bgcolor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(241, 245, 249, 0.85)',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            {hoveredBar.timeStr}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
            O: <strong>{formatPrice(hoveredBar.open)}</strong>
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
            H: <strong>{formatPrice(hoveredBar.high)}</strong>
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
            L: <strong>{formatPrice(hoveredBar.low)}</strong>
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
            C: <strong>{formatPrice(hoveredBar.close)}</strong> (
            <span style={{ color: hoveredBar.pct >= 0 ? '#10B981' : '#EF4444' }}>
              {hoveredBar.pct >= 0 ? '+' : ''}
              {hoveredBar.pct.toFixed(2)}%
            </span>
            )
          </Typography>
        </Box>
      )}

      {/* Main Chart Body */}
      <Box sx={{ position: 'relative', width: '100%', height: activeHeight }}>
        {chartMode === 'SETUPMINT' ? (
          <>
            {loading && (!streamData || !streamData.candles?.length) && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  bgcolor: isDark ? 'rgba(11, 15, 25, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                }}
              >
                <CircularProgress size={22} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Streaming spot-calibrated {symbol} candles...
                </Typography>
              </Box>
            )}
            <div ref={containerRef} style={{ width: '100%', height: activeHeight }} />
          </>
        ) : (
          <iframe
            key={`${tvWidgetSymbol}-${tvInterval}-${isDark ? 'dark' : 'light'}`}
            title={`TradingView Live Chart ${symbol}`}
            src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
              tvWidgetSymbol
            )}&interval=${encodeURIComponent(tvInterval)}&theme=${
              isDark ? 'dark' : 'light'
            }&style=1&timezone=Asia%2FKolkata&withdateranges=1&hide_side_toolbar=0&allow_symbol_change=1&saveimage=1&studies=%5B%5D`}
            style={{
              width: '100%',
              height: activeHeight,
              border: 'none',
              display: 'block',
            }}
          />
        )}
      </Box>
    </Box>
  );
}

export const PropLiveMarketChart = LiveMarketChart;

