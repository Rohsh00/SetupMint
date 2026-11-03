import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { formatCurrency } from '../../lib/utils.js';
import { IPropFirmHealthSummary, ITradingAccount } from '@tradevault/shared';

interface PropFirmAccountCardProps {
  account: ITradingAccount;
}

export const PropFirmAccountCard: React.FC<PropFirmAccountCardProps> = ({ account }) => {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: IPropFirmHealthSummary }>({
    queryKey: ['prop-firm-health', account.id],
    queryFn: () => api.accounts.propHealth(account.id),
    refetchInterval: 15000, // Auto refresh every 15s
    enabled: Boolean(account.propFirmConfig?.enabled || account.accountType === 'PROP_FIRM'),
  });

  const advancePhaseMutation = useMutation({
    mutationFn: () => api.accounts.propAdvancePhase(account.id),
    onSuccess: (res: any) => {
      toast.success(res.message || 'Advanced to next phase successfully!');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['prop-firm-health', account.id] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to advance phase');
    },
  });

  const health = data?.data;
  const cfg = account.propFirmConfig;

  if (!cfg && !health) {
    return null;
  }

  const phaseLabel = health?.phase === 'PHASE_1' ? 'Phase 1 (10% Target)' : health?.phase === 'PHASE_2' ? 'Phase 2 (5% Target)' : 'Funded Master';
  const threatLevel = health?.threatLevel || 'SAFE';

  const threatColor =
    threatLevel === 'BREACHED'
      ? muiTheme.palette.error.main
      : threatLevel === 'CRITICAL'
      ? '#ef4444'
      : threatLevel === 'CAUTION'
      ? '#f59e0b'
      : muiTheme.palette.success.main;

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 2,
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: threatLevel === 'CRITICAL' || threatLevel === 'BREACHED' ? threatColor : 'primary.main',
        bgcolor:
          muiTheme.palette.mode === 'dark'
            ? 'rgba(99, 102, 241, 0.04)'
            : 'rgba(99, 102, 241, 0.02)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldRounded sx={{ color: threatColor, fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: '0.01em' }}>
            {health?.firm || cfg?.firm || 'THE5ERS'} — {health?.planName || cfg?.planName || 'Summer Plan 10/5 ($149)'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Chip
            size="small"
            label={phaseLabel}
            color={health?.targetReached ? 'success' : 'primary'}
            variant="outlined"
            sx={{ fontWeight: 700, fontSize: '0.675rem', height: 22 }}
          />
          <Chip
            size="small"
            label={threatLevel}
            sx={{
              fontWeight: 700,
              fontSize: '0.675rem',
              height: 22,
              bgcolor: threatColor,
              color: '#fff',
            }}
          />
        </Box>
      </Box>

      {isLoading && !health ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : health ? (
        <>
          {/* Target Progress Bar */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Profit Target Progress ({health.targetProgressPercent.toFixed(1)}%)
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  color: health.profitMadeInPhase >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                }}
              >
                {formatCurrency(health.profitMadeInPhase, account.baseCurrency)} / {formatCurrency(health.targetProfitAmount, account.baseCurrency)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, Math.max(0, health.targetProgressPercent))}
              color={health.targetReached ? 'success' : 'primary'}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>

          {/* Buffers Dual-Meter */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1.5,
              p: 1.25,
              mb: 1.5,
              borderRadius: 1.5,
              bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
              border: 1,
              borderColor: 'divider',
            }}
          >
            {/* Daily Loss Buffer */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Daily Buffer (3%)
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    color: health.dailyBufferPercent < 25 ? '#ef4444' : health.dailyBufferPercent < 50 ? '#f59e0b' : 'text.primary',
                  }}
                >
                  {health.dailyBufferPercent.toFixed(0)}%
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  color: health.dailyLossBreached ? '#ef4444' : 'text.primary',
                }}
              >
                {formatCurrency(health.dailyBufferRemaining, account.baseCurrency)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem' }}>
                Floor: {formatCurrency(health.dailyLossFloor, account.baseCurrency)}
              </Typography>
            </Box>

            {/* Static Max Loss Floor */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Max Loss Buffer (10%)
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    color: health.maxLossBufferPercent < 25 ? '#ef4444' : health.maxLossBufferPercent < 50 ? '#f59e0b' : 'text.primary',
                  }}
                >
                  {health.maxLossBufferPercent.toFixed(0)}%
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  color: health.maxLossBreached ? '#ef4444' : 'text.primary',
                }}
              >
                {formatCurrency(health.maxLossBufferRemaining, account.baseCurrency)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem' }}>
                Hard Floor: {formatCurrency(health.maxLossFloor, account.baseCurrency)}
              </Typography>
            </Box>
          </Box>

          {/* Advance Phase Button if Target Met */}
          {health.canAdvancePhase && (
            <Button
              fullWidth
              size="small"
              variant="contained"
              color="success"
              onClick={() => advancePhaseMutation.mutate()}
              disabled={advancePhaseMutation.isPending}
              startIcon={<CheckCircleRounded />}
              endIcon={<ArrowForwardRounded />}
              sx={{ fontWeight: 700, mb: 1 }}
            >
              {health.phase === 'PHASE_1' ? 'Advance to Phase 2 (5% Target)' : 'Claim Funded Account'}
            </Button>
          )}

          {/* Expand / Collapse Rules Breakdown */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.675rem' }}>
              {health.statusReason}
            </Typography>
            <IconButton size="small" onClick={() => setIsExpanded(!isExpanded)} sx={{ p: 0.5 }}>
              {isExpanded ? <KeyboardArrowUpRounded fontSize="small" /> : <KeyboardArrowDownRounded fontSize="small" />}
            </IconButton>
          </Box>

          <Collapse in={isExpanded}>
            <Box sx={{ pt: 1.5, mt: 1, borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <Typography variant="caption" color="text.secondary">Daily Loss Rule:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>Higher of Prev Day EOD Balance or Equity</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <Typography variant="caption" color="text.secondary">EOD Reference Baseline:</Typography>
                <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                  {formatCurrency(health.dailyLossReference, account.baseCurrency)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <Typography variant="caption" color="text.secondary">Max Loss Rule:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>Static 10% from Initial ($90,000 floor)</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <Typography variant="caption" color="text.secondary">Weekend & Overnight Holding:</Typography>
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700 }}>PERMITTED</Typography>
              </Box>
            </Box>
          </Collapse>
        </>
      ) : null}
    </Paper>
  );
};

