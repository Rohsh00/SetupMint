import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Grid';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PieChartRoundedIcon from '@mui/icons-material/PieChartRounded';

import { LiveGivebackMeter } from './LiveGivebackMeter.js';
import { LiveScalingLadder } from './LiveScalingLadder.js';
import { ExecuteLadderStepDialog } from './ExecuteLadderStepDialog.js';
import {
  ILiveWatcherSummary,
  ILiveOpenTradeMetric,
  ILiveTargetLadderStep,
  StopThreatLevel,
} from '@tradevault/shared';
import { api } from '../../../lib/api.js';
import { formatCurrency } from '../../../lib/utils.js';
import { toast } from '../../../context/ToastContext.js';
import { QuickCloseTradeDialog } from '../QuickCloseTradeDialog.js';

export interface LiveOpenTradeWatcherProps {
  accountId?: string;
  defaultExpanded?: boolean;
  showWhenEmpty?: boolean;
  onTradeCloseSuccess?: () => void;
}

export function LiveOpenTradeWatcher({
  accountId,
  defaultExpanded = true,
  showWhenEmpty = false,
  onTradeCloseSuccess,
}: LiveOpenTradeWatcherProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(() => {
    const saved = localStorage.getItem('tv_live_watcher_interval');
    return saved !== null ? Number(saved) : 5;
  });

  // Quick close modal state
  const [quickCloseTrade, setQuickCloseTrade] = useState<any | null>(null);
  const [quickCloseLtp, setQuickCloseLtp] = useState<number | undefined>(undefined);
  const [quickCloseRatio, setQuickCloseRatio] = useState<number>(1.0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Stop Loss adjust modal state
  const [editSlMetric, setEditSlMetric] = useState<ILiveOpenTradeMetric | null>(null);
  const [targetSlPrice, setTargetSlPrice] = useState<string>('');
  const [executeSlOnBroker, setExecuteSlOnBroker] = useState<boolean>(true);

  const updateSlMutation = useMutation({
    mutationFn: async ({
      tradeId,
      newStopLoss,
      executeBroker = true,
    }: {
      tradeId: string;
      newStopLoss: number;
      executeBroker?: boolean;
    }) => {
      return api.trades.liveBrokerSl(tradeId, {
        stopPrice: newStopLoss,
        executeBroker,
      });
    },
    onSuccess: (data: any, variables) => {
      if (data?.brokerResult?.executedOnBroker) {
        toast.success(`🟢 FYERS Live: ${data.brokerResult.message || `Stop Loss moved to ₹${variables.newStopLoss}`}`);
      } else {
        toast.success(`Stop Loss moved to ₹${variables.newStopLoss} successfully!`);
      }
      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setEditSlMetric(null);
      setTargetSlPrice('');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update Stop Loss');
    },
  });

  const handleQuickMoveToBe = (metric: ILiveOpenTradeMetric) => {
    updateSlMutation.mutate({
      tradeId: metric.tradeId,
      newStopLoss: metric.entryPrice,
      executeBroker: true,
    });
  };

  // Scaling Ladder modal state & mutation
  const [selectedLadderStep, setSelectedLadderStep] = useState<{
    step: ILiveTargetLadderStep;
    metric: ILiveOpenTradeMetric;
  } | null>(null);

  const executeLadderMutation = useMutation({
    mutationFn: async ({
      tradeId,
      targetIndex,
      label,
      exitQty,
      exitPrice,
      newStopLoss,
      executeBroker = true,
    }: {
      tradeId: string;
      targetIndex: number;
      label: string;
      exitQty: number;
      exitPrice?: number;
      newStopLoss?: number;
      executeBroker?: boolean;
    }) => {
      return api.trades.liveBrokerLadderStep(tradeId, {
        targetIndex,
        label,
        exitQty,
        exitPrice,
        newStopLoss,
        executeBroker,
      });
    },
    onSuccess: (data: any, variables) => {
      const exitMsg = data?.brokerExitResult?.executedOnBroker
        ? `🟢 FYERS Live: Exited ${variables.exitQty} lots.`
        : `Exited ${variables.exitQty} lots recorded.`;
      const slMsg = data?.brokerSlResult?.executedOnBroker
        ? ` Trailed SL to ₹${variables.newStopLoss} on FYERS.`
        : variables.newStopLoss
        ? ` Trailed SL to ₹${variables.newStopLoss}.`
        : '';
      toast.success(`${exitMsg}${slMsg}`);

      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setSelectedLadderStep(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to execute ladder step');
    },
  });

  const handleOpenEditSl = (metric: ILiveOpenTradeMetric) => {
    setEditSlMetric(metric);
    setTargetSlPrice(metric.stopLoss !== null ? String(metric.stopLoss) : String(metric.entryPrice));
  };

  const handleIntervalChange = (_: any, newInterval: number | null) => {
    if (newInterval !== null) {
      setRefreshIntervalSec(newInterval);
      localStorage.setItem('tv_live_watcher_interval', String(newInterval));
    }
  };

  const {
    data: summary,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ILiveWatcherSummary>({
    queryKey: ['live-open-trades-watcher', accountId],
    queryFn: () => api.trades.getLiveWatcher(accountId),
    refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const handleManualRefetch = async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const openTradesCount = summary?.openTradesCount ?? 0;

  // Don't render anything if 0 open trades and showWhenEmpty is false
  if (!isLoading && openTradesCount === 0 && !showWhenEmpty) {
    return null;
  }

  const isNetProfit = (summary?.totalFloatingNetPnL ?? 0) >= 0;
  const netPnLColor = isNetProfit ? '#10B981' : '#F43F5E';

  const getThreatBadge = (threat: StopThreatLevel) => {
    switch (threat) {
      case 'SAFE':
        return {
          label: 'SAFE',
          color: '#10B981',
          bg: alpha('#10B981', 0.12),
          border: alpha('#10B981', 0.25),
          icon: <ShieldRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'ATTENTION':
        return {
          label: 'NEAR SL',
          color: '#F59E0B',
          bg: alpha('#F59E0B', 0.12),
          border: alpha('#F59E0B', 0.25),
          icon: <WarningAmberRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'CRITICAL':
        return {
          label: 'CRITICAL',
          color: '#EF4444',
          bg: alpha('#EF4444', 0.18),
          border: alpha('#EF4444', 0.4),
          icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'BREACHED':
        return {
          label: 'SL BREACHED',
          color: '#FFFFFF',
          bg: '#DC2626',
          border: '#B91C1C',
          icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'NO_STOP':
      default:
        return {
          label: 'NO STOP',
          color: '#94A3B8',
          bg: alpha('#94A3B8', 0.1),
          border: alpha('#94A3B8', 0.2),
          icon: null,
        };
    }
  };

  const getProviderBadge = (provider?: string) => {
    switch (provider) {
      case 'FYERS':
        return {
          label: 'FYERS LIVE',
          color: '#10B981',
          bg: alpha('#10B981', 0.12),
          tooltip: 'Real-time quotes fetched live from your FYERS API session',
        };
      case 'ANGEL_ONE':
        return {
          label: 'ANGEL ONE LIVE',
          color: '#0EA5E9',
          bg: alpha('#0EA5E9', 0.12),
          tooltip: 'Real-time quotes fetched live from Angel One SmartAPI',
        };
      case 'SIMULATED':
      default:
        return {
          label: 'SIMULATED TICK',
          color: '#F59E0B',
          bg: alpha('#F59E0B', 0.12),
          tooltip: 'Market closed or broker session not active. Displaying realistic simulated ticks for demonstration.',
        };
    }
  };

  const providerBadge = getProviderBadge(summary?.provider);

  const handleOpenQuickClose = async (metric: ILiveOpenTradeMetric, ratio: number = 1.0) => {
    setQuickCloseRatio(ratio);
    try {
      const fullTrade = await api.trades.get(metric.tradeId);
      setQuickCloseTrade(fullTrade);
      setQuickCloseLtp(metric.currentLtp);
    } catch {
      // Fallback trade object
      setQuickCloseTrade({
        _id: metric.tradeId,
        symbol: metric.symbol,
        direction: metric.direction,
        simpleExecution: {
          entryPrice: metric.entryPrice,
          quantity: metric.quantity,
          contractMultiplier: metric.contractMultiplier,
        },
        quantity: metric.quantity,
      });
      setQuickCloseLtp(metric.currentLtp);
    }
  };

  return (
    <>
      <Card
        sx={{
          mb: 3,
          borderRadius: '16px',
          border: '1px solid',
          borderColor: isDark ? alpha('#3B82F6', 0.25) : alpha('#3B82F6', 0.3),
          background: isDark
            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            : '0 4px 20px rgba(59, 130, 246, 0.08)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle Top Accent Bar */}
        <Box
          sx={{
            height: '3px',
            background: isNetProfit
              ? 'linear-gradient(90deg, #10B981, #06B6D4)'
              : 'linear-gradient(90deg, #F43F5E, #FB923C)',
          }}
        />

        {/* Header / Summary Bar */}
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            cursor: 'pointer',
          }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {/* Left: Live Beacon & Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: refreshIntervalSec > 0 ? '#10B981' : '#94A3B8',
                boxShadow: refreshIntervalSec > 0 ? '0 0 10px #10B981' : 'none',
                animation:
                  refreshIntervalSec > 0
                    ? refreshIntervalSec <= 2
                      ? 'pulseFast 1s infinite'
                      : 'pulse 1.8s infinite'
                    : 'none',
                '@keyframes pulse': {
                  '0%': { transform: 'scale(0.95)', opacity: 0.8 },
                  '50%': { transform: 'scale(1.3)', opacity: 1 },
                  '100%': { transform: 'scale(0.95)', opacity: 0.8 },
                },
                '@keyframes pulseFast': {
                  '0%': { transform: 'scale(0.95)', opacity: 0.85 },
                  '50%': { transform: 'scale(1.4)', opacity: 1 },
                  '100%': { transform: 'scale(0.95)', opacity: 0.85 },
                },
              }}
            />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: -0.2 }}>
              Live Open Trade Watcher
            </Typography>

            <Tooltip title={providerBadge.tooltip} arrow>
              <Chip
                label={providerBadge.label}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: providerBadge.color,
                  bgcolor: providerBadge.bg,
                  borderRadius: '6px',
                }}
              />
            </Tooltip>

            <Chip
              label={`${openTradesCount} OPEN`}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                borderRadius: '6px',
              }}
            />
          </Box>

          {/* Center / Right: Aggregated Live Financials */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: { xs: 2, md: 3 },
              ml: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {openTradesCount > 0 && (
              <>
                {/* Total Floating Net P&L */}
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                    Floating Net MTM
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 800, color: netPnLColor, letterSpacing: -0.3, lineHeight: 1.1 }}
                  >
                    {isNetProfit ? '+' : ''}
                    {formatCurrency(summary?.totalFloatingNetPnL ?? 0, 'INR')}
                  </Typography>
                </Box>

                {/* Portfolio Unrealized R */}
                {summary?.portfolioUnrealizedR !== null && summary?.portfolioUnrealizedR !== undefined && (
                  <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Unrealized R
                    </Typography>
                    <Chip
                      label={`${(summary.portfolioUnrealizedR >= 0 ? '+' : '')}${summary.portfolioUnrealizedR} R`}
                      size="small"
                      sx={{
                        height: 24,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: (summary.portfolioUnrealizedR >= 0 ? '#10B981' : '#F43F5E'),
                        bgcolor: alpha(summary.portfolioUnrealizedR >= 0 ? '#10B981' : '#F43F5E', 0.12),
                        borderRadius: '6px',
                      }}
                    />
                  </Box>
                )}

                {/* Total Risk Capital */}
                {summary && summary.totalRiskCapital > 0 && (
                  <Box sx={{ textAlign: 'right', display: { xs: 'none', md: 'block' } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Capital at Risk
                    </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
                      {formatCurrency(summary.totalRiskCapital, 'INR')}
                    </Typography>
                  </Box>
                )}
              </>
            )}

            {/* Refresh Interval Selector */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Set live quotes auto-refresh interval" arrow>
                <ToggleButtonGroup
                  value={refreshIntervalSec}
                  exclusive
                  onChange={handleIntervalChange}
                  size="small"
                  sx={{
                    height: 28,
                    '& .MuiToggleButton-root': {
                      px: { xs: 0.75, sm: 1 },
                      py: 0,
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      textTransform: 'none',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    },
                  }}
                >
                  <ToggleButton value={0}>Off</ToggleButton>
                  <ToggleButton value={1} title="1-second ultra-fast refresh">1s</ToggleButton>
                  <ToggleButton value={2} title="2-second fast refresh">2s</ToggleButton>
                  <ToggleButton value={5}>5s</ToggleButton>
                  <ToggleButton value={10}>10s</ToggleButton>
                  <ToggleButton value={30}>30s</ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>

              <Tooltip title="Refresh quotes now" arrow>
                <IconButton
                  size="small"
                  onClick={handleManualRefetch}
                  sx={{
                    ml: 0.5,
                    animation: isManualRefreshing ? 'spin 0.8s linear infinite' : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                >
                  <RefreshRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Expand / Collapse Toggle */}
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
            >
              {expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* Collapsible Open Trade Cards Grid */}
        <Collapse in={expanded}>
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              pt: 0,
              borderTop: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            }}
          >
            {isLoading ? (
              <Grid container spacing={2} sx={{ pt: 2 }}>
                {[1, 2].map((i) => (
                  <Grid size={{ xs: 12, md: 6 }} key={i}>
                    <Skeleton variant="rounded" height={160} sx={{ borderRadius: '12px' }} />
                  </Grid>
                ))}
              </Grid>
            ) : openTradesCount === 0 ? (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No open positions currently active. Open trades will automatically appear here with real-time MTM and risk gauges.
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2} sx={{ pt: 2 }}>
                {summary?.positions.map((pos) => {
                  const isLong = pos.direction === 'LONG';
                  const threat = getThreatBadge(pos.stopThreatLevel);
                  const isPosProfitable = pos.floatingNetPnL >= 0;
                  const posPnLColor = isPosProfitable ? '#10B981' : '#F43F5E';
                  const isOneToOne = pos.unrealizedR !== null && pos.unrealizedR >= 1.0;
                  const isAtOrBeyondBe =
                    pos.stopLoss !== null &&
                    (isLong ? pos.stopLoss >= pos.entryPrice : pos.stopLoss <= pos.entryPrice);

                  return (
                    <Grid size={{ xs: 12, md: 6, lg: 4 }} key={pos.tradeId}>
                      <Card
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: '12px',
                          bgcolor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#FFFFFF',
                          borderColor: isOneToOne
                            ? alpha('#10B981', 0.5)
                            : isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.08)',
                          boxShadow: isOneToOne
                            ? isDark
                              ? '0 0 20px rgba(16, 185, 129, 0.15)'
                              : '0 4px 20px rgba(16, 185, 129, 0.12)'
                            : 'none',
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            borderColor: isOneToOne
                              ? '#10B981'
                              : isDark
                              ? 'rgba(59, 130, 246, 0.4)'
                              : 'rgba(59, 130, 246, 0.3)',
                            boxShadow: isDark
                              ? '0 4px 20px rgba(0, 0, 0, 0.3)'
                              : '0 4px 16px rgba(0, 0, 0, 0.05)',
                          },
                        }}
                      >
                        {/* Card Top: Symbol, Direction, Qty & Details Link */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: -0.2 }}>
                              {pos.symbol}
                            </Typography>
                            <Chip
                              label={pos.direction}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                color: isLong ? '#10B981' : '#A855F7',
                                bgcolor: alpha(isLong ? '#10B981' : '#A855F7', 0.12),
                                borderRadius: '4px',
                              }}
                            />
                            {pos.quantity !== undefined && pos.quantity > 0 && (
                              <Chip
                                label={`${pos.quantity} Qty`}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Tooltip title="View full trade details" arrow>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/trades/${pos.tradeId}`)}
                                sx={{ p: 0.5 }}
                              >
                                <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>

                        {/* 1:1 Target Met Alert & 1-Click Action Banner */}
                        {isOneToOne && (
                          <Box
                            sx={{
                              mb: 1.5,
                              p: 1.25,
                              borderRadius: '8px',
                              background: isDark
                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(6, 182, 212, 0.1) 100%)'
                                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
                              border: '1px solid',
                              borderColor: alpha('#10B981', 0.4),
                              boxShadow: '0 0 12px rgba(16, 185, 129, 0.12)',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 800,
                                  color: '#10B981',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  fontSize: '0.72rem',
                                }}
                              >
                                🎯 1:1 Reached (+{pos.unrealizedR} R)
                              </Typography>
                              <Chip
                                label="Target 1 Met"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  bgcolor: '#10B981',
                                  color: '#FFFFFF',
                                  borderRadius: '4px',
                                }}
                              />
                            </Box>

                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                startIcon={<PieChartRoundedIcon sx={{ fontSize: '13px !important' }} />}
                                onClick={() => handleOpenQuickClose(pos, 0.5)}
                                sx={{
                                  flex: 1,
                                  height: 28,
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'none',
                                  bgcolor: '#10B981',
                                  '&:hover': { bgcolor: '#059669' },
                                  borderRadius: '6px',
                                  boxShadow: 'none',
                                }}
                              >
                                Book 50% @ LTP
                              </Button>

                              {!isAtOrBeyondBe && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<LockRoundedIcon sx={{ fontSize: '12px !important' }} />}
                                  onClick={() => handleQuickMoveToBe(pos)}
                                  disabled={updateSlMutation.isPending}
                                  sx={{
                                    flex: 1,
                                    height: 28,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    borderColor: '#10B981',
                                    color: '#10B981',
                                    '&:hover': { bgcolor: alpha('#10B981', 0.1), borderColor: '#059669' },
                                    borderRadius: '6px',
                                  }}
                                >
                                  Lock BE Stop
                                </Button>
                              )}
                            </Box>
                          </Box>
                        )}

                        {/* Price Execution Row: Entry vs Current LTP */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            p: 1.25,
                            borderRadius: '8px',
                            bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                            mb: 1.5,
                          }}
                        >
                          <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                              Entry Price
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              ₹{pos.entryPrice}
                            </Typography>
                          </Box>

                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                              Current LTP
                            </Typography>
                            <Typography
                              variant="body1"
                              sx={{
                                fontWeight: 800,
                                color: pos.priceDeltaPoints >= 0 ? '#10B981' : '#F43F5E',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.25,
                              }}
                            >
                              ₹{pos.currentLtp}
                              {pos.priceDeltaPoints >= 0 ? (
                                <TrendingUpRoundedIcon sx={{ fontSize: 16 }} />
                              ) : (
                                <TrendingDownRoundedIcon sx={{ fontSize: 16 }} />
                              )}
                            </Typography>
                          </Box>

                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                              Floating Net P&L
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: posPnLColor }}>
                              {isPosProfitable ? '+' : ''}
                              {formatCurrency(pos.floatingNetPnL, 'INR')}
                            </Typography>
                            {pos.unrealizedR !== null && (
                              <Typography variant="caption" sx={{ fontWeight: 700, color: posPnLColor, fontSize: '0.68rem' }}>
                                {pos.unrealizedR >= 0 ? '+' : ''}{pos.unrealizedR} R
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Stop Loss Row with 1-Click Move SL & BE Lock */}
                        <Box sx={{ mb: 1.25 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <ShieldRoundedIcon sx={{ fontSize: 13, color: '#94A3B8' }} />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                Stop Loss:
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                {pos.stopLoss !== null ? `₹${pos.stopLoss}` : 'Not Set'}
                              </Typography>

                              {/* Edit / Move SL Button */}
                              <Tooltip title={pos.stopLoss !== null ? 'Move / Adjust Stop Loss' : 'Set Stop Loss'} arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenEditSl(pos)}
                                  sx={{
                                    p: 0.25,
                                    color: pos.stopLoss !== null ? 'text.secondary' : '#F59E0B',
                                    '&:hover': { color: '#3B82F6' },
                                  }}
                                >
                                  <EditRoundedIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                              </Tooltip>

                              {/* Quick Move to BE Chip if SL is set and not at BE */}
                              {pos.stopLoss !== null && !isAtOrBeyondBe && (
                                <Tooltip title={`Quick move SL to Breakeven (₹${pos.entryPrice})`} arrow>
                                  <Chip
                                    icon={<LockRoundedIcon sx={{ fontSize: '11px !important' }} />}
                                    label="Set BE"
                                    size="small"
                                    onClick={() => handleQuickMoveToBe(pos)}
                                    clickable
                                    sx={{
                                      height: 18,
                                      fontSize: '0.62rem',
                                      fontWeight: 700,
                                      bgcolor: alpha('#3B82F6', 0.1),
                                      color: '#3B82F6',
                                      border: `1px solid ${alpha('#3B82F6', 0.25)}`,
                                      borderRadius: '4px',
                                      '&:hover': { bgcolor: alpha('#3B82F6', 0.2) },
                                    }}
                                  />
                                </Tooltip>
                              )}
                            </Box>

                            <Chip
                              icon={threat.icon || undefined}
                              label={threat.label}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                color: threat.color,
                                bgcolor: threat.bg,
                                border: `1px solid ${threat.border}`,
                                borderRadius: '4px',
                              }}
                            />
                          </Box>

                          {pos.distanceToStopPoints !== null && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block' }}>
                              Buffer remaining:{' '}
                              <strong style={{ color: threat.color }}>
                                {pos.distanceToStopPoints > 0 ? `${pos.distanceToStopPoints} pts` : 'Breached'}
                              </strong>{' '}
                              ({pos.distanceToStopTicks} ticks)
                            </Typography>
                          )}
                        </Box>

                        {/* Target Progress Gauge */}
                        {pos.target !== null && (
                          <Box sx={{ mb: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TrackChangesRoundedIcon sx={{ fontSize: 13, color: '#3B82F6' }} />
                                Target: ₹{pos.target}
                              </Typography>

                              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#3B82F6' }}>
                                {pos.targetProgressPercent !== null ? `${pos.targetProgressPercent}%` : ''}
                              </Typography>
                            </Box>

                            <LinearProgress
                              variant="determinate"
                              value={Math.min(Math.max(pos.targetProgressPercent ?? 0, 0), 100)}
                              sx={{
                                height: 5,
                                borderRadius: 3,
                                bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: '#3B82F6',
                                  borderRadius: 3,
                                },
                              }}
                            />

                            {pos.distanceToTargetPoints !== null && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', mt: 0.5, display: 'block' }}>
                                Distance to target: <strong>{Math.abs(pos.distanceToTargetPoints)} pts</strong> ({Math.abs(pos.distanceToTargetTicks || 0)} ticks)
                              </Typography>
                            )}
                          </Box>
                        )}

                        {/* Live Profit Giveback Meter & Peak MFE Tracker */}
                        {pos.giveback && (
                          <LiveGivebackMeter
                            giveback={pos.giveback}
                            metric={pos}
                            onLockProfit={() => handleOpenQuickClose(pos, 0.5)}
                          />
                        )}

                        {/* Multi-Target Scaling Ladder */}
                        {pos.targetLadder && (
                          <LiveScalingLadder
                            ladder={pos.targetLadder}
                            metric={pos}
                            onExecuteStep={(step) => setSelectedLadderStep({ step, metric: pos })}
                          />
                        )}

                        {/* Card Bottom: Book 50%, Close 100%, and Move SL */}
                        <Box
                          sx={{
                            mt: 1.5,
                            pt: 1.25,
                            borderTop: '1px solid',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PieChartRoundedIcon sx={{ fontSize: 14 }} />}
                            onClick={() => handleOpenQuickClose(pos, 0.5)}
                            sx={{
                              flex: 1,
                              height: 30,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              textTransform: 'none',
                              borderRadius: '8px',
                              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                              color: isDark ? '#E2E8F0' : '#1E293B',
                              '&:hover': {
                                borderColor: '#10B981',
                                bgcolor: alpha('#10B981', 0.08),
                                color: '#10B981',
                              },
                            }}
                          >
                            Book 50%
                          </Button>

                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<FlashOnRoundedIcon sx={{ fontSize: 14 }} />}
                            onClick={() => handleOpenQuickClose(pos, 1.0)}
                            sx={{
                              flex: 1,
                              height: 30,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              textTransform: 'none',
                              borderRadius: '8px',
                              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                              color: isDark ? '#E2E8F0' : '#1E293B',
                              '&:hover': {
                                borderColor: '#3B82F6',
                                bgcolor: alpha('#3B82F6', 0.08),
                                color: '#3B82F6',
                              },
                            }}
                          >
                            Close 100%
                          </Button>

                          <Tooltip title="Move / Adjust Stop Loss" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEditSl(pos)}
                              sx={{
                                height: 30,
                                width: 30,
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                                color: pos.stopLoss !== null ? '#3B82F6' : '#F59E0B',
                                '&:hover': {
                                  borderColor: '#3B82F6',
                                  bgcolor: alpha('#3B82F6', 0.08),
                                },
                              }}
                            >
                              <ShieldRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Box>
        </Collapse>
      </Card>

      {/* Move / Adjust Stop Loss Dialog */}
      {editSlMetric && (
        <Dialog
          open={Boolean(editSlMetric)}
          onClose={() => setEditSlMetric(null)}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                bgcolor: isDark ? '#0F172A' : '#FFFFFF',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldRoundedIcon sx={{ color: '#3B82F6', fontSize: 22 }} />
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
                Adjust Stop Loss
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setEditSlMetric(null)}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 1 }}>
            {/* Symbol & Direction context */}
            <Box
              sx={{
                p: 1.5,
                mb: 2,
                borderRadius: '10px',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Instrument
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {editSlMetric.symbol}
                </Typography>
              </Box>

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Entry Price
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  ₹{editSlMetric.entryPrice}
                </Typography>
              </Box>

              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Current LTP
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, color: '#3B82F6' }}>
                  ₹{editSlMetric.currentLtp}
                </Typography>
              </Box>
            </Box>

            {/* Quick Presets */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontWeight: 700, fontSize: '0.7rem' }}>
              Quick Presets
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
              <Chip
                label={`Breakeven (₹${editSlMetric.entryPrice})`}
                size="small"
                onClick={() => setTargetSlPrice(String(editSlMetric.entryPrice))}
                clickable
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  bgcolor: targetSlPrice === String(editSlMetric.entryPrice) ? alpha('#3B82F6', 0.25) : alpha('#3B82F6', 0.08),
                  color: '#3B82F6',
                  borderColor: '#3B82F6',
                }}
              />
              {editSlMetric.direction === 'LONG' && editSlMetric.currentLtp > editSlMetric.entryPrice && (
                <Chip
                  label={`Trail 5 pts below LTP (₹${Number((editSlMetric.currentLtp - 5).toFixed(2))})`}
                  size="small"
                  onClick={() => setTargetSlPrice(String(Number((editSlMetric.currentLtp - 5).toFixed(2))))}
                  clickable
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    bgcolor: alpha('#10B981', 0.08),
                    color: '#10B981',
                  }}
                />
              )}
              {editSlMetric.direction === 'SHORT' && editSlMetric.currentLtp < editSlMetric.entryPrice && (
                <Chip
                  label={`Trail 5 pts above LTP (₹${Number((editSlMetric.currentLtp + 5).toFixed(2))})`}
                  size="small"
                  onClick={() => setTargetSlPrice(String(Number((editSlMetric.currentLtp + 5).toFixed(2))))}
                  clickable
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    bgcolor: alpha('#10B981', 0.08),
                    color: '#10B981',
                  }}
                />
              )}
            </Box>

            {/* Price Input */}
            <TextField
              label="Stop Loss Price"
              type="number"
              fullWidth
              autoFocus
              value={targetSlPrice}
              onChange={(e) => setTargetSlPrice(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  inputProps: { step: 'any' },
                },
              }}
              helperText={`Current SL: ${editSlMetric.stopLoss !== null ? `₹${editSlMetric.stopLoss}` : 'Not set'}`}
              sx={{ mb: 1.5 }}
            />

            {/* Live Broker Execution Indicator & Toggle */}
            <Box
              sx={{
                mb: 2,
                p: 1.25,
                borderRadius: '8px',
                bgcolor: executeSlOnBroker ? alpha('#10B981', 0.1) : alpha('#64748B', 0.1),
                border: '1px solid',
                borderColor: executeSlOnBroker ? alpha('#10B981', 0.3) : alpha('#64748B', 0.2),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: executeSlOnBroker ? '#10B981' : '#64748B',
                    boxShadow: executeSlOnBroker ? '0 0 8px #10B981' : 'none',
                  }}
                />
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: executeSlOnBroker ? '#10B981' : 'text.secondary' }}>
                    Live Broker Execution (FYERS API v3)
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                    {executeSlOnBroker
                      ? 'Order will be placed/modified directly in FYERS orderbook'
                      : 'Update SetupMint journal only'}
                  </Typography>
                </Box>
              </Box>
              <Switch
                size="small"
                checked={executeSlOnBroker}
                onChange={(e) => setExecuteSlOnBroker(e.target.checked)}
                color="success"
              />
            </Box>

            {/* Dynamic Analysis / Risk Impact Message */}
            {(() => {
              const numSl = Number(targetSlPrice);
              if (!targetSlPrice || isNaN(numSl) || numSl <= 0) return null;
              const isLong = editSlMetric.direction === 'LONG';
              const isImmediateTrigger = isLong ? numSl >= editSlMetric.currentLtp : numSl <= editSlMetric.currentLtp;
              const isBe = numSl === editSlMetric.entryPrice;
              const isProfitLock = isLong ? numSl > editSlMetric.entryPrice : numSl < editSlMetric.entryPrice;
              const riskPerUnit = Math.abs(editSlMetric.entryPrice - numSl);
              const totalRiskAmount = riskPerUnit * (editSlMetric.quantity || 1) * (editSlMetric.contractMultiplier || 1);

              if (isImmediateTrigger) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#EF4444', 0.12), border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 700, display: 'block' }}>
                      ⚠️ Warning: SL is {isLong ? 'at or above' : 'at or below'} current LTP (₹{editSlMetric.currentLtp}). Order will trigger instantly!
                    </Typography>
                  </Box>
                );
              }

              if (isProfitLock) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#10B981', 0.12), border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 700, display: 'block' }}>
                      🔒 Profit Protected: Locks in +₹{riskPerUnit.toFixed(2)} / unit (~{formatCurrency(totalRiskAmount, 'INR')})
                    </Typography>
                  </Box>
                );
              }

              if (isBe) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#3B82F6', 0.12), border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 700, display: 'block' }}>
                      🛡️ Breakeven: Capital Protected (₹0 loss if stopped out)
                    </Typography>
                  </Box>
                );
              }

              return (
                <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#F59E0B', 0.12), border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 700, display: 'block' }}>
                    🔻 Downside Risk: -₹{riskPerUnit.toFixed(2)} / unit (~{formatCurrency(totalRiskAmount, 'INR')})
                  </Typography>
                </Box>
              );
            })()}
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditSlMetric(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={
                !targetSlPrice ||
                isNaN(Number(targetSlPrice)) ||
                Number(targetSlPrice) <= 0 ||
                updateSlMutation.isPending
              }
              onClick={() => {
                if (editSlMetric && targetSlPrice) {
                  updateSlMutation.mutate({
                    tradeId: editSlMetric.tradeId,
                    newStopLoss: Number(targetSlPrice),
                    executeBroker: executeSlOnBroker,
                  });
                }
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: '8px',
                bgcolor: executeSlOnBroker ? '#10B981' : '#3B82F6',
                '&:hover': { bgcolor: executeSlOnBroker ? '#059669' : '#2563EB' },
              }}
            >
              {updateSlMutation.isPending
                ? 'Transmitting Order...'
                : executeSlOnBroker
                ? '⚡ Execute Live Broker SL'
                : 'Update Stop Loss'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Quick Close Trade Modal with Pre-filled LTP and Ratio */}
      {quickCloseTrade && (
        <QuickCloseTradeDialog
          open={Boolean(quickCloseTrade)}
          onClose={() => {
            setQuickCloseTrade(null);
            setQuickCloseLtp(undefined);
          }}
          trade={quickCloseTrade}
          defaultExitPrice={quickCloseLtp}
          defaultCloseRatio={quickCloseRatio}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
            queryClient.invalidateQueries({ queryKey: ['trades'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            if (onTradeCloseSuccess) onTradeCloseSuccess();
          }}
        />
      )}

      {/* Execute Multi-Target Ladder Step Dialog */}
      {selectedLadderStep && (
        <ExecuteLadderStepDialog
          open={Boolean(selectedLadderStep)}
          onClose={() => setSelectedLadderStep(null)}
          isLoading={executeLadderMutation.isPending}
          step={selectedLadderStep.step}
          metric={selectedLadderStep.metric}
          onConfirm={(payload) => {
            executeLadderMutation.mutate({
              tradeId: selectedLadderStep.metric.tradeId,
              targetIndex: payload.targetIndex,
              label: payload.label,
              exitQty: payload.exitQty,
              exitPrice: selectedLadderStep.metric.currentLtp,
              newStopLoss: payload.newStopLoss,
              executeBroker: payload.executeBroker,
            });
          }}
        />
      )}
    </>
  );
}
