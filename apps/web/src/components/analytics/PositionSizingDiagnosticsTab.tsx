import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
} from 'recharts';
import { ISizingAnalyticsResult, ISizingTierSummary } from '@tradevault/financial-engine';
import { formatCurrency, formatPercent } from '../../lib/utils.js';

interface IPositionSizingDiagnosticsTabProps {
  data?: ISizingAnalyticsResult;
  isLoading?: boolean;
  currencySymbol?: string;
  onRefresh?: () => void;
}

export function PositionSizingDiagnosticsTab({
  data,
  isLoading,
  currencySymbol = '$',
  onRefresh,
}: IPositionSizingDiagnosticsTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [activeChart, setActiveChart] = useState<'EQUITY_COMPARISON' | 'SIZE_PROGRESSION'>('EQUITY_COMPARISON');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={360} />
      </Box>
    );
  }

  const summary = data?.summary;
  const tiers = data?.tiers || [];
  const progression = data?.progression || [];
  const triggerAnalysis = data?.triggerAnalysis;

  if (!summary || summary.totalTrades === 0) {
    return (
      <Card sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
        <StraightenRoundedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          No Sizing Analytics Available
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto' }}>
          Log more closed trades with recorded lot sizes (e.g. 0.01, 0.02, 0.04) to analyze your position sizing evolution, tier performance, and Sizing Alpha.
        </Typography>
      </Card>
    );
  }

  const isAlphaPositive = summary.sizingAlpha >= 0;
  const chartGridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)';
  const chartAxisColor = isDark ? '#94A3B8' : '#64748B';

  const chartTooltipStyle = {
    backgroundColor: muiTheme.palette.background.paper,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.15)',
    color: muiTheme.palette.text.primary,
    borderRadius: '10px',
    fontSize: '12px',
    boxShadow: isDark ? '0 10px 25px -5px rgba(0, 0, 0, 0.6)' : '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
  };

  const gradeColor =
    summary.sizingHealthGrade === 'A'
      ? '#10B981'
      : summary.sizingHealthGrade === 'B'
      ? '#3B82F6'
      : summary.sizingHealthGrade === 'C'
      ? '#F59E0B'
      : '#EF4444';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Hero KPI Cards */}
      <Grid container spacing={2}>
        {/* Card 1: Sizing Alpha */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${isAlphaPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              backgroundColor: isAlphaPositive
                ? isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)'
                : isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sizing Alpha
              </Typography>
              <Tooltip title="Actual Net P&L minus what you would have made trading constant average lot size. Positive means your sizing decisions created value. Negative means sizing escalation destroyed profits." arrow>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
              </Tooltip>
            </Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 900,
                fontFamily: `'JetBrains Mono', monospace`,
                color: isAlphaPositive ? '#10B981' : '#EF4444',
              }}
            >
              {isAlphaPositive ? '+' : ''}{formatCurrency(summary.sizingAlpha, currencySymbol)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={summary.sizingAlphaVerdict === 'POSITIVE_ALPHA' ? 'POSITIVE ALPHA (+GOOD)' : 'VALUE DESTRUCTIVE (-BAD)'}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.625rem',
                  fontWeight: 800,
                  backgroundColor: isAlphaPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: isAlphaPositive ? '#10B981' : '#EF4444',
                }}
              />
            </Box>
          </Card>
        </Grid>

        {/* Card 2: Sizing Health Score & Grade */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sizing Health Grade
              </Typography>
              <ShieldRoundedIcon sx={{ fontSize: 20, color: gradeColor }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 900, color: gradeColor }}>
                Grade {summary.sizingHealthGrade}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 }}>
                {summary.sizingHealthScore}/100
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
              {summary.sizingHealthGrade === 'A' || summary.sizingHealthGrade === 'B'
                ? 'Healthy scaling discipline with positive edge amplification'
                : 'Size escalation friction detected; review larger tiers'}
            </Typography>
          </Card>
        </Grid>

        {/* Card 3: Lot Tiers Detected */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Lot Tiers Active
              </Typography>
              <LayersRoundedIcon sx={{ fontSize: 20, color: '#8B5CF6' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {tiers.length} Tiers
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: `'JetBrains Mono', monospace` }}>
              Base: {summary.baseLotQuantity} Lots • Avg: {summary.averageLotQuantity} Lots
            </Typography>
          </Card>
        </Grid>

        {/* Card 4: Revenge Escalation Rate */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Revenge Escalation Rate
              </Typography>
              <Tooltip title="Percentage of lot size increases that occurred directly following a loss (Martingale tilt pattern). Under 15% is healthy." arrow>
                <WarningAmberRoundedIcon
                  sx={{
                    fontSize: 20,
                    color: (triggerAnalysis?.revengeEscalationRate ?? 0) > 25 ? '#EF4444' : '#10B981',
                  }}
                />
              </Tooltip>
            </Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                color: (triggerAnalysis?.revengeEscalationRate ?? 0) > 25 ? '#EF4444' : muiTheme.palette.text.primary,
              }}
            >
              {triggerAnalysis?.revengeEscalationRate ?? 0}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
              {triggerAnalysis?.revengeEscalations ?? 0} of {triggerAnalysis?.totalEscalations ?? 0} escalations after losses
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Actionable Insights Banner */}
      {summary.insights && summary.insights.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {summary.insights.map((insight, idx) => {
            const isWarn = insight.includes('Warning') || insight.includes('Critical') || insight.includes('cost you');
            return (
              <Alert
                key={idx}
                severity={isWarn ? 'warning' : 'success'}
                icon={isWarn ? <WarningAmberRoundedIcon fontSize="small" /> : <AutoAwesomeRoundedIcon fontSize="small" />}
                sx={{
                  borderRadius: 2,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  py: 0.5,
                  '& .MuiAlert-message': { width: '100%' },
                }}
              >
                {insight}
              </Alert>
            );
          })}
        </Box>
      )}

      {/* Interactive Charts Container */}
      <Card sx={{ p: 3, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShowChartRoundedIcon sx={{ color: muiTheme.palette.primary.main }} />
              {activeChart === 'EQUITY_COMPARISON'
                ? 'Counterfactual Equity Curve: Actual vs. Constant Lot Baseline'
                : 'Lot Size Progression & Escalation Timeline'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {activeChart === 'EQUITY_COMPARISON'
                ? 'Compares your actual journey (0.01 -> 0.02 -> 0.04) against what your P&L would be if you had traded constant average lot size with identical volume.'
                : 'Chronological sequence of all trades showing lot sizes and color-coded win/loss outcomes.'}
            </Typography>
          </Box>

          <ButtonGroup size="small" variant="outlined">
            <Button
              variant={activeChart === 'EQUITY_COMPARISON' ? 'contained' : 'outlined'}
              onClick={() => setActiveChart('EQUITY_COMPARISON')}
              sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}
            >
              Equity Comparison
            </Button>
            <Button
              variant={activeChart === 'SIZE_PROGRESSION' ? 'contained' : 'outlined'}
              onClick={() => setActiveChart('SIZE_PROGRESSION')}
              sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}
            >
              Size Progression Timeline
            </Button>
          </ButtonGroup>
        </Box>

        {activeChart === 'EQUITY_COMPARISON' ? (
          <Box sx={{ height: 350, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progression} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="tradeIndex"
                  stroke={chartAxisColor}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => `T#${val}`}
                />
                <YAxis
                  stroke={chartAxisColor}
                  tick={{ fontSize: 11, fontFamily: `'JetBrains Mono', monospace` }}
                  tickFormatter={(val) => formatCurrency(val, currencySymbol)}
                />
                <RechartsTooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(val: any, name: any) => [
                    formatCurrency(Number(val), currencySymbol),
                    name === 'actualCumulativePnL'
                      ? 'Actual Equity'
                      : name === 'constantSizeCumulativePnL'
                      ? 'Constant Size Baseline'
                      : 'Flat Base (0.01) Baseline',
                  ]}
                  labelFormatter={(idx) => {
                    const pt = progression[Number(idx) - 1];
                    return pt ? `Trade #${idx} • ${pt.date} • ${pt.symbol} (${pt.quantity} Lots)` : `Trade #${idx}`;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                  formatter={(value) =>
                    value === 'actualCumulativePnL'
                      ? 'Actual P&L (Escalating Size)'
                      : value === 'constantSizeCumulativePnL'
                      ? 'Constant Size Baseline (Identical Volume)'
                      : 'Flat Base 0.01 Baseline'
                  }
                />
                <ReferenceLine y={0} stroke={muiTheme.palette.divider} strokeWidth={1.5} />
                <Line
                  type="monotone"
                  dataKey="actualCumulativePnL"
                  stroke={muiTheme.palette.primary.main}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="constantSizeCumulativePnL"
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="flatBaseCumulativePnL"
                  stroke="#8B5CF6"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Box sx={{ height: 350, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  type="number"
                  dataKey="tradeIndex"
                  name="Trade #"
                  stroke={chartAxisColor}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => `#${val}`}
                />
                <YAxis
                  type="number"
                  dataKey="quantity"
                  name="Lot Size"
                  stroke={chartAxisColor}
                  tick={{ fontSize: 11, fontFamily: `'JetBrains Mono', monospace` }}
                  tickFormatter={(val) => `${val}L`}
                />
                <ZAxis range={[60, 160]} />
                <RechartsTooltip
                  contentStyle={chartTooltipStyle}
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0].payload as any;
                    return (
                      <Box sx={{ p: 1.5, ...chartTooltipStyle }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.5 }}>
                          Trade #{d.tradeIndex} • {d.symbol} ({d.date})
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 }}>
                          Lot Size: <strong>{d.quantity} Lots</strong>
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: `'JetBrains Mono', monospace`,
                            fontWeight: 700,
                            color: d.actualPnL >= 0 ? '#10B981' : '#EF4444',
                          }}
                        >
                          P&L: {d.actualPnL >= 0 ? '+' : ''}{formatCurrency(d.actualPnL, currencySymbol)}
                        </Typography>
                        {d.isRevengeEscalation && (
                          <Chip
                            label="Revenge Size Escalation (After Loss)"
                            size="small"
                            color="error"
                            sx={{ height: 18, fontSize: '0.625rem', fontWeight: 800, mt: 0.75 }}
                          />
                        )}
                        {d.isEscalation && !d.isRevengeEscalation && (
                          <Chip
                            label="Compounding Size Escalation (After Win)"
                            size="small"
                            color="success"
                            sx={{ height: 18, fontSize: '0.625rem', fontWeight: 800, mt: 0.75 }}
                          />
                        )}
                      </Box>
                    );
                  }}
                />
                <Scatter
                  data={progression}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    const isWin = payload.isWin;
                    const isRevenge = payload.isRevengeEscalation;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isRevenge ? 6 : 4.5}
                        fill={isWin ? '#10B981' : '#EF4444'}
                        stroke={isRevenge ? '#F59E0B' : '#ffffff'}
                        strokeWidth={isRevenge ? 2 : 1}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Card>

      {/* Lot Size Tier Matrix (Cards & Comparative Table) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            <LayersRoundedIcon sx={{ color: muiTheme.palette.primary.main }} />
            Performance by Lot Size Tier (0.01 vs 0.02 vs 0.04...)
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Click a tier to inspect drilldown metrics
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {tiers.map((t) => {
            const isSelected = selectedTierKey === t.tierKey;
            const isProfitable = t.netPnL > 0;
            const verdictColor =
              t.verdict === 'OPTIMAL'
                ? '#10B981'
                : t.verdict === 'HEALTHY'
                ? '#3B82F6'
                : t.verdict === 'MARGINAL'
                ? '#F59E0B'
                : '#EF4444';

            return (
              <Grid key={t.tierKey} size={{ xs: 12, sm: 6, md: 4, lg: Math.max(3, Math.floor(12 / Math.min(tiers.length, 4))) }}>
                <Card
                  onClick={() => setSelectedTierKey(isSelected ? null : t.tierKey)}
                  sx={{
                    p: 2.25,
                    borderRadius: 2,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                    border: `1.5px solid ${isSelected ? muiTheme.palette.primary.main : muiTheme.palette.divider}`,
                    backgroundColor: isSelected
                      ? isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)'
                      : muiTheme.palette.background.paper,
                    '&:hover': {
                      borderColor: muiTheme.palette.primary.main,
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                      {t.label}
                    </Typography>
                    <Chip
                      label={t.verdict}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.625rem',
                        fontWeight: 800,
                        backgroundColor: alpha(verdictColor, 0.15),
                        color: verdictColor,
                      }}
                    />
                  </Box>

                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 900,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: isProfitable ? '#10B981' : '#EF4444',
                      mb: 0.5,
                    }}
                  >
                    {isProfitable ? '+' : ''}{formatCurrency(t.netPnL, currencySymbol)}
                  </Typography>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    {t.tradeCount} trades ({t.tradePercent}% of total) • {t.winningTrades}W / {t.losingTrades}L
                  </Typography>

                  <Divider sx={{ my: 1 }} />

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, pt: 0.5 }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', display: 'block' }}>
                        Win Rate
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                        {t.winRate}%
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', display: 'block' }}>
                        Profit Factor
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: t.profitFactor >= 1.5 ? '#10B981' : t.profitFactor >= 1.0 ? '#F59E0B' : '#EF4444',
                        }}
                      >
                        {t.profitFactor}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', display: 'block' }}>
                        Avg Win / Loss
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: 'text.secondary' }}>
                        +{t.avgWin} / -{t.avgLoss}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', display: 'block' }}>
                        Expectancy
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: t.expectancyPerTrade >= 0 ? '#10B981' : '#EF4444',
                        }}
                      >
                        {t.expectancyPerTrade >= 0 ? '+' : ''}{t.expectancyPerTrade} / trd
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {/* Detailed Sizing Matrix Table */}
        <Card sx={{ borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Lot Size Tier</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Trades</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Win Rate</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Profit Factor</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Net P&L</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Avg Win</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Avg Loss</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Payoff Ratio</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Avg R</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Max Drawdown</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Sizing Verdict</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tiers.map((t) => (
                <TableRow
                  key={t.tierKey}
                  hover
                  selected={selectedTierKey === t.tierKey}
                  onClick={() => setSelectedTierKey(selectedTierKey === t.tierKey ? null : t.tierKey)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.8125rem' }}>
                    {t.label}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.8125rem' }}>
                    {t.tradeCount} <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>({t.tradePercent}%)</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700, fontSize: '0.8125rem' }}>
                    {t.winRate}%
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontFamily: `'JetBrains Mono', monospace`,
                      fontWeight: 800,
                      fontSize: '0.8125rem',
                      color: t.profitFactor >= 1.5 ? '#10B981' : t.profitFactor >= 1.0 ? '#F59E0B' : '#EF4444',
                    }}
                  >
                    {t.profitFactor}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontFamily: `'JetBrains Mono', monospace`,
                      fontWeight: 800,
                      fontSize: '0.8125rem',
                      color: t.netPnL >= 0 ? '#10B981' : '#EF4444',
                    }}
                  >
                    {t.netPnL >= 0 ? '+' : ''}{formatCurrency(t.netPnL, currencySymbol)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: '#10B981', fontSize: '0.8125rem' }}>
                    +{formatCurrency(t.avgWin, currencySymbol)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: '#EF4444', fontSize: '0.8125rem' }}>
                    -{formatCurrency(t.avgLoss, currencySymbol)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.8125rem' }}>
                    1 : {t.payoffRatio}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.8125rem' }}>
                    {t.avgRMultiple > 0 ? `+${t.avgRMultiple}R` : `${t.avgRMultiple}R`}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: '#EF4444', fontSize: '0.8125rem' }}>
                    -{formatCurrency(t.maxDrawdownInTier, currencySymbol)}
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={t.verdict}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.625rem',
                        fontWeight: 800,
                        backgroundColor:
                          t.verdict === 'OPTIMAL'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : t.verdict === 'HEALTHY'
                            ? 'rgba(59, 130, 246, 0.15)'
                            : t.verdict === 'MARGINAL'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        color:
                          t.verdict === 'OPTIMAL'
                            ? '#10B981'
                            : t.verdict === 'HEALTHY'
                            ? '#3B82F6'
                            : t.verdict === 'MARGINAL'
                            ? '#F59E0B'
                            : '#EF4444',
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Box>

      {/* Escalation Trigger Diagnostics: Compounding vs Revenge Martingale */}
      {triggerAnalysis && triggerAnalysis.totalEscalations > 0 && (
        <Card sx={{ p: 3, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AutoAwesomeRoundedIcon sx={{ color: muiTheme.palette.primary.main }} />
            Escalation Trigger Diagnostics: Why Did You Size Up?
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Analyzes whether sizing up after a WIN (compounding) vs sizing up after a LOSS (revenge Martingale) was more successful.
          </Typography>

          <Grid container spacing={2}>
            {/* Rational Compounding */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#10B981' }}>
                    🟢 Sized Up After a WIN (Compounding)
                  </Typography>
                  <Chip
                    label={`${triggerAnalysis.compoundingEscalations} trades`}
                    size="small"
                    color="success"
                    sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Rational expansion: Increasing size while in a profit cushion or after winning execution.
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Win Rate: <strong>{triggerAnalysis.compoundingWinRate}%</strong>
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 800,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: triggerAnalysis.compoundingAvgPnL >= 0 ? '#10B981' : '#EF4444',
                    }}
                  >
                    Avg: {triggerAnalysis.compoundingAvgPnL >= 0 ? '+' : ''}{formatCurrency(triggerAnalysis.compoundingAvgPnL, currencySymbol)}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            {/* Revenge Martingale Escalation */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#EF4444' }}>
                    🔴 Sized Up After a LOSS (Revenge / Tilt)
                  </Typography>
                  <Chip
                    label={`${triggerAnalysis.revengeEscalations} trades`}
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Emotional trap: Doubling lot size to "make back" the previous loss in one trade.
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Win Rate: <strong>{triggerAnalysis.revengeWinRate}%</strong>
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 800,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: triggerAnalysis.revengeAvgPnL >= 0 ? '#10B981' : '#EF4444',
                    }}
                  >
                    Avg: {triggerAnalysis.revengeAvgPnL >= 0 ? '+' : ''}{formatCurrency(triggerAnalysis.revengeAvgPnL, currencySymbol)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Card>
      )}
    </Box>
  );
}

