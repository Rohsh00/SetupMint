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
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

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
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';

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
  onDrillDown?: (filterOrDesc: any, label: string) => void;
}

export function PyramidingAnalyticsTab({
  data,
  isLoading,
  currencySymbol = '$',
  onRefresh,
  onDrillDown,
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
      {/* Educational Concept Card: What is Pyramiding Edge & Alpha? */}
      <Card
        sx={{
          p: 2.5,
          borderRadius: 2.5,
          border: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.04)' : 'rgba(59, 130, 246, 0.02)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <SchoolRoundedIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Understanding Pyramiding Edge & Pyramid Alpha
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                1. What is Pyramiding?
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                Scaling into winners: adding new execution layers (Layer 1, 2, 3...) to an open trade as price moves in your intended direction.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                2. Pyramid Alpha
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                The counterfactual test: Did adding layers make you more money (+Alpha) than simply holding your initial base trade without adding any volume?
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                3. BE Shielding
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                Professional rule: Moving Stop Loss to Breakeven (+ spread cover) on existing layers before adding new ones, guaranteeing zero capital risk.
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', height: '100%', border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 0.5 }}>
                4. Campaign Blending
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                SetupMint clusters individual tickets into a single campaign to report your true blended entry price, total volume, and blended campaign P&L.
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>

      {/* 4 Hero KPI Cards */}
      <Grid container spacing={2}>
        {/* Card 1: Total Campaigns & Win Rate */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip title="Total multi-layer pyramided trading campaigns executed. Click to inspect all campaign trades." arrow>
            <Card
              onClick={() => {
                const allTradeIds = campaigns.flatMap((c) => c.layers.map((l) => l.id));
                if (onDrillDown && allTradeIds.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: allTradeIds },
                    `All Pyramiding Campaigns (${allTradeIds.length} trades)`
                  );
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#3B82F6',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)',
                },
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                {campaigns.length > 0 && (
                  <Typography variant="caption" sx={{ color: '#3B82F6', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    Inspect →
                  </Typography>
                )}
              </Box>
            </Card>
          </Tooltip>
        </Grid>

        {/* Card 2: Net Pyramid Alpha */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip title="Pyramid Alpha = Total Campaign PnL minus what the base trade would have earned without adding. Click to inspect alpha-positive campaigns." arrow>
            <Card
              onClick={() => {
                const alphaTradeIds = campaigns.filter((c) => c.pyramidAlpha > 0).flatMap((c) => c.layers.map((l) => l.id));
                if (onDrillDown && alphaTradeIds.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: alphaTradeIds },
                    `Alpha-Positive Campaign Trades (${alphaTradeIds.length} trades)`
                  );
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${isAlphaPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                backgroundColor: isAlphaPositive ? (isDark ? 'rgba(16, 185, 129, 0.04)' : 'rgba(16, 185, 129, 0.02)') : (isDark ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.02)'),
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: isAlphaPositive ? '#10B981' : '#EF4444',
                  transform: 'translateY(-2px)',
                  boxShadow: isAlphaPositive
                    ? '0 4px 12px rgba(16, 185, 129, 0.2)'
                    : '0 4px 12px rgba(239, 68, 68, 0.2)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Net Pyramid Alpha
                  </Typography>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: muiTheme.palette.text.secondary }} />
                </Box>
                {isAlphaPositive ? (
                  <TrendingUpRoundedIcon sx={{ fontSize: 20, color: '#10B981' }} />
                ) : (
                  <TrendingDownRoundedIcon sx={{ fontSize: 20, color: '#EF4444' }} />
                )}
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: isAlphaPositive ? '#10B981' : '#EF4444' }}>
                {isAlphaPositive ? '+' : '-'}{currencySymbol}{Math.abs(totalAlpha).toFixed(2)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  {isAlphaPositive ? 'Extra profit gained by scaling in' : 'Drawdown impact vs base-only hold'}
                </Typography>
                <Typography variant="caption" sx={{ color: isAlphaPositive ? '#10B981' : '#EF4444', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  Inspect →
                </Typography>
              </Box>
            </Card>
          </Tooltip>
        </Grid>

        {/* Card 3: Breakeven Discipline */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip title="Percentage of scale-in entries executed with base Stop Loss locked to Breakeven (+ Spread Cover). Click to inspect shielded trades." arrow>
            <Card
              onClick={() => {
                const protTradeIds = campaigns.filter((c) => c.wasProtected).flatMap((c) => c.layers.map((l) => l.id));
                if (onDrillDown && protTradeIds.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: protTradeIds },
                    `BE Shielded Campaign Trades (${protTradeIds.length} trades)`
                  );
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: (summary?.beProtectionRate ?? 0) >= 80 ? '#10B981' : '#F59E0B',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    BE Protection Rate
                  </Typography>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: muiTheme.palette.text.secondary }} />
                </Box>
                <SecurityRoundedIcon sx={{ fontSize: 20, color: (summary?.beProtectionRate ?? 0) >= 80 ? '#10B981' : '#F59E0B' }} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {summary?.beProtectionRate ?? 0}%
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Scale-ins with 0-risk base protection
                </Typography>
                <Typography variant="caption" sx={{ color: '#10B981', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  Inspect →
                </Typography>
              </Box>
            </Card>
          </Tooltip>
        </Grid>

        {/* Card 4: Scale Intensity */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Tooltip title="Average number of execution tickets per pyramiding campaign. Click to view campaigns." arrow>
            <Card
              onClick={() => {
                const multiTradeIds = campaigns.filter((c) => c.layerCount >= 2).flatMap((c) => c.layers.map((l) => l.id));
                if (onDrillDown && multiTradeIds.length > 0) {
                  onDrillDown(
                    { kind: 'TRADES', tradeIds: multiTradeIds },
                    `Multi-Layer Campaign Trades (${multiTradeIds.length} trades)`
                  );
                }
              }}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#8B5CF6',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)',
                },
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  Tickets per pyramiding campaign
                </Typography>
                <Typography variant="caption" sx={{ color: '#8B5CF6', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  Inspect →
                </Typography>
              </Box>
            </Card>
          </Tooltip>
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

                    {/* Right: Net PnL, Pyramid Alpha & Inspect Campaign */}
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
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDrillDown && camp.layers.length > 0) {
                            onDrillDown(
                              { kind: 'TRADES', tradeIds: camp.layers.map((l) => l.id) },
                              `Campaign: ${camp.symbol} ${camp.direction} (${camp.layerCount} layers)`
                            );
                          }
                        }}
                        endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 13 }} />}
                        sx={{
                          textTransform: 'none',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          py: 0.25,
                          px: 1,
                          borderColor: alpha(muiTheme.palette.primary.main, 0.4),
                        }}
                      >
                        Inspect Campaign
                      </Button>
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
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                            <Tooltip title="Layer 0 is the parent trade. Layers 1+ are subsequent scale-in additions." arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                                Layer <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                            <Tooltip title="Broker MT5 order ticket identification number" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                                Ticket <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                            <Tooltip title="Time when this specific layer entry was executed" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                                Entry Time <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                            <Tooltip title="Executed price fill for this layer" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                                Entry Price <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                            <Tooltip title="Executed exit price fill when closed" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                                Exit Price <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                            <Tooltip title="Contract lot volume traded on this specific layer" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                                Volume <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="right">
                            <Tooltip title="Net profit or loss realized exclusively by this execution layer" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                                Net PnL <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="right">
                            <Tooltip title="Realized return multiple of initial planned risk (R)" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'flex-end' }}>
                                Realized R <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="center">
                            <Tooltip title="Protected = Base stop was trailed to breakeven before this layer entered. Open Risk = Base stop had not been moved." arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'center' }}>
                                BE Shield <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }} align="center">
                            <Tooltip title="Inspect this individual trade record" arrow>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', justifyContent: 'center' }}>
                                Action <InfoOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />
                              </Box>
                            </Tooltip>
                          </TableCell>
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
                              <TableCell align="center">
                                <Button
                                  size="small"
                                  variant="text"
                                  color="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onDrillDown) {
                                      onDrillDown(
                                        { kind: 'TRADE', tradeId: l.id },
                                        `Layer ${l.layerIndex} (#${l.ticket} • ${l.quantity}L)`
                                      );
                                    }
                                  }}
                                  endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 12 }} />}
                                  sx={{ textTransform: 'none', fontSize: '0.7rem', fontWeight: 800, py: 0, px: 1, minWidth: 'auto' }}
                                >
                                  Inspect
                                </Button>
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

