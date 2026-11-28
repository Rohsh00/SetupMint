import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  LinearProgress,
  CircularProgress,
  IconButton,
  Tooltip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Collapse,
  Alert,
  useTheme as useMuiTheme,
  alpha,
} from '@mui/material';

// Icons
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';

import { useAiQuota } from '../../hooks/useAiQuota.js';
import { toast } from '../../context/ToastContext.js';

const FEATURE_NAMES: Record<string, string> = {
  TRADE_ANALYSIS: 'Trade Copilot & Vision',
  DAILY_BRIEFING: 'Morning Briefing',
  PRETRADE_CHECK: 'Pre-Trade Guardian',
  STRATEGY_AUDIT: 'Playbook Strategy Audit',
  WEEKLY_REVIEW: 'Weekly Review Synthesis',
  COACH_DEBRIEF: 'Post-Session Coach',
  ANALYTICS_ADVISOR: 'Analytics Desk Advisor',
  TEST_CONNECTION: 'Connection Diagnostics',
};

export function AiQuotaMonitorCard() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const { quota, isLoading, isRefetching, refetch, updateLimits, isUpdatingLimits } = useAiQuota();

  const [isEditingLimits, setIsEditingLimits] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>('free');
  const [customDailyLimit, setCustomDailyLimit] = useState<number>(1500);
  const [customMinuteLimit, setCustomMinuteLimit] = useState<number>(15);

  const handleOpenEdit = () => {
    if (quota) {
      setSelectedTier(quota.tier || 'free');
      setCustomDailyLimit(quota.dailyLimit || 1500);
      setCustomMinuteLimit(quota.minuteLimit || 15);
    }
    setIsEditingLimits(true);
  };

  const handleSaveLimits = async () => {
    try {
      const daily = selectedTier === 'free' ? 1500 : customDailyLimit;
      const minute = selectedTier === 'free' ? 15 : customMinuteLimit;
      await updateLimits({
        tier: selectedTier,
        dailyLimit: daily,
        minuteLimit: minute,
      });
      setIsEditingLimits(false);
      toast.success('AI API quota limits updated successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update quota limits');
    }
  };

  const percentUsed = quota?.percentDailyUsed ?? 0;
  const progressColor =
    percentUsed > 85 ? muiTheme.palette.error.main : percentUsed > 60 ? muiTheme.palette.warning.main : '#10b981';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.2)',
        background: isDark
          ? 'linear-gradient(180deg, rgba(30, 27, 75, 0.2) 0%, rgba(15, 23, 42, 0.35) 100%)'
          : 'linear-gradient(180deg, rgba(245, 247, 255, 0.7) 0%, rgba(255, 255, 255, 0.95) 100%)',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Header Bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.12)',
                color: '#6366f1',
              }}
            >
              <SpeedRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  AI API Quota & Rate Limit Monitor
                </Typography>
                <Chip
                  size="small"
                  label={quota?.tier?.toLowerCase() === 'payg' ? 'Pay-As-You-Go' : 'Google Free Tier (₹0)'}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    height: 20,
                    bgcolor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                    color: '#6366f1',
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Live telemetry of Google Gemini API requests made, remaining capacity, and rolling minute rate
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Status Chip */}
            {quota?.isRateLimited ? (
              <Chip
                size="small"
                icon={<WarningAmberRoundedIcon sx={{ fontSize: '15px !important' }} />}
                label="Rate Limited (429) • Quant Fallback"
                color="error"
                sx={{ fontWeight: 700, fontSize: '0.72rem' }}
              />
            ) : (
              <Chip
                size="small"
                icon={<CheckCircleRoundedIcon sx={{ fontSize: '15px !important', color: '#10b981 !important' }} />}
                label="Normal • 100% Operational"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  bgcolor: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              />
            )}

            <Tooltip title="Refresh Quota Telemetry">
              <span>
                <IconButton
                  size="small"
                  onClick={() => refetch()}
                  disabled={isLoading || isRefetching}
                  sx={{ border: '1px solid', borderColor: 'divider' }}
                >
                  {isRefetching ? <CircularProgress size={16} /> : <RefreshRoundedIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </span>
            </Tooltip>

            <Button
              size="small"
              variant="outlined"
              onClick={handleOpenEdit}
              startIcon={<TuneRoundedIcon sx={{ fontSize: 16 }} />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', height: 32 }}
            >
              Adjust Limits
            </Button>
          </Box>
        </Box>

        {/* Edit Limits Drawer / Collapse */}
        <Collapse in={isEditingLimits}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Configure AI Request Quota & Tier
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl fullWidth size="small">
                  <Typography variant="caption" sx={{ mb: 0.5, fontWeight: 600 }}>
                    Subscription Tier
                  </Typography>
                  <Select
                    value={selectedTier}
                    onChange={(e) => {
                      const t = e.target.value;
                      setSelectedTier(t);
                      if (t === 'free') {
                        setCustomDailyLimit(1500);
                        setCustomMinuteLimit(15);
                      }
                    }}
                  >
                    <MenuItem value="free">Google AI Studio Free Tier (15 RPM / 1,500 RPD)</MenuItem>
                    <MenuItem value="payg">Pay-As-You-Go / Tier 1 (Custom Limits)</MenuItem>
                    <MenuItem value="custom">Custom Quota Architecture</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ mb: 0.5, fontWeight: 600, display: 'block' }}>
                  Daily Request Limit (RPD)
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="number"
                  value={selectedTier === 'free' ? 1500 : customDailyLimit}
                  disabled={selectedTier === 'free'}
                  onChange={(e) => setCustomDailyLimit(Math.max(1, Number(e.target.value)))}
                  helperText={selectedTier === 'free' ? 'Standard Google Free Tier max 1,500/day' : 'Custom daily budget'}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ mb: 0.5, fontWeight: 600, display: 'block' }}>
                  Minute Request Rate (RPM)
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="number"
                  value={selectedTier === 'free' ? 15 : customMinuteLimit}
                  disabled={selectedTier === 'free'}
                  onChange={(e) => setCustomMinuteLimit(Math.max(1, Number(e.target.value)))}
                  helperText={selectedTier === 'free' ? 'Standard Google Free Tier max 15/min' : 'Custom requests/min'}
                />
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button size="small" onClick={() => setIsEditingLimits(false)}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleSaveLimits}
                disabled={isUpdatingLimits}
                startIcon={isUpdatingLimits ? <CircularProgress size={14} color="inherit" /> : <BoltRoundedIcon />}
              >
                Save Limits
              </Button>
            </Box>
          </Box>
        </Collapse>

        {/* Telemetry Stat Cards */}
        <Grid container spacing={2}>
          {/* Daily Request Capacity Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <BarChartRoundedIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Daily Requests (RPD)
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={`${percentUsed}% used`}
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.7rem',
                    height: 20,
                    bgcolor: alpha(progressColor, 0.15),
                    color: progressColor,
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>
                    {quota?.requestsToday?.toLocaleString() ?? 0}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75, fontWeight: 500 }}>
                      / {quota?.dailyLimit?.toLocaleString() ?? 1500} made
                    </Typography>
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#10b981', lineHeight: 1 }}>
                    {quota?.requestsRemainingToday?.toLocaleString() ?? 1500}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    remaining today
                  </Typography>
                </Box>
              </Box>

              <LinearProgress
                variant="determinate"
                value={Math.min(100, percentUsed)}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: progressColor,
                    borderRadius: 4,
                  },
                }}
              />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Resets in <b>{quota?.resetsInHours ?? 0} hrs</b> (00:00:00 UTC)
                  </Typography>
                </Box>
                {quota?.rateLimitedEventsToday && quota.rateLimitedEventsToday > 0 ? (
                  <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                    {quota.rateLimitedEventsToday} 429 event{quota.rateLimitedEventsToday > 1 ? 's' : ''} intercepted
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    0 rate limit breaches
                  </Typography>
                )}
              </Box>
            </Box>
          </Grid>

          {/* Minute Request Rate Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <BoltRoundedIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Minute Burst Rate (RPM)
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label="60s Sliding Window"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    height: 20,
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    color: 'text.secondary',
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>
                    {quota?.requestsThisMinute ?? 0}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75, fontWeight: 500 }}>
                      / {quota?.minuteLimit ?? 15} RPM
                    </Typography>
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>
                    {quota?.requestsRemainingThisMinute ?? 15}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    burst slots left
                  </Typography>
                </Box>
              </Box>

              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.round(((quota?.requestsThisMinute ?? 0) / (quota?.minuteLimit || 15)) * 100))}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: '#6366f1',
                    borderRadius: 4,
                  },
                }}
              />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Last Model: <b>{quota?.lastModelUsed || 'gemini-3.5-flash-lite'}</b>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {quota?.lastRequestAt ? `Last active: ${new Date(quota.lastRequestAt).toLocaleTimeString()}` : 'No requests yet today'}
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        {/* Feature Breakdown Pills */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <LayersRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Requests Made by AI Feature Today
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {quota?.featuresToday && Object.keys(quota.featuresToday).length > 0 ? (
              Object.entries(quota.featuresToday).map(([featKey, count]) => (
                <Chip
                  key={featKey}
                  size="small"
                  label={`${FEATURE_NAMES[featKey] || featKey}: ${count}`}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
              ))
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', py: 0.5 }}>
                No AI requests dispatched yet today. Free tier balance is completely fresh (1,500 / 1,500 remaining).
              </Typography>
            )}
          </Box>
        </Box>

        {/* Zero-Downtime Quant Fallback Assurance */}
        <Alert
          severity="info"
          icon={<InfoOutlinedIcon sx={{ fontSize: 20 }} />}
          sx={{
            borderRadius: 2,
            bgcolor: isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.05)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)',
            '& .MuiAlert-message': { fontSize: '0.78rem' },
          }}
        >
          <b>Zero-Downtime Guarantee:</b> If Google Gemini reaches its 15 RPM or 1,500 daily free limit (or returns HTTP 429), SetupMint automatically routes your request to the built-in <b>Deterministic Quant Coach</b> with zero latency, ₹0 cost, and zero trade disruption.
        </Alert>
      </CardContent>
    </Card>
  );
}

