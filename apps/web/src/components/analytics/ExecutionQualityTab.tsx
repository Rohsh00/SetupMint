import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Skeleton from '@mui/material/Skeleton';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import PsychologyIcon from '@mui/icons-material/PsychologyRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';

// Recharts
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
} from 'recharts';

import { formatCurrency, formatPercent } from '../../lib/utils.js';
import { HelpHint } from '../help/index.js';

export interface IExecutionQualityTabProps {
  excursionData: any;
  isExcursionLoading: boolean;
  analyticsCurrency: string;
  currencySymbol: string;
  caps: any;
  queryParams: any;
  startDate?: string;
  endDate?: string;
  symbol?: string;
  funnelMode: 'AUTO' | 'PLANNED_TARGETS' | 'CUSTOM' | 'STANDARD';
  setFunnelMode: (mode: 'AUTO' | 'PLANNED_TARGETS' | 'CUSTOM' | 'STANDARD') => void;
  customMfeStepsInput: string;
  setCustomMfeStepsInput: (val: string) => void;
  excursionBackfillMutation: any;
  onNavigateToWhatIf: (prefill: { stopR?: number; targetR?: number }) => void;
  onOpenDrill: (drill: any) => void;
  onNavigateToSettings: () => void;
}

export function ExecutionQualityTab({
  excursionData,
  isExcursionLoading,
  analyticsCurrency,
  currencySymbol,
  caps,
  queryParams,
  startDate,
  endDate,
  symbol,
  funnelMode,
  setFunnelMode,
  customMfeStepsInput,
  setCustomMfeStepsInput,
  excursionBackfillMutation,
  onNavigateToWhatIf,
  onOpenDrill,
  onNavigateToSettings,
}: IExecutionQualityTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const baseDrillFilter = useMemo(
    () => ({
      ...(queryParams as any),
      startDate,
      endDate,
      symbol: symbol && symbol !== 'ALL' ? symbol : undefined,
    }),
    [queryParams, startDate, endDate, symbol]
  );

  // Local interactive controls
  const [scatterMode, setScatterMode] = useState<'R' | 'POINTS' | 'AMOUNT'>('R');
  const [includePostExitInScatter, setIncludePostExitInScatter] = useState(false);
  const [scatterFilter, setScatterFilter] = useState<'ALL' | 'WINNERS' | 'LOSERS' | 'RUNNERS' | 'STOP_REVERSAL'>('ALL');

  const chartGridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)';
  const chartAxisColor = isDark ? '#94A3B8' : '#64748B';
  const chartTooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
    borderRadius: 8,
    boxShadow: isDark ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)' : '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
  };

  const rawData = (excursionData as any)?.data ?? excursionData;
  const summary = rawData?.summary;
  const points = useMemo(() => rawData?.scatterPoints ?? [], [rawData]);
  const coverage = rawData?.coverage;
  const reliability = rawData?.reliability;
  const confidenceIntervals = rawData?.confidenceIntervals;
  const winnersMaeDistribution = rawData?.winnersMaeDistribution;
  const mfeReachFunnel = rawData?.mfeReachFunnel;
  const cohorts = rawData?.cohorts ?? [];
  const rollingTrend = rawData?.rollingTrend ?? [];
  const whatIfSuggestions = rawData?.whatIfSuggestion || rawData?.whatIfSuggestions;
  const slip = rawData?.slippage;

  const hasData = Boolean(summary && summary.totalEvaluated > 0);

  // Scatter data preparation with post-exit coordinates and filters
  const hasStops = (summary?.countWithStop ?? 0) > 0;
  const currentMode = !hasStops && scatterMode === 'R' ? 'POINTS' : scatterMode;
  const isModeR = currentMode === 'R';
  const isModePoints = currentMode === 'POINTS';
  const isModeAmount = currentMode === 'AMOUNT';

  const getX = (p: any) => (isModeR ? p.maeR : isModePoints ? p.maePoints : p.maeAmount);
  const getY = (p: any) => {
    if (includePostExitInScatter) {
      if (isModeR) return p.postExitMfeR ?? p.mfeR;
      if (isModePoints) return p.postExitMfePoints ?? p.mfePoints;
      return p.postExitMfeAmount ?? p.mfeAmount;
    }
    return isModeR ? p.mfeR : isModePoints ? p.mfePoints : p.mfeAmount;
  };

  const preparedPoints = useMemo(() => {
    return points
      .map((p: any) => ({
        ...p,
        scatterX: getX(p),
        scatterY: getY(p),
        hasRunner: Boolean(p.excursionFlags?.includes('RUNNER_LEFT_ON_TABLE') || p.excursionFlags?.includes('PREMATURE_EXIT') || (p.postExitRunBeyondExitPoints || 0) > 0),
        hasStopReversal: Boolean(p.reversedAfterStopHit || p.excursionFlags?.includes('STOP_TOO_TIGHT_EVIDENCE')),
      }))
      .filter((p: any) => p.scatterX !== undefined && p.scatterY !== undefined);
  }, [points, isModeR, isModePoints, isModeAmount, includePostExitInScatter]);

  const filteredScatterPoints = useMemo(() => {
    if (scatterFilter === 'WINNERS') return preparedPoints.filter((p: any) => p.outcome === 'WIN');
    if (scatterFilter === 'LOSERS') return preparedPoints.filter((p: any) => p.outcome !== 'WIN');
    if (scatterFilter === 'RUNNERS') return preparedPoints.filter((p: any) => p.hasRunner);
    if (scatterFilter === 'STOP_REVERSAL') return preparedPoints.filter((p: any) => p.hasStopReversal);
    return preparedPoints;
  }, [preparedPoints, scatterFilter]);

  const winPoints = useMemo(() => filteredScatterPoints.filter((p: any) => p.outcome === 'WIN'), [filteredScatterPoints]);
  const lossPoints = useMemo(() => filteredScatterPoints.filter((p: any) => p.outcome !== 'WIN'), [filteredScatterPoints]);

  if (isExcursionLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 3 }} />
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" height={130} sx={{ borderRadius: 2.5 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={420} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  if (!hasData) {
    return (
      <Card sx={{ p: 5, textAlign: 'center', borderRadius: 3, border: `1px solid ${muiTheme.palette.divider}` }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <TimelineRoundedIcon sx={{ color: muiTheme.palette.primary.main, fontSize: 34 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
          No Candlestick Excursion Data Available Yet
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 540, mx: 'auto', mb: 3 }}>
          Excursion analytics evaluate 1-minute historical candlestick data for all closed trades to compute Maximum Adverse Excursion (deepest drawdown), Maximum Favorable Excursion (peak potential), and 60-minute post-trade continuation.
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
            onClick={onNavigateToSettings}
            sx={{ textTransform: 'none', fontWeight: 600, px: 2.5, py: 1, borderRadius: 2 }}
          >
            Market Data Settings
          </Button>
        </Box>
      </Card>
    );
  }

  // Derived metrics
  const avgMfeDisplay = summary.avgMfeR !== undefined ? Number(summary.avgMfeR).toFixed(2) : (summary.mfeR?.mean !== undefined ? Number(summary.mfeR.mean).toFixed(2) : '—');
  const medianMfeDisplay = summary.medianMfeR !== undefined ? Number(summary.medianMfeR).toFixed(2) : (summary.mfeR?.median !== undefined ? Number(summary.mfeR.median).toFixed(2) : '—');
  const avgMaeDisplay = summary.avgMaeR !== undefined ? Number(summary.avgMaeR).toFixed(2) : (summary.maeR?.mean !== undefined ? Number(summary.maeR.mean).toFixed(2) : '—');
  const medianMaeDisplay = summary.medianMaeR !== undefined ? Number(summary.medianMaeR).toFixed(2) : (summary.maeR?.median !== undefined ? Number(summary.maeR.median).toFixed(2) : '—');
  const exitEffDisplay = summary.avgExitEfficiency !== undefined ? (Number(summary.avgExitEfficiency) * 100).toFixed(1) : (summary.exitEfficiency?.mean !== undefined ? (Number(summary.exitEfficiency.mean) * 100).toFixed(1) : '—');
  const exitEffVal = typeof summary.avgExitEfficiency === 'number' ? summary.avgExitEfficiency : (typeof summary.exitEfficiency?.mean === 'number' ? summary.exitEfficiency.mean : 0);

  const postExitRunAvg = summary.avgPostExitRunBeyondExitR ?? (summary.postExitRunBeyondExitR?.mean !== undefined ? Number(summary.postExitRunBeyondExitR.mean.toFixed(2)) : undefined);
  const postExitMfeAvg = summary.avgPostExitMfeR ?? (summary.postExitMfeR?.mean !== undefined ? Number(summary.postExitMfeR.mean.toFixed(2)) : undefined);
  const runnerCount = summary.runnerLeftOnTableCount ?? 0;
  const prematureCount = summary.prematureExitCount ?? 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. TOP HEADER & METRIC COVERAGE BAR */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimelineRoundedIcon sx={{ color: 'primary.main', fontSize: 22 }} />
              Price Excursion & Execution Quality (MAE / MFE)
            </Typography>
            <HelpHint hintKey="metric.excursionFlags" />
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            Quantifies trade drawdown, peak profit potential, exit timing efficiency, and post-exit market continuation across closed trades.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {caps.broker.adapter === 'ELEFIN_MT5' ? (
            <Tooltip title="Elefin MT5 excursion is synchronized directly via real MT5 tickets and spot CFD candles. Domestic broker backfill is disabled for Elefin." arrow>
              <Chip
                icon={<CheckCircleRoundedIcon style={{ fontSize: 14 }} />}
                label="MT5 Bridge Synchronized"
                size="small"
                color="success"
                variant="outlined"
                sx={{ fontWeight: 700, fontSize: '0.75rem', px: 0.5 }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="Fetch 1-minute historical candle snapshots from FYERS or Angel One and compute peak excursion metrics for all closed trades" arrow>
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
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* 2. COVERAGE & SAMPLE RELIABILITY BANNER */}
      <Card
        sx={{
          p: 2,
          borderRadius: 2.5,
          border: `1px solid ${muiTheme.palette.divider}`,
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
            <TrackChangesRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Evaluated Coverage:
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              <strong>{coverage?.computedCount ?? summary?.totalEvaluated}</strong> of{' '}
              <strong>{coverage?.totalClosedCount ?? summary?.totalEvaluated}</strong> closed trades ({coverage?.coveragePercent ?? 100}%)
            </Typography>
          </Box>

          {coverage && coverage.uncomputedCount > 0 && (
            <Tooltip
              arrow
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
            <Tooltip title="Trades whose holding duration exceeded 1-minute broker candle lookback and fell back to 5-minute resolution." arrow>
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
            <Tooltip title="Option trades where historical premium candles were unavailable. Fallback to spot index was excluded from aggregate metrics to avoid skewing option point scales." arrow>
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
            <Tooltip title={reliability.message || 'Statistical sample size reliability'} arrow>
              <Chip
                size="small"
                icon={reliability.status === 'RELIABLE' ? <CheckCircleRoundedIcon fontSize="small" /> : <WarningAmberIcon fontSize="small" />}
                color={reliability.status === 'RELIABLE' ? 'success' : reliability.status === 'LOW' ? 'warning' : 'error'}
                label={reliability.status === 'RELIABLE' ? `Reliable Sample (n=${reliability.sampleSize})` : `Low Sample Size (n=${reliability.sampleSize} < 30)`}
                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
              />
            </Tooltip>
          )}
          <HelpHint hintKey="metric.sampleReliability" />
        </Box>
      </Card>

      {/* 3. FOUR CORE METRIC PILLARS (INTERACTIVE KPI CARDS) */}
      <Grid container spacing={2}>
        {/* Card 1: Max Favorable Excursion (MFE) */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            onClick={() =>
              onOpenDrill({
                kind: 'FILTER',
                filter: { ...baseDrillFilter, mfeRMin: 0.01 },
                label: 'Trades with Favorable Excursion',
              })
            }
            sx={{
              p: 2.25,
              height: '100%',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1px solid ${muiTheme.palette.divider}`,
              '&:hover': {
                borderColor: muiTheme.palette.profit.main,
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(16, 185, 129, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Tooltip title="Maximum Favorable Excursion (MFE): The highest unrealized profit reached before you closed the trade. Answers: 'How much money did the market offer me?'" arrow>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                  Peak Favorable (MFE)
                </Typography>
              </Tooltip>
              <HelpHint hintKey="metric.mfe" />
            </Box>

            <Tooltip title="Average peak potential across trades with stops. Median and 90% Bootstrap Confidence Interval below." arrow>
              <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                +{avgMfeDisplay}R
              </Typography>
            </Tooltip>

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Median: <strong>+{medianMfeDisplay}R</strong> (IQR {summary.p25MfeR ?? summary.mfeR?.p25 ?? '—'}R - {summary.p75MfeR ?? summary.mfeR?.p75 ?? '—'}R)
            </Typography>

            {postExitMfeAvg !== undefined && (
              <Box sx={{ mt: 1, pt: 1, borderTop: `1px dashed ${muiTheme.palette.divider}` }}>
                <Tooltip title="The extended peak favorable excursion reached within 60 minutes after exit. Shows where price topped or bottomed after you left." arrow>
                  <Typography variant="caption" sx={{ color: '#0ea5e9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                    Post-Exit Peak Avg: <strong>+{postExitMfeAvg}R</strong>
                  </Typography>
                </Tooltip>
              </Box>
            )}

            {confidenceIntervals?.avgMfeR && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.5 }}>
                90% CI: [{confidenceIntervals.avgMfeR.lower}R, {confidenceIntervals.avgMfeR.upper}R]
              </Typography>
            )}
          </Card>
        </Grid>

        {/* Card 2: Max Adverse Excursion (MAE) */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            onClick={() =>
              onOpenDrill({
                kind: 'FILTER',
                filter: { ...baseDrillFilter, maeRMin: 0.01 },
                label: 'Trades with Adverse Excursion',
              })
            }
            sx={{
              p: 2.25,
              height: '100%',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1px solid ${muiTheme.palette.divider}`,
              '&:hover': {
                borderColor: muiTheme.palette.loss.main,
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(244, 63, 94, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Tooltip title="Maximum Adverse Excursion (MAE): The deepest unrealized drawdown experienced while trade was open. Answers: 'How much heat did my trade take before working or failing?'" arrow>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                  Max Drawdown (MAE)
                </Typography>
              </Tooltip>
              <HelpHint hintKey="metric.mae" />
            </Box>

            <Tooltip title="Average maximum adverse drawdown across trades with stops. Median and 90% Bootstrap Confidence Interval below." arrow>
              <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                -{avgMaeDisplay}R
              </Typography>
            </Tooltip>

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Median: <strong>-{medianMaeDisplay}R</strong> (IQR -{summary.p75MaeR ?? summary.maeR?.p75 ?? '—'}R to -{summary.p25MaeR ?? summary.maeR?.p25 ?? '—'}R)
            </Typography>

            <Box sx={{ mt: 1, pt: 1, borderTop: `1px dashed ${muiTheme.palette.divider}` }}>
              <Tooltip title="Trades with stops where price took early heat before pushing favorable" arrow>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.72rem' }}>
                  Early Heat First: <strong>{summary.heatFirstPercent ?? summary.timeOrdering?.heatFirstPercent ?? 0}%</strong> of trades
                </Typography>
              </Tooltip>
            </Box>

            {confidenceIntervals?.avgMaeR && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.5 }}>
                90% CI: [-{confidenceIntervals.avgMaeR.upper}R, -{confidenceIntervals.avgMaeR.lower}R]
              </Typography>
            )}
          </Card>
        </Grid>

        {/* Card 3: Exit Efficiency */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            onClick={() =>
              onOpenDrill({
                kind: 'FILTER',
                filter: { ...baseDrillFilter, mfeRMin: 0.01 },
                label: 'Trades with Exit Efficiency Measured',
              })
            }
            sx={{
              p: 2.25,
              height: '100%',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1px solid ${muiTheme.palette.divider}`,
              '&:hover': {
                borderColor: muiTheme.palette.primary.main,
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(59, 130, 246, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Tooltip title="Exit Efficiency: Percentage of the maximum favorable price move (MFE) captured at actual exit. 70%+ is elite execution; below 40% indicates giving back too much profit." arrow>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                  Exit Efficiency
                </Typography>
              </Tooltip>
              <HelpHint hintKey="metric.exitEfficiency" />
            </Box>

            <Tooltip title="Average % of maximum favorable excursion captured at exit (higher is better)" arrow>
              <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                {exitEffDisplay}%
              </Typography>
            </Tooltip>

            <Box sx={{ mt: 1, mb: 0.75 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, exitEffVal * 100))}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor:
                      exitEffVal >= 0.7 ? muiTheme.palette.profit.main :
                      exitEffVal >= 0.4 ? muiTheme.palette.warning.main :
                      muiTheme.palette.loss.main,
                  },
                }}
              />
            </Box>

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Median: <strong>{summary.medianExitEfficiency !== undefined ? `${(Number(summary.medianExitEfficiency) * 100).toFixed(1)}%` : (summary.exitEfficiency?.median !== undefined ? `${(Number(summary.exitEfficiency.median) * 100).toFixed(1)}%` : '—')}</strong>
            </Typography>

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem', mt: 0.5 }}>
              Stop Efficiency: <strong>{summary.avgStopEfficiency !== undefined ? `${(Number(summary.avgStopEfficiency) * 100).toFixed(1)}%` : (summary.stopEfficiency?.mean !== undefined ? `${(Number(summary.stopEfficiency.mean) * 100).toFixed(1)}%` : '—')}</strong>
            </Typography>
          </Card>
        </Grid>

        {/* Card 4: Post-Exit Continuation & Runner Edge */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            onClick={() =>
              onOpenDrill({
                kind: 'FILTER',
                filter: { ...baseDrillFilter, excursionFlag: 'RUNNER_LEFT_ON_TABLE', excursionFlags: 'RUNNER_LEFT_ON_TABLE' },
                label: 'Trades with Runners Left on Table',
              })
            }
            sx={{
              p: 2.25,
              height: '100%',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: `1px solid ${muiTheme.palette.divider}`,
              '&:hover': {
                borderColor: '#0ea5e9',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(14, 165, 233, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Tooltip title="Post-Trade Excursion: Measures how far price pushed in your trade's direction in the 60 minutes after you exited. Answers: 'Did I close too early and leave a huge runner on the table?'" arrow>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}>
                  Post-Exit Continuation
                </Typography>
              </Tooltip>
              <HelpOutlineRoundedIcon sx={{ color: '#0ea5e9', fontSize: 16 }} />
            </Box>

            <Tooltip title="Average continuation beyond your exit price within the 60-minute window" arrow>
              <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: '#0ea5e9', mt: 0.5 }}>
                +{postExitRunAvg !== undefined ? `${postExitRunAvg}R` : '—'}
              </Typography>
            </Tooltip>

            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Surrendered R Left: <strong>+{summary.avgRLeftOnTable !== undefined ? `${Number(summary.avgRLeftOnTable).toFixed(2)}R` : (summary.rLeftOnTable?.mean !== undefined ? `${Number(summary.rLeftOnTable.mean).toFixed(2)}R` : '—')}</strong>
            </Typography>

            <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
              {runnerCount > 0 && (
                <Chip
                  size="small"
                  label={`${runnerCount} Runners`}
                  color="warning"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                />
              )}
              {prematureCount > 0 && (
                <Chip
                  size="small"
                  label={`${prematureCount} Premature`}
                  color="info"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                />
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* 4. POST-EXIT MOMENTUM & RUNNER SUMMARY CALLOUT */}
      {(runnerCount > 0 || prematureCount > 0 || (postExitRunAvg ?? 0) > 0) && (
        <Card
          sx={{
            p: 2.25,
            borderRadius: 2.5,
            border: '1px solid rgba(14, 165, 233, 0.3)',
            backgroundColor: isDark ? 'rgba(14, 165, 233, 0.05)' : '#F0F9FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimelineRoundedIcon sx={{ color: '#0ea5e9', fontSize: 22 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Post-Exit Continuation Radar (60m window):
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Across your closed trades, market price continued pushing an additional{' '}
              <strong style={{ color: '#0ea5e9' }}>+{postExitRunAvg ?? 0}R</strong> beyond your exit price (reaching an extended peak average of{' '}
              <strong style={{ color: muiTheme.palette.profit.main }}>+{postExitMfeAvg ?? 0}R</strong> from entry).
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {runnerCount > 0 && (
              <Tooltip title="Trades where market ran an additional >0.5R beyond your exit" arrow>
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={`${runnerCount} Runners Left on Table`}
                  onClick={() =>
                    onOpenDrill({
                      kind: 'FILTER',
                      filter: { ...baseDrillFilter, excursionFlag: 'RUNNER_LEFT_ON_TABLE', excursionFlags: 'RUNNER_LEFT_ON_TABLE' },
                      label: 'Trades: Runner Left on Table',
                    })
                  }
                  sx={{ fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                />
              </Tooltip>
            )}
            {prematureCount > 0 && (
              <Tooltip title="Trades where market ran ≥1.0 full R beyond your exit price" arrow>
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={`${prematureCount} Premature Exits (Ran ≥1.0R)`}
                  onClick={() =>
                    onOpenDrill({
                      kind: 'FILTER',
                      filter: { ...baseDrillFilter, excursionFlag: 'PREMATURE_EXIT', excursionFlags: 'PREMATURE_EXIT' },
                      label: 'Trades: Premature Exits',
                    })
                  }
                  sx={{ fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                />
              </Tooltip>
            )}
          </Box>
        </Card>
      )}

      {/* 5. EMPIRICAL STOP & TARGET DECISION ENGINE */}
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
          <Box sx={{ maxWidth: 760 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Chip
                size="small"
                color="primary"
                icon={<ScienceRoundedIcon fontSize="small" />}
                label="Empirical Decision Engine"
                sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Data-Driven Stop Loss & Profit Target Recommendations
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              {whatIfSuggestions.rationale}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Tooltip title="Optimal stop based on 90% of your winning trades' maximum drawdown. Prevents giving excess room to trades that are failing." arrow>
                <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, cursor: 'help' }}>
                  Suggested Stop:{' '}
                  <span style={{ color: muiTheme.palette.loss.main }}>{whatIfSuggestions.suggestedStopR}R</span>
                </Typography>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ height: 16, my: 'auto' }} />
              <Tooltip title="Optimal target based on median favorable reach across winning setups before reversal" arrow>
                <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, cursor: 'help' }}>
                  Suggested Target:{' '}
                  <span style={{ color: muiTheme.palette.profit.main }}>{whatIfSuggestions.suggestedTargetR}R</span>
                </Typography>
              </Tooltip>
            </Box>
          </Box>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AutoAwesomeRoundedIcon />}
            onClick={() =>
              onNavigateToWhatIf({
                stopR: whatIfSuggestions.suggestedStopR,
                targetR: whatIfSuggestions.suggestedTargetR,
              })
            }
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5 }}
          >
            Simulate in What-If Grid
          </Button>
        </Card>
      )}

      {/* 6. INTERACTIVE MAE vs MFE SCATTER MATRIX */}
      <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                MAE vs MFE Execution Scatter Matrix ({isModeR ? 'R-Multiple' : isModePoints ? 'Points' : `${currencySymbol} Amount`}{includePostExitInScatter ? ' • Extended Post-Exit' : ''})
              </Typography>
              <HelpHint hintKey="analytics.excursion.scatter" />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              X-Axis: Adverse Drawdown (Heat) • Y-Axis: Favorable Peak (Potential) • Click any point to inspect full trade execution
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Units Selector */}
            <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 2 }}>
              <Tooltip title="Normalize excursion to initial 1R risk budget" arrow>
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
              <Tooltip title="View excursion in raw price points/ticks" arrow>
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
              <Tooltip title={`View excursion in account monetary currency (${currencySymbol})`} arrow>
                <span>
                  <Button
                    variant={currentMode === 'AMOUNT' ? 'contained' : 'outlined'}
                    onClick={() => setScatterMode('AMOUNT')}
                    size="small"
                    sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, px: 1.5, py: 0.25 }}
                  >
                    Amount ({currencySymbol})
                  </Button>
                </span>
              </Tooltip>
            </ButtonGroup>

            {/* In-Trade vs Post-Exit Extended Toggle */}
            <Tooltip title="Switch Y-Axis between In-Trade MFE (peak reached before exit) and Post-Exit Extended Peak (continuation within 60 minutes after closing)" arrow>
              <Button
                variant={includePostExitInScatter ? 'contained' : 'outlined'}
                color={includePostExitInScatter ? 'info' : 'inherit'}
                onClick={() => setIncludePostExitInScatter(!includePostExitInScatter)}
                size="small"
                startIcon={<CompareArrowsRoundedIcon fontSize="small" />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  borderRadius: 2,
                  px: 1.5,
                  py: 0.25,
                  borderColor: includePostExitInScatter ? undefined : 'rgba(14, 165, 233, 0.4)',
                  color: includePostExitInScatter ? undefined : '#0ea5e9',
                }}
              >
                {includePostExitInScatter ? 'Showing: Post-Exit Peak' : 'Include Post-Exit Peak'}
              </Button>
            </Tooltip>
          </Box>
        </Box>

        {/* Quick Filter Bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <FilterListRoundedIcon fontSize="small" />
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filter:
            </Typography>
          </Box>
          {(['ALL', 'WINNERS', 'LOSERS', 'RUNNERS', 'STOP_REVERSAL'] as const).map((filterKey) => (
            <Chip
              key={filterKey}
              size="small"
              label={
                filterKey === 'ALL'
                  ? `All (${preparedPoints.length})`
                  : filterKey === 'WINNERS'
                  ? `Winners (${preparedPoints.filter((p: any) => p.outcome === 'WIN').length})`
                  : filterKey === 'LOSERS'
                  ? `Losers (${preparedPoints.filter((p: any) => p.outcome !== 'WIN').length})`
                  : filterKey === 'RUNNERS'
                  ? `Runners Post-Exit (${preparedPoints.filter((p: any) => p.hasRunner).length})`
                  : `Stop & Reverse (${preparedPoints.filter((p: any) => p.hasStopReversal).length})`
              }
              onClick={() => setScatterFilter(filterKey)}
              color={scatterFilter === filterKey ? 'primary' : 'default'}
              variant={scatterFilter === filterKey ? 'filled' : 'outlined'}
              sx={{ fontWeight: scatterFilter === filterKey ? 700 : 500, fontSize: '0.7rem', cursor: 'pointer' }}
            />
          ))}
        </Box>

        {/* Scatter Chart Canvas */}
        <Box sx={{ width: '100%', height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
              onClick={(state: any) => {
                const p = state?.activePayload?.[0]?.payload;
                if (p?.tradeId) {
                  onOpenDrill({
                    kind: 'TRADE',
                    tradeId: p.tradeId,
                    label: `Trade ${p.symbol || ''}`,
                  });
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis
                type="number"
                dataKey="scatterX"
                name={isModeR ? 'MAE (R)' : isModePoints ? 'MAE (Points)' : `MAE (${currencySymbol})`}
                unit={isModeR ? 'R' : isModePoints ? ' pts' : ` ${currencySymbol}`}
                stroke={chartAxisColor}
                fontSize={11}
                domain={[0, 'dataMax + 0.5']}
              />
              <YAxis
                type="number"
                dataKey="scatterY"
                name={isModeR ? 'MFE (R)' : isModePoints ? 'MFE (Points)' : `MFE (${currencySymbol})`}
                unit={isModeR ? 'R' : isModePoints ? ' pts' : ` ${currencySymbol}`}
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
                            <strong>MAE (Adverse Heat):</strong>{' '}
                            {d.maeR !== undefined ? `-${d.maeR} R` : '—'}
                            {d.maePoints !== undefined ? ` (-${d.maePoints} pts)` : ''}
                            {d.maeAmount !== undefined ? ` • -${formatCurrency(Math.abs(d.maeAmount), analyticsCurrency)}` : ''}
                          </div>
                          <div>
                            <strong>In-Trade MFE:</strong>{' '}
                            {d.mfeR !== undefined ? `+${d.mfeR} R` : '—'}
                            {d.mfePoints !== undefined ? ` (+${d.mfePoints} pts)` : ''}
                            {d.mfeAmount !== undefined ? ` • +${formatCurrency(Math.abs(d.mfeAmount), analyticsCurrency)}` : ''}
                          </div>
                          {d.postExitMfePoints !== undefined && (
                            <div style={{ color: '#0ea5e9', fontWeight: 600 }}>
                              <strong>Post-Exit Peak:</strong> +{d.postExitMfePoints} pts {d.postExitMfeR !== undefined ? `(+${d.postExitMfeR}R)` : ''}
                            </div>
                          )}
                          {d.postExitRunBeyondExitPoints !== undefined && d.postExitRunBeyondExitPoints > 0 && (
                            <div style={{ color: '#0ea5e9' }}>
                              <strong>Ran Past Exit:</strong> +{d.postExitRunBeyondExitPoints} pts {d.postExitRunBeyondExitR !== undefined ? `(+${d.postExitRunBeyondExitR}R)` : ''}
                            </div>
                          )}
                          <div>
                            <strong>Exit Efficiency:</strong>{' '}
                            {d.exitEfficiency !== undefined ? `${(d.exitEfficiency * 100).toFixed(1)}%` : '—'}
                          </div>
                          <div style={{ color: d.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main, fontWeight: 700 }}>
                            <strong>Net P&L:</strong> {formatCurrency(d.netPnL, analyticsCurrency)}
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
                  const tradeId = entry?.tradeId || entry?.payload?.tradeId || entry?.activePayload?.[0]?.payload?.tradeId;
                  if (tradeId) {
                    onOpenDrill({
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
                  const tradeId = entry?.tradeId || entry?.payload?.tradeId || entry?.activePayload?.[0]?.payload?.tradeId;
                  if (tradeId) {
                    onOpenDrill({
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

        {/* Four Quadrant Educational Guide (Clickable to Drill Down) */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              onClick={() =>
                onOpenDrill({
                  kind: 'FILTER',
                  filter: { ...baseDrillFilter, maeRMax: 0.5, mfeRMin: 1.5 },
                  label: 'Sweet Spot Trades (MAE < 0.5R, MFE > 1.5R)',
                })
              }
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${alpha(muiTheme.palette.profit.main, 0.3)}`,
                backgroundColor: alpha(muiTheme.palette.profit.main, 0.04),
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: muiTheme.palette.profit.main,
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: muiTheme.palette.profit.main, display: 'block' }}>
                🟢 Top-Left (Sweet Spot)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                Low MAE (&lt;0.5R) & High MFE (&gt;1.5R). Perfect entry timing with minimal heat and large runs. Click to inspect trades.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              onClick={() =>
                onOpenDrill({
                  kind: 'FILTER',
                  filter: { ...baseDrillFilter, maeRMin: 0.8, mfeRMin: 1.5 },
                  label: 'Painful Winners (MAE > 0.8R, MFE > 1.5R)',
                })
              }
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${alpha('#F59E0B', 0.3)}`,
                backgroundColor: alpha('#F59E0B', 0.04),
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#F59E0B',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
                },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: '#F59E0B', display: 'block' }}>
                🟡 Top-Right (Painful Winners)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                High MAE (&gt;0.8R) & High MFE. Trades that worked eventually, but took terrifying heat first. Click to inspect trades.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              onClick={() =>
                onOpenDrill({
                  kind: 'FILTER',
                  filter: { ...baseDrillFilter, maeRMax: 0.5, mfeRMax: 1.0 },
                  label: 'Low Excursion Scratches (MAE < 0.5R, MFE < 1.0R)',
                })
              }
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: muiTheme.palette.primary.main,
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block' }}>
                ⚪ Bottom-Left (Scratches & Low Run)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                Low MAE & Low MFE. Trades exited at breakeven or small loss before momentum. Click to inspect trades.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              onClick={() =>
                onOpenDrill({
                  kind: 'FILTER',
                  filter: { ...baseDrillFilter, maeRMin: 0.8, mfeRMax: 1.0, outcome: 'LOSS' },
                  label: 'Full Losses (MAE > 0.8R, MFE < 1.0R)',
                })
              }
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${alpha(muiTheme.palette.loss.main, 0.3)}`,
                backgroundColor: alpha(muiTheme.palette.loss.main, 0.04),
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: muiTheme.palette.loss.main,
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(244, 63, 94, 0.15)',
                },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: muiTheme.palette.loss.main, display: 'block' }}>
                🔴 Bottom-Right (Full Losses)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                High MAE & Low MFE. Setups that went immediately against you to stop loss. Click to inspect trades.
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>

      {/* 7. DEEP-DIVE COLUMNS: STOP LOSS OPTIMIZER & MFE REACH FUNNEL */}
      <Grid container spacing={2.5}>
        {/* Left: Stop Loss Optimizer (Winner-Only MAE Distribution) */}
        <Grid size={{ xs: 12, md: 6 }}>
          {Boolean(winnersMaeDistribution && ((winnersMaeDistribution as any).buckets?.length || (winnersMaeDistribution as any).distribution?.length)) && (() => {
            const winnerBuckets = (winnersMaeDistribution as any).buckets || (winnersMaeDistribution as any).distribution || [];
            return (
              <Card sx={{ p: 2.5, borderRadius: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <SecurityIcon sx={{ color: muiTheme.palette.profit.main, fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      Stop Loss Optimization (Winner-Only MAE)
                    </Typography>
                    <HelpHint hintKey="analytics.execution.winnersMae" />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Do your winning trades actually need your full stop room? If 90% of winners never suffer &gt;0.4R heat, a 1.0R stop absorbs unnecessary risk.
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  {winnersMaeDistribution.p50 !== undefined && (
                    <Chip size="small" variant="outlined" label={`Median: ${winnersMaeDistribution.p50}R`} sx={{ fontWeight: 700, fontSize: '0.72rem' }} />
                  )}
                  {winnersMaeDistribution.p75 !== undefined && (
                    <Chip size="small" variant="outlined" label={`P75: ${winnersMaeDistribution.p75}R`} sx={{ fontWeight: 700, fontSize: '0.72rem' }} />
                  )}
                  {winnersMaeDistribution.p90 !== undefined && (
                    <Chip size="small" color="primary" label={`P90: ${winnersMaeDistribution.p90}R`} sx={{ fontWeight: 800, fontSize: '0.72rem' }} />
                  )}
                </Box>

                <Box sx={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={winnerBuckets}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      onClick={(data: any) => {
                        const b = data?.activePayload?.[0]?.payload || data?.payload;
                        if (b && b.tradeIds && b.tradeIds.length > 0) {
                          onOpenDrill({
                            kind: 'TRADES',
                            tradeIds: b.tradeIds,
                            label: `Winners with ${b.range} MAE Heat (${b.count} trades)`,
                          });
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                      <XAxis dataKey="range" stroke={chartAxisColor} fontSize={10} />
                      <YAxis stroke={chartAxisColor} fontSize={10} />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const b = payload[0].payload;
                            return (
                              <Paper sx={{ ...chartTooltipStyle, p: 1.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                  Adverse Heat: {b.range}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                  {b.count} winning trades ({b.pct}%)
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                                  Click bar to inspect trades
                                </Typography>
                              </Paper>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" fill={muiTheme.palette.profit.main} radius={[4, 4, 0, 0]} cursor="pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                {/* Clickable Quick Bucket Selection Chips */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                  {winnerBuckets.map((b: any) => (
                    <Chip
                      key={b.range}
                      size="small"
                      variant="outlined"
                      label={`${b.range}: ${b.count} (${b.pct}%)`}
                      onClick={() => {
                        if (b.tradeIds && b.tradeIds.length > 0) {
                          onOpenDrill({
                            kind: 'TRADES',
                            tradeIds: b.tradeIds,
                            label: `Winners with ${b.range} Heat (${b.count} trades)`,
                          });
                        }
                      }}
                      sx={{
                        cursor: b.count > 0 ? 'pointer' : 'default',
                        fontWeight: 600,
                        fontSize: '0.68rem',
                        borderColor: b.count > 0 ? alpha(muiTheme.palette.profit.main, 0.4) : muiTheme.palette.divider,
                        '&:hover': b.count > 0 ? {
                          borderColor: muiTheme.palette.profit.main,
                          bgcolor: alpha(muiTheme.palette.profit.main, 0.08),
                        } : {},
                      }}
                    />
                  ))}
                </Box>

                {winnersMaeDistribution.insight && (
                  <Alert severity="info" sx={{ mt: 'auto', pt: 1, fontSize: '0.8rem' }}>
                    <strong>Stop Sizing Coach:</strong> {winnersMaeDistribution.insight}
                  </Alert>
                )}
              </Card>
            );
          })()}
        </Grid>

        {/* Right: Profit Realization & Giveback (MFE Reach Funnel) */}
        <Grid size={{ xs: 12, md: 6 }}>
          {mfeReachFunnel && mfeReachFunnel.steps && (
            <Card sx={{ p: 2.5, borderRadius: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <TrendingUpRoundedIcon sx={{ color: '#06B6D4', fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      MFE Reach Funnel & Round-Trip Losses
                    </Typography>
                    <HelpHint hintKey="analytics.execution.funnel" />
                  </Box>

                  {mfeReachFunnel.roundTripLossRate > 0 && (
                    <Chip
                      size="small"
                      label={`Round-Trip Rate: ${mfeReachFunnel.roundTripLossRate}%`}
                      color={mfeReachFunnel.roundTripLossRate > 25 ? 'error' : 'success'}
                      sx={{ fontWeight: 800, fontSize: '0.72rem' }}
                    />
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                  Tracks trade progression through milestone R levels and pinpoints where winning trades surrendered profit. Click any milestone to drill down.
                </Typography>

                {/* Milestone Mode Switcher */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
                  {(['AUTO', 'PLANNED_TARGETS', 'STANDARD', 'CUSTOM'] as const).map((m) => (
                    <Chip
                      key={m}
                      size="small"
                      label={
                        m === 'AUTO'
                          ? 'Auto'
                          : m === 'PLANNED_TARGETS'
                          ? 'Planned'
                          : m === 'STANDARD'
                          ? 'Standard (+0.5R)'
                          : 'Custom'
                      }
                      onClick={() => setFunnelMode(m)}
                      color={funnelMode === m ? 'primary' : 'default'}
                      variant={funnelMode === m ? 'filled' : 'outlined'}
                      sx={{ fontWeight: funnelMode === m ? 800 : 500, fontSize: '0.68rem', height: 22, cursor: 'pointer' }}
                    />
                  ))}
                  {funnelMode === 'CUSTOM' && (
                    <TextField
                      size="small"
                      placeholder="0.5, 1.0, 1.5, 2.0"
                      value={customMfeStepsInput}
                      onChange={(e) => setCustomMfeStepsInput(e.target.value)}
                      sx={{ width: 140, '& .MuiInputBase-input': { py: 0.2, px: 0.8, fontSize: '0.72rem' } }}
                    />
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, my: 'auto' }}>
                {mfeReachFunnel.steps.map((step: any) => (
                  <Box
                    key={step.label}
                    onClick={() => {
                      if (step.tradeIds && step.tradeIds.length > 0) {
                        onOpenDrill({
                          kind: 'TRADES',
                          tradeIds: step.tradeIds,
                          label: `Trades ${step.label} (${step.reachedCount} trades)`,
                        });
                      } else {
                        onOpenDrill({
                          kind: 'FILTER',
                          filter: { ...baseDrillFilter, mfeRMin: step.thresholdR },
                          label: `Trades ${step.label}`,
                        });
                      }
                    }}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: `1px solid ${muiTheme.palette.divider}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: 'primary.main',
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                        transform: 'translateX(3px)',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.1)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        {step.label}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {step.reachedCount} trades ({step.reachPct}%) &rarr;
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, Math.max(0, step.reachPct || 0))}
                      sx={{ height: 5, borderRadius: 2.5, mb: 0.5 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'text.secondary' }}>
                      <span>Wins: <strong>{step.closedAsWinPercent}%</strong></span>
                      <span>Losses: <strong>{step.closedAsLossPercent}%</strong></span>
                      <span>Scratch: <strong>{step.closedAsBreakevenPercent}%</strong></span>
                    </Box>
                  </Box>
                ))}
              </Box>

              {mfeReachFunnel.roundTripLossCount > 0 && (
                <Alert
                  severity="warning"
                  onClick={() => {
                    if (mfeReachFunnel.roundTripTradeIds && mfeReachFunnel.roundTripTradeIds.length > 0) {
                      onOpenDrill({
                        kind: 'TRADES',
                        tradeIds: mfeReachFunnel.roundTripTradeIds,
                        label: `Round-Trip Giveback Trades (${mfeReachFunnel.roundTripLossCount} trades)`,
                      });
                    } else {
                      onOpenDrill({
                        kind: 'FILTER',
                        filter: { ...baseDrillFilter, mfeRMin: 1.0, outcome: 'LOSS' },
                        label: 'Round-Trip Giveback Trades (≥+1.0R into Loss)',
                      });
                    }
                  }}
                  sx={{
                    mt: 1.5,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    '&:hover': {
                      borderColor: '#F59E0B',
                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  <strong>Giveback Alert:</strong> {mfeReachFunnel.roundTripLossCount} trades reached +1.0R but reversed into losses, surrendering {formatCurrency(mfeReachFunnel.totalSurrenderedAmount, analyticsCurrency)}. Moving Stop Loss to Breakeven would save ~{formatCurrency(mfeReachFunnel.totalSurrenderedAmount * 0.5, analyticsCurrency)}! <strong style={{ textDecoration: 'underline' }}>Click to inspect trades &rarr;</strong>
                </Alert>
              )}
            </Card>
          )}
        </Grid>
      </Grid>

      {/* 8. ORDER EXECUTION SLIPPAGE & FILL QUALITY */}
      {slip && slip.tradesWithSlippageCount > 0 && (
        <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrackChangesRoundedIcon sx={{ color: '#F59E0B', fontSize: 22 }} />
                Order Execution Slippage & Broker Fill Quality
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Cumulative cost of broker execution latency and fill divergence from your planned entry and exit orders.
              </Typography>
            </Box>
            <Chip label={`${slip.tradesWithSlippageCount} Measured Trades`} size="small" sx={{ fontWeight: 700, fontSize: '0.6875rem' }} />
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Total Slippage Impact
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: slip.totalSlippageCost > 0 ? muiTheme.palette.loss.main : muiTheme.palette.profit.main }}>
                  {formatCurrency(slip.totalSlippageCost, analyticsCurrency)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  {slip.totalSlippageCost > 0 ? 'Net monetary drag from execution delay' : 'Net savings from price improvements'}
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Avg Slippage per Trade
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                  {formatCurrency(slip.avgSlippagePerTrade, analyticsCurrency)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  Across {slip.tradesWithSlippageCount} trades with planned levels
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Fill Ratio (Adverse vs Favorable)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                  <span style={{ color: muiTheme.palette.loss.main }}>{slip.adverseTradesCount}</span>
                  {' / '}
                  <span style={{ color: muiTheme.palette.profit.main }}>{slip.favorableTradesCount}</span>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  {slip.neutralTradesCount} trades filled at exact plan price
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Adverse Legs (Entry vs Exit)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                  {slip.adverseEntryCount} in • {slip.adverseExitCount} out
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  Legs with worse execution price than intended
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Card>
      )}

      {/* 9. BEHAVIORAL COHORTS & DISCIPLINE BRIDGES */}
      {cohorts.length > 0 && (
        <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <PsychologyIcon sx={{ color: 'primary.main', fontSize: 22 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Execution Quality Cohort Comparisons (Psychology & Discipline Bridges)
              </Typography>
              <HelpHint hintKey="analytics.execution.cohorts" />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Connects execution efficiency directly to discipline, psychology, and trading session conditions.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {cohorts.map((c: any) => (
              <Grid key={c.cohortName} size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
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

      {/* 10. ROLLING 20-TRADE EXECUTION TREND */}
      {rollingTrend.length > 5 && (
        <Card sx={{ p: 2.5, borderRadius: 2.5 }}>
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrendingUpRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
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
    </Box>
  );
}
