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
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

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
  selectedSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
  onRefresh?: () => void;
  onDrillDown?: (filterOrDesc: any, label: string) => void;
}

export function PositionSizingDiagnosticsTab({
  data,
  isLoading,
  currencySymbol = '$',
  selectedSymbol,
  onSelectSymbol,
  onRefresh,
  onDrillDown,
}: IPositionSizingDiagnosticsTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [activeChart, setActiveChart] = useState<'EQUITY_COMPARISON' | 'SIZE_PROGRESSION'>('EQUITY_COMPARISON');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);

  const availableSymbols = data?.availableSymbols || [];
  const currentSymbol = selectedSymbol || data?.selectedSymbol || 'ALL';

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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {availableSymbols.length > 1 && (
          <Card
            sx={{
              p: 1.5,
              px: 2,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterListRoundedIcon sx={{ fontSize: 18, color: muiTheme.palette.primary.main }} />
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Asset Filter:
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Chip
                label="All Assets (Combined)"
                onClick={() => onSelectSymbol?.('ALL')}
                color={currentSymbol === 'ALL' ? 'primary' : 'default'}
                variant={currentSymbol === 'ALL' ? 'filled' : 'outlined'}
                size="small"
                sx={{ fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
              />
              {availableSymbols.map((sym) => {
                const isSelected = currentSymbol === sym;
                return (
                  <Chip
                    key={sym}
                    label={sym}
                    onClick={() => onSelectSymbol?.(sym)}
                    color={isSelected ? 'primary' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: `'JetBrains Mono', monospace`,
                    }}
                  />
                );
              })}
            </Box>
          </Card>
        )}
        <Card sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <StraightenRoundedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            No Sizing Analytics Available {currentSymbol !== 'ALL' ? `for ${currentSymbol}` : ''}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto' }}>
            {currentSymbol !== 'ALL'
              ? `No closed trades recorded with lot sizes for ${currentSymbol}. Switch to "All Assets" or choose another instrument.`
              : 'Log more closed trades with recorded lot sizes (e.g. 0.01, 0.02, 0.04) to analyze your position sizing evolution, tier performance, and Sizing Alpha.'}
          </Typography>
        </Card>
      </Box>
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
      {/* Symbol Filter Bar (Multi-Asset Sizing Isolation) */}
      {availableSymbols.length > 1 && (
        <Card
          sx={{
            p: 1.5,
            px: 2,
            borderRadius: 2,
            border: `1px solid ${muiTheme.palette.divider}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.01)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterListRoundedIcon sx={{ fontSize: 18, color: muiTheme.palette.primary.main }} />
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
              Asset Filter:
            </Typography>
            <Tooltip
              title="Different instruments use different contract lot values (for example: 1 lot of ETH is 1 coin, whereas 0.02 lots of Gold is 2 ounces). Filtering by individual asset isolates your true sizing discipline without cross-asset distortion."
              arrow
            >
              <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
            </Tooltip>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Tooltip title="View combined diagnostics across all traded assets" arrow>
              <Chip
                label="All Assets (Combined)"
                onClick={() => onSelectSymbol?.('ALL')}
                color={currentSymbol === 'ALL' ? 'primary' : 'default'}
                variant={currentSymbol === 'ALL' ? 'filled' : 'outlined'}
                size="small"
                sx={{ fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
              />
            </Tooltip>
            {availableSymbols.map((sym) => {
              const isSelected = currentSymbol === sym;
              return (
                <Tooltip key={sym} title={`Isolate sizing analytics exclusively for ${sym}`} arrow>
                  <Chip
                    label={sym}
                    onClick={() => onSelectSymbol?.(sym)}
                    color={isSelected ? 'primary' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: `'JetBrains Mono', monospace`,
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        </Card>
      )}

      {/* Multi-Asset Scaling Guidance Banner */}
      {currentSymbol === 'ALL' && availableSymbols.length > 1 && (
        <Alert
          severity="info"
          icon={<InfoOutlinedIcon fontSize="small" />}
          sx={{
            borderRadius: 2,
            fontSize: '0.8125rem',
            py: 0.75,
            border: `1px solid ${alpha(muiTheme.palette.info.main, 0.2)}`,
            backgroundColor: isDark ? 'rgba(2, 136, 209, 0.08)' : 'rgba(2, 136, 209, 0.05)',
            '& .MuiAlert-message': { width: '100%' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: 'info.main', fontSize: '0.8125rem' }}>
                Multi-Asset Lot Scaling Detected
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                You trade different contract lot scales across instruments (e.g. 1–2 lots on Crypto vs 0.02–0.04 lots on Gold/Forex). In "All Assets" view, lot numbers are combined. Click any asset pill above to isolate pure sizing analytics for that specific instrument.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {availableSymbols.map((sym) => (
                <Button
                  key={sym}
                  size="small"
                  variant="outlined"
                  color="info"
                  onClick={() => onSelectSymbol?.(sym)}
                  sx={{ textTransform: 'none', py: 0.25, px: 1, fontSize: '0.7rem', fontWeight: 700 }}
                >
                  View {sym}
                </Button>
              ))}
            </Box>
          </Box>
        </Alert>
      )}

      {/* Educational Concept Card: Position Sizing Alpha & Health */}
      <Card
        sx={{
          p: 2.5,
          borderRadius: 2.5,
          border: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.04)' : 'rgba(59, 130, 246, 0.02)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <SchoolRoundedIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Understanding Position Sizing & Sizing Alpha
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                1. Sizing Alpha
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                Measures the dollar gain/loss generated purely from varying lot sizes vs trading constant volume. Positive Alpha (+Good) confirms you sized up on winning setups.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                2. Sizing Health Grade
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                A 0–100 score scoring sizing discipline across 3 pillars: profitability of larger lot tiers, drawdown containment at base size, and absence of post-loss revenge spikes.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                3. Revenge Escalation
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                Sizing up immediately after a losing trade (Martingale tilt pattern). In prop firm challenges, this is the leading trigger of catastrophic maximum daily drawdown breaches.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                4. Lot Size Tiers
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                Clusters of volumes traded (e.g. 0.01 Base, 0.02 2x, 0.04 4x). Inspecting metrics per tier reveals whether your edge scales with larger capital or decays due to psychological pressure.
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>

      {/* Top Hero KPI Cards */}
      <Grid container spacing={2}>
        {/* Card 1: Sizing Alpha */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip
            title="Sizing Alpha measures whether varying your position size added or subtracted value compared to trading the exact same average lot size every time. Click to inspect all evaluated sizing trades."
            arrow
          >
            <Card
              onClick={() => {
                if (onDrillDown && progression.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: progression.map((p) => p.tradeId) },
                    'All Evaluated Sizing Trades'
                  );
                }
              }}
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
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: isAlphaPositive ? '#10B981' : '#EF4444',
                  transform: 'translateY(-2px)',
                  boxShadow: isAlphaPositive
                    ? '0 4px 12px rgba(16, 185, 129, 0.2)'
                    : '0 4px 12px rgba(239, 68, 68, 0.2)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sizing Alpha
                </Typography>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
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
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  Inspect →
                </Typography>
              </Box>
            </Card>
          </Tooltip>
        </Grid>

        {/* Card 2: Sizing Health Score & Grade */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip
            title="A comprehensive 0–100 score and letter grade (A/B/C/D) evaluating your sizing discipline. Click to inspect trades."
            arrow
          >
            <Card
              onClick={() => {
                if (onDrillDown && progression.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: progression.map((p) => p.tradeId) },
                    'Sizing Health Evaluated Trades'
                  );
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: gradeColor,
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${alpha(gradeColor, 0.2)}`,
                },
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                  {summary.sizingHealthGrade === 'A' || summary.sizingHealthGrade === 'B'
                    ? 'Healthy scaling discipline'
                    : 'Size escalation friction detected'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  Inspect →
                </Typography>
              </Box>
            </Card>
          </Tooltip>
        </Grid>

        {/* Card 3: Lot Tiers Detected */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip
            title="Groups your trades into volume clusters (e.g. Base 0.01, 2x 0.02, 4x 0.04). Click to highlight tiers."
            arrow
          >
            <Card
              onClick={() => {
                if (tiers.length > 0) {
                  setSelectedTierKey(tiers[0]?.tierKey || null);
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#8B5CF6',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)',
                },
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: `'JetBrains Mono', monospace` }}>
                  Base: {summary.baseLotQuantity}L • Avg: {summary.averageLotQuantity}L
                </Typography>
                <Typography variant="caption" sx={{ color: '#8B5CF6', fontSize: '0.6875rem', fontWeight: 700 }}>
                  View Tiers ↓
                </Typography>
              </Box>
            </Card>
          </Tooltip>
        </Grid>

        {/* Card 4: Revenge Escalation Rate */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip
            title="The percentage of lot size increases that occurred directly after a loss (Martingale tilt pattern). Click to inspect revenge escalation trades."
            arrow
          >
            <Card
              onClick={() => {
                const revTradeIds = progression.filter((p) => p.isRevengeEscalation).map((p) => p.tradeId);
                if (onDrillDown && revTradeIds.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: revTradeIds },
                    `Revenge Escalation Trades (${revTradeIds.length} trades)`
                  );
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: (triggerAnalysis?.revengeEscalations ?? 0) > 0 ? 'pointer' : 'help',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: (triggerAnalysis?.revengeEscalationRate ?? 0) > 25 ? '#EF4444' : '#10B981',
                  transform: 'translateY(-2px)',
                  boxShadow: (triggerAnalysis?.revengeEscalationRate ?? 0) > 25
                    ? '0 4px 12px rgba(239, 68, 68, 0.2)'
                    : '0 4px 12px rgba(16, 185, 129, 0.2)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Revenge Escalation Rate
                </Typography>
                <WarningAmberRoundedIcon
                  sx={{
                    fontSize: 20,
                    color: (triggerAnalysis?.revengeEscalationRate ?? 0) > 25 ? '#EF4444' : '#10B981',
                  }}
                />
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                  {triggerAnalysis?.revengeEscalations ?? 0} of {triggerAnalysis?.totalEscalations ?? 0} escalations
                </Typography>
                {(triggerAnalysis?.revengeEscalations ?? 0) > 0 && (
                  <Typography variant="caption" sx={{ color: '#EF4444', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    Inspect →
                  </Typography>
                )}
              </Box>
            </Card>
          </Tooltip>
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
                ? 'Compares your actual journey against what your P&L would be if you had traded a constant average lot size with identical total volume.'
                : 'Chronological sequence of all trades showing lot sizes and color-coded win/loss outcomes.'}
            </Typography>
          </Box>

          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="Compare your actual equity curve against a constant lot size baseline" arrow>
              <Button
                variant={activeChart === 'EQUITY_COMPARISON' ? 'contained' : 'outlined'}
                onClick={() => setActiveChart('EQUITY_COMPARISON')}
                sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}
              >
                Equity Comparison
              </Button>
            </Tooltip>
            <Tooltip title="View every trade plotted chronologically by lot size with win/loss and revenge indicators" arrow>
              <Button
                variant={activeChart === 'SIZE_PROGRESSION' ? 'contained' : 'outlined'}
                onClick={() => setActiveChart('SIZE_PROGRESSION')}
                sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}
              >
                Size Progression Timeline
              </Button>
            </Tooltip>
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
                      : 'Flat Base Baseline',
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
                      : 'Flat Base Baseline'
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
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, display: 'block', mt: 0.75 }}>
                          Click point to inspect trade →
                        </Typography>
                      </Box>
                    );
                  }}
                />
                <Scatter
                  data={progression}
                  cursor="pointer"
                  onClick={(node: any) => {
                    const pt = node?.payload;
                    if (pt?.tradeId && onDrillDown) {
                      onDrillDown(
                        { kind: 'TRADE', tradeId: pt.tradeId },
                        `Trade #${pt.tradeIndex} (${pt.symbol} • ${pt.quantity} Lots)`
                      );
                    }
                  }}
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <LayersRoundedIcon sx={{ color: muiTheme.palette.primary.main }} />
              Performance by Lot Size Tier
            </Typography>
            <Tooltip
              title="Breaks down your win rate, profit factor, average win/loss, and payoff ratio across each distinct lot size cluster you trade to identify where your edge is strongest."
              arrow
            >
              <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
            </Tooltip>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Click any tier card or row to highlight drilldown metrics
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

            const verdictTooltip =
              t.verdict === 'OPTIMAL'
                ? 'Optimal Tier: High win rate, great profit factor, and strong positive expectancy. Your edge is strongest at this size.'
                : t.verdict === 'HEALTHY'
                ? 'Healthy Tier: Consistently profitable with solid risk-reward and controlled drawdown.'
                : t.verdict === 'MARGINAL'
                ? 'Marginal Tier: Near breakeven. The risk taken at this volume is not producing commensurate profit.'
                : 'Value Destructive: Net losing tier. Trading at this size is actively draining profits from your account.';

            return (
              <Grid key={t.tierKey} size={{ xs: 12, sm: 6, md: 4, lg: Math.max(3, Math.floor(12 / Math.min(tiers.length, 4))) }}>
                <Tooltip title="Click to filter/highlight this lot size tier" arrow>
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
                      <Tooltip title={verdictTooltip} arrow>
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
                      </Tooltip>
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
                      <Tooltip title="Percentage of winning trades taken at this specific lot size" arrow>
                        <Box sx={{ cursor: 'help' }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', display: 'block' }}>
                            Win Rate
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                            {t.winRate}%
                          </Typography>
                        </Box>
                      </Tooltip>
                      <Tooltip title="Gross Profit divided by Gross Loss at this size (values above 1.5 indicate a strong edge)" arrow>
                        <Box sx={{ cursor: 'help' }}>
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
                      </Tooltip>
                      <Tooltip title="Average dollar gain on winning trades versus average dollar loss on losing trades at this size" arrow>
                        <Box sx={{ cursor: 'help' }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', display: 'block' }}>
                            Avg Win / Loss
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: 'text.secondary' }}>
                            +{t.avgWin} / -{t.avgLoss}
                          </Typography>
                        </Box>
                      </Tooltip>
                      <Tooltip title="Average dollar profit or loss expected per trade at this size based on win rate and payoff ratio" arrow>
                        <Box sx={{ cursor: 'help' }}>
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
                      </Tooltip>
                    </Box>

                    {/* Tier Drilldown Action Button */}
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        const tierTradeIds = progression
                          .filter((p) => p.quantity >= t.minQuantity && p.quantity <= t.maxQuantity)
                          .map((p) => p.tradeId);
                        if (onDrillDown && tierTradeIds.length > 0) {
                          onDrillDown(
                            { kind: 'TRADES', tradeIds: tierTradeIds },
                            `Lot Tier: ${t.label} (${t.tradeCount} trades)`
                          );
                        }
                      }}
                      endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 13 }} />}
                      sx={{
                        mt: 1.5,
                        width: '100%',
                        textTransform: 'none',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        py: 0.35,
                        borderColor: alpha(muiTheme.palette.primary.main, 0.4),
                      }}
                    >
                      Inspect {t.tradeCount} Trades
                    </Button>
                  </Card>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>

        {/* Detailed Sizing Matrix Table */}
        <Card sx={{ borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="The specific lot quantity range or tier (e.g. 0.01 Lots vs 0.02 Lots vs 0.04 Lots)" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                      Lot Size Tier <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Total number of closed trades executed at this lot size and percentage of your overall trade count" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Trades <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Percentage of closed trades in this tier that ended in a profit" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Win Rate <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Gross Profit divided by Gross Loss at this lot size. Over 1.5 is strong, below 1.0 is net losing." arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Profit Factor <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Total real dollar profit or loss generated exclusively by trades in this lot tier" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Net P&L <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Average dollar amount won on profitable trades at this size" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Avg Win <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Average dollar amount lost on losing trades at this size" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Avg Loss <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Reward-to-Risk ratio: Average Win divided by Average Loss (e.g. 1 : 1.8 means wins are 1.8x losses)" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Payoff Ratio <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Average multiple of planned risk (R) realized per trade at this size" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Avg R <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Maximum peak-to-trough dollar decline experienced exclusively while trading at this lot size" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Max Drawdown <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Automated edge classification based on expectancy, profit factor, and net return" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                      Sizing Verdict <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <Tooltip title="Inspect trades in this lot size tier" arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                      Action <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tiers.map((t) => {
                const tierTradeIds = progression
                  .filter((p) => p.quantity >= t.minQuantity && p.quantity <= t.maxQuantity)
                  .map((p) => p.tradeId);
                return (
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
                      <Tooltip
                        title={
                          t.verdict === 'OPTIMAL'
                            ? 'Optimal Tier: Highest edge and positive expectancy'
                            : t.verdict === 'HEALTHY'
                            ? 'Healthy Tier: Consistently profitable'
                            : t.verdict === 'MARGINAL'
                            ? 'Marginal Tier: Near breakeven'
                            : 'Value Destructive Tier: Net losing at this size'
                        }
                        arrow
                      >
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
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="text"
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDrillDown && tierTradeIds.length > 0) {
                            onDrillDown(
                              { kind: 'TRADES', tradeIds: tierTradeIds },
                              `Lot Tier: ${t.label} (${t.tradeCount} trades)`
                            );
                          }
                        }}
                        endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 12 }} />}
                        sx={{ textTransform: 'none', fontSize: '0.7rem', fontWeight: 800, py: 0, px: 1, minWidth: 'auto' }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </Box>

      {/* Escalation Trigger Diagnostics: Compounding vs Revenge Martingale */}
      {triggerAnalysis && triggerAnalysis.totalEscalations > 0 && (
        <Card sx={{ p: 3, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAwesomeRoundedIcon sx={{ color: muiTheme.palette.primary.main }} />
              Escalation Trigger Diagnostics: Why Did You Size Up?
            </Typography>
            <Tooltip
              title="Answers the psychological question: When you increased lot size, was it done systematically after a WIN (compounding) or emotionally after a LOSS (revenge)?"
              arrow
            >
              <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
            </Tooltip>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Analyzes whether sizing up after a WIN (compounding) vs sizing up after a LOSS (revenge Martingale) was more successful. Click either box to inspect trades.
          </Typography>

          <Grid container spacing={2}>
            {/* Rational Compounding */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Tooltip
                title="Increasing lot size after a WIN is healthy capital expansion. Click to inspect compounding trades."
                arrow
              >
                <Box
                  onClick={() => {
                    const compTradeIds = progression.filter((p) => p.isEscalation && !p.isRevengeEscalation).map((p) => p.tradeId);
                    if (onDrillDown && compTradeIds.length > 0) {
                      onDrillDown(
                        { kind: 'TRADES', tradeIds: compTradeIds },
                        `Compounding Sizing Trades (${compTradeIds.length} trades)`
                      );
                    }
                  }}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: '#10B981',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                    },
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
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      Inspect {triggerAnalysis.compoundingEscalations} Trades <ArrowForwardRoundedIcon sx={{ fontSize: 12 }} />
                    </Typography>
                  </Box>
                </Box>
              </Tooltip>
            </Grid>

            {/* Revenge Martingale Escalation */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Tooltip
                title="Increasing lot size after a LOSS is an emotional Martingale trap. Click to inspect revenge trades."
                arrow
              >
                <Box
                  onClick={() => {
                    const revTradeIds = progression.filter((p) => p.isRevengeEscalation).map((p) => p.tradeId);
                    if (onDrillDown && revTradeIds.length > 0) {
                      onDrillDown(
                        { kind: 'TRADES', tradeIds: revTradeIds },
                        `Revenge Escalation Trades (${revTradeIds.length} trades)`
                      );
                    }
                  }}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    cursor: (triggerAnalysis?.revengeEscalations ?? 0) > 0 ? 'pointer' : 'help',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: '#EF4444',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                    },
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
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      Inspect {triggerAnalysis.revengeEscalations} Trades <ArrowForwardRoundedIcon sx={{ fontSize: 12 }} />
                    </Typography>
                  </Box>
                </Box>
              </Tooltip>
            </Grid>
          </Grid>
        </Card>
      )}
    </Box>
  );
}
