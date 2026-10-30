import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Popover from '@mui/material/Popover';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Recharts components
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceDot,
  ReferenceLine,
} from 'recharts';

// Icons
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';

import { api } from '../../lib/api.js';
import { formatCurrency, formatR, formatPercent, formatDate } from '../../lib/utils.js';
import { useTradeDrilldown } from '../../context/TradeDrillContext.js';
import { HelpHint } from '../help/index.js';
import type { IEquityCurvesResponse, IStrategyOverlayCurve } from '@tradevault/shared';

const STRATEGY_COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#10B981', '#3B82F6'];

interface MultiPanelEquityCurveProps {
  selectedAccountId?: string;
  startDate?: string;
  endDate?: string;
}

export function MultiPanelEquityCurve({ selectedAccountId, startDate, endDate }: MultiPanelEquityCurveProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const { openDrill, prefetchDrill } = useTradeDrilldown();

  // Controls state
  const [curveMode, setCurveMode] = useState<'MONEY' | 'R' | 'BOTH'>('BOTH');
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>([]);
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [showBreachMarkers, setShowBreachMarkers] = useState(true);
  const [showTiltMarkers, setShowTiltMarkers] = useState(true);
  const [showUnderwaterPanel, setShowUnderwaterPanel] = useState(true);

  // Strategy picker popover
  const [strategyAnchorEl, setStrategyAnchorEl] = useState<null | HTMLElement>(null);

  // Fetch full multi-panel dataset computed by Decimal.js
  const { data: curveData, isLoading, isError } = useQuery<IEquityCurvesResponse>({
    queryKey: ['equity-curves', selectedAccountId, startDate, endDate],
    queryFn: () =>
      api.dashboard.equityCurves({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        startDate,
        endDate,
      }),
    staleTime: 60 * 1000,
  });

  const moneyCurve = useMemo(() => curveData?.moneyCurve || [], [curveData]);
  const cumulativeRCurve = curveData?.cumulativeRCurve;
  const rCurveList = useMemo(() => cumulativeRCurve?.curve || [], [cumulativeRCurve]);
  const recoveryStats = curveData?.recoveryStats;
  const strategyOverlays = useMemo(() => curveData?.strategyOverlays || [], [curveData]);
  const monteCarloCone = useMemo(() => curveData?.monteCarloCone || [], [curveData]);
  const coneMeta = curveData?.coneMeta;
  const breachDays = useMemo(() => curveData?.eventMarkers?.breachDays || [], [curveData]);
  const tiltDays = useMemo(() => curveData?.eventMarkers?.tiltDays || [], [curveData]);

  // Color lookup for strategies
  const strategyColorMap = useMemo(() => {
    const map = new Map<string, string>();
    strategyOverlays.forEach((s: IStrategyOverlayCurve, idx: number) => {
      map.set(s.strategyId, STRATEGY_COLORS[idx % STRATEGY_COLORS.length]);
    });
    return map;
  }, [strategyOverlays]);

  // Merge Money, R, Drawdown, and Strategies by date into unified Recharts series
  const chartData = useMemo(() => {
    if (moneyCurve.length === 0 && rCurveList.length === 0) return [];

    // Map by date (or trade index if multiple on same date)
    const dateMap = new Map<string, any>();

    // 1. Money points
    for (const p of moneyCurve) {
      dateMap.set(p.date, {
        date: p.date,
        cumulativeEquity: p.cumulativeEquity,
        netPnL: p.netPnL,
        drawdown: p.drawdown,
        drawdownPercent: p.drawdownPercent,
        tradeId: p.tradeId,
        symbol: p.symbol,
      });
    }

    // 2. Cumulative R points
    for (const r of rCurveList) {
      const existing = dateMap.get(r.date) || {
        date: r.date,
        tradeId: r.tradeId,
        symbol: r.symbol,
      };
      existing.cumulativeR = r.cumulativeR;
      existing.rMultiple = r.rMultiple;
      dateMap.set(r.date, existing);
    }

    // 3. Strategy overlays
    for (const s of strategyOverlays) {
      if (selectedStrategyIds.includes(s.strategyId)) {
        for (const sp of s.curve) {
          const existing = dateMap.get(sp.date);
          if (existing) {
            existing[`strat_${s.strategyId}`] = sp.cumulativeR;
          }
        }
      }
    }

    // 4. Attach event markers
    for (const b of breachDays) {
      const existing = dateMap.get(b.date);
      if (existing) {
        existing.breachEvent = b;
      }
    }
    for (const t of tiltDays) {
      const existing = dateMap.get(t.date);
      if (existing) {
        existing.tiltEvent = t;
      }
    }

    const merged = Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 5. Append Monte Carlo cone projections if active and valid
    if (showMonteCarlo && monteCarloCone.length > 0 && merged.length > 0) {
      const lastPoint = merged[merged.length - 1];
      const baseEquity = lastPoint.cumulativeEquity || curveData?.startingEquity || 100000;
      const baseR = lastPoint.cumulativeR || 0;

      for (const step of monteCarloCone) {
        merged.push({
          date: `+${step.step} trades`,
          isProjection: true,
          stepIndex: step.step,
          mcP5: curveMode === 'R' ? baseR + step.p5 : baseEquity + step.p5 * 1000,
          mcP25: curveMode === 'R' ? baseR + step.p25 : baseEquity + step.p25 * 1000,
          mcP50: curveMode === 'R' ? baseR + step.p50 : baseEquity + step.p50 * 1000,
          mcP75: curveMode === 'R' ? baseR + step.p75 : baseEquity + step.p75 * 1000,
          mcP95: curveMode === 'R' ? baseR + step.p95 : baseEquity + step.p95 * 1000,
        });
      }
    }

    return merged;
  }, [
    moneyCurve,
    rCurveList,
    strategyOverlays,
    selectedStrategyIds,
    breachDays,
    tiltDays,
    showMonteCarlo,
    monteCarloCone,
    curveMode,
    curveData?.startingEquity,
  ]);

  // Strategy toggle helper
  const handleToggleStrategy = (strategyId: string) => {
    setSelectedStrategyIds((prev) => {
      if (prev.includes(strategyId)) {
        return prev.filter((id) => id !== strategyId);
      }
      if (prev.length >= 6) return prev; // max 6
      return [...prev, strategyId];
    });
  };

  // Click on chart points invokes universal drilldown
  const handleChartClick = useCallback(
    (event: any) => {
      if (!event || !event.activePayload || event.activePayload.length === 0) return;
      const payload = event.activePayload[0].payload;
      if (!payload || payload.isProjection) return;

      if (payload.tradeId) {
        openDrill({
          kind: 'TRADE',
          tradeId: payload.tradeId,
          label: `Trade on ${formatDate(payload.date)} (${payload.symbol || 'Trade'})`,
        });
      } else if (payload.date) {
        openDrill({
          kind: 'FILTER',
          filter: { date: payload.date },
          label: `Trades on ${formatDate(payload.date)}`,
        });
      }
    },
    [openDrill]
  );

  // Prefetch drilldown data on hover (debounced 150ms in context)
  const handleChartMouseMove = useCallback(
    (event: any) => {
      if (!event || !event.activePayload || event.activePayload.length === 0) return;
      const payload = event.activePayload[0].payload;
      if (!payload || payload.isProjection || !payload.tradeId) return;

      prefetchDrill({
        kind: 'TRADE',
        tradeId: payload.tradeId,
        label: `Trade on ${formatDate(payload.date)}`,
      });
    },
    [prefetchDrill]
  );

  const chartGridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';
  const chartAxisColor = isDark ? '#94A3B8' : '#64748B';

  const chartTooltipStyle = {
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
    borderRadius: '10px',
    boxShadow: isDark
      ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
      : '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
    padding: '12px',
    fontSize: '12px',
  };

  if (isLoading) {
    return (
      <Card sx={{ p: 3, borderRadius: 2 }}>
        <Skeleton variant="rectangular" height={40} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={320} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        Failed to load multi-panel performance curves.
      </Alert>
    );
  }

  const currentDrawdownPct = recoveryStats?.currentDrawdownPercent ?? 0;
  const maxDrawdownPct = recoveryStats?.maxDrawdownPercent ?? 0;
  const maxDrawdownAmt = recoveryStats?.maxDrawdown ?? 0;
  const longestRecDays = recoveryStats?.longestRecoveryDays ?? 0;
  const longestRecPoints = recoveryStats?.longestRecoveryPoints ?? 0;

  return (
    <Card sx={{ p: 2.5, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header and Toolbar */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>
                Multi-Panel Performance Curves
              </Typography>
              <HelpHint hintKey="metric.rMultiple" />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Synchronized Money Curve, Cumulative R, Strategy Overlays & Underwater Drawdown
            </Typography>
          </Box>

          {/* R-Coverage Pill */}
          {cumulativeRCurve && (
            <Tooltip
              title={`Edge standard: Excludes trades missing planned stop loss or zero budget. ${cumulativeRCurve.eligibleTrades} of ${cumulativeRCurve.totalTrades} trades eligible.`}
            >
              <Chip
                label={cumulativeRCurve.coverageText}
                size="small"
                variant="outlined"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.72rem',
                  height: 24,
                  borderColor: 'divider',
                }}
              />
            </Tooltip>
          )}
        </Box>

        {/* Controls Toolbar */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          {/* Curve Mode Toggle (Money / R / Both) */}
          <ToggleButtonGroup
            value={curveMode}
            exclusive
            onChange={(_, val) => val && setCurveMode(val)}
            size="small"
            sx={{ height: 32 }}
          >
            <ToggleButton value="MONEY" sx={{ px: 1.5, fontSize: '0.75rem', fontWeight: 600 }}>
              Money (₹)
            </ToggleButton>
            <ToggleButton value="R" sx={{ px: 1.5, fontSize: '0.75rem', fontWeight: 600 }}>
              R-Multiple
            </ToggleButton>
            <ToggleButton value="BOTH" sx={{ px: 1.5, fontSize: '0.75rem', fontWeight: 600 }}>
              Dual Axis
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Strategy Overlays Button */}
          {strategyOverlays.length > 0 && (
            <>
              <Button
                variant={selectedStrategyIds.length > 0 ? 'contained' : 'outlined'}
                size="small"
                startIcon={<LayersRoundedIcon />}
                onClick={(e) => setStrategyAnchorEl(e.currentTarget)}
                sx={{
                  height: 32,
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Strategies {selectedStrategyIds.length > 0 && `(${selectedStrategyIds.length})`}
              </Button>
              <Popover
                open={Boolean(strategyAnchorEl)}
                anchorEl={strategyAnchorEl}
                onClose={() => setStrategyAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { p: 1.5, width: 280, borderRadius: 2 } } }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Strategy Cumulative R Overlays
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                  Select up to 6 strategies to benchmark relative alpha:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {strategyOverlays.map((strat: IStrategyOverlayCurve) => {
                    const isChecked = selectedStrategyIds.includes(strat.strategyId);
                    const color = strategyColorMap.get(strat.strategyId) || '#3B82F6';
                    const isSmallSample = strat.tradesCount < 30;

                    return (
                      <Box
                        key={strat.strategyId}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              size="small"
                              checked={isChecked}
                              onChange={() => handleToggleStrategy(strat.strategyId)}
                              sx={{ color, '&.Mui-checked': { color } }}
                            />
                          }
                          label={
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                              {strat.strategyName}
                            </Typography>
                          }
                          sx={{ m: 0 }}
                        />
                        {isSmallSample && (
                          <Tooltip title="Sample size < 30 trades: low statistical reliability">
                            <Chip
                              label="<30"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Popover>
            </>
          )}

          {/* Monte Carlo Cone Toggle */}
          <Tooltip
            title={
              coneMeta?.warning
                ? coneMeta.warning
                : `Deterministic Mulberry32 Monte Carlo Expectancy Cone (${coneMeta?.tradesPerPath || 100} trades forward)`
            }
          >
            <span>
              <Button
                variant={showMonteCarlo ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setShowMonteCarlo((prev) => !prev)}
                disabled={monteCarloCone.length === 0}
                sx={{
                  height: 32,
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Monte Carlo Cone
              </Button>
            </span>
          </Tooltip>

          {/* Event Marker Toggles */}
          <Tooltip title="Toggle daily-loss breach event markers">
            <IconButton
              size="small"
              onClick={() => setShowBreachMarkers((prev) => !prev)}
              color={showBreachMarkers ? 'error' : 'default'}
              sx={{ border: 1, borderColor: 'divider', height: 32, width: 32 }}
            >
              <FlagRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Toggle high tilt event markers (Score ≥ 61)">
            <IconButton
              size="small"
              onClick={() => setShowTiltMarkers((prev) => !prev)}
              color={showTiltMarkers ? 'warning' : 'default'}
              sx={{ border: 1, borderColor: 'divider', height: 32, width: 32 }}
            >
              <LocalFireDepartmentRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Toggle Underwater Panel */}
          <Tooltip title={showUnderwaterPanel ? 'Collapse Drawdown Panel' : 'Show Underwater Drawdown Panel'}>
            <IconButton
              size="small"
              onClick={() => setShowUnderwaterPanel((prev) => !prev)}
              sx={{ border: 1, borderColor: 'divider', height: 32, width: 32 }}
            >
              {showUnderwaterPanel ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Upper Performance Panel (Money Curve & Cumulative R) */}
      <Box sx={{ height: 340, width: '100%', position: 'relative' }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              syncId="setupmint-equity-sync"
              onClick={handleChartClick}
              onMouseMove={handleChartMouseMove}
            >
              <defs>
                <linearGradient id="setupmintMoneyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="setupmintMonteCarloGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />

              <XAxis
                dataKey="date"
                stroke={chartAxisColor}
                fontSize={11}
                tickLine={false}
                tickFormatter={(d: string) => (d.startsWith('+') ? d : formatDate(d))}
              />

              {/* Left Y-Axis: Money (₹) */}
              {(curveMode === 'MONEY' || curveMode === 'BOTH') && (
                <YAxis
                  yAxisId="moneyAxis"
                  orientation="left"
                  stroke={chartAxisColor}
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                />
              )}

              {/* Right Y-Axis: Cumulative R */}
              {(curveMode === 'R' || curveMode === 'BOTH') && (
                <YAxis
                  yAxisId="rAxis"
                  orientation={curveMode === 'R' ? 'left' : 'right'}
                  stroke={chartAxisColor}
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}R`}
                />
              )}

              <RechartsTooltip
                contentStyle={chartTooltipStyle}
                formatter={(val: any, name: string) => {
                  if (name === 'cumulativeEquity') return [formatCurrency(val), 'Cumulative Equity'];
                  if (name === 'cumulativeR') return [formatR(val), 'Cumulative R'];
                  if (name.startsWith('strat_')) {
                    const sId = name.replace('strat_', '');
                    const s = strategyOverlays.find((item: IStrategyOverlayCurve) => item.strategyId === sId);
                    return [formatR(val), s ? s.strategyName : 'Strategy'];
                  }
                  if (name === 'mcP50') return [`P50: ${Number(val).toFixed(1)}`, 'Monte Carlo Median'];
                  if (name === 'mcP95') return [`P95: ${Number(val).toFixed(1)}`, 'Upper Cone (P95)'];
                  if (name === 'mcP5') return [`P5: ${Number(val).toFixed(1)}`, 'Lower Cone (P5)'];
                  return [val, name];
                }}
                labelFormatter={(label: any) => `${label} • Click to drilldown`}
              />

              {/* Money Curve Area */}
              {(curveMode === 'MONEY' || curveMode === 'BOTH') && (
                <Area
                  yAxisId="moneyAxis"
                  type="monotone"
                  dataKey="cumulativeEquity"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#setupmintMoneyGradient)"
                  cursor="pointer"
                  activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: '#fff' }}
                />
              )}

              {/* Cumulative R Curve Line */}
              {(curveMode === 'R' || curveMode === 'BOTH') && (
                <Line
                  yAxisId="rAxis"
                  type="monotone"
                  dataKey="cumulativeR"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={false}
                  cursor="pointer"
                  activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: '#fff' }}
                />
              )}

              {/* Strategy Overlays */}
              {strategyOverlays.map((strat: IStrategyOverlayCurve) => {
                if (!selectedStrategyIds.includes(strat.strategyId)) return null;
                const color = strategyColorMap.get(strat.strategyId) || '#3B82F6';
                return (
                  <Line
                    key={strat.strategyId}
                    yAxisId={curveMode === 'R' || curveMode === 'BOTH' ? 'rAxis' : 'moneyAxis'}
                    type="monotone"
                    dataKey={`strat_${strat.strategyId}`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                    name={`strat_${strat.strategyId}`}
                  />
                );
              })}

              {/* Monte Carlo Fan Bands */}
              {showMonteCarlo && monteCarloCone.length > 0 && (
                <>
                  <Area
                    yAxisId={curveMode === 'R' ? 'rAxis' : 'moneyAxis'}
                    type="monotone"
                    dataKey="mcP95"
                    stroke="none"
                    fill="url(#setupmintMonteCarloGradient)"
                    fillOpacity={0.4}
                  />
                  <Line
                    yAxisId={curveMode === 'R' ? 'rAxis' : 'moneyAxis'}
                    type="monotone"
                    dataKey="mcP50"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                  <Area
                    yAxisId={curveMode === 'R' ? 'rAxis' : 'moneyAxis'}
                    type="monotone"
                    dataKey="mcP5"
                    stroke="none"
                    fill="transparent"
                  />
                </>
              )}

              {/* Event Markers: Daily Loss Breach */}
              {showBreachMarkers &&
                breachDays.map((m: any, idx: number) => (
                  <ReferenceDot
                    key={`breach-${idx}`}
                    yAxisId={curveMode === 'R' ? 'rAxis' : 'moneyAxis'}
                    x={m.date}
                    y={0}
                    r={7}
                    fill="#EF4444"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    cursor="pointer"
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        filter: { date: m.date },
                        label: `Daily Loss Breach (${m.date}): -${formatCurrency(m.breachAmount)}`,
                      })
                    }
                  />
                ))}

              {/* Event Markers: High Tilt */}
              {showTiltMarkers &&
                tiltDays.map((m: any, idx: number) => (
                  <ReferenceDot
                    key={`tilt-${idx}`}
                    yAxisId={curveMode === 'R' ? 'rAxis' : 'moneyAxis'}
                    x={m.date}
                    y={0}
                    r={6}
                    fill="#F59E0B"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    cursor="pointer"
                    onClick={() =>
                      openDrill({
                        kind: 'TRADE',
                        tradeId: m.tradeId,
                        label: `High Tilt Trade (${m.symbol}): Score ${m.score} (${m.explanation})`,
                      })
                    }
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              No closed trades recorded yet to plot performance curves.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Secondary Lower Panel: Underwater / Drawdown % */}
      {showUnderwaterPanel && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1.5,
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Underwater Drawdown
              </Typography>
              <HelpHint hintKey="metric.drawdown" />
              <Chip
                label={`Current DD: -${formatPercent(currentDrawdownPct)}`}
                size="small"
                color={currentDrawdownPct > 0 ? 'error' : 'success'}
                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, ml: 0.5 }}
              />
            </Box>

            {/* Longest Recovery & Max Drawdown Badges (Computed via Decimal.js) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="Maximum peak-to-trough equity drop recorded">
                <Chip
                  label={`Max DD: -${formatPercent(maxDrawdownPct)} (${formatCurrency(maxDrawdownAmt)})`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    height: 22,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                />
              </Tooltip>

              <Tooltip title="Longest duration and trades required to recover from a drawdown trough">
                <Chip
                  label={`Longest Recovery: ${longestRecDays}d (${longestRecPoints} trades)`}
                  size="small"
                  variant="outlined"
                  color="warning"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    height: 22,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                />
              </Tooltip>
            </Box>
          </Box>

          <Box sx={{ height: 140, width: '100%' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  syncId="setupmint-equity-sync"
                  onClick={handleChartClick}
                  onMouseMove={handleChartMouseMove}
                >
                  <defs>
                    <linearGradient id="setupmintDrawdownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.0} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis dataKey="date" hide />
                  <YAxis
                    stroke={chartAxisColor}
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(v: number) => `-${v}%`}
                    domain={[0, 'auto']}
                    reversed
                  />
                  <RechartsTooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(val: any) => [`-${Number(val).toFixed(2)}%`, 'Drawdown']}
                    labelFormatter={(label: any) => `${label} • Click to inspect drawdown trades`}
                  />
                  <ReferenceLine y={0} stroke={chartAxisColor} strokeDasharray="2 2" />
                  <Area
                    type="monotone"
                    dataKey="drawdownPercent"
                    stroke="#EF4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#setupmintDrawdownGradient)"
                    cursor="pointer"
                    activeDot={{ r: 5, stroke: '#EF4444', strokeWidth: 2, fill: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </Box>
        </Box>
      )}
    </Card>
  );
}
export default MultiPanelEquityCurve;
