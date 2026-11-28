import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';

import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { ITradeAiAnalysis } from '@tradevault/shared';

interface TradeAiCopilotPanelProps {
  trade: any;
  onTradeUpdated?: () => void;
}

export function TradeAiCopilotPanel({ trade, onTradeUpdated }: TradeAiCopilotPanelProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  const tradeId = trade?.id || trade?._id;
  const ai: ITradeAiAnalysis | undefined = trade?.aiAnalysis;

  const analyzeMutation = useMutation({
    mutationFn: (options?: { force?: boolean; autoApply?: boolean }) =>
      api.trades.analyzeAi(tradeId, options),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
      onTradeUpdated?.();
      toast.success(res?.data?.setupType ? `AI Analysis: ${res.data.setupType}` : 'AI trade analysis complete!');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'AI analysis failed');
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => api.trades.applyAiDetails(tradeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
      onTradeUpdated?.();
      toast.success('AI details applied to trade thesis, psychology, and tags!');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to apply AI details');
    },
  });

  const isModelVision = ai?.modelUsed?.toLowerCase().includes('vision');
  const isQuantEngine = ai?.modelUsed?.includes('quant-engine');

  const renderStars = (score: number = 3) => {
    return '★'.repeat(Math.max(1, Math.min(5, score))) + '☆'.repeat(Math.max(0, 5 - Math.max(1, Math.min(5, score))));
  };

  const getRatingColor = (rating?: string) => {
    switch (rating) {
      case 'EXCELLENT':
      case 'OPTIMAL':
        return '#10b981';
      case 'GOOD':
      case 'TRAILED_OUT':
        return '#6366f1';
      case 'CHASED':
      case 'PREMATURE':
      case 'GAVE_BACK':
      case 'TOO_WIDE':
        return '#f59e0b';
      case 'EARLY':
      case 'LATE':
      case 'TOO_TIGHT':
      case 'STOPPED_OUT':
      case 'NO_STOP':
        return '#ef4444';
      default:
        return '#8b5cf6';
    }
  };

  return (
    <Card
      sx={{
        p: 2.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: isDark ? 'rgba(168, 85, 247, 0.35)' : 'rgba(99, 102, 241, 0.25)',
        background: isDark
          ? 'linear-gradient(180deg, rgba(30, 27, 75, 0.25) 0%, rgba(15, 23, 42, 0.4) 100%)'
          : 'linear-gradient(180deg, rgba(245, 243, 255, 0.6) 0%, rgba(255, 255, 255, 0.9) 100%)',
      }}
    >
      {/* Header Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 2, mb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}`, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: isDark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(99, 102, 241, 0.15)',
              color: isDark ? '#c084fc' : '#6366f1',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>
                AI Trade & Chart Copilot
              </Typography>
              {ai && (
                <>
                  <Chip
                    size="small"
                    label={ai.setupType || 'Classified Setup'}
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.7rem',
                      height: 22,
                      bgcolor: isDark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(99, 102, 241, 0.12)',
                      color: isDark ? '#e9d5ff' : '#4f46e5',
                    }}
                  />
                  <Chip
                    size="small"
                    label={`Execution: ${ai.executionScore}/10`}
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.7rem',
                      height: 22,
                      bgcolor: ai.executionScore >= 8 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: ai.executionScore >= 8 ? '#10b981' : '#f59e0b',
                    }}
                  />
                  <Chip
                    size="small"
                    label={`Discipline: ${renderStars(ai.disciplineScore)}`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      height: 22,
                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                      color: 'text.secondary',
                    }}
                  />
                </>
              )}
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Multimodal Vision & Candlestick Price Action Technical Audit
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {ai && (
            <Chip
              size="small"
              icon={isModelVision ? <VisibilityRoundedIcon sx={{ fontSize: '14px !important' }} /> : undefined}
              label={
                isModelVision
                  ? ai.modelUsed || 'Gemini Flash (Vision)'
                  : isQuantEngine
                  ? 'Quant Engine (Zero-Cost)'
                  : ai.modelUsed || 'AI Model'
              }
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                height: 22,
                bgcolor: isModelVision ? 'rgba(168, 85, 247, 0.18)' : 'rgba(16, 185, 129, 0.15)',
                color: isModelVision ? '#c084fc' : '#10b981',
              }}
            />
          )}

          <Button
            size="small"
            variant={ai ? 'outlined' : 'contained'}
            color="primary"
            disabled={analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate({ force: Boolean(ai) })}
            startIcon={analyzeMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SyncRoundedIcon fontSize="small" />}
            sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
          >
            {analyzeMutation.isPending ? 'Analyzing Chart...' : ai ? 'Re-Analyze Chart' : 'Analyze Trade & Chart'}
          </Button>
        </Box>
      </Box>

      {/* When No Analysis Exists Yet */}
      {!ai && (
        <Box
          sx={{
            p: 3,
            borderRadius: 2,
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
            border: '1px dashed',
            borderColor: muiTheme.palette.divider,
            textAlign: 'center',
          }}
        >
          <PsychologyRoundedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Automate Your Trade Review with Multimodal AI
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 640, mx: 'auto', mb: 2 }}>
            SetupMint inspects candlestick price action, order execution slippage, excursion (MAE/MFE), and any uploaded chart screenshots. It automatically generates your trade thesis, confluences, execution score, and psychological lessons.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            disabled={analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate({ force: true, autoApply: true })}
            startIcon={analyzeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRoundedIcon />}
            sx={{ fontWeight: 700, px: 3, py: 1, borderRadius: 2 }}
          >
            {analyzeMutation.isPending ? 'Analyzing Price Action...' : 'Analyze & Auto-Fill Trade Details'}
          </Button>
        </Box>
      )}

      {/* When Analysis Exists */}
      {ai && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Grid container spacing={2}>
            {/* 1. Chart Structure & Price Action Card */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  height: '100%',
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)',
                  border: '1px solid',
                  borderColor: muiTheme.palette.divider,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TimelineRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    Chart Structure & Bias
                  </Typography>
                  <Chip
                    size="small"
                    label={ai.chartAnalysis?.trendBias || 'NEUTRAL'}
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.65rem',
                      height: 18,
                      bgcolor:
                        ai.chartAnalysis?.trendBias === 'BULLISH'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : ai.chartAnalysis?.trendBias === 'BEARISH'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(255, 255, 255, 0.06)',
                      color:
                        ai.chartAnalysis?.trendBias === 'BULLISH'
                          ? '#10b981'
                          : ai.chartAnalysis?.trendBias === 'BEARISH'
                          ? '#ef4444'
                          : 'inherit',
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.5, color: 'text.primary' }}>
                  {ai.chartAnalysis?.summary}
                </Typography>

                {ai.chartAnalysis?.confluences && ai.chartAnalysis.confluences.length > 0 && (
                  <Box sx={{ mt: 'auto' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                      Observed Confluences:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {ai.chartAnalysis.confluences.map((conf, idx) => (
                        <Chip
                          key={idx}
                          size="small"
                          label={conf}
                          sx={{
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            bgcolor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            height: 22,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {ai.chartAnalysis?.keyLevelsObserved && ai.chartAnalysis.keyLevelsObserved.length > 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.5 }}>
                      Key Levels:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {ai.chartAnalysis.keyLevelsObserved.map((lvl, idx) => (
                        <Typography key={idx} variant="caption" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.6875rem', color: 'text.secondary', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', px: 0.75, py: 0.25, borderRadius: 1 }}>
                          {lvl}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* 2. Execution & Risk Review Card */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  height: '100%',
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)',
                  border: '1px solid',
                  borderColor: muiTheme.palette.divider,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <SecurityRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  Execution & Risk Management
                </Typography>

                {/* Entry Assessment */}
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Entry Timing</Typography>
                    <Chip
                      size="small"
                      label={ai.entryReview?.rating || 'GOOD'}
                      sx={{
                        fontSize: '0.625rem',
                        fontWeight: 800,
                        height: 18,
                        bgcolor: alpha(getRatingColor(ai.entryReview?.rating), 0.15),
                        color: getRatingColor(ai.entryReview?.rating),
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>
                    {ai.entryReview?.summary}
                  </Typography>
                </Box>

                {/* Stop Loss Placement */}
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Stop Loss Placement</Typography>
                    <Chip
                      size="small"
                      label={ai.riskManagement?.stopPlacementRating || 'OPTIMAL'}
                      sx={{
                        fontSize: '0.625rem',
                        fontWeight: 800,
                        height: 18,
                        bgcolor: alpha(getRatingColor(ai.riskManagement?.stopPlacementRating), 0.15),
                        color: getRatingColor(ai.riskManagement?.stopPlacementRating),
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>
                    {ai.riskManagement?.summary}
                  </Typography>
                </Box>

                {/* Exit & Profit Capture */}
                {ai.exitReview && (
                  <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>Exit & Profit Capture</Typography>
                      <Chip
                        size="small"
                        label={ai.exitReview?.rating || 'OPTIMAL'}
                        sx={{
                          fontSize: '0.625rem',
                          fontWeight: 800,
                          height: 18,
                          bgcolor: alpha(getRatingColor(ai.exitReview?.rating), 0.15),
                          color: getRatingColor(ai.exitReview?.rating),
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>
                      {ai.exitReview?.summary}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* 3. Mistakes & Lessons Learned Card */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  height: '100%',
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)',
                  border: '1px solid',
                  borderColor: muiTheme.palette.divider,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LightbulbRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  Execution Leaks & Key Lesson
                </Typography>

                {/* Mistakes / Leaks */}
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                    Identified Execution Leaks:
                  </Typography>
                  {ai.identifiedMistakes && ai.identifiedMistakes.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {ai.identifiedMistakes.map((leak, idx) => (
                        <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, p: 0.75, borderRadius: 1.5, bgcolor: 'rgba(239, 68, 68, 0.08)' }}>
                          <WarningAmberRoundedIcon sx={{ fontSize: 16, color: '#ef4444', mt: 0.25 }} />
                          <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600, lineHeight: 1.3 }}>
                            {leak}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, p: 0.75, borderRadius: 1.5, bgcolor: 'rgba(16, 185, 129, 0.08)' }}>
                      <CheckCircleRoundedIcon sx={{ fontSize: 16, color: '#10b981' }} />
                      <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>
                        Zero execution leaks detected. Flawless discipline!
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Key Lesson */}
                <Box sx={{ mt: 'auto', p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.06)', borderLeft: '3px solid #6366f1' }}>
                  <Typography variant="caption" sx={{ color: '#818cf8', fontWeight: 800, textTransform: 'uppercase', display: 'block', mb: 0.25, letterSpacing: 0.5 }}>
                    Playbook Takeaway:
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontStyle: 'italic', lineHeight: 1.4, color: 'text.primary' }}>
                    "{ai.lessonsLearned}"
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>

          {/* Action Footer */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              pt: 1.5,
              borderTop: `1px solid ${muiTheme.palette.divider}`,
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {ai.autoApplied ? (
                <Chip
                  size="small"
                  icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
                  label="Details Auto-Applied to Trade"
                  sx={{
                    bgcolor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    height: 24,
                  }}
                />
              ) : (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  AI recommendations ready to synchronize into your journal thesis & tags.
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="Writes AI-detected setup, thesis, confluences, mistakes, and lessons directly into this trade record">
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  disabled={applyMutation.isPending || ai.autoApplied}
                  onClick={() => applyMutation.mutate()}
                  startIcon={applyMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <AssignmentTurnedInRoundedIcon fontSize="small" />}
                  sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
                >
                  {applyMutation.isPending ? 'Applying...' : ai.autoApplied ? 'Details Applied' : '✨ Apply AI Details to Trade'}
                </Button>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      )}
    </Card>
  );
}
