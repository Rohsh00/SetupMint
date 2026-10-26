import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';

// Recharts
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell as RechartsCell,
} from 'recharts';

import {
  DEFAULT_STOP_R_GRID,
  DEFAULT_TARGET_R_GRID,
  IWhatIfResponse,
  IWhatIfCellResult,
  WhatIfPolicy,
  WhatIfFillModel,
} from '@tradevault/shared';
import { api } from '../../lib/api.js';
import { formatCurrency, formatPercent } from '../../lib/utils.js';
import { HelpHint, WithHelp, DisabledReason } from '../help/index.js';
import { useTradeDrilldown } from '../../context/TradeDrillContext.js';

interface WhatIfSimulatorTabProps {
  accountId?: string;
}

export const WhatIfSimulatorTab: React.FC<WhatIfSimulatorTabProps> = ({ accountId }) => {
  const { openDrill } = useTradeDrilldown();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  // State
  const [viewPolicy, setViewPolicy] = useState<'PESSIMISTIC' | 'OPTIMISTIC' | 'RANGE'>('PESSIMISTIC');
  const [fillModel, setFillModel] = useState<WhatIfFillModel>('GAP_AWARE');
  const [slippageTicks, setSlippageTicks] = useState<number>(0);
  const [excludeManaged, setExcludeManaged] = useState<boolean>(true);
  const [holdoutFraction, setHoldoutFraction] = useState<number>(0.3);
  const [selectedCell, setSelectedCell] = useState<IWhatIfCellResult | null>(null);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Stop & Target Grids
  const stopGrid: (number | null)[] = DEFAULT_STOP_R_GRID as any;
  const targetGrid: (number | null)[] = DEFAULT_TARGET_R_GRID as any;

  // Query
  const {
    data: simData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<IWhatIfResponse>({
    queryKey: [
      'analytics-what-if',
      accountId,
      fillModel,
      slippageTicks,
      excludeManaged,
      holdoutFraction,
    ],
    queryFn: () =>
      api.analytics.whatIf({
        filters: {
          accountId: accountId && accountId !== 'ALL' ? accountId : undefined,
        },
        stopRGrid: stopGrid,
        targetRGrid: targetGrid,
        fillModel,
        slippageTicks,
        resolutionPolicy: 'FINEST_AVAILABLE',
        excludeManagedStopTrades: excludeManaged,
        holdoutFraction,
      }),
  });

  const getCellColor = (meanR: number, nEval: number) => {
    if (nEval < 5) {
      return isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC';
    }
    if (nEval < 30) {
      // Muted color
      if (meanR > 0) return isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.1)';
      if (meanR < 0) return isDark ? 'rgba(244, 63, 94, 0.12)' : 'rgba(244, 63, 94, 0.1)';
      return isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9';
    }
    // Reliable sample (n >= 30)
    if (meanR >= 0.5) return isDark ? '#064E3B' : '#A7F3D0';
    if (meanR >= 0.2) return isDark ? '#065F46' : '#BBF7D0';
    if (meanR > 0) return isDark ? 'rgba(16, 185, 129, 0.25)' : '#DCFCE7';
    if (meanR <= -0.5) return isDark ? '#881337' : '#FECDD3';
    if (meanR <= -0.2) return isDark ? '#9F1239' : '#FFE4E6';
    if (meanR < 0) return isDark ? 'rgba(244, 63, 94, 0.25)' : '#FFF1F2';
    return isDark ? '#1E293B' : '#F1F5F9';
  };

  const getCellTextColor = (meanR: number, nEval: number) => {
    if (nEval < 5) return isDark ? '#64748B' : '#94A3B8';
    if (nEval < 30) return isDark ? '#94A3B8' : '#64748B';
    if (meanR > 0) return isDark ? '#34D399' : '#065F46';
    if (meanR < 0) return isDark ? '#FB7185' : '#9F1239';
    return isDark ? '#E2E8F0' : '#1E293B';
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Controls & Explanation Bar */}
      <Card
        sx={{
          p: 2.5,
          borderRadius: 2.5,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#FFFFFF',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: 2,
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.1rem' }}>
                Stop & Target What-If Simulator
              </Typography>
              <HelpHint hintKey="analytics.whatIf.overlay" size="medium" color="primary" />
            </Box>
            <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
              Honest candle-replay simulation testing hypothetical stops and targets on cached trade snapshots.
            </Typography>
          </Box>

          {/* Action & Toggle Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
            {/* Policy Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small"
                value={viewPolicy}
                exclusive
                onChange={(_, val) => val && setViewPolicy(val)}
                sx={{
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : '#F1F5F9',
                  borderRadius: 2,
                  '& .MuiToggleButton-root': {
                    px: 1.5,
                    py: 0.5,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    border: 'none',
                    borderRadius: '6px !important',
                    '&.Mui-selected': {
                      backgroundColor: `${muiTheme.palette.primary.main} !important`,
                      color: '#FFFFFF !important',
                    },
                  },
                }}
              >
                <ToggleButton value="PESSIMISTIC">Pessimistic</ToggleButton>
                <ToggleButton value="OPTIMISTIC">Optimistic</ToggleButton>
                <ToggleButton value="RANGE">Range [P, O]</ToggleButton>
              </ToggleButtonGroup>
              <HelpHint hintKey="analytics.whatIf.policies" sx={{ ml: 0.5 }} />
            </Box>

            {/* Config Toggle Button */}
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowConfig(!showConfig)}
              startIcon={<TuneRoundedIcon fontSize="small" />}
              sx={{
                borderRadius: 2,
                fontSize: '0.75rem',
                textTransform: 'none',
                borderColor: showConfig ? muiTheme.palette.primary.main : muiTheme.palette.divider,
              }}
            >
              Config
            </Button>

            {/* Recompute Button */}
            <Button
              variant="contained"
              size="small"
              onClick={() => refetch()}
              disabled={isFetching}
              startIcon={<RefreshRoundedIcon fontSize="small" />}
              sx={{
                borderRadius: 2,
                fontSize: '0.75rem',
                textTransform: 'none',
                fontWeight: 600,
                boxShadow: 'none',
              }}
            >
              {isFetching ? 'Simulating...' : 'Recompute'}
            </Button>
          </Box>
        </Box>

        {/* Collapsible Simulation Configuration Drawer/Panel */}
        {showConfig && (
          <Box
            sx={{
              mt: 2.5,
              pt: 2.5,
              borderTop: `1px solid ${muiTheme.palette.divider}`,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 2.5,
            }}
          >
            {/* Fill Model */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary }}>
                  Fill Model
                </Typography>
                <HelpHint hintKey="analytics.whatIf.fillModel" />
              </Box>
              <Select
                size="small"
                fullWidth
                value={fillModel}
                onChange={(e) => setFillModel(e.target.value as any)}
                sx={{ fontSize: '0.8rem', borderRadius: 1.5 }}
              >
                <MenuItem value="GAP_AWARE">Gap-Aware (Adverse Open)</MenuItem>
                <MenuItem value="AT_LEVEL">At-Level (Ideal Fills)</MenuItem>
              </Select>
            </Box>

            {/* Slippage Ticks */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary }}>
                  Adverse Slippage
                </Typography>
                <HelpHint hintKey="analytics.whatIf.slippage" />
              </Box>
              <Select
                size="small"
                fullWidth
                value={slippageTicks}
                onChange={(e) => setSlippageTicks(Number(e.target.value))}
                sx={{ fontSize: '0.8rem', borderRadius: 1.5 }}
              >
                <MenuItem value={0}>0 Ticks (0 pts)</MenuItem>
                <MenuItem value={1}>1 Tick (0.05 pts)</MenuItem>
                <MenuItem value={2}>2 Ticks (0.10 pts)</MenuItem>
                <MenuItem value={5}>5 Ticks (0.25 pts)</MenuItem>
              </Select>
            </Box>

            {/* Holdout Fraction */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary }}>
                  Holdout Split: {Math.round(holdoutFraction * 100)}%
                </Typography>
                <HelpHint hintKey="analytics.whatIf.holdout" />
              </Box>
              <Slider
                size="small"
                value={holdoutFraction}
                min={0.2}
                max={0.5}
                step={0.05}
                onChange={(_, val) => setHoldoutFraction(val as number)}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
              />
            </Box>

            {/* Exclude Managed Stops */}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={excludeManaged}
                    onChange={(e) => setExcludeManaged(e.target.checked)}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                      Exclude Managed Stops
                    </Typography>
                    <HelpHint hintKey="analytics.whatIf.excludeManagedStops" />
                  </Box>
                }
              />
            </Box>
          </Box>
        )}
      </Card>

      {/* Calibration Warning Alert (if agreement < 80%) */}
      {simData?.calibration.calibrationWarning && (
        <Alert
          severity="warning"
          icon={<WarningAmberRoundedIcon />}
          sx={{ borderRadius: 2 }}
          action={
            <HelpHint hintKey="analytics.whatIf.calibration" color="primary" />
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Data Quality Warning: Historical candle replay reproduced only{' '}
            {Math.round(simData.calibration.agreement * 100)}% of actual stop-outs.
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            Tested {simData.calibration.testedCount} trades that stopped out in reality; candle data
            matched {simData.calibration.matchingStopCount}. Timestamps or bar alignments may be imprecise.
          </Typography>
        </Alert>
      )}

      {/* Multiple Comparisons Disclaimer Banner */}
      <Alert
        severity="info"
        variant="outlined"
        sx={{
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.05)' : 'rgba(14, 165, 233, 0.04)',
          borderColor: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(14, 165, 233, 0.2)',
        }}
        action={<HelpHint hintKey="analytics.whatIf.multipleComparisons" color="primary" />}
      >
        <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.45 }}>
          <strong>Multiple Comparisons Notice:</strong> Scanning a 7×7 grid evaluates 49 simultaneous
          hypotheses. Cells badged with <strong>Robust Edge</strong> achieve statistical significance
          via 10,000 paired bootstrap iterations (p &lt; 0.05) and confirmed out-of-sample in the
          holdout window. Do not select non-robust cells.
        </Typography>
      </Alert>

      {/* Baseline Metrics Bar */}
      {simData && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card
              onClick={() =>
                openDrill({
                  kind: 'FILTER',
                  filter: { accountId: accountId && accountId !== 'ALL' ? accountId : undefined },
                  label: 'Evaluable Simulation Trades',
                })
              }
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: muiTheme.palette.primary.main,
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700 }}>
                  Evaluable Trades
                </Typography>
                <HelpHint hintKey="analytics.whatIf.evaluable" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                {simData.scope.nEligible} / {simData.scope.tradesInScope}
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Single-fill, non-managed (click to inspect)
              </Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card
              onClick={() =>
                openDrill({
                  kind: 'FILTER',
                  filter: { accountId: accountId && accountId !== 'ALL' ? accountId : undefined },
                  label: 'What-If Evaluated Trades',
                })
              }
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: muiTheme.palette.primary.main,
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700 }}>
                  Actual Mean R
                </Typography>
                <HelpHint hintKey="metric.rMultiple" />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  mt: 0.5,
                  color: simData.baseline.meanR_actual >= 0 ? '#10B981' : '#F43F5E',
                }}
              >
                {simData.baseline.meanR_actual >= 0 ? '+' : ''}
                {simData.baseline.meanR_actual.toFixed(2)}R
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Same evaluable subset (click to inspect)
              </Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card
              onClick={() =>
                openDrill({
                  kind: 'FILTER',
                  filter: { accountId: accountId && accountId !== 'ALL' ? accountId : undefined },
                  label: 'What-If Baseline Net P&L',
                })
              }
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: muiTheme.palette.primary.main,
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700 }}>
                  Actual Net P&L
                </Typography>
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  mt: 0.5,
                  color: simData.baseline.totalNet_actual >= 0 ? '#10B981' : '#F43F5E',
                }}
              >
                {formatCurrency(simData.baseline.totalNet_actual)}
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Net of statutory charges
              </Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700 }}>
                  Actual Win Rate
                </Typography>
                <HelpHint hintKey="metric.winRateCredible" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                {simData.baseline.winRate_actual}%
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                PF: {simData.baseline.profitFactor_actual}
              </Typography>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Main Heatmap Grid */}
      <Card
        sx={{
          p: 3,
          borderRadius: 2.5,
          border: `1px solid ${muiTheme.palette.divider}`,
          overflowX: 'auto',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Stop × Target Parameter Matrix
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Click any cell to inspect paired bootstrap differences, in-sample vs holdout, and trade breakdown.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
              label="Robust Edge"
              color="success"
              variant="outlined"
              sx={{ fontSize: '0.72rem', height: 22 }}
            />
            <HelpHint hintKey="analytics.whatIf.verdicts" />
          </Box>
        </Box>

        {isLoading ? (
          <Skeleton variant="rounded" height={400} />
        ) : !simData ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
              No simulation data available. Adjust filters or ensure closed trades exist.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ minWidth: 700 }}>
            {/* Target Headers (X-Axis) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 1, mb: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  color: muiTheme.palette.text.secondary,
                }}
              >
                Stop \ Target
              </Box>
              {targetGrid.map((targetR, idx) => (
                <Box
                  key={idx}
                  sx={{
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    color: muiTheme.palette.text.primary,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
                  }}
                >
                  {targetR === null ? 'No Target' : `${targetR.toFixed(1)}R`}
                </Box>
              ))}
            </Box>

            {/* Matrix Rows (Stop on Y-Axis) */}
            {stopGrid.map((stopR, sIdx) => (
              <Box
                key={sIdx}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '110px repeat(7, 1fr)',
                  gap: 1,
                  mb: 1,
                }}
              >
                {/* Stop Row Label */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    color: muiTheme.palette.text.primary,
                    borderRadius: 1,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
                  }}
                >
                  {stopR === null ? 'No Stop' : `${stopR.toFixed(2)}R`}
                </Box>

                {/* Grid Cells */}
                {targetGrid.map((targetR, tIdx) => {
                  const cell = simData.cells.find(
                    (c) => c.stopR === stopR && c.targetR === targetR
                  );

                  if (!cell) {
                    return (
                      <Box
                        key={tIdx}
                        sx={{
                          height: 52,
                          borderRadius: 1.5,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#FAFAFA',
                        }}
                      />
                    );
                  }

                  const stats = cell.all;
                  const isSelected =
                    selectedCell?.stopR === cell.stopR && selectedCell?.targetR === cell.targetR;

                  let displayValue = '';
                  let meanVal = stats.meanR_pess;
                  if (stats.nEval < 5) {
                    displayValue = '—';
                  } else if (viewPolicy === 'PESSIMISTIC') {
                    displayValue = `${stats.meanR_pess >= 0 ? '+' : ''}${stats.meanR_pess.toFixed(2)}R`;
                    meanVal = stats.meanR_pess;
                  } else if (viewPolicy === 'OPTIMISTIC') {
                    displayValue = `${stats.meanR_opt >= 0 ? '+' : ''}${stats.meanR_opt.toFixed(2)}R`;
                    meanVal = stats.meanR_opt;
                  } else {
                    displayValue = `${stats.meanR_pess.toFixed(2)}..${stats.meanR_opt.toFixed(2)}`;
                    meanVal = (stats.meanR_pess + stats.meanR_opt) / 2;
                  }

                  const isRobust = cell.verdict === 'BETTER_ROBUST' && cell.holdsOutOfSample;

                  return (
                    <Box
                      key={tIdx}
                      onClick={() => setSelectedCell(cell)}
                      sx={{
                        height: 54,
                        borderRadius: 1.5,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease-in-out',
                        backgroundColor: getCellColor(meanVal, stats.nEval),
                        border: isSelected
                          ? `2px solid ${muiTheme.palette.primary.main}`
                          : isRobust
                            ? '2px solid #10B981'
                            : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'}`,
                        boxShadow: isRobust ? '0 0 12px rgba(16, 185, 129, 0.25)' : 'none',
                        '&:hover': {
                          transform: 'scale(1.04)',
                          zIndex: 2,
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        },
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          color: getCellTextColor(meanVal, stats.nEval),
                        }}
                      >
                        {displayValue}
                      </Typography>

                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.64rem',
                          color: isDark ? '#94A3B8' : '#64748B',
                          lineHeight: 1,
                          mt: 0.25,
                        }}
                      >
                        {stats.nEval < 30 ? `n=${stats.nEval}` : `${stats.winRate_pess}% win`}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}
      </Card>

      {/* Excursion Distribution Histograms */}
      {simData && (
        <Grid container spacing={3}>
          {/* Winners' MAE Distribution */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ p: 2.5, borderRadius: 2.5, border: `1px solid ${muiTheme.palette.divider}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Winners' MAE Distribution (Heat Taken)
                  </Typography>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    How far against the position winning trades went before turning profitable.
                  </Typography>
                </Box>
                <HelpHint hintKey="metric.mae" />
              </Box>
              <Box sx={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={simData.winnersMaeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                    <XAxis dataKey="rangeLabel" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <Box sx={{ p: 1, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 1.5, border: `1px solid ${muiTheme.palette.divider}` }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{d.rangeLabel}</Typography>
                            <Typography variant="caption">{d.count} trades ({d.pct}%)</Typography>
                          </Box>
                        );
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#38BDF8"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(entry: any) => {
                        const lbl = entry?.rangeLabel || entry?.payload?.rangeLabel || '';
                        openDrill({
                          kind: 'FILTER',
                          filter: { outcome: 'WIN' },
                          label: `Winners MAE: ${lbl}`,
                        });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Card>
          </Grid>

          {/* All Trades' MFE Distribution */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ p: 2.5, borderRadius: 2.5, border: `1px solid ${muiTheme.palette.divider}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    All Trades' MFE Distribution (Reach Potential)
                  </Typography>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Peak favorable excursion reached across all evaluated trades. (Click bar to drill down)
                  </Typography>
                </Box>
                <HelpHint hintKey="metric.mfe" />
              </Box>
              <Box sx={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={simData.allTradesMfeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                    <XAxis dataKey="rangeLabel" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <Box sx={{ p: 1, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 1.5, border: `1px solid ${muiTheme.palette.divider}` }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{d.rangeLabel}</Typography>
                            <Typography variant="caption">{d.count} trades ({d.pct}%)</Typography>
                          </Box>
                        );
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(entry: any) => {
                        const lbl = entry?.rangeLabel || entry?.payload?.rangeLabel || '';
                        openDrill({
                          kind: 'FILTER',
                          filter: { mfeRMin: 0.01 },
                          label: `Trades MFE: ${lbl}`,
                        });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Cell Inspector Drawer */}
      <Drawer
        anchor="right"
        open={Boolean(selectedCell)}
        onClose={() => setSelectedCell(null)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 460 },
              p: 3,
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            },
          },
        }}
      >
        {selectedCell && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Cell Inspector
                </Typography>
                <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
                  Stop: {selectedCell.stopR === null ? 'None' : `${selectedCell.stopR}R`} | Target:{' '}
                  {selectedCell.targetR === null ? 'None' : `${selectedCell.targetR}R`}
                </Typography>
              </Box>
              <IconButton onClick={() => setSelectedCell(null)}>
                <CloseRoundedIcon />
              </IconButton>
            </Box>

            <Divider />

            {/* Statistical Verdict Card */}
            <Card
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${
                  selectedCell.verdict === 'BETTER_ROBUST'
                    ? '#10B981'
                    : selectedCell.verdict === 'WORSE_ROBUST'
                      ? '#F43F5E'
                      : muiTheme.palette.divider
                }`,
                backgroundColor:
                  selectedCell.verdict === 'BETTER_ROBUST'
                    ? isDark
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(16, 185, 129, 0.05)'
                    : isDark
                      ? 'rgba(255, 255, 255, 0.02)'
                      : '#F8FAFC',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Statistical Verdict
                </Typography>
                <HelpHint hintKey="analytics.whatIf.verdicts" />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {selectedCell.verdict === 'BETTER_ROBUST'
                  ? 'BETTER (Statistically Robust Edge)'
                  : selectedCell.verdict === 'WORSE_ROBUST'
                    ? 'WORSE (Statistically Significant Drag)'
                    : 'INCONCLUSIVE'}
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.5 }}>
                {selectedCell.holdsOutOfSample
                  ? 'Confirmed in chronological holdout split.'
                  : 'Does not hold out-of-sample or insufficient holdout sample.'}
              </Typography>
            </Card>

            {/* Paired Differences vs Actual Baseline */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                Paired Differences vs Actual
              </Typography>
              <Card sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Pessimistic 90% CI:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                    [{selectedCell.bootstrapIntervalPess[0].toFixed(2)}, {selectedCell.bootstrapIntervalPess[1].toFixed(2)}] R
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    Optimistic 90% CI:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                    [{selectedCell.bootstrapIntervalOpt[0].toFixed(2)}, {selectedCell.bootstrapIntervalOpt[1].toFixed(2)}] R
                  </Typography>
                </Box>
              </Card>
            </Box>

            {/* Metrics Breakdown Table */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                Performance Comparison
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700 }}>Metric</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 700 }}>Pessimistic</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 700 }}>Optimistic</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Mean R</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {selectedCell.all.meanR_pess >= 0 ? '+' : ''}{selectedCell.all.meanR_pess.toFixed(2)}R
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {selectedCell.all.meanR_opt >= 0 ? '+' : ''}{selectedCell.all.meanR_opt.toFixed(2)}R
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Net P&L</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {formatCurrency(selectedCell.all.totalNet_pess)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {formatCurrency(selectedCell.all.totalNet_opt)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Win Rate</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {selectedCell.all.winRate_pess}%
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {selectedCell.all.winRate_opt}%
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Stop Hit Rate</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {selectedCell.all.stopHitRate}%
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {selectedCell.all.stopHitRate}%
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Target Hit Rate</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {selectedCell.all.targetHitRate}%
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                      {selectedCell.all.targetHitRate}%
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>

            {/* In-Sample vs Holdout Split */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  In-Sample vs Holdout Split
                </Typography>
                <HelpHint hintKey="analytics.whatIf.holdout" />
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6 }}>
                  <Card sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                      In-Sample (n={selectedCell.inSample.nEval})
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                      {selectedCell.inSample.meanR_pess >= 0 ? '+' : ''}{selectedCell.inSample.meanR_pess.toFixed(2)}R
                    </Typography>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Card sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                      Holdout (n={selectedCell.holdout.nEval})
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                      {selectedCell.holdout.meanR_pess >= 0 ? '+' : ''}{selectedCell.holdout.meanR_pess.toFixed(2)}R
                    </Typography>
                  </Card>
                </Grid>
              </Grid>
            </Box>

            {/* Ambiguous and Censored Counts */}
            <Box>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Ambiguous bars resolved by policy: {selectedCell.all.nAmbiguous} trades.
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: muiTheme.palette.text.secondary }}>
                Right-censored trades excluded: {selectedCell.all.nCensored} trades.
              </Typography>
            </Box>

            {/* Drilldown Trigger Button */}
            <Button
              variant="contained"
              color="primary"
              size="small"
              fullWidth
              onClick={() => {
                openDrill({
                  kind: 'FILTER',
                  filter: { accountId: accountId && accountId !== 'ALL' ? accountId : undefined },
                  label: `What-If Simulation Trades (Stop ${selectedCell.stopR ?? 'None'}R, Target ${selectedCell.targetR ?? 'None'}R)`,
                });
              }}
              sx={{
                mt: 1,
                py: 1,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.8125rem',
              }}
            >
              Drill Down Evaluated Trades ({selectedCell.all.nEval})
            </Button>
          </Box>
        )}
      </Drawer>
    </Box>
  );
};
