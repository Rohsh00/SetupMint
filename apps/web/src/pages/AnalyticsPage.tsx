import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { toast } from '../context/ToastContext.js';

// Icons
import ShowChartIcon from '@mui/icons-material/ShowChartRounded';
import PsychologyIcon from '@mui/icons-material/PsychologyRounded';
import AccessTimeIcon from '@mui/icons-material/AccessTimeRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
} from 'recharts';
import { EMOTION_LABEL_MAP, MISTAKE_LABEL_MAP } from '@tradevault/shared';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent, getCurrencySymbol, formatDate } from '../lib/utils.js';
import { HelpHint, WithHelp } from '../components/help/index.js';
import { WhatIfSimulatorTab } from '../components/analytics/WhatIfSimulatorTab.js';
import { ExecutionQualityTab } from '../components/analytics/ExecutionQualityTab.js';
import { PyramidingAnalyticsTab } from '../components/analytics/PyramidingAnalyticsTab.js';
import { PositionSizingDiagnosticsTab } from '../components/analytics/PositionSizingDiagnosticsTab.js';
import { KillZoneAnalyticsCard } from '../components/analytics/KillZoneAnalyticsCard.js';
import { PropChallengePanel } from '../components/dashboard/PropChallengePanel.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';
import { useAccountScope, useAccountCapabilities } from '../context/AccountScopeContext.js';
import { DateRangeFilter } from '../components/ui/DateRangeFilter.js';
import { useDateRange } from '../context/DateRangeContext.js';

export function AnalyticsPage() {
  const { queryParams, isPropMode, scopeLabel, currency: scopeCurrency, activeAccount, isMultiCurrency, currencies } = useAccountScope();
  const caps = useAccountCapabilities();
  const hasMarketData = caps.marketData.fyersHistory || caps.marketData.angelOneFallback || Boolean(caps.marketData.hasExcursionCapability) || caps.broker.adapter === 'ELEFIN_MT5';
  const { openDrill } = useTradeDrilldown();
  const { startDate, endDate } = useDateRange();
  const analyticsCurrency = (caps.currency.code && caps.currency.code !== 'MULTI' ? caps.currency.code : null) || activeAccount?.baseCurrency || (scopeCurrency && scopeCurrency !== 'MULTI' ? scopeCurrency : 'USD');
  const currSym = caps.currency.symbol || getCurrencySymbol(analyticsCurrency);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab')?.toUpperCase();
  const validTabs = ['OVERVIEW', 'SIZING', 'PSYCHOLOGY', 'TIME', 'EXECUTION', 'WHAT_IF', 'PYRAMIDING'];
  const initialTab = (urlTab && validTabs.includes(urlTab)) ? (urlTab as any) : 'OVERVIEW';

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SIZING' | 'PSYCHOLOGY' | 'TIME' | 'EXECUTION' | 'WHAT_IF' | 'PYRAMIDING'>(initialTab);

  React.useEffect(() => {
    const tabFromUrl = searchParams.get('tab')?.toUpperCase();
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl as any);
    }
  }, [searchParams]);
  const [selectedSizingSymbol, setSelectedSizingSymbol] = useState<string>('ALL');
  const [selectedKillZoneSymbol, setSelectedKillZoneSymbol] = useState<string>('ALL');

  React.useEffect(() => {
    if (!hasMarketData && (activeTab === 'EXECUTION' || activeTab === 'WHAT_IF')) {
      setActiveTab('OVERVIEW');
    }
  }, [hasMarketData, activeTab]);
  const [scatterMode, setScatterMode] = useState<'R' | 'POINTS' | 'AMOUNT'>('R');
  const [includePostExitInScatter, setIncludePostExitInScatter] = useState(false);
  const [curveMode, setCurveMode] = useState<'DRAWDOWN_PCT' | 'CUMULATIVE_PNL' | 'DRAWDOWN_AMOUNT'>('DRAWDOWN_PCT');
  const [whatIfPrefill, setWhatIfPrefill] = useState<{ stopR?: number; targetR?: number } | null>(null);
  const [funnelMode, setFunnelMode] = useState<'AUTO' | 'PLANNED_TARGETS' | 'CUSTOM' | 'STANDARD'>('AUTO');
  const [customMfeStepsInput, setCustomMfeStepsInput] = useState<string>('0.5, 1.0, 1.5, 2.0, 3.0');
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const chartGridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)';
  const chartAxisColor = isDark ? '#94A3B8' : '#64748B';
  const chartTooltipStyle = {
    backgroundColor: muiTheme.palette.background.paper,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.15)',
    color: muiTheme.palette.text.primary,
    borderRadius: '10px',
    fontSize: '12px',
    boxShadow: isDark ? '0 10px 25px -5px rgba(0, 0, 0, 0.6)' : '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
    padding: '8px 12px',
  };

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboard-stats', queryParams, startDate, endDate],
    queryFn: () =>
      api.dashboard.stats({
        ...queryParams,
        startDate,
        endDate,
      }),
  });

  const { data: propOverviewRaw } = useQuery({
    queryKey: ['accounts-prop-overview', queryParams],
    queryFn: () => api.accounts.propOverview(queryParams),
    enabled: isPropMode,
  });
  const propOverview: any[] = Array.isArray(propOverviewRaw)
    ? propOverviewRaw
    : propOverviewRaw?.data || [];

  const { data: psychologyData, isLoading: isPsychLoading } = useQuery({
    queryKey: ['analytics-psychology', queryParams, startDate, endDate],
    queryFn: () =>
      api.analytics.psychology({
        ...queryParams,
        startDate,
        endDate,
      }),
  });

  const { data: excursionData, isLoading: isExcursionLoading } = useQuery({
    queryKey: ['analytics-excursion', queryParams, startDate, endDate, funnelMode, funnelMode === 'CUSTOM' ? customMfeStepsInput : ''],
    queryFn: () =>
      api.analytics.excursion({
        ...queryParams,
        startDate,
        endDate,
        funnelMode,
        customMfeSteps: funnelMode === 'CUSTOM' ? customMfeStepsInput : undefined,
      }),
    enabled: activeTab === 'EXECUTION',
  });

  const { data: pyramidingData, isLoading: isPyramidLoading, refetch: refetchPyramiding } = useQuery({
    queryKey: ['analytics-pyramiding', queryParams, startDate, endDate],
    queryFn: () =>
      api.analytics.pyramiding({
        ...queryParams,
        startDate,
        endDate,
      }),
    enabled: activeTab === 'PYRAMIDING',
  });

  const { data: sizingData, isLoading: isSizingLoading, refetch: refetchSizing } = useQuery({
    queryKey: ['analytics-sizing', queryParams, startDate, endDate, selectedSizingSymbol],
    queryFn: () =>
      api.analytics.sizing({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSizingSymbol !== 'ALL' ? selectedSizingSymbol : undefined,
      }),
    enabled: activeTab === 'SIZING',
  });

  const { data: killZoneData, isLoading: isKillZoneLoading, refetch: refetchKillZone } = useQuery({
    queryKey: ['analytics-killzones', queryParams, startDate, endDate, selectedKillZoneSymbol],
    queryFn: () =>
      api.analytics.killZones({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedKillZoneSymbol !== 'ALL' ? selectedKillZoneSymbol : undefined,
      }),
    enabled: activeTab === 'TIME',
  });

  const { data: newsImpactRaw, isLoading: isNewsImpactLoading, refetch: refetchNewsImpact } = useQuery({
    queryKey: ['analytics-news-impact', queryParams, startDate, endDate],
    queryFn: () =>
      api.analytics.newsImpact({
        ...queryParams,
        startDate,
        endDate,
      }),
    enabled: activeTab === 'TIME',
  });
  const newsImpact = newsImpactRaw?.data ?? newsImpactRaw;

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const excursionBackfillMutation = useMutation({
    mutationFn: (params: { limit?: number; forceRecompute?: boolean } = {}) =>
      api.integrations.fyersBackfillExcursion(params),
    onSuccess: (res: any) => {
      const computed = res?.computed ?? res?.data?.computed ?? 0;
      const remaining = res?.remaining ?? res?.data?.remaining ?? 0;
      if (computed > 0) {
        toast.success(`Excursion backfill: ${computed} trades computed (${remaining} remaining).`);
      } else {
        toast.info(`All eligible trades are already computed (${remaining} remaining).`);
      }
      queryClient.invalidateQueries({ queryKey: ['analytics-excursion'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to backfill excursion data');
    },
  });

  function parsePnLRange(range: string): { netPnLMin?: number; netPnLMax?: number } {
    if (!range) return {};
    if (range.startsWith('<')) {
      const num = Number(range.replace(/[^\d.-]/g, ''));
      return { netPnLMax: -Math.abs(num) };
    }
    if (range.startsWith('>')) {
      const num = Number(range.replace(/[^\d.-]/g, ''));
      return { netPnLMin: Math.abs(num) };
    }
    const parts = range.split(' to ');
    if (parts.length === 2) {
      return { netPnLMin: Number(parts[0].trim()), netPnLMax: Number(parts[1].trim()) };
    }
    return {};
  }

  if (isStatsLoading || isPsychLoading) {
    return (
      <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={320} />
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={280} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={280} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Page Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary }}>
            Advanced Analytics & Edge Review
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Quantitative edge analysis, drawdown tracking, and behavioral performance correlations
          </Typography>
        </Box>

        {/* Date Filter */}
        <DateRangeFilter />
      </Box>

      {/* Dedicated Tab Navigation Sub-Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          overflowX: 'auto',
          pb: 1.25,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {[
          { id: 'OVERVIEW', label: 'Curve & Distribution', icon: <ShowChartIcon fontSize="small" /> },
          { id: 'SIZING', label: 'Position Sizing', icon: <StraightenRoundedIcon fontSize="small" /> },
          { id: 'PSYCHOLOGY', label: 'Psychology & Discipline', icon: <PsychologyIcon fontSize="small" /> },
          { id: 'TIME', label: 'Time & Session', icon: <AccessTimeIcon fontSize="small" /> },
          { id: 'PYRAMIDING', label: 'Pyramiding Edge', icon: <AccountTreeRoundedIcon fontSize="small" /> },
          ...(hasMarketData
            ? [
                { id: 'EXECUTION', label: 'Execution Quality (MAE/MFE)', icon: <TimelineRoundedIcon fontSize="small" /> },
                { id: 'WHAT_IF', label: 'Stops & Targets', icon: <TuneRoundedIcon fontSize="small" /> },
              ]
            : []),
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('tab', tab.id);
                  return next;
                });
              }}
              startIcon={React.cloneElement(tab.icon, {
                sx: {
                  fontSize: '18px !important',
                  color: isActive
                    ? (isDark ? '#34D399' : '#059669')
                    : (isDark ? '#94A3B8' : '#64748B'),
                  transition: 'color 0.15s ease',
                },
              })}
              sx={{
                px: 1.75,
                py: 0.7,
                borderRadius: 2,
                fontSize: '0.8125rem',
                fontWeight: isActive ? 700 : 500,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                backgroundColor: isActive
                  ? (isDark ? 'rgba(16, 185, 129, 0.14)' : 'rgba(16, 185, 129, 0.10)')
                  : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)'),
                color: isActive
                  ? (isDark ? '#34D399' : '#059669')
                  : muiTheme.palette.text.secondary,
                border: isActive
                  ? `1px solid ${isDark ? 'rgba(52, 211, 153, 0.35)' : 'rgba(5, 150, 105, 0.3)'}`
                  : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)'}`,
                boxShadow: isActive
                  ? (isDark ? '0 0 14px rgba(16, 185, 129, 0.12)' : '0 1px 3px rgba(5, 150, 105, 0.08)')
                  : 'none',
                '&:hover': {
                  backgroundColor: isActive
                    ? (isDark ? 'rgba(16, 185, 129, 0.20)' : 'rgba(16, 185, 129, 0.14)')
                    : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)'),
                  color: isActive
                    ? (isDark ? '#34D399' : '#059669')
                    : muiTheme.palette.text.primary,
                  borderColor: isActive
                    ? (isDark ? 'rgba(52, 211, 153, 0.45)' : 'rgba(5, 150, 105, 0.4)')
                    : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)'),
                },
              }}
            >
              {tab.label}
            </Button>
          );
        })}
      </Box>

      {/* PROP MODE ANALYTICS SUMMARY BANNER */}
      {isPropMode && (
        <Card
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: '1px solid rgba(139, 92, 246, 0.35)',
            backgroundColor: isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip
              label="PROP MODE ANALYTICS"
              size="small"
              sx={{
                fontWeight: 800,
                fontSize: '0.7rem',
                bgcolor: 'rgba(139, 92, 246, 0.2)',
                color: '#A78BFA',
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Scope: <strong>{scopeLabel}</strong> • {propOverview.length} active prop evaluation(s)
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
            {propOverview.slice(0, 3).map((item: any) => {
              const rulesObj = item.health?.rules;
              const rulesList = Array.isArray(rulesObj)
                ? rulesObj
                : rulesObj && typeof rulesObj === 'object'
                ? Object.values(rulesObj)
                : [];
              const targetRule =
                (!Array.isArray(rulesObj) && (rulesObj?.profitTarget || rulesObj?.PROFIT_TARGET)) ||
                rulesList.find((r: any) => r?.ruleKey === 'profitTarget' || r?.ruleKey === 'PROFIT_TARGET');
              const consistencyRule =
                (!Array.isArray(rulesObj) && (rulesObj?.consistency || rulesObj?.CONSISTENCY_RULE)) ||
                rulesList.find((r: any) => r?.ruleKey === 'consistency' || r?.ruleKey === 'CONSISTENCY_RULE');
              return (
                <Box key={item.accountId} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700 }}>
                      {item.accountName} TARGET REMAINING
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: 'success.main' }}>
                      {targetRule?.remaining !== null && targetRule?.remaining !== undefined
                        ? formatCurrency(targetRule.remaining, item.currency || 'USD')
                        : 'Funded / N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700 }}>
                      BEST-DAY CONSISTENCY
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        fontFamily: `'JetBrains Mono', monospace`,
                        color: consistencyRule?.status === 'BREACHED' ? 'error.main' : 'text.primary',
                      }}
                    >
                      {consistencyRule?.used !== null && consistencyRule?.used !== undefined
                        ? `${Number(consistencyRule.used).toFixed(1)}%${consistencyRule.limit ? ` / ${consistencyRule.limit}%` : ''}`
                        : 'No Cap'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Card>
      )}
      {isPropMode && <PropChallengePanel />}

      {/* TAB 1: OVERVIEW & DISTRIBUTION */}
      {activeTab === 'OVERVIEW' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Equity & Peak-to-Trough Drawdown Curve */}
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {curveMode === 'CUMULATIVE_PNL'
                      ? 'Cumulative Closed Trade P&L Curve'
                      : curveMode === 'DRAWDOWN_AMOUNT'
                      ? `Peak-to-Trough Drawdown (${currSym})`
                      : 'Peak-to-Trough Drawdown Curve (%)'}
                  </Typography>
                  <HelpHint hintKey="metric.drawdown" />
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  {curveMode === 'CUMULATIVE_PNL'
                    ? 'Cashflow-isolated closed trade performance (independent of external deposits & withdrawals)'
                    : 'Drawdown depth from historical high-water mark'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 1.5 }}>
                  <Button
                    variant={curveMode === 'DRAWDOWN_PCT' ? 'contained' : 'outlined'}
                    onClick={() => setCurveMode('DRAWDOWN_PCT')}
                    sx={{ textTransform: 'none', fontSize: '0.7rem', fontWeight: 700, px: 1.2, py: 0.3 }}
                  >
                    Drawdown %
                  </Button>
                  <Button
                    variant={curveMode === 'CUMULATIVE_PNL' ? 'contained' : 'outlined'}
                    onClick={() => setCurveMode('CUMULATIVE_PNL')}
                    sx={{ textTransform: 'none', fontSize: '0.7rem', fontWeight: 700, px: 1.2, py: 0.3 }}
                  >
                    Net P&L Curve
                  </Button>
                  <Button
                    variant={curveMode === 'DRAWDOWN_AMOUNT' ? 'contained' : 'outlined'}
                    onClick={() => setCurveMode('DRAWDOWN_AMOUNT')}
                    sx={{ textTransform: 'none', fontSize: '0.7rem', fontWeight: 700, px: 1.2, py: 0.3 }}
                  >
                    Drawdown {currSym}
                  </Button>
                </ButtonGroup>

                {curveMode === 'CUMULATIVE_PNL' ? (
                  <Chip
                    label={`Total Net P&L: ${formatCurrency(stats?.netPnL, analyticsCurrency)}`}
                    size="small"
                    sx={{
                      fontFamily: `'JetBrains Mono', monospace`,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      backgroundColor: (stats?.netPnL || 0) >= 0 ? muiTheme.palette.profit.bg : muiTheme.palette.loss.bg,
                      color: (stats?.netPnL || 0) >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                      border: `1px solid ${(stats?.netPnL || 0) >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                    }}
                  />
                ) : (
                  <Chip
                    label={`Max DD: -${formatPercent(stats?.maxDrawdownPercent)} (${formatCurrency(stats?.maxDrawdownAmount, analyticsCurrency)})`}
                    size="small"
                    sx={{
                      fontFamily: `'JetBrains Mono', monospace`,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      backgroundColor: muiTheme.palette.loss.bg,
                      color: muiTheme.palette.loss.main,
                      border: `1px solid ${isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(220, 38, 38, 0.25)'}`,
                    }}
                  />
                )}
              </Box>
            </Box>

            <Box sx={{ height: 280, width: '100%' }}>
              {stats?.equityCurve && stats.equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.equityCurve}
                    style={{ cursor: 'pointer' }}
                    onClick={(e: any) => {
                      const rawDate = e?.activePayload?.[0]?.payload?.date;
                      if (rawDate) {
                        const dateStr = typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
                        openDrill({
                          kind: 'FILTER',
                          filter: { ...(queryParams as any), date: dateStr },
                          label: `Trades on ${formatDate(dateStr)}`,
                        });
                      }
                    }}
                  >
                    <defs>
                      <linearGradient id="setupmintDrawdownGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="setupmintPnlGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="date" stroke={chartAxisColor} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={chartAxisColor}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) =>
                        curveMode === 'DRAWDOWN_PCT'
                          ? `-${v}%`
                          : formatCurrency(v, analyticsCurrency)
                      }
                    />
                    <RechartsTooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: muiTheme.palette.text.primary }}
                      labelStyle={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}
                      formatter={(val: any) =>
                        curveMode === 'DRAWDOWN_PCT'
                          ? [`-${formatPercent(val)}`, 'Drawdown']
                          : curveMode === 'CUMULATIVE_PNL'
                          ? [formatCurrency(val, analyticsCurrency), 'Cumulative P&L']
                          : [`-${formatCurrency(val, analyticsCurrency)}`, 'Drawdown']
                      }
                    />
                    {curveMode === 'CUMULATIVE_PNL' ? (
                      <Area
                        type="monotone"
                        dataKey="cumulativePnL"
                        stroke="#10B981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#setupmintPnlGradient)"
                      />
                    ) : curveMode === 'DRAWDOWN_AMOUNT' ? (
                      <Area
                        type="monotone"
                        dataKey="drawdown"
                        stroke="#F43F5E"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#setupmintDrawdownGradient)"
                      />
                    ) : (
                      <Area
                        type="monotone"
                        dataKey="drawdownPercent"
                        stroke="#F43F5E"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#setupmintDrawdownGradient)"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    No trades recorded yet to compute drawdown curve.
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>

          {/* P&L Distribution Histogram & Consistency */}
          <Grid container spacing={3}>
            {/* P&L Distribution Histogram */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%' }}>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      Trade P&L Distribution
                    </Typography>
                    <HelpHint hintKey="analytics.overview.pnlDistribution" />
                  </Box>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Frequency of trade profits and losses by range (click bar to drill down)
                  </Typography>
                </Box>

                <Box sx={{ height: 260, width: '100%' }}>
                  {stats?.pnlDistribution && stats.pnlDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.pnlDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis dataKey="range" stroke={chartAxisColor} fontSize={9} tickLine={false} />
                        <YAxis stroke={chartAxisColor} fontSize={10} tickLine={false} />
                        <RechartsTooltip
                          contentStyle={chartTooltipStyle}
                          itemStyle={{ color: muiTheme.palette.text.primary }}
                          labelStyle={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const rangeStr = entry?.range || entry?.payload?.range;
                            if (rangeStr) {
                              const { netPnLMin, netPnLMax } = parsePnLRange(rangeStr);
                              openDrill({
                                kind: 'FILTER',
                                filter: { ...(queryParams as any), startDate, endDate, netPnLMin, netPnLMax },
                                label: `Trades in P&L Range: ${rangeStr}`,
                              });
                            }
                          }}
                        >
                          {stats.pnlDistribution.map((entry: any, index: number) => (
                            <Cell
                              key={`pnl-cell-${index}`}
                              fill={entry.isProfit ? '#10B981' : '#F43F5E'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                        No distribution data available.
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Card>
            </Grid>

            {/* Streak & Ratio Summary Card */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      Consistency & Run Streaks
                    </Typography>
                    <HelpHint hintKey="analytics.overview.runStreaks" />
                  </Box>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Consecutive execution patterns and outcome ratios
                  </Typography>

                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid size={{ xs: 6 }}>
                      <Tooltip title="Current active consecutive streak of winning or losing closed trades" arrow>
                        <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', cursor: 'help' }}>
                          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Current Run</Typography>
                          <Typography
                            variant="h6"
                            sx={{
                              fontWeight: 800,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: (stats?.currentStreak || 0) > 0 ? muiTheme.palette.profit.main : (stats?.currentStreak || 0) < 0 ? muiTheme.palette.loss.main : muiTheme.palette.text.primary,
                              mt: 0.5,
                            }}
                          >
                            {stats?.currentStreak ? `${Math.abs(stats.currentStreak)} ${stats.currentStreak > 0 ? 'Wins' : 'Losses'}` : 'None'}
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Tooltip title="Highest number of consecutive winning trades recorded in the selected period" arrow>
                        <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', cursor: 'help' }}>
                          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Max Win Streak</Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                            {stats?.maxConsecutiveWins || 0} Trades
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Tooltip title="Highest number of consecutive losing trades recorded in the selected period" arrow>
                        <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', cursor: 'help' }}>
                          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Max Loss Streak</Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                            {stats?.maxConsecutiveLosses || 0} Trades
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Tooltip title="Payoff Ratio: Average dollar profit on wins divided by average dollar loss on losses" arrow>
                        <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', cursor: 'help' }}>
                          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Avg Win / Loss Ratio</Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                            {stats?.avgLosingTrade ? (stats.avgWinningTrade / stats.avgLosingTrade).toFixed(2) : '—'}x
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Grid>
                  </Grid>
                </Box>

                <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ mt: 2, py: 0.5, fontSize: '0.75rem' }}>
                  Descriptive statistics represent historical closed journal records and are independent of live broker execution.
                </Alert>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* TAB: POSITION SIZING DIAGNOSTICS */}
      {activeTab === 'SIZING' && (
        <PositionSizingDiagnosticsTab
          data={sizingData?.data ?? sizingData}
          isLoading={isSizingLoading}
          currencySymbol={currSym}
          selectedSymbol={selectedSizingSymbol}
          onSelectSymbol={setSelectedSizingSymbol}
          onRefresh={refetchSizing}
        />
      )}

      {/* TAB 2: PSYCHOLOGY & DISCIPLINE */}
      {activeTab === 'PSYCHOLOGY' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Grid container spacing={3}>
            {/* Discipline Rating vs Performance */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%' }}>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SecurityIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                      Discipline Rating vs Performance
                    </Typography>
                    <HelpHint hintKey="analytics.psychology.discipline" />
                  </Box>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Correlation between execution discipline rating (1 to 5) and trading results (click row to drill down)
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {psychologyData?.performanceByDiscipline?.map((d: any) => (
                    <Tooltip key={d.score} title={`Click to inspect all trades executed with a discipline score of ${d.score}/5`} arrow>
                      <Box
                        onClick={() =>
                          openDrill({
                            kind: 'FILTER',
                            filter: { ...(queryParams as any), startDate, endDate, disciplineScore: d.score },
                            label: `Discipline Rating ${d.score}/5`,
                          })
                        }
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          py: 1.25,
                          px: 1.5,
                          borderRadius: 1.5,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            borderColor: muiTheme.palette.primary.main,
                            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          Score {d.score}/5
                        </Typography>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                          {d.tradesCount} trades
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 600 }}>
                          {d.winRate}% Win
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: d.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                          }}
                        >
                          {formatCurrency(d.netPnL)}
                        </Typography>
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </Card>
            </Grid>

            {/* Performance by Emotional State */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%' }}>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PsychologyIcon fontSize="small" sx={{ color: '#8B5CF6' }} />
                      Emotional State at Entry vs P&L
                    </Typography>
                    <HelpHint hintKey="analytics.psychology.emotions" />
                  </Box>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    How emotional mindset at entry impacts your bottom-line profitability (click row to drill down)
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {psychologyData?.performanceByEmotion?.map((e: any) => (
                    <Tooltip key={e.emotion} title={`Click to inspect all trades taken while feeling ${EMOTION_LABEL_MAP[e.emotion] || e.emotion}`} arrow>
                      <Box
                        onClick={() =>
                          openDrill({
                            kind: 'FILTER',
                            filter: { ...(queryParams as any), startDate, endDate, emotion: e.emotion },
                            label: `Emotion: ${EMOTION_LABEL_MAP[e.emotion] || e.emotion}`,
                          })
                        }
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          py: 1.25,
                          px: 1.5,
                          borderRadius: 1.5,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            borderColor: '#8B5CF6',
                            backgroundColor: isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.04)',
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {EMOTION_LABEL_MAP[e.emotion] || e.emotion}
                        </Typography>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                          {e.tradesCount} trades
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 600 }}>
                          {e.winRate}% Win
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: e.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                          }}
                        >
                          {formatCurrency(e.netPnL)}
                        </Typography>
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </Card>
            </Grid>
          </Grid>

          {/* Cost of Trading Mistakes */}
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', color: muiTheme.palette.loss.main }}>
                  The Monetary Cost of Discipline Mistakes
                </Typography>
                <HelpHint hintKey="analytics.psychology.mistakes" />
              </Box>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Direct monetary loss incurred from specific psychological violations (click card to drill down)
              </Typography>
            </Box>

            <Grid container spacing={2}>
              {psychologyData?.mistakeAnalysis?.map((m: any) => (
                <Grid key={m.mistake} size={{ xs: 12, sm: 6, md: 2.4 }}>
                  <Tooltip title={`Total loss caused by ${m.label || MISTAKE_LABEL_MAP[m.mistake] || m.mistake}. Click to view trades.`} arrow>
                    <Box
                      onClick={() =>
                        openDrill({
                          kind: 'FILTER',
                          filter: { ...(queryParams as any), startDate, endDate, mistakeTag: m.mistake },
                          label: `Mistake: ${m.label || MISTAKE_LABEL_MAP[m.mistake] || m.mistake}`,
                        })
                      }
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(248, 250, 252, 0.8)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: muiTheme.palette.loss.main,
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(244, 63, 94, 0.15)',
                        },
                      }}
                    >
                      <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: muiTheme.palette.text.primary }}>
                        {m.label || MISTAKE_LABEL_MAP[m.mistake] || m.mistake}
                      </Typography>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.5 }}>
                        Occurred: {m.occurrences} times
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 800,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: muiTheme.palette.loss.main,
                          mt: 1,
                        }}
                      >
                        -{formatCurrency(m.totalLoss)}
                      </Typography>
                    </Box>
                  </Tooltip>
                </Grid>
              ))}
            </Grid>
          </Card>
        </Box>
      )}

      {/* TAB 3: TIME & SESSION */}
      {activeTab === 'TIME' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Institutional Forex & Market Kill-Zone Performance Card */}
          <KillZoneAnalyticsCard
            data={(killZoneData as any)?.data ?? killZoneData}
            isLoading={isKillZoneLoading}
            currencySymbol={currSym}
            selectedSymbol={selectedKillZoneSymbol}
            onSelectSymbol={(sym) => setSelectedKillZoneSymbol(sym)}
            onRefresh={() => refetchKillZone()}
            onDrillDown={(filterOrDesc, label) => {
              if (filterOrDesc?.kind === 'TRADES' || filterOrDesc?.kind === 'TRADE') {
                openDrill(filterOrDesc);
              } else {
                const f = filterOrDesc?.filter || filterOrDesc || {};
                openDrill({ kind: 'FILTER', filter: { ...(queryParams as any), startDate, endDate, ...f }, label });
              }
            }}
          />

          {/* High-Impact US Macro News Catalysts & Transaction Friction Card */}
          {newsImpact && (newsImpact.newsStats?.tradeCount > 0 || newsImpact.friction?.totalFrictionCost > 0 || caps.broker.adapter === 'ELEFIN_MT5' || analyticsCurrency === 'USD') && (
            <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <FlashOnRoundedIcon sx={{ color: '#F59E0B', fontSize: 20 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      Macro News Catalysts & Transaction Friction (Gold / Forex)
                    </Typography>
                    <HelpHint hintKey="analytics.time.killzones" />
                  </Box>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Evaluates trade performance during high-impact US macro releases (CPI, NFP, FOMC, PPI) vs calm technical flow, plus MT5 spread and swap drag
                  </Typography>
                </Box>
                {newsImpact.friction?.totalFrictionCost > 0 && (
                  <Chip
                    icon={<ReceiptLongRoundedIcon style={{ fontSize: 13 }} />}
                    label={`Total Friction: ${formatCurrency(newsImpact.friction.totalFrictionCost, analyticsCurrency)} (${newsImpact.friction.frictionSharePercent}% of Gross)`}
                    size="small"
                    sx={{
                      fontFamily: `'JetBrains Mono', monospace`,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      bgcolor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
                      color: '#F59E0B',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  />
                )}
              </Box>

              <Grid container spacing={2}>
                {/* News Releases Cohort */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      borderColor: (newsImpact.newsStats?.netPnL || 0) >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(15, 23, 42, 0.015)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label="HIGH-IMPACT NEWS RELEASES"
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.65rem',
                            bgcolor: 'rgba(239, 68, 68, 0.15)',
                            color: '#F87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                          }}
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          ±30m US Macro Events
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: `'JetBrains Mono', monospace`,
                          fontWeight: 800,
                          color: (newsImpact.newsStats?.netPnL || 0) >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                        }}
                      >
                        {formatCurrency(newsImpact.newsStats?.netPnL, analyticsCurrency)}
                      </Typography>
                    </Box>

                    <Grid container spacing={1.5} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                          TRADES / WIN %
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                          {newsImpact.newsStats?.tradeCount || 0} trades • {newsImpact.newsStats?.winRate || 0}%
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                          PROFIT FACTOR
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                          {newsImpact.newsStats?.profitFactor || 0}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                          AVG R-MULTIPLE
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: (newsImpact.newsStats?.avgR || 0) >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                          }}
                        >
                          {(newsImpact.newsStats?.avgR || 0) > 0 ? `+${newsImpact.newsStats?.avgR}R` : `${newsImpact.newsStats?.avgR || 0}R`}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Calm / Technical Flow Cohort */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      borderColor: (newsImpact.calmStats?.netPnL || 0) >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(15, 23, 42, 0.015)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label="CALM TECHNICAL FLOW"
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.65rem',
                            bgcolor: 'rgba(59, 130, 246, 0.15)',
                            color: '#60A5FA',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                          }}
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          Normal Session Flow
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: `'JetBrains Mono', monospace`,
                          fontWeight: 800,
                          color: (newsImpact.calmStats?.netPnL || 0) >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                        }}
                      >
                        {formatCurrency(newsImpact.calmStats?.netPnL, analyticsCurrency)}
                      </Typography>
                    </Box>

                    <Grid container spacing={1.5} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                          TRADES / WIN %
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                          {newsImpact.calmStats?.tradeCount || 0} trades • {newsImpact.calmStats?.winRate || 0}%
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                          PROFIT FACTOR
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                          {newsImpact.calmStats?.profitFactor || 0}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                          AVG R-MULTIPLE
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: (newsImpact.calmStats?.avgR || 0) >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                          }}
                        >
                          {(newsImpact.calmStats?.avgR || 0) > 0 ? `+${newsImpact.calmStats?.avgR}R` : `${newsImpact.calmStats?.avgR || 0}R`}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>
              </Grid>

              {/* Friction Breakdown Footer */}
              <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${muiTheme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                  <strong>MT5 Friction Breakdown:</strong> Recorded Overnight Swaps: <code>{formatCurrency(newsImpact.friction?.totalSwap || 0, analyticsCurrency)}</code> • Estimated Spread Drag: <code>{formatCurrency(newsImpact.friction?.totalSpreadCost || 0, analyticsCurrency)}</code>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                  CFD transaction costs are absorbed dynamically via spread & financing swaps.
                </Typography>
              </Box>
            </Card>
          )}

          <Grid container spacing={3}>
          {/* Weekday Breakdown */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ p: 2.5, height: '100%' }}>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Performance by Day of Week
                  </Typography>
                  <HelpHint hintKey="analytics.time.weekday" />
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Identify which trading weekdays provide maximum discretionary edge (click row to drill down)
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {stats?.performanceByWeekday?.map((day: any) => (
                  <Box
                    key={day.day}
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        filter: { ...(queryParams as any), startDate, endDate, weekday: day.day.toLowerCase() },
                        label: `${day.day} Trades`,
                      })
                    }
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1.25,
                      px: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: muiTheme.palette.primary.main,
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {day.day}
                      </Typography>
                      {day.tradesCount < 30 && (
                        <Tooltip title="Subgroup sample N < 30 has wide sampling uncertainty." arrow>
                          <Chip
                            label="N < 30"
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 600 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                      {day.tradesCount} trades
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 600 }}>
                      {day.winRate}% Win
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontFamily: `'JetBrains Mono', monospace`,
                        color: day.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                      }}
                    >
                      {formatCurrency(day.netPnL)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                Note: Subgroups with fewer than 30 trades exhibit high statistical variance. Click any day to inspect underlying executions.
              </Typography>
            </Card>
          </Grid>

          {/* Session Breakdown */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ p: 2.5, height: '100%' }}>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Performance by Trading Session
                  </Typography>
                  <HelpHint hintKey="trade.form.sessionCodes" />
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  {caps.broker.adapter === 'ELEFIN_MT5' || analyticsCurrency === 'USD'
                    ? 'Forex 24/5 sessions: Asia, London, New York & London Close (click row to drill down)'
                    : 'NSE Regular equity market vs MCX Commodity evening session (click row to drill down)'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {stats?.performanceBySession && stats.performanceBySession.length > 0 ? (
                  stats.performanceBySession.map((sess: any) => (
                    <Box
                      key={sess.session}
                      onClick={() =>
                        openDrill({
                          kind: 'FILTER',
                          filter: { ...(queryParams as any), startDate, endDate, session: sess.session },
                          label: `${sess.session} Session Trades`,
                        })
                      }
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.25,
                        px: 1.5,
                        borderRadius: 1.5,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: muiTheme.palette.primary.main,
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {sess.session}
                        </Typography>
                        {sess.tradesCount < 30 && (
                          <Tooltip title="Subgroup sample N < 30 has wide sampling uncertainty." arrow>
                            <Chip
                              label="N < 30"
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 600 }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                        {sess.tradesCount} trades
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 600 }}>
                        {sess.winRate}% Win
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: sess.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                        }}
                      >
                        {formatCurrency(sess.netPnL)}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    No session records logged.
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                Note: Low trade counts increase uncertainty in session-level expectancy. Click any session to inspect trades.
              </Typography>
            </Card>
          </Grid>
        </Grid>
        </Box>
      )}

      {/* TAB 4: EXECUTION QUALITY (MAE / MFE) */}
      {activeTab === 'EXECUTION' && (
        <ExecutionQualityTab
          excursionData={excursionData}
          isExcursionLoading={isExcursionLoading}
          analyticsCurrency={analyticsCurrency}
          currencySymbol={currSym}
          caps={caps}
          queryParams={queryParams}
          startDate={startDate}
          endDate={endDate}
          funnelMode={funnelMode}
          setFunnelMode={setFunnelMode}
          customMfeStepsInput={customMfeStepsInput}
          setCustomMfeStepsInput={setCustomMfeStepsInput}
          excursionBackfillMutation={excursionBackfillMutation}
          onNavigateToWhatIf={(prefill) => {
            setWhatIfPrefill(prefill);
            setActiveTab('WHAT_IF');
          }}
          onOpenDrill={openDrill}
          onNavigateToSettings={() => navigate('/settings')}
        />
      )}

      {/* TAB 5: WHAT-IF SIMULATOR */}
      {activeTab === 'WHAT_IF' && (
        <WhatIfSimulatorTab
          accountId={queryParams.accountId}
          startDate={startDate}
          endDate={endDate}
          initialSuggestedStopR={whatIfPrefill?.stopR}
          initialSuggestedTargetR={whatIfPrefill?.targetR}
        />
      )}

      {/* TAB 6: PYRAMIDING & CAMPAIGN EDGE */}
      {activeTab === 'PYRAMIDING' && (
        <PyramidingAnalyticsTab
          data={(pyramidingData as any)?.data ?? pyramidingData}
          isLoading={isPyramidLoading}
          currencySymbol={currSym}
          onRefresh={refetchPyramiding}
        />
      )}
    </Box>
  );
}
