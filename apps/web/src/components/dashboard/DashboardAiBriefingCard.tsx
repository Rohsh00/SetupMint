import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

import { IAiDailyBriefing } from '@tradevault/shared';
import { formatCurrency } from '../../lib/utils.js';

interface DashboardAiBriefingCardProps {
  briefing: IAiDailyBriefing | null;
  isLoading: boolean;
  onRefresh: () => void;
  currency?: string;
}

export function DashboardAiBriefingCard({
  briefing,
  isLoading,
  onRefresh,
  currency = 'USD',
}: DashboardAiBriefingCardProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  if (isLoading) {
    return (
      <Card
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 3,
          borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          minHeight: 140,
        }}
      >
        <CircularProgress size={24} sx={{ color: '#6366f1' }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Consulting AI Desk Risk Officer & Coach...
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Auditing yesterday's discipline, emotional tilt, and recent high-expectancy setups
          </Typography>
        </Box>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 3,
          borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.25)',
          background: isDark
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.04) 100%)'
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.02) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(99, 102, 241, 0.15)',
              color: '#6366f1',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
              Morning AI Trading Readiness & Session Briefing
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Institutional pre-session audit of psychological capital, risk containment, and edge alignment
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          onClick={onRefresh}
          startIcon={<BoltRoundedIcon />}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.8125rem',
            bgcolor: '#6366f1',
            '&:hover': { bgcolor: '#4f46e5' },
            px: 2.5,
          }}
        >
          Generate Today's Briefing
        </Button>
      </Card>
    );
  }

  const isReadinessHigh = briefing.readinessScore >= 80;
  const isReadinessMedium = briefing.readinessScore >= 65 && briefing.readinessScore < 80;

  const scoreColor = isReadinessHigh ? '#10b981' : isReadinessMedium ? '#f59e0b' : '#ef4444';
  const scoreBg = isReadinessHigh ? 'rgba(16,185,129,0.12)' : isReadinessMedium ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 3,
        borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(99, 102, 241, 0.25)',
        background: isDark
          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)'
          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(255, 255, 255, 0.95) 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
      }}
    >
      {/* Header Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(99, 102, 241, 0.15)',
              color: '#6366f1',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
                Morning AI Trading Readiness & Session Briefing
              </Typography>
              <Chip
                size="small"
                label={`Readiness: ${briefing.readinessScore}/100`}
                sx={{
                  fontWeight: 800,
                  fontSize: '0.6875rem',
                  bgcolor: scoreBg,
                  color: scoreColor,
                  border: `1px solid ${scoreColor}40`,
                }}
              />
              <Chip
                size="small"
                label={briefing.psychologicalState.replace(/_/g, ' ')}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  bgcolor: 'action.hover',
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {briefing.modelUsed || 'AI Coach'} • {briefing.date}
            </Typography>
          </Box>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={onRefresh}
          startIcon={<RefreshRoundedIcon />}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.75rem',
          }}
        >
          Regenerate Briefing
        </Button>
      </Box>

      {/* Grid: 3 Insights Columns */}
      <Grid container spacing={2}>
        {/* Column 1: Top Edge Insight */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              bgcolor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${muiTheme.palette.divider}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrendingUpRoundedIcon sx={{ fontSize: 18, color: '#10b981' }} />
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#10b981' }}>
                Statistical Edge Focus
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.5, color: 'text.primary' }}>
              {briefing.topEdgeInsight}
            </Typography>
          </Box>
        </Grid>

        {/* Column 2: Yesterday's Recap */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              bgcolor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${muiTheme.palette.divider}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <PsychologyRoundedIcon sx={{ fontSize: 18, color: '#6366f1' }} />
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6366f1' }}>
                Previous Session Telemetry
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Trades: <b>{briefing.yesterdayRecap.tradesCount}</b>
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: briefing.yesterdayRecap.netPnL >= 0 ? '#10b981' : '#ef4444',
                }}
              >
                P&L: {formatCurrency(briefing.yesterdayRecap.netPnL, currency)}
              </Typography>
              {briefing.yesterdayRecap.disciplineScore && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Discipline: <b>{briefing.yesterdayRecap.disciplineScore}/5 ★</b>
                </Typography>
              )}
            </Box>
            {briefing.yesterdayRecap.keyLeak && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Key Leak: <b style={{ color: '#ef4444' }}>{briefing.yesterdayRecap.keyLeak}</b>
              </Typography>
            )}
          </Box>
        </Grid>

        {/* Column 3: Daily Focus Rule */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              bgcolor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6366f1' }}>
              ONE Focus Rule For Today
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontStyle: 'italic', color: 'text.primary', lineHeight: 1.45 }}>
              "{briefing.focusRuleForToday}"
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Operational Directives Bullets */}
      {briefing.dailyDirectives && briefing.dailyDirectives.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pt: 1, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            Daily Risk & Execution Directives
          </Typography>
          {briefing.dailyDirectives.map((d, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleRoundedIcon sx={{ fontSize: 15, color: '#10b981', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                {d}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}
