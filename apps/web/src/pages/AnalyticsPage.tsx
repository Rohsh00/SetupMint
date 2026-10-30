import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate } from 'react-router-dom';
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
import { formatCurrency, formatPercent } from '../lib/utils.js';
import { HelpHint, WithHelp } from '../components/help/index.js';
import { WhatIfSimulatorTab } from '../components/analytics/WhatIfSimulatorTab.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';
import { DateRangeFilter } from '../components/ui/DateRangeFilter.js';
import { useDateRange } from '../context/DateRangeContext.js';

export function AnalyticsPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const { openDrill } = useTradeDrilldown();
  const { startDate, endDate } = useDateRange();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PSYCHOLOGY' | 'TIME' | 'EXECUTION' | 'WHAT_IF'>('OVERVIEW');
  const [scatterMode, setScatterMode] = useState<'R' | 'POINTS' | 'AMOUNT'>('R');
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
    queryKey: ['dashboard-stats', selectedAccountId, startDate, endDate],
    queryFn: () =>
      api.dashboard.stats({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        startDate,
        endDate,
      }),
  });

  const { data: psychologyData, isLoading: isPsychLoading } = useQuery({
    queryKey: ['analytics-psychology', selectedAccountId, startDate, endDate],
    queryFn: () =>
      api.analytics.psychology({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        startDate,
        endDate,
      }),
  });

  const { data: excursionData, isLoading: isExcursionLoading } = useQuery({
    queryKey: ['analytics-excursion', selectedAccountId, startDate, endDate, funnelMode, funnelMode === 'CUSTOM' ? customMfeStepsInput : ''],
    queryFn: () =>
      api.analytics.excursion({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        startDate,
        endDate,
        funnelMode,
        customMfeSteps: funnelMode === 'CUSTOM' ? customMfeStepsInput : undefined,
      }),
    enabled: activeTab === 'EXECUTION',
  });

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
      {/* Top Header & Tab Controls */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
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

        {/* Controls: Date Filter & Tab Switcher */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <DateRangeFilter />

          {/* Tab Switcher */}
          <ButtonGroup
            variant="outlined"
            size="small"
            sx={{
              backgroundColor: muiTheme.palette.background.paper,
              borderRadius: 2,
              p: 0.5,
              border: `1px solid ${muiTheme.palette.divider}`,
            '& .MuiButtonGroup-grouped': {
              border: 'none !important',
              borderRadius: '6px !important',
              px: 1.5,
              py: 0.6,
              fontSize: '0.75rem',
              fontWeight: 600,
            },
          }}
        >
          {[
            { id: 'OVERVIEW', label: 'Curve & Distribution', icon: <ShowChartIcon fontSize="small" /> },
            { id: 'PSYCHOLOGY', label: 'Psychology & Discipline', icon: <PsychologyIcon fontSize="small" /> },
            { id: 'TIME', label: 'Time & Session', icon: <AccessTimeIcon fontSize="small" /> },
            { id: 'EXECUTION', label: 'Execution Quality (MAE/MFE)', icon: <TimelineRoundedIcon fontSize="small" /> },
            { id: 'WHAT_IF', label: 'Stops & Targets', icon: <TuneRoundedIcon fontSize="small" /> },
          ].map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              startIcon={tab.icon}
              sx={{
                backgroundColor:
                  activeTab === tab.id
                    ? `${muiTheme.palette.primary.main} !important`
                    : 'transparent',
                color:
                  activeTab === tab.id
                    ? '#FFFFFF !important'
                    : `${muiTheme.palette.text.secondary} !important`,
                '&:hover': {
                  color: `${muiTheme.palette.text.primary} !important`,
                },
              }}
            >
              {tab.label}
            </Button>
          ))}
        </ButtonGroup>
        </Box>
      </Box>

      {/* TAB 1: OVERVIEW & DISTRIBUTION */}
      {activeTab === 'OVERVIEW' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Equity & Peak-to-Trough Drawdown Curve */}
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Peak-to-Trough Drawdown Curve
                  </Typography>
                  <HelpHint hintKey="metric.drawdown" />
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Percentage drawdown from historical high equity mark
                </Typography>
              </Box>
              <Chip
                label={`Max DD: -${formatPercent(stats?.maxDrawdownPercent)} (${formatCurrency(stats?.maxDrawdownAmount)})`}
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
            </Box>

            <Box sx={{ height: 280, width: '100%' }}>
              {stats?.equityCurve && stats.equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.equityCurve}
                    style={{ cursor: 'pointer' }}
                    onClick={(e: any) => {
                      const date = e?.activePayload?.[0]?.payload?.date;
                      if (date) {
                        openDrill({
                          kind: 'FILTER',
                          filter: { date },
                          label: `Trades on ${date}`,
                        });
                      }
                    }}
                  >
                    <defs>
                      <linearGradient id="setupmintDrawdownGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="date" stroke={chartAxisColor} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={chartAxisColor}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `-${v}%`}
                    />
                    <RechartsTooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: muiTheme.palette.text.primary }}
                      labelStyle={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}
                      formatter={(val: any) => [`-${formatPercent(val)}`, 'Drawdown']}
                    />
                    <Area
                      type="monotone"
                      dataKey="drawdownPercent"
                      stroke="#F43F5E"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#setupmintDrawdownGradient)"
                    />
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
                      <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)' }}>
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
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)' }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Max Win Streak</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                          {stats?.maxConsecutiveWins || 0} Trades
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)' }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Max Loss Streak</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                          {stats?.maxConsecutiveLosses || 0} Trades
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)' }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Avg Win / Loss Ratio</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                          {stats?.avgLosingTrade ? (stats.avgWinningTrade / stats.avgLosingTrade).toFixed(2) : '—'}x
                        </Typography>
                      </Box>
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
                    <Box
                      key={d.score}
                      onClick={() =>
                        openDrill({
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
                    <Box
                      key={e.emotion}
                      onClick={() =>
                        openDrill({
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
                  <Box
                    onClick={() =>
                      openDrill({
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
                </Grid>
              ))}
            </Grid>
          </Card>
        </Box>
      )}

      {/* TAB 3: TIME & SESSION */}
      {activeTab === 'TIME' && (
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
                  NSE Regular equity market vs MCX Commodity evening session (click row to drill down)
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
      )}

      {/* TAB 4: EXECUTION QUALITY (MAE / MFE) */}
      {activeTab === 'EXECUTION' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Header Action Bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimelineRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                  Maximum Adverse Excursion (MAE) & Favorable Excursion (MFE)
                </Typography>
                <HelpHint hintKey="metric.excursionFlags" />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Measures execution efficiency, profit giveback, and optimal stop placement across evaluated trades.
              </Typography>
            </Box>
            <Tooltip title="Fetch 1-minute historical candle snapshots from FYERS or Angel One and compute peak excursion metrics for all closed trades">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={excursionBackfillMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SyncRoundedIcon fontSize="small" />}
                  onClick={() => excursionBackfillMutation.mutate({ limit: 50 })}
                  disabled={excursionBackfillMutation.isPending}
                  sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem', borderRadius: 2 }}
                >
                  {excursionBackfillMutation.isPending ? 'Backfilling Excursion...' : 'Run Excursion Backfill'}
                </Button>
              </span>
            </Tooltip>
          </Box>

          {isExcursionLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Skeleton variant="rounded" height={100} />
              <Skeleton variant="rounded" height={400} />
            </Box>
          ) : (() => {
            const rawData = (excursionData as any)?.data ?? excursionData;
            const summary = rawData?.summary;
            const points = rawData?.scatterPoints ?? [];
            const coverage = rawData?.coverage;
            const reliability = rawData?.reliability;
            const confidenceIntervals = rawData?.confidenceIntervals;
            const winnersMaeDistribution = rawData?.winnersMaeDistribution;
            const mfeReachFunnel = rawData?.mfeReachFunnel;
            const cohorts = rawData?.cohorts ?? [];
            const rollingTrend = rawData?.rollingTrend ?? [];
            const segmentShrinkage = rawData?.segmentShrinkage;
            const whatIfSuggestions = rawData?.whatIfSuggestions;

            const hasData = Boolean(summary && summary.totalEvaluated > 0);

            if (!hasData) {
              return (
                <Card sx={{ p: 5, textAlign: 'center', borderRadius: 3, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(6, 182, 212, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 2,
                    }}
                  >
                    <TimelineRoundedIcon sx={{ color: '#06b6d4', fontSize: 32 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                    No Excursion Analytics Computed Yet
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 520, mx: 'auto', mb: 3 }}>
                    Excursion analytics calculate Maximum Adverse Excursion (MAE) and Maximum Favorable Excursion (MFE) using 1-minute historical candles to measure trade drawdown and peak unrealized potential.
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={excursionBackfillMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncRoundedIcon />}
                      onClick={() => excursionBackfillMutation.mutate({ limit: 50 })}
                      disabled={excursionBackfillMutation.isPending}
                      sx={{ textTransform: 'none', fontWeight: 700, px: 3, py: 1, borderRadius: 2 }}
                    >
                      {excursionBackfillMutation.isPending ? 'Computing Excursion...' : 'Run Excursion Backfill'}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => navigate('/settings')}
                      sx={{ textTransform: 'none', fontWeight: 600, px: 2.5, py: 1, borderRadius: 2, borderColor: 'rgba(255, 255, 255, 0.15)' }}
                    >
                      Market Data Settings
                    </Button>
                  </Box>
                </Card>
              );
            }

            // Scatter data separated by win / loss
            const hasStops = (summary?.countWithStop ?? 0) > 0;
            const currentMode = (!hasStops && scatterMode === 'R') ? 'POINTS' : scatterMode;
            const isModeR = currentMode === 'R';
            const isModePoints = currentMode === 'POINTS';
            const isModeAmount = currentMode === 'AMOUNT';

            const getX = (p: any) => (isModeR ? p.maeR : isModePoints ? p.maePoints : p.maeAmount);
            const getY = (p: any) => (isModeR ? p.mfeR : isModePoints ? p.mfePoints : p.mfeAmount);

            const validPoints = points.filter((p: any) => getX(p) !== undefined && getY(p) !== undefined);
            const winPoints = validPoints.filter((p: any) => p.outcome === 'WIN');
            const lossPoints = validPoints.filter((p: any) => p.outcome !== 'WIN');

            return (
              <>
                {/* 1. COVERAGE & SAMPLE RELIABILITY BANNER */}
                <Card
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TimelineRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Data Coverage:
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        <strong>{coverage?.computedCount ?? summary?.totalEvaluated}</strong> of{' '}
                        <strong>{coverage?.totalClosedCount ?? summary?.totalEvaluated}</strong> closed trades evaluated ({coverage?.coveragePercent ?? 100}%)
                      </Typography>
                    </Box>

                    {coverage && coverage.uncomputedCount > 0 && (
                      <Tooltip
                        title={
                          <Box sx={{ p: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                              Uncomputed Reasons ({coverage.uncomputedCount} trades):
                            </Typography>
                            {Object.entries(coverage.uncomputedReasons || {}).map(([reason, cnt]) => (
                              <Typography key={reason} variant="caption" sx={{ display: 'block' }}>
                                • {reason}: {cnt as number}
                              </Typography>
                            ))}
                          </Box>
                        }
                      >
                        <Chip
                          size="small"
                          variant="outlined"
                          color="default"
                          label={`${coverage.uncomputedCount} uncomputed`}
                          sx={{ fontSize: '0.72rem', height: 22, cursor: 'help' }}
                        />
                      </Tooltip>
                    )}

                    {summary?.lowResolutionCount > 0 && (
                      <Tooltip title="Trades whose holding duration exceeded 1-minute broker candle lookback and fell back to 5-minute resolution.">
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={`${summary.lowResolutionCount} on 5m fallback`}
                          sx={{ fontSize: '0.72rem', height: 22 }}
                        />
                      </Tooltip>
                    )}

                    {summary?.excludedUnderlyingFallbackCount > 0 && (
                      <Tooltip title="Option trades where historical premium candles were unavailable. Fallback to spot index was excluded from aggregate metrics to avoid skewing option point scales.">
                        <Chip
                          size="small"
                          color="info"
                          variant="outlined"
                          label={`${summary.excludedUnderlyingFallbackCount} spot-fallback options excluded`}
                          sx={{ fontSize: '0.72rem', height: 22 }}
                        />
                      </Tooltip>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {reliability && (
                      <Tooltip title={reliability.message || 'Statistical sample size reliability'}>
                        <Chip
                          size="small"
                          icon={
                            reliability.status === 'RELIABLE' ? (
                              <CheckCircleRoundedIcon fontSize="small" />
                            ) : (
                              <WarningAmberIcon fontSize="small" />
                            )
                          }
                          color={
                            reliability.status === 'RELIABLE'
                              ? 'success'
                              : reliability.status === 'LOW'
                              ? 'warning'
                              : 'error'
                          }
                          label={
                            reliability.status === 'RELIABLE'
                              ? `Reliable Sample (n=${reliability.sampleSize})`
                              : `Low Sample Size (n=${reliability.sampleSize} < 30)`
                          }
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      </Tooltip>
                    )}
                    <HelpHint hintKey="metric.sampleReliability" />
                  </Box>
                </Card>

                {/* 2. OPTIMAL STOP & TARGET DECISION BRIDGE */}
                {whatIfSuggestions && (
                  <Card
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      border: '1px solid rgba(14, 165, 233, 0.3)',
                      background: isDark
                        ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)'
                        : 'linear-gradient(135deg, #F0F9FF 0%, #EEF2FF 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 2,
                    }}
                  >
                    <Box sx={{ maxWidth: 720 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip
                          size="small"
                          color="primary"
                          icon={<ScienceRoundedIcon fontSize="small" />}
                          label="Decision Bridge"
                          sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          Empirical Stop & Target Recommendations
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                        {whatIfSuggestions.rationale}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          Suggested Stop:{' '}
                          <span style={{ color: muiTheme.palette.loss.main }}>{whatIfSuggestions.suggestedStopR}R</span>
                        </Typography>
                        <Divider orientation="vertical" flexItem sx={{ height: 16, my: 'auto' }} />
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          Suggested Target:{' '}
                          <span style={{ color: muiTheme.palette.profit.main }}>{whatIfSuggestions.suggestedTargetR}R</span>
                        </Typography>
                      </Box>
                    </Box>

                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AutoAwesomeRoundedIcon />}
                      onClick={() => {
                        setWhatIfPrefill({
                          stopR: whatIfSuggestions.suggestedStopR,
                          targetR: whatIfSuggestions.suggestedTargetR,
                        });
                        setActiveTab('WHAT_IF');
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5 }}
                    >
                      Simulate in What-If Grid
                    </Button>
                  </Card>
                )}

                {/* 3. KPI SUMMARY CARDS (STATISTICAL HONESTY) */}
                <Grid container spacing={2}>
                  {/* Card 1: Avg MFE */}
                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card
                      onClick={() =>
                        openDrill({
                          kind: 'FILTER',
                          filter: { mfeRMin: 0.01 },
                          label: 'Trades with Favorable Excursion',
                        })
                      }
                      sx={{
                        p: 2,
                        height: '100%',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: muiTheme.palette.profit.main,
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Maximum Favorable Excursion: The peak unrealized profit reached before exit. Click to inspect trades.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Avg MFE (Favorable)
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.mfe" />
                      </Box>
                      <Tooltip title="Average peak potential across trades with stops. Median and 90% Bootstrap CI below.">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                          +{summary.avgMfeR !== undefined ? `${Number(summary.avgMfeR).toFixed(2)}R` : (summary.mfeR?.mean !== undefined ? `${Number(summary.mfeR.mean).toFixed(2)}R` : '—')}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Median: <strong>+{summary.medianMfeR !== undefined ? `${Number(summary.medianMfeR).toFixed(2)}R` : (summary.mfeR?.median !== undefined ? `${Number(summary.mfeR.median).toFixed(2)}R` : '—')}</strong> (IQR {summary.p25MfeR ?? summary.mfeR?.p25 ?? '—'}R - {summary.p75MfeR ?? summary.mfeR?.p75 ?? '—'}R)
                      </Typography>
                      {confidenceIntervals?.avgMfeR && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.25 }}>
                          90% CI: [{confidenceIntervals.avgMfeR.lower}R, {confidenceIntervals.avgMfeR.upper}R]
                        </Typography>
                      )}
                    </Card>
                  </Grid>

                  {/* Card 2: Avg MAE */}
                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card
                      onClick={() =>
                        openDrill({
                          kind: 'FILTER',
                          filter: { maeRMin: 0.01 },
                          label: 'Trades with Adverse Excursion',
                        })
                      }
                      sx={{
                        p: 2,
                        height: '100%',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: muiTheme.palette.loss.main,
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(244, 63, 94, 0.15)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Maximum Adverse Excursion: The deepest unrealized drawdown experienced while trade was open. Click to inspect trades.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Avg MAE (Adverse)
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.mae" />
                      </Box>
                      <Tooltip title="Average maximum adverse drawdown across trades with stops. Median and 90% Bootstrap CI below.">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                          -{summary.avgMaeR !== undefined ? `${Number(summary.avgMaeR).toFixed(2)}R` : (summary.maeR?.mean !== undefined ? `${Number(summary.maeR.mean).toFixed(2)}R` : '—')}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Median: <strong>-{summary.medianMaeR !== undefined ? `${Number(summary.medianMaeR).toFixed(2)}R` : (summary.maeR?.median !== undefined ? `${Number(summary.maeR.median).toFixed(2)}R` : '—')}</strong> (IQR -{summary.p75MaeR ?? summary.maeR?.p75 ?? '—'}R to -{summary.p25MaeR ?? summary.maeR?.p25 ?? '—'}R)
                      </Typography>
                      {confidenceIntervals?.avgMaeR && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.25 }}>
                          90% CI: [-{confidenceIntervals.avgMaeR.upper}R, -{confidenceIntervals.avgMaeR.lower}R]
                        </Typography>
                      )}
                    </Card>
                  </Grid>

                  {/* Card 3: Exit Efficiency */}
                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Exit Efficiency: Percentage of the maximum favorable price move (MFE) captured at actual exit. Flat scratch trades with zero MFE return N/A.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Exit Efficiency
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.exitEfficiency" />
                      </Box>
                      <Tooltip title="Percentage of peak favorable excursion captured at exit (higher is better)">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                          {summary.avgExitEfficiency !== undefined ? `${(Number(summary.avgExitEfficiency) * 100).toFixed(1)}%` : (summary.exitEfficiency?.mean !== undefined ? `${(Number(summary.exitEfficiency.mean) * 100).toFixed(1)}%` : '—')}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Median: <strong>{summary.medianExitEfficiency !== undefined ? `${(Number(summary.medianExitEfficiency) * 100).toFixed(1)}%` : (summary.exitEfficiency?.median !== undefined ? `${(Number(summary.exitEfficiency.median) * 100).toFixed(1)}%` : '—')}</strong>
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.25 }}>
                        Stop Efficiency: {summary.avgStopEfficiency !== undefined ? `${(Number(summary.avgStopEfficiency) * 100).toFixed(1)}%` : (summary.stopEfficiency?.mean !== undefined ? `${(Number(summary.stopEfficiency.mean) * 100).toFixed(1)}%` : '—')}
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Card 4: R Left on Table */}
                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="R Left on the Table: Difference between peak favorable excursion reached (MFE_R) and actual realized return (realized_R). Quantifies money surrendered to the market.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            R Left on Table
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="analytics.execution.rLeftOnTable" />
                      </Box>
                      <Tooltip title="Average unrealized R-multiple profit surrendered before exit">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.warning.main, mt: 0.5 }}>
                          +{summary.avgRLeftOnTable !== undefined ? `${Number(summary.avgRLeftOnTable).toFixed(2)}R` : (summary.rLeftOnTable?.mean !== undefined ? `${Number(summary.rLeftOnTable.mean).toFixed(2)}R` : '—')}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Median: <strong>+{summary.medianRLeftOnTable !== undefined ? `${Number(summary.medianRLeftOnTable).toFixed(2)}R` : (summary.rLeftOnTable?.median !== undefined ? `${Number(summary.rLeftOnTable.median).toFixed(2)}R` : '—')}</strong> surrendered
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.25 }}>
                        Formula: max(0, MFE_R - Realized_R)
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Card 5: Order Flow & Diagnostic Flags */}
                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Order Flow & Follow-Through: Measures how quickly market moved in your favor vs against you in the first 5 candles.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Follow-Through
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="analytics.execution.followThrough" />
                      </Box>
                      <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: '#8B5CF6', mt: 0.5 }}>
                        {summary.avgEntryQualityScore !== undefined ? summary.avgEntryQualityScore : (summary.entryQualityScore?.mean !== undefined ? (Number(summary.entryQualityScore.mean) / 100).toFixed(2) : '—')}
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'text.secondary' }}> / 1.0</span>
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Heat-First: <strong>{summary.heatFirstPercent ?? summary.timeOrdering?.heatFirstPercent ?? 0}%</strong> ({summary.heatFirstCount ?? summary.timeOrdering?.heatFirstCount ?? 0} trades)
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.25 }}>
                        Run-First: <strong>{summary.timeOrdering?.runFirstCount !== undefined ? (100 - (summary.timeOrdering.heatFirstPercent || 0)).toFixed(1) : (100 - (summary.heatFirstPercent || 0)).toFixed(1)}%</strong> ({summary.runFirstCount ?? summary.timeOrdering?.runFirstCount ?? 0} trades)
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* 4. WINNER-ONLY MAE DISTRIBUTION (STOP LOSS OPTIMIZATION) */}
                {winnersMaeDistribution && winnersMaeDistribution.distribution && (
                  <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SecurityIcon sx={{ color: muiTheme.palette.profit.main, fontSize: 20 }} />
                            Winner-Only MAE Distribution (Stop Loss Optimization)
                          </Typography>
                          <HelpHint hintKey="analytics.execution.winnersMae" />
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Did your winners actually need their full stop room? If 90% of winners never suffer &gt;0.4R adverse heat, a 1.0R stop absorbs unnecessary risk.
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          label={`P50 MAE: ${winnersMaeDistribution.p50MaeR}R`}
                          sx={{ fontWeight: 700, fontSize: '0.72rem', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }}
                        />
                        <Chip
                          size="small"
                          label={`P75 MAE: ${winnersMaeDistribution.p75MaeR}R`}
                          sx={{ fontWeight: 700, fontSize: '0.72rem', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#BBF7D0' }}
                        />
                        <Chip
                          size="small"
                          color="primary"
                          label={`P90 MAE: ${winnersMaeDistribution.p90MaeR}R`}
                          sx={{ fontWeight: 800, fontSize: '0.72rem' }}
                        />
                      </Box>
                    </Box>

                    <Box sx={{ width: '100%', height: 220, mt: 2 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={winnersMaeDistribution.distribution} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                          <XAxis dataKey="bucketLabel" stroke={chartAxisColor} fontSize={11} />
                          <YAxis stroke={chartAxisColor} fontSize={11} />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                  <Paper sx={{ ...chartTooltipStyle, p: 1.5 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      Adverse Drawdown: {d.bucketLabel}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                      Winners in bucket: <strong>{d.count}</strong> ({d.percent}%)
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', color: 'primary.main', fontWeight: 700 }}>
                                      Cumulative Winners: {d.cumulativePercent}%
                                    </Typography>
                                  </Paper>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="count" fill={muiTheme.palette.profit.main} radius={[4, 4, 0, 0]}>
                            {winnersMaeDistribution.distribution.map((entry: any, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={index >= 4 ? muiTheme.palette.warning.main : muiTheme.palette.profit.main}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </Card>
                )}

                {/* 4.5 MFE REACH FUNNEL & ROUND-TRIP LOSS ANALYSIS */}
                {mfeReachFunnel && mfeReachFunnel.steps && mfeReachFunnel.steps.length > 0 && (
                  <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUpRoundedIcon sx={{ color: '#06B6D4', fontSize: 22 }} />
                            MFE Reach Funnel & Round-Trip Loss Prevention
                          </Typography>
                          <HelpHint hintKey="analytics.execution.funnel" />
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Tracks trade progression through milestone R levels and pinpoints where profitable trades reverse into full losses.
                        </Typography>

                        {/* Interactive Dynamic / Custom Milestone Mode Selector */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                            MILESTONES:
                          </Typography>
                          {(['AUTO', 'PLANNED_TARGETS', 'STANDARD', 'CUSTOM'] as const).map((m) => (
                            <Chip
                              key={m}
                              size="small"
                              label={
                                m === 'AUTO'
                                  ? 'Data-Adaptive (Auto)'
                                  : m === 'PLANNED_TARGETS'
                                  ? 'Planned Targets'
                                  : m === 'STANDARD'
                                  ? 'Standard (+0.5R)'
                                  : 'Custom R Steps'
                              }
                              onClick={() => setFunnelMode(m)}
                              color={funnelMode === m ? 'primary' : 'default'}
                              variant={funnelMode === m ? 'filled' : 'outlined'}
                              sx={{
                                fontWeight: funnelMode === m ? 800 : 600,
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                              }}
                            />
                          ))}

                          {funnelMode === 'CUSTOM' && (
                            <TextField
                              size="small"
                              placeholder="e.g. 0.5, 1.0, 1.8, 2.5, 4.0"
                              value={customMfeStepsInput}
                              onChange={(e) => setCustomMfeStepsInput(e.target.value)}
                              sx={{
                                width: 200,
                                '& .MuiInputBase-input': {
                                  py: 0.4,
                                  px: 1,
                                  fontSize: '0.75rem',
                                  fontFamily: `'JetBrains Mono', monospace`,
                                },
                              }}
                            />
                          )}
                        </Box>
                      </Box>

                      {/* Top Badges */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Tooltip title="Percentage of trades reaching ≥ +1.0R that closed as losses (surrendered profits)">
                          <Chip
                            size="small"
                            label={`Round-Trip Loss Rate: ${mfeReachFunnel.roundTripLossRate}%`}
                            sx={{
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              color: mfeReachFunnel.roundTripLossRate > 25 ? '#EF4444' : '#10B981',
                              backgroundColor: isDark
                                ? (mfeReachFunnel.roundTripLossRate > 25 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)')
                                : (mfeReachFunnel.roundTripLossRate > 25 ? '#FEE2E2' : '#DCFCE7'),
                              border: '1px solid',
                              borderColor: mfeReachFunnel.roundTripLossRate > 25 ? alpha('#EF4444', 0.3) : alpha('#10B981', 0.3),
                            }}
                          />
                        </Tooltip>

                        {mfeReachFunnel.totalSurrenderedAmount > 0 && (
                          <Tooltip title="Total peak unrealized profit surrendered across round-tripped trades">
                            <Chip
                              size="small"
                              label={`Surrendered: ${formatCurrency(mfeReachFunnel.totalSurrenderedAmount, 'INR')}`}
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                color: '#F59E0B',
                                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                              }}
                            />
                          </Tooltip>
                        )}

                        {mfeReachFunnel.roundTripLossCount > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              openDrill({
                                kind: 'FILTER',
                                filter: { mfeRMin: 1.0, outcome: 'LOSS' },
                                label: `Round-Trip Loss Trades (Reached ≥ +1.0R Then Stopped Out)`,
                              })
                            }
                            sx={{
                              textTransform: 'none',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              py: 0.25,
                              px: 1.25,
                              borderRadius: 1.5,
                              borderColor: alpha('#EF4444', 0.4),
                              color: '#EF4444',
                              '&:hover': {
                                borderColor: '#EF4444',
                                backgroundColor: alpha('#EF4444', 0.08),
                              },
                            }}
                          >
                            Drill Down ({mfeReachFunnel.roundTripLossCount} Trades)
                          </Button>
                        )}
                      </Box>
                    </Box>

                    {/* Funnel Step Cards Grid */}
                    <Grid container spacing={1.5} sx={{ mb: 2 }}>
                      {mfeReachFunnel.steps.map((step: any) => {
                        const isTarget = step.isPlannedTarget || step.thresholdR === 1.0;
                        const reachedPct = step.reachedPercent ?? step.reachPct ?? 0;
                        const winPct = step.closedAsWinPercent ?? step.winConversionPct ?? 0;
                        const lossPct =
                          step.closedAsLossPercent ??
                          (step.reachedCount > 0 ? Number(((step.closedAsLossCount / step.reachedCount) * 100).toFixed(1)) : 0);

                        return (
                          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={step.thresholdR}>
                            <Card
                              variant="outlined"
                              onClick={() =>
                                openDrill({
                                  kind: 'FILTER',
                                  filter: { mfeRMin: step.thresholdR },
                                  label: `Trades Reaching ≥ +${step.thresholdR}R MFE (${step.label})`,
                                })
                              }
                              sx={{
                                p: 1.5,
                                borderRadius: 2,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                  transform: 'translateY(-2px)',
                                  boxShadow: isDark
                                    ? '0 6px 16px rgba(6, 182, 212, 0.2)'
                                    : '0 6px 16px rgba(6, 182, 212, 0.15)',
                                  borderColor: '#06B6D4',
                                },
                                backgroundColor: isTarget
                                  ? (isDark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(6, 182, 212, 0.04)')
                                  : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                                borderColor: isTarget
                                  ? '#06B6D4'
                                  : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
                              }}
                            >
                              {/* Header with label and full visible target badge */}
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0.5, mb: 0.5, minHeight: 22 }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', fontSize: '0.72rem', lineHeight: 1.2 }}>
                                  {step.label}
                                </Typography>
                                {isTarget && (
                                  <Chip
                                    label={step.thresholdR === 1.0 ? '1:1 TARGET' : 'PT TARGET'}
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.6rem',
                                      fontWeight: 800,
                                      px: 0.5,
                                      flexShrink: 0,
                                      bgcolor: step.thresholdR === 1.0 ? '#06B6D4' : '#8B5CF6',
                                      color: '#FFF',
                                    }}
                                  />
                                )}
                              </Box>

                              <Typography variant="h6" sx={{ fontWeight: 800, my: 0.5, fontSize: '1rem', fontFamily: `'JetBrains Mono', monospace` }}>
                                {step.reachedCount}{' '}
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>
                                  ({reachedPct}%)
                                </span>
                              </Typography>

                              {/* Conversion breakdown */}
                              <Box sx={{ mt: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#10B981', fontWeight: 700 }}>
                                    Won: {step.closedAsWinCount}
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#EF4444', fontWeight: 700 }}>
                                    Lost: {step.closedAsLossCount}
                                  </Typography>
                                </Box>

                                {/* Progress bar ratio */}
                                <Box
                                  sx={{
                                    height: 6,
                                    borderRadius: 3,
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                                    overflow: 'hidden',
                                    display: 'flex',
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: `${winPct}%`,
                                      bgcolor: '#10B981',
                                    }}
                                  />
                                  <Box
                                    sx={{
                                      width: `${lossPct}%`,
                                      bgcolor: '#EF4444',
                                    }}
                                  />
                                </Box>

                                {step.closedAsLossCount > 0 && (
                                  <Typography
                                    variant="caption"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDrill({
                                        kind: 'FILTER',
                                        filter: { mfeRMin: step.thresholdR, outcome: 'LOSS' },
                                        label: `Trades reaching ${step.label} that closed as loss`,
                                      });
                                    }}
                                    sx={{
                                      display: 'block',
                                      mt: 0.75,
                                      fontSize: '0.62rem',
                                      color: '#EF4444',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      '&:hover': { textDecoration: 'underline' },
                                    }}
                                  >
                                    {step.closedAsLossCount} round-tripped ↗
                                  </Typography>
                                )}
                              </Box>
                            </Card>
                          </Grid>
                        );
                      })}
                    </Grid>

                    {/* Educational / Recommendation Callout */}
                    {mfeReachFunnel.roundTripLossCount > 0 && (
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.06)' : '#F0FDF4',
                          border: '1px solid',
                          borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#BBF7D0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                        }}
                      >
                        <LightbulbRoundedIcon sx={{ color: '#10B981', fontSize: 24, flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.75rem', lineHeight: 1.5 }}>
                          <strong>Optimizer Insight:</strong> {mfeReachFunnel.roundTripLossCount} trades reached +1.0R but reversed into losses, surrendering {formatCurrency(mfeReachFunnel.totalSurrenderedAmount, 'INR')}. Moving your Stop Loss to Breakeven or booking 50% partial profit on the Live Watcher would protect ~{formatCurrency(mfeReachFunnel.totalSurrenderedAmount * 0.5, 'INR')} in capital.
                        </Typography>
                      </Box>
                    )}
                  </Card>
                )}

                {/* 5. MAE vs MFE SCATTER PLOT */}
                <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          MAE vs MFE Scatter Analysis ({isModeR ? 'R-Multiple' : isModePoints ? 'Points' : '₹ Amount'})
                        </Typography>
                        <HelpHint hintKey="analytics.excursion.scatter" />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        X-Axis: Adverse excursion (drawdown) • Y-Axis: Favorable excursion (peak potential)
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 2 }}>
                        <Tooltip title="View excursion normalized to initial risk (1R). Only includes trades where stop loss was set.">
                          <span>
                            <Button
                              variant={currentMode === 'R' ? 'contained' : 'outlined'}
                              onClick={() => setScatterMode('R')}
                              size="small"
                              sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, px: 1.5, py: 0.25 }}
                            >
                              R-Multiple {summary?.countWithStop !== undefined ? `(${summary.countWithStop})` : ''}
                            </Button>
                          </span>
                        </Tooltip>
                        <Tooltip title="View excursion in price points/ticks across all evaluated trades.">
                          <span>
                            <Button
                              variant={currentMode === 'POINTS' ? 'contained' : 'outlined'}
                              onClick={() => setScatterMode('POINTS')}
                              size="small"
                              sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, px: 1.5, py: 0.25 }}
                            >
                              Points ({points.filter((p: any) => p.maePoints !== undefined).length})
                            </Button>
                          </span>
                        </Tooltip>
                        <Tooltip title="View excursion in Indian Rupee (₹) monetary drawdown and profit potential across all trades.">
                          <span>
                            <Button
                              variant={currentMode === 'AMOUNT' ? 'contained' : 'outlined'}
                              onClick={() => setScatterMode('AMOUNT')}
                              size="small"
                              sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, px: 1.5, py: 0.25 }}
                            >
                              Amount (₹)
                            </Button>
                          </span>
                        </Tooltip>
                      </ButtonGroup>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tooltip title="Winning trades with Net P&L >= ₹0">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'default' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: muiTheme.palette.profit.main }} />
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Winners ({winPoints.length})</Typography>
                          </Box>
                        </Tooltip>
                        <Tooltip title="Losing trades with Net P&L < ₹0">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'default' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: muiTheme.palette.loss.main }} />
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Losers ({lossPoints.length})</Typography>
                          </Box>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ width: '100%', height: 420 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                        <XAxis
                          type="number"
                          dataKey={isModeR ? 'maeR' : isModePoints ? 'maePoints' : 'maeAmount'}
                          name={isModeR ? 'MAE (R)' : isModePoints ? 'MAE (Points)' : 'MAE (₹)'}
                          unit={isModeR ? 'R' : isModePoints ? ' pts' : ' ₹'}
                          stroke={chartAxisColor}
                          fontSize={11}
                          domain={[0, 'dataMax + 0.5']}
                        />
                        <YAxis
                          type="number"
                          dataKey={isModeR ? 'mfeR' : isModePoints ? 'mfePoints' : 'mfeAmount'}
                          name={isModeR ? 'MFE (R)' : isModePoints ? 'MFE (Points)' : 'MFE (₹)'}
                          unit={isModeR ? 'R' : isModePoints ? ' pts' : ' ₹'}
                          stroke={chartAxisColor}
                          fontSize={11}
                          domain={[0, 'dataMax + 0.5']}
                        />
                        <ZAxis range={[60, 60]} />
                        {isModeR && (
                          <>
                            <ReferenceLine y={1} stroke={chartAxisColor} strokeDasharray="4 4" label={{ value: '1R Potential', fill: chartAxisColor, fontSize: 10, position: 'insideTopLeft' }} />
                            <ReferenceLine x={1} stroke={chartAxisColor} strokeDasharray="4 4" label={{ value: '1R Stop Boundary', fill: chartAxisColor, fontSize: 10, position: 'insideBottomRight' }} />
                          </>
                        )}
                        <RechartsTooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <Paper sx={{ ...chartTooltipStyle, p: 1.5, border: `1px solid ${muiTheme.palette.divider}` }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    {d.symbol}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                                    {d.tradeDate} • {d.outcome}
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem' }}>
                                    <div>
                                      <strong>MAE:</strong>{' '}
                                      {d.maeR !== undefined ? `${d.maeR} R` : '—'}
                                      {d.maePoints !== undefined ? ` (${d.maePoints} pts)` : ''}
                                      {d.maeAmount !== undefined ? ` • ₹${Math.abs(d.maeAmount).toLocaleString('en-IN')}` : ''}
                                    </div>
                                    <div>
                                      <strong>MFE:</strong>{' '}
                                      {d.mfeR !== undefined ? `${d.mfeR} R` : '—'}
                                      {d.mfePoints !== undefined ? ` (${d.mfePoints} pts)` : ''}
                                      {d.mfeAmount !== undefined ? ` • ₹${Math.abs(d.mfeAmount).toLocaleString('en-IN')}` : ''}
                                    </div>
                                    <div>
                                      <strong>Exit Efficiency:</strong>{' '}
                                      {d.exitEfficiency !== undefined ? `${(d.exitEfficiency * 100).toFixed(1)}%` : '—'}
                                    </div>
                                    <div style={{ color: d.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main }}>
                                      <strong>Net P&L:</strong> {formatCurrency(d.netPnL)}
                                    </div>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                                      Click dot to inspect trade details
                                    </Typography>
                                  </Box>
                                </Paper>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter
                          name="Winners"
                          data={winPoints}
                          fill={muiTheme.palette.profit.main}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const tradeId = entry?.tradeId || entry?.payload?.tradeId;
                            if (tradeId) {
                              openDrill({
                                kind: 'TRADE',
                                tradeId,
                                label: `Trade ${entry?.symbol || entry?.payload?.symbol || ''}`,
                              });
                            }
                          }}
                        />
                        <Scatter
                          name="Losers"
                          data={lossPoints}
                          fill={muiTheme.palette.loss.main}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const tradeId = entry?.tradeId || entry?.payload?.tradeId;
                            if (tradeId) {
                              openDrill({
                                kind: 'TRADE',
                                tradeId,
                                label: `Trade ${entry?.symbol || entry?.payload?.symbol || ''}`,
                              });
                            }
                          }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </Box>

                  {/* Interpretation Guidance */}
                  <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    <Tooltip title="Benchmark execution: The entry was so accurate that market price barely moved against your position before running to target." arrow>
                      <Box sx={{ flex: 1, minWidth: 200, cursor: 'help' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block' }}>
                          Clean Winners (Top Left)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Low MAE (&lt; 0.5R) and high MFE (&gt; 1.5R). Perfect execution with minimal heat.
                        </Typography>
                      </Box>
                    </Tooltip>
                    <Tooltip title="Stressful execution: Price suffered significant drawdown before recovering. Check if entries are premature or if stops were saved by luck." arrow>
                      <Box sx={{ flex: 1, minWidth: 200, cursor: 'help' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block' }}>
                          Rollercoaster Trades (Top Right)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          High MAE and high MFE. Large adverse heat taken before reaching target; review entries.
                        </Typography>
                      </Box>
                    </Tooltip>
                    <Tooltip title="Trade management edge: If peak MFE is high but realized P&L is low, tighten trailing stops or take partial profits at +1.5R to +2R." arrow>
                      <Box sx={{ flex: 1, minWidth: 200, cursor: 'help' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block' }}>
                          Exit Efficiency Opportunity
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          If MFE is consistently 2-3x higher than realized R, trail stops more tightly or take partials.
                        </Typography>
                      </Box>
                    </Tooltip>
                  </Box>
                </Card>

                {/* 6. COHORT COMPARISONS (PSYCHOLOGY & DISCIPLINE EXECUTION BRIDGES) */}
                {cohorts.length > 0 && (
                  <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PsychologyIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          Execution Quality Cohort Comparisons
                        </Typography>
                        <HelpHint hintKey="analytics.execution.cohorts" />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Connect execution efficiency directly to discipline, psychology, and trading session conditions.
                      </Typography>
                    </Box>

                    <Grid container spacing={2}>
                      {cohorts.map((c: any) => (
                        <Grid key={c.cohortName} size={{ xs: 12, md: 6 }}>
                          <Paper
                            sx={{
                              p: 2,
                              borderRadius: 2,
                              border: `1px solid ${muiTheme.palette.divider}`,
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                {c.cohortName}
                              </Typography>
                              <Chip
                                size="small"
                                label={`Δ ${(c.exitEfficiencyDelta * 100).toFixed(1)}%`}
                                color={c.exitEfficiencyDelta >= 0 ? 'success' : 'error'}
                                sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
                              />
                            </Box>

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                              {/* Group A */}
                              <Box sx={{ flex: 1, p: 1.25, borderRadius: 1.5, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                  {c.groupA.label} ({c.groupA.count} trades)
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800, mt: 0.5 }}>
                                  Exit Eff: {(c.groupA.avgExitEfficiency * 100).toFixed(1)}%
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                                  MAE: -{c.groupA.avgMaeR}R • MFE: +{c.groupA.avgMfeR}R
                                </Typography>
                              </Box>

                              {/* Group B */}
                              <Box sx={{ flex: 1, p: 1.25, borderRadius: 1.5, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                  {c.groupB.label} ({c.groupB.count} trades)
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800, mt: 0.5 }}>
                                  Exit Eff: {(c.groupB.avgExitEfficiency * 100).toFixed(1)}%
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                                  MAE: -{c.groupB.avgMaeR}R • MFE: +{c.groupB.avgMfeR}R
                                </Typography>
                              </Box>
                            </Box>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </Card>
                )}

                {/* 7. ROLLING 20-TRADE EXECUTION TREND */}
                {rollingTrend.length > 5 && (
                  <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TrendingUpRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          Rolling 20-Trade Execution Quality Trend
                        </Typography>
                        <HelpHint hintKey="analytics.execution.rollingTrend" />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Tracks whether your exit discipline and adverse drawdown management are improving or deteriorating over time.
                      </Typography>
                    </Box>

                    <Box sx={{ width: '100%', height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rollingTrend} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                          <XAxis dataKey="index" stroke={chartAxisColor} fontSize={11} />
                          <YAxis yAxisId="left" stroke={chartAxisColor} fontSize={11} unit="%" domain={[0, 100]} />
                          <YAxis yAxisId="right" orientation="right" stroke={chartAxisColor} fontSize={11} unit="R" domain={[0, 'auto']} />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                  <Paper sx={{ ...chartTooltipStyle, p: 1.5 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      Trade #{d.index}: {d.symbol} ({d.tradeDate})
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', color: muiTheme.palette.profit.main, mt: 0.5 }}>
                                      Rolling Exit Efficiency: <strong>{(d.rollingExitEfficiency * 100).toFixed(1)}%</strong>
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', color: muiTheme.palette.loss.main }}>
                                      Rolling Avg MAE: <strong>-{d.rollingAvgMaeR}R</strong>
                                    </Typography>
                                  </Paper>
                                );
                              }
                              return null;
                            }}
                          />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey={(d: any) => Number((d.rollingExitEfficiency * 100).toFixed(1))}
                            name="Exit Efficiency (%)"
                            stroke={muiTheme.palette.profit.main}
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="rollingAvgMaeR"
                            name="Avg MAE (R)"
                            stroke={muiTheme.palette.loss.main}
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </Card>
                )}
              </>
            );
          })()}
        </Box>
      )}

      {/* TAB 5: WHAT-IF SIMULATOR */}
      {activeTab === 'WHAT_IF' && (
        <WhatIfSimulatorTab
          accountId={selectedAccountId}
          startDate={startDate}
          endDate={endDate}
          initialSuggestedStopR={whatIfPrefill?.stopR}
          initialSuggestedTargetR={whatIfPrefill?.targetR}
        />
      )}
    </Box>
  );
}
