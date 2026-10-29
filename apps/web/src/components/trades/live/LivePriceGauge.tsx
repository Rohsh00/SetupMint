import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { ILiveOpenTradeMetric } from '@tradevault/shared';

export interface LivePriceGaugeProps {
  metric: ILiveOpenTradeMetric;
  onQuickTrailSl?: (newStop: number) => void;
}

export function LivePriceGauge({ metric, onQuickTrailSl }: LivePriceGaugeProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const {
    direction,
    entryPrice,
    currentLtp,
    stopLoss,
    targetLadder,
    giveback,
    unrealizedR,
    priceDeltaPoints,
  } = metric;

  const isLong = direction === 'LONG';
  const isProfitable = isLong ? currentLtp >= entryPrice : currentLtp <= entryPrice;

  // Extract key price levels
  const effectiveStop = stopLoss ?? (isLong ? entryPrice * 0.98 : entryPrice * 1.02);
  const ladderSteps = targetLadder?.steps || [];
  const t1Price = ladderSteps[0]?.targetPrice;
  const t2Price = ladderSteps[1]?.targetPrice;
  const peakPrice = giveback?.peakLtp ?? currentLtp;

  // Compute gauge min/max bounds so all critical levels fit nicely
  const allPrices = [entryPrice, currentLtp, effectiveStop];
  if (t1Price && t1Price > 0) allPrices.push(t1Price);
  if (t2Price && t2Price > 0) allPrices.push(t2Price);
  if (peakPrice && peakPrice > 0) allPrices.push(peakPrice);

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range = maxPrice - minPrice;

  // Prevent divide-by-zero
  const safeRange = range <= 0 ? 1 : range;

  // Convert price to 0-100% position on the horizontal bar
  const getPct = (p: number) => {
    const raw = ((p - minPrice) / safeRange) * 100;
    return Math.max(3, Math.min(97, raw));
  };

  const stopPct = getPct(effectiveStop);
  const entryPct = getPct(entryPrice);
  const currentPct = getPct(currentLtp);
  const peakPct = getPct(peakPrice);
  const t1Pct = t1Price && t1Price > 0 ? getPct(t1Price) : null;
  const t2Pct = t2Price && t2Price > 0 ? getPct(t2Price) : null;

  const themeGreen = '#10B981';
  const themeRed = '#EF4444';
  const themeBlue = '#3B82F6';
  const themeAmber = '#F59E0B';

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: isDark ? alpha('#0F172A', 0.6) : alpha('#F8FAFC', 0.9),
        border: `1px solid ${isDark ? alpha('#334155', 0.6) : alpha('#E2E8F0', 0.8)}`,
      }}
    >
      {/* Header Info */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: '0.04em' }}>
            TACTICAL RANGE
          </Typography>
          <Box
            sx={{
              px: 1,
              py: 0.2,
              borderRadius: 1,
              fontSize: '0.72rem',
              fontWeight: 800,
              bgcolor: isProfitable ? alpha(themeGreen, 0.15) : alpha(themeRed, 0.15),
              color: isProfitable ? themeGreen : themeRed,
              border: `1px solid ${isProfitable ? alpha(themeGreen, 0.3) : alpha(themeRed, 0.3)}`,
            }}
          >
            {unrealizedR !== null ? `${unrealizedR >= 0 ? '+' : ''}${unrealizedR.toFixed(2)}R` : '--'}
          </Box>
        </Box>

        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          Δ {priceDeltaPoints >= 0 ? `+${priceDeltaPoints.toFixed(2)}` : priceDeltaPoints.toFixed(2)} pts
        </Typography>
      </Box>

      {/* Interactive Micro Track Bar */}
      <Box sx={{ position: 'relative', height: 26, my: 0.5, display: 'flex', alignItems: 'center' }}>
        {/* Base Track */}
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            bgcolor: isDark ? alpha('#1E293B', 0.9) : alpha('#E2E8F0', 0.9),
          }}
        />

        {/* Dynamic Profit/Loss Gradient Fill between Entry and LTP */}
        <Box
          sx={{
            position: 'absolute',
            left: `${Math.min(entryPct, currentPct)}%`,
            width: `${Math.max(1, Math.abs(currentPct - entryPct))}%`,
            height: 6,
            borderRadius: 3,
            bgcolor: isProfitable ? alpha(themeGreen, 0.6) : alpha(themeRed, 0.6),
            transition: 'all 0.3s ease',
          }}
        />

        {/* Stop Loss Marker (Red) */}
        <Tooltip title={`Stop Loss: ₹${effectiveStop.toFixed(2)}`} arrow placement="top">
          <Box
            sx={{
              position: 'absolute',
              left: `${stopPct}%`,
              transform: 'translateX(-50%)',
              width: 3,
              height: 14,
              borderRadius: 1,
              bgcolor: themeRed,
              zIndex: 2,
              cursor: 'pointer',
            }}
          />
        </Tooltip>

        {/* Entry Price Marker (Blue) */}
        <Tooltip title={`Entry Price: ₹${entryPrice.toFixed(2)}`} arrow placement="top">
          <Box
            sx={{
              position: 'absolute',
              left: `${entryPct}%`,
              transform: 'translateX(-50%)',
              width: 3,
              height: 16,
              borderRadius: 1,
              bgcolor: themeBlue,
              zIndex: 2,
              cursor: 'pointer',
            }}
          />
        </Tooltip>

        {/* True Breakeven (Lock BE + Fees) Marker (Cyan) */}
        {metric.trueBreakevenPrice && metric.trueBreakevenPrice > 0 && (
          <Tooltip
            title={`Fee-Protected True Breakeven: ₹${metric.trueBreakevenPrice.toFixed(2)} (${metric.feeBufferPoints ? `+${metric.feeBufferPoints.toFixed(2)}pts fee buffer` : 'fees covered'}) • Click to Lock BE`}
            arrow
            placement="top"
          >
            <Box
              onClick={() => onQuickTrailSl?.(metric.trueBreakevenPrice!)}
              sx={{
                position: 'absolute',
                left: `${getPct(metric.trueBreakevenPrice)}%`,
                transform: 'translateX(-50%)',
                width: 3,
                height: 14,
                borderRadius: 1,
                bgcolor: '#06B6D4',
                zIndex: 3,
                cursor: 'pointer',
                boxShadow: '0 0 6px #06B6D4',
              }}
            />
          </Tooltip>
        )}

        {/* Peak MFE Diamond Marker (Amber) */}
        {peakPct !== currentPct && (
          <Tooltip title={`Peak MFE reached: ₹${peakPrice.toFixed(2)}`} arrow placement="top">
            <Box
              sx={{
                position: 'absolute',
                left: `${peakPct}%`,
                transform: 'translateX(-50%) rotate(45deg)',
                width: 7,
                height: 7,
                bgcolor: themeAmber,
                zIndex: 3,
                boxShadow: `0 0 6px ${alpha(themeAmber, 0.6)}`,
              }}
            />
          </Tooltip>
        )}

        {/* Target 1 Marker (Green) */}
        {t1Pct !== null && (
          <Tooltip title={`Target 1: ₹${t1Price?.toFixed(2)}`} arrow placement="top">
            <Box
              sx={{
                position: 'absolute',
                left: `${t1Pct}%`,
                transform: 'translateX(-50%)',
                width: 3,
                height: 14,
                borderRadius: 1,
                bgcolor: themeGreen,
                zIndex: 2,
                cursor: 'pointer',
              }}
            />
          </Tooltip>
        )}

        {/* Target 2 Marker (Green) */}
        {t2Pct !== null && (
          <Tooltip title={`Target 2: ₹${t2Price?.toFixed(2)}`} arrow placement="top">
            <Box
              sx={{
                position: 'absolute',
                left: `${t2Pct}%`,
                transform: 'translateX(-50%)',
                width: 3,
                height: 14,
                borderRadius: 1,
                bgcolor: alpha(themeGreen, 0.7),
                zIndex: 2,
                cursor: 'pointer',
              }}
            />
          </Tooltip>
        )}

        {/* Live LTP Pulsing Indicator Point */}
        <Tooltip title={`Current LTP: ₹${currentLtp.toFixed(2)}`} arrow placement="bottom">
          <Box
            sx={{
              position: 'absolute',
              left: `${currentPct}%`,
              transform: 'translateX(-50%)',
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: isProfitable ? themeGreen : themeRed,
              border: '2px solid white',
              boxShadow: `0 0 8px ${isProfitable ? themeGreen : themeRed}`,
              zIndex: 4,
              animation: 'pulse 1.8s infinite',
              transition: 'left 0.4s ease',
            }}
          />
        </Tooltip>
      </Box>

      {/* Bottom Labels (SL, Entry, LTP, Target) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" sx={{ fontSize: '0.68rem', color: themeRed, fontWeight: 700 }}>
          SL ₹{effectiveStop.toFixed(2)}
        </Typography>

        <Typography variant="caption" sx={{ fontSize: '0.68rem', color: themeBlue, fontWeight: 700 }}>
          Entry ₹{entryPrice.toFixed(2)}
        </Typography>

        <Typography
          variant="caption"
          sx={{
            fontSize: '0.68rem',
            color: isProfitable ? themeGreen : themeRed,
            fontWeight: 800,
          }}
        >
          LTP ₹{currentLtp.toFixed(2)}
        </Typography>

        {t1Price && t1Price > 0 && (
          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: themeGreen, fontWeight: 700 }}>
            T1 ₹{t1Price.toFixed(2)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

