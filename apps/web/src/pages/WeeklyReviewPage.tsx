import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import LockIcon from '@mui/icons-material/LockRounded';
import LockOpenIcon from '@mui/icons-material/LockOpenRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlatRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';

import {
  isoWeekToRange,
  dateToIsoWeek,
  getAdjacentIsoWeek,
  IWeeklyReview,
  IWeeklyReviewSnapshot,
  IFocusRule,
  IFocusRuleEvaluation,
} from '@tradevault/shared';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent, formatR, formatDate } from '../lib/utils.js';
import { toast } from '../context/ToastContext.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { HelpHint } from '../components/help/index.js';

const COMMON_FOCUS_RULES = [
  {
    code: 'RULE_MAX_DAILY_LOSS',
    text: 'Stop trading immediately for the day if maximum daily loss limit is hit',
    metric: { type: 'DAILY_LOSS_BREACH', target: 0 },
  },
  {
    code: 'RULE_REVENGE_TRADING',
    text: 'Wait at least 30 minutes and step away from charts after any losing trade',
    metric: { type: 'MISTAKE_COUNT', tag: 'REVENGE_TRADING', target: 0 },
  },
  {
    code: 'RULE_STOP_MOVED',
    text: 'Never widen or cancel an initial hard stop loss under any circumstances',
    metric: { type: 'MISTAKE_COUNT', tag: 'STOP_MOVED', target: 0 },
  },
  {
    code: 'RULE_OVERTRADING',
    text: 'Strictly cap trades at maximum 4 executions per day',
    metric: { type: 'MISTAKE_COUNT', tag: 'OVERTRADING', target: 0 },
  },
  {
    code: 'RULE_SIZE_VIOLATION',
    text: 'Size every position strictly to risk exactly 1% of total account capital',
    metric: { type: 'MISTAKE_COUNT', tag: 'SIZE_VIOLATION', target: 0 },
  },
  {
    code: 'RULE_FOMO_ENTRY',
    text: 'Wait for confirmed setup triggers at key levels; never chase breakouts',
    metric: { type: 'MISTAKE_COUNT', tag: 'FOMO_ENTRY', target: 0 },
  },
  {
    code: 'RULE_PREMATURE_EXIT',
    text: 'Hold winning trades to full planned technical target or invalidation',
    metric: { type: 'MISTAKE_COUNT', tag: 'PREMATURE_EXIT', target: 0 },
  },
];

export function WeeklyReviewPage() {
  const { openDrill } = useTradeDrilldown();
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  // Outlet context for account switcher
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>() || { selectedAccountId: 'ALL' };

  // URL Query Param '?week=YYYY-Www'
  const [searchParams, setSearchParams] = useSearchParams();
  const weekParam = searchParams.get('week');

  const defaultWeek = useMemo(() => {
    try {
      return getAdjacentIsoWeek(dateToIsoWeek(new Date()), -1);
    } catch {
      return '2026-W43';
    }
  }, []);

  const currentWeek =
    weekParam && /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(weekParam) ? weekParam : defaultWeek;

  // Compute IST Date Range
  const dateRange = useMemo(() => {
    try {
      return isoWeekToRange(currentWeek);
    } catch {
      return { startDate: '2026-10-19', endDate: '2026-10-25' };
    }
  }, [currentWeek]);

  // Form State
  const [focusRuleSource, setFocusRuleSource] = useState<'SUGGESTED' | 'CUSTOM'>('SUGGESTED');
  const [focusRuleCode, setFocusRuleCode] = useState<string>('');
  const [focusRuleText, setFocusRuleText] = useState<string>('');
  const [focusRuleMetric, setFocusRuleMetric] = useState<any>(undefined);
  const [reflectionNotes, setReflectionNotes] = useState<string>('');
  const [overrideFollowed, setOverrideFollowed] = useState<boolean | null>(null);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState<boolean>(false);

  // TanStack Query
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['weekly-review', currentWeek, selectedAccountId],
    queryFn: () =>
      api.review.getWeekly(
        currentWeek,
        selectedAccountId !== 'ALL' ? selectedAccountId : undefined
      ),
  });

  const review: IWeeklyReview | null = data?.review || null;
  const snapshot: IWeeklyReviewSnapshot | null = data?.snapshot || null;
  const previousFocusRule: IFocusRule | null = data?.previousFocusRule || null;
  const previousFocusEvaluation: IFocusRuleEvaluation | null =
    data?.previousFocusEvaluation || null;

  // Initialize/Sync Form State from API
  useEffect(() => {
    if (!snapshot) return;

    if (review?.focusRule) {
      setFocusRuleSource(review.focusRule.source || 'CUSTOM');
      setFocusRuleCode(review.focusRule.code || '');
      setFocusRuleText(review.focusRule.text || '');
      setFocusRuleMetric(review.focusRule.metric);
    } else if (snapshot.focusRuleSuggestion) {
      setFocusRuleSource('SUGGESTED');
      setFocusRuleCode(snapshot.focusRuleSuggestion.code || '');
      setFocusRuleText(snapshot.focusRuleSuggestion.text || '');
      setFocusRuleMetric(snapshot.focusRuleSuggestion.metric);
    }

    if (review?.notes !== undefined) {
      setReflectionNotes(review.notes || '');
    } else {
      setReflectionNotes('');
    }

    if (review?.previousFocusEvaluation?.followed !== undefined) {
      setOverrideFollowed(review.previousFocusEvaluation.followed);
    } else if (previousFocusEvaluation?.followed !== undefined) {
      setOverrideFollowed(previousFocusEvaluation.followed);
    } else {
      setOverrideFollowed(null);
    }
  }, [review, snapshot, previousFocusEvaluation]);

  // Week Navigation Handlers
  const handlePrevWeek = () => {
    const prev = getAdjacentIsoWeek(currentWeek, -1);
    setSearchParams({ week: prev });
  };

  const handleNextWeek = () => {
    const next = getAdjacentIsoWeek(currentWeek, 1);
    setSearchParams({ week: next });
  };

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async (targetStatus: 'DRAFT' | 'FINALIZED') => {
      const payload = {
        focusRule: {
          code: focusRuleCode || 'CUSTOM_FOCUS',
          text: focusRuleText || 'Execute trade playbook with discipline',
          metric: focusRuleMetric,
          source: focusRuleSource,
        },
        notes: reflectionNotes,
        status: targetStatus,
        followedLastRule: overrideFollowed,
      };
      return api.review.saveWeekly(
        currentWeek,
        payload,
        selectedAccountId !== 'ALL' ? selectedAccountId : undefined
      );
    },
    onSuccess: (_, targetStatus) => {
      queryClient.invalidateQueries({ queryKey: ['weekly-review', currentWeek] });
      queryClient.invalidateQueries({ queryKey: ['weekly-reviews'] });
      setIsFinalizeDialogOpen(false);
      if (targetStatus === 'FINALIZED') {
        toast.success(`Week ${currentWeek} successfully finalized and snapshot frozen.`);
      } else {
        toast.success(`Draft saved for Week ${currentWeek}.`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save weekly review.');
    },
  });

  const isFinalized = review?.status === 'FINALIZED';

  // Format Helper for Week Display
  const formattedDateRange = `${formatDate(dateRange.startDate)} – ${formatDate(
    dateRange.endDate
  )}`;

  // Loading State
  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton variant="rounded" height={70} />
        <Skeleton variant="rounded" height={130} />
        <Skeleton variant="rounded" height={100} />
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={320} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={320} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (isError || !snapshot) {
    return (
      <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load weekly review.'}
        </Alert>
        <Button variant="outlined" onClick={() => refetch()}>
          Retry
        </Button>
      </Box>
    );
  }

  const { weekSummary, vsPreviousWeek, mistakes, templates, discipline, riskEvents, sessionsAndWeekdays } =
    snapshot;

  return (
    <Box
      sx={{
        maxWidth: 1400,
        mx: 'auto',
        p: { xs: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 3.5,
      }}
    >
      {/* 1. WEEK SELECTOR & HEADER */}
      <Card
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 3,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          background: isDark
            ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)'
            : 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.12)',
          boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        {/* Navigation Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title="Previous ISO Week">
            <IconButton
              onClick={handlePrevWeek}
              size="medium"
              sx={{
                border: `1px solid ${muiTheme.palette.divider}`,
                borderRadius: 2,
                '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
          </Tooltip>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CalendarMonthIcon sx={{ color: 'primary.main', fontSize: 28 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                  {currentWeek}
                </Typography>
                <HelpHint hintKey="review.weekly" />
                <Chip
                  icon={isFinalized ? <LockIcon sx={{ fontSize: '14px !important' }} /> : <LockOpenIcon sx={{ fontSize: '14px !important' }} />}
                  label={isFinalized ? 'FINALIZED' : 'DRAFT'}
                  size="small"
                  color={isFinalized ? 'success' : 'warning'}
                  variant={isFinalized ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                />
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                {formattedDateRange} (IST)
              </Typography>
            </Box>
          </Box>

          <Tooltip title="Next ISO Week">
            <IconButton
              onClick={handleNextWeek}
              size="medium"
              sx={{
                border: `1px solid ${muiTheme.palette.divider}`,
                borderRadius: 2,
                '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {isFinalized && review?.updatedAt && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>
              Frozen on {new Date(review.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Typography>
          )}

          <Button
            variant="outlined"
            startIcon={<SaveRoundedIcon />}
            onClick={() => saveMutation.mutate('DRAFT')}
            disabled={saveMutation.isPending}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Draft'}
          </Button>

          <Button
            variant="contained"
            color={isFinalized ? 'inherit' : 'success'}
            startIcon={<DoneAllRoundedIcon />}
            onClick={() => setIsFinalizeDialogOpen(true)}
            disabled={saveMutation.isPending}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              backgroundColor: isFinalized ? undefined : '#059669',
              '&:hover': { backgroundColor: isFinalized ? undefined : '#047857' },
            }}
          >
            {isFinalized ? 'Re-Finalize' : 'Finalize Week'}
          </Button>
        </Box>
      </Card>

      {/* EMPTY WEEK ALERT */}
      {snapshot.isEmpty && (
        <Alert severity="info" sx={{ borderRadius: 2, fontWeight: 500 }}>
          No closed trades were recorded in week {currentWeek} ({formattedDateRange}). You can still set your focus rule and record reflection notes below.
        </Alert>
      )}

      {/* 2. KPI STRIP WITH DELTAS VS PREVIOUS WEEK */}
      <Grid container spacing={2}>
        {/* Net P&L */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            variant="outlined"
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { startDate: dateRange.startDate, endDate: dateRange.endDate, status: 'CLOSED' },
                label: `Week ${currentWeek} All Closed Trades`,
              })
            }
            sx={{
              p: 2.2,
              borderRadius: 3,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(0,0,0,0.06)',
                borderColor: weekSummary.netPnL >= 0 ? '#10B981' : '#F43F5E',
              },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Net P&amp;L
              </Typography>
              <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                color: weekSummary.netPnL >= 0 ? '#10B981' : '#F43F5E',
                fontFamily: 'monospace',
                mb: 0.5,
              }}
            >
              {formatCurrency(weekSummary.netPnL)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {vsPreviousWeek.deltaNetPnL > 0 ? (
                <TrendingUpIcon sx={{ color: '#10B981', fontSize: 16 }} />
              ) : vsPreviousWeek.deltaNetPnL < 0 ? (
                <TrendingDownIcon sx={{ color: '#F43F5E', fontSize: 16 }} />
              ) : (
                <TrendingFlatIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: vsPreviousWeek.deltaNetPnL >= 0 ? '#10B981' : '#F43F5E',
                }}
              >
                {vsPreviousWeek.deltaNetPnL >= 0 ? '+' : ''}
                {formatCurrency(vsPreviousWeek.deltaNetPnL)} vs prev week
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* Win Rate */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            variant="outlined"
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { startDate: dateRange.startDate, endDate: dateRange.endDate, outcome: 'WIN' },
                label: `Week ${currentWeek} Winning Trades`,
              })
            }
            sx={{
              p: 2.2,
              borderRadius: 3,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(0,0,0,0.06)',
                borderColor: '#10B981',
              },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Win Rate
              </Typography>
              <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace', mb: 0.5 }}>
              {formatPercent(weekSummary.winRate)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {vsPreviousWeek.deltaWinRate > 0 ? (
                <TrendingUpIcon sx={{ color: '#10B981', fontSize: 16 }} />
              ) : vsPreviousWeek.deltaWinRate < 0 ? (
                <TrendingDownIcon sx={{ color: '#F43F5E', fontSize: 16 }} />
              ) : (
                <TrendingFlatIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: vsPreviousWeek.deltaWinRate >= 0 ? '#10B981' : '#F43F5E',
                }}
              >
                {vsPreviousWeek.deltaWinRate >= 0 ? '+' : ''}
                {formatPercent(vsPreviousWeek.deltaWinRate)} vs prev week
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* Avg Realized R */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            variant="outlined"
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { startDate: dateRange.startDate, endDate: dateRange.endDate, status: 'CLOSED' },
                label: `Week ${currentWeek} Closed Trades`,
              })
            }
            sx={{
              p: 2.2,
              borderRadius: 3,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(0,0,0,0.06)',
                borderColor: '#0EA5E9',
              },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Avg Realized R
              </Typography>
              <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace', mb: 0.5 }}>
              {formatR(weekSummary.avgRealizedR)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {vsPreviousWeek.deltaAvgRealizedR > 0 ? (
                <TrendingUpIcon sx={{ color: '#10B981', fontSize: 16 }} />
              ) : vsPreviousWeek.deltaAvgRealizedR < 0 ? (
                <TrendingDownIcon sx={{ color: '#F43F5E', fontSize: 16 }} />
              ) : (
                <TrendingFlatIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: vsPreviousWeek.deltaAvgRealizedR >= 0 ? '#10B981' : '#F43F5E',
                }}
              >
                {vsPreviousWeek.deltaAvgRealizedR >= 0 ? '+' : ''}
                {formatR(vsPreviousWeek.deltaAvgRealizedR)} vs prev week
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* Profit Factor & Max DD */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            variant="outlined"
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { startDate: dateRange.startDate, endDate: dateRange.endDate, status: 'CLOSED' },
                label: `Week ${currentWeek} Closed Trades`,
              })
            }
            sx={{
              p: 2.2,
              borderRadius: 3,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(0,0,0,0.06)',
                borderColor: '#8B5CF6',
              },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Profit Factor / Max DD
              </Typography>
              <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace', mb: 0.5 }}>
              {weekSummary.profitFactor >= 999
                ? '999.99'
                : Number(weekSummary.profitFactor).toFixed(2)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Max DD: {formatCurrency(weekSummary.maxDrawdown)} ({weekSummary.tradeCount} trades, {formatPercent(weekSummary.rCoveragePercent)} R-cov)
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* 3. LAST WEEK'S RULE: FOLLOWED / NOT FOLLOWED CARD */}
      <Card
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 3,
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
          borderColor:
            overrideFollowed === true
              ? 'rgba(16, 185, 129, 0.4)'
              : overrideFollowed === false
              ? 'rgba(244, 63, 94, 0.4)'
              : muiTheme.palette.divider,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RuleRoundedIcon sx={{ color: 'primary.main', fontSize: 22 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Last Week&apos;s Focus Rule
            </Typography>
            <HelpHint hintKey="review.focusRule" />
          </Box>
          {previousFocusRule ? (
            <Chip
              icon={
                overrideFollowed === true ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: '16px !important' }} />
                ) : overrideFollowed === false ? (
                  <CancelRoundedIcon sx={{ fontSize: '16px !important' }} />
                ) : (
                  <HelpOutlineRoundedIcon sx={{ fontSize: '16px !important' }} />
                )
              }
              label={
                overrideFollowed === true
                  ? 'RULE FOLLOWED'
                  : overrideFollowed === false
                  ? 'NOT FOLLOWED'
                  : 'UNMEASURED'
              }
              color={
                overrideFollowed === true
                  ? 'success'
                  : overrideFollowed === false
                  ? 'error'
                  : 'default'
              }
              sx={{ fontWeight: 800, fontSize: '0.75rem' }}
            />
          ) : null}
        </Box>

        {previousFocusRule ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
              &ldquo;{previousFocusRule.text}&rdquo;
            </Typography>
            {previousFocusEvaluation?.note && (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Evaluation Note: {previousFocusEvaluation.note}
                {previousFocusEvaluation.target !== undefined &&
                  ` (Target: ${previousFocusEvaluation.target}, Actual: ${previousFocusEvaluation.actual ?? 0})`}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={overrideFollowed === true}
                    onChange={(e) => setOverrideFollowed(e.target.checked)}
                    color="success"
                  />
                }
                label={
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Manual Adherence Override ({overrideFollowed === true ? 'Followed' : 'Not Followed'})
                  </Typography>
                }
              />
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            No focus rule was recorded for the preceding week. Set your rule for next week below!
          </Typography>
        )}
      </Card>

      {/* 4. TOP MISTAKES BY ₹ COST */}
      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PsychologyRoundedIcon sx={{ color: '#F43F5E', fontSize: 24 }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Top Mistakes by ₹ Loss
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Quantified total capital eroded by behavioural slip-ups this week
              </Typography>
            </Box>
          </Box>
          {mistakes.topMistake && (
            <Chip
              label={`Biggest Leak: ${mistakes.topMistake.tag} (-${formatCurrency(mistakes.topMistake.totalLoss)})`}
              color="error"
              size="small"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          )}
        </Box>

        {mistakes.items.length === 0 ? (
          <Box
            sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
              borderRadius: 2,
              border: `1px dashed ${isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.3)'}`,
            }}
          >
            <CheckCircleRoundedIcon sx={{ color: '#10B981', fontSize: 32, mb: 1 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#10B981' }}>
              Clean execution! No mistake reflection tags recorded on losses this week.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Mistake Tag</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Trade Count</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total ₹ Loss</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mistakes.items.map((m) => (
                  <TableRow
                    key={m.tag}
                    hover
                    sx={{
                      cursor: m.tradeIds.length > 0 ? 'pointer' : 'default',
                      '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' },
                    }}
                    onClick={() => {
                      if (m.tradeIds.length > 0) {
                        openDrill({
                          kind: 'TRADES',
                          tradeIds: m.tradeIds,
                          label: `Mistake: ${m.tag} Trades`,
                        });
                      }
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={m.tag}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            backgroundColor: isDark ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 63, 94, 0.1)',
                            color: '#F43F5E',
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {m.count}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#F43F5E', fontFamily: 'monospace' }}>
                      -{formatCurrency(m.totalLoss)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        disabled={m.tradeIds.length === 0}
                        endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 14 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (m.tradeIds.length > 0) {
                            openDrill({
                              kind: 'TRADES',
                              tradeIds: m.tradeIds,
                              label: `Mistake: ${m.tag} Trades`,
                            });
                          }
                        }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* 5. BEST / WORST SETUPS (TEMPLATES & STRATEGIES) */}
      <Grid container spacing={3}>
        {/* Best Setup */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            variant="outlined"
            onClick={() => {
              if (templates.bestTemplate && templates.bestTemplate.tradeIds.length > 0) {
                openDrill({
                  kind: 'TRADES',
                  tradeIds: templates.bestTemplate.tradeIds,
                  label: `Best Setup: ${templates.bestTemplate.name} Trades`,
                });
              }
            }}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: templates.bestTemplate && templates.bestTemplate.tradeIds.length > 0 ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              '&:hover': templates.bestTemplate && templates.bestTemplate.tradeIds.length > 0
                ? {
                    transform: 'translateY(-2px)',
                    borderColor: '#10B981',
                    boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(0,0,0,0.06)',
                  }
                : {},
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmojiEventsRoundedIcon sx={{ color: '#10B981', fontSize: 24 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Best Setup (Empirical-Bayes Expectancy)
                </Typography>
              </Box>
              {templates.bestTemplate && templates.bestTemplate.tradeIds.length > 0 && (
                <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              )}
            </Box>

            {templates.bestTemplate ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {templates.bestTemplate.name}
                  </Typography>
                  <Chip
                    label={`n = ${templates.bestTemplate.n}`}
                    size="small"
                    sx={{ fontWeight: 700, fontFamily: 'monospace' }}
                  />
                </Box>

                {templates.bestTemplate.sampleSizeWarning && (
                  <Chip
                    label="Sample < 30 (EB Shrunk Expectancy)"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ fontWeight: 600, width: 'fit-content' }}
                  />
                )}

                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Shrunk Expectancy
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#10B981', fontFamily: 'monospace' }}>
                      {formatCurrency(templates.bestTemplate.shrunkExpectancy)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Win Rate
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {formatPercent(templates.bestTemplate.winRate)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Net P&amp;L
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        color: templates.bestTemplate.netPnL >= 0 ? '#10B981' : '#F43F5E',
                        fontFamily: 'monospace',
                      }}
                    >
                      {formatCurrency(templates.bestTemplate.netPnL)}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No template setups classified in closed trades this week.
              </Typography>
            )}
          </Card>
        </Grid>

        {/* Worst Setup */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            variant="outlined"
            onClick={() => {
              if (templates.worstTemplate && templates.worstTemplate.tradeIds.length > 0) {
                openDrill({
                  kind: 'TRADES',
                  tradeIds: templates.worstTemplate.tradeIds,
                  label: `Worst Setup: ${templates.worstTemplate.name} Trades`,
                });
              }
            }}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: templates.worstTemplate && templates.worstTemplate.tradeIds.length > 0 ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              '&:hover': templates.worstTemplate && templates.worstTemplate.tradeIds.length > 0
                ? {
                    transform: 'translateY(-2px)',
                    borderColor: '#F43F5E',
                    boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(0,0,0,0.06)',
                  }
                : {},
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningAmberRoundedIcon sx={{ color: '#F43F5E', fontSize: 24 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Worst Setup (Review or Pause)
                </Typography>
              </Box>
              {templates.worstTemplate && templates.worstTemplate.tradeIds.length > 0 && (
                <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              )}
            </Box>

            {templates.worstTemplate ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {templates.worstTemplate.name}
                  </Typography>
                  <Chip
                    label={`n = ${templates.worstTemplate.n}`}
                    size="small"
                    sx={{ fontWeight: 700, fontFamily: 'monospace' }}
                  />
                </Box>

                {templates.worstTemplate.sampleSizeWarning && (
                  <Chip
                    label="Sample < 30 (EB Shrunk Expectancy)"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ fontWeight: 600, width: 'fit-content' }}
                  />
                )}

                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Shrunk Expectancy
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#F43F5E', fontFamily: 'monospace' }}>
                      {formatCurrency(templates.worstTemplate.shrunkExpectancy)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Win Rate
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {formatPercent(templates.worstTemplate.winRate)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Net P&amp;L
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        color: templates.worstTemplate.netPnL >= 0 ? '#10B981' : '#F43F5E',
                        fontFamily: 'monospace',
                      }}
                    >
                      {formatCurrency(templates.worstTemplate.netPnL)}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No underperforming template setup detected this week.
              </Typography>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* 6. DISCIPLINE & RISK EVENTS */}
      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityRoundedIcon sx={{ color: '#0EA5E9', fontSize: 24 }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Discipline &amp; Risk Guardrail Events
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Process adherence, daily loss breaches, tilt episodes, and journal coverage
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`Avg Discipline: ${discipline.averageRating}% (${discipline.trendDirection})`}
              color={discipline.averageRating >= 80 ? 'success' : discipline.averageRating >= 60 ? 'warning' : 'error'}
              sx={{ fontWeight: 800 }}
            />
          </Box>
        </Box>

        {/* Risk Event Badges Strip */}
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {/* Daily Loss Breaches */}
          {(() => {
            const breachCount = riskEvents.dailyLossBreaches.length;
            const breachTradeIds = riskEvents.dailyLossBreaches.flatMap((b) => b.tradeIds);
            return (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box
                  onClick={() => {
                    if (breachTradeIds.length > 0) {
                      openDrill({
                        kind: 'TRADES',
                        tradeIds: breachTradeIds,
                        label: 'Daily Loss Breach Trades',
                      });
                    }
                  }}
                  sx={{
                    p: 1.8,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: breachCount > 0 ? '#F43F5E' : muiTheme.palette.divider,
                    backgroundColor: breachCount > 0 ? (isDark ? 'rgba(244, 63, 94, 0.1)' : 'rgba(244, 63, 94, 0.05)') : 'transparent',
                    cursor: breachTradeIds.length > 0 ? 'pointer' : 'default',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Daily Loss Breaches
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: breachCount > 0 ? '#F43F5E' : 'text.primary' }}>
                    {breachCount} days
                  </Typography>
                </Box>
              </Grid>
            );
          })()}

          {/* High Tilt Days */}
          {(() => {
            const tiltCount = riskEvents.highTiltDays.length;
            const tiltTradeIds = riskEvents.highTiltDays.map((t) => t.tradeId);
            return (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box
                  onClick={() => {
                    if (tiltTradeIds.length > 0) {
                      openDrill({
                        kind: 'TRADES',
                        tradeIds: tiltTradeIds,
                        label: 'High Tilt Session Trades',
                      });
                    }
                  }}
                  sx={{
                    p: 1.8,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: tiltCount > 0 ? '#F59E0B' : muiTheme.palette.divider,
                    backgroundColor: tiltCount > 0 ? (isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)') : 'transparent',
                    cursor: tiltTradeIds.length > 0 ? 'pointer' : 'default',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    High-Tilt Sessions (&ge;61)
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: tiltCount > 0 ? '#F59E0B' : 'text.primary' }}>
                    {tiltCount} days
                  </Typography>
                </Box>
              </Grid>
            );
          })()}

          {/* Overtrading Days */}
          {(() => {
            const overtradingCount = riskEvents.overtradingDays.length;
            const overtradingTradeIds = riskEvents.overtradingDays.flatMap((o) => o.tradeIds);
            return (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box
                  onClick={() => {
                    if (overtradingTradeIds.length > 0) {
                      openDrill({
                        kind: 'TRADES',
                        tradeIds: overtradingTradeIds,
                        label: 'Overtrading Session Trades',
                      });
                    }
                  }}
                  sx={{
                    p: 1.8,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: overtradingCount > 0 ? '#F43F5E' : muiTheme.palette.divider,
                    backgroundColor: overtradingCount > 0 ? (isDark ? 'rgba(244, 63, 94, 0.1)' : 'rgba(244, 63, 94, 0.05)') : 'transparent',
                    cursor: overtradingTradeIds.length > 0 ? 'pointer' : 'default',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Overtrading Days
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: overtradingCount > 0 ? '#F43F5E' : 'text.primary' }}>
                    {overtradingCount} days
                  </Typography>
                </Box>
              </Grid>
            );
          })()}

          {/* Days Without Journal */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 1.8,
                borderRadius: 2,
                border: '1px solid',
                borderColor: riskEvents.unjournaledDaysCount > 0 ? '#F59E0B' : muiTheme.palette.divider,
                backgroundColor: riskEvents.unjournaledDaysCount > 0 ? (isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)') : 'transparent',
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Unjournaled Trading Days
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: riskEvents.unjournaledDaysCount > 0 ? '#F59E0B' : 'text.primary' }}>
                {riskEvents.unjournaledDaysCount} days
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Daily Discipline Strip */}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
          Daily Adherence Log
        </Typography>
        <Grid container spacing={1.5}>
          {discipline.dailyRatings.map((d) => (
            <Grid key={d.date} size={{ xs: 12, sm: 6, md: 12 / 7 }}>
              <Box
                onClick={() =>
                  openDrill({
                    kind: 'FILTER',
                    filter: { date: d.date, status: 'CLOSED' },
                    label: `${d.date} Trades`,
                  })
                }
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${muiTheme.palette.divider}`,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                  },
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' })} ({d.date.slice(5)})
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color:
                      d.rating === null
                        ? 'text.secondary'
                        : d.rating >= 80
                        ? '#10B981'
                        : d.rating >= 60
                        ? '#F59E0B'
                        : '#F43F5E',
                  }}
                >
                  {d.rating !== null ? `${d.rating}%` : '—'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {d.tradesCount} trades {d.hasJournal ? '• Journaled' : '• No Log'}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Card>

      {/* 7. WEEKDAY / SESSION BREAKDOWN */}
      <Grid container spacing={3}>
        {/* By Weekday */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Performance by Weekday
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Day</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Trades</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Win Rate</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Net P&amp;L</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessionsAndWeekdays.byWeekday.map((row) => (
                    <TableRow
                      key={row.day}
                      hover
                      sx={{
                        cursor: row.tradeIds.length > 0 ? 'pointer' : 'default',
                        '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' },
                      }}
                      onClick={() => {
                        if (row.tradeIds.length > 0) {
                          openDrill({
                            kind: 'TRADES',
                            tradeIds: row.tradeIds,
                            label: `${row.day} Trades`,
                          });
                        }
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>
                        {row.day}
                        {sessionsAndWeekdays.bestWeekday?.day === row.day && (
                          <Chip label="Best" size="small" color="success" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
                        )}
                        {sessionsAndWeekdays.worstWeekday?.day === row.day && (
                          <Chip label="Worst" size="small" color="error" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
                        )}
                      </TableCell>
                      <TableCell align="right">{row.tradesCount}</TableCell>
                      <TableCell align="right">{formatPercent(row.winRate)}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          color: row.netPnL >= 0 ? '#10B981' : '#F43F5E',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatCurrency(row.netPnL)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>

        {/* By Session */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Performance by Market Session
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Session</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Trades</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Win Rate</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Net P&amp;L</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessionsAndWeekdays.bySession.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                        No session data available this week.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessionsAndWeekdays.bySession.map((row) => (
                      <TableRow
                        key={row.session}
                        hover
                        sx={{
                          cursor: row.tradeIds.length > 0 ? 'pointer' : 'default',
                          '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' },
                        }}
                        onClick={() => {
                          if (row.tradeIds.length > 0) {
                            openDrill({
                              kind: 'TRADES',
                              tradeIds: row.tradeIds,
                              label: `${row.session} Session Trades`,
                            });
                          }
                        }}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>
                          {row.session}
                          {sessionsAndWeekdays.bestSession?.session === row.session && (
                            <Chip label="Best" size="small" color="success" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
                          )}
                          {sessionsAndWeekdays.worstSession?.session === row.session && (
                            <Chip label="Worst" size="small" color="error" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
                          )}
                        </TableCell>
                        <TableCell align="right">{row.tradesCount}</TableCell>
                        <TableCell align="right">{formatPercent(row.winRate)}</TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 700,
                            color: row.netPnL >= 0 ? '#10B981' : '#F43F5E',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatCurrency(row.netPnL)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      {/* 8. FOCUS RULE FOR NEXT WEEK */}
      <Card
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 3,
          borderColor: isDark ? 'rgba(14, 165, 233, 0.4)' : 'rgba(14, 165, 233, 0.3)',
          backgroundColor: isDark ? 'rgba(14, 165, 233, 0.03)' : 'rgba(14, 165, 233, 0.02)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeRoundedIcon sx={{ color: '#0EA5E9', fontSize: 24 }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  ONE Focus Rule for Next Week
                </Typography>
                <HelpHint hintKey="review.focusRule" />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Objective, deterministic rule prioritized by loss breach &gt; mistake cost &gt; setup expectancy
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant={focusRuleSource === 'SUGGESTED' ? 'contained' : 'outlined'}
              onClick={() => {
                if (snapshot.focusRuleSuggestion) {
                  setFocusRuleSource('SUGGESTED');
                  setFocusRuleCode(snapshot.focusRuleSuggestion.code);
                  setFocusRuleText(snapshot.focusRuleSuggestion.text);
                  setFocusRuleMetric(snapshot.focusRuleSuggestion.metric);
                }
              }}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Use Suggested Rule
            </Button>
            <Button
              size="small"
              variant={focusRuleSource === 'CUSTOM' ? 'contained' : 'outlined'}
              onClick={() => setFocusRuleSource('CUSTOM')}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Custom Rule
            </Button>
          </Box>
        </Box>

        {/* Common Rule Quick Select */}
        <Box sx={{ mb: 2.5 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="common-rules-label">Pick from Common Guardrail Rules</InputLabel>
            <Select
              labelId="common-rules-label"
              value=""
              label="Pick from Common Guardrail Rules"
              onChange={(e) => {
                const selected = COMMON_FOCUS_RULES.find((r) => r.code === e.target.value);
                if (selected) {
                  setFocusRuleSource('CUSTOM');
                  setFocusRuleCode(selected.code);
                  setFocusRuleText(selected.text);
                  setFocusRuleMetric(selected.metric);
                }
              }}
            >
              {COMMON_FOCUS_RULES.map((r) => (
                <MenuItem key={r.code} value={r.code}>
                  {r.text}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Editable Focus Rule Text */}
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Focus Rule Commitment"
          value={focusRuleText}
          onChange={(e) => setFocusRuleText(e.target.value)}
          placeholder="E.g. Stop trading for the day after hitting max daily loss..."
          sx={{ mb: 2 }}
        />

        {focusRuleMetric && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`Machine Metric: ${focusRuleMetric.type}${
                focusRuleMetric.tag ? ` (${focusRuleMetric.tag})` : ''
              } Target: ${focusRuleMetric.target}`}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'monospace', fontWeight: 600 }}
            />
          </Box>
        )}
      </Card>

      {/* 9. REFLECTION NOTES */}
      <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <EditNoteRoundedIcon sx={{ color: 'primary.main', fontSize: 24 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Weekly Reflection &amp; Notes
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Freeform notes, market observations, setup quality notes, and emotional state review
            </Typography>
          </Box>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={5}
          value={reflectionNotes}
          onChange={(e) => setReflectionNotes(e.target.value.slice(0, 5000))}
          placeholder="What went well this week? What market conditions caught you off guard? What adjustments are needed for next week?"
          helperText={`${reflectionNotes.length}/5000 characters`}
          slotProps={{
            formHelperText: {
              sx: { textAlign: 'right', fontWeight: 600 },
            },
          }}
        />
      </Card>

      {/* 10. FINALIZE ACTIONS STRIP */}
      <Card
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 3,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {isFinalized ? 'Weekly Review Finalized' : 'Ready to Finalize Week?'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {isFinalized
              ? 'This week is finalized and frozen. You can still save edits to your reflection notes.'
              : 'Finalizing locks this weekly snapshot permanently for accurate historical reporting.'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => saveMutation.mutate('DRAFT')}
            disabled={saveMutation.isPending}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Save Draft
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<DoneAllRoundedIcon />}
            onClick={() => setIsFinalizeDialogOpen(true)}
            disabled={saveMutation.isPending}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, backgroundColor: '#059669' }}
          >
            {isFinalized ? 'Update Finalized Review' : 'Finalize Week'}
          </Button>
        </Box>
      </Card>

      {/* Confirm Finalize Dialog */}
      <ConfirmDialog
        open={isFinalizeDialogOpen}
        title="Finalize Weekly Review"
        message={
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2">
              Are you sure you want to finalize the weekly review for <strong>{currentWeek}</strong> ({formattedDateRange})?
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Finalizing will freeze this week&apos;s calculations, KPI deltas, setup rankings, and focus rule evaluation into an immutable historical record.
            </Typography>
          </Box>
        }
        confirmLabel="Finalize &amp; Lock"
        severity="info"
        isLoading={saveMutation.isPending}
        onConfirm={() => saveMutation.mutate('FINALIZED')}
        onCancel={() => setIsFinalizeDialogOpen(false)}
      />
    </Box>
  );
}
