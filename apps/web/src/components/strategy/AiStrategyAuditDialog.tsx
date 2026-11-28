import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

import { api } from '../../lib/api.js';
import { IAiStrategyAudit } from '@tradevault/shared';

interface AiStrategyAuditDialogProps {
  open: boolean;
  onClose: () => void;
  strategyId: string | null;
  strategyName?: string;
}

export function AiStrategyAuditDialog({
  open,
  onClose,
  strategyId,
  strategyName,
}: AiStrategyAuditDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const { data: auditRes, isLoading, refetch } = useQuery({
    queryKey: ['strategy-ai-audit', strategyId],
    queryFn: () => (strategyId ? api.strategies.aiAudit(strategyId) : null),
    enabled: Boolean(open && strategyId),
    staleTime: 5 * 60 * 1000,
  });

  const audit: IAiStrategyAudit | null = (auditRes as any)?.data ?? auditRes ?? null;

  const isStrong = audit?.edgeStatus === 'STRONG_EDGE';
  const isNegative = audit?.edgeStatus === 'NEGATIVE_EDGE';
  const statusColor = isStrong ? '#10b981' : isNegative ? '#ef4444' : '#f59e0b';
  const statusBg = isStrong ? 'rgba(16,185,129,0.12)' : isNegative ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(99, 102, 241, 0.15)',
              color: '#6366f1',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              AI Playbook Audit: {strategyName || audit?.strategyName || 'Strategy'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Statistical edge verification, MAE/MFE calibration, and execution leak remediation
            </Typography>
          </Box>
        </Box>
        {audit && (
          <Chip
            size="small"
            label={audit.edgeStatus.replace(/_/g, ' ')}
            sx={{
              fontWeight: 800,
              fontSize: '0.6875rem',
              bgcolor: statusBg,
              color: statusColor,
              border: `1px solid ${statusColor}40`,
            }}
          />
        )}
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1.5 }}>
        {isLoading && (
          <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={28} sx={{ color: '#6366f1' }} />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Auditing historical trades and calculating edge expectancy...
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Correlating entry confluences with winning vs losing outcomes
            </Typography>
          </Box>
        )}

        {audit && (
          <>
            {/* Quick Metrics Bar */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2.5,
                bgcolor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Sample Size</Typography>
                <Typography variant="body1" sx={{ fontWeight: 800 }}>{audit.totalTrades} Closed Trades</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Win Rate</Typography>
                <Typography variant="body1" sx={{ fontWeight: 800, color: audit.winRate >= 50 ? '#10b981' : '#f59e0b' }}>
                  {audit.winRate}%
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Profit Factor</Typography>
                <Typography variant="body1" sx={{ fontWeight: 800, color: audit.profitFactor >= 1.5 ? '#10b981' : '#f59e0b' }}>
                  {audit.profitFactor}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Avg Realized R</Typography>
                <Typography variant="body1" sx={{ fontWeight: 800, color: audit.avgRealizedR > 0 ? '#10b981' : '#ef4444' }}>
                  {audit.avgRealizedR >= 0 ? '+' : ''}{audit.avgRealizedR}R
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Engine</Typography>
                <Chip size="small" label={audit.modelUsed || 'AI Coach'} sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
              </Box>
            </Box>

            {/* Executive Summary */}
            <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6366f1' }}>
                Executive Edge Diagnosis
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6, fontWeight: 500 }}>
                {audit.executiveSummary}
              </Typography>
            </Box>

            {/* Winning Traits vs Losing Pitfalls Grid */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                    <TrendingUpRoundedIcon sx={{ color: '#10b981', fontSize: 18 }} />
                    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#10b981' }}>
                      Winning Execution Traits
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {audit.winningTraits.map((t, idx) => (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <CheckCircleRoundedIcon sx={{ color: '#10b981', fontSize: 15, mt: 0.2, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{t}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                    <TrendingDownRoundedIcon sx={{ color: '#ef4444', fontSize: 18 }} />
                    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#ef4444' }}>
                      Losing Execution Pitfalls
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {audit.losingPitfalls.map((t, idx) => (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <WarningAmberRoundedIcon sx={{ color: '#ef4444', fontSize: 15, mt: 0.2, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{t}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Grid>
            </Grid>

            {/* Excursion Guidance */}
            {audit.maeMfeOptimization && (
              <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', border: `1px solid ${muiTheme.palette.divider}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                  <TuneRoundedIcon sx={{ color: '#8b5cf6', fontSize: 18 }} />
                  <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#8b5cf6' }}>
                    Stop Loss & Target Excursion Calibration
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.55 }}>
                  {audit.maeMfeOptimization}
                </Typography>
              </Box>
            )}

            {/* Recommended Rule Optimizations */}
            {audit.recommendedRuleChanges && audit.recommendedRuleChanges.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
                  Recommended Playbook Rule Changes
                </Typography>
                {audit.recommendedRuleChanges.map((rule, idx) => (
                  <Box key={idx} sx={{ p: 1.25, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', minWidth: 20 }}>
                      {idx + 1}.
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                      {rule}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
        <Button size="small" variant="outlined" onClick={() => refetch()} sx={{ textTransform: 'none', fontWeight: 600 }}>
          Re-Run Audit
        </Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
