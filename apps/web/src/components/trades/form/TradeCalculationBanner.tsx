import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Alert,
  Divider,
  useTheme,
} from '@mui/material';
import {
  TrendingUpRounded,
  TrendingDownRounded,
  RemoveCircleOutlineRounded,
  HourglassEmptyRounded,
  WarningAmberRounded,
  ShieldRounded,
} from '@mui/icons-material';
import { TradeOutcome } from '@tradevault/shared';
import { formatCurrency, formatR } from '../../../lib/utils.js';

interface TradeCalculationBannerProps {
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  outcome: TradeOutcome;
  realizedR?: number;
  plannedRisk?: number;
  rewardRiskRatio?: number;
  positionValue?: number;
  status: string;
  isDirectionValid?: boolean;
  directionError?: string | null;
  isAutoFees?: boolean;
  onResetAutoFees?: () => void;
}

export function TradeCalculationBanner({
  grossPnL,
  totalCosts,
  netPnL,
  outcome,
  realizedR,
  plannedRisk,
  rewardRiskRatio,
  positionValue,
  status,
  isDirectionValid = true,
  directionError,
  isAutoFees,
  onResetAutoFees,
}: TradeCalculationBannerProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const isClosed = status === 'CLOSED';
  const isNetPositive = netPnL > 0;
  const isNetNegative = netPnL < 0;

  // Determine accent color
  let accentColor = muiTheme.palette.text.secondary;
  if (isClosed) {
    if (isNetPositive) accentColor = muiTheme.palette.profit.main;
    else if (isNetNegative) accentColor = muiTheme.palette.loss.main;
  } else {
    accentColor = muiTheme.palette.info.main;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Card
        variant="outlined"
        sx={{
          backgroundImage: 'none',
          backgroundColor: isDark
            ? isClosed
              ? isNetPositive
                ? 'rgba(16, 185, 129, 0.08)'
                : isNetNegative
                ? 'rgba(244, 63, 94, 0.08)'
                : 'rgba(255, 255, 255, 0.03)'
              : 'rgba(59, 130, 246, 0.08)'
            : isClosed
            ? isNetPositive
              ? 'rgba(5, 150, 105, 0.06)'
              : isNetNegative
              ? 'rgba(220, 38, 38, 0.06)'
              : 'rgba(0, 0, 0, 0.02)'
            : 'rgba(37, 99, 235, 0.05)',
          borderColor: isClosed
            ? isNetPositive
              ? `${muiTheme.palette.profit.main}40`
              : isNetNegative
              ? `${muiTheme.palette.loss.main}40`
              : 'divider'
            : `${muiTheme.palette.info.main}40`,
          borderRadius: 2,
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            {/* Primary Net Result */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  backgroundColor: isClosed
                    ? isNetPositive
                      ? `${muiTheme.palette.profit.main}20`
                      : isNetNegative
                      ? `${muiTheme.palette.loss.main}20`
                      : 'action.hover'
                    : `${muiTheme.palette.info.main}20`,
                  color: accentColor,
                }}
              >
                {!isClosed ? (
                  <HourglassEmptyRounded sx={{ fontSize: 24 }} />
                ) : isNetPositive ? (
                  <TrendingUpRounded sx={{ fontSize: 26 }} />
                ) : isNetNegative ? (
                  <TrendingDownRounded sx={{ fontSize: 26 }} />
                ) : (
                  <RemoveCircleOutlineRounded sx={{ fontSize: 24 }} />
                )}
              </Box>

              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    fontSize: '0.6875rem',
                    display: 'block',
                  }}
                >
                  {isClosed ? 'Realized Net Result' : 'Position Status / Live Estimate'}
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: '-0.02em',
                    color: isClosed ? accentColor : 'text.primary',
                    lineHeight: 1.1,
                    mt: 0.25,
                  }}
                >
                  {isClosed ? formatCurrency(netPnL) : 'Active / In Progress'}
                </Typography>
              </Box>
            </Box>

            {/* Financial Metrics Strip */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1.25,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              {/* Outcome Badge */}
              <Chip
                label={
                  !isClosed
                    ? 'OPEN POSITION'
                    : outcome === 'WIN'
                    ? 'WIN'
                    : outcome === 'LOSS'
                    ? 'LOSS'
                    : 'BREAKEVEN'
                }
                size="small"
                color={
                  !isClosed
                    ? 'info'
                    : outcome === 'WIN'
                    ? 'success'
                    : outcome === 'LOSS'
                    ? 'error'
                    : 'default'
                }
                sx={{
                  fontWeight: 800,
                  fontSize: '0.6875rem',
                  letterSpacing: '0.04em',
                  height: 24,
                }}
              />

              {/* Realized R-Multiple */}
              {isClosed && realizedR !== undefined && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    fontSize: '0.75rem',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                    REALIZED R
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 800,
                      fontFamily: 'inherit',
                      color: realizedR > 0 ? muiTheme.palette.profit.main : realizedR < 0 ? muiTheme.palette.loss.main : 'text.primary',
                    }}
                  >
                    {formatR(realizedR)}
                  </Typography>
                </Box>
              )}

              {/* Gross P&L */}
              <Box
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1,
                  backgroundColor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  fontSize: '0.75rem',
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                  GROSS P&L
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    color: grossPnL > 0 ? muiTheme.palette.profit.main : grossPnL < 0 ? muiTheme.palette.loss.main : 'text.primary',
                  }}
                >
                  {formatCurrency(grossPnL)}
                </Typography>
              </Box>

              {/* Total Costs */}
              <Box
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1,
                  backgroundColor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  fontSize: '0.75rem',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                    TOTAL FEES
                  </Typography>
                  {isAutoFees !== undefined && (
                    <Chip
                      label={isAutoFees ? 'AUTO' : 'MANUAL'}
                      size="small"
                      color={isAutoFees ? 'success' : 'warning'}
                      variant="outlined"
                      sx={{ height: 16, fontSize: '0.5625rem', fontWeight: 800, px: 0.25 }}
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'inherit', color: 'text.secondary' }}>
                    {formatCurrency(totalCosts)}
                  </Typography>
                  {isAutoFees === false && onResetAutoFees && (
                    <Typography
                      variant="caption"
                      onClick={onResetAutoFees}
                      sx={{
                        fontSize: '0.5625rem',
                        color: 'primary.main',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontWeight: 600,
                      }}
                    >
                      Reset
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Planned Risk */}
              {plannedRisk !== undefined && plannedRisk > 0 && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    fontSize: '0.75rem',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                    RISK AT STOP
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'inherit', color: muiTheme.palette.loss.main }}>
                    {formatCurrency(plannedRisk)}
                  </Typography>
                </Box>
              )}

              {/* Planned R:R */}
              {rewardRiskRatio !== undefined && rewardRiskRatio > 0 && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    fontSize: '0.75rem',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                    EST. R:R
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'inherit', color: muiTheme.palette.profit.main }}>
                    1 : {rewardRiskRatio.toFixed(2)}
                  </Typography>
                </Box>
              )}

              {/* Position Capital Exposure */}
              {positionValue !== undefined && positionValue > 0 && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    fontSize: '0.75rem',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                    EXPOSURE
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'inherit', color: 'text.primary' }}>
                    {formatCurrency(positionValue)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Direction & Stop Loss Invalidation Alert */}
      {!isDirectionValid && (
        <Alert
          severity="warning"
          icon={<WarningAmberRounded />}
          sx={{
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: 1.5,
          }}
        >
          {directionError || 'Invalid risk configuration: verify entry price and stop loss price relationship.'}
        </Alert>
      )}
    </Box>
  );
}
