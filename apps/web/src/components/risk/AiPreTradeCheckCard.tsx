import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';

import { IAiPreTradeCheckResult } from '@tradevault/shared';

interface AiPreTradeCheckCardProps {
  checkResult: IAiPreTradeCheckResult | null;
  isLoading: boolean;
  onRunCheck: () => void;
  canRun: boolean;
}

export function AiPreTradeCheckCard({
  checkResult,
  isLoading,
  onRunCheck,
  canRun,
}: AiPreTradeCheckCardProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  if (!checkResult && !isLoading) {
    return (
      <Card
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 3,
          borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.25)',
          background: isDark
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(168, 85, 247, 0.04) 100%)'
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(168, 85, 247, 0.02) 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
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
              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                Pre-Trade AI Sanity & Edge Copilot
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Instant audit of R:R expectancy, trader tilt state, and historical edge before entry
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            disabled={!canRun}
            onClick={onRunCheck}
            startIcon={<BoltRoundedIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.8125rem',
              bgcolor: '#6366f1',
              '&:hover': { bgcolor: '#4f46e5' },
              px: 2.5,
              py: 0.75,
            }}
          >
            Run Pre-Trade Sanity Check
          </Button>
        </Box>
      </Card>
    );
  }

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
          minHeight: 120,
        }}
      >
        <CircularProgress size={24} sx={{ color: '#6366f1' }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Running Pre-Trade AI Audit...
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Checking R:R ratio, today's tilt telemetry, and historical setup win rate
          </Typography>
        </Box>
      </Card>
    );
  }

  if (!checkResult) return null;

  const isApproved = checkResult.verdict === 'APPROVED_HIGH_EDGE';
  const isWarning = checkResult.verdict === 'WARNING_HIGH_RISK';

  const verdictBg = isApproved
    ? 'rgba(16, 185, 129, 0.12)'
    : isWarning
    ? 'rgba(239, 68, 68, 0.12)'
    : 'rgba(245, 158, 11, 0.12)';

  const verdictColor = isApproved
    ? '#10b981'
    : isWarning
    ? '#ef4444'
    : '#f59e0b';

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 3,
        borderColor: isApproved
          ? 'rgba(16, 185, 129, 0.4)'
          : isWarning
          ? 'rgba(239, 68, 68, 0.4)'
          : 'rgba(245, 158, 11, 0.4)',
        background: isDark
          ? `linear-gradient(135deg, ${verdictBg} 0%, rgba(15, 23, 42, 0.6) 100%)`
          : `linear-gradient(135deg, ${verdictBg} 0%, rgba(255, 255, 255, 0.9) 100%)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Header Banner */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          {isApproved ? (
            <CheckCircleRoundedIcon sx={{ color: verdictColor, fontSize: 26 }} />
          ) : isWarning ? (
            <ErrorOutlineRoundedIcon sx={{ color: verdictColor, fontSize: 26 }} />
          ) : (
            <WarningAmberRoundedIcon sx={{ color: verdictColor, fontSize: 26 }} />
          )}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '0.975rem', color: verdictColor }}>
                {checkResult.verdictTitle}
              </Typography>
              <Chip
                size="small"
                label={`Edge Score: ${checkResult.edgeScore}/100`}
                sx={{
                  fontWeight: 800,
                  fontSize: '0.6875rem',
                  bgcolor: verdictBg,
                  color: verdictColor,
                  border: `1px solid ${verdictColor}40`,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {checkResult.modelUsed || 'AI Copilot'} • {checkResult.latencyMs ? `${checkResult.latencyMs}ms` : 'Instant'}
            </Typography>
          </Box>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={onRunCheck}
          startIcon={<BoltRoundedIcon />}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.75rem',
          }}
        >
          Re-Check
        </Button>
      </Box>

      {/* Summary Prose */}
      <Typography variant="body2" sx={{ lineHeight: 1.55, fontWeight: 500, color: 'text.primary' }}>
        {checkResult.summary}
      </Typography>

      {/* Key Checks Checklist */}
      {checkResult.keyChecks && checkResult.keyChecks.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            Pre-Trade Confluence & Risk Verification
          </Typography>
          {checkResult.keyChecks.map((check, idx) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              {check.passed ? (
                <CheckCircleRoundedIcon sx={{ color: '#10b981', fontSize: 18, mt: 0.15, flexShrink: 0 }} />
              ) : check.severity === 'CRITICAL' ? (
                <ErrorOutlineRoundedIcon sx={{ color: '#ef4444', fontSize: 18, mt: 0.15, flexShrink: 0 }} />
              ) : (
                <WarningAmberRoundedIcon sx={{ color: '#f59e0b', fontSize: 18, mt: 0.15, flexShrink: 0 }} />
              )}
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.8125rem',
                  color: check.passed ? 'text.secondary' : check.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                  fontWeight: check.passed ? 400 : 600,
                }}
              >
                {check.text}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Tilt & Session Context Chips */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, pt: 1, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PsychologyRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Tilt Risk:
            </Typography>
            <Chip
              size="small"
              label={checkResult.tiltRisk}
              sx={{
                height: 18,
                fontSize: '0.625rem',
                fontWeight: 800,
                bgcolor: checkResult.tiltRisk === 'LOW' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: checkResult.tiltRisk === 'LOW' ? '#10b981' : '#ef4444',
              }}
            />
          </Box>

          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Trades Today: <b>{checkResult.todayContext.tradesCountToday}</b>
          </Typography>

          {checkResult.todayContext.consecutiveLosses > 0 && (
            <Chip
              size="small"
              label={`${checkResult.todayContext.consecutiveLosses} Consecutive Loss${checkResult.todayContext.consecutiveLosses > 1 ? 'es' : ''}`}
              sx={{ height: 18, fontSize: '0.625rem', fontWeight: 800, bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            />
          )}

          {checkResult.historicalEdge && checkResult.historicalEdge.sampleSize > 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Historical: <b>{checkResult.historicalEdge.winRate}% WR</b> ({checkResult.historicalEdge.sampleSize} trades)
            </Typography>
          )}
        </Box>

        {checkResult.ruleReminder && (
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, fontStyle: 'italic' }}>
            "{checkResult.ruleReminder}"
          </Typography>
        )}
      </Box>
    </Card>
  );
}
