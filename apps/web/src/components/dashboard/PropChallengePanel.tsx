import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
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

import { api } from '../../lib/api.js';
import { formatCurrency, formatPercent } from '../../lib/utils.js';
import { useTradeDrilldown } from '../../context/TradeDrillContext.js';
import { useAccountScope } from '../../context/AccountScopeContext.js';

export function PropChallengePanel() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { openDrill } = useTradeDrilldown();
  const { scope, selectedAccountId, propAccounts } = useAccountScope();

  const { data: overviewResponse, isLoading } = useQuery({
    queryKey: ['prop-overview', scope.mode, scope.firmKey, selectedAccountId],
    queryFn: () => api.accounts.propOverview(),
    staleTime: 30 * 1000,
  });

  const allAccounts = Array.isArray(overviewResponse)
    ? overviewResponse
    : (overviewResponse as any)?.data || [];

  // Filter accounts according to current scope
  const accountsToDisplay = React.useMemo(() => {
    if (selectedAccountId) {
      return allAccounts.filter((a: any) => a.id === selectedAccountId || a.accountId === selectedAccountId);
    }
    if (scope.firmKey && scope.firmKey !== 'ALL') {
      return allAccounts.filter((a: any) => a.firmKey?.toLowerCase() === scope.firmKey?.toLowerCase());
    }
    return allAccounts;
  }, [allAccounts, selectedAccountId, scope.firmKey]);

  if (isLoading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  // Empty state: No prop accounts found
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                    label={acc.planKey || acc.planName || 'Standard Challenge'}
                    sx={{ fontSize: '0.6875rem', height: 22 }}
                  />
                  <Chip
                    size="small"
                    color="primary"
                    label={`Phase ${acc.phase || 1}`}
                    sx={{ fontWeight: 700, fontSize: '0.6875rem', height: 22 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {renderStatusBadge(acc.overallStatus || 'SAFE')}
                </Box>
              </Box>

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
                      {formatPercent(targetPct)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, Math.max(0, targetPct))}
                      color={targetPct >= 100 ? 'success' : 'primary'}
                      sx={{ height: 6, borderRadius: 3, my: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      Balance: {formatCurrency(acc.balance || acc.currentBalance, acc.currency || 'USD')}
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
                      Resets: {acc.nextResetTime ? new Date(acc.nextResetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'SOD'}
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
                      HWM Floor: {acc.maxLossFloor ? formatCurrency(acc.maxLossFloor, acc.currency || 'USD') : 'Active Trailing'}
                    </Typography>
                  </Box>
                </Box>

                {/* 4. Consistency & Timing */}
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
                        TIMING & CONSISTENCY
                      </Typography>
                      <AccessTimeRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Min Days:
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                        {acc.minTradingDaysRemaining !== undefined ? `${acc.minTradingDaysRemaining} left` : 'Completed'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Best Day Share:
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                        {acc.consistencyPct !== undefined ? formatPercent(acc.consistencyPct) : 'N/A'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
