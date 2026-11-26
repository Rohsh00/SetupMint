import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface IPyramidLayer {
  id: string;
  ticket: string;
  layerIndex: number;
  isParent: boolean;
  entryTime: string | Date;
  exitTime?: string | Date;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  netPnL: number;
  realizedR?: number;
  isBeProtected: boolean;
}

interface IPyramidCampaign {
  campaignId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  startTime: string | Date;
  endTime?: string | Date;
  durationMinutes: number;
  layerCount: number;
  totalVolume: number;
  blendedEntry: number;
  baseEntry: number;
  campaignNetPnL: number;
  baseOnlyPnL: number;
  pyramidAlpha: number;
  wasProtected: boolean;
  status: 'OPEN' | 'CLOSED';
  layers: IPyramidLayer[];
}

interface IPyramidingAnalyticsProps {
  data?: {
    summary?: {
      totalCampaigns: number;
      winningCampaignsCount: number;
      campaignWinRate: number;
      totalCampaignPnL: number;
      totalBaseOnlyPnL: number;
      totalPyramidAlpha: number;
      avgAlphaPerCampaign: number;
      beProtectionRate: number;
      avgLayersPerCampaign: number;
    };
    campaigns?: IPyramidCampaign[];
  };
  isLoading?: boolean;
  currencySymbol?: string;
  onRefresh?: () => void;
}

export function PyramidingAnalyticsTab({
  data,
  isLoading,
  currencySymbol = '$',
  onRefresh,
}: IPyramidingAnalyticsProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const resolvedPayload = (data as any)?.data ?? data;
  const summary = resolvedPayload?.summary;
  const campaigns: IPyramidCampaign[] = resolvedPayload?.campaigns || [];
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | false>(false);

  const handleAccordionChange = (campaignId: string) => (
    _event: React.SyntheticEvent,
    isExpanded: boolean
  ) => {
    setExpandedCampaignId(isExpanded ? campaignId : false);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" height={110} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={320} />
      </Box>
    );
  }

  const totalAlpha = summary?.totalPyramidAlpha ?? 0;
  const isAlphaPositive = totalAlpha >= 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 4 Hero KPI Cards */}
      <Grid container spacing={2}>
        {/* Card 1: Total Campaigns & Win Rate */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pyramid Campaigns
              </Typography>
              <AccountTreeRoundedIcon sx={{ fontSize: 20, color: '#3B82F6' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {summary?.totalCampaigns ?? 0}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`${summary?.campaignWinRate ?? 0}% Win Rate`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: (summary?.campaignWinRate ?? 0) >= 50 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: (summary?.campaignWinRate ?? 0) >= 50 ? '#10B981' : '#EF4444',
                }}
              />
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                {summary?.winningCampaignsCount ?? 0} won
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* Card 2: Net Pyramid Alpha */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${isAlphaPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              backgroundColor: isAlphaPositive ? (isDark ? 'rgba(16, 185, 129, 0.04)' : 'rgba(16, 185, 129, 0.02)') : (isDark ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.02)'),
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Tooltip title="Pyramid Alpha = Total Campaign PnL minus what the base trade would have earned without adding." arrow>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Net Pyramid Alpha
                  </Typography>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: muiTheme.palette.text.secondary }} />
                </Box>
              </Tooltip>
              {isAlphaPositive ? (
                <TrendingUpRoundedIcon sx={{ fontSize: 20, color: '#10B981' }} />
              ) : (
                <TrendingDownRoundedIcon sx={{ fontSize: 20, color: '#EF4444' }} />
              )}
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: isAlphaPositive ? '#10B981' : '#EF4444' }}>
              {isAlphaPositive ? '+' : '-'}{currencySymbol}{Math.abs(totalAlpha).toFixed(2)}
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              {isAlphaPositive ? 'Extra profit gained by scaling in' : 'Drawdown impact vs base-only hold'}
            </Typography>
          </Card>
        </Grid>

        {/* Card 3: Breakeven Discipline */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Tooltip title="Percentage of scale-in entries executed with base Stop Loss locked to Breakeven (+ Spread Cover)." arrow>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    BE Protection Rate
                  </Typography>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: muiTheme.palette.text.secondary }} />
                </Box>
              </Tooltip>
              <SecurityRoundedIcon sx={{ fontSize: 20, color: (summary?.beProtectionRate ?? 0) >= 80 ? '#10B981' : '#F59E0B' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {summary?.beProtectionRate ?? 0}%
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Scale-ins with 0-risk base protection
            </Typography>
          </Card>
        </Grid>

        {/* Card 4: Scale Intensity */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Average Layers
              </Typography>
              <LayersRoundedIcon sx={{ fontSize: 20, color: '#8B5CF6' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {summary?.avgLayersPerCampaign ?? 0}
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Tickets per pyramiding campaign
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Comparison & Concept Banner */}
      <Card
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAwesomeRoundedIcon sx={{ fontSize: 18, color: '#3B82F6' }} />
              Pyramid Alpha & Expectancy Breakdown
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              SetupMint evaluates pyramiding on a dual-track basis: the overall campaign result vs your base-only counterfactual hold.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Total Campaign PnL
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: (summary?.totalCampaignPnL ?? 0) >= 0 ? '#10B981' : '#EF4444' }}>
                {(summary?.totalCampaignPnL ?? 0) >= 0 ? '+' : ''}{currencySymbol}{summary?.totalCampaignPnL?.toFixed(2) ?? '0.00'}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Base-Only PnL
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800 }}>
                {(summary?.totalBaseOnlyPnL ?? 0) >= 0 ? '+' : ''}{currencySymbol}{summary?.totalBaseOnlyPnL?.toFixed(2) ?? '0.00'}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Net Pyramid Alpha
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: isAlphaPositive ? '#10B981' : '#EF4444' }}>
                {isAlphaPositive ? '+' : ''}{currencySymbol}{totalAlpha.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Card>

      {/* Campaigns Accordion Ledger */}
      <Card sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              Pyramiding Campaigns Ledger ({campaigns.length})
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              One-window campaign grouping. Click any campaign to expand individual execution layers.
            </Typography>
          </Box>
        </Box>

        {campaigns.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1, borderRadius: 2 }}>
            No multi-layer pyramided campaigns found in this time range. When you add layers to an open trade (via Telegram <code>[ ➕ Pyramid Gold... ]</code> or multiple MT5 entries), they automatically cluster here with blended metrics.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {campaigns.map((camp) => {
              const isWin = camp.campaignNetPnL >= 0;
              const isAlphaWin = camp.pyramidAlpha >= 0;
              const startFormatted = new Date(camp.startTime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <Accordion
                  key={camp.campaignId}
                  expanded={expandedCampaignId === camp.campaignId}
                  onChange={handleAccordionChange(camp.campaignId)}
                  sx={{
                    borderRadius: '8px !important',
                    border: `1px solid ${muiTheme.palette.divider}`,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(15, 23, 42, 0.015)',
                    '&:before': { display: 'none' },
                    overflow: 'hidden',
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRoundedIcon />}
                    sx={{
                      px: 2,
                      py: 1,
                      '& .MuiAccordionSummary-content': {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 2,
                      },
                    }}
                  >
                    {/* Left: Asset, Direction, Layers Badge */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Chip
                        label={camp.direction}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          fontWeight: 800,
                          backgroundColor: camp.direction === 'LONG' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: camp.direction === 'LONG' ? '#10B981' : '#EF4444',
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {camp.symbol}
                      </Typography>
                      <Chip
                        label={`${camp.layerCount} Layers`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
                      />
                      {camp.wasProtected ? (
                        <Tooltip title="Base Stop Loss was protected to Breakeven before scale-in" arrow>
                          <Chip
                            icon={<CheckCircleRoundedIcon sx={{ fontSize: '12px !important' }} />}
                            label="BE Shielded"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.625rem', fontWeight: 600 }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Scale-in was added without locking base stop to Breakeven" arrow>
                          <Chip
                            icon={<WarningAmberRoundedIcon sx={{ fontSize: '12px !important' }} />}
                            label="Unprotected"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.625rem', fontWeight: 600 }}
                          />
                        </Tooltip>
                      )}
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                        {startFormatted} · {camp.durationMinutes}m
                      </Typography>
                    </Box>

                    {/* Middle: Blended Entry & Total Volume */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>
                          Total Vol
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {camp.totalVolume.toFixed(2)}L
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>
                          Blended Entry
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          ${camp.blendedEntry.toFixed(2)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Right: Net PnL & Pyramid Alpha */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>
                          Campaign PnL
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 800, color: isWin ? '#10B981' : '#EF4444' }}
                        >
                          {isWin ? '+' : ''}{currencySymbol}{camp.campaignNetPnL.toFixed(2)}
                        </Typography>
                      </Box>
                      <Tooltip title={`Base-Only hold would have earned ${currencySymbol}${camp.baseOnlyPnL.toFixed(2)}. Pyramiding delta: ${isAlphaWin ? '+' : ''}${currencySymbol}${camp.pyramidAlpha.toFixed(2)}`} arrow>
                        <Chip
                          label={`${isAlphaWin ? '+' : ''}${currencySymbol}${camp.pyramidAlpha.toFixed(2)} Alpha`}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.6875rem',
                            backgroundColor: isAlphaWin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isAlphaWin ? '#10B981' : '#EF4444',
                          }}
                        />
                      </Tooltip>
                    </Box>
                  </AccordionSummary>

                  <AccordionDetails sx={{ pt: 0, pb: 2, px: 2 }}>
                    <Divider sx={{ mb: 1.5 }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary, mb: 1, display: 'block' }}>
                      INDIVIDUAL EXECUTION LAYERS & TELEMETRY
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Layer</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Ticket</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Entry Time</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Entry Price</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Exit Price</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Volume</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="right">Net PnL</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="right">Realized R</TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="center">BE Shield</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {camp.layers.map((l) => {
                          const lWin = l.netPnL >= 0;
                          const lEntryTime = new Date(l.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          return (
                            <TableRow key={l.id}>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: l.isParent ? 800 : 500 }}>
                                {l.isParent ? (
                                  <Chip label="Layer 0 (Base)" size="small" color="primary" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                                ) : (
                                  `Layer ${l.layerIndex}`
                                )}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                #{l.ticket}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem' }}>{lEntryTime}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>${l.entryPrice.toFixed(2)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>${l.exitPrice.toFixed(2)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem' }}>{l.quantity.toFixed(2)}L</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 800, color: lWin ? '#10B981' : '#EF4444' }} align="right">
                                {lWin ? '+' : ''}{currencySymbol}{l.netPnL.toFixed(2)}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700 }} align="right">
                                {l.realizedR !== undefined ? `${l.realizedR >= 0 ? '+' : ''}${l.realizedR.toFixed(2)}R` : '-'}
                              </TableCell>
                              <TableCell align="center">
                                {l.isBeProtected ? (
                                  <Chip label="Protected" size="small" color="success" sx={{ height: 16, fontSize: '0.5625rem' }} />
                                ) : (
                                  <Chip label="Open Risk" size="small" color="warning" sx={{ height: 16, fontSize: '0.5625rem' }} />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
      </Card>
    </Box>
  );
}

