import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import { getCurrencySymbol } from '../../../lib/utils.js';

export interface LiveSparklinePulseCheck {
  timestamp: number | string | Date;
  emotion: string;
  notes?: string;
  currentLtp?: number;
  floatingNetPnL?: number;
  unrealizedR?: number;
  pnl?: number;
  r?: number;
  price?: number;
}

export interface LiveSparklineProps {
  points?: Array<{
    timestamp: number;
    pnl: number;
    r: number;
    price: number;
    isPeakMfe?: boolean;
    isLowestMae?: boolean;
  }>;
  pulseCheckIns?: LiveSparklinePulseCheck[];
  width?: number;
  height?: number;
  isDark?: boolean;
  currency?: string;
}

export function LiveSparkline({
  points = [],
  pulseCheckIns = [],
  width = 160,
  height = 36,
  isDark = true,
  currency,
}: LiveSparklineProps) {
  const currSym = getCurrencySymbol(currency);
  if (!points || points.length < 2) {
    return null;
  }

  const pnls = points.map((p) => p.pnl);
  const minPnl = Math.min(...pnls);
  const maxPnl = Math.max(...pnls);
  const pnlRange = maxPnl - minPnl || 1;

  const paddingY = 4;
  const safeHeight = height - paddingY * 2;

  // Map points to SVG coordinates
  const coords = points.map((pt, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const normalizedY = (pt.pnl - minPnl) / pnlRange;
    const y = height - paddingY - normalizedY * safeHeight;
    return { ...pt, x, y };
  });

  const pathD = coords.reduce(
    (acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
    ''
  );

  const lastPt = coords[coords.length - 1];
  const isProfitable = (lastPt?.pnl ?? 0) >= 0;
  const strokeColor = isProfitable ? '#10B981' : '#F43F5E';

  // Area path for subtle gradient fill
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  const peakPt = coords.find((p) => p.isPeakMfe);
  const maePt = coords.find((p) => p.isLowestMae);

  // Map in-trade pulse check-ins to coordinates along the trajectory
  const pulseCoords = (pulseCheckIns || []).map((pulse) => {
    const pulseTime = new Date(pulse.timestamp).getTime();
    let closestCoord = coords[0];
    let minDiff = Math.abs((coords[0]?.timestamp ?? 0) - pulseTime);

    for (const c of coords) {
      const diff = Math.abs((c.timestamp ?? 0) - pulseTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestCoord = c;
      }
    }

    const emotionColor =
      pulse.emotion === 'CALM' ? '#10B981' :
      pulse.emotion === 'ANXIOUS' ? '#EF4444' :
      pulse.emotion === 'FOMO' ? '#F59E0B' :
      pulse.emotion === 'GREEDY' ? '#EC4899' : '#3B82F6';

    return {
      ...pulse,
      x: closestCoord?.x ?? 0,
      y: closestCoord?.y ?? height / 2,
      color: emotionColor,
    };
  });

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5, fontSize: '0.72rem' }}>
          <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: strokeColor }}>
            Current: {currSym}{lastPt?.pnl.toFixed(2)} ({lastPt?.r >= 0 ? '+' : ''}{lastPt?.r.toFixed(2)}R)
          </Typography>
          {peakPt && (
            <Typography variant="caption" sx={{ display: 'block', color: '#F59E0B' }}>
              Peak MFE: {currSym}{peakPt.pnl.toFixed(2)} (+{peakPt.r.toFixed(2)}R)
            </Typography>
          )}
          {maePt && (
            <Typography variant="caption" sx={{ display: 'block', color: '#EF4444' }}>
              Max Adverse: {currSym}{maePt.pnl.toFixed(2)} ({maePt.r.toFixed(2)}R)
            </Typography>
          )}
          {pulseCoords.length > 0 && (
            <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {pulseCoords.map((p, idx) => (
                <Typography key={idx} variant="caption" sx={{ display: 'block', color: p.color, fontSize: '0.68rem', fontWeight: 700 }}>
                  🧠 {p.emotion} {p.notes ? `("${p.notes}")` : ''} @ {currSym}{(p.floatingNetPnL ?? p.pnl ?? 0).toFixed(0)} ({p.unrealizedR !== undefined ? `${p.unrealizedR >= 0 ? '+' : ''}${p.unrealizedR.toFixed(1)}R` : ''})
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          cursor: 'pointer',
          borderRadius: '6px',
          p: 0.5,
          bgcolor: isDark ? alpha('#0F172A', 0.5) : alpha('#F1F5F9', 0.8),
          border: `1px solid ${isDark ? alpha('#334155', 0.4) : alpha('#E2E8F0', 0.8)}`,
        }}
      >
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={`sparkline-grad-${lastPt?.timestamp}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#sparkline-grad-${lastPt?.timestamp})`} />

          {/* Trajectory stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Peak MFE Diamond */}
          {peakPt && (
            <circle
              cx={peakPt.x}
              cy={peakPt.y}
              r="3.5"
              fill="#F59E0B"
              stroke={isDark ? '#0F172A' : '#FFFFFF'}
              strokeWidth="1.5"
            />
          )}

          {/* Lowest MAE Dot */}
          {maePt && (
            <circle
              cx={maePt.x}
              cy={maePt.y}
              r="3"
              fill="#EF4444"
              stroke={isDark ? '#0F172A' : '#FFFFFF'}
              strokeWidth="1"
            />
          )}

          {/* In-Trade Emotional Pulse Check-In Markers */}
          {pulseCoords.map((pulse, pIdx) => (
            <g key={`pulse-${pIdx}`}>
              <circle
                cx={pulse.x}
                cy={pulse.y}
                r="4"
                fill={pulse.color}
                stroke={isDark ? '#0F172A' : '#FFFFFF'}
                strokeWidth="1.5"
              />
              <circle
                cx={pulse.x}
                cy={pulse.y}
                r="1.5"
                fill="#FFFFFF"
              />
            </g>
          ))}

          {/* Current Live Head Pulse */}
          <circle
            cx={lastPt.x}
            cy={lastPt.y}
            r="4"
            fill={strokeColor}
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        </svg>
      </Box>
    </Tooltip>
  );
}

