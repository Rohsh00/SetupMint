import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import { IPositionGreeksSummary } from '@tradevault/shared';
import { HelpHint } from '../../help/index.js';

export interface LiveOptionsGreeksCardProps {
  greeks: IPositionGreeksSummary;
  isDark?: boolean;
}

export function LiveOptionsGreeksCard({ greeks, isDark = true }: LiveOptionsGreeksCardProps) {
  const {
    unitGreeks,
    positionDelta,
    cashDeltaSensitivity,
    positionThetaHourly,
    positionThetaDaily,
    moneyness,
    timeToExpiryHours,
    isNearExpiry,
    ivCrushWarning,
  } = greeks;

  const moneynessColor =
    moneyness === 'DEEP_ITM' || moneyness === 'ITM'
      ? '#10B981'
      : moneyness === 'ATM'
      ? '#3B82F6'
      : '#F59E0B';

  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: '8px',
        bgcolor: isDark ? alpha('#0B132B', 0.6) : alpha('#F8FAFC', 0.9),
        border: `1px solid ${isDark ? alpha('#1E293B', 0.8) : alpha('#E2E8F0', 0.9)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      {/* Header Badges */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 0.4 }}>
              OPTIONS GREEKS
            </Typography>
            <HelpHint hintKey="options.greeks" />
          </Box>
          <Chip
            label={moneyness.replace('_', ' ')}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.62rem',
              fontWeight: 800,
              bgcolor: alpha(moneynessColor, 0.15),
              color: moneynessColor,
              border: `1px solid ${alpha(moneynessColor, 0.3)}`,
              borderRadius: '4px',
            }}
          />
        </Box>

        <Typography variant="caption" sx={{ fontSize: '0.68rem', color: isNearExpiry ? '#EF4444' : 'text.secondary', fontWeight: 700 }}>
          {timeToExpiryHours <= 24 ? `⏳ ${timeToExpiryHours}h to expiry` : `📅 ${(timeToExpiryHours / 24).toFixed(1)}d to expiry`}
        </Typography>
      </Box>

      {/* Primary Metrics Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, pt: 0.25 }}>
        {/* Net Delta Sensitivity */}
        <Tooltip title="Rupee P&L sensitivity per 1-point move in underlying index" arrow>
          <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? alpha('#1E293B', 0.5) : alpha('#F1F5F9', 0.7) }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', fontWeight: 700, display: 'block' }}>
              NET DELTA (₹/PT)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, color: cashDeltaSensitivity >= 0 ? '#10B981' : '#EF4444', fontSize: '0.78rem' }}>
              {cashDeltaSensitivity >= 0 ? `+₹${cashDeltaSensitivity.toFixed(1)}` : `-₹${Math.abs(cashDeltaSensitivity).toFixed(1)}`}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.58rem' }}>
              Δ {unitGreeks.delta >= 0 ? `+${unitGreeks.delta.toFixed(2)}` : unitGreeks.delta.toFixed(2)}
            </Typography>
          </Box>
        </Tooltip>

        {/* Hourly Theta Decay */}
        <Tooltip title="Total rupee time decay lost per market trading hour (6.25 hrs/day)" arrow>
          <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? alpha('#1E293B', 0.5) : alpha('#F1F5F9', 0.7) }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', fontWeight: 700, display: 'block' }}>
              THETA (₹/HR)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, color: '#F59E0B', fontSize: '0.78rem' }}>
              -₹{Math.abs(positionThetaHourly).toFixed(1)}/hr
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.58rem' }}>
              -₹{Math.abs(positionThetaDaily).toFixed(0)}/day
            </Typography>
          </Box>
        </Tooltip>

        {/* Implied Volatility */}
        <Tooltip title="Annualized Implied Volatility solved from current market LTP" arrow>
          <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? alpha('#1E293B', 0.5) : alpha('#F1F5F9', 0.7) }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', fontWeight: 700, display: 'block' }}>
              IMPLIED VOL (IV)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, color: '#06B6D4', fontSize: '0.78rem' }}>
              {unitGreeks.impliedVolatility}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.58rem' }}>
              ν ₹{Math.abs(greeks.positionVega).toFixed(1)}/1% IV
            </Typography>
          </Box>
        </Tooltip>

        {/* Gamma */}
        <Tooltip title="Rate of Delta change per 1 point underlying move (Gamma acceleration)" arrow>
          <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? alpha('#1E293B', 0.5) : alpha('#F1F5F9', 0.7) }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', fontWeight: 700, display: 'block' }}>
              GAMMA (Γ)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, color: '#8B5CF6', fontSize: '0.78rem' }}>
              {unitGreeks.gamma.toFixed(4)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.58rem' }}>
              {unitGreeks.distanceToStrikePoints >= 0 ? `+${unitGreeks.distanceToStrikePoints} pts` : `${unitGreeks.distanceToStrikePoints} pts`}
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      {/* IV Crush Threat Alert Banner */}
      {ivCrushWarning && (
        <Box
          sx={{
            px: 1,
            py: 0.5,
            borderRadius: '4px',
            bgcolor: alpha('#EF4444', 0.12),
            border: `1px solid ${alpha('#EF4444', 0.3)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 800, fontSize: '0.65rem' }}>
            ⚠️ IV CRUSH THREAT:
          </Typography>
          <Typography variant="caption" sx={{ color: '#EF4444', fontSize: '0.65rem' }}>
            Near expiry afternoon with high extrinsic premium. Rapid decay threat active.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

