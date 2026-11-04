import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';
import { IPortfolioRiskResult, IRiskSettings, ILiveWatcherSummary } from '@tradevault/shared';
import { HelpHint } from '../../help/index.js';
import { formatCurrency } from '../../../lib/utils.js';

export interface LivePortfolioRiskBannerProps {
  risk: IPortfolioRiskResult;
  isDark?: boolean;
  riskSettings?: IRiskSettings;
  summary?: ILiveWatcherSummary | null;
  tradesTodayCount?: number;
  propRuleDailyLossLimit?: number;
  propRuleRemainingBuffer?: number;
  isPropMode?: boolean;
}

export function LivePortfolioRiskBanner({
  risk,
  isDark = true,
  riskSettings,
  summary,
  tradesTodayCount,
  propRuleDailyLossLimit,
  propRuleRemainingBuffer,
  isPropMode = false,
}: LivePortfolioRiskBannerProps) {
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

  // Discipline & Guardrails calculations (use firm rule daily limit if in Prop Mode)
  const maxDailyLoss = (isPropMode && propRuleDailyLossLimit && propRuleDailyLossLimit > 0)
    ? propRuleDailyLossLimit
    : (riskSettings?.maxDailyLoss ?? 5000);
  const maxOpenTrades = riskSettings?.maxOpenTrades ?? 3;
  const maxDailyTrades = riskSettings?.maxDailyTrades ?? 6;
  const maxRiskPerTrade = riskSettings?.maxRiskPerTradePercent ?? 2.0;

  const openTradesCount = summary?.openTradesCount ?? 0;
  const netFloating = summary?.totalFloatingNetPnL ?? 0;
  const totalRiskCapital = summary?.totalRiskCapital ?? 0;

  const currentLoss = netFloating < 0 ? Math.abs(netFloating) : 0;
  const dayLossPercent = Math.min(100, maxDailyLoss > 0 ? (currentLoss / maxDailyLoss) * 100 : 0);
  const isLossWarning = dayLossPercent >= 75 && dayLossPercent < 100;
  const isLossBreached = dayLossPercent >= 100;

  const lossBarColor = isLossBreached
    ? '#EF4444'
    : isLossWarning
    ? '#F97316'
    : dayLossPercent >= 50
    ? '#F59E0B'
    : '#10B981';

  return (
    <Box
      sx={{
        p: 1.5,
        mb: 2,
        borderRadius: '10px',
        bgcolor: isDark ? alpha('#0B132B', 0.85) : alpha('#F8FAFC', 0.95),
        border: `1px solid ${isDark ? alpha('#1E293B', 0.9) : alpha('#E2E8F0', 0.9)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      {/* Top Row: Portfolio Directional Exposure & Greeks */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 0.5 }}>
              PORTFOLIO EXPOSURE
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

          <Tooltip title="Net Rupee P&L impact across all positions per 1% directional index move" arrow>
            <Typography variant="caption" sx={{ fontWeight: 800, color: biasColor }}>
              Net Delta: {netDirectionalDelta >= 0 ? `+₹${netDirectionalDelta.toFixed(0)}` : `-₹${Math.abs(netDirectionalDelta).toFixed(0)}`}
            </Typography>
          </Tooltip>
        </Box>
      </Box>

      {/* Pinned Portfolio Risk & Discipline Strip */}
      <Box
        sx={{
          p: 1,
          borderRadius: '8px',
          bgcolor: isDark ? alpha('#0F172A', 0.6) : alpha('#FFFFFF', 0.7),
          border: `1px solid ${isDark ? alpha('#334155', 0.5) : alpha('#CBD5E1', 0.7)}`,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr 1fr 1fr' },
          gap: 1.5,
          alignItems: 'center',
        }}
      >
        {/* 1. Day Loss vs Max Daily Loss with 75% and 100% Markers */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem', color: isPropMode ? 'secondary.main' : 'text.secondary' }}>
              {isPropMode ? 'Prop Daily Loss Limit' : 'Day Floating Loss'}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                fontSize: '0.7rem',
                color: lossBarColor,
              }}
            >
              ₹{currentLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / ₹{maxDailyLoss.toLocaleString('en-IN')} ({dayLossPercent.toFixed(0)}%)
            </Typography>
          </Box>

          <Box sx={{ position: 'relative', width: '100%' }}>
            <LinearProgress
              variant="determinate"
              value={dayLossPercent}
              sx={{
                height: 7,
                borderRadius: 3,
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: lossBarColor,
                  borderRadius: 3,
                },
              }}
            />
            {/* 75% Warning Marker */}
            <Box
              sx={{
                position: 'absolute',
                left: '75%',
                top: -2,
                width: 2,
                height: 11,
                bgcolor: '#F97316',
                borderRadius: 1,
                zIndex: 2,
              }}
            />
            {/* 100% Breached Marker */}
            <Box
              sx={{
                position: 'absolute',
                left: '100%',
                top: -2,
                width: 2,
                height: 11,
                bgcolor: '#EF4444',
                borderRadius: 1,
                transform: 'translateX(-2px)',
                zIndex: 2,
              }}
            />
          </Box>
        </Box>

        {/* 2. Open Risk Capital */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem', color: 'text.secondary' }}>
            Total Open Risk Capital
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#38BDF8' }}>
              {formatCurrency(totalRiskCapital, 'INR')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.64rem' }}>
              (Max {maxRiskPerTrade}%/trade)
            </Typography>
          </Box>
        </Box>

        {/* 3. Open Trades vs Max Open */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem', color: 'text.secondary' }}>
            Open Positions
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                fontSize: '0.74rem',
                color: openTradesCount >= maxOpenTrades ? '#EF4444' : '#10B981',
              }}
            >
              {openTradesCount} / {maxOpenTrades}
            </Typography>
            {openTradesCount >= maxOpenTrades && (
              <Chip
                label="CAP REACHED"
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  bgcolor: alpha('#EF4444', 0.15),
                  color: '#EF4444',
                }}
              />
            )}
          </Box>
        </Box>

        {/* 4. Trades Today vs Max Daily Trades */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem', color: 'text.secondary' }}>
            Trades Today
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                fontSize: '0.74rem',
                color:
                  tradesTodayCount !== undefined && tradesTodayCount >= maxDailyTrades
                    ? '#EF4444'
                    : 'text.primary',
              }}
            >
              {tradesTodayCount !== undefined ? `${tradesTodayCount} / ${maxDailyTrades}` : `${openTradesCount} active (limit: ${maxDailyTrades})`}
            </Typography>
          </Box>
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
