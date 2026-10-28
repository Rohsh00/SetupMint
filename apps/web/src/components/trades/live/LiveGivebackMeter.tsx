import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import { ILiveGivebackMetric, ILiveOpenTradeMetric } from '@tradevault/shared';
import { formatCurrency } from '../../../lib/utils.js';

interface LiveGivebackMeterProps {
  giveback: ILiveGivebackMetric;
  metric: ILiveOpenTradeMetric;
  onLockProfit?: (metric: ILiveOpenTradeMetric) => void;
}

export function LiveGivebackMeter({
  giveback,
  metric,
  onLockProfit,
}: LiveGivebackMeterProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const {
    peakFloatingNetPnL,
    peakUnrealizedR,
    peakLtp,
    givebackAmount,
    givebackPercent,
    retentionPercent,
    threatLevel,
    alertMessage,
  } = giveback;

  // Only display giveback if trade has had positive excursion
  if (peakFloatingNetPnL <= 0 && peakUnrealizedR < 0.2) {
    return null;
  }

  const isCritical = threatLevel === 'CRITICAL_REVERSAL';
  const isLeaking = threatLevel === 'LEAKING';
  const isWatch = threatLevel === 'WATCH';

  const threatColor = isCritical
    ? '#EF4444'
    : isLeaking
    ? '#F59E0B'
    : isWatch
    ? '#3B82F6'
    : '#10B981';

  return (
    <Box
      sx={{
        mt: 1.5,
        mb: 1.5,
        p: 1.25,
        borderRadius: '10px',
        bgcolor: isDark
          ? isCritical
            ? alpha('#EF4444', 0.1)
            : isLeaking
            ? alpha('#F59E0B', 0.1)
            : 'rgba(255, 255, 255, 0.03)'
          : isCritical
          ? alpha('#EF4444', 0.08)
          : isLeaking
          ? alpha('#F59E0B', 0.08)
          : 'rgba(0, 0, 0, 0.02)',
        border: '1px solid',
        borderColor: isCritical
          ? alpha('#EF4444', 0.4)
          : isLeaking
          ? alpha('#F59E0B', 0.4)
          : isDark
          ? 'rgba(255, 255, 255, 0.08)'
          : 'rgba(0, 0, 0, 0.08)',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {/* Header: Peak MFE + Giveback Status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <TrendingUpRoundedIcon sx={{ fontSize: 16, color: '#10B981' }} />
          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: 0.1 }}>
            PEAK MFE TRACKER
          </Typography>
        </Box>

        <Chip
          label={
            threatLevel === 'CRITICAL_REVERSAL'
              ? 'CRITICAL REVERSAL'
              : threatLevel === 'LEAKING'
              ? 'PROFIT LEAKING'
              : threatLevel === 'WATCH'
              ? 'PULLBACK WATCH'
              : 'PROFIT SECURE'
          }
          size="small"
          sx={{
            height: 18,
            fontSize: '0.62rem',
            fontWeight: 800,
            bgcolor: alpha(threatColor, 0.15),
            color: threatColor,
            border: `1px solid ${alpha(threatColor, 0.3)}`,
            borderRadius: '4px',
          }}
        />
      </Box>

      {/* Numerical Metrics Row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          mb: 1,
          textAlign: 'center',
          bgcolor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.6)',
          p: 0.75,
          borderRadius: '6px',
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block' }}>
            Peak MTM
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#10B981', fontSize: '0.75rem' }}>
            +{formatCurrency(peakFloatingNetPnL, 'INR')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
            +{peakUnrealizedR.toFixed(2)}R (@ ₹{peakLtp})
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block' }}>
            Profit Retained
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: retentionPercent >= 50 ? '#10B981' : '#F59E0B', fontSize: '0.75rem' }}>
            {retentionPercent}%
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
            +{formatCurrency(metric.floatingNetPnL, 'INR')} now
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block' }}>
            Giveback
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
              color: givebackAmount > 0 ? (isLeaking || isCritical ? '#EF4444' : '#F59E0B') : '#10B981',
              fontSize: '0.75rem',
            }}
          >
            {givebackAmount > 0 ? `-${formatCurrency(givebackAmount, 'INR')}` : '₹0'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
            {givebackPercent}% leaked
          </Typography>
        </Box>
      </Box>

      {/* Dual Segment Progress Bar: Retained (Green) vs Given Back (Red/Amber) */}
      <Box sx={{ mb: 1 }}>
        <Box
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          <Tooltip title={`Retained: ${retentionPercent}% (+₹${metric.floatingNetPnL.toLocaleString('en-IN')})`} arrow>
            <Box
              sx={{
                width: `${retentionPercent}%`,
                bgcolor: '#10B981',
                transition: 'width 0.3s ease',
              }}
            />
          </Tooltip>
          {givebackPercent > 0 && (
            <Tooltip title={`Given Back: ${givebackPercent}% (-₹${givebackAmount.toLocaleString('en-IN')})`} arrow>
              <Box
                sx={{
                  width: `${givebackPercent}%`,
                  bgcolor: isCritical ? '#EF4444' : isLeaking ? '#F59E0B' : '#64748B',
                  transition: 'width 0.3s ease',
                }}
              />
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Alert Warning & 1-Click Action when leaking or critical */}
      {(isLeaking || isCritical) && alertMessage && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            p: 0.75,
            borderRadius: '6px',
            bgcolor: isCritical ? alpha('#EF4444', 0.15) : alpha('#F59E0B', 0.15),
            border: `1px solid ${alpha(threatColor, 0.3)}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isCritical ? (
              <ErrorOutlineRoundedIcon sx={{ fontSize: 16, color: '#EF4444', flexShrink: 0 }} />
            ) : (
              <WarningAmberRoundedIcon sx={{ fontSize: 16, color: '#F59E0B', flexShrink: 0 }} />
            )}
            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: threatColor }}>
              {alertMessage}
            </Typography>
          </Box>

          {onLockProfit && (
            <Button
              size="small"
              variant="contained"
              startIcon={<ShieldRoundedIcon sx={{ fontSize: '12px !important' }} />}
              onClick={() => onLockProfit(metric)}
              sx={{
                height: 24,
                px: 1,
                fontSize: '0.65rem',
                fontWeight: 800,
                textTransform: 'none',
                bgcolor: threatColor,
                color: '#FFFFFF',
                borderRadius: '4px',
                flexShrink: 0,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: isCritical ? '#DC2626' : '#D97706',
                },
              }}
            >
              Protect Profit
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
