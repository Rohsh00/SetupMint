import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import {
  ILiveTargetLadder,
  ILiveTargetLadderStep,
  ILiveOpenTradeMetric,
} from '@tradevault/shared';
import { formatCurrency, getCurrencySymbol } from '../../../lib/utils.js';

export interface LiveUnifiedPriceLadderProps {
  ladder?: ILiveTargetLadder;
  metric: ILiveOpenTradeMetric;
  onExecuteStep?: (step: ILiveTargetLadderStep) => void;
  onOpenCustomRules?: () => void;
  onQuickTrailSl?: (newStop: number) => void;
  compact?: boolean;
}

export function LiveUnifiedPriceLadder({
  ladder,
  metric,
  onExecuteStep,
  onOpenCustomRules,
  onQuickTrailSl,
  compact = false,
}: LiveUnifiedPriceLadderProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const currSym = getCurrencySymbol(metric.currency);

  const {
    direction,
    entryPrice,
    currentLtp,
    stopLoss,
    trueBreakevenPrice,
    feeBufferPoints,
    giveback,
    unrealizedR,
    priceDeltaPoints,
  } = metric;

  const isLong = direction === 'LONG';
  const isProfitable = isLong ? currentLtp >= entryPrice : currentLtp <= entryPrice;
  const steps = ladder?.steps || [];
  const peakPrice = giveback?.peakLtp ?? currentLtp;

  // Build full hierarchy of price tiers (ordered from highest price at top to lowest price at bottom)
  interface LadderTier {
    id: string;
    label: string;
    sublabel?: string;
    price: number;
    type: 'TARGET' | 'PEAK' | 'LTP' | 'TRUE_BE' | 'ENTRY' | 'STOP_LOSS' | 'INITIAL_STOP';
    color: string;
    isCurrentLtp?: boolean;
    step?: ILiveTargetLadderStep;
    actionButton?: {
      label: string;
      onClick: () => void;
      disabled?: boolean;
      variant?: 'contained' | 'outlined';
    };
  }

  const tiers: LadderTier[] = [];

  // 1. Target Ladder Steps
  steps.forEach((step) => {
    if (step.targetPrice && step.targetPrice > 0) {
      const isMet = step.status === 'MET';
      const isInProgress = step.status === 'IN_PROGRESS';
      const color = step.isFreeRunner ? '#A855F7' : isMet ? '#10B981' : isInProgress ? '#3B82F6' : '#64748B';

      tiers.push({
        id: `target-${step.targetIndex}`,
        label: step.name,
        sublabel: step.isFreeRunner
          ? 'Open Trail'
          : `${Math.round(step.plannedExitRatio * 100)}% partial (${step.progressPercent}%)`,
        price: step.targetPrice,
        type: 'TARGET',
        color,
        step,
        actionButton:
          isMet && onExecuteStep
            ? {
                label: `Scale Out (${Math.round(step.plannedExitRatio * 100)}%)`,
                onClick: () => onExecuteStep(step),
                variant: 'contained',
              }
            : undefined,
      });
    }
  });

  // 2. Peak MFE (if distinct from current LTP)
  if (peakPrice && Math.abs(peakPrice - currentLtp) > 0.1) {
    tiers.push({
      id: 'peak-mfe',
      label: 'Peak High Watermark (MFE)',
      sublabel: giveback ? `Peak +${giveback.peakUnrealizedR.toFixed(2)}R (-${giveback.givebackPercent}% giveback)` : undefined,
      price: peakPrice,
      type: 'PEAK',
      color: '#F59E0B',
    });
  }

  // 3. Current Live LTP
  tiers.push({
    id: 'current-ltp',
    label: 'Current LTP',
    sublabel: `${priceDeltaPoints >= 0 ? '+' : ''}${priceDeltaPoints.toFixed(2)} pts (${unrealizedR !== null ? `${unrealizedR >= 0 ? '+' : ''}${unrealizedR.toFixed(2)}R` : ''})`,
    price: currentLtp,
    type: 'LTP',
    color: isProfitable ? '#10B981' : '#EF4444',
    isCurrentLtp: true,
  });

  // 4. True Breakeven (with fee buffer)
  if (trueBreakevenPrice && trueBreakevenPrice > 0 && Math.abs(trueBreakevenPrice - entryPrice) > 0.05) {
    const canLockBe = isProfitable && onQuickTrailSl;
    tiers.push({
      id: 'true-be',
      label: 'True Breakeven (with fees)',
      sublabel: feeBufferPoints ? `+${feeBufferPoints.toFixed(2)} pts charges cushion` : undefined,
      price: trueBreakevenPrice,
      type: 'TRUE_BE',
      color: '#06B6D4',
      actionButton:
        canLockBe && (!stopLoss || (isLong ? stopLoss < trueBreakevenPrice : stopLoss > trueBreakevenPrice))
          ? {
              label: 'Lock True BE',
              onClick: () => onQuickTrailSl(trueBreakevenPrice),
              variant: 'outlined',
            }
          : undefined,
    });
  }

  // 5. Entry Price
  tiers.push({
    id: 'entry',
    label: 'Fill Entry Price',
    sublabel: 'Nominal Cost Basis',
    price: entryPrice,
    type: 'ENTRY',
    color: '#64748B',
  });

  // 6. Current Active Stop Loss
  if (stopLoss !== null && stopLoss !== undefined && stopLoss > 0) {
    const isStopClose = metric.stopThreatLevel === 'CRITICAL' || metric.stopThreatLevel === 'BREACHED';
    tiers.push({
      id: 'current-sl',
      label: 'Active Stop Loss',
      sublabel: metric.distanceToStopPoints !== null ? `${metric.distanceToStopPoints.toFixed(1)} pts away (${metric.stopThreatLevel})` : undefined,
      price: stopLoss,
      type: 'STOP_LOSS',
      color: isStopClose ? '#EF4444' : '#F97316',
    });
  }

  // Sort tiers strictly descending by price (highest price at top, lowest at bottom)
  tiers.sort((a, b) => b.price - a.price);

  return (
    <Box
      sx={{
        p: compact ? 1 : 1.5,
        borderRadius: '10px',
        bgcolor: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(248, 250, 252, 0.95)',
        border: `1px solid ${isDark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(226, 232, 240, 0.8)'}`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {isLong ? (
            <ArrowUpwardRoundedIcon sx={{ fontSize: 16, color: '#10B981' }} />
          ) : (
            <ArrowDownwardRoundedIcon sx={{ fontSize: 16, color: '#EF4444' }} />
          )}
          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.74rem', letterSpacing: 0.5 }}>
            UNIFIED VERTICAL LADDER ({direction})
          </Typography>
          <Chip
            label={isProfitable ? 'IN PROFIT' : 'UNDERWATER'}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.62rem',
              fontWeight: 800,
              bgcolor: isProfitable ? alpha('#10B981', 0.15) : alpha('#EF4444', 0.15),
              color: isProfitable ? '#10B981' : '#EF4444',
              borderRadius: '4px',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {ladder?.initialRiskPoints ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.66rem', fontWeight: 600 }}>
              1R = {ladder.initialRiskPoints.toFixed(1)} pts ({formatCurrency(ladder.initialRiskAmount, metric.currency || 'USD')})
            </Typography>
          ) : null}

          {onOpenCustomRules && (
            <Tooltip title="Configure multi-target exit rules & dynamic trailing" arrow>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsRoundedIcon sx={{ fontSize: '11px !important' }} />}
                onClick={onOpenCustomRules}
                sx={{
                  height: 20,
                  px: 0.75,
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                  color: isDark ? '#94A3B8' : '#64748B',
                }}
              >
                Rules
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Vertical Ladder Spine */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, position: 'relative' }}>
        {tiers.map((tier) => {
          const isLtp = tier.isCurrentLtp;

          return (
            <Box
              key={tier.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.25,
                py: isLtp ? 0.9 : 0.65,
                borderRadius: '6px',
                bgcolor: isLtp
                  ? alpha(tier.color, isDark ? 0.2 : 0.1)
                  : isDark
                  ? 'rgba(255, 255, 255, 0.02)'
                  : 'rgba(0, 0, 0, 0.015)',
                border: '1px solid',
                borderColor: isLtp
                  ? tier.color
                  : isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(0, 0, 0, 0.06)',
                boxShadow: isLtp ? `0 0 10px ${alpha(tier.color, 0.25)}` : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {/* Left Column: Marker + Labels */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: isLtp ? 10 : 7,
                    height: isLtp ? 10 : 7,
                    borderRadius: '50%',
                    bgcolor: tier.color,
                    boxShadow: isLtp ? `0 0 8px ${tier.color}` : 'none',
                    animation: isLtp ? 'pulse 1.8s infinite' : 'none',
                    '@keyframes pulse': {
                      '0%': { transform: 'scale(0.95)', opacity: 0.8 },
                      '50%': { transform: 'scale(1.25)', opacity: 1 },
                      '100%': { transform: 'scale(0.95)', opacity: 0.8 },
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      animation: 'none',
                    },
                  }}
                />

                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: isLtp ? 900 : 700,
                        fontSize: isLtp ? '0.78rem' : '0.7rem',
                        color: isLtp ? tier.color : 'text.primary',
                      }}
                    >
                      {tier.label}
                    </Typography>
                    {tier.step && (
                      <Chip
                        label={tier.step.status}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: '0.58rem',
                          fontWeight: 800,
                          bgcolor: alpha(tier.color, 0.12),
                          color: tier.color,
                          borderRadius: '3px',
                        }}
                      />
                    )}
                  </Box>

                  {tier.sublabel && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.62rem',
                        color: 'text.secondary',
                        fontWeight: 500,
                      }}
                    >
                      {tier.sublabel}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Right Column: Price + Action Button */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {tier.actionButton && (
                  <Button
                    size="small"
                    variant={tier.actionButton.variant || 'outlined'}
                    onClick={tier.actionButton.onClick}
                    sx={{
                      height: 22,
                      px: 1,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      borderRadius: '4px',
                      ...(tier.actionButton.variant === 'contained'
                        ? {
                            bgcolor: '#10B981',
                            color: '#FFFFFF',
                            '&:hover': { bgcolor: '#059669' },
                          }
                        : {
                            borderColor: tier.color,
                            color: tier.color,
                            '&:hover': { bgcolor: alpha(tier.color, 0.1) },
                          }),
                    }}
                  >
                    {tier.actionButton.label}
                  </Button>
                )}

                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: isLtp ? 900 : 800,
                    fontSize: isLtp ? '0.84rem' : '0.74rem',
                    color: isLtp ? tier.color : 'text.primary',
                  }}
                >
                  {currSym}{tier.price.toLocaleString(metric.currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

