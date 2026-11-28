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
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';

import { IAnalyticsAiAudit } from '@tradevault/shared';

export interface AnalyticsAiAdvisorCardProps {
  audit?: IAnalyticsAiAudit | null;
  isLoading: boolean;
  onConsult: (force?: boolean) => void;
  activeTab: string;
  hasGeminiKey: boolean;
  selectedSymbol?: string;
}

export function AnalyticsAiAdvisorCard({
  audit,
  isLoading,
  onConsult,
  activeTab,
  hasGeminiKey,
  selectedSymbol = 'ALL',
}: AnalyticsAiAdvisorCardProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(true);

  const getGradeColor = (grade?: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return '#10b981';
      case 'B':
        return '#3b82f6';
      case 'C':
        return '#f59e0b';
      case 'D':
      case 'F':
        return '#ef4444';
      default:
        return '#8b5cf6';
    }
  };

  const getTabInsightText = (): { label: string; text: string; icon: React.ReactNode } => {
    if (!audit?.tabInsights) {
      return {
        label: 'Contextual AI Edge',
        text: 'Consult the AI Advisor to synthesize institutional telemetry for this tab.',
        icon: <AutoAwesomeRoundedIcon sx={{ fontSize: 18 }} />,
      };
    }

    switch (activeTab) {
      case 'PSYCHOLOGY':
        return {
          label: 'AI Behavioral & Psychology Coach',
          text: audit.tabInsights.psychology,
          icon: <PsychologyRoundedIcon sx={{ fontSize: 18, color: '#ec4899' }} />,
        };
      case 'EXECUTION':
        return {
          label: 'AI Excursion & Order Quality Diagnostics',
          text: audit.tabInsights.execution,
          icon: <SpeedRoundedIcon sx={{ fontSize: 18, color: '#3b82f6' }} />,
        };
      case 'SIZING':
        return {
          label: 'AI Position Sizing & Capital Preservation Review',
          text: audit.tabInsights.sizing,
          icon: <ShieldRoundedIcon sx={{ fontSize: 18, color: '#10b981' }} />,
        };
      case 'TIME':
        return {
          label: 'AI Kill Zone & Session Edge Recommendation',
          text: audit.tabInsights.time,
          icon: <AccessTimeRoundedIcon sx={{ fontSize: 18, color: '#f59e0b' }} />,
        };
      case 'OVERVIEW':
        return {
          label: 'AI Statistical Expectancy & PnL Review',
          text: audit.tabInsights.overview,
          icon: <TrendingUpRoundedIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />,
        };
      case 'SUMMARY':
      default:
        return {
          label: 'AI Executive Playbook Synthesis',
          text: audit.tabInsights.summary,
          icon: <AutoAwesomeRoundedIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />,
        };
    }
  };

  const currentTabInsight = getTabInsightText();

  return (
    <Card
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: audit
          ? alpha(getGradeColor(audit.edgeGrade), isDark ? 0.35 : 0.25)
          : alpha(muiTheme.palette.primary.main, 0.2),
        background: isDark
          ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.45) 0%, rgba(15, 23, 42, 0.8) 100%)'
          : 'linear-gradient(135deg, rgba(245, 243, 255, 0.9) 0%, rgba(255, 255, 255, 0.95) 100%)',
        boxShadow: isDark
          ? '0 10px 30px -10px rgba(0, 0, 0, 0.5)'
          : '0 10px 30px -10px rgba(99, 102, 241, 0.08)',
      }}
    >
      {/* Top Banner Header */}
      <Box
        sx={{
          p: { xs: 2, md: 2.5 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '0.95rem', sm: '1.05rem' }, letterSpacing: '-0.01em' }}>
                SetupMint AI Quantitative Desk Advisor
              </Typography>
              {audit && (
                <Chip
                  size="small"
                  label={audit.modelUsed || (hasGeminiKey ? 'gemini-3.5-flash-lite' : 'Quant Engine')}
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    height: 20,
                    bgcolor: audit.isAiGenerated ? 'rgba(168, 85, 247, 0.18)' : 'rgba(16, 185, 129, 0.15)',
                    color: audit.isAiGenerated ? '#c084fc' : '#10b981',
                  }}
                />
              )}
              {audit?.latencyMs && (
                <Chip
                  size="small"
                  label={`${audit.latencyMs}ms`}
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    height: 18,
                    bgcolor: 'action.hover',
                    color: 'text.secondary',
                  }}
                />
              )}
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              Multimodal edge detection, leak remediation, and risk calibration across all analytics tabs
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => onConsult(Boolean(audit))}
            disabled={isLoading}
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <BoltRoundedIcon />}
            sx={{
              fontWeight: 700,
              textTransform: 'none',
              px: 2,
              py: 0.75,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)',
              },
            }}
          >
            {isLoading ? 'Analyzing Telemetry...' : audit ? 'Refresh AI Audit' : '⚡ Consult AI Advisor'}
          </Button>

          {audit && (
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{ color: 'text.secondary' }}
            >
              {expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Contextual Active Tab Insight Pill */}
      <Box
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          bgcolor: isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.05)',
          borderBottom: expanded && audit ? '1px solid' : 'none',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          {currentTabInsight.icon}
          <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'primary.main' }}>
            {currentTabInsight.label}:
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', flexGrow: 1, fontSize: '0.85rem' }}>
          {currentTabInsight.text}
        </Typography>
      </Box>

      {/* Full Audit Expanded View */}
      {audit && (
        <Collapse in={expanded}>
          <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Verdict & Edge Grade Header */}
            <Paper
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: alpha(getGradeColor(audit.edgeGrade), isDark ? 0.12 : 0.08),
                border: '1px solid',
                borderColor: alpha(getGradeColor(audit.edgeGrade), isDark ? 0.3 : 0.25),
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: getGradeColor(audit.edgeGrade),
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '1.4rem',
                    boxShadow: `0 4px 14px ${alpha(getGradeColor(audit.edgeGrade), 0.4)}`,
                    flexShrink: 0,
                  }}
                >
                  {audit.edgeGrade}
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
                      {audit.overallVerdict.replace(/_/g, ' ')}
                    </Typography>
                    <Chip
                      size="small"
                      label={`Edge Score: ${audit.edgeGrade}`}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        height: 20,
                        bgcolor: alpha(getGradeColor(audit.edgeGrade), 0.2),
                        color: getGradeColor(audit.edgeGrade),
                      }}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, lineHeight: 1.5, fontSize: '0.875rem' }}>
                    {audit.executiveSummary}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Strengths & Leaks 2-Column Comparison */}
            <Grid container spacing={2}>
              {/* Strengths */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper
                  sx={{
                    p: 2,
                    height: '100%',
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.04)',
                    border: '1px solid',
                    borderColor: 'rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      mb: 1.5,
                    }}
                  >
                    <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
                    Identified Edge Drivers ({audit.topStrengths?.length || 0})
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {audit.topStrengths?.map((str, idx) => (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 800, mt: '2px' }}>
                          ✓
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.primary', lineHeight: 1.4 }}>
                          {str}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid>

              {/* Leaks */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper
                  sx={{
                    p: 2,
                    height: '100%',
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.04)',
                    border: '1px solid',
                    borderColor: 'rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      mb: 1.5,
                    }}
                  >
                    <WarningAmberRoundedIcon sx={{ fontSize: 16 }} />
                    Detected Leaks & Drag ({audit.criticalLeaks?.length || 0})
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {audit.criticalLeaks?.map((leak, idx) => (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 800, mt: '2px' }}>
                          ⚠
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.primary', lineHeight: 1.4 }}>
                          {leak}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* Action Directives */}
            {audit.actionDirectives && audit.actionDirectives.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                  Priority AI Directives & Guardrails
                </Typography>
                <Grid container spacing={1.5}>
                  {audit.actionDirectives.map((dir, idx) => (
                    <Grid key={idx} size={{ xs: 12, md: 4 }}>
                      <Paper
                        sx={{
                          p: 1.75,
                          height: '100%',
                          borderRadius: 2,
                          bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                          border: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 1,
                        }}
                      >
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                            <Chip
                              size="small"
                              label={dir.category}
                              sx={{ fontSize: '0.65rem', fontWeight: 700, height: 18 }}
                            />
                            <Chip
                              size="small"
                              label={dir.impact}
                              sx={{
                                fontSize: '0.625rem',
                                fontWeight: 800,
                                height: 18,
                                bgcolor: dir.impact === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: dir.impact === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                              }}
                            />
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, mb: 0.5 }}>
                            {dir.title}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.primary', display: 'block', mb: 0.5, lineHeight: 1.4 }}>
                            {dir.directive}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.72rem' }}>
                          Rationale: {dir.rationale}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {/* Non-Negotiable Rules for Next Cycle */}
            {audit.rulesForNextCycle && audit.rulesForNextCycle.length > 0 && (
              <Box
                sx={{
                  p: 1.75,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(168, 85, 247, 0.08)' : 'rgba(168, 85, 247, 0.05)',
                  border: '1px solid',
                  borderColor: 'rgba(168, 85, 247, 0.25)',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#c084fc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    mb: 1,
                  }}
                >
                  <LightbulbRoundedIcon sx={{ fontSize: 16 }} />
                  Desk Protocol: Non-Negotiable Rules for Next Trading Session
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {audit.rulesForNextCycle.map((rule, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'rgba(168, 85, 247, 0.2)',
                          color: '#c084fc',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
                        {rule}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Card>
  );
}
