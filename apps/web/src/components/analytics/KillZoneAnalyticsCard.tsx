import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import NightsStayRoundedIcon from '@mui/icons-material/NightsStayRounded';
import WbSunnyRoundedIcon from '@mui/icons-material/WbSunnyRounded';

import { IKillZoneAnalyticsReport, IKillZonePerformanceItem } from '@tradevault/financial-engine';
import { formatCurrency } from '../../lib/utils.js';
import { HelpHint } from '../help/index.js';

interface IKillZoneAnalyticsCardProps {
  data?: IKillZoneAnalyticsReport & { availableSymbols?: string[]; selectedSymbol?: string };
  isLoading?: boolean;
  currencySymbol?: string;
  selectedSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
  onRefresh?: () => void;
  onDrillDown?: (filter: any, label: string) => void;
}

export const KillZoneAnalyticsCard: React.FC<IKillZoneAnalyticsCardProps> = ({
  data,
  isLoading = false,
  currencySymbol = '$',
  selectedSymbol = 'ALL',
  onSelectSymbol,
  onRefresh,
  onDrillDown,
}) => {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  if (isLoading) {
    return (
      <Card sx={{ p: 3, borderRadius: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="text" width="40%" height={32} />
          <Skeleton variant="rounded" height={100} />
          <Skeleton variant="rounded" height={300} />
        </Box>
      </Card>
    );
  }

  const killZones = data?.killZones ?? [];
  const summary = data?.overallSummary;
  const availableSymbols = data?.availableSymbols ?? [];

  const getEdgeBadge = (rating: IKillZonePerformanceItem['edgeRating']) => {
    switch (rating) {
      case 'PRIME':
        return (
          <Chip
            size="small"
            icon={<AutoAwesomeRoundedIcon style={{ fontSize: 13 }} />}
            label="Prime Edge"
            sx={{
              fontWeight: 800,
              fontSize: '0.6875rem',
              height: 22,
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
              color: isDark ? '#34D399' : '#059669',
              border: `1px solid ${isDark ? 'rgba(52, 211, 153, 0.4)' : 'rgba(5, 150, 105, 0.3)'}`,
            }}
          />
        );
      case 'PROFITABLE':
        return (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon style={{ fontSize: 13 }} />}
            label="Profitable"
            sx={{
              fontWeight: 700,
              fontSize: '0.6875rem',
              height: 22,
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
              color: isDark ? '#60A5FA' : '#2563EB',
              border: `1px solid ${isDark ? 'rgba(96, 165, 250, 0.3)' : 'rgba(37, 99, 235, 0.2)'}`,
            }}
          />
        );
      case 'LEAK':
        return (
          <Chip
            size="small"
            icon={<WarningAmberRoundedIcon style={{ fontSize: 13 }} />}
            label="Capital Leak"
            sx={{
              fontWeight: 800,
              fontSize: '0.6875rem',
              height: 22,
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)',
              color: isDark ? '#F87171' : '#DC2626',
              border: `1px solid ${isDark ? 'rgba(248, 113, 113, 0.4)' : 'rgba(220, 38, 38, 0.3)'}`,
            }}
          />
        );
      default:
        return (
          <Chip
            size="small"
            label="Neutral"
            sx={{
              fontWeight: 600,
              fontSize: '0.6875rem',
              height: 22,
              backgroundColor: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)',
              color: isDark ? '#94A3B8' : '#64748B',
            }}
          />
        );
    }
  };

  const getSessionIcon = (key: string) => {
    if (key.includes('LONDON')) return <WbSunnyRoundedIcon sx={{ fontSize: 18, color: '#F59E0B' }} />;
    if (key.includes('NY')) return <FlashOnRoundedIcon sx={{ fontSize: 18, color: '#3B82F6' }} />;
    if (key.includes('ASIA') || key.includes('OFF_HOURS')) return <NightsStayRoundedIcon sx={{ fontSize: 18, color: '#8B5CF6' }} />;
    return <AccessTimeIcon sx={{ fontSize: 18, color: '#10B981' }} />;
  };

  return (
    <Card
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 2.5,
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.65)' : '#FFFFFF',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${muiTheme.palette.divider}`,
      }}
    >
      {/* Header & Controls */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, mb: 2.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <FlashOnRoundedIcon sx={{ color: 'primary.main', fontSize: 22 }} />
              Forex & Global Market Kill-Zone Performance
            </Typography>
            <HelpHint hintKey="analytics.time.killzones" />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Quantifies whether your edge is concentrated during institutional volatility windows or bleeding capital during off-hours chop.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          {/* Symbol Filter */}
          {availableSymbols.length > 0 && onSelectSymbol && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <FilterListRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <ButtonGroup size="small" variant="outlined" sx={{ flexWrap: 'wrap' }}>
                <Button
                  onClick={() => onSelectSymbol('ALL')}
                  variant={selectedSymbol === 'ALL' ? 'contained' : 'outlined'}
                  sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', px: 1.25, py: 0.3 }}
                >
                  All Symbols
                </Button>
                {availableSymbols.slice(0, 5).map((sym) => (
                  <Button
                    key={sym}
                    onClick={() => onSelectSymbol(sym)}
                    variant={selectedSymbol === sym ? 'contained' : 'outlined'}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', px: 1.25, py: 0.3 }}
                  >
                    {sym}
                  </Button>
                ))}
              </ButtonGroup>
            </Box>
          )}

          {onRefresh && (
            <Tooltip title="Refresh Kill-Zone Analytics" arrow>
              <Button
                size="small"
                variant="outlined"
                onClick={onRefresh}
                sx={{ minWidth: 34, width: 34, height: 30, p: 0, borderRadius: 1.5 }}
              >
                <RefreshRoundedIcon fontSize="small" />
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Summary KPI Banner */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Edge Delta Banner */}
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Kill-Zone Edge Delta
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.75 }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 900,
                    fontFamily: `'JetBrains Mono', monospace`,
                    color: summary.edgeDeltaPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                  }}
                >
                  {summary.edgeDeltaPnL >= 0 ? '+' : ''}
                  {formatCurrency(summary.edgeDeltaPnL)}
                </Typography>
                <Chip
                  size="small"
                  label={`${summary.edgeDeltaWinRate >= 0 ? '+' : ''}${summary.edgeDeltaWinRate}% WR`}
                  color={summary.edgeDeltaWinRate >= 0 ? 'success' : 'error'}
                  sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: '0.6875rem' }}>
                Profit difference: Primary Kill-Zones vs Off-Hours
              </Typography>
            </Paper>
          </Grid>

          {/* In Kill-Zone Metrics */}
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Inside Major Kill-Zones
                </Typography>
                <Chip label="High Edge" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.75 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, color: muiTheme.palette.profit.main }}>
                  {summary.inMajorKillZones.winRate}%
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Win Rate ({summary.inMajorKillZones.totalTrades} trades)
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: '0.6875rem' }}>
                Net: <strong>{formatCurrency(summary.inMajorKillZones.netPnL)}</strong> • PF: <strong>{summary.inMajorKillZones.profitFactor}</strong>
              </Typography>
            </Paper>
          </Grid>

          {/* Outside Kill-Zone Metrics */}
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.03)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Outside Kill-Zones (Off-Hours)
                </Typography>
                <Chip label="Secondary" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 600 }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.75 }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    color: summary.outsideMajorKillZones.netPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                  }}
                >
                  {summary.outsideMajorKillZones.winRate}%
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Win Rate ({summary.outsideMajorKillZones.totalTrades} trades)
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: '0.6875rem' }}>
                Net: <strong>{formatCurrency(summary.outsideMajorKillZones.netPnL)}</strong> • PF: <strong>{summary.outsideMajorKillZones.profitFactor}</strong>
              </Typography>
            </Paper>
          </Grid>

          {/* Best / Prime Zone */}
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.03)',
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Highest Edge Session
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {summary.bestKillZone ? summary.bestKillZone.name : 'N/A'}
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.profit.main, display: 'block', mt: 0.5, fontWeight: 700 }}>
                {summary.bestKillZone ? `${formatCurrency(summary.bestKillZone.netPnL)} (${summary.bestKillZone.winRate}% Win)` : 'No trades logged'}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Institutional Advice Banner */}
      {summary?.verdict && (
        <Alert
          severity={summary.edgeDeltaPnL >= 0 ? 'success' : 'info'}
          icon={summary.edgeDeltaPnL >= 0 ? <CheckCircleRoundedIcon /> : <InfoOutlinedIcon />}
          sx={{ mb: 3, borderRadius: 2, fontWeight: 600, fontSize: '0.8125rem' }}
        >
          {summary.verdict}
        </Alert>
      )}

      {/* Kill-Zones Table */}
      {killZones.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No closed trades recorded in the selected date range or symbol. Log or sync trades to unlock Kill-Zone analytics.
        </Alert>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, fontSize: '0.75rem', color: 'text.secondary', textTransform: 'uppercase', py: 1.25 } }}>
                <TableCell>Session / Kill-Zone</TableCell>
                <TableCell>Timing Window</TableCell>
                <TableCell align="center">Edge Status</TableCell>
                <TableCell align="right">Trades</TableCell>
                <TableCell align="right">Win Rate</TableCell>
                <TableCell align="right">Profit Factor</TableCell>
                <TableCell align="right">Net P&L</TableCell>
                <TableCell>Actionable Guidance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {killZones.map((kz) => {
                const isProfitable = kz.netPnL >= 0;
                return (
                  <TableRow
                    key={kz.key}
                    hover
                    onClick={() => {
                      if (onDrillDown) {
                        onDrillDown(
                          { killZone: kz.key, symbol: selectedSymbol !== 'ALL' ? selectedSymbol : undefined },
                          `${kz.name} Executions`
                        );
                      }
                    }}
                    sx={{
                      cursor: onDrillDown ? 'pointer' : 'default',
                      transition: 'background-color 0.15s ease',
                      '&:hover': {
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08) !important' : 'rgba(59, 130, 246, 0.04) !important',
                      },
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getSessionIcon(kz.key)}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {kz.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                            {kz.topSymbols && kz.topSymbols.length > 0 ? (
                              `Assets: ${kz.topSymbols.map((s) => `${s.symbol} (${s.tradesCount})`).join(', ')}`
                            ) : (
                              kz.description
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                        {kz.timing}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">{getEdgeBadge(kz.edgeRating)}</TableCell>

                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {kz.totalTrades}
                      </Typography>
                      {kz.totalTrades < 30 && (
                        <Tooltip title="Subgroup sample N < 30 has wide sampling uncertainty." arrow>
                          <Chip
                            label="N < 30"
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ height: 16, fontSize: '0.5rem', fontWeight: 600, ml: 0.5 }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>

                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          color: kz.winRate >= 50 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                        }}
                      >
                        {kz.winRate}%
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem' }}>
                        {kz.winningTrades}W - {kz.losingTrades}L
                      </Typography>
                    </TableCell>

                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                        {kz.profitFactor}
                      </Typography>
                      {kz.avgRealizedR !== undefined && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', display: 'block' }}>
                          {kz.avgRealizedR >= 0 ? `+${kz.avgRealizedR}R` : `${kz.avgRealizedR}R`}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: isProfitable ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                        }}
                      >
                        {isProfitable ? '+' : ''}
                        {formatCurrency(kz.netPnL)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', display: 'block' }}>
                        Exp: {formatCurrency(kz.expectancy)}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block', lineHeight: 1.3 }}>
                        {kz.recommendation}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', fontStyle: 'italic', display: 'block' }}>
        💡 Pro-Tip: Institutional Forex order flow clusters tightly around the London Open (07:00 - 10:00 UTC) and New York Open (12:00 - 15:00 UTC). Restricting discretionary trade entries strictly to these windows minimizes spread slippage and eliminates low-volatility churn. Click any session row to drill down into the underlying executions.
      </Typography>
    </Card>
  );
};
