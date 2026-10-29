import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { ILiveTargetLadder, ILiveTargetLadderStep, ILiveOpenTradeMetric } from '@tradevault/shared';
import { formatCurrency } from '../../../lib/utils.js';

interface LiveScalingLadderProps {
  ladder: ILiveTargetLadder;
  metric: ILiveOpenTradeMetric;
  onExecuteStep: (step: ILiveTargetLadderStep) => void;
  onOpenCustomRules?: () => void;
  compact?: boolean;
}

export function LiveScalingLadder({
  ladder,
  metric,
  onExecuteStep,
  onOpenCustomRules,
  compact = false,
}: LiveScalingLadderProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const { steps, initialRiskPoints, initialRiskAmount } = ladder;
  const resolvedLotSize = ladder.lotSize ?? metric.lotSize ?? 1;

  if (!steps || steps.length === 0) return null;

  return (
    <Box
      sx={{
        mt: compact ? 0 : 1.5,
        mb: compact ? 0 : 1.5,
        p: compact ? 1 : 1.25,
        borderRadius: '10px',
        bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        border: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, flexWrap: 'wrap', gap: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <TrackChangesRoundedIcon sx={{ fontSize: 16, color: '#3B82F6' }} />
          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: 0.1 }}>
            MULTI-TARGET SCALING LADDER
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            1R = {initialRiskPoints.toFixed(1)} pts ({formatCurrency(initialRiskAmount, 'INR')})
          </Typography>

          {onOpenCustomRules && (
            <Tooltip title="Configure custom R1-R3 targets, exit ratios & auto-execution rules" arrow>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsRoundedIcon sx={{ fontSize: '12px !important' }} />}
                onClick={onOpenCustomRules}
                sx={{
                  height: 20,
                  px: 0.75,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                  color: isDark ? '#94A3B8' : '#64748B',
                  borderRadius: '4px',
                  '&:hover': { borderColor: '#3B82F6', color: '#3B82F6', bgcolor: alpha('#3B82F6', 0.08) },
                }}
              >
                Custom R1-R3
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Ladder Step Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {steps.map((step) => {
          const isMet = step.status === 'MET';
          const isInProgress = step.status === 'IN_PROGRESS';
          const isExecuted = step.status === 'EXECUTED';
          const isFree = Boolean(step.isFreeRunner);

          const stepColor = isFree ? '#A855F7' : isMet ? '#10B981' : isInProgress ? '#3B82F6' : '#64748B';
          const stepBg = isFree
            ? alpha('#A855F7', isDark ? 0.12 : 0.05)
            : isMet
            ? alpha('#10B981', isDark ? 0.15 : 0.08)
            : isInProgress
            ? alpha('#3B82F6', isDark ? 0.12 : 0.06)
            : isDark
            ? 'rgba(255, 255, 255, 0.02)'
            : 'rgba(0, 0, 0, 0.015)';

          return (
            <Box
              key={step.targetIndex}
              sx={{
                p: 1,
                borderRadius: '8px',
                bgcolor: stepBg,
                border: '1px solid',
                borderColor: isFree
                  ? alpha('#A855F7', 0.35)
                  : isMet
                  ? alpha('#10B981', 0.4)
                  : isInProgress
                  ? alpha('#3B82F6', 0.3)
                  : isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s',
              }}
            >
              {/* Step Top Row: Name, Target Price, Status Chip */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.72rem', color: stepColor }}>
                    {step.name}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem', color: isFree ? '#A855F7' : 'inherit' }}>
                    {isFree ? '• Open Trail (No Cap)' : `@ ₹${step.targetPrice}`}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Chip
                    icon={isMet ? <CheckCircleRoundedIcon sx={{ fontSize: '11px !important' }} /> : isFree ? <TrackChangesRoundedIcon sx={{ fontSize: '11px !important' }} /> : undefined}
                    label={
                      isFree
                        ? 'FREE RUNNER'
                        : isMet
                        ? 'TARGET MET'
                        : isInProgress
                        ? `${step.progressPercent}% RUN`
                        : 'PENDING'
                    }
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      bgcolor: alpha(stepColor, 0.15),
                      color: stepColor,
                      border: `1px solid ${alpha(stepColor, 0.3)}`,
                      borderRadius: '4px',
                    }}
                  />
                </Box>
              </Box>

              {/* Progress Bar */}
              <Box sx={{ mb: 0.75 }}>
                <LinearProgress
                  variant="determinate"
                  value={isFree ? 100 : Math.min(100, Math.max(0, step.progressPercent))}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: stepColor,
                      borderRadius: 2,
                      ...(isFree && {
                        backgroundImage: 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)',
                      }),
                    },
                  }}
                />
              </Box>

              {/* Bottom Row: Description & Execute Action */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block' }}>
                    {isFree
                      ? 'Riding open market trend • Trailing SL protected'
                      : step.distancePoints > 0
                      ? `${step.distancePoints} pts remaining`
                      : 'Target reached!'}
                  </Typography>
                  {(() => {
                    const isLotBased = resolvedLotSize > 1;
                    const lotCount = step.plannedExitLots ?? (isLotBased ? Math.max(1, Math.round(step.plannedExitQty / resolvedLotSize)) : 1);
                    const bookText = isLotBased
                      ? `${lotCount} ${lotCount === 1 ? 'lot' : 'lots'} (${step.plannedExitQty} units)`
                      : `${step.plannedExitQty} units`;
                    return (
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
                        }}
                      >
                        Action: Book {bookText} & {step.suggestedStopLabel || `Trail SL to ₹${step.suggestedStopLoss}`}
                      </Typography>
                    );
                  })()}
                </Box>

                <Button
                  size="small"
                  variant={isMet ? 'contained' : 'outlined'}
                  startIcon={<FlashOnRoundedIcon sx={{ fontSize: '12px !important' }} />}
                  onClick={() => onExecuteStep(step)}
                  sx={{
                    height: 24,
                    px: 1,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    textTransform: 'none',
                    bgcolor: isMet ? '#10B981' : isFree ? alpha('#A855F7', 0.12) : 'transparent',
                    color: isMet ? '#FFFFFF' : stepColor,
                    borderColor: stepColor,
                    borderRadius: '4px',
                    boxShadow: 'none',
                    flexShrink: 0,
                    '&:hover': {
                      bgcolor: isMet ? '#059669' : alpha(stepColor, 0.2),
                      borderColor: stepColor,
                    },
                  }}
                >
                  {isFree ? 'Close Runner' : `Execute ${step.targetIndex === 3 ? 'Runner' : `T${step.targetIndex}`}`}
                </Button>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
