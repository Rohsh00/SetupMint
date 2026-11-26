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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
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
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import CurrencyExchangeRoundedIcon from '@mui/icons-material/CurrencyExchangeRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';

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
import { AnalyticsSummaryTab } from '../components/analytics/AnalyticsSummaryTab.js';
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
  const validTabs = ['SUMMARY', 'OVERVIEW', 'SIZING', 'PSYCHOLOGY', 'TIME', 'EXECUTION', 'WHAT_IF', 'PYRAMIDING'];
  const initialTab = (urlTab && validTabs.includes(urlTab)) ? (urlTab as any) : 'SUMMARY';

  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'OVERVIEW' | 'SIZING' | 'PSYCHOLOGY' | 'TIME' | 'EXECUTION' | 'WHAT_IF' | 'PYRAMIDING'>(initialTab);

  React.useEffect(() => {
    const tabFromUrl = searchParams.get('tab')?.toUpperCase();
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl as any);
    }
  }, [searchParams]);
  const urlSymbol = searchParams.get('symbol')?.toUpperCase();
  const [selectedSymbol, setSelectedSymbol] = useState<string>(urlSymbol || 'ALL');

  const urlDirection = searchParams.get('direction')?.toUpperCase();
  const [selectedDirection, setSelectedDirection] = useState<'ALL' | 'LONG' | 'SHORT'>(
    urlDirection === 'LONG' || urlDirection === 'SHORT' ? urlDirection : 'ALL'
  );

  const urlSession = searchParams.get('session')?.toUpperCase();
  const [selectedSession, setSelectedSession] = useState<string>(urlSession || 'ALL');

  const urlStrategy = searchParams.get('strategyId') || searchParams.get('strategy');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(urlStrategy || 'ALL');

  const urlTz = searchParams.get('tz')?.toUpperCase();
  const [selectedTimezone, setSelectedTimezone] = useState<'UTC' | 'LOCAL' | 'EST' | 'IST'>(
    urlTz === 'LOCAL' || urlTz === 'EST' || urlTz === 'IST' ? urlTz : 'UTC'
  );

  const [newsWindowMinutes, setNewsWindowMinutes] = useState<number>(30);
  const [catalystTier, setCatalystTier] = useState<'ALL' | 'TIER_1'>('ALL');

  const [timeMetricMode, setTimeMetricMode] = useState<'PNL' | 'WIN_RATE' | 'PROFIT_FACTOR' | 'AVG_R'>('PNL');
  const [daySortMode, setDaySortMode] = useState<'CHRONO' | 'PNL' | 'WIN_RATE' | 'TRADES'>('CHRONO');
  const [sessionSortMode, setSessionSortMode] = useState<'PNL' | 'WIN_RATE' | 'TRADES'>('PNL');
  const [hourlyMetricMode, setHourlyMetricMode] = useState<'PNL' | 'WIN_RATE' | 'AVG_R' | 'TRADES'>('PNL');

  const localBrowserTz = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);

  const effectiveTimezone = React.useMemo(() => {
    switch (selectedTimezone) {
      case 'UTC': return 'UTC';
      case 'EST': return 'America/New_York';
      case 'IST': return 'Asia/Kolkata';
      case 'LOCAL': return localBrowserTz;
      default: return 'UTC';
    }
  }, [selectedTimezone, localBrowserTz]);

  React.useEffect(() => {
    const symFromUrl = searchParams.get('symbol')?.toUpperCase();
    if (symFromUrl && symFromUrl !== selectedSymbol) {
      setSelectedSymbol(symFromUrl);
    }
    const dirFromUrl = searchParams.get('direction')?.toUpperCase();
    if (dirFromUrl && (dirFromUrl === 'LONG' || dirFromUrl === 'SHORT') && dirFromUrl !== selectedDirection) {
      setSelectedDirection(dirFromUrl);
    }
    const sessFromUrl = searchParams.get('session')?.toUpperCase();
    if (sessFromUrl && sessFromUrl !== selectedSession) {
      setSelectedSession(sessFromUrl);
    }
    const stratFromUrl = searchParams.get('strategyId') || searchParams.get('strategy');
    if (stratFromUrl && stratFromUrl !== selectedStrategyId) {
      setSelectedStrategyId(stratFromUrl);
    }
    const tzFromUrl = searchParams.get('tz')?.toUpperCase();
    if (tzFromUrl && (tzFromUrl === 'LOCAL' || tzFromUrl === 'EST' || tzFromUrl === 'IST' || tzFromUrl === 'UTC') && tzFromUrl !== selectedTimezone) {
      setSelectedTimezone(tzFromUrl as any);
    }
  }, [searchParams]);

  const handleSelectSymbol = (sym: string) => {
    const nextSym = (sym || 'ALL').toUpperCase().trim();
    setSelectedSymbol(nextSym);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextSym !== 'ALL') {
        next.set('symbol', nextSym);
      } else {
        next.delete('symbol');
      }
      return next;
    });
  };

  const handleSelectDirection = (dir: 'ALL' | 'LONG' | 'SHORT') => {
    setSelectedDirection(dir);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (dir !== 'ALL') next.set('direction', dir);
      else next.delete('direction');
      return next;
    });
  };

  const handleSelectSession = (sess: string) => {
    const nextSess = (sess || 'ALL').toUpperCase().trim();
    setSelectedSession(nextSess);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextSess !== 'ALL') next.set('session', nextSess);
      else next.delete('session');
      return next;
    });
  };

  const handleSelectStrategy = (stratId: string) => {
    setSelectedStrategyId(stratId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (stratId !== 'ALL') next.set('strategyId', stratId);
      else {
        next.delete('strategyId');
        next.delete('strategy');
      }
      return next;
    });
  };

  const handleSelectTimezone = (tz: 'UTC' | 'LOCAL' | 'EST' | 'IST') => {
    setSelectedTimezone(tz);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tz !== 'UTC') next.set('tz', tz);
      else next.delete('tz');
      return next;
    });
  };

  const handleResetFilters = () => {
    setSelectedSymbol('ALL');
    setSelectedDirection('ALL');
    setSelectedSession('ALL');
    setSelectedStrategyId('ALL');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('symbol');
      next.delete('direction');
      next.delete('session');
      next.delete('strategyId');
      next.delete('strategy');
      return next;
    });
  };

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
    queryKey: [
      'dashboard-stats',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
      effectiveTimezone,
    ],
    queryFn: () =>
      api.dashboard.stats({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
        timezone: effectiveTimezone,
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
    queryKey: [
      'analytics-psychology',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
    ],
    queryFn: () =>
      api.analytics.psychology({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
      }),
  });

  const { data: excursionData, isLoading: isExcursionLoading } = useQuery({
    queryKey: [
      'analytics-excursion',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
      funnelMode,
      funnelMode === 'CUSTOM' ? customMfeStepsInput : '',
    ],
    queryFn: () =>
      api.analytics.excursion({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
        funnelMode,
        customMfeSteps: funnelMode === 'CUSTOM' ? customMfeStepsInput : undefined,
      }),
    enabled: activeTab === 'EXECUTION',
  });

  const { data: pyramidingData, isLoading: isPyramidLoading, refetch: refetchPyramiding } = useQuery({
    queryKey: [
      'analytics-pyramiding',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
    ],
    queryFn: () =>
      api.analytics.pyramiding({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
      }),
    enabled: activeTab === 'PYRAMIDING',
  });

  const { data: sizingData, isLoading: isSizingLoading, refetch: refetchSizing } = useQuery({
    queryKey: [
      'analytics-sizing',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
    ],
    queryFn: () =>
      api.analytics.sizing({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
      }),
    enabled: activeTab === 'SIZING',
  });

  const { data: killZoneData, isLoading: isKillZoneLoading, refetch: refetchKillZone } = useQuery({
    queryKey: [
      'analytics-killzones',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
    ],
    queryFn: () =>
      api.analytics.killZones({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
      }),
    enabled: activeTab === 'TIME',
  });

  const { data: newsImpactRaw, isLoading: isNewsImpactLoading, refetch: refetchNewsImpact } = useQuery({
    queryKey: [
      'analytics-news-impact',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
      newsWindowMinutes,
      catalystTier,
    ],
    queryFn: () =>
      api.analytics.newsImpact({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
        newsWindowMinutes,
        catalystTier,
      }),
    enabled: activeTab === 'TIME',
  });
  const newsImpact = newsImpactRaw?.data ?? newsImpactRaw;

  const { data: summaryData, isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: [
      'analytics-summary',
      queryParams,
      startDate,
      endDate,
      selectedSymbol,
      selectedDirection,
      selectedSession,
      selectedStrategyId,
      effectiveTimezone,
    ],
    queryFn: () =>
      api.analytics.summary({
        ...queryParams,
        startDate,
        endDate,
        symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined,
        direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
        session: selectedSession !== 'ALL' ? selectedSession : undefined,
        strategyId: selectedStrategyId !== 'ALL' ? selectedStrategyId : undefined,
        timezone: effectiveTimezone,
      }),
    enabled: activeTab === 'SUMMARY',
  });

  // Aggregate available symbols across all analytic engines for universal selector
  const allAvailableSymbols = React.useMemo(() => {
    const symSet = new Set<string>();
    const sources = [
      stats?.availableSymbols,
      summaryData?.availableSymbols,
      summaryData?.data?.availableSymbols,
      sizingData?.availableSymbols,
      killZoneData?.availableSymbols,
      pyramidingData?.availableSymbols,
      psychologyData?.availableSymbols,
      excursionData?.availableSymbols,
      (newsImpact as any)?.availableSymbols,
    ];
    for (const s of sources) {
      if (Array.isArray(s)) {
        for (const item of s) {
          if (item && typeof item === 'string') {
            symSet.add(item.toUpperCase().trim());
          }
        }
      }
    }
    return Array.from(symSet).sort();
  }, [stats, summaryData, sizingData, killZoneData, pyramidingData, psychologyData, excursionData, newsImpact]);

  const allAvailableStrategies = React.useMemo(() => {
    const list: Array<{ id: string; name: string }> = [];
    if (stats?.performanceByStrategy && Array.isArray(stats.performanceByStrategy)) {
      for (const st of stats.performanceByStrategy) {
        if (st.strategyId && st.strategyId !== 'unclassified' && st.strategyName) {
          list.push({ id: st.strategyId, name: st.strategyName });
        }
      }
    }
    return list;
  }, [stats]);

  const activeFilterCount =
    (selectedSymbol !== 'ALL' ? 1 : 0) +
    (selectedDirection !== 'ALL' ? 1 : 0) +
    (selectedSession !== 'ALL' ? 1 : 0) +
    (selectedStrategyId !== 'ALL' ? 1 : 0);

  const sortedWeekdays = React.useMemo(() => {
    const list = [...(stats?.performanceByWeekday || [])];
    if (daySortMode === 'PNL') {
      return list.sort((a: any, b: any) => (b.netPnL || 0) - (a.netPnL || 0));
    }
    if (daySortMode === 'WIN_RATE') {
      return list.sort((a: any, b: any) => (b.winRate || 0) - (a.winRate || 0));
    }
    if (daySortMode === 'TRADES') {
      return list.sort((a: any, b: any) => (b.tradesCount || 0) - (a.tradesCount || 0));
    }
    return list;
  }, [stats?.performanceByWeekday, daySortMode]);

  const sortedSessions = React.useMemo(() => {
    const list = [...(stats?.performanceBySession || [])];
    if (sessionSortMode === 'PNL') {
      return list.sort((a: any, b: any) => (b.netPnL || 0) - (a.netPnL || 0));
    }
    if (sessionSortMode === 'WIN_RATE') {
      return list.sort((a: any, b: any) => (b.winRate || 0) - (a.winRate || 0));
    }
    if (sessionSortMode === 'TRADES') {
      return list.sort((a: any, b: any) => (b.tradesCount || 0) - (a.tradesCount || 0));
    }
    return list;
  }, [stats?.performanceBySession, sessionSortMode]);

  // Universal drilldown helper preserving selected Forex pair / asset symbol and active filters
  const handleOpenDrill = (drillOrFilter: any, customLabel?: string) => {
    if (drillOrFilter?.kind === 'TRADES' || drillOrFilter?.kind === 'TRADE') {
      openDrill(drillOrFilter);
      return;
    }
    const f = drillOrFilter?.filter || drillOrFilter || {};
    const symbolFilter = selectedSymbol !== 'ALL' ? { symbol: selectedSymbol } : {};
    const directionFilter = selectedDirection !== 'ALL' ? { direction: selectedDirection } : {};
    const sessionFilter = selectedSession !== 'ALL' ? { session: selectedSession } : {};
    const strategyFilter = selectedStrategyId !== 'ALL' ? { strategyId: selectedStrategyId } : {};
    openDrill({
      kind: 'FILTER',
      filter: {
        ...(queryParams as any),
        startDate,
        endDate,
        ...symbolFilter,
        ...directionFilter,
        ...sessionFilter,
        ...strategyFilter,
        ...f,
      },
      label: customLabel || drillOrFilter?.label,
    });
  };

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
          gap: 1,
          overflowX: 'auto',
          width: '100%',
          pb: 1.25,
          pt: 0.25,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {[
          { id: 'SUMMARY', label: 'Summary & Playbook', icon: <AutoAwesomeRoundedIcon fontSize="small" /> },
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
                  mr: -0.25,
                },
              })}
              sx={{
                flexShrink: 0,
                minWidth: 'max-content',
                px: 2,
                py: 0.8,
                borderRadius: '10px',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 700 : 500,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                backgroundColor: isActive
                  ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)')
                  : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)'),
                color: isActive
                  ? (isDark ? '#34D399' : '#059669')
                  : muiTheme.palette.text.secondary,
                border: isActive
                  ? `1px solid ${isDark ? 'rgba(52, 211, 153, 0.45)' : 'rgba(5, 150, 105, 0.35)'}`
                  : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'}`,
                boxShadow: isActive
                  ? (isDark ? '0 0 14px rgba(16, 185, 129, 0.12)' : '0 1px 3px rgba(5, 150, 105, 0.08)')
                  : 'none',
                '&:hover': {
                  backgroundColor: isActive
                    ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.15)')
                    : (isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.06)'),
                  color: isActive
                    ? (isDark ? '#34D399' : '#059669')
                    : muiTheme.palette.text.primary,
                  borderColor: isActive
                    ? (isDark ? 'rgba(52, 211, 153, 0.55)' : 'rgba(5, 150, 105, 0.45)')
                    : (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 23, 42, 0.15)'),
                },
              }}
            >
              {tab.label}
            </Button>
          );
        })}
      </Box>

      {/* Exact Analysis & Multi-Option Control Console */}
      <Card
        sx={{
          p: 2,
          borderRadius: 2.5,
          border: `1px solid ${activeFilterCount > 0 ? (isDark ? 'rgba(52, 211, 153, 0.4)' : 'rgba(5, 150, 105, 0.35)') : muiTheme.palette.divider}`,
          backgroundColor: activeFilterCount > 0
            ? (isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.025)')
            : (isDark ? 'rgba(15, 23, 42, 0.6)' : '#FFFFFF'),
          boxShadow: activeFilterCount > 0
            ? (isDark ? '0 0 16px rgba(16, 185, 129, 0.08)' : '0 2px 8px rgba(5, 150, 105, 0.06)')
            : 'none',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {/* Row 1: Symbol Quick-Selector */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CurrencyExchangeRoundedIcon
                fontSize="small"
                sx={{ color: selectedSymbol !== 'ALL' ? (isDark ? '#34D399' : '#059669') : 'text.secondary' }}
              />
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                Forex & Asset:
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                flexWrap: 'wrap',
                maxHeight: { xs: 80, md: 'none' },
                overflowY: 'auto',
              }}
            >
              <Chip
                label="All Symbols (Combined)"
                size="small"
                onClick={() => handleSelectSymbol('ALL')}
                variant={selectedSymbol === 'ALL' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: selectedSymbol === 'ALL' ? 700 : 500,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  bgcolor: selectedSymbol === 'ALL'
                    ? (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.08)')
                    : 'transparent',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.15)',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.06)',
                  },
                }}
              />

              {allAvailableSymbols.map((sym) => {
                const isSelected = selectedSymbol === sym;
                return (
                  <Chip
                    key={sym}
                    label={sym}
                    size="small"
                    onClick={() => handleSelectSymbol(sym)}
                    variant={isSelected ? 'filled' : 'outlined'}
                    sx={{
                      fontWeight: isSelected ? 800 : 600,
                      fontSize: '0.75rem',
                      fontFamily: `'JetBrains Mono', monospace`,
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      bgcolor: isSelected
                        ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.14)')
                        : 'transparent',
                      color: isSelected
                        ? (isDark ? '#34D399' : '#059669')
                        : 'text.primary',
                      borderColor: isSelected
                        ? (isDark ? 'rgba(52, 211, 153, 0.5)' : 'rgba(5, 150, 105, 0.5)')
                        : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.1)'),
                      '&:hover': {
                        bgcolor: isSelected
                          ? (isDark ? 'rgba(16, 185, 129, 0.28)' : 'rgba(16, 185, 129, 0.2)')
                          : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.04)'),
                      },
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* Active status indicator & Clear All button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, alignSelf: { xs: 'flex-end', md: 'center' } }}>
            {activeFilterCount > 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={`${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`}
                  size="small"
                  color="primary"
                  sx={{ fontWeight: 800, fontSize: '0.6875rem', height: 22 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleResetFilters}
                  startIcon={<RestartAltRoundedIcon fontSize="small" />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    py: 0.25,
                    px: 1,
                    borderRadius: 1.5,
                  }}
                >
                  Reset Filters
                </Button>
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {allAvailableSymbols.length} traded asset{allAvailableSymbols.length === 1 ? '' : 's'} in scope
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ borderStyle: 'dashed' }} />

        {/* Row 2: Adaptive Granular Controls (Direction, Session, Strategy, Timezone) */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          {/* Left Controls: Direction + Session + Strategy */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
            {/* Direction Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', mr: 0.25 }}>
                Side:
              </Typography>
              <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.25, px: 1, fontSize: '0.72rem', textTransform: 'none', fontWeight: 700 } }}>
                <Button
                  onClick={() => handleSelectDirection('ALL')}
                  variant={selectedDirection === 'ALL' ? 'contained' : 'outlined'}
                  color={selectedDirection === 'ALL' ? 'primary' : 'inherit'}
                >
                  All Sides
                </Button>
                <Button
                  onClick={() => handleSelectDirection('LONG')}
                  variant={selectedDirection === 'LONG' ? 'contained' : 'outlined'}
                  color="success"
                  startIcon={<TrendingUpRoundedIcon sx={{ fontSize: '14px !important' }} />}
                >
                  Longs
                </Button>
                <Button
                  onClick={() => handleSelectDirection('SHORT')}
                  variant={selectedDirection === 'SHORT' ? 'contained' : 'outlined'}
                  color="error"
                  startIcon={<TrendingDownRoundedIcon sx={{ fontSize: '14px !important' }} />}
                >
                  Shorts
                </Button>
              </ButtonGroup>
            </Box>

            {/* Session Selector */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', mr: 0.25 }}>
                Session:
              </Typography>
              <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.25, px: 0.9, fontSize: '0.72rem', textTransform: 'none', fontWeight: 600 } }}>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'ASIA', label: 'Asia' },
                  { id: 'LONDON', label: 'London' },
                  { id: 'NEW_YORK', label: 'New York' },
                  { id: 'LONDON_CLOSE', label: 'London Close' },
                  { id: 'OFF_HOURS', label: 'Off-Hours' },
                ].map((s) => (
                  <Button
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    variant={selectedSession === s.id ? 'contained' : 'outlined'}
                    sx={selectedSession === s.id ? { fontWeight: 800 } : {}}
                  >
                    {s.label}
                  </Button>
                ))}
              </ButtonGroup>
            </Box>

            {/* Strategy Dropdown */}
            {allAvailableStrategies.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', mr: 0.25 }}>
                  Strategy:
                </Typography>
                <Select
                  size="small"
                  value={selectedStrategyId}
                  onChange={(e) => handleSelectStrategy(e.target.value)}
                  sx={{
                    height: 28,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    bgcolor: selectedStrategyId !== 'ALL' ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)') : 'transparent',
                    '& .MuiSelect-select': { py: 0.3, px: 1.25 },
                  }}
                >
                  <MenuItem value="ALL" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    All Playbooks / Strategies
                  </MenuItem>
                  {allAvailableStrategies.map((st) => (
                    <MenuItem key={st.id} value={st.id} sx={{ fontSize: '0.75rem' }}>
                      {st.name}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}
          </Box>

          {/* Right Controls: Timezone Alignment */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PublicRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem' }}>
              Timezone:
            </Typography>
            <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.25, px: 0.8, fontSize: '0.7rem', textTransform: 'none', fontWeight: 600 } }}>
              <Tooltip title="Coordinated Universal Time (Institutional ICT standard)" arrow>
                <Button
                  onClick={() => handleSelectTimezone('UTC')}
                  variant={selectedTimezone === 'UTC' ? 'contained' : 'outlined'}
                  sx={selectedTimezone === 'UTC' ? { fontWeight: 800 } : {}}
                >
                  UTC
                </Button>
              </Tooltip>
              <Tooltip title={`Your browser local time (${localBrowserTz})`} arrow>
                <Button
                  onClick={() => handleSelectTimezone('LOCAL')}
                  variant={selectedTimezone === 'LOCAL' ? 'contained' : 'outlined'}
                  sx={selectedTimezone === 'LOCAL' ? { fontWeight: 800 } : {}}
                >
                  Local
                </Button>
              </Tooltip>
              <Tooltip title="US Eastern Time (New York Stock Exchange & US Macro data timing)" arrow>
                <Button
                  onClick={() => handleSelectTimezone('EST')}
                  variant={selectedTimezone === 'EST' ? 'contained' : 'outlined'}
                  sx={selectedTimezone === 'EST' ? { fontWeight: 800 } : {}}
                >
                  EST (NY)
                </Button>
              </Tooltip>
              <Tooltip title="Indian Standard Time (IST - UTC+5:30)" arrow>
                <Button
                  onClick={() => handleSelectTimezone('IST')}
                  variant={selectedTimezone === 'IST' ? 'contained' : 'outlined'}
                  sx={selectedTimezone === 'IST' ? { fontWeight: 800 } : {}}
                >
                  IST
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Box>
        </Box>
      </Card>

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

      {/* TAB 0: ACTIONABLE PLAYBOOK & SUMMARY */}
      {activeTab === 'SUMMARY' && (
        <AnalyticsSummaryTab
          summaryData={summaryData}
          isLoading={isSummaryLoading}
          onRefresh={refetchSummary}
          analyticsCurrency={analyticsCurrency}
          currencySymbol={currSym}
          onSelectSymbol={handleSelectSymbol}
        />
      )}

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
                        handleOpenDrill({
                          kind: 'FILTER',
                          filter: { date: dateStr },
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
                              handleOpenDrill({
                                kind: 'FILTER',
                                filter: { netPnLMin, netPnLMax },
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
          selectedSymbol={selectedSymbol}
          onSelectSymbol={handleSelectSymbol}
          onRefresh={refetchSizing}
          onDrillDown={(filterOrDesc, label) => handleOpenDrill(filterOrDesc, label)}
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
                          handleOpenDrill({
                            kind: 'FILTER',
                            filter: { disciplineScore: d.score },
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
                          handleOpenDrill({
                            kind: 'FILTER',
                            filter: { emotion: e.emotion },
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
                        handleOpenDrill({
                          kind: 'FILTER',
                          filter: { mistakeTag: m.mistake },
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
            selectedSymbol={selectedSymbol}
            onSelectSymbol={(sym) => handleSelectSymbol(sym)}
            onRefresh={() => refetchKillZone()}
            onDrillDown={(filterOrDesc, label) => handleOpenDrill(filterOrDesc, label)}
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

                {/* Adaptive Catalyst Controls & Friction Chip */}
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25 }}>
                  {/* Catalyst Tier Toggle */}
                  <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.25, px: 0.85, fontSize: '0.7rem', textTransform: 'none', fontWeight: 600 } }}>
                    <Button
                      onClick={() => setCatalystTier('ALL')}
                      variant={catalystTier === 'ALL' ? 'contained' : 'outlined'}
                      sx={catalystTier === 'ALL' ? { fontWeight: 800 } : {}}
                    >
                      All Macro Events
                    </Button>
                    <Button
                      onClick={() => setCatalystTier('TIER_1')}
                      variant={catalystTier === 'TIER_1' ? 'contained' : 'outlined'}
                      color="error"
                      sx={catalystTier === 'TIER_1' ? { fontWeight: 800 } : {}}
                    >
                      Tier-1 (CPI/NFP/FOMC)
                    </Button>
                  </ButtonGroup>

                  {/* Adaptive Window Selector */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary' }}>
                      Window:
                    </Typography>
                    <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.25, px: 0.8, fontSize: '0.7rem', textTransform: 'none', fontWeight: 600 } }}>
                      {[15, 30, 60, 120].map((mins) => (
                        <Button
                          key={mins}
                          onClick={() => setNewsWindowMinutes(mins)}
                          variant={newsWindowMinutes === mins ? 'contained' : 'outlined'}
                          sx={newsWindowMinutes === mins ? { fontWeight: 800 } : {}}
                        >
                          ±{mins}m
                        </Button>
                      ))}
                    </ButtonGroup>
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
              </Box>

              <Grid container spacing={2}>
                {/* News Releases Cohort */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Tooltip title={`Trades executed within ±${newsWindowMinutes}m of macro releases (${catalystTier === 'TIER_1' ? 'Tier-1: CPI, NFP, FOMC' : 'All: CPI, NFP, FOMC, PPI, GDP, etc.'}) or tagged as news. Click to inspect trades.`} arrow>
                    <Paper
                      variant="outlined"
                      onClick={() => {
                        if (newsImpact.newsStats?.tradeIds?.length > 0) {
                          openDrill({
                            kind: 'TRADES',
                            tradeIds: newsImpact.newsStats.tradeIds,
                          });
                        } else {
                          handleOpenDrill({
                            kind: 'FILTER',
                            filter: {},
                            label: 'High-Impact News Trades',
                          });
                        }
                      }}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        borderColor: (newsImpact.newsStats?.netPnL || 0) >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(15, 23, 42, 0.015)',
                        cursor: (newsImpact.newsStats?.tradeCount || 0) > 0 ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                        '&:hover': (newsImpact.newsStats?.tradeCount || 0) > 0 ? {
                          borderColor: (newsImpact.newsStats?.netPnL || 0) >= 0 ? '#10B981' : '#EF4444',
                          transform: 'translateY(-2px)',
                          boxShadow: (newsImpact.newsStats?.netPnL || 0) >= 0
                            ? '0 4px 12px rgba(16, 185, 129, 0.2)'
                            : '0 4px 12px rgba(239, 68, 68, 0.2)',
                        } : {},
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
                            ±{newsWindowMinutes}m US Macro Events
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
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
                          {(newsImpact.newsStats?.tradeCount || 0) > 0 && (
                            <Typography variant="caption" sx={{ color: '#F87171', fontSize: '0.625rem', fontWeight: 700, display: 'block' }}>
                              Inspect Trades →
                            </Typography>
                          )}
                        </Box>
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
                  </Tooltip>
                </Grid>

                {/* Calm / Technical Flow Cohort */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Tooltip title="Trades executed during regular market hours outside high-volatility macro news windows. Click to inspect trades." arrow>
                    <Paper
                      variant="outlined"
                      onClick={() => {
                        if (newsImpact.calmStats?.tradeIds?.length > 0) {
                          openDrill({
                            kind: 'TRADES',
                            tradeIds: newsImpact.calmStats.tradeIds,
                          });
                        }
                      }}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        borderColor: (newsImpact.calmStats?.netPnL || 0) >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(15, 23, 42, 0.015)',
                        cursor: (newsImpact.calmStats?.tradeCount || 0) > 0 ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                        '&:hover': (newsImpact.calmStats?.tradeCount || 0) > 0 ? {
                          borderColor: (newsImpact.calmStats?.netPnL || 0) >= 0 ? '#10B981' : '#EF4444',
                          transform: 'translateY(-2px)',
                          boxShadow: (newsImpact.calmStats?.netPnL || 0) >= 0
                            ? '0 4px 12px rgba(16, 185, 129, 0.2)'
                            : '0 4px 12px rgba(239, 68, 68, 0.2)',
                        } : {},
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
                        <Box sx={{ textAlign: 'right' }}>
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
                          {(newsImpact.calmStats?.tradeCount || 0) > 0 && (
                            <Typography variant="caption" sx={{ color: '#60A5FA', fontSize: '0.625rem', fontWeight: 700, display: 'block' }}>
                              Inspect Trades →
                            </Typography>
                          )}
                        </Box>
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
                  </Tooltip>
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

          {/* 24-Hour Intraday Hourly Distribution (Exact Time-of-Day Analysis) */}
          <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <AccessTimeIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    24-Hour Intraday Hourly Performance & Volume Distribution
                  </Typography>
                  <HelpHint hintKey="analytics.time.hourly" />
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Detailed trade entry volume, win rate expectancy, and net P&L across each hour of the day aligned to {selectedTimezone} ({effectiveTimezone})
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary' }}>
                  Metric:
                </Typography>
                <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.25, px: 1, fontSize: '0.72rem', textTransform: 'none', fontWeight: 600 } }}>
                  <Button
                    onClick={() => setHourlyMetricMode('PNL')}
                    variant={hourlyMetricMode === 'PNL' ? 'contained' : 'outlined'}
                    sx={hourlyMetricMode === 'PNL' ? { fontWeight: 800 } : {}}
                  >
                    Net P&L
                  </Button>
                  <Button
                    onClick={() => setHourlyMetricMode('WIN_RATE')}
                    variant={hourlyMetricMode === 'WIN_RATE' ? 'contained' : 'outlined'}
                    sx={hourlyMetricMode === 'WIN_RATE' ? { fontWeight: 800 } : {}}
                  >
                    Win Rate %
                  </Button>
                  <Button
                    onClick={() => setHourlyMetricMode('AVG_R')}
                    variant={hourlyMetricMode === 'AVG_R' ? 'contained' : 'outlined'}
                    sx={hourlyMetricMode === 'AVG_R' ? { fontWeight: 800 } : {}}
                  >
                    Avg R
                  </Button>
                  <Button
                    onClick={() => setHourlyMetricMode('TRADES')}
                    variant={hourlyMetricMode === 'TRADES' ? 'contained' : 'outlined'}
                    sx={hourlyMetricMode === 'TRADES' ? { fontWeight: 800 } : {}}
                  >
                    Trades Count
                  </Button>
                </ButtonGroup>
              </Box>
            </Box>

            {/* Hourly Bar Chart */}
            <Box sx={{ height: 260, width: '100%', mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.performanceByHour || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    stroke={chartAxisColor}
                    tick={{ fontSize: 10, fill: chartAxisColor }}
                    interval={0}
                  />
                  <YAxis
                    stroke={chartAxisColor}
                    tick={{ fontSize: 10, fill: chartAxisColor }}
                    tickFormatter={(val: number) => {
                      if (hourlyMetricMode === 'PNL') return formatCurrency(val, analyticsCurrency);
                      if (hourlyMetricMode === 'WIN_RATE') return `${val}%`;
                      if (hourlyMetricMode === 'AVG_R') return `${val > 0 ? '+' : ''}${val}R`;
                      return `${val}`;
                    }}
                    domain={hourlyMetricMode === 'WIN_RATE' ? [0, 100] : ['auto', 'auto']}
                  />
                  <ReferenceLine
                    y={hourlyMetricMode === 'WIN_RATE' ? 50 : 0}
                    stroke={isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}
                    strokeDasharray="3 3"
                  />
                  <RechartsTooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      const nextH = String((d.hour + 1) % 24).padStart(2, '0') + ':00';
                      return (
                        <Box sx={chartTooltipStyle}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '0.8rem' }}>
                              {d.hourLabel} – {nextH} ({selectedTimezone})
                            </Typography>
                            {d.sessionHint && (
                              <Chip
                                label={d.sessionHint}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.625rem',
                                  fontWeight: 700,
                                  bgcolor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
                                  color: '#3B82F6',
                                }}
                              />
                            )}
                          </Box>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, fontSize: '0.75rem' }}>
                            <Box>
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.6875rem' }}>Volume</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                                {d.tradesCount} trades <span style={{ opacity: 0.7, fontSize: '0.7rem' }}>({d.longCount}L • {d.shortCount}S)</span>
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.6875rem' }}>Net P&L</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.8rem', color: d.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main }}>
                                {formatCurrency(d.netPnL, analyticsCurrency)}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.6875rem' }}>Win Rate</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem', color: d.tradesCount === 0 ? 'text.secondary' : d.winRate >= 50 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main }}>
                                {d.tradesCount > 0 ? `${d.winRate}%` : '—'}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.6875rem' }}>Avg R / PF</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                                {d.avgR > 0 ? `+${d.avgR}R` : `${d.avgR || 0}R`} • PF {d.profitFactor > 0 ? d.profitFactor : '—'}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      );
                    }}
                  />
                  <Bar
                    dataKey={hourlyMetricMode === 'PNL' ? 'netPnL' : hourlyMetricMode === 'WIN_RATE' ? 'winRate' : hourlyMetricMode === 'AVG_R' ? 'avgR' : 'tradesCount'}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={30}
                  >
                    {(stats?.performanceByHour || []).map((entry: any, index: number) => {
                      let cellColor = '#3B82F6';
                      if (entry.tradesCount === 0) {
                        cellColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                      } else if (hourlyMetricMode === 'PNL') {
                        cellColor = entry.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main;
                      } else if (hourlyMetricMode === 'WIN_RATE') {
                        cellColor = entry.winRate >= 50 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main;
                      } else if (hourlyMetricMode === 'AVG_R') {
                        cellColor = entry.avgR >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main;
                      } else {
                        cellColor = '#3B82F6';
                      }
                      return <Cell key={`cell-${index}`} fill={cellColor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>

            {/* Quick Insights Footer Badges */}
            {(() => {
              const hData = stats?.performanceByHour || [];
              const active = hData.filter((h: any) => h.tradesCount > 0);
              if (active.length === 0) return null;
              const bestH = active.reduce((p: any, c: any) => (c.netPnL > p.netPnL ? c : p), active[0]);
              const worstH = active.reduce((p: any, c: any) => (c.netPnL < p.netPnL ? c : p), active[0]);
              const peakVol = active.reduce((p: any, c: any) => (c.tradesCount > p.tradesCount ? c : p), active[0]);
              return (
                <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${muiTheme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {bestH && bestH.netPnL > 0 && (
                      <Chip
                        size="small"
                        icon={<TrendingUpRoundedIcon style={{ fontSize: 14, color: '#10B981' }} />}
                        label={`Golden Hour: ${bestH.hourLabel} (${formatCurrency(bestH.netPnL, analyticsCurrency)}, ${bestH.winRate}% Win)`}
                        sx={{ fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.25)' }}
                      />
                    )}
                    {worstH && worstH.netPnL < 0 && (
                      <Chip
                        size="small"
                        icon={<TrendingDownRoundedIcon style={{ fontSize: 14, color: '#EF4444' }} />}
                        label={`Hazard Window: ${worstH.hourLabel} (${formatCurrency(worstH.netPnL, analyticsCurrency)}, ${worstH.winRate}% Win)`}
                        sx={{ fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                      />
                    )}
                    {peakVol && (
                      <Chip
                        size="small"
                        label={`Peak Activity: ${peakVol.hourLabel} (${peakVol.tradesCount} trades)`}
                        sx={{ fontSize: '0.7rem', fontWeight: 700, bgcolor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)', color: '#60A5FA' }}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                    Hours reflect entry timestamps normalized to {effectiveTimezone}.
                  </Typography>
                </Box>
              );
            })()}
          </Card>

          <Grid container spacing={3}>
            {/* Weekday Breakdown */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%', borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  <Box>
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

                  {/* Day Sort Control */}
                  <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.2, px: 0.8, fontSize: '0.6875rem', textTransform: 'none', fontWeight: 600 } }}>
                    <Button
                      onClick={() => setDaySortMode('CHRONO')}
                      variant={daySortMode === 'CHRONO' ? 'contained' : 'outlined'}
                      sx={daySortMode === 'CHRONO' ? { fontWeight: 800 } : {}}
                    >
                      Calendar
                    </Button>
                    <Button
                      onClick={() => setDaySortMode('PNL')}
                      variant={daySortMode === 'PNL' ? 'contained' : 'outlined'}
                      sx={daySortMode === 'PNL' ? { fontWeight: 800 } : {}}
                    >
                      P&L
                    </Button>
                    <Button
                      onClick={() => setDaySortMode('WIN_RATE')}
                      variant={daySortMode === 'WIN_RATE' ? 'contained' : 'outlined'}
                      sx={daySortMode === 'WIN_RATE' ? { fontWeight: 800 } : {}}
                    >
                      Win %
                    </Button>
                    <Button
                      onClick={() => setDaySortMode('TRADES')}
                      variant={daySortMode === 'TRADES' ? 'contained' : 'outlined'}
                      sx={daySortMode === 'TRADES' ? { fontWeight: 800 } : {}}
                    >
                      Trades
                    </Button>
                  </ButtonGroup>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {sortedWeekdays.map((day: any) => (
                    <Tooltip key={day.day} title={`Click to inspect all ${day.tradesCount} trades taken on ${day.day}`} arrow>
                      <Box
                        onClick={() =>
                          handleOpenDrill({
                            kind: 'FILTER',
                            filter: { weekday: day.day.toLowerCase() },
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
                            transform: 'translateY(-1px)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
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

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}>
                            {day.tradesCount} trades
                            {(day.longCount > 0 || day.shortCount > 0) && (
                              <span style={{ opacity: 0.75, marginLeft: 4 }}>
                                ({day.longCount || 0}L • {day.shortCount || 0}S)
                              </span>
                            )}
                          </Typography>

                          {day.profitFactor !== undefined && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: { xs: 'none', sm: 'inline' } }}>
                              PF: <strong style={{ color: day.profitFactor >= 1.5 ? '#10B981' : undefined }}>{day.profitFactor > 0 ? day.profitFactor : '—'}</strong>
                            </Typography>
                          )}

                          {day.avgR !== undefined && (
                            <Typography variant="caption" sx={{ color: day.avgR >= 0 ? '#10B981' : '#EF4444', fontWeight: 700, display: { xs: 'none', sm: 'inline' } }}>
                              {day.avgR > 0 ? `+${day.avgR}R` : `${day.avgR}R`}
                            </Typography>
                          )}

                          <Typography variant="caption" sx={{ color: day.winRate >= 50 ? '#3B82F6' : '#EF4444', fontWeight: 700 }}>
                            {day.winRate}% Win
                          </Typography>
                        </Box>

                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: day.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                            minWidth: 80,
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(day.netPnL, analyticsCurrency)}
                        </Typography>
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary', fontSize: '0.6875rem', fontStyle: 'italic' }}>
                  Note: Subgroups with fewer than 30 trades exhibit high statistical variance. Click any day to inspect underlying executions.
                </Typography>
              </Card>
            </Grid>

            {/* Session Breakdown */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%', borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  <Box>
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

                  {/* Session Sort Control */}
                  <ButtonGroup size="small" variant="outlined" sx={{ '& .MuiButton-root': { py: 0.2, px: 0.8, fontSize: '0.6875rem', textTransform: 'none', fontWeight: 600 } }}>
                    <Button
                      onClick={() => setSessionSortMode('PNL')}
                      variant={sessionSortMode === 'PNL' ? 'contained' : 'outlined'}
                      sx={sessionSortMode === 'PNL' ? { fontWeight: 800 } : {}}
                    >
                      P&L
                    </Button>
                    <Button
                      onClick={() => setSessionSortMode('WIN_RATE')}
                      variant={sessionSortMode === 'WIN_RATE' ? 'contained' : 'outlined'}
                      sx={sessionSortMode === 'WIN_RATE' ? { fontWeight: 800 } : {}}
                    >
                      Win %
                    </Button>
                    <Button
                      onClick={() => setSessionSortMode('TRADES')}
                      variant={sessionSortMode === 'TRADES' ? 'contained' : 'outlined'}
                      sx={sessionSortMode === 'TRADES' ? { fontWeight: 800 } : {}}
                    >
                      Trades
                    </Button>
                  </ButtonGroup>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {sortedSessions && sortedSessions.length > 0 ? (
                    sortedSessions.map((sess: any) => (
                      <Tooltip key={sess.session} title={`Click to inspect all ${sess.tradesCount} trades taken during ${sess.session} session`} arrow>
                        <Box
                          onClick={() =>
                            handleOpenDrill({
                              kind: 'FILTER',
                              filter: { session: sess.session },
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
                              transform: 'translateY(-1px)',
                            },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
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

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}>
                              {sess.tradesCount} trades
                              {(sess.longCount > 0 || sess.shortCount > 0) && (
                                <span style={{ opacity: 0.75, marginLeft: 4 }}>
                                  ({sess.longCount || 0}L • {sess.shortCount || 0}S)
                                </span>
                              )}
                            </Typography>

                            {sess.profitFactor !== undefined && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: { xs: 'none', sm: 'inline' } }}>
                                PF: <strong style={{ color: sess.profitFactor >= 1.5 ? '#10B981' : undefined }}>{sess.profitFactor > 0 ? sess.profitFactor : '—'}</strong>
                              </Typography>
                            )}

                            {sess.avgR !== undefined && (
                              <Typography variant="caption" sx={{ color: sess.avgR >= 0 ? '#10B981' : '#EF4444', fontWeight: 700, display: { xs: 'none', sm: 'inline' } }}>
                                {sess.avgR > 0 ? `+${sess.avgR}R` : `${sess.avgR}R`}
                              </Typography>
                            )}

                            <Typography variant="caption" sx={{ color: sess.winRate >= 50 ? '#3B82F6' : '#EF4444', fontWeight: 700 }}>
                              {sess.winRate}% Win
                            </Typography>
                          </Box>

                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 800,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: sess.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                              minWidth: 80,
                              textAlign: 'right',
                            }}
                          >
                            {formatCurrency(sess.netPnL, analyticsCurrency)}
                          </Typography>
                        </Box>
                      </Tooltip>
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
          symbol={selectedSymbol !== 'ALL' ? selectedSymbol : undefined}
          funnelMode={funnelMode}
          setFunnelMode={setFunnelMode}
          customMfeStepsInput={customMfeStepsInput}
          setCustomMfeStepsInput={setCustomMfeStepsInput}
          excursionBackfillMutation={excursionBackfillMutation}
          onNavigateToWhatIf={(prefill) => {
            setWhatIfPrefill(prefill);
            setActiveTab('WHAT_IF');
          }}
          onOpenDrill={handleOpenDrill}
          onNavigateToSettings={() => navigate('/settings')}
        />
      )}

      {/* TAB 5: WHAT-IF SIMULATOR */}
      {activeTab === 'WHAT_IF' && (
        <WhatIfSimulatorTab
          accountId={queryParams.accountId}
          startDate={startDate}
          endDate={endDate}
          symbol={selectedSymbol !== 'ALL' ? selectedSymbol : undefined}
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
          onDrillDown={(filterOrDesc, label) => handleOpenDrill(filterOrDesc, label)}
        />
      )}
    </Box>
  );
}
