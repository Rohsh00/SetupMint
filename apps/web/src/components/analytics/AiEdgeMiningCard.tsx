import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';

import { api } from '../../lib/api.js';
import { IAiEdgeMiningInsight } from '@tradevault/shared';

export interface AiEdgeMiningCardProps {
  scopeKey?: string;
  accountId?: string;
  onAskCopilot?: (prompt: string) => void;
}

export function AiEdgeMiningCard({ scopeKey, accountId, onAskCopilot }: AiEdgeMiningCardProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: ['ai-edge-mining', scopeKey, accountId],
    queryFn: async () => {
      const res: any = await api.ai.getEdgeMining({ scopeKey, accountId });
      return res?.summary ? res : res?.data;
    },
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <Card sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Skeleton variant="text" width={220} height={28} />
        <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2, mt: 1.5 }} />
      </Card>
    );
  }

  const insights = report?.insights || [];
  if (insights.length === 0) return null;

  const topEdge = report?.topPositiveEdge;
  const topLeak = report?.biggestSurrenderedLeak;

  const getDimensionIcon = (dim: string) => {
    switch (dim) {
      case 'TIME_OF_DAY':
        return <AccessTimeRoundedIcon sx={{ fontSize: 16 }} />;
      case 'DAY_OF_WEEK':
        return <CalendarTodayRoundedIcon sx={{ fontSize: 16 }} />;
      case 'HOLDING_DURATION':
        return <HourglassEmptyRoundedIcon sx={{ fontSize: 16 }} />;
      default:
        return <PsychologyRoundedIcon sx={{ fontSize: 16 }} />;
    }
  };

  return (
    <Card
      sx={{
        p: 2.5,
        borderRadius: 3,
        mb: 3,
        background: isDark
          ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)'
          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.9) 0%, rgba(241, 245, 249, 0.9) 100%)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              bgcolor: alpha(muiTheme.palette.primary.main, 0.15),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: muiTheme.palette.primary.main,
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Unsupervised Edge & Leak Mining
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Mined from {report?.totalTradesSampled} closed trades (Baseline Win Rate: {report?.overallWinRate}%)
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setExpanded((prev) => !prev)}
            endIcon={expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
          >
            {expanded ? 'Hide Insights' : `View All (${insights.length})`}
          </Button>
        </Box>
      </Box>

      {/* Highlights Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* Top Positive Edge */}
        {topEdge && (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)',
              border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.3)'}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 18, color: '#10b981' }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#10b981' }}>
                  {topEdge.title}
                </Typography>
              </Box>
              <Chip
                label={`${topEdge.winRate}% WR`}
                size="small"
                sx={{
                  bgcolor: 'rgba(16, 185, 129, 0.2)',
                  color: '#10b981',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  height: 20,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              {topEdge.comparisonBaseline} across {topEdge.sampleSize} trades.
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.primary', mb: 1.5 }}>
              {topEdge.actionableDirective}
            </Typography>
            {onAskCopilot && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onAskCopilot(`Tell me more about my edge in ${topEdge.title} and how to scale it.`)}
                sx={{ fontSize: '0.7rem', py: 0.3, px: 1, textTransform: 'none', borderRadius: 1.5 }}
              >
                Ask Copilot About This Edge
              </Button>
            )}
          </Paper>
        )}

        {/* Biggest Surrendered Leak */}
        {topLeak && (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
              border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningAmberRoundedIcon sx={{ fontSize: 18, color: '#ef4444' }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#ef4444' }}>
                  {topLeak.title}
                </Typography>
              </Box>
              <Chip
                label={`${topLeak.winRate}% WR`}
                size="small"
                sx={{
                  bgcolor: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  height: 20,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              {topLeak.comparisonBaseline} across {topLeak.sampleSize} trades.
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.primary', mb: 1.5 }}>
              {topLeak.actionableDirective}
            </Typography>
            {onAskCopilot && (
              <Button
                size="small"
                color="error"
                variant="outlined"
                onClick={() => onAskCopilot(`Why am I losing money in ${topLeak.title} and what rule should I enforce?`)}
                sx={{ fontSize: '0.7rem', py: 0.3, px: 1, textTransform: 'none', borderRadius: 1.5 }}
              >
                Ask Copilot How to Fix Leak
              </Button>
            )}
          </Paper>
        )}
      </Box>

      {/* Expandable Full List of Discovered Insights */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', mb: 1.5, display: 'block' }}>
            All Discovered Statistical Insights ({insights.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {insights.map((item: any) => {
              const isPos = item.verdict === 'POSITIVE_EDGE';
              return (
                <Box
                  key={item.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box
                      sx={{
                        p: 0.8,
                        borderRadius: 1.5,
                        bgcolor: isPos ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isPos ? '#10b981' : '#ef4444',
                        mt: 0.3,
                      }}
                    >
                      {getDimensionIcon(item.dimension)}
                    </Box>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {item.title}
                        </Typography>
                        <Chip
                          label={`${item.winRate}% WR | ${item.sampleSize} trades`}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            bgcolor: isPos ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isPos ? '#10b981' : '#ef4444',
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {item.comparisonBaseline}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 0.5 }}>
                        {item.actionableDirective}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Collapse>
    </Card>
  );
}

