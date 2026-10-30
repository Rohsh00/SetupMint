import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Recharts
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip as RechartsTooltip,
} from 'recharts';

// Icons
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';

import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { formatCurrency } from '../lib/utils.js';
import { MISTAKE_TAGS } from '@tradevault/shared';
import { TradeInstrumentBadge } from '../components/trades/TradeInstrumentBadge.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';
import { HelpHint } from '../components/help/index.js';

export function JournalCalendarPage() {
  const { openDrill } = useTradeDrilldown();
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [metricMode, setMetricMode] = useState<'INR' | 'R'>('INR');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const ymString = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: () => api.accounts.list(),
  });
  const accounts = Array.isArray(accountsData) ? accountsData : (accountsData as any)?.accounts || [];

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['journal-calendar', ymString, selectedAccountId],
    queryFn: () => api.journal.calendar(ymString, selectedAccountId),
  });

  const { data: dayDetails, isLoading: isDayLoading } = useQuery({
    queryKey: ['journal-day', selectedDate],
    queryFn: () => api.journal.getDay(selectedDate!),
    enabled: !!selectedDate,
  });

  // Daily review form state
  const [marketConditions, setMarketConditions] = useState('');
  const [marketBias, setMarketBias] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('NEUTRAL');
  const [emotionalState, setEmotionalState] = useState('CALM');
  const [disciplineRating, setDisciplineRating] = useState(5);
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [nextDayPlan, setNextDayPlan] = useState('');
  const [bestTradeId, setBestTradeId] = useState<string>('');
  const [worstTradeId, setWorstTradeId] = useState<string>('');
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleApplyPrefill = () => {
    if (!dayDetails?.prefill) return;
    const p = dayDetails.prefill;
    if (p.suggestedDisciplineRating) setDisciplineRating(p.suggestedDisciplineRating);
    if (p.suggestedBestTrade?.id) setBestTradeId(p.suggestedBestTrade.id);
    if (p.suggestedWorstTrade?.id) setWorstTradeId(p.suggestedWorstTrade.id);
    if (p.aggregatedMistakes?.length) setMistakes(p.aggregatedMistakes);
    if (p.reasoning) {
      setLessonsLearned((prev) => (prev ? `${prev}\n${p.reasoning}` : p.reasoning));
    }
    toast.success('Auto-prefilled from session trades analysis.');
  };

  // Load day details into review form when date changes
  React.useEffect(() => {
    if (dayDetails?.journal) {
      const j = dayDetails.journal;
      setMarketConditions(j.marketConditions || '');
      setMarketBias(j.marketBias || 'NEUTRAL');
      setEmotionalState(j.emotionalState || 'CALM');
      setDisciplineRating(j.disciplineRating || 5);
      setLessonsLearned(j.lessonsLearned || '');
      setNextDayPlan(j.nextDayPlan || '');
      setBestTradeId(j.bestTradeId?._id || j.bestTradeId || '');
      setWorstTradeId(j.worstTradeId?._id || j.worstTradeId || '');
      setMistakes(j.mistakes || []);
    } else if (dayDetails?.prefill) {
      const p = dayDetails.prefill;
      setMarketConditions('');
      setMarketBias('NEUTRAL');
      setEmotionalState('CALM');
      setDisciplineRating(p.suggestedDisciplineRating || 5);
      setLessonsLearned(p.reasoning ? `[Analysis] ${p.reasoning}` : '');
      setNextDayPlan('');
      setBestTradeId(p.suggestedBestTrade?.id || '');
      setWorstTradeId(p.suggestedWorstTrade?.id || '');
      setMistakes(p.aggregatedMistakes || []);
    } else {
      setMarketConditions('');
      setMarketBias('NEUTRAL');
      setEmotionalState('CALM');
      setDisciplineRating(5);
      setLessonsLearned('');
      setNextDayPlan('');
      setBestTradeId('');
      setWorstTradeId('');
      setMistakes([]);
    }
    setSaveSuccess(false);
    setSaveError(null);
  }, [dayDetails]);

  const saveJournalMutation = useMutation({
    mutationFn: (review: any) => api.journal.saveDay(selectedDate!, review),
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(true);
      toast.success('Journal entry saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['journal-day', selectedDate] });
      // Close the modal cleanly upon successful save
      setSelectedDate(null);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to save daily reflection';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const deleteJournalMutation = useMutation({
    mutationFn: () => api.journal.deleteDay(selectedDate!),
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(false);
      setIsDeleteConfirmOpen(false);
      toast.success('Journal entry deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['journal-day', selectedDate] });
      setSelectedDate(null);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete journal entry';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Calculate first day weekday and total days in month
  const firstDayWeekday = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sun
  const days = calendarData?.days || [];

  // Monthly totals
  const totalMonthlyNet = days.reduce((sum: number, d: any) => sum + (d.netPnL || 0), 0);
  const totalMonthlyR = days.reduce((sum: number, d: any) => sum + (d.totalR || 0), 0);
  const totalMonthlyTrades = days.reduce((sum: number, d: any) => sum + (d.tradesCount || 0), 0);
  const winningDays = days.filter((d: any) => d.netPnL > 0).length;
  const losingDays = days.filter((d: any) => d.netPnL < 0).length;
  const tradingDaysCount = winningDays + losingDays;
  const monthWinRate = tradingDaysCount > 0 ? Math.round((winningDays / tradingDaysCount) * 100) : 0;

  // Cumulative Month Trajectory Sparkline Data
  let runningCumulativePnL = 0;
  let runningCumulativeR = 0;
  let peakCumulative = 0;

  const sparklineData = days.map((d: any) => {
    runningCumulativePnL += d.netPnL || 0;
    runningCumulativeR += d.totalR || 0;
    const currentVal = metricMode === 'INR' ? runningCumulativePnL : runningCumulativeR;
    if (currentVal > peakCumulative) peakCumulative = currentVal;
    return {
      day: d.dayNumber,
      date: d.date,
      dailyPnL: d.netPnL || 0,
      dailyR: d.totalR || 0,
      cumulativePnL: Number(runningCumulativePnL.toFixed(2)),
      cumulativeR: Number(runningCumulativeR.toFixed(2)),
      val: Number(currentVal.toFixed(2)),
      tradesCount: d.tradesCount || 0,
    };
  });

  // Build Week Rows for 8-Column Layout (7 Days + 1 Weekly Summary)
  const preMonthSlots: Array<{ isEmpty: boolean; day?: any; key: string }> = Array.from(
    { length: firstDayWeekday },
    (_, i) => ({
      isEmpty: true,
      day: undefined,
      key: `pre-${i}`,
    })
  );

  const monthSlots: Array<{ isEmpty: boolean; day?: any; key: string }> = days.map((d: any) => ({
    isEmpty: false,
    day: d,
    key: d.date,
  }));

  const combinedSlots = [...preMonthSlots, ...monthSlots];
  const remainder = combinedSlots.length % 7;
  const postMonthCount = remainder === 0 ? 0 : 7 - remainder;
  const postMonthSlots: Array<{ isEmpty: boolean; day?: any; key: string }> = Array.from(
    { length: postMonthCount },
    (_, i) => ({
      isEmpty: true,
      day: undefined,
      key: `post-${i}`,
    })
  );

  const allCalendarSlots = [...combinedSlots, ...postMonthSlots];

  interface IWeekRow {
    weekNumber: number;
    slots: Array<{ isEmpty: boolean; day?: any; key: string }>;
    summary: {
      weekTrades: number;
      weekNet: number;
      weekR: number;
      weekWins: number;
      weekLosses: number;
      weekWinRate: number;
      firstDate?: string;
      lastDate?: string;
    };
  }

  const weekRows: IWeekRow[] = [];
  for (let i = 0; i < allCalendarSlots.length; i += 7) {
    const weekSlots = allCalendarSlots.slice(i, i + 7);
    const activeDays = weekSlots.filter((s) => !s.isEmpty && s.day).map((s) => s.day);

    const weekTrades = activeDays.reduce((sum: number, d: any) => sum + (d.tradesCount || 0), 0);
    const weekNet = activeDays.reduce((sum: number, d: any) => sum + (d.netPnL || 0), 0);
    const weekR = activeDays.reduce((sum: number, d: any) => sum + (d.totalR || 0), 0);
    const weekWins = activeDays.reduce((sum: number, d: any) => sum + (d.winCount || 0), 0);
    const weekLosses = activeDays.reduce((sum: number, d: any) => sum + (d.lossCount || 0), 0);
    const totalDecisions = weekWins + weekLosses;
    const weekWinRate = totalDecisions > 0 ? Math.round((weekWins / totalDecisions) * 100) : 0;

    const firstDate = activeDays[0]?.date;
    const lastDate = activeDays[activeDays.length - 1]?.date;

    weekRows.push({
      weekNumber: Math.floor(i / 7) + 1,
      slots: weekSlots,
      summary: {
        weekTrades,
        weekNet: Number(weekNet.toFixed(2)),
        weekR: Number(weekR.toFixed(2)),
        weekWins,
        weekLosses,
        weekWinRate,
        firstDate,
        lastDate,
      },
    });
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Header & Controls Strip */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          alignItems: { xs: 'flex-start', lg: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary }}>
            Journal Calendar
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Monthly P&amp;L heat map, weekly roll-up audits, and daily session reflections
          </Typography>
        </Box>

        {/* Action Controls: Account Filter, Metric Toggle & Month Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          {/* Account Filter */}
          <FormControl size="small">
            <Select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              sx={{
                fontSize: '0.8rem',
                height: 36,
                minWidth: 175,
                borderRadius: 2,
                backgroundColor: muiTheme.palette.background.paper,
              }}
            >
              <MenuItem value="ALL">All Accounts (Consolidated)</MenuItem>
              {accounts.map((acc: any) => (
                <MenuItem key={acc._id || acc.id} value={acc._id || acc.id}>
                  {acc.name} ({acc.broker})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Metric Mode Toggle (₹ Currency vs R-Multiple) */}
          <ToggleButtonGroup
            size="small"
            value={metricMode}
            exclusive
            onChange={(_, val) => val && setMetricMode(val)}
            sx={{
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : '#F1F5F9',
              borderRadius: 2,
              height: 36,
              '& .MuiToggleButton-root': {
                px: 1.5,
                py: 0.5,
                fontSize: '0.75rem',
                fontWeight: 700,
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
            <ToggleButton value="INR">₹ Currency</ToggleButton>
            <ToggleButton value="R">R Multiple</ToggleButton>
          </ToggleButtonGroup>

          {/* Month Selector */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: muiTheme.palette.background.paper,
              borderRadius: 2,
              p: 0.5,
              border: `1px solid ${muiTheme.palette.divider}`,
              height: 36,
              boxSizing: 'border-box',
            }}
          >
            <IconButton size="small" onClick={handlePrevMonth}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" sx={{ px: 1.5, fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.8125rem' }}>
              {monthNames[currentMonth - 1]} {currentYear}
            </Typography>
            <IconButton size="small" onClick={handleNextMonth}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Monthly Summary Strip with Cumulative Sparkline */}
      <Card sx={{ p: 2.5 }}>
        <Grid container spacing={2.5} sx={{ alignItems: 'center' }}>
          {/* Left Column: 4 KPI Metrics */}
          <Grid size={{ xs: 12, lg: 7 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Month Net {metricMode === 'INR' ? 'P&L' : 'R'}
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    fontFamily: `'JetBrains Mono', monospace`,
                    color: totalMonthlyNet >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                    mt: 0.5,
                  }}
                >
                  {metricMode === 'INR'
                    ? formatCurrency(totalMonthlyNet)
                    : `${totalMonthlyR >= 0 ? '+' : ''}${totalMonthlyR.toFixed(2)}R`}
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.25 }}>
                  {metricMode === 'INR'
                    ? `${totalMonthlyR >= 0 ? '+' : ''}${totalMonthlyR.toFixed(2)}R`
                    : formatCurrency(totalMonthlyNet)}
                </Typography>
              </Grid>

              <Grid
                size={{ xs: 6, sm: 3 }}
                onClick={() => {
                  const start = `${ymString}-01`;
                  const end = `${ymString}-31`;
                  openDrill({
                    kind: 'FILTER',
                    filter: {
                      startDate: start,
                      endDate: end,
                      accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
                    },
                    label: `Trades for ${ymString}`,
                  });
                }}
                sx={{
                  cursor: 'pointer',
                  borderRadius: 1.5,
                  p: 0.5,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                  },
                }}
              >
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Total Executions
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
                  {totalMonthlyTrades}
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.primary.main, display: 'block', mt: 0.25 }}>
                  Click to inspect
                </Typography>
              </Grid>

              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Green vs Red Days
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: muiTheme.palette.profit.main, fontFamily: `'JetBrains Mono', monospace` }}>
                    {winningDays}W
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: muiTheme.palette.loss.main, fontFamily: `'JetBrains Mono', monospace` }}>
                    {losingDays}L
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.25 }}>
                  {tradingDaysCount} trading sessions
                </Typography>
              </Grid>

              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Day Win Rate
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
                  {monthWinRate > 0 ? `${monthWinRate}%` : '—'}
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.25 }}>
                  {totalMonthlyTrades > 0 ? `${formatCurrency(totalMonthlyNet / totalMonthlyTrades)} avg` : '0 trades'}
                </Typography>
              </Grid>
            </Grid>
          </Grid>

          {/* Right Column: Month Compounding Mini-Sparkline */}
          <Grid size={{ xs: 12, lg: 5 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Compounding Trajectory
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: totalMonthlyNet >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main }}>
                    {metricMode === 'INR' ? formatCurrency(totalMonthlyNet) : `${totalMonthlyR >= 0 ? '+' : ''}${totalMonthlyR.toFixed(2)}R`}
                    <Typography component="span" variant="caption" sx={{ ml: 1, color: muiTheme.palette.text.secondary, fontWeight: 600 }}>
                      (Peak: {metricMode === 'INR' ? formatCurrency(peakCumulative) : `${peakCumulative.toFixed(2)}R`})
                    </Typography>
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  icon={<ShowChartRoundedIcon sx={{ fontSize: '13px !important' }} />}
                  label={`${days.filter((d: any) => d.tradesCount > 0).length} active days`}
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.675rem' }}
                />
              </Box>

              <Box sx={{ width: '100%', height: 75 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                    <defs>
                      <linearGradient id="monthPnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={totalMonthlyNet >= 0 ? '#10B981' : '#F43F5E'} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={totalMonthlyNet >= 0 ? '#10B981' : '#F43F5E'} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <Box
                            sx={{
                              p: 1,
                              borderRadius: 1.5,
                              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                              backdropFilter: 'blur(8px)',
                              border: `1px solid ${muiTheme.palette.divider}`,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            }}
                          >
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                              Day {d.day} ({d.date})
                            </Typography>
                            <Typography variant="caption" sx={{ color: d.dailyPnL >= 0 ? '#10B981' : '#F43F5E', fontWeight: 700, display: 'block' }}>
                              Day: {metricMode === 'INR' ? formatCurrency(d.dailyPnL) : `${d.dailyR >= 0 ? '+' : ''}${d.dailyR.toFixed(2)}R`}
                            </Typography>
                            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, display: 'block' }}>
                              Cumulative: {metricMode === 'INR' ? formatCurrency(d.cumulativePnL) : `${d.cumulativeR >= 0 ? '+' : ''}${d.cumulativeR.toFixed(2)}R`}
                            </Typography>
                          </Box>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="val"
                      stroke={totalMonthlyNet >= 0 ? '#10B981' : '#F43F5E'}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#monthPnlGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Card>

      {/* Calendar Grid Card with 8-Column Layout (7 Days + Weekly Summary) */}
      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 940 }}>
            {/* Weekday headers */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr) 140px',
                borderBottom: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(248, 250, 252, 0.8)',
                py: 1.5,
                textAlign: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: muiTheme.palette.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <Box sx={{ borderLeft: `2px solid ${muiTheme.palette.divider}`, color: muiTheme.palette.primary.main, fontWeight: 800 }}>
                Week Total
              </Box>
            </Box>

            {/* Week Rows */}
            {weekRows.map((week) => (
              <Box
                key={`week-row-${week.weekNumber}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr) 140px',
                  borderBottom: `1px solid ${muiTheme.palette.divider}`,
                  '&:last-child': {
                    borderBottom: 'none',
                  },
                }}
              >
                {/* 7 Day Slots */}
                {week.slots.map((slot) => {
                  if (slot.isEmpty || !slot.day) {
                    return (
                      <Box
                        key={slot.key}
                        sx={{
                          minHeight: 115,
                          p: 1.5,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(15, 23, 42, 0.01)',
                          borderRight: `1px solid ${muiTheme.palette.divider}`,
                        }}
                      />
                    );
                  }

                  const dayItem = slot.day;
                  const hasTrades = dayItem.tradesCount > 0;
                  const isGreen = dayItem.netPnL > 0;
                  const isRed = dayItem.netPnL < 0;
                  const isSelected = selectedDate === dayItem.date;

                  return (
                    <Box
                      key={dayItem.date}
                      onClick={() => setSelectedDate(dayItem.date)}
                      sx={{
                        minHeight: 115,
                        p: 1.5,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                        borderRight: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(5, 150, 105, 0.12)'
                          : hasTrades && isGreen
                          ? muiTheme.palette.profit.bg
                          : hasTrades && isRed
                          ? muiTheme.palette.loss.bg
                          : 'transparent',
                        outline: isSelected ? `2px solid ${muiTheme.palette.primary.main}` : 'none',
                        outlineOffset: -2,
                        '&:hover': {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
                        },
                      }}
                    >
                      {/* Day Header with Date Number and Visual Discipline / Mistake Badges */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: hasTrades ? muiTheme.palette.text.primary : muiTheme.palette.text.secondary,
                          }}
                        >
                          {dayItem.dayNumber}
                        </Typography>

                        {/* Visual Discipline & Mistakes Badges */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {dayItem.mistakesCount > 0 && (
                            <Tooltip
                              title={`Rule Breaks (${dayItem.mistakesCount}): ${dayItem.mistakes?.join(', ') || 'Logged'}`}
                              arrow
                            >
                              <Box
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  px: 0.5,
                                  py: 0.1,
                                  borderRadius: 0.75,
                                  fontSize: '0.625rem',
                                  fontWeight: 800,
                                  backgroundColor: isDark ? 'rgba(244, 63, 94, 0.2)' : '#FFE4E6',
                                  color: '#F43F5E',
                                  border: '1px solid rgba(244, 63, 94, 0.3)',
                                }}
                              >
                                ⚠️ {dayItem.mistakesCount}
                              </Box>
                            </Tooltip>
                          )}

                          {dayItem.hasJournal && (
                            <Tooltip
                              title={
                                <Box sx={{ p: 0.5 }}>
                                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                    Discipline: {dayItem.disciplineRating ? `${dayItem.disciplineRating}/5` : 'Recorded'}
                                  </Typography>
                                  {dayItem.marketBias && (
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Bias: {dayItem.marketBias} | Mood: {dayItem.emotionalState || 'Calm'}
                                    </Typography>
                                  )}
                                  {dayItem.marketConditions && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                                      "{dayItem.marketConditions.slice(0, 80)}"
                                    </Typography>
                                  )}
                                </Box>
                              }
                              arrow
                            >
                              {dayItem.disciplineRating ? (
                                <Box
                                  sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    px: 0.5,
                                    py: 0.1,
                                    borderRadius: 0.75,
                                    fontSize: '0.625rem',
                                    fontWeight: 800,
                                    backgroundColor:
                                      dayItem.disciplineRating >= 4
                                        ? isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7'
                                        : dayItem.disciplineRating === 3
                                        ? isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7'
                                        : isDark ? 'rgba(244, 63, 94, 0.2)' : '#FFE4E6',
                                    color:
                                      dayItem.disciplineRating >= 4
                                        ? '#10B981'
                                        : dayItem.disciplineRating === 3
                                        ? '#F59E0B'
                                        : '#F43F5E',
                                    border: `1px solid ${
                                      dayItem.disciplineRating >= 4
                                        ? 'rgba(16, 185, 129, 0.3)'
                                        : dayItem.disciplineRating === 3
                                        ? 'rgba(245, 158, 11, 0.3)'
                                        : 'rgba(244, 63, 94, 0.3)'
                                    }`,
                                  }}
                                >
                                  {dayItem.disciplineRating >= 4 ? '⭐' : dayItem.disciplineRating === 3 ? '⚠️' : '🚨'} {dayItem.disciplineRating}.0
                                </Box>
                              ) : (
                                <Box
                                  sx={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    backgroundColor: '#3B82F6',
                                  }}
                                />
                              )}
                            </Tooltip>
                          )}
                        </Box>
                      </Box>

                      {hasTrades ? (
                        <Box sx={{ mt: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              fontFamily: `'JetBrains Mono', monospace`,
                              fontSize: '0.8125rem',
                              color: isGreen ? muiTheme.palette.profit.main : isRed ? muiTheme.palette.loss.main : muiTheme.palette.text.secondary,
                            }}
                          >
                            {metricMode === 'INR'
                              ? formatCurrency(dayItem.netPnL)
                              : `${(dayItem.totalR || 0) >= 0 ? '+' : ''}${(dayItem.totalR || 0).toFixed(2)}R`}
                          </Typography>
                          <Typography
                            variant="caption"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrill({
                                kind: 'FILTER',
                                filter: {
                                  date: dayItem.date,
                                  accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
                                },
                                label: `Trades on ${dayItem.date}`,
                              });
                            }}
                            sx={{
                              color: muiTheme.palette.text.secondary,
                              fontSize: '0.6875rem',
                              display: 'block',
                              mt: 0.25,
                              '&:hover': {
                                color: muiTheme.palette.primary.main,
                                textDecoration: 'underline',
                              },
                            }}
                          >
                            {dayItem.tradesCount} trades ({dayItem.winCount}W/{dayItem.lossCount}L)
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.disabled, fontSize: '0.6875rem' }}>
                          —
                        </Typography>
                      )}
                    </Box>
                  );
                })}

                {/* 8th Column: Weekly Roll-Up Summary Cell */}
                <Box
                  onClick={() => {
                    if (week.summary.firstDate && week.summary.lastDate) {
                      openDrill({
                        kind: 'FILTER',
                        filter: {
                          startDate: week.summary.firstDate,
                          endDate: week.summary.lastDate,
                          accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
                        },
                        label: `Trades for Week ${week.weekNumber} (${week.summary.firstDate} to ${week.summary.lastDate})`,
                      });
                    }
                  }}
                  sx={{
                    minHeight: 115,
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.025)',
                    borderLeft: `2px solid ${isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)'}`,
                    cursor: week.summary.weekTrades > 0 ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                    '&:hover': week.summary.weekTrades > 0 ? {
                      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.06)',
                    } : {},
                  }}
                >
                  {/* Week Title & Link to Weekly Review */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: muiTheme.palette.primary.main, fontSize: '0.72rem' }}>
                      Week {week.weekNumber}
                    </Typography>
                    {week.summary.firstDate && (
                      <Tooltip title="Open Full Weekly Review" arrow>
                        <IconButton
                          component={RouterLink}
                          to={`/weekly-review?date=${week.summary.firstDate}`}
                          size="small"
                          onClick={(e) => e.stopPropagation()}
                          sx={{ p: 0.25, color: muiTheme.palette.text.secondary, '&:hover': { color: muiTheme.palette.primary.main } }}
                        >
                          <OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>

                  {/* Value */}
                  {week.summary.weekTrades > 0 ? (
                    <Box sx={{ my: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          fontFamily: `'JetBrains Mono', monospace`,
                          fontSize: '0.84rem',
                          color: week.summary.weekNet >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                        }}
                      >
                        {metricMode === 'INR'
                          ? `${week.summary.weekNet >= 0 ? '+' : ''}${formatCurrency(week.summary.weekNet)}`
                          : `${week.summary.weekR >= 0 ? '+' : ''}${week.summary.weekR.toFixed(2)}R`}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography variant="caption" sx={{ fontSize: '0.675rem', color: muiTheme.palette.text.secondary }}>
                          {week.summary.weekTrades}T ({week.summary.weekWins}W/{week.summary.weekLosses}L)
                        </Typography>
                        <Chip
                          size="small"
                          label={`${week.summary.weekWinRate}%`}
                          sx={{
                            height: 16,
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            backgroundColor: week.summary.weekWinRate >= 50
                              ? isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7'
                              : isDark ? 'rgba(244, 63, 94, 0.2)' : '#FFE4E6',
                            color: week.summary.weekWinRate >= 50 ? '#10B981' : '#F43F5E',
                          }}
                        />
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.disabled, fontSize: '0.6875rem' }}>
                      No trades
                    </Typography>
                  )}

                  <Typography variant="caption" sx={{ fontSize: '0.62rem', color: muiTheme.palette.text.secondary }}>
                    {week.summary.firstDate ? `${week.summary.firstDate.slice(8)} – ${week.summary.lastDate?.slice(8)}` : ''}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Card>

      {/* Daily Review & Day Details Dialog */}
      <Dialog
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        maxWidth="md"
        fullWidth
        scroll="paper"
        slotProps={{
          paper: { sx: { borderRadius: 3, maxHeight: '90vh' } },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(248, 250, 252, 0.8)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CalendarMonthIcon sx={{ color: muiTheme.palette.primary.main }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                Daily Review for {selectedDate}
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Post-session audit, trade outcomes, and discipline reflection
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setSelectedDate(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          {saveError && (
            <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}
          <Grid container spacing={3}>
            {/* Left: Day Executions */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary }}>
                  Trades Executed ({dayDetails?.trades?.length || 0})
                </Typography>
                {dayDetails?.trades && dayDetails.trades.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      openDrill({
                        kind: 'FILTER',
                        filter: { date: selectedDate! },
                        label: `Trades on ${selectedDate}`,
                      });
                    }}
                    sx={{ fontSize: '0.6875rem', textTransform: 'none', py: 0 }}
                  >
                    Drill All in Drawer
                  </Button>
                )}
              </Box>

              {isDayLoading ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : dayDetails?.trades?.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center', borderRadius: 2, border: `1px dashed ${muiTheme.palette.divider}` }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    No trades executed on this date.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 380, overflowY: 'auto' }}>
                  {dayDetails?.trades?.map((t: any) => (
                    <Box
                      key={t._id}
                      onClick={() =>
                        openDrill({
                          kind: 'TRADE',
                          tradeId: t._id,
                          label: `${t.symbol} Trade`,
                        })
                      }
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                        cursor: 'pointer',
                        color: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: muiTheme.palette.primary.main,
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={t.direction}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.625rem',
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
                          <TradeInstrumentBadge
                            trade={t}
                            size="small"
                            showSubtitle={false}
                          />
                        </Box>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, pl: 0.25 }}>
                          {t.strategyName || 'Discretionary'}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: (t.calculated?.netPnL || 0) > 0 ? muiTheme.palette.profit.main : (t.calculated?.netPnL || 0) < 0 ? muiTheme.palette.loss.main : muiTheme.palette.text.secondary,
                        }}
                      >
                        {formatCurrency(t.calculated?.netPnL)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Grid>

            {/* Right: Daily Reflection Form */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AutoAwesomeIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                  Daily Session Reflection
                </Typography>
                {dayDetails?.prefill && (
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<AutoAwesomeIcon fontSize="small" />}
                    onClick={handleApplyPrefill}
                    sx={{ fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    Auto-Prefill Session
                  </Button>
                )}
              </Box>

              {dayDetails?.prefill?.dailyLossBreach?.breached && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
                  {dayDetails.prefill.dailyLossBreach.message}
                </Alert>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                      Market Bias
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={marketBias}
                        onChange={(e: any) => setMarketBias(e.target.value)}
                      >
                        <MenuItem value="BULLISH">BULLISH</MenuItem>
                        <MenuItem value="BEARISH">BEARISH</MenuItem>
                        <MenuItem value="NEUTRAL">NEUTRAL</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary }}>
                        Discipline Rating (1-5)
                      </Typography>
                      <HelpHint hintKey="journal.disciplineScore" />
                    </Box>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={disciplineRating}
                        onChange={(e) => setDisciplineRating(Number(e.target.value))}
                      >
                        <MenuItem value={5}>5 - Flawless Execution</MenuItem>
                        <MenuItem value={4}>4 - Good Execution</MenuItem>
                        <MenuItem value={3}>3 - Hesitant / Incomplete</MenuItem>
                        <MenuItem value={2}>2 - Rule Violation</MenuItem>
                        <MenuItem value={1}>1 - Severe Tilt / Loss</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                {/* Best & Worst Trade Selectors */}
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                      Best Trade of Day
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={bestTradeId}
                        displayEmpty
                        onChange={(e) => setBestTradeId(e.target.value)}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {(dayDetails?.trades || []).map((t: any) => (
                          <MenuItem key={t._id} value={t._id}>
                            {t.symbol} ({formatCurrency(t.calculated?.netPnL)})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                      Worst Trade of Day
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={worstTradeId}
                        displayEmpty
                        onChange={(e) => setWorstTradeId(e.target.value)}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {(dayDetails?.trades || []).map((t: any) => (
                          <MenuItem key={t._id} value={t._id}>
                            {t.symbol} ({formatCurrency(t.calculated?.netPnL)})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                {/* Aggregated Mistakes / Rule Breaks (Grouped by Category) */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary }}>
                    Session Mistake / Rule Break Tags ({mistakes.length} selected)
                  </Typography>

                  {[
                    { cat: 'LIQUIDITY_LEVEL', title: '1. Liquidity & Structural Levels (S/R)' },
                    { cat: 'EXECUTION_TIMING', title: '2. Execution & Entry Timing' },
                    { cat: 'RISK_DISCIPLINE', title: '3. Risk Management & Discipline' },
                    { cat: 'SESSION_CONTEXT', title: '4. Session & Macro Context' },
                  ].map((grp) => {
                    const items = MISTAKE_TAGS.filter((m) => m.category === grp.cat);
                    return (
                      <Box
                        key={grp.cat}
                        sx={{
                          p: 1.25,
                          borderRadius: 1.5,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            fontSize: '0.625rem',
                            color: muiTheme.palette.text.secondary,
                            display: 'block',
                            mb: 0.75,
                          }}
                        >
                          {grp.title}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          {items.map((m) => {
                            const isSelected = mistakes.includes(m.value);
                            return (
                              <Chip
                                key={m.value}
                                label={m.label}
                                size="small"
                                color={isSelected ? 'error' : 'default'}
                                variant={isSelected ? 'filled' : 'outlined'}
                                onClick={() => {
                                  if (isSelected) {
                                    setMistakes(mistakes.filter((tag) => tag !== m.value));
                                  } else {
                                    setMistakes([...mistakes, m.value]);
                                  }
                                }}
                                sx={{
                                  cursor: 'pointer',
                                  fontSize: '0.6875rem',
                                  fontWeight: isSelected ? 700 : 500,
                                }}
                              />
                            );
                          })}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                    Market Conditions & Context
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={marketConditions}
                    onChange={(e) => setMarketConditions(e.target.value)}
                    placeholder="e.g. Range-bound morning session, clean trend reversal post-noon"
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                    Lessons Learned & Psychological Feedback
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    value={lessonsLearned}
                    onChange={(e) => setLessonsLearned(e.target.value)}
                    placeholder="What did the market do right? What emotional state did I experience?"
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                    Next Session Action Plan
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={nextDayPlan}
                    onChange={(e) => setNextDayPlan(e.target.value)}
                    placeholder="Key levels to monitor tomorrow, risk guardrails to enforce"
                  />
                </Box>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${muiTheme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {dayDetails?.journal && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                disabled={deleteJournalMutation.isPending || saveJournalMutation.isPending}
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                {deleteJournalMutation.isPending ? 'Deleting...' : 'Delete Entry'}
              </Button>
            )}
            {saveSuccess && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: muiTheme.palette.primary.main }}>
                <CheckCircleIcon fontSize="small" />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Daily reflection saved successfully
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button variant="outlined" onClick={() => setSelectedDate(null)}>
              Close
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={saveJournalMutation.isPending}
              onClick={() => {
                saveJournalMutation.mutate({
                  marketConditions,
                  marketBias,
                  emotionalState,
                  disciplineRating,
                  lessonsLearned,
                  nextDayPlan,
                  bestTradeId: bestTradeId || undefined,
                  worstTradeId: worstTradeId || undefined,
                  mistakes,
                });
              }}
            >
              {saveJournalMutation.isPending ? 'Saving...' : 'Save Reflection'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        title="Delete Daily Reflection"
        message={
          <>
            Are you sure you want to permanently delete the journal review and psychological reflection for <strong>{selectedDate}</strong>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Reflection"
        isLoading={deleteJournalMutation.isPending}
        error={saveError}
        onCancel={() => {
          if (!deleteJournalMutation.isPending) {
            setIsDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => {
          deleteJournalMutation.mutate();
        }}
      />
    </Box>
  );
}
