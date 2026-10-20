import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
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
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ShowChartIcon from '@mui/icons-material/ShowChartRounded';
import PsychologyIcon from '@mui/icons-material/PsychologyRounded';
import AccessTimeIcon from '@mui/icons-material/AccessTimeRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EMOTION_LABEL_MAP, MISTAKE_LABEL_MAP } from '@tradevault/shared';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';

export function AnalyticsPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PSYCHOLOGY' | 'TIME'>('OVERVIEW');
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
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {day.day}
                    </Typography>
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
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {sess.session}
                      </Typography>
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
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
