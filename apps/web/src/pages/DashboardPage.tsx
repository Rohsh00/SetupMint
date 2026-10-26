import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import PercentIcon from '@mui/icons-material/PercentRounded';
import EmojiEventsIcon from '@mui/icons-material/EmojiEventsRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardRounded';
import InsightsIcon from '@mui/icons-material/InsightsRounded';
import RateReviewIcon from '@mui/icons-material/RateReviewRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import Alert from '@mui/material/Alert';

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
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent, formatR, formatDate } from '../lib/utils.js';
import { TradeInstrumentBadge } from '../components/trades/TradeInstrumentBadge.js';
import { MultiPanelEquityCurve } from '../components/dashboard/MultiPanelEquityCurve.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';

export function DashboardPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const { openDrill } = useTradeDrilldown();
  const [dateRange, setDateRange] = useState<string>('ALL');
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
    boxShadow: isDark
      ? '0 10px 25px -5px rgba(0, 0, 0, 0.6)'
      : '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
    padding: '8px 12px',
  };

  // Compute startDate based on filter
  let startDate: string | undefined;
  const now = new Date();
  if (dateRange === '30D') {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate = d.toISOString().split('T')[0];
  } else if (dateRange === 'MONTH') {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (dateRange === 'WEEK') {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate = d.toISOString().split('T')[0];
  }

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', selectedAccountId, dateRange],
    queryFn: () =>
      api.dashboard.stats({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        startDate,
      }),
  });

  const { data: recentTradesData } = useQuery({
    queryKey: ['recent-trades', selectedAccountId],
    queryFn: () =>
      api.trades.list({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        limit: 5,
        sortBy: 'tradeDate',
        sortOrder: 'desc',
      }),
  });

  const { data: reviewQueueData } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => api.review.queue(),
  });

  const recentTrades = Array.isArray(recentTradesData)
    ? recentTradesData
    : recentTradesData?.data || [];

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1400, mx: 'auto', spaceY: 3 }}>
        <Skeleton variant="rounded" height={60} sx={{ mb: 3 }} />
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
              <Skeleton variant="rounded" height={130} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Skeleton variant="rounded" height={360} />
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Skeleton variant="rounded" height={360} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  const isNetPositive = (stats?.netPnL || 0) >= 0;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Daily Loss Breach Critical Alert Banner */}
      {reviewQueueData?.dailyLossBreach?.breached && (
        <Alert
          severity="error"
          variant="filled"
          icon={<WarningAmberIcon fontSize="inherit" />}
          onClick={() =>
            openDrill({
              kind: 'FILTER',
              filter: { date: reviewQueueData.dailyLossBreach.date || new Date().toISOString().slice(0, 10) },
              label: 'Daily Loss Breach Session Trades',
            })
          }
          sx={{
            borderRadius: 2,
            fontWeight: 700,
            backgroundColor: '#DC2626',
            boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
            '&:hover': { transform: 'scale(1.005)' },
          }}
        >
          {reviewQueueData.dailyLossBreach.message ||
            `Risk Rule Alert: Maximum daily loss limit of ₹${reviewQueueData.dailyLossBreach.maxDailyLoss?.toLocaleString()} breached! Click to inspect today's trades.`}
        </Alert>
      )}

      {/* Top Header & Range Filters */}
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
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: muiTheme.palette.text.primary,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            Performance Overview
            <Chip
              label="Live Metrics"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.625rem',
                fontWeight: 700,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(5, 150, 105, 0.12)',
                color: muiTheme.palette.primary.main,
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'}`,
              }}
            />
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Discretionary execution analytics, equity curve, and discipline metrics
          </Typography>
        </Box>

        {/* Date Range Selector */}
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
            { id: 'ALL', label: 'All Time' },
            { id: 'MONTH', label: 'This Month' },
            { id: '30D', label: '30 Days' },
            { id: 'WEEK', label: '7 Days' },
          ].map((r) => (
            <Button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              sx={{
                backgroundColor:
                  dateRange === r.id
                    ? `${muiTheme.palette.primary.main} !important`
                    : 'transparent',
                color:
                  dateRange === r.id
                    ? '#FFFFFF !important'
                    : `${muiTheme.palette.text.secondary} !important`,
                '&:hover': {
                  color: `${muiTheme.palette.text.primary} !important`,
                },
              }}
            >
              {r.label}
            </Button>
          ))}
        </ButtonGroup>
      </Box>

      {/* KPI Stats Grid */}
      <Grid container spacing={2.5}>
        {/* Card 1: Net Realized P&L */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { status: 'CLOSED' },
                label: 'All Closed Portfolio Trades',
              })
            }
            sx={{
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Net Realized P&L
                </Typography>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isNetPositive ? muiTheme.palette.profit.bg : muiTheme.palette.loss.bg,
                    color: isNetPositive ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                  }}
                >
                  {isNetPositive ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
                </Box>
              </Box>

              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  fontFamily: `'JetBrains Mono', monospace`,
                  color: isNetPositive ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                  mb: 1.5,
                }}
              >
                {formatCurrency(stats?.netPnL)}
              </Typography>

              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}>
                <span>Gross: <strong>{formatCurrency(stats?.grossPnL)}</strong></span>
                <span>Fees: <strong>{formatCurrency(stats?.totalCosts)}</strong></span>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Win Rate & Outcome */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { outcome: 'WIN' },
                label: 'Winning Trades',
              })
            }
            sx={{
              height: '100%',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Win Rate & Outcome
                </Typography>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                    color: '#3B82F6',
                  }}
                >
                  <PercentIcon fontSize="small" />
                </Box>
              </Box>

              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  fontFamily: `'JetBrains Mono', monospace`,
                  color: muiTheme.palette.text.primary,
                  mb: 1.5,
                }}
              >
                {formatPercent(stats?.winRate)}
              </Typography>

              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <Box
                  component="span"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    openDrill({ kind: 'FILTER', filter: { outcome: 'WIN' }, label: 'Winning Trades' });
                  }}
                  sx={{ color: muiTheme.palette.profit.main, fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  {stats?.winningTradesCount || 0} Wins
                </Box>
                <Box
                  component="span"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    openDrill({ kind: 'FILTER', filter: { outcome: 'LOSS' }, label: 'Losing Trades' });
                  }}
                  sx={{ color: muiTheme.palette.loss.main, fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  {stats?.losingTradesCount || 0} Losses
                </Box>
                <Box component="span" sx={{ color: muiTheme.palette.text.secondary }}>
                  {stats?.closedTradesCount || 0} Total
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Profit Factor & Expectancy */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { status: 'CLOSED' },
                label: 'Closed Trades (Expectancy Subset)',
              })
            }
            sx={{
              height: '100%',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Profit Factor & Expectancy
                </Typography>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.1)',
                    color: '#F59E0B',
                  }}
                >
                  <EmojiEventsIcon fontSize="small" />
                </Box>
              </Box>

              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  fontFamily: `'JetBrains Mono', monospace`,
                  color: muiTheme.palette.text.primary,
                  mb: 1.5,
                }}
              >
                {stats?.profitFactor ? stats.profitFactor.toFixed(2) : '—'}
              </Typography>

              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}>
                <span>Expectancy: <strong>{formatCurrency(stats?.expectancy)}</strong></span>
                <span>Avg R: <strong>{formatR(stats?.avgRealizedR)}</strong></span>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Drawdown & Discipline */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { outcome: 'LOSS' },
                label: 'Drawdown / Losing Trades',
              })
            }
            sx={{
              height: '100%',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Max Drawdown & Discipline
                </Typography>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: muiTheme.palette.loss.bg,
                    color: muiTheme.palette.loss.main,
                  }}
                >
                  <WarningAmberIcon fontSize="small" />
                </Box>
              </Box>

              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  fontFamily: `'JetBrains Mono', monospace`,
                  color: muiTheme.palette.loss.main,
                  mb: 1.5,
                }}
              >
                {stats?.maxDrawdownPercent ? `-${formatPercent(stats.maxDrawdownPercent)}` : '0.0%'}
              </Typography>

              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}>
                <span>Peak DD: <strong>{formatCurrency(stats?.maxDrawdownAmount)}</strong></span>
                <Box component="span" sx={{ color: muiTheme.palette.profit.main, fontWeight: 600 }}>
                  Rules: {formatPercent(stats?.ruleAdherencePercent)}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Multi-Panel Performance Curves Row */}
      <Box sx={{ width: '100%' }}>
        <MultiPanelEquityCurve selectedAccountId={selectedAccountId} startDate={startDate} />
      </Box>

      {/* Daily Net P&L Row */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Daily Net P&L Sessions
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Green winning / Red losing trading sessions • Click any day bar to drilldown
                </Typography>
              </Box>
            </Box>

            <Box sx={{ height: 240, width: '100%' }}>
              {stats?.dailyPnL && stats.dailyPnL.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.dailyPnL}
                    onClick={(data) => {
                      if (data?.activePayload?.[0]?.payload?.date) {
                        openDrill({
                          kind: 'FILTER',
                          filter: { date: data.activePayload[0].payload.date },
                          label: `Session on ${formatDate(data.activePayload[0].payload.date)}`,
                        });
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis
                      dataKey="date"
                      stroke={chartAxisColor}
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(d: string) => formatDate(d)}
                    />
                    <YAxis stroke={chartAxisColor} fontSize={10} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: muiTheme.palette.text.primary }}
                      labelStyle={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}
                      formatter={(val: any) => [formatCurrency(val), 'Net P&L']}
                      labelFormatter={(label) => `${formatDate(label)} • Click to inspect session trades`}
                    />
                    <Bar dataKey="netPnL" radius={[4, 4, 0, 0]} cursor="pointer">
                      {stats.dailyPnL.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.netPnL >= 0 ? '#10B981' : '#F43F5E'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    No session records found.
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Breakdown Grids */}
      <Grid container spacing={3}>
        {/* By Instrument */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 2 }}>
              Performance by Instrument
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {stats?.performanceByInstrument && stats.performanceByInstrument.length > 0 ? (
                stats.performanceByInstrument.map((inst: any) => (
                  <Box
                    key={inst.symbol}
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        filter: { symbol: inst.symbol },
                        label: `${inst.symbol} Executions`,
                      })
                    }
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      px: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
                        transform: 'translateX(2px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                        {inst.symbol}
                      </Typography>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                        ({inst.tradesCount} trades • {inst.winRate}% win)
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontFamily: `'JetBrains Mono', monospace`,
                        color: inst.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                      }}
                    >
                      {formatCurrency(inst.netPnL)}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  No instrument data recorded yet.
                </Typography>
              )}
            </Box>
          </Card>
        </Grid>

        {/* By Strategy */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 2 }}>
              Performance by Strategy
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {stats?.performanceByStrategy && stats.performanceByStrategy.length > 0 ? (
                stats.performanceByStrategy.map((strat: any) => (
                  <Box
                    key={strat.strategyId}
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        filter: { strategyId: strat.strategyId },
                        label: `${strat.strategyName} Playbook Trades`,
                      })
                    }
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      px: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
                        transform: 'translateX(2px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {strat.strategyName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                        ({strat.tradesCount} trades • {strat.winRate}% win)
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontFamily: `'JetBrains Mono', monospace`,
                        color: strat.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                      }}
                    >
                      {formatCurrency(strat.netPnL)}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  No strategies linked to trades yet.
                </Typography>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Daily Review Queue Widget */}
      <Card
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: isDark
            ? '1px solid rgba(59, 130, 246, 0.25)'
            : '1px solid rgba(37, 99, 235, 0.2)',
          background: isDark
            ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)'
            : 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                color: '#3B82F6',
              }}
            >
              <RateReviewIcon fontSize="small" />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
                  Daily Review Queue
                </Typography>
                <Chip
                  label={`${reviewQueueData?.summary?.totalUnreviewedTrades || 0} Trades`}
                  size="small"
                  color={reviewQueueData?.summary?.totalUnreviewedTrades ? 'primary' : 'default'}
                  sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }}
                />
                {(reviewQueueData?.summary?.unreviewedDaysCount || 0) > 0 && (
                  <Chip
                    label={`${reviewQueueData?.summary?.unreviewedDaysCount} Unreviewed Days`}
                    size="small"
                    color="warning"
                    sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }}
                  />
                )}
              </Box>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Trades missing exit, reflection, screenshots, or unreviewed trading days
              </Typography>
            </Box>
          </Box>

          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            endIcon={<ArrowForwardIcon />}
            component={RouterLink}
            to={reviewQueueData?.unreviewedDays?.[0] ? '/journal' : '/trades'}
            sx={{
              fontWeight: 700,
              px: 2.5,
              py: 0.75,
              borderRadius: 2,
              textTransform: 'none',
              boxShadow: isDark
                ? '0 4px 14px 0 rgba(16, 185, 129, 0.35)'
                : '0 4px 14px 0 rgba(5, 150, 105, 0.25)',
            }}
          >
            Start Daily Review
          </Button>
        </Box>

        {/* Breakdown Summary Chips */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Chip
            size="small"
            variant="outlined"
            label={`${reviewQueueData?.summary?.missingPsychologyCount || 0} Missing Reflection`}
            color="info"
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`${reviewQueueData?.summary?.missingScreenshotsCount || 0} Missing Screenshots`}
            color="secondary"
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`${reviewQueueData?.summary?.missingExitCount || 0} Unclosed Trades`}
            color="warning"
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
        </Box>

        {/* Table of pending review trades */}
        {reviewQueueData?.queue && reviewQueueData.queue.length > 0 ? (
          <TableContainer component={Paper} sx={{ borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Symbol</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Missing Items</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Mistake Suggestions</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Net P&L</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reviewQueueData.queue.slice(0, 5).map((t: any) => (
                  <TableRow
                    key={t.id}
                    hover
                    onClick={() => openDrill({ kind: 'TRADE', tradeId: t.id, label: `${t.symbol} Review` })}
                    sx={{
                      cursor: 'pointer',
                      '&:last-child td, &:last-child th': { border: 0 },
                    }}
                  >
                    <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.75rem' }}>
                      {t.tradeDate}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                      <RouterLink to={`/trades/${t.id}`} style={{ color: muiTheme.palette.text.primary, textDecoration: 'none' }}>
                        {t.symbol}
                      </RouterLink>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t.status}
                        size="small"
                        sx={{ height: 20, fontSize: '0.625rem', fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {t.missing?.map((m: string) => (
                          <Chip
                            key={m}
                            label={
                              m === 'MISSING_EXIT'
                                ? 'Exit Missing'
                                : m === 'MISSING_PSYCHOLOGY'
                                ? 'No Reflection'
                                : 'No Screenshot'
                            }
                            size="small"
                            variant="outlined"
                            color={m === 'MISSING_EXIT' ? 'warning' : 'default'}
                            sx={{ height: 18, fontSize: '0.625rem' }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {t.suggestedMistakes && t.suggestedMistakes.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {t.suggestedMistakes.map((s: any, idx: number) => (
                            <Tooltip key={idx} title={s.message} arrow>
                              <Chip
                                label={`${s.rule.replace('_', ' ')}?`}
                                size="small"
                                color={s.severity === 'CRITICAL' ? 'error' : 'warning'}
                                sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700, cursor: 'help' }}
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                          None detected
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontWeight: 700,
                        color:
                          (t.netPnL || 0) > 0
                            ? muiTheme.palette.profit.main
                            : (t.netPnL || 0) < 0
                            ? muiTheme.palette.loss.main
                            : muiTheme.palette.text.secondary,
                      }}
                    >
                      {formatCurrency(t.netPnL)}
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        component={RouterLink}
                        to={`/trades/${t.id}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.6875rem', py: 0.2, px: 1, minWidth: 'unset' }}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: 2, textAlign: 'center', color: muiTheme.palette.text.secondary }}>
            <CheckCircleIcon color="primary" sx={{ fontSize: 28, mb: 0.5 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              All caught up! All trades in the last 30 days have been thoroughly reviewed with reflections and screenshots.
            </Typography>
          </Box>
        )}
      </Card>

      {/* Recent Trades Table */}
      <Card sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
              Recent Executions
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Latest trades recorded in your journal
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/trades"
            endIcon={<ArrowForwardIcon fontSize="small" />}
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            View All Trades
          </Button>
        </Box>

        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell>Setup</TableCell>
                <TableCell align="right">Net P&L</TableCell>
                <TableCell align="right">R-Multiple</TableCell>
                <TableCell align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentTrades.map((t: any) => {
                const isWin = (t.calculated?.netPnL || 0) > 0;
                const isLoss = (t.calculated?.netPnL || 0) < 0;

                return (
                  <TableRow
                    key={t.id}
                    hover
                    onClick={() => openDrill({ kind: 'TRADE', tradeId: t.id, label: `${t.symbol} Executed Trade` })}
                    sx={{
                      cursor: 'pointer',
                      '&:last-child td, &:last-child th': { border: 0 },
                    }}
                  >
                    <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary }}>
                      {t.tradeDate}
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      <TradeInstrumentBadge
                        trade={t}
                        size="small"
                        showSubtitle={false}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t.direction}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          backgroundColor:
                            t.direction === 'LONG'
                              ? muiTheme.palette.profit.bg
                              : muiTheme.palette.loss.bg,
                          color:
                            t.direction === 'LONG'
                              ? muiTheme.palette.profit.main
                              : muiTheme.palette.loss.main,
                          border: `1px solid ${
                            t.direction === 'LONG'
                              ? isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'
                              : isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(220, 38, 38, 0.25)'
                          }`,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: muiTheme.palette.text.secondary }}>
                      {t.strategyName || 'Discretionary'}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontWeight: 700,
                        color: isWin
                          ? muiTheme.palette.profit.main
                          : isLoss
                          ? muiTheme.palette.loss.main
                          : muiTheme.palette.text.secondary,
                      }}
                    >
                      {formatCurrency(t.calculated?.netPnL)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontWeight: 600,
                        color: muiTheme.palette.text.secondary,
                      }}
                    >
                      {formatR(t.calculated?.realizedRMultiple)}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={t.status}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
                          color: muiTheme.palette.text.secondary,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {recentTrades.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3, color: muiTheme.palette.text.secondary }}>
                    No executions recorded yet. Click "Log New Trade" to log your first setup.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
