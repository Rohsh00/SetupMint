import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

// Icons
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import MonetizationOnRoundedIcon from '@mui/icons-material/MonetizationOnRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

import { formatCurrency, formatPercent, getCurrencySymbol } from '../../lib/utils.js';
import { HelpHint } from '../help/index.js';

export interface IAnalyticsSummaryTabProps {
  summaryData: any;
  isLoading: boolean;
  onRefresh?: () => void;
  analyticsCurrency: string;
  currencySymbol: string;
  onSelectSymbol?: (sym: string) => void;
}

export function AnalyticsSummaryTab({
  summaryData,
  isLoading,
  onRefresh,
  analyticsCurrency,
  currencySymbol,
  onSelectSymbol,
}: IAnalyticsSummaryTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();

  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const report = summaryData?.data || summaryData;

  const scorecard = report?.scorecard;
  const priorityDirectives = report?.priorityDirectives || [];
  const dos = report?.dos || [];
  const donts = report?.donts || [];
  const circuitBreakers = report?.circuitBreakers;
  const deskCheatSheet = report?.deskCheatSheet;
  const dataHealth = report?.dataHealth;

  const curr = scorecard?.currency || analyticsCurrency || 'USD';
  const sym = getCurrencySymbol(curr) || currencySymbol || '$';

  const handleToggleCheck = (key: string) => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
        <Paper
          sx={{
            p: 3,
            borderRadius: 3,
            border: `1px solid ${muiTheme.palette.divider}`,
            bgcolor: isDark ? alpha('#0F172A', 0.6) : alpha('#F8FAFC', 0.8),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <CircularProgress size={24} sx={{ color: '#10B981' }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Synthesizing Behavioral Playbook & Directives...
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Calculating statistical significance across instruments, sessions, sizing drift, and emotional mistakes.
          </Typography>
          <Grid container spacing={2}>
            {[1, 2, 3, 4].map((i) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        </Paper>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={380} sx={{ borderRadius: 3 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rounded" height={380} sx={{ borderRadius: 3 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (!scorecard) {
    return (
      <Alert
        severity="info"
        icon={<AutoAwesomeRoundedIcon />}
        sx={{ my: 3, borderRadius: 2 }}
        action={
          onRefresh && (
            <Button size="small" onClick={onRefresh} startIcon={<SyncRoundedIcon />}>
              Refresh
            </Button>
          )
        }
      >
        No trade summary data is currently available for this account scope or date range. Log closed trades to generate your actionable trading playbook.
      </Alert>
    );
  }

  // Health Score Color
  const getScoreColor = (score: number) => {
    if (score >= 80) return isDark ? '#34D399' : '#059669';
    if (score >= 60) return isDark ? '#FBBF24' : '#D97706';
    return isDark ? '#F87171' : '#DC2626';
  };

  const scoreColor = getScoreColor(scorecard.overallScore);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 4 }}>
      {/* Sample Size Notice */}
      {!scorecard.hasSufficientData && (
        <Alert
          severity="info"
          icon={<LightbulbRoundedIcon />}
          sx={{
            borderRadius: 2.5,
            border: `1px solid ${alpha('#3B82F6', 0.3)}`,
            bgcolor: isDark ? alpha('#1E3A8A', 0.25) : alpha('#EFF6FF', 0.8),
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Preliminary Playbook ({dataHealth?.closedTradesCount ?? 0} Closed Trades)
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Your directives are based on emerging statistical patterns. Log at least 15 closed trades to elevate all DOs & DON'Ts to High Confidence.
          </Typography>
        </Alert>
      )}

      {/* 1. EXECUTIVE SCORECARD BANNER */}
      <Card
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 3.5,
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${alpha(scoreColor, isDark ? 0.35 : 0.25)}`,
          background: isDark
            ? `linear-gradient(135deg, ${alpha('#0F172A', 0.95)} 0%, ${alpha('#1E293B', 0.8)} 100%)`
            : `linear-gradient(135deg, #FFFFFF 0%, ${alpha('#F8FAFC', 0.9)} 100%)`,
          boxShadow: isDark
            ? '0 10px 30px rgba(0,0,0,0.35)'
            : '0 10px 25px rgba(0,0,0,0.05)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: 2.5,
            mb: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Score Ring / Grade */}
            <Box
              sx={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: `3px solid ${scoreColor}`,
                bgcolor: alpha(scoreColor, 0.12),
                boxShadow: `0 0 16px ${alpha(scoreColor, 0.3)}`,
                flexShrink: 0,
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
                {scorecard.grade}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, opacity: 0.8 }}>
                {scorecard.overallScore}/100
              </Typography>
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Trader Action Playbook
                </Typography>
                <Chip
                  label={scorecard.verdictLabel}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: '11px',
                    bgcolor: alpha(scoreColor, 0.15),
                    color: scoreColor,
                    border: `1px solid ${alpha(scoreColor, 0.3)}`,
                  }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Empirical rules of engagement derived directly from {scorecard.totalClosedTrades} trades in this account scope.
              </Typography>
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, alignSelf: { xs: 'stretch', md: 'auto' } }}>
            <Button
              variant="contained"
              color="primary"
              size="medium"
              startIcon={<PrintRoundedIcon />}
              onClick={() => setCheatSheetOpen(true)}
              sx={{
                borderRadius: 2,
                fontWeight: 700,
                textTransform: 'none',
                px: 2.5,
                bgcolor: isDark ? '#10B981' : '#059669',
                '&:hover': { bgcolor: isDark ? '#059669' : '#047857' },
              }}
            >
              Desk Cheat Sheet
            </Button>
            {onRefresh && (
              <Tooltip title="Recompute Playbook">
                <IconButton onClick={onRefresh} size="small" sx={{ border: `1px solid ${muiTheme.palette.divider}` }}>
                  <SyncRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 2.5, opacity: 0.6 }} />

        {/* Scorecard Metric Tiles */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Preventable Leaks
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  color: scorecard.totalPreventableLoss > 0 ? (isDark ? '#F87171' : '#DC2626') : 'text.primary',
                }}
              >
                -{sym} {formatCurrency(scorecard.totalPreventableLoss)}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10.5px', color: 'text.secondary' }}>
                Avoidable mistake bleed
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Verified Win Rate
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: scorecard.winRate >= 50 ? (isDark ? '#34D399' : '#059669') : 'text.primary' }}>
                {scorecard.winRate}%
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10.5px', color: 'text.secondary' }}>
                Across {scorecard.totalClosedTrades} closed trades
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Net Profit Factor
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: scorecard.profitFactor >= 1.5 ? (isDark ? '#34D399' : '#059669') : 'text.primary' }}>
                {scorecard.profitFactor >= 999 ? '∞' : scorecard.profitFactor.toFixed(2)}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10.5px', color: 'text.secondary' }}>
                Gross win vs loss ratio
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Net Expectancy (R)
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  color: (scorecard.expectancyR ?? 0) >= 0 ? (isDark ? '#34D399' : '#059669') : (isDark ? '#F87171' : '#DC2626'),
                }}
              >
                {scorecard.expectancyR !== undefined ? `${scorecard.expectancyR >= 0 ? '+' : ''}${scorecard.expectancyR}R` : 'N/A'}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10.5px', color: 'text.secondary' }}>
                Average return per risk unit
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Rule Adherence
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: scorecard.ruleAdherencePercent >= 80 ? (isDark ? '#34D399' : '#059669') : 'text.primary' }}>
                {scorecard.ruleAdherencePercent}%
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10.5px', color: 'text.secondary' }}>
                Plan execution discipline
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Net P&L Realized
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  color: scorecard.netPnL >= 0 ? (isDark ? '#34D399' : '#059669') : (isDark ? '#F87171' : '#DC2626'),
                }}
              >
                {scorecard.netPnL >= 0 ? '+' : ''}{sym} {formatCurrency(Math.abs(scorecard.netPnL))}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '10.5px', color: 'text.secondary' }}>
                Scope cumulative return
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>

      {/* 2. TODAY'S PRIORITY DIRECTIVES (BANNER CALLOUTS) */}
      {priorityDirectives.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <FlashOnRoundedIcon sx={{ color: '#F59E0B' }} fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
              High-Conviction Focus Directives
            </Typography>
            <Chip label="IMMEDIATE IMPACT" size="small" sx={{ fontSize: '10px', height: 20, fontWeight: 700, bgcolor: alpha('#F59E0B', 0.15), color: '#F59E0B' }} />
          </Box>

          <Grid container spacing={2}>
            {priorityDirectives.map((item: any, idx: number) => {
              const isDo = item.type === 'DO';
              const cardColor = isDo ? (isDark ? '#34D399' : '#059669') : (isDark ? '#F87171' : '#DC2626');
              return (
                <Grid size={{ xs: 12, md: priorityDirectives.length === 2 ? 6 : 4 }} key={item.id || idx}>
                  <Card
                    sx={{
                      p: 2.25,
                      borderRadius: 2.5,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderLeft: `5px solid ${cardColor}`,
                      bgcolor: isDark ? alpha(cardColor, 0.05) : alpha(cardColor, 0.03),
                      borderTop: `1px solid ${muiTheme.palette.divider}`,
                      borderRight: `1px solid ${muiTheme.palette.divider}`,
                      borderBottom: `1px solid ${muiTheme.palette.divider}`,
                    }}
                  >
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                        <Chip
                          icon={isDo ? <CheckCircleRoundedIcon fontSize="small" /> : <CancelRoundedIcon fontSize="small" />}
                          label={isDo ? 'MUST DO' : 'MUST AVOID'}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '10.5px',
                            height: 22,
                            bgcolor: alpha(cardColor, 0.15),
                            color: cardColor,
                          }}
                        />
                        <Chip
                          label={item.badge}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '11px',
                            height: 22,
                            bgcolor: isDark ? alpha('#000000', 0.3) : alpha('#000000', 0.06),
                            color: 'text.primary',
                          }}
                        />
                      </Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5, color: isDo ? (isDark ? '#34D399' : '#047857') : (isDark ? '#F87171' : '#B91C1C') }}>
                        {item.title}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '13px', lineHeight: 1.45, opacity: 0.9 }}>
                        {item.instruction}
                      </Typography>
                    </Box>

                    {item.rationales && item.rationales[0] && (
                      <Typography variant="caption" sx={{ mt: 1.5, color: 'text.secondary', fontSize: '11px', display: 'block', fontStyle: 'italic' }}>
                        💡 {item.rationales[0]}
                      </Typography>
                    )}
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* 3. SPLIT MATRIX: THE DO's (Edge) vs THE DON'Ts (Bans) */}
      <Grid container spacing={3}>
        {/* LEFT COLUMN: THE "DO's" */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleRoundedIcon sx={{ color: isDark ? '#34D399' : '#059669' }} />
              <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
                The "DO's" — Pillars of Edge
              </Typography>
            </Box>
            <Chip
              label={`${dos.length} Verified Habits`}
              size="small"
              sx={{ fontWeight: 700, fontSize: '11px', bgcolor: alpha('#10B981', 0.15), color: isDark ? '#34D399' : '#059669' }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {dos.map((item: any) => (
              <Card
                key={item.id}
                sx={{
                  p: 2.25,
                  borderRadius: 2.5,
                  border: `1px solid ${alpha('#10B981', isDark ? 0.25 : 0.2)}`,
                  bgcolor: isDark ? alpha('#064E3B', 0.12) : alpha('#ECFDF5', 0.6),
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: '#10B981',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.12)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                      <Chip
                        label={item.actionTag || 'EDGE'}
                        size="small"
                        sx={{
                          fontSize: '10px',
                          fontWeight: 800,
                          height: 20,
                          bgcolor: alpha('#10B981', 0.2),
                          color: isDark ? '#34D399' : '#047857',
                        }}
                      />
                      <Chip
                        label={`${item.confidence} CONFIDENCE`}
                        size="small"
                        sx={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          height: 18,
                          bgcolor: alpha(muiTheme.palette.text.primary, 0.06),
                        }}
                      />
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#34D399' : '#065F46', fontSize: '14.5px' }}>
                      {item.title}
                    </Typography>
                  </Box>

                  <Chip
                    label={item.badge}
                    size="small"
                    sx={{
                      fontWeight: 800,
                      fontSize: '11px',
                      bgcolor: isDark ? '#064E3B' : '#D1FAE5',
                      color: isDark ? '#6EE7B7' : '#065F46',
                      border: `1px solid ${alpha('#10B981', 0.3)}`,
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ fontSize: '13px', lineHeight: 1.5, mb: 1.5, color: 'text.primary' }}>
                  {item.instruction}
                </Typography>

                {item.rationales && item.rationales.length > 0 && (
                  <Box sx={{ pl: 1.5, borderLeft: `2px solid ${alpha('#10B981', 0.4)}`, mb: 1.5 }}>
                    {item.rationales.map((r: string, rIdx: number) => (
                      <Typography key={rIdx} variant="caption" sx={{ display: 'block', fontSize: '11.5px', color: 'text.secondary', lineHeight: 1.4 }}>
                        • {r}
                      </Typography>
                    ))}
                  </Box>
                )}

                {/* Metrics Footer */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: `1px dashed ${alpha('#10B981', 0.2)}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {item.metrics?.winRate !== undefined && (
                      <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? '#6EE7B7' : '#047857' }}>
                        WR: {item.metrics.winRate}%
                      </Typography>
                    )}
                    {item.metrics?.profitFactor !== undefined && (
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        PF: {item.metrics.profitFactor >= 999 ? '∞' : item.metrics.profitFactor}
                      </Typography>
                    )}
                    {item.metrics?.expectancyR !== undefined && (
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Exp: +{item.metrics.expectancyR}R
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10.5px' }}>
                      (N={item.metrics?.sampleSize ?? 0})
                    </Typography>
                  </Box>

                  {item.category === 'INSTRUMENT' && onSelectSymbol && (
                    <Button
                      size="small"
                      onClick={() => onSelectSymbol(item.title.split(': Focus on ')[1] || 'ALL')}
                      endIcon={<OpenInNewRoundedIcon sx={{ fontSize: '14px !important' }} />}
                      sx={{ fontSize: '11px', textTransform: 'none', p: 0.5 }}
                    >
                      Filter Asset
                    </Button>
                  )}
                </Box>
              </Card>
            ))}
          </Box>
        </Grid>

        {/* RIGHT COLUMN: THE "DON'Ts" */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CancelRoundedIcon sx={{ color: isDark ? '#F87171' : '#DC2626' }} />
              <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
                The "DON'Ts" — Guardrails & Bans
              </Typography>
            </Box>
            <Chip
              label={`${donts.length} Critical Stops`}
              size="small"
              sx={{ fontWeight: 700, fontSize: '11px', bgcolor: alpha('#EF4444', 0.15), color: isDark ? '#F87171' : '#DC2626' }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {donts.map((item: any) => {
              const isCrit = item.severity === 'CRITICAL';
              return (
                <Card
                  key={item.id}
                  sx={{
                    p: 2.25,
                    borderRadius: 2.5,
                    border: `1px solid ${alpha('#EF4444', isDark ? 0.25 : 0.2)}`,
                    bgcolor: isDark ? alpha('#7F1D1D', 0.12) : alpha('#FEF2F2', 0.6),
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#EF4444',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Chip
                          label={item.actionTag || 'HARD STOP'}
                          size="small"
                          sx={{
                            fontSize: '10px',
                            fontWeight: 800,
                            height: 20,
                            bgcolor: alpha('#EF4444', 0.2),
                            color: isDark ? '#F87171' : '#B91C1C',
                          }}
                        />
                        {isCrit && (
                          <Chip
                            label="CRITICAL BLEED"
                            size="small"
                            sx={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              height: 18,
                              bgcolor: isDark ? '#7F1D1D' : '#FEE2E2',
                              color: isDark ? '#FCA5A5' : '#991B1B',
                            }}
                          />
                        )}
                      </Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#F87171' : '#991B1B', fontSize: '14.5px' }}>
                        {item.title}
                      </Typography>
                    </Box>

                    <Chip
                      label={item.badge}
                      size="small"
                      sx={{
                        fontWeight: 800,
                        fontSize: '11px',
                        bgcolor: isDark ? '#7F1D1D' : '#FEE2E2',
                        color: isDark ? '#FCA5A5' : '#991B1B',
                        border: `1px solid ${alpha('#EF4444', 0.3)}`,
                      }}
                    />
                  </Box>

                  <Typography variant="body2" sx={{ fontSize: '13px', lineHeight: 1.5, mb: 1.5, color: 'text.primary' }}>
                    {item.instruction}
                  </Typography>

                  {item.rationales && item.rationales.length > 0 && (
                    <Box sx={{ pl: 1.5, borderLeft: `2px solid ${alpha('#EF4444', 0.4)}`, mb: 1.5 }}>
                      {item.rationales.map((r: string, rIdx: number) => (
                        <Typography key={rIdx} variant="caption" sx={{ display: 'block', fontSize: '11.5px', color: 'text.secondary', lineHeight: 1.4 }}>
                          • {r}
                        </Typography>
                      ))}
                    </Box>
                  )}

                  {/* Metrics Footer */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: `1px dashed ${alpha('#EF4444', 0.2)}` }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {item.metrics?.lossRate !== undefined && (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? '#FCA5A5' : '#B91C1C' }}>
                          Loss Rate: {item.metrics.lossRate}%
                        </Typography>
                      )}
                      {item.metrics?.occurrences !== undefined && (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                          Violations: {item.metrics.occurrences}x
                        </Typography>
                      )}
                    </Box>

                    <Button
                      size="small"
                      onClick={() => navigate('/trades')}
                      endIcon={<OpenInNewRoundedIcon sx={{ fontSize: '14px !important' }} />}
                      sx={{ fontSize: '11px', textTransform: 'none', p: 0.5, color: 'text.secondary' }}
                    >
                      Audit Trades
                    </Button>
                  </Box>
                </Card>
              );
            })}
          </Box>
        </Grid>
      </Grid>

      {/* 4. STATISTICAL CIRCUIT BREAKERS */}
      {circuitBreakers && (
        <Card
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: isDark ? alpha('#1E1B4B', 0.3) : alpha('#EEF2FF', 0.7),
            border: `1px solid ${alpha('#6366F1', 0.3)}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <ShieldRoundedIcon sx={{ color: '#6366F1' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Automated Daily Circuit Breakers
            </Typography>
            <HelpHint hintKey="settings.riskGuardrails" />
          </Box>

          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  DAILY MAX LOSS LIMIT
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900, my: 0.5, color: isDark ? '#F87171' : '#DC2626' }}>
                  -{circuitBreakers.maxDailyLossR}R
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {circuitBreakers.rationale?.maxDailyLossExplanation}
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  MAX TRADES PER DAY
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900, my: 0.5, color: isDark ? '#FBBF24' : '#D97706' }}>
                  {circuitBreakers.maxDailyTrades} Trades Max
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {circuitBreakers.rationale?.maxDailyTradesExplanation}
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  CONSECUTIVE LOSS COOL-OFF
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900, my: 0.5, color: '#6366F1' }}>
                  {circuitBreakers.coolOffMinutes} Mins Pause
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {circuitBreakers.rationale?.consecutiveLossExplanation}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Card>
      )}

      {/* 5. PRINTABLE DESK CHEAT SHEET DIALOG */}
      <Dialog
        open={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              p: 1,
              '@media print': {
                boxShadow: 'none',
                m: 0,
                p: 0,
              },
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <RuleRoundedIcon sx={{ color: '#10B981' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Trader Desk Cheat Sheet (Daily Rules of Engagement)
            </Typography>
          </Box>
          <IconButton onClick={() => setCheatSheetOpen(false)} size="small">
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Top Banner */}
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? alpha('#0F172A', 0.8) : alpha('#F1F5F9', 0.8) }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              Operating Mandate: Follow The Plan. Accept The Risk. Protect The Principal.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Review and tick this checklist before executing any market order. Print or pin to your physical desk setup.
            </Typography>
          </Box>

          {/* Section 1: Pre-Trade Go/No-Go Checklist */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#34D399' : '#059669', mb: 1 }}>
              1. PRE-TRADE GO / NO-GO CHECKLIST
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {(deskCheatSheet?.preTradeChecklist || []).map((check: string, idx: number) => {
                const key = `pre-${idx}`;
                return (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        checked={Boolean(checkedItems[key])}
                        onChange={() => handleToggleCheck(key)}
                        sx={{ color: '#10B981', '&.Mui-checked': { color: '#10B981' } }}
                      />
                    }
                    label={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: checkedItems[key] ? 500 : 600,
                          textDecoration: checkedItems[key] ? 'line-through' : 'none',
                          opacity: checkedItems[key] ? 0.6 : 1,
                        }}
                      >
                        {check}
                      </Typography>
                    }
                  />
                );
              })}
            </Box>
          </Box>

          {/* Section 2: During-Trade Execution Commandments */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#FBBF24' : '#D97706', mb: 1 }}>
              2. IN-TRADE EXECUTION COMMANDMENTS
            </Typography>
            <Box sx={{ pl: 2, borderLeft: '3px solid #F59E0B' }}>
              {(deskCheatSheet?.duringTradeRules || []).map((rule: string, idx: number) => (
                <Typography key={idx} variant="body2" sx={{ mb: 0.75, fontWeight: 500 }}>
                  • {rule}
                </Typography>
              ))}
            </Box>
          </Box>

          {/* Section 3: Hard Stop Circuit Breakers */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#F87171' : '#DC2626', mb: 1 }}>
              3. DAILY PRESERVATION CIRCUIT BREAKERS
            </Typography>
            <Box sx={{ pl: 2, borderLeft: '3px solid #EF4444' }}>
              {(deskCheatSheet?.postTradeRules || []).map((rule: string, idx: number) => (
                <Typography key={idx} variant="body2" sx={{ mb: 0.75, fontWeight: 500 }}>
                  • {rule}
                </Typography>
              ))}
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button
            size="small"
            onClick={() => setCheckedItems({})}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Reset Ticked Items
          </Button>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<PrintRoundedIcon />}
              onClick={handlePrint}
              sx={{ bgcolor: '#10B981', '&:hover': { bgcolor: '#059669' }, textTransform: 'none', fontWeight: 700 }}
            >
              Print / Save PDF
            </Button>
            <Button variant="outlined" onClick={() => setCheatSheetOpen(false)} sx={{ textTransform: 'none' }}>
              Close
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

