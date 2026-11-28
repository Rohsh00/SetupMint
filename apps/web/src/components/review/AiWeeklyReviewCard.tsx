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
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

import { IAiWeeklySummary } from '@tradevault/shared';

interface AiWeeklyReviewCardProps {
  summary: IAiWeeklySummary | null;
  isLoading: boolean;
  onRefresh: () => void;
  onAdoptRule?: (ruleText: string) => void;
}

export function AiWeeklyReviewCard({
  summary,
  isLoading,
  onRefresh,
  onAdoptRule,
}: AiWeeklyReviewCardProps) {
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
        <CircularProgress size={26} sx={{ color: '#6366f1' }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Synthesizing Weekly Executive Review...
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Auditing 5-day capital discipline, behavioral leak patterns, and edge consistency
          </Typography>
        </Box>
      </Card>
    );
  }

  if (!summary) {
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
              AI Executive Performance Review & Coaching Directive
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Institutional performance audit, weekly discipline grade, and focus rule formulation
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
          Generate AI Weekly Review
        </Button>
      </Card>
    );
  }

  const isGradeHigh = summary.weeklyGrade === 'A+' || summary.weeklyGrade === 'A';
  const isGradePoor = summary.weeklyGrade === 'D' || summary.weeklyGrade === 'F';
  const gradeColor = isGradeHigh ? '#10b981' : isGradePoor ? '#ef4444' : '#f59e0b';
  const gradeBg = isGradeHigh ? 'rgba(16,185,129,0.12)' : isGradePoor ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';

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
                AI Executive Weekly Review
              </Typography>
              <Chip
                size="small"
                label={`Weekly Grade: ${summary.weeklyGrade}`}
                sx={{
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  bgcolor: gradeBg,
                  color: gradeColor,
                  border: `1px solid ${gradeColor}40`,
                }}
              />
              <Chip
                size="small"
                label={summary.modelUsed || 'AI Coach'}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  bgcolor: 'action.hover',
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              ISO Week {summary.week} • Generated by SetupMint AI Executive
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
          Regenerate Review
        </Button>
      </Box>

      {/* Executive Summary */}
      <Typography variant="body2" sx={{ lineHeight: 1.6, fontWeight: 500, color: 'text.primary' }}>
        {summary.executiveSummary}
      </Typography>

      {/* 2-Column Insights */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrendingUpRoundedIcon sx={{ color: '#10b981', fontSize: 18 }} />
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#10b981' }}>
                Best Execution Trait
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {summary.bestExecutionTrait}
            </Typography>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <WarningAmberRoundedIcon sx={{ color: '#ef4444', fontSize: 18 }} />
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: '#ef4444' }}>
                Critical Leak Of The Week
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {summary.biggestLeakOfTheWeek}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Recommended Focus Rule Banner */}
      <Box
        sx={{
          p: 2,
          borderRadius: 2.5,
          bgcolor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.06)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6366f1' }}>
            Recommended Focus Rule For Next Week
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, fontStyle: 'italic', mt: 0.25, color: 'text.primary' }}>
            "{summary.recommendedFocusRule}"
          </Typography>
        </Box>
        {onAdoptRule && (
          <Button
            size="small"
            variant="contained"
            onClick={() => onAdoptRule(summary.recommendedFocusRule)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.75rem',
              bgcolor: '#6366f1',
              '&:hover': { bgcolor: '#4f46e5' },
              flexShrink: 0,
            }}
          >
            Adopt As Next Week's Rule
          </Button>
        )}
      </Box>

      {/* Coaching Advice */}
      {summary.coachingAdvice && (
        <Box sx={{ pt: 1, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PsychologyRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <b>Institutional Coaching Directive:</b> {summary.coachingAdvice}
          </Typography>
        </Box>
      )}
    </Card>
  );
}
