import React, { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
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

export function getTradingViewWidgetSymbol(symbol: string, isProp: boolean): string {
  const s = String(symbol || 'XAUUSD').trim().toUpperCase();
  if (s === 'XAUUSD') return 'OANDA:XAUUSD';
  if (s === 'EURUSD') return 'OANDA:EURUSD';
  if (s === 'GBPUSD') return 'OANDA:GBPUSD';
  if (s === 'USDJPY') return 'OANDA:USDJPY';
  if (s === 'NAS100' || s === 'USTEC' || s === 'NDX') return 'OANDA:NAS100USD';
  if (s === 'US30' || s === 'DJ30') return 'OANDA:US30USD';
  if (s === 'SPX500' || s === 'US500') return 'OANDA:SPX500USD';
  if (s === 'BTCUSD' || s === 'BTCUSDT') return 'BINANCE:BTCUSDT';
  if (s === 'ETHUSD' || s === 'ETHUSDT') return 'BINANCE:ETHUSDT';

  if (s.includes('BANKNIFTY')) return 'NSE:BANKNIFTY';
  if (s.includes('FINNIFTY')) return 'NSE:FINNIFTY';
  if (s.includes('MIDCPNIFTY')) return 'NSE:MIDCPNIFTY';
  if (s.includes('NIFTY')) return 'NSE:NIFTY';
  if (s.includes('SENSEX')) return 'BSE:SENSEX';
  if (s.includes('CRUDEOIL')) return 'MCX:CRUDEOIL1!';
  if (s.includes('NATURALGAS')) return 'MCX:NATURALGAS1!';
  if (s.includes('GOLD')) return 'MCX:GOLD1!';
  if (s.includes('SILVER')) return 'MCX:SILVER1!';

  return isProp ? `OANDA:${s}` : `NSE:${s}`;
}

export function LiveMarketChart({
  initialSymbol,
  accountId,
  mode = 'AUTO',
  compact = false,
  height = 420,
  lockedSymbol = false,
  positionOverlay = null,
  showTradeLevels = true,
}: LiveMarketChartProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const { isPropMode, currency: activeCurrency, activeAccount } = useAccountScope();
  const { user } = useAuth();

  const effectiveMode = mode === 'AUTO' ? (isPropMode ? 'PROP' : 'NORMAL') : mode;
  const activeSymbols = effectiveMode === 'NORMAL' ? NORMAL_SYMBOLS : PROP_SYMBOLS;
  const defaultSym = initialSymbol || (effectiveMode === 'NORMAL' ? 'NIFTY' : 'XAUUSD');

  const [symbol, setSymbol] = useState<string>(defaultSym.toUpperCase());
  const [resolution, setResolution] = useState<string>('5');
  const [expandedHeight, setExpandedHeight] = useState<boolean>(false);
  const [hudMinimized, setHudMinimized] = useState<boolean>(false);

  useEffect(() => {
    if (initialSymbol) {
      setSymbol(initialSymbol.toUpperCase());
    } else {
      setSymbol(effectiveMode === 'NORMAL' ? 'NIFTY' : 'XAUUSD');
    }
  }, [initialSymbol, effectiveMode]);

  const activeHeight = expandedHeight ? Math.max(height + 220, 640) : height;
  const tvWidgetSymbol = useMemo(
    () => getTradingViewWidgetSymbol(symbol, effectiveMode === 'PROP'),
    [symbol, effectiveMode]
  );
  const tvInterval = resolution === '60' ? '60' : resolution === 'D' ? 'D' : resolution;

  const currSym = getCurrencySymbol(
    activeAccount?.profile?.baseCurrency || activeAccount?.baseCurrency || (activeCurrency !== 'MULTI' ? activeCurrency : 'USD')
  );

  // Position calculations for Floating HUD
  const isOverlayActive = Boolean(
    positionOverlay && positionOverlay.entryPrice > 0 && showTradeLevels
  );
  const isLong = positionOverlay?.direction === 'LONG';
  const ltp = positionOverlay?.currentLtp || positionOverlay?.entryPrice || 0;
  const entryPrice = positionOverlay?.entryPrice || 0;
  const stopLoss = positionOverlay?.stopLoss;
  const target = positionOverlay?.target;

  const distToSl = useMemo(() => {
    if (!entryPrice || !stopLoss) return null;
    return isLong ? entryPrice - stopLoss : stopLoss - entryPrice;
  }, [entryPrice, stopLoss, isLong]);

  const liveFloatingPnl = useMemo(() => {
    if (!isOverlayActive || !ltp || !entryPrice || !positionOverlay?.quantity) return null;
    const diff = isLong ? ltp - entryPrice : entryPrice - ltp;
    return diff * positionOverlay.quantity;
  }, [isOverlayActive, ltp, entryPrice, isLong, positionOverlay?.quantity]);

  const liveR = useMemo(() => {
    if (!distToSl || distToSl <= 0 || !ltp || !entryPrice) return null;
    const currentRun = isLong ? ltp - entryPrice : entryPrice - ltp;
    return currentRun / distToSl;
  }, [distToSl, ltp, entryPrice, isLong]);

  return (
    <Box
      sx={{
        width: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        bgcolor: isDark ? '#0b0f19' : '#ffffff',
        boxShadow: isDark
          ? '0 4px 20px rgba(0, 0, 0, 0.35)'
          : '0 4px 20px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Top Header Bar: Instrument Selector & Resolution Controls */}
      <Box
        sx={{
          px: 1.5,
          py: 0.8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          bgcolor: isDark ? '#111827' : '#f8fafc',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CandlestickChartRoundedIcon sx={{ fontSize: 18, color: '#3B82F6' }} />
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 900,
                fontSize: '0.8125rem',
                letterSpacing: '-0.01em',
                fontFamily: `'JetBrains Mono', monospace`,
              }}
            >
              TRADINGVIEW TERMINAL
            </Typography>
          </Box>

          {!lockedSymbol ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              {activeSymbols.map((s) => (
                <Chip
                  key={s.key}
                  label={s.key}
                  size="small"
                  onClick={() => setSymbol(s.key)}
                  sx={{
                    height: 24,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    bgcolor:
                      symbol === s.key
                        ? '#3B82F6'
                        : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(0,0,0,0.05)',
                    color: symbol === s.key ? '#FFFFFF' : 'text.primary',
                    '&:hover': {
                      bgcolor: symbol === s.key ? '#2563EB' : 'rgba(59, 130, 246, 0.15)',
                    },
                  }}
                />
              ))}
            </Box>
          ) : (
            <Chip
              label={symbol}
              size="small"
              sx={{
                height: 24,
                fontSize: '0.72rem',
                fontWeight: 800,
                bgcolor: '#3B82F6',
                color: '#FFFFFF',
              }}
            />
          )}

          {isOverlayActive && (
            <Chip
              size="small"
              icon={<ShieldRoundedIcon sx={{ fontSize: '13px !important', color: '#10B981 !important' }} />}
              label={`Live ${positionOverlay?.direction} (${positionOverlay?.quantity || 1} lots)`}
              sx={{
                height: 22,
                fontSize: '0.68rem',
                fontWeight: 800,
                bgcolor: 'rgba(16, 185, 129, 0.12)',
                color: '#10B981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {/* Timeframe Buttons */}
          <ButtonGroup size="small" variant="outlined" sx={{ height: 26 }}>
            {RESOLUTIONS.map((r) => (
              <Button
                key={r.key}
                onClick={() => setResolution(r.key)}
                sx={{
                  px: 0.9,
                  py: 0.2,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  minWidth: 32,
                  bgcolor: resolution === r.key ? '#3B82F6' : 'transparent',
                  color: resolution === r.key ? '#FFFFFF' : 'text.secondary',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                  '&:hover': {
                    bgcolor: resolution === r.key ? '#2563EB' : alpha('#3B82F6', 0.12),
                  },
                }}
              >
                {r.label}
              </Button>
            ))}
          </ButtonGroup>

          {/* Launch in TradingView Web */}
          <Tooltip title="Open full chart on TradingView.com" arrow>
            <IconButton
              size="small"
              component="a"
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvWidgetSymbol)}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                p: 0.5,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                borderRadius: '6px',
                '&:hover': { color: '#3B82F6' },
              }}
            >
              <OpenInNewRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>

          {/* Expand / Minimize Height */}
          <Tooltip title={expandedHeight ? 'Collapse chart height' : 'Expand chart height'} arrow>
            <IconButton
              size="small"
              onClick={() => setExpandedHeight(!expandedHeight)}
              sx={{
                p: 0.5,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                borderRadius: '6px',
              }}
            >
              {expandedHeight ? (
                <CloseFullscreenRoundedIcon sx={{ fontSize: 15 }} />
              ) : (
                <OpenInFullRoundedIcon sx={{ fontSize: 15 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Canvas Area: TradingView Advanced Widget + Floating Trade HUD */}
      <Box sx={{ position: 'relative', width: '100%', height: activeHeight, bgcolor: '#131722' }}>
        {/* TradingView Advanced Real-Time Chart Iframe */}
        <iframe
          key={`${tvWidgetSymbol}-${tvInterval}-${isDark ? 'dark' : 'light'}`}
          title={`TradingView Chart ${symbol}`}
          src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
            tvWidgetSymbol
          )}&interval=${encodeURIComponent(tvInterval)}&theme=${
            isDark ? 'dark' : 'light'
          }&style=1&timezone=Asia%2FKolkata&withdateranges=1&hide_side_toolbar=0&allow_symbol_change=1&saveimage=1&studies=%5B%5D`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
        />

        {/* Floating "Glass Cockpit" Trade HUD: Position Levels Overlaid in Top-Right */}
        {isOverlayActive && (
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              right: 12,
              zIndex: 10,
              maxWidth: { xs: 260, sm: 320 },
              backdropFilter: 'blur(12px)',
              bgcolor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
            }}
          >
            {/* HUD Header Strip */}
            <Box
              sx={{
                px: 1.25,
                py: 0.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                borderBottom: hudMinimized ? 'none' : '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Chip
                  label={positionOverlay?.direction}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.625rem',
                    fontWeight: 900,
                    bgcolor: isLong ? '#10B981' : '#EF4444',
                    color: '#FFFFFF',
                    borderRadius: '4px',
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 800,
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: '0.72rem',
                    color: isDark ? '#F1F5F9' : '#0F172A',
                  }}
                >
                  {positionOverlay?.quantity || 1} lots @ {currSym}{formatPrice(entryPrice)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {liveFloatingPnl !== null && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 900,
                      fontFamily: `'JetBrains Mono', monospace`,
                      fontSize: '0.72rem',
                      color: liveFloatingPnl >= 0 ? '#10B981' : '#EF4444',
                    }}
                  >
                    {liveFloatingPnl >= 0 ? '+' : ''}{currSym}{liveFloatingPnl.toFixed(2)}
                    {liveR !== null ? ` (${liveR >= 0 ? '+' : ''}${liveR.toFixed(1)}R)` : ''}
                  </Typography>
                )}
                <IconButton
                  size="small"
                  onClick={() => setHudMinimized(!hudMinimized)}
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  {hudMinimized ? (
                    <KeyboardArrowDownRoundedIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <KeyboardArrowUpRoundedIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Box>
            </Box>

            {/* Collapsible HUD Detail Metrics */}
            <Collapse in={!hudMinimized}>
              <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {/* Stop Loss Level */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <ShieldRoundedIcon sx={{ fontSize: 13, color: '#EF4444' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary' }}>
                      STOP LOSS:
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: '#EF4444',
                    }}
                  >
                    {stopLoss ? `${currSym}${formatPrice(stopLoss)}` : 'None'}
                    {distToSl !== null ? ` (${distToSl.toFixed(2)} pts)` : ''}
                  </Typography>
                </Box>

                {/* Target Level */}
                {target && target > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <FlagRoundedIcon sx={{ fontSize: 13, color: '#10B981' }} />
                      <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary' }}>
                        TARGET (1:2 RR):
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        fontFamily: `'JetBrains Mono', monospace`,
                        color: '#10B981',
                      }}
                    >
                      {currSym}{formatPrice(target)}
                    </Typography>
                  </Box>
                )}

                {/* Prop Firm Daily Breach Price */}
                {positionOverlay?.dailyBreachPrice && positionOverlay.dailyBreachPrice > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <WarningAmberRoundedIcon sx={{ fontSize: 13, color: '#F97316' }} />
                      <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#F97316' }}>
                        DAILY LOSS LIMIT:
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        fontFamily: `'JetBrains Mono', monospace`,
                        color: '#F97316',
                      }}
                    >
                      {currSym}{formatPrice(positionOverlay.dailyBreachPrice)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Collapse>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export const PropLiveMarketChart = LiveMarketChart;
