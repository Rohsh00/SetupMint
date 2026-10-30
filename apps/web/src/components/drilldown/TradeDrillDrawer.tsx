import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import CollectionsRoundedIcon from '@mui/icons-material/CollectionsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';

import { useTradeDrilldown } from '../../context/TradeDrillContext.js';
import { api } from '../../lib/api.js';
import { formatCurrency, formatR, formatPercent, formatDate, formatDateTime } from '../../lib/utils.js';
import { TradeInstrumentBadge } from '../trades/TradeInstrumentBadge.js';
import { TradeFormModal } from '../trades/TradeFormModal.js';
import { QuickCloseTradeDialog } from '../trades/QuickCloseTradeDialog.js';
import { ChartImageViewerDialog } from '../trades/attachments/ChartImageViewerDialog.js';

export function TradeDrillDrawer() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { isOpen, descriptor, activeTradeId, closeDrill, setActiveTradeId } = useTradeDrilldown();

  const [editModalTradeId, setEditModalTradeId] = useState<string | null>(null);
  const [quickCloseTrade, setQuickCloseTrade] = useState<any | null>(null);
  const [screenshotViewerTrade, setScreenshotViewerTrade] = useState<any | null>(null);

  // Fetch drilldown trades & aggregate
  const {
    data: drillData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['drilldown', descriptor],
    queryFn: () => api.trades.drilldown({ descriptor: descriptor!, limit: 200 }),
    enabled: Boolean(isOpen && descriptor),
    staleTime: 30 * 1000,
  });

  const trades = useMemo(() => drillData?.trades || [], [drillData]);
  const aggregate = drillData?.aggregate;
  const totalCount = drillData?.totalCount ?? trades.length;

  // Find active trade
  const activeTrade = useMemo(() => {
    if (!activeTradeId) return null;
    return trades.find((t: any) => t.id === activeTradeId) || null;
  }, [trades, activeTradeId]);

  const activeIndex = useMemo(() => {
    if (!activeTradeId) return -1;
    return trades.findIndex((t: any) => t.id === activeTradeId);
  }, [trades, activeTradeId]);

  // Navigate prev/next trade in active set
  const handlePrevTrade = useCallback(() => {
    if (activeIndex > 0) {
      setActiveTradeId(trades[activeIndex - 1].id);
    }
  }, [activeIndex, trades, setActiveTradeId]);

  const handleNextTrade = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < trades.length - 1) {
      setActiveTradeId(trades[activeIndex + 1].id);
    }
  }, [activeIndex, trades, setActiveTradeId]);

  // Keyboard navigation when single-trade view is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hotkeys when typing in modal inputs
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'Escape') {
        if (editModalTradeId || quickCloseTrade || screenshotViewerTrade) return;
        if (activeTradeId && trades.length > 1) {
          setActiveTradeId(null);
        } else {
          closeDrill();
        }
      } else if (activeTradeId && trades.length > 1) {
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k') {
          e.preventDefault();
          handlePrevTrade();
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'j') {
          e.preventDefault();
          handleNextTrade();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    activeTradeId,
    trades.length,
    activeIndex,
    handlePrevTrade,
    handleNextTrade,
    closeDrill,
    setActiveTradeId,
    editModalTradeId,
    quickCloseTrade,
    screenshotViewerTrade,
  ]);

  // Build readable explanation chips from descriptor
  const explanationChips = useMemo(() => {
    if (!descriptor) return [];
    const list: Array<{ label: string; color?: 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' }> = [];

    if (descriptor.kind === 'TRADE') {
      list.push({ label: `Trade ID: ${descriptor.tradeId.slice(-6)}`, color: 'primary' });
    } else if (descriptor.kind === 'TRADES') {
      list.push({ label: `${descriptor.tradeIds.length} Targeted Trades`, color: 'primary' });
    } else if (descriptor.kind === 'FILTER') {
      const f = descriptor.filter;
      if (f.symbol) list.push({ label: `Symbol: ${f.symbol}`, color: 'info' });
      if (f.outcome) list.push({ label: `Outcome: ${f.outcome}`, color: f.outcome === 'WIN' ? 'success' : f.outcome === 'LOSS' ? 'error' : 'default' });
      if (f.date) list.push({ label: `Date: ${f.date}`, color: 'secondary' });
      if (f.dateRange) list.push({ label: `Range: ${f.dateRange}`, color: 'secondary' });
      if (f.weekday) list.push({ label: `Day: ${f.weekday}`, color: 'info' });
      if (f.session) list.push({ label: `Session: ${f.session}`, color: 'info' });
      if (f.emotion) list.push({ label: `Emotion: ${f.emotion}`, color: 'warning' });
      if (f.mistakeTag) list.push({ label: `Mistake: ${f.mistakeTag.replace(/_/g, ' ')}`, color: 'error' });
      if (f.disciplineScore !== undefined) list.push({ label: `Discipline: ${f.disciplineScore}/5`, color: 'primary' });
      if (f.direction) list.push({ label: `Direction: ${f.direction}`, color: f.direction === 'LONG' ? 'success' : 'error' });
      if (f.assetClass) list.push({ label: `Asset: ${f.assetClass}`, color: 'default' });
      if (f.variantKey) list.push({ label: `Variant: ${f.variantKey}`, color: 'primary' });
      if (f.search) list.push({ label: `Search: "${f.search}"`, color: 'default' });
    }
    return list;
  }, [descriptor]);

  const pnlColor = aggregate && aggregate.netPnL > 0 ? 'success.main' : aggregate && aggregate.netPnL < 0 ? 'error.main' : 'text.primary';

  return (
    <>
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={isOpen}
        onClose={closeDrill}
        sx={{
          '& .MuiDrawer-paper': {
            width: isMobile ? '100%' : 620,
            maxWidth: '100%',
            height: isMobile ? '88vh' : '100%',
            borderTopLeftRadius: isMobile ? 16 : 0,
            borderTopRightRadius: isMobile ? 16 : 0,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: isDark
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          },
        }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            p: 2.5,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {activeTradeId && trades.length > 1 && (
                <IconButton
                  size="small"
                  onClick={() => setActiveTradeId(null)}
                  sx={{ mr: 0.5, bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}
                  title="Back to all drilldown trades"
                >
                  <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
              )}
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                {activeTradeId ? 'Trade Details' : descriptor?.label || 'Trade Drilldown'}
              </Typography>
              <Chip
                label={`${totalCount} ${totalCount === 1 ? 'trade' : 'trades'}`}
                size="small"
                variant="outlined"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderColor: 'divider',
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Refresh subset">
                <IconButton size="small" onClick={() => refetch()} disabled={isLoading}>
                  <RefreshRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={closeDrill} sx={{ color: 'text.secondary' }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Explanation Chips */}
          {explanationChips.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {explanationChips.map((c, idx) => (
                <Chip
                  key={idx}
                  label={c.label}
                  size="small"
                  color={c.color || 'default'}
                  sx={{ fontSize: '0.72rem', height: 22, fontWeight: 500 }}
                />
              ))}
            </Box>
          )}

          {/* Reconciled Aggregate Strip (Always mathematically verified via Decimal.js) */}
          {aggregate && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 2,
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1.5,
                textAlign: 'center',
              }}
            >
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Net P&L
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    color: pnlColor,
                  }}
                >
                  {formatCurrency(aggregate.netPnL)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Win Rate
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}
                >
                  {formatPercent(aggregate.winRate)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Avg R
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    color: aggregate.avgR && aggregate.avgR > 0 ? 'success.main' : aggregate.avgR && aggregate.avgR < 0 ? 'error.main' : 'text.primary',
                  }}
                >
                  {formatR(aggregate.avgR)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Total Costs
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: 'text.secondary' }}
                >
                  {formatCurrency(aggregate.totalCosts)}
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>

        {/* Drawer Body */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Skeleton variant="rectangular" height={90} sx={{ borderRadius: 2 }} />
              <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
              <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
            </Box>
          ) : isError ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            >
              Failed to resolve drilldown trades. Please retry.
            </Alert>
          ) : trades.length === 0 ? (
            <Box
              sx={{
                py: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 1.5,
              }}
            >
              <InsightsRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                No Trades in this Analytic Subset
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 360 }}>
                No closed trades match the requested filters or event markers for this account.
              </Typography>
            </Box>
          ) : activeTrade ? (
            /* =========================================================================
             * SINGLE TRADE VIEW
             * ========================================================================= */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Prev / Next Navigation Toolbar */}
              {trades.length > 1 && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Button
                    size="small"
                    startIcon={<ChevronLeftRoundedIcon />}
                    onClick={handlePrevTrade}
                    disabled={activeIndex <= 0}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Previous (k)
                  </Button>
                  <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.secondary' }}>
                    {activeIndex + 1} of {trades.length}
                  </Typography>
                  <Button
                    size="small"
                    endIcon={<ChevronRightRoundedIcon />}
                    onClick={handleNextTrade}
                    disabled={activeIndex >= trades.length - 1}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Next (j)
                  </Button>
                </Box>
              )}

              {/* Trade Identity Header Card */}
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <TradeInstrumentBadge trade={activeTrade as any} />
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                        {activeTrade.symbol}
                      </Typography>
                      <Chip
                        label={activeTrade.direction}
                        size="small"
                        color={activeTrade.direction === 'LONG' ? 'success' : 'error'}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20 }}
                      />
                      <Chip
                        label={activeTrade.calculated?.outcome || activeTrade.status}
                        size="small"
                        color={
                          activeTrade.calculated?.outcome === 'WIN'
                            ? 'success'
                            : activeTrade.calculated?.outcome === 'LOSS'
                            ? 'error'
                            : 'default'
                        }
                        sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20 }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                      {formatDateTime(activeTrade.tradeDate || activeTrade.entryTime)} • {activeTrade.exchange} ({activeTrade.marketSegment})
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ textAlign: 'right' }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 700,
                      color:
                        (activeTrade.calculated?.netPnL || 0) > 0
                          ? 'success.main'
                          : (activeTrade.calculated?.netPnL || 0) < 0
                          ? 'error.main'
                          : 'text.primary',
                    }}
                  >
                    {formatCurrency(activeTrade.calculated?.netPnL)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 600,
                      color:
                        (activeTrade.calculated?.realizedRMultiple || 0) > 0
                          ? 'success.main'
                          : (activeTrade.calculated?.realizedRMultiple || 0) < 0
                          ? 'error.main'
                          : 'text.secondary',
                    }}
                  >
                    {formatR(activeTrade.calculated?.realizedRMultiple)}
                  </Typography>
                </Box>
              </Paper>

              {/* Financials & Prices Matrix */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ReceiptLongRoundedIcon fontSize="small" color="primary" /> Price & Execution
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Entry Price
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {formatCurrency(activeTrade.calculated?.averageEntryPrice || (activeTrade as any).simpleExecution?.entryPrice, 'INR')}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Exit Price
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {formatCurrency(activeTrade.calculated?.averageExitPrice, 'INR')}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Quantity
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {activeTrade.calculated?.closedQuantity || (activeTrade as any).simpleExecution?.quantity || 0}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Stop Loss
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: 'error.main' }}>
                      {formatCurrency(activeTrade.risk?.initialStopLoss, 'INR')}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Gross P&L
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {formatCurrency(activeTrade.calculated?.grossPnL)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Total Charges
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {formatCurrency(activeTrade.calculated?.totalCosts)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Planned Risk (1R)
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {formatCurrency(activeTrade.risk?.riskBudgetAmount || activeTrade.risk?.estimatedRiskAmount)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Holding Time
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {activeTrade.calculated?.holdingTimeMinutes !== undefined
                        ? `${activeTrade.calculated.holdingTimeMinutes} min`
                        : '—'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Excursions & Quality */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InsightsRoundedIcon fontSize="small" color="primary" /> Excursion & Quality
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Max Favorable (MFE)
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: 'success.main' }}>
                      {formatR(activeTrade.calculated?.excursion?.mfeR)} ({formatCurrency(activeTrade.calculated?.excursion?.mfeAmount, 'INR')})
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Max Adverse (MAE)
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: 'error.main' }}>
                      {formatR(activeTrade.calculated?.excursion?.maeR)} ({formatCurrency(activeTrade.calculated?.excursion?.maeAmount, 'INR')})
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Exit Efficiency
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                      {formatPercent(activeTrade.calculated?.excursion?.exitEfficiency)}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Psychology & Rules */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PsychologyRoundedIcon fontSize="small" color="primary" /> Psychology & Discipline
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Discipline Rating
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                      <Chip
                        label={`${(activeTrade.psychology as any)?.disciplineScore ?? (activeTrade.psychology as any)?.disciplineRating ?? 4} / 5`}
                        size="small"
                        color={
                          ((activeTrade.psychology as any)?.disciplineScore ?? (activeTrade.psychology as any)?.disciplineRating ?? 4) >= 4
                            ? 'success'
                            : 'warning'
                        }
                        sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
                      />
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Rules Followed
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
                      {activeTrade.psychology?.rulesFollowed === false ? (
                        <Chip label="Violated Rules" size="small" color="error" sx={{ height: 22, fontSize: '0.72rem' }} />
                      ) : (
                        <Chip label="Followed" size="small" color="success" sx={{ height: 22, fontSize: '0.72rem' }} />
                      )}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Emotion
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
                      {activeTrade.psychology?.emotionBefore || activeTrade.psychology?.emotionDuring || (activeTrade.psychology as any)?.emotionalState || 'Calm'}
                    </Typography>
                  </Grid>

                  {activeTrade.psychology?.mistakes && activeTrade.psychology.mistakes.length > 0 && (
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                        Mistakes Tagged
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {activeTrade.psychology.mistakes.map((m: string, i: number) => (
                          <Chip key={i} label={m.replace(/_/g, ' ')} size="small" color="error" variant="outlined" sx={{ height: 22, fontSize: '0.72rem' }} />
                        ))}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Paper>

              {/* Screenshots Gallery Strip */}
              {activeTrade.attachments && activeTrade.attachments.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CollectionsRoundedIcon fontSize="small" color="primary" /> Screenshots ({activeTrade.attachments.length})
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
                    {activeTrade.attachments.map((att: any, idx: number) => (
                      <Box
                        key={att.id || idx}
                        onClick={() => setScreenshotViewerTrade({ attachments: activeTrade.attachments, index: idx, symbol: activeTrade.symbol })}
                        sx={{
                          width: 120,
                          height: 80,
                          borderRadius: 1.5,
                          overflow: 'hidden',
                          border: 1,
                          borderColor: 'divider',
                          cursor: 'pointer',
                          flexShrink: 0,
                          '&:hover': { opacity: 0.85, transform: 'scale(1.02)' },
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <img
                          src={api.attachments.resolveAttachmentUrl(att)}
                          alt={att.title || att.caption || 'Chart Screenshot'}
                          crossOrigin="use-credentials"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </Box>
                    ))}
                  </Box>
                </Paper>
              )}

              {/* Quick Actions Footer */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 1, pb: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  startIcon={<OpenInNewRoundedIcon />}
                  onClick={() => {
                    closeDrill();
                    navigate(`/trades/${activeTrade.id}`);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, py: 1 }}
                >
                  Open Full Journal Page
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<EditRoundedIcon />}
                  onClick={() => setEditModalTradeId(activeTrade.id)}
                  sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Edit
                </Button>

                {activeTrade.status === 'OPEN' && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<CheckCircleOutlineRoundedIcon />}
                    onClick={() => setQuickCloseTrade(activeTrade)}
                    sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    Quick Close
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            /* =========================================================================
             * MULTI-TRADE LIST VIEW
             * ========================================================================= */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Showing {trades.length} of {totalCount} matching trades. Click any trade to inspect full breakdown:
              </Typography>

              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  maxHeight: 'calc(100vh - 270px)',
                  overflowY: 'auto',
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Symbol</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Side</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>R</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Net P&L</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Outcome</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trades.map((t: any) => {
                      const net = t.calculated?.netPnL ?? 0;
                      const r = t.calculated?.realizedRMultiple;
                      const outcome = t.calculated?.outcome || t.status;

                      return (
                        <TableRow
                          key={t.id}
                          hover
                          onClick={() => setActiveTradeId(t.id)}
                          sx={{
                            cursor: 'pointer',
                            '&:last-child td, &:last-child th': { border: 0 },
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          <TableCell sx={{ fontSize: '0.75rem', fontFamily: '"JetBrains Mono", monospace' }}>
                            {formatDate(t.tradeDate || t.entryTime)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', fontFamily: '"JetBrains Mono", monospace' }}>
                            {t.symbol}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={t.direction}
                              size="small"
                              color={t.direction === 'LONG' ? 'success' : 'error'}
                              sx={{ fontWeight: 700, fontSize: '0.65rem', height: 18 }}
                            />
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontFamily: '"JetBrains Mono", monospace',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              color: r > 0 ? 'success.main' : r < 0 ? 'error.main' : 'text.secondary',
                            }}
                          >
                            {formatR(r)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontFamily: '"JetBrains Mono", monospace',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              color: net > 0 ? 'success.main' : net < 0 ? 'error.main' : 'text.primary',
                            }}
                          >
                            {formatCurrency(net)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={outcome}
                              size="small"
                              color={
                                outcome === 'WIN'
                                  ? 'success'
                                  : outcome === 'LOSS'
                                  ? 'error'
                                  : 'default'
                              }
                              sx={{ fontWeight: 700, fontSize: '0.65rem', height: 18 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      </Drawer>

      {/* Edit Modal (if invoked from drilldown) */}
      {editModalTradeId && (
        <TradeFormModal
          isOpen={Boolean(editModalTradeId)}
          editTradeId={editModalTradeId}
          onClose={() => {
            setEditModalTradeId(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['trades'] });
          }}
        />
      )}

      {/* Quick Close Dialog (if invoked from drilldown) */}
      {quickCloseTrade && (
        <QuickCloseTradeDialog
          open={Boolean(quickCloseTrade)}
          trade={quickCloseTrade}
          onClose={() => setQuickCloseTrade(null)}
          onSuccess={() => {
            setQuickCloseTrade(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['trades'] });
          }}
        />
      )}

      {/* Screenshot Zoom Viewer */}
      {screenshotViewerTrade && (
        <ChartImageViewerDialog
          open={Boolean(screenshotViewerTrade)}
          onClose={() => setScreenshotViewerTrade(null)}
          attachments={screenshotViewerTrade.attachments}
          initialIndex={screenshotViewerTrade.index}
          symbol={screenshotViewerTrade.symbol}
        />
      )}
    </>
  );
}
export default TradeDrillDrawer;
