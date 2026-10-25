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
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme as useMuiTheme } from '@mui/material/styles';
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

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

export function AnalyticsPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PSYCHOLOGY' | 'TIME' | 'EXECUTION' | 'WHAT_IF'>('OVERVIEW');
  const [scatterMode, setScatterMode] = useState<'R' | 'POINTS' | 'AMOUNT'>('R');
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
    queryKey: ['dashboard-stats', selectedAccountId],
    queryFn: () =>
      api.dashboard.stats({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
      }),
  });

  const { data: psychologyData, isLoading: isPsychLoading } = useQuery({
    queryKey: ['analytics-psychology', selectedAccountId],
    queryFn: () =>
      api.analytics.psychology({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
      }),
  });

  const { data: excursionData, isLoading: isExcursionLoading } = useQuery({
    queryKey: ['analytics-excursion', selectedAccountId],
    queryFn: () =>
      api.analytics.excursion({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
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

      {/* TAB 1: OVERVIEW & DISTRIBUTION */}
      {activeTab === 'OVERVIEW' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Equity & Peak-to-Trough Drawdown Curve */}
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Peak-to-Trough Drawdown Curve
                </Typography>
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
                  <AreaChart data={stats.equityCurve}>
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
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Trade P&L Distribution
                  </Typography>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Frequency of trade profits and losses by range
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
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
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
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Consistency & Run Streaks
                  </Typography>
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
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SecurityIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                    Discipline Rating vs Performance
                  </Typography>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Correlation between execution discipline rating (1 to 5) and trading results
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {psychologyData?.performanceByDiscipline?.map((d: any) => (
                    <Box
                      key={d.score}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.25,
                        px: 1.5,
                        borderRadius: 1.5,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
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
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PsychologyIcon fontSize="small" sx={{ color: '#8B5CF6' }} />
                    Emotional State at Entry vs P&L
                  </Typography>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    How emotional mindset at entry impacts your bottom-line profitability
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {psychologyData?.performanceByEmotion?.map((e: any) => (
                    <Box
                      key={e.emotion}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.25,
                        px: 1.5,
                        borderRadius: 1.5,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
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
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', color: muiTheme.palette.loss.main }}>
                The Monetary Cost of Discipline Mistakes
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Direct monetary loss incurred from specific psychological violations
              </Typography>
            </Box>

            <Grid container spacing={2}>
              {psychologyData?.mistakeAnalysis?.map((m: any) => (
                <Grid key={m.mistake} size={{ xs: 12, sm: 6, md: 2.4 }}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(248, 250, 252, 0.8)',
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
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Performance by Day of Week
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Identify which trading weekdays provide maximum discretionary edge
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {stats?.performanceByWeekday?.map((day: any) => (
                  <Box
                    key={day.day}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1.25,
                      px: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
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
                Note: Subgroups with fewer than 30 trades exhibit high statistical variance. Empirical-Bayes shrinkage is recommended before drawing directional conclusions.
              </Typography>
            </Card>
          </Grid>

          {/* Session Breakdown */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ p: 2.5, height: '100%' }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Performance by Trading Session
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  NSE Regular equity market vs MCX Commodity evening session
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {stats?.performanceBySession && stats.performanceBySession.length > 0 ? (
                  stats.performanceBySession.map((sess: any) => (
                    <Box
                      key={sess.session}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.25,
                        px: 1.5,
                        borderRadius: 1.5,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
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
                Note: Low trade counts increase uncertainty in session-level expectancy.
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
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimelineRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                Maximum Adverse Excursion (MAE) & Favorable Excursion (MFE)
              </Typography>
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
            const summary = (excursionData as any)?.summary ?? (excursionData as any)?.data?.summary;
            const points = (excursionData as any)?.scatterPoints ?? (excursionData as any)?.data?.scatterPoints ?? [];
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
                {/* KPI Summary Cards */}
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Maximum Favorable Excursion: The peak unrealized profit or maximum favorable price reach before exit.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Avg MFE (Favorable)
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.mfe" />
                      </Box>
                      <Tooltip title="Average peak favorable potential reached across trades with stop losses">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                          +{summary.avgMfeR !== undefined ? `${summary.avgMfeR}R` : '—'}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Average peak potential per trade
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Maximum Adverse Excursion: The deepest unrealized loss or adverse price dip experienced while the trade was open.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Avg MAE (Adverse)
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.mae" />
                      </Box>
                      <Tooltip title="Average maximum adverse drawdown experienced across trades with stop losses">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                          -{summary.avgMaeR !== undefined ? `${summary.avgMaeR}R` : '—'}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Average drawdown before exit
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Exit Efficiency: Percentage of the maximum favorable price move (MFE) captured at actual exit.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Exit Efficiency
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.exitEfficiency" />
                      </Box>
                      <Tooltip title="Percentage of peak favorable excursion captured at exit (higher is better)">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                          {summary.avgExitEfficiency !== undefined ? `${(summary.avgExitEfficiency * 100).toFixed(1)}%` : '—'}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Captured % of maximum run
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Gave Back Profit: Percentage of trades that achieved significant favorable excursion (>1R) but surrendered >50% of peak gains before closing.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Gave Back Profit
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.gaveBackProfit" />
                      </Box>
                      <Tooltip title="Trades with strong initial run that gave back >50% peak potential">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.warning.main, mt: 0.5 }}>
                          {summary.gaveBackProfitPercent}%
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Trades surrendering &gt;50% MFE
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                    <Card sx={{ p: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Tooltip title="Post-Stop Reversals: Percentage of stopped-out trades where market price reversed and subsequently reached original profit targets.">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                            Post-Stop Reversals
                          </Typography>
                        </Tooltip>
                        <HelpHint hintKey="metric.postStopReversals" />
                      </Box>
                      <Tooltip title="Stopped trades reversing to original profit target (indicates stop too tight)">
                        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: '#8B5CF6', mt: 0.5 }}>
                          {summary.reversalAfterStopPercent}%
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Stopped trades reversing to target
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* MAE vs MFE Scatter Plot */}
                <Card sx={{ p: 2.5 }}>
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
                                  </Box>
                                </Paper>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter name="Winners" data={winPoints} fill={muiTheme.palette.profit.main} />
                        <Scatter name="Losers" data={lossPoints} fill={muiTheme.palette.loss.main} />
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
              </>
            );
          })()}
        </Box>
      )}

      {/* TAB 5: WHAT-IF SIMULATOR */}
      {activeTab === 'WHAT_IF' && (
        <WhatIfSimulatorTab accountId={selectedAccountId} />
      )}
    </Box>
  );
}
