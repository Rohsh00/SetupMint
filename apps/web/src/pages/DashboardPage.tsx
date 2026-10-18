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
import { formatCurrency, formatPercent, formatR } from '../lib/utils.js';

export function DashboardPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
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
          <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
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
          <Card sx={{ height: '100%' }}>
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
                <Box component="span" sx={{ color: muiTheme.palette.profit.main, fontWeight: 600 }}>
                  {stats?.winningTradesCount || 0} Wins
                </Box>
                <Box component="span" sx={{ color: muiTheme.palette.loss.main, fontWeight: 600 }}>
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
          <Card sx={{ height: '100%' }}>
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
          <Card sx={{ height: '100%' }}>
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

      {/* Main Charts Row */}
      <Grid container spacing={3}>
        {/* Cumulative Equity Curve (8 Cols) */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Cumulative Equity Curve
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Portfolio equity progression over time
                </Typography>
              </Box>
              <Chip
                label={`Peak: ${formatCurrency(
                  Math.max(...(stats?.equityCurve?.map((p: any) => p.cumulativeEquity) || [0]))
                )}`}
                size="small"
                sx={{
                  fontFamily: `'JetBrains Mono', monospace`,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: muiTheme.palette.profit.bg,
                  color: muiTheme.palette.profit.main,
                  border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'}`,
                }}
              />
            </Box>

            <Box sx={{ height: 300, width: '100%' }}>
              {stats?.equityCurve && stats.equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.equityCurve}>
                    <defs>
                      <linearGradient id="setupmintEquityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="date" stroke={chartAxisColor} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={chartAxisColor}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: muiTheme.palette.text.primary }}
                      labelStyle={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}
                      formatter={(val: any) => [formatCurrency(val), 'Cumulative Equity']}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulativeEquity"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#setupmintEquityGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    No closed trades recorded yet to plot equity curve.
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Daily Net P&L (4 Cols) */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Daily Net P&L
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Green winning / Red losing trading sessions
              </Typography>
            </Box>

            <Box sx={{ height: 300, width: '100%' }}>
              {stats?.dailyPnL && stats.dailyPnL.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.dailyPnL}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickLine={false} />
                    <YAxis stroke={chartAxisColor} fontSize={10} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: muiTheme.palette.text.primary }}
                      labelStyle={{ color: muiTheme.palette.text.secondary, fontWeight: 600 }}
                      formatter={(val: any) => [formatCurrency(val), 'Net P&L']}
                    />
                    <Bar dataKey="netPnL" radius={[4, 4, 0, 0]}>
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
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      px: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
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
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      px: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
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
                    sx={{
                      cursor: 'pointer',
                      '&:last-child td, &:last-child th': { border: 0 },
                    }}
                  >
                    <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary }}>
                      {t.tradeDate}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                      <RouterLink
                        to={`/trades/${t.id}`}
                        style={{
                          color: muiTheme.palette.text.primary,
                          textDecoration: 'none',
                        }}
                      >
                        {t.symbol}
                      </RouterLink>
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
