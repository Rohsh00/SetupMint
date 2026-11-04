import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Link,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { formatCurrency } from '../../lib/utils.js';
import { IPropFirmHealthSummary, ITradingAccount, IPropRuleEvaluation } from '@tradevault/shared';

interface PropFirmAccountCardProps {
  account: ITradingAccount;
}

export const PropFirmAccountCard: React.FC<PropFirmAccountCardProps> = ({ account }) => {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, isLoading } = useQuery<{ success: boolean; data: IPropFirmHealthSummary }>({
    queryKey: ['prop-firm-health', account.id],
    queryFn: () => api.accounts.propHealth(account.id),
    refetchInterval: 15000,
    enabled: Boolean(account.propFirmConfig?.enabled || account.accountType === 'PROP_FIRM' || (account as any).propFirm?.firmKey),
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

  const health: IPropFirmHealthSummary | undefined = (data as any)?.data ?? (data as any);
  const cfg = account.propFirmConfig;
  const propFirmData = (account as any).propFirm;

  if (!cfg && !health && !propFirmData) {
    return null;
  }

  const phaseLabel =
    health?.phase === 'PHASE_1'
      ? 'Phase 1'
      : health?.phase === 'PHASE_2'
      ? 'Phase 2'
      : health?.phase === 'PHASE_3'
      ? 'Phase 3'
      : 'Funded Master';

  const threatLevel = health?.threatLevel || 'SAFE';
  const isBreached = threatLevel === 'BREACHED' || health?.status === 'FAILED' || propFirmData?.status === 'FAILED';

  const threatColor = isBreached
    ? muiTheme.palette.error.main
    : threatLevel === 'CRITICAL'
    ? '#ef4444'
    : threatLevel === 'CAUTION'
    ? '#f59e0b'
    : muiTheme.palette.success.main;

  const ThreatIcon = isBreached
    ? CancelRounded
    : threatLevel === 'CRITICAL' || threatLevel === 'CAUTION'
    ? WarningAmberRounded
    : CheckCircleRounded;

  // Find unconfigured rules
  const ruleEntries = health?.rules ? Object.entries(health.rules) : [];
  const unconfiguredRules = ruleEntries.filter(
    ([, r]) => (r as IPropRuleEvaluation).status === 'NOT_CONFIGURED'
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 2,
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: isBreached || threatLevel === 'CRITICAL' ? threatColor : 'primary.main',
        bgcolor:
          muiTheme.palette.mode === 'dark'
            ? 'rgba(99, 102, 241, 0.04)'
            : 'rgba(99, 102, 241, 0.02)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ThreatIcon sx={{ color: threatColor, fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: '0.01em' }}>
              {health?.firm || cfg?.firm || propFirmData?.firmKey || 'PROP FIRM'} —{' '}
              {health?.planName || cfg?.planName || 'Evaluation Plan'}
            </Typography>
          </Box>

          {/* Preset Metadata & Rule Source Links */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pl: 3.5, flexWrap: 'wrap' }}>
            {health?.rulesVerifiedAt && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.675rem' }}>
                Rules verified: <strong>{health.rulesVerifiedAt}</strong>
              </Typography>
            )}
            {health?.sourceUrl && (
              <Link
                href={health.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.25,
                  fontSize: '0.675rem',
                  fontWeight: 600,
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                Official Rules <OpenInNewRounded sx={{ fontSize: 11 }} />
              </Link>
            )}
          </Box>
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
            icon={<ThreatIcon sx={{ '&&': { color: '#fff', fontSize: 14 } }} />}
            label={isBreached ? 'BREACHED' : threatLevel}
            aria-live={isBreached ? 'assertive' : undefined}
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

      {/* Sticky Permanent Breach Banner */}
      {isBreached && (
        <Alert
          severity="error"
          variant="filled"
          icon={<CancelRounded />}
          aria-live="assertive"
          sx={{ mb: 2, fontWeight: 600, fontSize: '0.75rem', py: 0.5 }}
        >
          Permanent Breach:{' '}
          {health?.breachedRule || propFirmData?.breachedRule || 'Risk limit violated'}{' '}
          {health?.breachedAt || propFirmData?.breachedAt
            ? `at ${new Date(health?.breachedAt || propFirmData?.breachedAt).toLocaleString()}`
            : ''}
          . Account status is locked FAILED.
        </Alert>
      )}

      {/* Unconfigured Rules Advisory */}
      {unconfiguredRules.length > 0 && (
        <Alert
          severity="warning"
          icon={<HelpOutlineRounded />}
          sx={{ mb: 1.5, py: 0.25, fontSize: '0.725rem' }}
        >
          {unconfiguredRules.length} rule{unconfiguredRules.length > 1 ? 's are' : ' is'} not configured for this plan: {' '}
          <strong>{unconfiguredRules.map(([, r]) => (r as IPropRuleEvaluation).ruleName).join(', ')}</strong>.
          Configure custom overrides in account settings if your plan enforces these.
        </Alert>
      )}

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
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: health.profitMadeInPhase >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                }}
              >
                {formatCurrency(health.profitMadeInPhase, account.baseCurrency)} /{' '}
                {formatCurrency(health.targetProfitAmount, account.baseCurrency)}
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
                  Daily Buffer
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    color:
                      health.dailyBufferPercent < 25
                        ? '#ef4444'
                        : health.dailyBufferPercent < 50
                        ? '#f59e0b'
                        : 'text.primary',
                  }}
                >
                  {health.dailyBufferPercent.toFixed(0)}%
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: health.dailyLossBreached ? '#ef4444' : 'text.primary',
                }}
              >
                {formatCurrency(health.dailyBufferRemaining, account.baseCurrency)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.625rem',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Floor: {formatCurrency(health.dailyLossFloor, account.baseCurrency)}
              </Typography>
            </Box>

            {/* Static or Trailing Max Loss Floor */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Max Loss Buffer
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    color:
                      health.maxLossBufferPercent < 25
                        ? '#ef4444'
                        : health.maxLossBufferPercent < 50
                        ? '#f59e0b'
                        : 'text.primary',
                  }}
                >
                  {health.maxLossBufferPercent.toFixed(0)}%
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: health.maxLossBreached ? '#ef4444' : 'text.primary',
                }}
              >
                {formatCurrency(health.maxLossBufferRemaining, account.baseCurrency)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.625rem',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Floor: {formatCurrency(health.maxLossFloor, account.baseCurrency)}
              </Typography>
            </Box>
          </Box>

          {/* Advance Phase Button if Target Met */}
          {health.canAdvancePhase && !isBreached && (
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
              {health.phase === 'PHASE_1'
                ? 'Advance to Phase 2'
                : health.phase === 'PHASE_2'
                ? 'Advance to Phase 3 / Claim Master'
                : 'Claim Funded Account'}
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
            <Box
              sx={{
                pt: 1.5,
                mt: 1,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {ruleEntries.length > 0 ? (
                ruleEntries.map(([key, evalItem]) => {
                  const rule = evalItem as IPropRuleEvaluation;
                  const isRuleBreached = rule.status === 'BREACHED';
                  const isRuleNotConfigured = rule.status === 'NOT_CONFIGURED';
                  const isRuleCaution = rule.status === 'CAUTION' || rule.status === 'CRITICAL';

                  return (
                    <Box
                      key={key}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        bgcolor: isRuleBreached
                          ? 'rgba(239, 68, 68, 0.08)'
                          : isRuleCaution
                          ? 'rgba(245, 158, 11, 0.08)'
                          : 'rgba(0, 0, 0, 0.02)',
                        border: 1,
                        borderColor: isRuleBreached
                          ? 'error.main'
                          : isRuleCaution
                          ? 'warning.main'
                          : 'divider',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                          {rule.ruleName}
                        </Typography>
                        <Chip
                          size="small"
                          label={rule.status}
                          color={
                            isRuleBreached
                              ? 'error'
                              : isRuleCaution
                              ? 'warning'
                              : isRuleNotConfigured
                              ? 'default'
                              : 'success'
                          }
                          sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                        />
                      </Box>

                      {isRuleNotConfigured ? (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mt: 0.5 }}>
                          Rule not configured for this preset
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              fontFamily: '"JetBrains Mono", monospace',
                              fontVariantNumeric: 'tabular-nums',
                              fontSize: '0.6875rem',
                            }}
                          >
                            Used: {rule.used !== undefined ? rule.used.toFixed(1) : '—'} / Limit: {rule.limit !== undefined ? rule.limit.toFixed(1) : '—'}
                          </Typography>
                          {rule.remaining !== undefined && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                fontFamily: '"JetBrains Mono", monospace',
                                fontVariantNumeric: 'tabular-nums',
                                fontSize: '0.6875rem',
                                color: isRuleBreached ? 'error.main' : 'text.primary',
                              }}
                            >
                              Rem: {rule.remaining.toFixed(1)}
                            </Typography>
                          )}
                        </Box>
                      )}

                      {rule.details && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block', mt: 0.25 }}>
                          {rule.details}
                        </Typography>
                      )}
                      {rule.resetsAt && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block', mt: 0.25 }}>
                          Resets: {new Date(rule.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                        </Typography>
                      )}
                    </Box>
                  );
                })
              ) : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <Typography variant="caption" color="text.secondary">Daily Loss Rule:</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>Higher of Prev Day EOD Balance or Equity</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <Typography variant="caption" color="text.secondary">EOD Reference Baseline:</Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                    >
                      {formatCurrency(health.dailyLossReference, account.baseCurrency)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <Typography variant="caption" color="text.secondary">Max Loss Rule:</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>Static Floor ({formatCurrency(health.maxLossFloor, account.baseCurrency)})</Typography>
                  </Box>
                </>
              )}
            </Box>
          </Collapse>
        </>
      ) : null}
    </Paper>
  );
};
