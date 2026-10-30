import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import { IPortfolioRiskResult } from '@tradevault/shared';
import { HelpHint } from '../../help/index.js';

export interface LivePortfolioRiskBannerProps {
  risk: IPortfolioRiskResult;
  isDark?: boolean;
}

export function LivePortfolioRiskBanner({ risk, isDark = true }: LivePortfolioRiskBannerProps) {
  const {
    netDirectionalBias,
    netDirectionalDelta,
    totalThetaBurnPerHour,
    totalDailyThetaBurn,
    conflictingPositionsWarning,
    conflictingDetails,
    underlyingExposure,
  } = risk;

  const biasColor =
    netDirectionalBias === 'STRONGLY_BULLISH' || netDirectionalBias === 'BULLISH'
      ? '#10B981'
      : netDirectionalBias === 'STRONGLY_BEARISH' || netDirectionalBias === 'BEARISH'
      ? '#EF4444'
      : '#3B82F6';

  const underlyingKeys = Object.keys(underlyingExposure);

  return (
    <Box
      sx={{
        p: 1.5,
        mb: 2,
        borderRadius: '10px',
        bgcolor: isDark ? alpha('#0B132B', 0.8) : alpha('#F8FAFC', 0.95),
        border: `1px solid ${isDark ? alpha('#1E293B', 0.9) : alpha('#E2E8F0', 0.9)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 0.5 }}>
              PORTFOLIO DIRECTIONAL EXPOSURE
            </Typography>
            <HelpHint hintKey="portfolio.directionalDelta" />
          </Box>
          <Chip
            label={netDirectionalBias.replace('_', ' ')}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.68rem',
              fontWeight: 800,
              bgcolor: alpha(biasColor, 0.15),
              color: biasColor,
              border: `1px solid ${alpha(biasColor, 0.35)}`,
              borderRadius: '5px',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {totalThetaBurnPerHour > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <Tooltip title="Total options time decay bleed across all open derivative contracts" arrow>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#F59E0B' }}>
                  🔥 Theta Burn: -₹{totalThetaBurnPerHour.toFixed(0)}/hr (-₹{totalDailyThetaBurn.toFixed(0)}/day)
                </Typography>
              </Tooltip>
              <HelpHint hintKey="portfolio.thetaBurn" />
            </Box>
          )}

          <Tooltip title="Net Rupee P&L impact across all positions per 1% directional move" arrow>
            <Typography variant="caption" sx={{ fontWeight: 800, color: biasColor }}>
              Net Delta: {netDirectionalDelta >= 0 ? `+₹${netDirectionalDelta.toFixed(0)}` : `-₹${Math.abs(netDirectionalDelta).toFixed(0)}`}
            </Typography>
          </Tooltip>
        </Box>
      </Box>

      {/* Conflicting Positions Warning Alert */}
      {conflictingPositionsWarning && conflictingDetails.length > 0 && (
        <Box
          sx={{
            p: 1,
            borderRadius: '6px',
            bgcolor: alpha('#EF4444', 0.12),
            border: `1px solid ${alpha('#EF4444', 0.35)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 800, fontSize: '0.72rem' }}>
            🚨 CONFLICTING EXPOSURE DETECTED:
          </Typography>
          <Typography variant="caption" sx={{ color: '#EF4444', fontSize: '0.72rem' }}>
            {conflictingDetails[0]}
          </Typography>
        </Box>
      )}

      {/* Underlying cluster pills */}
      {underlyingKeys.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', pt: 0.25 }}>
          {underlyingKeys.map((und) => {
            const item = underlyingExposure[und];
            const itemColor = item.directionalBias === 'LONG' ? '#10B981' : item.directionalBias === 'SHORT' ? '#EF4444' : '#3B82F6';
            return (
              <Box
                key={und}
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: '4px',
                  bgcolor: isDark ? alpha('#1E293B', 0.6) : alpha('#E2E8F0', 0.7),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.68rem' }}>
                  {und}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.64rem', color: itemColor }}>
                  {item.directionalBias} ({item.count} pos)
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

