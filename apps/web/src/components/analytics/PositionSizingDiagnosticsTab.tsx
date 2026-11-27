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
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import WhatshotRoundedIcon from '@mui/icons-material/WhatshotRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';

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
  const [postLossSubTab, setPostLossSubTab] = useState<'OVERVIEW' | 'SIMULATION' | 'PAIRS'>('OVERVIEW');

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
  const postLossReport = data?.postLossReport;

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

      {/* Post-Loss Sizing Escalation & Revenge Martingale Report */}
      <Card sx={{ p: 3, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PsychologyRoundedIcon sx={{ color: '#EF4444', fontSize: 24 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              Post-Loss Sizing Escalation &amp; Revenge Martingale Report
            </Typography>
            <Tooltip
              title="Diagnoses whether you increase position size after losing trades (Martingale tilt pattern), calculates the exact monetary damage destroyed by sizing up, measures how fast you re-entered, and simulates your account equity if you had maintained disciplined flat sizing."
              arrow
            >
              <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {(postLossReport?.escalationCount ?? 0) === 0 ? (
              <Chip
                icon={<CheckCircleRoundedIcon sx={{ fontSize: 14 }} />}
                label="Zero Post-Loss Sizing Tilt (100% Sizing Discipline)"
                size="small"
                color="success"
                sx={{ fontWeight: 700, fontSize: '0.75rem' }}
              />
            ) : (
              <Chip
                icon={<WarningAmberRoundedIcon sx={{ fontSize: 14 }} />}
                label={`${postLossReport?.escalationCount} Post-Loss Upsized Trades Detected`}
                size="small"
                color="error"
                sx={{ fontWeight: 800, fontSize: '0.75rem' }}
              />
            )}
          </Box>
        </Box>

        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
          Investigates your sizing behavior specifically following a loss. In trading psychology and prop challenges, sizing up after losses is the single leading trigger of catastrophic maximum daily drawdown breaches.
        </Typography>

        {/* Executive Split: Compounding (After Win) vs Revenge (After Loss) */}
        {triggerAnalysis && triggerAnalysis.totalEscalations > 0 && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Rational Compounding */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Tooltip
                title="Increasing lot size after a WIN is rational capital expansion. Click to inspect compounding trades."
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
                    Systematic expansion: Scaling up during positive edge execution or from an earned profit buffer.
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
                    Emotional tilt trap: Escalating size to recoup the previous loss quickly in fewer market ticks.
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
        )}

        {/* Sub-Navigation Tabs */}
        {postLossReport && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2.5, pb: 1.5, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
            <ButtonGroup size="small" variant="outlined">
              <Button
                variant={postLossSubTab === 'OVERVIEW' ? 'contained' : 'outlined'}
                onClick={() => setPostLossSubTab('OVERVIEW')}
                startIcon={<TuneRoundedIcon sx={{ fontSize: 16 }} />}
                sx={{ fontWeight: 700, fontSize: '0.75rem' }}
              >
                Multipliers &amp; Latency
              </Button>
              <Button
                variant={postLossSubTab === 'SIMULATION' ? 'contained' : 'outlined'}
                onClick={() => setPostLossSubTab('SIMULATION')}
                startIcon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
                sx={{ fontWeight: 700, fontSize: '0.75rem' }}
              >
                What-If Equity Simulation
              </Button>
              <Button
                variant={postLossSubTab === 'PAIRS' ? 'contained' : 'outlined'}
                onClick={() => setPostLossSubTab('PAIRS')}
                startIcon={<CompareArrowsRoundedIcon sx={{ fontSize: 16 }} />}
                sx={{ fontWeight: 700, fontSize: '0.75rem' }}
              >
                Paired Trade Audit Ledger ({postLossReport.tradePairs.length})
              </Button>
            </ButtonGroup>

            {/* Quick drift summary chips */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {postLossReport.maxCascadeStreak >= 2 && (
                <Tooltip title="Longest streak of consecutive losses where position size was repeatedly increased" arrow>
                  <Chip
                    icon={<WhatshotRoundedIcon sx={{ fontSize: 14 }} />}
                    label={`Max Cascade Streak: ${postLossReport.maxCascadeStreak}`}
                    size="small"
                    color="error"
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                </Tooltip>
              )}
              {postLossReport.assetHoppingCount > 0 && (
                <Tooltip title="Number of times you switched to a different instrument right after a loss to chase volatility" arrow>
                  <Chip
                    label={`Asset Hopping: ${postLossReport.assetHoppingCount}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                </Tooltip>
              )}
              {postLossReport.directionFlippingCount > 0 && (
                <Tooltip title="Number of times you immediately flipped trade direction (Long to Short or Short to Long) with increased size" arrow>
                  <Chip
                    label={`Direction Flips: ${postLossReport.directionFlippingCount}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                </Tooltip>
              )}
            </Box>
          </Box>
        )}

        {/* SUB-VIEW 1: OVERVIEW (Multipliers & Latency) */}
        {postLossReport && postLossSubTab === 'OVERVIEW' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 4 Metric Cards */}
            <Grid container spacing={2}>
              {/* Card 1: Post-Loss Escalation Rate */}
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Post-Loss Escalation Rate
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      my: 0.5,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: postLossReport.escalationRate > 20 ? '#EF4444' : postLossReport.escalationRate > 10 ? '#F59E0B' : '#10B981',
                    }}
                  >
                    {postLossReport.escalationRate}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                    {postLossReport.escalationCount} of {postLossReport.totalLossTrades} losses were followed by a size increase
                  </Typography>
                </Card>
              </Grid>

              {/* Card 2: Sizing Alpha Deficit */}
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Cost of Upsizing vs Flat
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      my: 0.5,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: postLossReport.counterfactualCapitalSaved > 0 ? '#EF4444' : '#10B981',
                    }}
                  >
                    {postLossReport.counterfactualCapitalSaved > 0
                      ? `-${formatCurrency(postLossReport.counterfactualCapitalSaved, currencySymbol)}`
                      : '+$0.00'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                    {postLossReport.counterfactualCapitalSaved > 0
                      ? 'Capital destroyed specifically by sizing up after losses'
                      : 'Zero monetary damage detected from post-loss sizing'}
                  </Typography>
                </Card>
              </Grid>

              {/* Card 3: Revenge Win Rate vs Baseline */}
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Post-Loss Win Rate
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      my: 0.5,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: postLossReport.escalationWinRate < postLossReport.baselineWinRate ? '#EF4444' : '#10B981',
                    }}
                  >
                    {postLossReport.escalationWinRate}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                    Baseline Win Rate: {postLossReport.baselineWinRate}%{' '}
                    {postLossReport.escalationWinRate < postLossReport.baselineWinRate && (
                      <span style={{ color: '#EF4444', fontWeight: 700 }}>
                        (-{(postLossReport.baselineWinRate - postLossReport.escalationWinRate).toFixed(1)}% drop)
                      </span>
                    )}
                  </Typography>
                </Card>
              </Grid>

              {/* Card 4: Average Escalation Multiplier */}
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
                    Avg Sizing Multiplier
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      my: 0.5,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: postLossReport.avgMultiplier >= 2.0 ? '#EF4444' : '#F59E0B',
                    }}
                  >
                    {postLossReport.avgMultiplier}x
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                    Peak size jump: <strong>{postLossReport.maxMultiplier}x</strong> previous trade quantity
                  </Typography>
                </Card>
              </Grid>
            </Grid>

            {/* Sizing Multiplier Tiers Table */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LayersRoundedIcon sx={{ fontSize: 18, color: muiTheme.palette.primary.main }} />
                Sizing Escalation Multiplier Breakdown: How Much Did You Size Up?
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                Categorizes trades by the multiplier applied to the losing trade's quantity (Quantity<sub>upsized</sub> / Quantity<sub>loss</sub>).
              </Typography>

              <Card sx={{ borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Escalation Category</TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Multiplier Range</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Trades</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Win Rate</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Net P&amp;L</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Avg P&amp;L</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {postLossReport.multiplierTiers.map((tier) => {
                      const isNegative = tier.netPnL < 0;
                      return (
                        <TableRow key={tier.tierKey} hover>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor:
                                    tier.tierKey === 'EXTREME_BLOWOUT'
                                      ? '#DC2626'
                                      : tier.tierKey === 'MARTINGALE_2X'
                                      ? '#EF4444'
                                      : tier.tierKey === 'AGGRESSIVE'
                                      ? '#F59E0B'
                                      : '#3B82F6',
                                }}
                              />
                              {tier.label}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.75rem', color: 'text.secondary' }}>
                            {tier.multiplierRange}
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                            {tier.count}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={`${tier.winRate}%`}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.6875rem',
                                fontWeight: 800,
                                backgroundColor: tier.winRate >= 50 ? alpha('#10B981', 0.15) : alpha('#EF4444', 0.15),
                                color: tier.winRate >= 50 ? '#10B981' : '#EF4444',
                              }}
                            />
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 800,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: isNegative ? '#EF4444' : '#10B981',
                            }}
                          >
                            {tier.netPnL >= 0 ? '+' : ''}{formatCurrency(tier.netPnL, currencySymbol)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: tier.avgPnL >= 0 ? '#10B981' : '#EF4444',
                              fontSize: '0.75rem',
                            }}
                          >
                            {tier.avgPnL >= 0 ? '+' : ''}{formatCurrency(tier.avgPnL, currencySymbol)}
                          </TableCell>
                          <TableCell align="center">
                            {tier.count > 0 ? (
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => {
                                  if (onDrillDown && tier.tradeIds.length > 0) {
                                    onDrillDown(
                                      { kind: 'TRADES', tradeIds: tier.tradeIds },
                                      `${tier.label} Trades (${tier.count} trades)`
                                    );
                                  }
                                }}
                                sx={{ textTransform: 'none', fontSize: '0.6875rem', fontWeight: 700, p: 0.5 }}
                              >
                                Inspect →
                              </Button>
                            ) : (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>—</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </Box>

            {/* Time-to-Revenge Latency Breakdown */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeRoundedIcon sx={{ fontSize: 18, color: muiTheme.palette.primary.main }} />
                Time-to-Revenge Cooldown Latency: How Fast Did You Re-Enter?
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                Measures elapsed time between closing a loss and entering the next upsized trade. Trades executed within 15 minutes of a loss almost always suffer lower win rates due to emotional adrenaline.
              </Typography>

              <Grid container spacing={1.5}>
                {postLossReport.latencyBuckets.map((bucket) => {
                  const isFlash = bucket.bucketKey === 'FLASH_REVENGE';
                  const isSimmering = bucket.bucketKey === 'SIMMERING_TILT';
                  return (
                    <Grid key={bucket.bucketKey} size={{ xs: 12, sm: 6, md: 3 }}>
                      <Box
                        onClick={() => {
                          if (onDrillDown && bucket.tradeIds.length > 0) {
                            onDrillDown(
                              { kind: 'TRADES', tradeIds: bucket.tradeIds },
                              `${bucket.label} Trades (${bucket.count} trades)`
                            );
                          }
                        }}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: `1px solid ${
                            isFlash ? 'rgba(239, 68, 68, 0.4)' : isSimmering ? 'rgba(245, 158, 11, 0.4)' : muiTheme.palette.divider
                          }`,
                          backgroundColor: isFlash
                            ? isDark
                              ? 'rgba(239, 68, 68, 0.06)'
                              : 'rgba(239, 68, 68, 0.03)'
                            : isSimmering
                            ? isDark
                              ? 'rgba(245, 158, 11, 0.06)'
                              : 'rgba(245, 158, 11, 0.03)'
                            : undefined,
                          cursor: bucket.count > 0 ? 'pointer' : 'default',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          transition: 'all 0.15s ease',
                          '&:hover': bucket.count > 0 ? { transform: 'translateY(-2px)' } : undefined,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ fontWeight: 800 }}>
                            {bucket.label}
                          </Typography>
                          <Chip
                            label={`${bucket.count} trades`}
                            size="small"
                            sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            Win Rate: <strong>{bucket.winRate}%</strong>
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 800,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: bucket.netPnL >= 0 ? '#10B981' : '#EF4444',
                              fontSize: '0.8125rem',
                            }}
                          >
                            {bucket.netPnL >= 0 ? '+' : ''}{formatCurrency(bucket.netPnL, currencySymbol)}
                          </Typography>
                        </Box>
                        {bucket.count > 0 && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', textAlign: 'right' }}>
                            Inspect trades →
                          </Typography>
                        )}
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          </Box>
        )}

        {/* SUB-VIEW 2: COUNTERFACTUAL WHAT-IF EQUITY SIMULATION */}
        {postLossReport && postLossSubTab === 'SIMULATION' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Alert
              severity={postLossReport.counterfactualCapitalSaved > 0 ? 'warning' : 'success'}
              icon={postLossReport.counterfactualCapitalSaved > 0 ? <WarningAmberRoundedIcon /> : <CheckCircleRoundedIcon />}
              sx={{ borderRadius: 2 }}
            >
              {postLossReport.counterfactualCapitalSaved > 0 ? (
                <span>
                  <strong>Counterfactual Finding:</strong> By maintaining disciplined flat sizing following every loss, your account equity would be{' '}
                  <strong style={{ color: '#10B981' }}>+{formatCurrency(postLossReport.counterfactualCapitalSaved, currencySymbol)} higher</strong>{' '}
                  today. Sizing up after losses added zero positive alpha.
                </span>
              ) : (
                <span>
                  <strong>Pristine Discipline:</strong> Your post-loss sizing behavior has not subtracted value compared to disciplined flat sizing.
                </span>
              )}
            </Alert>

            <Box sx={{ height: 320, width: '100%', mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={postLossReport.counterfactualCurve} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="tradeIndex"
                    tick={{ fontSize: 11, fill: muiTheme.palette.text.secondary }}
                    label={{ value: 'Trade Number', position: 'insideBottom', offset: -10, fontSize: 11, fill: muiTheme.palette.text.secondary }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: muiTheme.palette.text.secondary }}
                    tickFormatter={(v) => formatCurrency(v, currencySymbol)}
                  />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      const diff = Number((d.disciplinedCumulativePnL - d.actualCumulativePnL).toFixed(2));
                      return (
                        <Paper sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${muiTheme.palette.divider}`, minWidth: 180 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 0.5 }}>
                            Trade #{d.tradeIndex} ({d.date})
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#EF4444', fontWeight: 700, fontSize: '0.75rem' }}>
                            Actual Realized: {formatCurrency(d.actualCumulativePnL, currencySymbol)}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#10B981', fontWeight: 700, fontSize: '0.75rem' }}>
                            Disciplined (Flat): {formatCurrency(d.disciplinedCumulativePnL, currencySymbol)}
                          </Typography>
                          <Divider sx={{ my: 0.5 }} />
                          <Typography variant="caption" sx={{ fontWeight: 800, color: diff >= 0 ? '#10B981' : '#EF4444' }}>
                            Delta: {diff >= 0 ? '+' : ''}{formatCurrency(diff, currencySymbol)}
                          </Typography>
                        </Paper>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 10 }} />
                  <ReferenceLine y={0} stroke={muiTheme.palette.text.secondary} strokeDasharray="3 3" opacity={0.3} />
                  <Line
                    type="monotone"
                    dataKey="actualCumulativePnL"
                    name="Actual Realized Equity"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="disciplinedCumulativePnL"
                    name="Disciplined Flat Sizing (What-If)"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        )}

        {/* SUB-VIEW 3: PAIRED TRADE AUDIT LEDGER */}
        {postLossReport && postLossSubTab === 'PAIRS' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CompareArrowsRoundedIcon sx={{ fontSize: 18, color: muiTheme.palette.primary.main }} />
              Paired Trade Audit Ledger: Losing Trade → Subsequent Upsized Trade
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              Every historical instance where a loss was directly followed by an increased lot size. Click any row's inspect button to open both trades.
            </Typography>

            {postLossReport.tradePairs.length === 0 ? (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                No post-loss upsized trade pairs detected in your selected filter scope. Excellent discipline!
              </Alert>
            ) : (
              <Card sx={{ borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Losing Trade (Before)</TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Transition Dynamics</TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Upsized Trade (After)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>Inspect Pair</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {postLossReport.tradePairs.map((pair, idx) => {
                      const isUpsizedWin = pair.upsizedPnL > 0;
                      return (
                        <TableRow key={`${pair.lossTradeId}-${pair.upsizedTradeId}-${idx}`} hover>
                          {/* Losing Trade Details */}
                          <TableCell sx={{ fontSize: '0.8125rem' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                                  {pair.lossSymbol}
                                </Typography>
                                <Chip
                                  label={pair.lossDirection || 'N/A'}
                                  size="small"
                                  sx={{ height: 16, fontSize: '0.625rem', fontWeight: 800 }}
                                />
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  {pair.lossQuantity} Lots
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                                  {formatCurrency(pair.lossPnL, currencySymbol)}
                                </Typography>
                                {pair.lossRMultiple !== undefined && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    ({pair.lossRMultiple > 0 ? '+' : ''}{pair.lossRMultiple}R)
                                  </Typography>
                                )}
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                                  • {pair.lossDate}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>

                          {/* Transition Dynamics */}
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                <Chip
                                  label={`${pair.sizingMultiplier}x Jump`}
                                  size="small"
                                  color={pair.sizingMultiplier >= 2.0 ? 'error' : 'warning'}
                                  sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 800 }}
                                />
                                {pair.cooldownMinutes !== undefined && (
                                  <Chip
                                    icon={<FlashOnRoundedIcon sx={{ fontSize: 12 }} />}
                                    label={`${pair.cooldownMinutes}m cooldown`}
                                    size="small"
                                    variant="outlined"
                                    color={pair.cooldownMinutes < 5 ? 'error' : 'default'}
                                    sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }}
                                  />
                                )}
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                {pair.isConsecutiveCascade && (
                                  <Chip
                                    label={`Cascade L${pair.cascadeDepth}`}
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    sx={{ height: 18, fontSize: '0.625rem', fontWeight: 800 }}
                                  />
                                )}
                                {pair.directionFlip && (
                                  <Chip
                                    label="Direction Flip"
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.625rem' }}
                                  />
                                )}
                                {pair.assetHopped && (
                                  <Chip
                                    label="Asset Hop"
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.625rem' }}
                                  />
                                )}
                              </Box>
                            </Box>
                          </TableCell>

                          {/* Upsized Trade Details */}
                          <TableCell sx={{ fontSize: '0.8125rem' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                                  {pair.upsizedSymbol}
                                </Typography>
                                <Chip
                                  label={pair.upsizedDirection || 'N/A'}
                                  size="small"
                                  sx={{ height: 16, fontSize: '0.625rem', fontWeight: 800 }}
                                />
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                  {pair.upsizedQuantity} Lots
                                </Typography>
                                <Chip
                                  label={isUpsizedWin ? 'WIN' : 'LOSS'}
                                  size="small"
                                  color={isUpsizedWin ? 'success' : 'error'}
                                  sx={{ height: 16, fontSize: '0.625rem', fontWeight: 800 }}
                                />
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 800,
                                    fontFamily: `'JetBrains Mono', monospace`,
                                    color: isUpsizedWin ? '#10B981' : '#EF4444',
                                  }}
                                >
                                  {isUpsizedWin ? '+' : ''}{formatCurrency(pair.upsizedPnL, currencySymbol)}
                                </Typography>
                                {pair.upsizedRMultiple !== undefined && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    ({pair.upsizedRMultiple > 0 ? '+' : ''}{pair.upsizedRMultiple}R)
                                  </Typography>
                                )}
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                                  • {pair.upsizedDate}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>

                          {/* Inspect Action */}
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                if (onDrillDown) {
                                  onDrillDown(
                                    { kind: 'TRADES', tradeIds: [pair.lossTradeId, pair.upsizedTradeId] },
                                    `Post-Loss Sizing Pair (${pair.lossSymbol} → ${pair.upsizedSymbol})`
                                  );
                                }
                              }}
                              sx={{ textTransform: 'none', fontSize: '0.6875rem', fontWeight: 700, p: 0.5, px: 1 }}
                            >
                              Inspect Pair →
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </Box>
        )}
      </Card>
    </Box>
  );
}
