import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';

import { api } from '../../lib/api.js';
import { formatCurrency, formatPercent } from '../../lib/utils.js';
import { useTradeDrilldown } from '../../context/TradeDrillContext.js';
import { useAccountScope } from '../../context/AccountScopeContext.js';
import { toast } from '../../context/ToastContext.js';
import { PropLiveMarketChart } from './PropLiveMarketChart.js';

function evaluateUsdNewsAndSessionRadar(now: Date = new Date()) {
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const totalUtcMin = utcHours * 60 + utcMinutes;
  const day = now.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  // Sessions in UTC: London (07:00-16:00 UTC), NY (12:30-21:00 UTC), Overlap (12:30-16:00 UTC)
  let sessionLabel = 'Asian / Quiet Session';
  let sessionColor: 'default' | 'primary' | 'success' | 'warning' = 'default';
  if (isWeekend) {
    sessionLabel = 'Weekend (Forex/CFD Closed • Crypto Open)';
  } else if (totalUtcMin >= 12 * 60 + 30 && totalUtcMin <= 16 * 60) {
    sessionLabel = 'London–NY Overlap (Peak XAUUSD Liquidity)';
    sessionColor = 'success';
  } else if (totalUtcMin >= 7 * 60 && totalUtcMin < 12 * 60 + 30) {
    sessionLabel = 'London Session Active';
    sessionColor = 'primary';
  } else if (totalUtcMin > 16 * 60 && totalUtcMin <= 21 * 60) {
    sessionLabel = 'New York Session Active';
    sessionColor = 'primary';
  }

  // High-impact USD Red-Folder News windows (12:30 UTC / 18:00 IST, 13:30 UTC / 19:00 IST, 14:00 UTC / 19:30 IST, 18:00 UTC / 23:30 IST)
  const windows = [
    { utcMin: 12 * 60 + 30, name: 'US CPI / NFP / Jobless Claims (18:00 IST)' },
    { utcMin: 13 * 60 + 30, name: 'US Core PCE / Retail Sales (19:00 IST)' },
    { utcMin: 14 * 60, name: 'ISM PMI / JOLTS / Consumer Confidence (19:30 IST)' },
    { utcMin: 18 * 60, name: 'FOMC Rate Decision / Minutes (23:30 IST)' },
  ];

  let activeAlert: { status: 'CLEAR' | 'UPCOMING' | 'BLACKOUT'; message: string } = {
    status: 'CLEAR',
    message: 'No immediate Red-Folder USD embargo window (±5m clear)',
  };

  if (!isWeekend) {
    for (const w of windows) {
      const diff = w.utcMin - totalUtcMin;
      if (Math.abs(diff) <= 5) {
        activeAlert = {
          status: 'BLACKOUT',
          message: `RED-FOLDER BLACKOUT ACTIVE (±5m): ${w.name} — Avoid new market orders`,
        };
        break;
      } else if (diff > 5 && diff <= 30) {
        activeAlert = {
          status: 'UPCOMING',
          message: `Upcoming High-Impact USD Window in ${diff}m: ${w.name}`,
        };
        break;
      }
    }
  }

  return { sessionLabel, sessionColor, activeAlert };
}

export function PropChallengePanel() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openDrill } = useTradeDrilldown();
  const { scope, selectedAccountId, queryParams } = useAccountScope();

  // Importer Modal State
  const [importModalAcc, setImportModalAcc] = useState<any | null>(null);
  const [rawImportText, setRawImportText] = useState('');
  const [defaultRr, setDefaultRr] = useState<number>(2);

  // Monte Carlo Scenario Mode ('actual' vs 'target1to2')
  const [mcScenarioMode, setMcScenarioMode] = useState<'actual' | 'target1to2'>('actual');

  // Live Prop Market Chart Terminal toggle
  const [showLiveChart, setShowLiveChart] = useState<boolean>(true);

  // Ledger & Phase Modal State
  const [ledgerModalAcc, setLedgerModalAcc] = useState<any | null>(null);
  const [feePaidInput, setFeePaidInput] = useState<string>('149');
  const [splitPctInput, setSplitPctInput] = useState<string>('80');
  const [payoutsInput, setPayoutsInput] = useState<string>('0');
  const [targetPhaseInput, setTargetPhaseInput] = useState<'PHASE_1' | 'PHASE_2' | 'FUNDED'>('PHASE_1');

  const { data: overviewResponse, isLoading } = useQuery({
    queryKey: ['prop-overview', scope.mode, scope.firmKey, selectedAccountId, queryParams],
    queryFn: () => api.accounts.propOverview(queryParams),
    staleTime: 30 * 1000,
  });

  const importMutation = useMutation({
    mutationFn: ({ id, rawText, rr }: { id: string; rawText: string; rr: number }) =>
      api.accounts.importPropTrades(id, { rawText, defaultRiskReward: rr }),
    onSuccess: (res) => {
      toast.success(
        `Synced ${res.totalProcessed} trade(s) (${res.insertedCount} new, ${res.updatedCount} updated) with automatic SL & 1:${defaultRr} RR!`
      );
      setImportModalAcc(null);
      setRawImportText('');
      queryClient.invalidateQueries({ queryKey: ['prop-overview'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-prop-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['equity-curves'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['live-watcher'] });
      queryClient.invalidateQueries({ queryKey: ['live-trades-watcher'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to import The5ers / TradingView trades');
    },
  });

  const ledgerMutation = useMutation({
    mutationFn: async ({
      id,
      evaluationFeePaid,
      profitSplitPct,
      totalPayoutsReceived,
      newPhase,
    }: {
      id: string;
      evaluationFeePaid: number;
      profitSplitPct: number;
      totalPayoutsReceived: number;
      newPhase: 'PHASE_1' | 'PHASE_2' | 'FUNDED';
      currentPhase: string;
    }) => {
      return api.accounts.updatePropLedger(id, {
        evaluationFeePaid,
        profitSplitPct,
        totalPayoutsReceived,
        phase: newPhase,
      });
    },
    onSuccess: () => {
      toast.success('Prop challenge phase & payout ledger updated!');
      setLedgerModalAcc(null);
      queryClient.invalidateQueries({ queryKey: ['prop-overview'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-prop-overview'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update prop ledger');
    },
  });

  const allAccounts = Array.isArray(overviewResponse)
    ? overviewResponse
    : (overviewResponse as any)?.data || [];

  const accountsToDisplay = React.useMemo(() => {
    if (selectedAccountId) {
      return allAccounts.filter((a: any) => a.id === selectedAccountId || a.accountId === selectedAccountId);
    }
    if (scope.firmKey && scope.firmKey !== 'ALL') {
      return allAccounts.filter((a: any) => a.firmKey?.toLowerCase() === scope.firmKey?.toLowerCase());
    }
    return allAccounts;
  }, [allAccounts, selectedAccountId, scope.firmKey]);

  const radar = evaluateUsdNewsAndSessionRadar();

  if (isLoading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  if (accountsToDisplay.length === 0) {
    return (
      <Card
        sx={{
          mb: 3,
          p: 3,
          borderRadius: 3,
          border: `1px dashed ${muiTheme.palette.divider}`,
          textAlign: 'center',
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
        }}
      >
        <ShieldRoundedIcon sx={{ fontSize: 44, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          No Prop Firm Accounts Configured
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, mx: 'auto', mb: 2 }}>
          You have selected Prop Mode, but no prop firm challenge accounts exist under this scope. Configure an evaluation plan with The5ers, FTMO, FundedNext, Apex, or a custom firm.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddCircleOutlineRoundedIcon />}
          onClick={() => navigate('/accounts')}
          sx={{ fontWeight: 700, borderRadius: 2 }}
        >
          Setup Prop Firm Account
        </Button>
      </Card>
    );
  }

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SAFE':
        return (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
            label="SAFE"
            sx={{
              fontWeight: 800,
              fontSize: '0.6875rem',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
              color: 'success.main',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          />
        );
      case 'CAUTION':
        return (
          <Chip
            size="small"
            icon={<WarningAmberRoundedIcon sx={{ fontSize: '14px !important' }} />}
            label="CAUTION"
            sx={{
              fontWeight: 800,
              fontSize: '0.6875rem',
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)',
              color: 'warning.main',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          />
        );
      case 'CRITICAL':
        return (
          <Chip
            size="small"
            icon={<ErrorOutlineRoundedIcon sx={{ fontSize: '14px !important' }} />}
            label="CRITICAL RISK"
            sx={{
              fontWeight: 800,
              fontSize: '0.6875rem',
              backgroundColor: isDark ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.1)',
              color: 'error.main',
              border: '1px solid rgba(249, 115, 22, 0.3)',
            }}
          />
        );
      case 'BREACHED':
        return (
          <Chip
            size="small"
            icon={<CancelRoundedIcon sx={{ fontSize: '14px !important' }} />}
            label="FAILED / BREACHED"
            aria-live="assertive"
            sx={{
              fontWeight: 900,
              fontSize: '0.6875rem',
              backgroundColor: 'error.main',
              color: '#ffffff',
              animation: 'pulse 1.5s infinite',
            }}
          />
        );
      default:
        return (
          <Chip
            size="small"
            icon={<HelpOutlineRoundedIcon sx={{ fontSize: '14px !important' }} />}
            label={status || 'NOT CONFIGURED'}
            sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
          />
        );
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      {accountsToDisplay.map((acc: any) => {
        const targetPct = acc.targetProgressPct ?? 0;
        const dailyBuffer = acc.dailyLossBuffer ?? 0;
        const maxBuffer = acc.maxLossBuffer ?? 0;
        const isBreached = acc.overallStatus === 'BREACHED' || acc.status === 'FAILED';
        const todayStr = new Date().toISOString().split('T')[0];

        const initialBal = Number(acc.initialBalance || 100000);
        const currentBal = Number(acc.balance || acc.currentBalance || initialBal);
        const targetAmount = Number(
          acc.health?.targetProfitAmount ?? (acc.phase === 'PHASE_2' ? initialBal * 0.05 : initialBal * 0.1)
        );
        const profitMade = currentBal - initialBal;
        const remainingToTarget = Math.max(0, targetAmount - profitMade);

        // Pacing math: 0.5% risk ($500 on $100K) at 1:2 RR = +$1,000 per win
        const unitRiskHalfPct = initialBal * 0.005;
        const unitWinAt2R = unitRiskHalfPct * 2;
        const winsNeededAt2R = remainingToTarget > 0 ? Math.ceil(remainingToTarget / unitWinAt2R) : 0;
        const safeRiskToday = Math.min(dailyBuffer * 0.25, unitRiskHalfPct);
        const safeGoldLotsFor10PtSl = Number((safeRiskToday / (10 * 100)).toFixed(2));

        // Ledger math
        const evalFee = Number(acc.evaluationFeePaid ?? 149);
        const splitPct = Number(acc.profitSplitPct ?? 80);
        const totalPayouts = Number(acc.totalPayoutsReceived ?? 0);
        const netCareerRoi = totalPayouts - evalFee;

        return (
          <Card
            key={acc.id || acc.accountId}
            sx={{
              mb: 2,
              borderRadius: 3,
              border: `1px solid ${isBreached ? muiTheme.palette.error.main : muiTheme.palette.divider}`,
              background: isDark
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.95) 100%)',
              boxShadow: isBreached ? '0 0 15px rgba(239, 68, 68, 0.25)' : 'none',
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              {/* Header Row */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {acc.name}
                  </Typography>
                  <Chip
                    size="small"
                    label={(acc.firmKey || 'PROP FIRM').toUpperCase()}
                    sx={{ fontWeight: 700, fontSize: '0.6875rem', height: 22 }}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={acc.planName || acc.planKey || 'Standard Challenge'}
                    sx={{ fontSize: '0.6875rem', height: 22 }}
                  />
                  <Chip
                    size="small"
                    color="primary"
                    label={acc.phase === 'FUNDED' ? 'Funded Master' : acc.phase === 'PHASE_2' ? 'Phase 2 (5%)' : 'Phase 1 (10%)'}
                    sx={{ fontWeight: 700, fontSize: '0.6875rem', height: 22 }}
                  />
                  <Chip
                    size="small"
                    color={radar.sessionColor}
                    variant="outlined"
                    label={radar.sessionLabel}
                    sx={{ fontWeight: 600, fontSize: '0.675rem', height: 22 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant={showLiveChart ? 'contained' : 'outlined'}
                    startIcon={<CandlestickChartRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setShowLiveChart((prev) => !prev)}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      borderRadius: 1.5,
                      ...(showLiveChart
                        ? { bgcolor: '#10B981', '&:hover': { bgcolor: '#059669' } }
                        : {}),
                    }}
                  >
                    {showLiveChart ? 'Hide Live Chart' : 'Live Prop Chart'}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<CloudUploadRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => {
                      setImportModalAcc(acc);
                      setRawImportText('');
                    }}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      borderRadius: 1.5,
                      bgcolor: '#8B5CF6',
                      '&:hover': { bgcolor: '#7C3AED' },
                    }}
                  >
                    Sync The5ers / TV Trades
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AccountBalanceWalletRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => {
                      setLedgerModalAcc(acc);
                      setFeePaidInput(String(evalFee));
                      setSplitPctInput(String(splitPct));
                      setPayoutsInput(String(totalPayouts));
                      setTargetPhaseInput((acc.phase as any) || 'PHASE_1');
                    }}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      borderRadius: 1.5,
                    }}
                  >
                    Phase & ROI Ledger
                  </Button>
                  {renderStatusBadge(acc.overallStatus || 'SAFE')}
                </Box>
              </Box>

              {/* Red-Folder USD News Blackout Banner (Live Economic Calendar or Session Radar) */}
              {(acc.economicCalendar?.activeAlert?.level === 'BLACKOUT' ||
                acc.economicCalendar?.activeAlert?.level === 'IMMINENT' ||
                radar.activeAlert.status !== 'CLEAR') && (
                <Alert
                  severity={
                    acc.economicCalendar?.activeAlert?.level === 'BLACKOUT' ||
                    radar.activeAlert.status === 'BLACKOUT'
                      ? 'error'
                      : 'warning'
                  }
                  icon={<NotificationsActiveRoundedIcon fontSize="small" />}
                  sx={{ mb: 2, py: 0.25, borderRadius: 2 }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                    {acc.economicCalendar?.activeAlert?.headline || radar.activeAlert.message}
                  </Typography>
                  {acc.economicCalendar?.activeAlert?.subtext && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      {acc.economicCalendar.activeAlert.subtext}
                    </Typography>
                  )}
                </Alert>
              )}

              {/* Status Alert if Caution/Critical/Breached */}
              {acc.statusReason && acc.overallStatus !== 'SAFE' && (
                <Alert
                  severity={isBreached ? 'error' : acc.overallStatus === 'CRITICAL' ? 'error' : 'warning'}
                  sx={{ mb: 2, py: 0.5, borderRadius: 2 }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {acc.statusReason}
                  </Typography>
                </Alert>
              )}

              {/* Metrics Grid with Tabular Numerals */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                {/* 1. Profit Target Progress */}
                <Box>
                  <Box
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        label: `${acc.name} • Winning Trades (Target Progress)`,
                        filter: { accountId: acc.id || acc.accountId, outcome: 'WIN' },
                      })
                    }
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      border: `1px solid ${muiTheme.palette.divider}`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s, border-color 0.15s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-1px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        PROFIT TARGET
                      </Typography>
                      <EmojiEventsRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    </Box>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        color: targetPct >= 100 ? 'success.main' : 'text.primary',
                      }}
                    >
                      {formatPercent(targetPct)} ({formatCurrency(profitMade, acc.currency || 'USD')} / {formatCurrency(targetAmount, acc.currency || 'USD')})
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, Math.max(0, targetPct))}
                      color={targetPct >= 100 ? 'success' : 'primary'}
                      sx={{ height: 6, borderRadius: 3, my: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      Balance: {formatCurrency(acc.balance || acc.currentBalance, acc.currency || 'USD')} • Left: {formatCurrency(remainingToTarget, acc.currency || 'USD')}
                    </Typography>
                  </Box>
                </Box>

                {/* 2. Daily Loss Buffer */}
                <Box>
                  <Box
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        label: `${acc.name} • Today's Trades (Daily Loss Limit)`,
                        filter: { accountId: acc.id || acc.accountId, startDate: todayStr, endDate: todayStr },
                      })
                    }
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      border: `1px solid ${muiTheme.palette.divider}`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s, border-color 0.15s',
                      '&:hover': {
                        borderColor: 'error.main',
                        transform: 'translateY(-1px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        DAILY LOSS BUFFER
                      </Typography>
                      <TrendingDownRoundedIcon sx={{ fontSize: 16, color: dailyBuffer <= 0 ? 'error.main' : 'text.secondary' }} />
                    </Box>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        color: dailyBuffer <= 0 ? 'error.main' : dailyBuffer < 1000 ? 'warning.main' : 'text.primary',
                      }}
                    >
                      {formatCurrency(dailyBuffer, acc.currency || 'USD')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontVariantNumeric: 'tabular-nums' }}>
                      Safe Risk/Trade (25% buf): <strong>{formatCurrency(safeRiskToday, acc.currency || 'USD')}</strong> (~{safeGoldLotsFor10PtSl} lots @ $10 SL)
                    </Typography>
                  </Box>
                </Box>

                {/* 3. Max Drawdown Buffer */}
                <Box>
                  <Box
                    onClick={() =>
                      openDrill({
                        kind: 'FILTER',
                        label: `${acc.name} • Loss Trades (Max Drawdown Buffer)`,
                        filter: { accountId: acc.id || acc.accountId, outcome: 'LOSS' },
                      })
                    }
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      border: `1px solid ${muiTheme.palette.divider}`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s, border-color 0.15s',
                      '&:hover': {
                        borderColor: 'error.main',
                        transform: 'translateY(-1px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        MAX LOSS BUFFER
                      </Typography>
                      <ShieldRoundedIcon sx={{ fontSize: 16, color: maxBuffer <= 0 ? 'error.main' : 'text.secondary' }} />
                    </Box>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        color: maxBuffer <= 0 ? 'error.main' : maxBuffer < 2000 ? 'warning.main' : 'text.primary',
                      }}
                    >
                      {formatCurrency(maxBuffer, acc.currency || 'USD')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontVariantNumeric: 'tabular-nums' }}>
                      Hard Floor: {acc.maxLossFloor ? formatCurrency(acc.maxLossFloor, acc.currency || 'USD') : 'Active Trailing'}
                    </Typography>
                  </Box>
                </Box>

                {/* 4. Target Pacing & Career ROI */}
                <Box>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      border: `1px solid ${muiTheme.palette.divider}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        PATH TO PASS & ROI
                      </Typography>
                      <TrackChangesRoundedIcon sx={{ fontSize: 16, color: '#A78BFA' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        0.5% Risk (1:2 RR):
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#A78BFA' }}>
                        {winsNeededAt2R > 0 ? `${winsNeededAt2R} wins (+$${unitWinAt2R}/win)` : 'Target Reached!'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Fee / Split / Net ROI:
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          fontVariantNumeric: 'tabular-nums',
                          color: netCareerRoi >= 0 ? 'success.main' : 'text.primary',
                        }}
                      >
                        ${evalFee} • {splitPct}% • {netCareerRoi >= 0 ? `+$${netCareerRoi}` : `-$${Math.abs(netCareerRoi)}`}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* 4b. Live Prop Market Chart Terminal (XAUUSD, EURUSD, NAS100, US30, BTCUSD, ETHUSD) */}
              {showLiveChart && (
                <Box sx={{ mt: 2 }}>
                  <PropLiveMarketChart
                    initialSymbol="XAUUSD"
                    accountId={acc.id || acc.accountId}
                    height={380}
                  />
                </Box>
              )}

              {/* 5. Live USD Economic Calendar Feed (ForexFactory / Gold Movers) */}
              {acc.economicCalendar?.upcomingEvents?.length > 0 && (
                <Box
                  sx={{
                    mt: 2,
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(248, 250, 252, 0.9)',
                    border: `1px solid ${muiTheme.palette.divider}`,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1,
                      mb: 1.25,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <AccessTimeRoundedIcon sx={{ fontSize: 16, color: '#F59E0B' }} />
                      <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                        LIVE USD ECONOMIC CALENDAR (XAUUSD GOLD MOVERS)
                      </Typography>
                      <Chip
                        size="small"
                        label={
                          acc.economicCalendar.source === 'FOREX_FACTORY_LIVE'
                            ? 'LIVE FOREXFACTORY FEED'
                            : 'USD MACRO SCHEDULE'
                        }
                        sx={{
                          height: 18,
                          fontSize: '0.625rem',
                          fontWeight: 800,
                          bgcolor:
                            acc.economicCalendar.source === 'FOREX_FACTORY_LIVE'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(148, 163, 184, 0.15)',
                          color:
                            acc.economicCalendar.source === 'FOREX_FACTORY_LIVE'
                              ? '#10B981'
                              : 'text.secondary',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      {acc.economicCalendar.activeAlert?.headline}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                      gap: 1,
                    }}
                  >
                    {acc.economicCalendar.upcomingEvents.slice(0, 6).map((ev: any) => {
                      const isRed = ev.impact === 'HIGH';
                      const isBlackout = ev.status === 'BLACKOUT_NOW' || ev.status === 'IMMINENT';
                      return (
                        <Box
                          key={ev.id}
                          sx={{
                            p: 1,
                            borderRadius: 1.5,
                            border: `1px solid ${
                              isBlackout
                                ? 'rgba(239, 68, 68, 0.5)'
                                : isRed
                                ? 'rgba(245, 158, 11, 0.28)'
                                : muiTheme.palette.divider
                            }`,
                            backgroundColor: isBlackout
                              ? 'rgba(239, 68, 68, 0.08)'
                              : isDark
                              ? 'rgba(30, 41, 59, 0.45)'
                              : '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 0.5,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  bgcolor: isRed ? '#EF4444' : '#F59E0B',
                                  boxShadow: isRed ? '0 0 6px rgba(239,68,68,0.6)' : 'none',
                                }}
                              />
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 800,
                                  fontSize: '0.73rem',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={ev.title}
                              >
                                {ev.title}
                              </Typography>
                            </Box>
                            <Chip
                              size="small"
                              label={ev.countdownStr}
                              sx={{
                                height: 18,
                                fontSize: '0.625rem',
                                fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                                bgcolor: isBlackout
                                  ? 'rgba(239, 68, 68, 0.2)'
                                  : ev.status === 'TODAY'
                                  ? 'rgba(245, 158, 11, 0.16)'
                                  : 'rgba(148, 163, 184, 0.12)',
                                color: isBlackout
                                  ? '#EF4444'
                                  : ev.status === 'TODAY'
                                  ? '#F59E0B'
                                  : 'text.secondary',
                              }}
                            />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}
                            >
                              {ev.istTimeStr}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}
                            >
                              Fcst: <strong>{ev.forecast || '—'}</strong> • Prev: {ev.previous || '—'}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* 6. Prop Firm "Pass Probability" & Drawdown Risk Monte Carlo Simulator */}
              {acc.monteCarlo && (
                <Box
                  sx={{
                    mt: 2,
                    p: 1.75,
                    borderRadius: 2,
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(248, 250, 252, 0.95)',
                    border: `1px solid ${muiTheme.palette.divider}`,
                  }}
                >
                  {(() => {
                    const mc = acc.monteCarlo;
                    const activeScenario =
                      mcScenarioMode === 'actual' ? mc.scenarios.actual : mc.scenarios.target1to2;
                    const edge = mc.actualEdge;

                    return (
                      <>
                        {/* Simulator Header & Scenario Switcher */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1,
                            mb: 1.5,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <RocketLaunchRoundedIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />
                            <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                              MONTE CARLO PASS PROBABILITY & DRAWDOWN RISK SIMULATOR ({mc.simulationsCount.toLocaleString()} PATHS)
                            </Typography>
                            <Chip
                              size="small"
                              label={`Optimal Risk: ${activeScenario.recommendedRiskPct}% / trade`}
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                bgcolor: 'rgba(139, 92, 246, 0.16)',
                                color: '#A78BFA',
                                border: '1px solid rgba(139, 92, 246, 0.35)',
                              }}
                            />
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            <Button
                              size="small"
                              variant={mcScenarioMode === 'actual' ? 'contained' : 'outlined'}
                              onClick={() => setMcScenarioMode('actual')}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                py: 0.25,
                                px: 1.25,
                                borderRadius: 1.5,
                                ...(mcScenarioMode === 'actual'
                                  ? { bgcolor: '#8B5CF6', '&:hover': { bgcolor: '#7C3AED' } }
                                  : {}),
                              }}
                            >
                              Your Actual Edge ({edge.winRatePct}% WR • 1:{edge.payoffRatio} RR)
                            </Button>
                            <Button
                              size="small"
                              variant={mcScenarioMode === 'target1to2' ? 'contained' : 'outlined'}
                              onClick={() => setMcScenarioMode('target1to2')}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                py: 0.25,
                                px: 1.25,
                                borderRadius: 1.5,
                                ...(mcScenarioMode === 'target1to2'
                                  ? { bgcolor: '#8B5CF6', '&:hover': { bgcolor: '#7C3AED' } }
                                  : {}),
                              }}
                            >
                              Target 1:2 RR Plan (45% WR • 1:2.0 RR)
                            </Button>
                          </Box>
                        </Box>

                        {/* Historical Edge Summary Bar */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1.5,
                            mb: 1.5,
                            px: 1.25,
                            py: 0.75,
                            borderRadius: 1.5,
                            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.9)',
                            border: `1px solid ${muiTheme.palette.divider}`,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            Sample: <strong>{edge.sampleSize} closed trades</strong> ({edge.winCount}W / {edge.lossCount}L)
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            Avg Win / Loss:{' '}
                            <strong style={{ color: '#10B981' }}>+${edge.avgWinUsd.toLocaleString()}</strong> /{' '}
                            <strong style={{ color: '#EF4444' }}>-${edge.avgLossUsd.toLocaleString()}</strong>
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            Profit Factor: <strong>{edge.profitFactor}x</strong>
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            Expectancy:{' '}
                            <strong style={{ color: activeScenario.expectancyR >= 0 ? '#10B981' : '#EF4444' }}>
                              {activeScenario.expectancyR >= 0 ? '+' : ''}
                              {activeScenario.expectancyR}R / trade
                            </strong>
                          </Typography>
                        </Box>

                        {/* 4 Risk-Per-Trade Simulation Cards */}
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                            gap: 1.25,
                          }}
                        >
                          {activeScenario.tiers.map((tier: any) => {
                            const passColor =
                              tier.passProbabilityPct >= 75
                                ? '#10B981'
                                : tier.passProbabilityPct >= 50
                                ? '#F59E0B'
                                : '#EF4444';

                            return (
                              <Box
                                key={tier.riskPct}
                                sx={{
                                  p: 1.25,
                                  borderRadius: 2,
                                  border: `1px solid ${
                                    tier.isOptimal
                                      ? '#8B5CF6'
                                      : muiTheme.palette.divider
                                  }`,
                                  backgroundColor: tier.isOptimal
                                    ? isDark
                                      ? 'rgba(139, 92, 246, 0.10)'
                                      : 'rgba(139, 92, 246, 0.05)'
                                    : isDark
                                    ? 'rgba(30, 41, 59, 0.4)'
                                    : '#ffffff',
                                  position: 'relative',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 800, fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums' }}
                                  >
                                    {tier.riskPct.toFixed(2)}% Risk (${tier.riskAmountUsd.toLocaleString()})
                                  </Typography>
                                  {tier.isOptimal && (
                                    <Chip
                                      size="small"
                                      label="★ OPTIMAL"
                                      sx={{
                                        height: 17,
                                        fontSize: '0.6rem',
                                        fontWeight: 900,
                                        bgcolor: '#8B5CF6',
                                        color: '#ffffff',
                                      }}
                                    />
                                  )}
                                </Box>

                                {/* Pass Probability */}
                                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.4 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Pass Probability:
                                  </Typography>
                                  <Typography
                                    variant="subtitle2"
                                    sx={{
                                      fontWeight: 900,
                                      fontVariantNumeric: 'tabular-nums',
                                      color: passColor,
                                    }}
                                  >
                                    {tier.passProbabilityPct}%
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(100, Math.max(0, tier.passProbabilityPct))}
                                  sx={{
                                    height: 5,
                                    borderRadius: 3,
                                    mb: 1,
                                    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                    '& .MuiLinearProgress-bar': { bgcolor: passColor },
                                  }}
                                />

                                {/* Breach Risk Breakdown */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Breach Risk (Daily / Max):
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: '0.68rem',
                                      fontVariantNumeric: 'tabular-nums',
                                      color: tier.totalBreachRiskPct > 25 ? 'error.main' : 'text.primary',
                                    }}
                                  >
                                    {tier.totalBreachRiskPct}% ({tier.dailyBreachRiskPct}% / {tier.maxDdBreachRiskPct}%)
                                  </Typography>
                                </Box>

                                {/* Median Trades & Days to Pass */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Est. Trades to Pass:
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 700, fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}
                                  >
                                    {tier.medianTradesToPass
                                      ? `~${tier.medianTradesToPass} trades (~${tier.medianDaysToPass}d)`
                                      : '>150 trades'}
                                  </Typography>
                                </Box>

                                {/* Gold Lot Size & 95% Streak DD */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    XAUUSD ($10 SL) / 95% DD:
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 700, fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums', color: '#A78BFA' }}
                                  >
                                    {tier.xauusdLots10DollarSl} lots • -${tier.streakDrawdownUsd.toLocaleString()}
                                  </Typography>
                                </Box>
                              </Box>
                            );
                          })}
                        </Box>
                      </>
                    );
                  })()}
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* 1-Click The5ers Hub & TradingView Trade Importer Dialog */}
      <Dialog
        open={Boolean(importModalAcc)}
        onClose={() => setImportModalAcc(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Sync The5ers Hub / TradingView Trades — {importModalAcc?.name}
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.78rem' }}>
            Copy rows directly from your <strong>The5ers Trader Zone (hub.the5ers.com) Trades table</strong> or <strong>TradingView Account Manager</strong> and paste below (supports both <strong>single-line rows</strong> and <strong>multi-line vertical cell-per-line pastes</strong>).
            <ul>
              <li><strong>Losses:</strong> Stop Loss is automatically set to the exact Exit Price (since SL was hit) and Planned Target is set to <strong>1:{defaultRr} RR</strong>.</li>
              <li><strong>Wins:</strong> Planned Target is set to Exit Price and Initial Stop Loss is calculated at <strong>1:{defaultRr} RR</strong> distance.</li>
              <li><strong>Deduplication:</strong> Existing trades with the same Trade ID are updated cleanly (e.g. Open → Closed) without duplicates.</li>
            </ul>
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              select
              size="small"
              label="Auto Risk:Reward (RR) Ratio"
              value={defaultRr}
              onChange={(e) => setDefaultRr(Number(e.target.value))}
              sx={{ width: 220 }}
            >
              <MenuItem value={1.5}>1 : 1.5 RR</MenuItem>
              <MenuItem value={2}>1 : 2.0 RR (Default)</MenuItem>
              <MenuItem value={2.5}>1 : 2.5 RR</MenuItem>
              <MenuItem value={3}>1 : 3.0 RR</MenuItem>
            </TextField>
          </Box>
          <TextField
            multiline
            minRows={8}
            maxRows={16}
            fullWidth
            placeholder={`Paste single-line or multi-line rows from hub.the5ers.com here, for example:\n560643070840785\nXAUUSD\nSell\n04.11.26 14:58\n$4,047.16\n0.5\n-$2.02\n$0\n\nOr single-line: 560643070803 XAUUSD Buy 04.11.26 13:25 04.11.26 13:36 $4,021.78 $4,035.26 0.5 -$4.03 $0 +$669.97`}
            value={rawImportText}
            onChange={(e) => setRawImportText(e.target.value)}
            sx={{ '& .MuiInputBase-input': { fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.8rem' } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setImportModalAcc(null)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!rawImportText.trim() || importMutation.isPending}
            onClick={() =>
              importModalAcc &&
              importMutation.mutate({
                id: importModalAcc.id || importModalAcc.accountId,
                rawText: rawImportText,
                rr: defaultRr,
              })
            }
            sx={{ fontWeight: 700, bgcolor: '#8B5CF6', '&:hover': { bgcolor: '#7C3AED' } }}
          >
            {importMutation.isPending ? 'Syncing & Computing SL...' : 'Import & Calculate 1:2 SL/Target'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Challenge Lifecycle (Phase Promotion) & Prop Career ROI Ledger Dialog */}
      <Dialog
        open={Boolean(ledgerModalAcc)}
        onClose={() => setLedgerModalAcc(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Phase Promotion & Prop ROI Ledger
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          <TextField
            select
            size="small"
            label="Challenge Phase"
            value={targetPhaseInput}
            onChange={(e) => setTargetPhaseInput(e.target.value as any)}
            fullWidth
            helperText="Promote account when target & min trading days are met"
          >
            <MenuItem value="PHASE_1">Phase 1 — Evaluation (10% Target)</MenuItem>
            <MenuItem value="PHASE_2">Phase 2 — Verification (5% Target)</MenuItem>
            <MenuItem value="FUNDED">Funded Master Account (0% Target • Payouts Active)</MenuItem>
          </TextField>

          <Divider />

          <TextField
            size="small"
            type="number"
            label="Evaluation Fee Paid ($ USD)"
            value={feePaidInput}
            onChange={(e) => setFeePaidInput(e.target.value)}
            fullWidth
            helperText="e.g. $149 for The5ers $100K Summer Plan"
          />
          <TextField
            size="small"
            type="number"
            label="Profit Split (%)"
            value={splitPctInput}
            onChange={(e) => setSplitPctInput(e.target.value)}
            fullWidth
            helperText="e.g. 80% standard split (up to 100% scaling)"
          />
          <TextField
            size="small"
            type="number"
            label="Total Payouts Withdrawn ($ USD)"
            value={payoutsInput}
            onChange={(e) => setPayoutsInput(e.target.value)}
            fullWidth
            helperText="Cumulative net payouts received from this prop account"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setLedgerModalAcc(null)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<RocketLaunchRoundedIcon />}
            disabled={ledgerMutation.isPending}
            onClick={() =>
              ledgerModalAcc &&
              ledgerMutation.mutate({
                id: ledgerModalAcc.id || ledgerModalAcc.accountId,
                evaluationFeePaid: Number(feePaidInput) || 0,
                profitSplitPct: Number(splitPctInput) || 80,
                totalPayoutsReceived: Number(payoutsInput) || 0,
                newPhase: targetPhaseInput,
                currentPhase: ledgerModalAcc.phase || 'PHASE_1',
              })
            }
            sx={{ fontWeight: 700 }}
          >
            {ledgerMutation.isPending ? 'Saving...' : 'Save Phase & Ledger'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
