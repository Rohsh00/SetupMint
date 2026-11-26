import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  TextField,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Chip,
  Switch,
  Slider,
  useTheme as useMuiTheme,
  alpha,
  Alert,
  Tooltip,
} from '@mui/material';
import TrackChangesRounded from '@mui/icons-material/TrackChangesRounded';
import FlashOnRounded from '@mui/icons-material/FlashOnRounded';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import CloudSyncRounded from '@mui/icons-material/CloudSyncRounded';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import SecurityRounded from '@mui/icons-material/SecurityRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { formatCurrency } from '../../lib/utils.js';
import { soundEngine } from '../../lib/sound-engine.js';

export interface ExecutionSettingsTabProps {
  settingsCurrency: string;
  defaultAutoExecute: boolean;
  setDefaultAutoExecute: (val: boolean) => void;
  defaultTargetMode: string;
  onApplyPresetMode: (mode: any) => void;
  targetDistributionMode: string;
  setTargetDistributionMode: (val: any) => void;
  executionAlgorithm: string;
  setExecutionAlgorithm: (val: any) => void;
  maxSlippagePercent: number;
  setMaxSlippagePercent: (val: number) => void;
  maxSlippagePoints: number;
  setMaxSlippagePoints: (val: number) => void;
  spreadSurgeProtectionEnabled: boolean;
  setSpreadSurgeProtectionEnabled: (val: boolean) => void;
  spreadSurgeMultiplier: number;
  setSpreadSurgeMultiplier: (val: number) => void;
  antiLoopProtectionEnabled: boolean;
  setAntiLoopProtectionEnabled: (val: boolean) => void;
  orderRateLimitPer5Sec: number;
  setOrderRateLimitPer5Sec: (val: number) => void;
  beCushionTicks: number;
  setBeCushionTicks: (val: number) => void;
  t1MultipleR: number;
  setT1MultipleR: (val: number) => void;
  t1ExitPercent: number;
  setT1ExitPercent: (val: number) => void;
  t1TrailingAction: string;
  setT1TrailingAction: (val: any) => void;
  t1TrailPoints: number;
  setT1TrailPoints: (val: number) => void;
  t2Enabled: boolean;
  setT2Enabled: (val: boolean) => void;
  t2MultipleR: number;
  setT2MultipleR: (val: number) => void;
  t2ExitPercent: number;
  setT2ExitPercent: (val: number) => void;
  t2TrailingAction: string;
  setT2TrailingAction: (val: any) => void;
  t2TrailPoints: number;
  setT2TrailPoints: (val: number) => void;
  isFreeRunner: boolean;
  setIsFreeRunner: (val: boolean) => void;
  t3MultipleR: number;
  setT3MultipleR: (val: number) => void;
  dynamicTrailingEnabled: boolean;
  setDynamicTrailingEnabled: (val: boolean) => void;
  dynamicTriggerR: number;
  setDynamicTriggerR: (val: number) => void;
  dynamicTrailType: string;
  setDynamicTrailType: (val: any) => void;
  dynamicStepR: number;
  setDynamicStepR: (val: number) => void;
  dynamicTrailPoints: number;
  setDynamicTrailPoints: (val: number) => void;
  givebackAutoExitEnabled: boolean;
  setGivebackAutoExitEnabled: (val: boolean) => void;
  givebackMinPeakR: number;
  setGivebackMinPeakR: (val: number) => void;
  givebackMaxPercent: number;
  setGivebackMaxPercent: (val: number) => void;
  misSquareOffEnabled: boolean;
  setMisSquareOffEnabled: (val: boolean) => void;
  misSquareOffTime: string;
  setMisSquareOffTime: (val: string) => void;
  scalperHotkeysEnabled: boolean;
  setScalperHotkeysEnabled: (val: boolean) => void;
  soundAlertsEnabled: boolean;
  setSoundAlertsEnabled: (val: boolean) => void;
  defaultRefreshIntervalSec: number;
  setDefaultRefreshIntervalSec: (val: number) => void;
  paperExecutionMode: boolean;
  setPaperExecutionMode: (val: boolean) => void;
  serverSideExecutionEnabled: boolean;
  setServerSideExecutionEnabled: (val: boolean) => void;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  onSave: (e: React.FormEvent) => void;
  onResetDefaults: () => void;
}

export function ExecutionSettingsTab({
  settingsCurrency,
  defaultAutoExecute,
  setDefaultAutoExecute,
  defaultTargetMode,
  onApplyPresetMode,
  targetDistributionMode,
  setTargetDistributionMode,
  executionAlgorithm,
  setExecutionAlgorithm,
  maxSlippagePercent,
  setMaxSlippagePercent,
  maxSlippagePoints,
  setMaxSlippagePoints,
  spreadSurgeProtectionEnabled,
  setSpreadSurgeProtectionEnabled,
  spreadSurgeMultiplier,
  setSpreadSurgeMultiplier,
  antiLoopProtectionEnabled,
  setAntiLoopProtectionEnabled,
  orderRateLimitPer5Sec,
  setOrderRateLimitPer5Sec,
  beCushionTicks,
  setBeCushionTicks,
  t1MultipleR,
  setT1MultipleR,
  t1ExitPercent,
  setT1ExitPercent,
  t1TrailingAction,
  setT1TrailingAction,
  t1TrailPoints,
  setT1TrailPoints,
  t2Enabled,
  setT2Enabled,
  t2MultipleR,
  setT2MultipleR,
  t2ExitPercent,
  setT2ExitPercent,
  t2TrailingAction,
  setT2TrailingAction,
  t2TrailPoints,
  setT2TrailPoints,
  isFreeRunner,
  setIsFreeRunner,
  t3MultipleR,
  setT3MultipleR,
  dynamicTrailingEnabled,
  setDynamicTrailingEnabled,
  dynamicTriggerR,
  setDynamicTriggerR,
  dynamicTrailType,
  setDynamicTrailType,
  dynamicStepR,
  setDynamicStepR,
  dynamicTrailPoints,
  setDynamicTrailPoints,
  givebackAutoExitEnabled,
  setGivebackAutoExitEnabled,
  givebackMinPeakR,
  setGivebackMinPeakR,
  givebackMaxPercent,
  setGivebackMaxPercent,
  misSquareOffEnabled,
  setMisSquareOffEnabled,
  misSquareOffTime,
  setMisSquareOffTime,
  scalperHotkeysEnabled,
  setScalperHotkeysEnabled,
  soundAlertsEnabled,
  setSoundAlertsEnabled,
  defaultRefreshIntervalSec,
  setDefaultRefreshIntervalSec,
  paperExecutionMode,
  setPaperExecutionMode,
  serverSideExecutionEnabled,
  setServerSideExecutionEnabled,
  isSaving,
  saveSuccess,
  saveError,
  onSave,
  onResetDefaults,
}: ExecutionSettingsTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const runnerPercent = Math.max(0, 100 - t1ExitPercent - (t2Enabled ? t2ExitPercent : 0));

  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── TOP COCKPIT HEADER ── */}
      <Box
        sx={{
          p: 2.5,
          borderRadius: 2.5,
          bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'grey.50',
          border: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '8px',
                bgcolor: alpha(muiTheme.palette.primary.main, 0.12),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
              }}
            >
              <FlashOnRounded sx={{ fontSize: 22 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.2 }}>
              Institutional Auto-Execution & Scaling Cockpit
            </Typography>
            <Chip
              size="small"
              label={defaultAutoExecute ? '⚡ AUTOMATION ARMED' : '✋ MANUAL CONFIRMATION'}
              color={defaultAutoExecute ? 'success' : 'default'}
              sx={{ fontWeight: 800, fontSize: '0.68rem', height: 22 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Configure algorithmic order routing, multi-tranche scaling distribution, adverse slippage caps, and server-side fail-safes.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={onResetDefaults}
            sx={{ fontWeight: 600, textTransform: 'none', borderRadius: 1.5 }}
          >
            Reset Defaults
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSaving}
            sx={{ fontWeight: 800, px: 3, borderRadius: 1.5, boxShadow: 'none' }}
          >
            {isSaving ? 'Saving Cockpit...' : 'Save Execution Settings'}
          </Button>
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" icon={<CheckCircleRounded />}>
          Institutional Execution Cockpit settings saved successfully. Server daemon & live watchers updated.
        </Alert>
      )}

      {saveError && <Alert severity="error">{saveError}</Alert>}

      {/* ── COCKPIT PANE 1: SCALING TRANCHE MATRIX & VISUAL DISTRIBUTION ── */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'divider',
          bgcolor: isDark ? 'rgba(255,255,255,0.015)' : '#fff',
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LayersRounded sx={{ color: 'primary.main', fontSize: 20 }} />
                Scaling Tranche Matrix & Position Distribution
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Control partial book points, target R-multiples, and true breakeven defense with tick padding.
              </Typography>
            </Box>

            {/* Presets */}
            <ToggleButtonGroup
              size="small"
              exclusive
              value={targetDistributionMode}
              onChange={(_, val) => {
                if (!val) return;
                setTargetDistributionMode(val);
                onApplyPresetMode(val);
              }}
              sx={{
                '& .MuiToggleButton-root': {
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  px: 1.25,
                  py: 0.5,
                  textTransform: 'none',
                },
              }}
            >
              <ToggleButton value="DEFENSIVE_50_30_20">🛡️ Defensive (50/30/20)</ToggleButton>
              <ToggleButton value="CONVEX_20_30_50">📈 Convex Runner (20/30/50)</ToggleButton>
              <ToggleButton value="EQUAL_SPLIT">⚖️ Equal Split (33/33/34)</ToggleButton>
              <ToggleButton value="T1_ONLY">⚡ T1 Only (100%)</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Interactive Tranche Allocation Bar Visualizer */}
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'grey.50',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Position Volume Allocation Curve:
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: runnerPercent > 0 ? '#8B5CF6' : 'text.secondary' }}>
                {runnerPercent > 0 ? `🚀 ${runnerPercent}% Position Left to Ride Open Trend` : 'Full Position Closed at Targets'}
              </Typography>
            </Box>

            {/* Segmented Volume Allocation Bar */}
            <Box
              sx={{
                display: 'flex',
                height: 18,
                borderRadius: 1.5,
                overflow: 'hidden',
                bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                mb: 1.5,
              }}
            >
              <Box
                sx={{
                  width: `${Math.min(100, Math.max(0, t1ExitPercent))}%`,
                  bgcolor: '#3B82F6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  transition: 'width 0.3s ease',
                }}
              >
                {t1ExitPercent >= 15 ? `T1: ${t1ExitPercent}%` : `${t1ExitPercent}%`}
              </Box>
              {t2Enabled && (
                <Box
                  sx={{
                    width: `${Math.min(100, Math.max(0, t2ExitPercent))}%`,
                    bgcolor: '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    transition: 'width 0.3s ease',
                  }}
                >
                  {t2ExitPercent >= 15 ? `T2: ${t2ExitPercent}%` : `${t2ExitPercent}%`}
                </Box>
              )}
              {runnerPercent > 0 && (
                <Box
                  sx={{
                    width: `${runnerPercent}%`,
                    bgcolor: '#8B5CF6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    transition: 'width 0.3s ease',
                  }}
                >
                  {runnerPercent >= 15 ? `Runner: ${runnerPercent}%` : `${runnerPercent}%`}
                </Box>
              )}
            </Box>

            {/* Timeline Milestones */}
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: '#3B82F6', bgcolor: alpha('#3B82F6', 0.05) }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#3B82F6', display: 'block' }}>
                    TRANCHE 1: +{t1MultipleR}R ({t1ExitPercent}% EXIT)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25 }}>
                    {t1TrailingAction === 'TRUE_BE_WITH_FEES'
                      ? `True BE + Fees + ${beCushionTicks}T Cushion`
                      : t1TrailingAction === 'NOMINAL_BE'
                      ? 'Nominal Entry BE'
                      : t1TrailingAction === 'CUSTOM_POINTS'
                      ? `Trail SL +${t1TrailPoints} pts`
                      : 'Stop Loss Unchanged'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Primary risk offload milestone
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    border: 1,
                    borderColor: t2Enabled ? '#10B981' : 'divider',
                    bgcolor: t2Enabled ? alpha('#10B981', 0.05) : 'transparent',
                    opacity: t2Enabled ? 1 : 0.6,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 800, color: t2Enabled ? '#10B981' : 'text.secondary', display: 'block' }}>
                    TRANCHE 2: {t2Enabled ? `+${t2MultipleR}R (${t2ExitPercent}% EXIT)` : 'DISABLED'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25 }}>
                    {t2Enabled
                      ? t2TrailingAction === 'TRAIL_T1'
                        ? `Lock T1 Profit (+${t1MultipleR}R)`
                        : 'Custom Trail'
                      : 'Skipped to Runner'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Secondary scaling milestone
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: '#8B5CF6', bgcolor: alpha('#8B5CF6', 0.05) }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#8B5CF6', display: 'block' }}>
                    RUNNER: {runnerPercent}% VOLUME
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25 }}>
                    {isFreeRunner ? 'Free Runner Ride (Giveback Protected)' : `Target 3 (+${t3MultipleR}R Fixed)`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {givebackAutoExitEnabled ? `Anti-Greed Radar: Max ${givebackMaxPercent}% giveback` : 'Manual runner exit'}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>

          {/* Tranche Configuration Inputs */}
          <Grid container spacing={2.5}>
            {/* Target 1 Controls */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip size="small" label="T1" color="primary" sx={{ fontWeight: 800, height: 20 }} />
                  Target 1 (Primary Scaling Level)
                </Typography>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Target 1 (R-Multiple)"
                      size="small"
                      fullWidth
                      type="number"
                      value={t1MultipleR}
                      onChange={(e) => setT1MultipleR(Number(e.target.value))}
                      slotProps={{ htmlInput: { step: '0.1', min: '0.5' } }}
                      helperText="e.g. +1.0R risk multiple"
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Exit Ratio (%)"
                      size="small"
                      fullWidth
                      type="number"
                      value={t1ExitPercent}
                      onChange={(e) => setT1ExitPercent(Number(e.target.value))}
                      slotProps={{ htmlInput: { step: '5', min: '10', max: '100' } }}
                      helperText="Partial quantity exit %"
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField
                      select
                      label="Trailing Stop Action When T1 is Reached"
                      size="small"
                      fullWidth
                      value={t1TrailingAction}
                      onChange={(e) => setT1TrailingAction(e.target.value)}
                    >
                      <MenuItem value="TRUE_BE_WITH_FEES">
                        <strong>Lock True BE + Fees + Cushion (Guaranteed Net Non-Negative)</strong>
                      </MenuItem>
                      <MenuItem value="NOMINAL_BE">Nominal Breakeven (Exact Entry Price)</MenuItem>
                      <MenuItem value="CUSTOM_POINTS">Trail Stop Loss by Custom Points (+X pts)</MenuItem>
                      <MenuItem value="NONE">Do Not Move Stop Loss (Leave Initial Risk)</MenuItem>
                    </TextField>
                  </Grid>

                  {t1TrailingAction === 'TRUE_BE_WITH_FEES' && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Safety Tick Cushion Beyond True BE"
                        size="small"
                        type="number"
                        fullWidth
                        value={beCushionTicks}
                        onChange={(e) => setBeCushionTicks(Number(e.target.value))}
                        helperText="Adds 1-4 ticks of padding above true breakeven to ensure zero slippage friction"
                      />
                    </Grid>
                  )}

                  {t1TrailingAction === 'CUSTOM_POINTS' && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Trail Points Behind LTP"
                        size="small"
                        type="number"
                        fullWidth
                        value={t1TrailPoints}
                        onChange={(e) => setT1TrailPoints(Number(e.target.value))}
                      />
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Grid>

            {/* Target 2 Controls */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label="T2" color="secondary" sx={{ fontWeight: 800, height: 20 }} />
                    Target 2 (Secondary Milestone)
                  </Typography>
                  <Switch checked={t2Enabled} onChange={(e) => setT2Enabled(e.target.checked)} size="small" />
                </Box>

                {t2Enabled ? (
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        label="Target 2 (R-Multiple)"
                        size="small"
                        fullWidth
                        type="number"
                        value={t2MultipleR}
                        onChange={(e) => setT2MultipleR(Number(e.target.value))}
                        slotProps={{ htmlInput: { step: '0.1', min: '1.0' } }}
                        helperText="e.g. +2.0R risk multiple"
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        label="Exit Ratio (%)"
                        size="small"
                        fullWidth
                        type="number"
                        value={t2ExitPercent}
                        onChange={(e) => setT2ExitPercent(Number(e.target.value))}
                        slotProps={{ htmlInput: { step: '5', min: '5', max: '100' } }}
                        helperText="Partial quantity exit %"
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        select
                        label="Trailing Stop Action When T2 is Reached"
                        size="small"
                        fullWidth
                        value={t2TrailingAction}
                        onChange={(e) => setT2TrailingAction(e.target.value)}
                      >
                        <MenuItem value="TRAIL_T1">Trail Stop Loss to Target 1 (+{t1MultipleR}R Locked)</MenuItem>
                        <MenuItem value="CUSTOM_POINTS">Trail Stop Loss by Custom Points</MenuItem>
                        <MenuItem value="NONE">Leave Trailing Stop at Breakeven</MenuItem>
                      </TextField>
                    </Grid>
                    {t2TrailingAction === 'CUSTOM_POINTS' && (
                      <Grid size={{ xs: 12 }}>
                        <TextField
                          label="Trail Points Behind LTP"
                          size="small"
                          type="number"
                          fullWidth
                          value={t2TrailPoints}
                          onChange={(e) => setT2TrailPoints(Number(e.target.value))}
                        />
                      </Grid>
                    )}
                  </Grid>
                ) : (
                  <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography variant="body2">
                      Target 2 is disabled. Trades will proceed from Target 1 directly to the runner position.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* Final Target & Runner Controls */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label="RUNNER" color="warning" sx={{ fontWeight: 800, height: 20 }} />
                    Final Target & Runner Ride Management
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {isFreeRunner ? 'Free Runner Ride (Uncapped)' : 'Fixed Target 3 Multiple'}
                    </Typography>
                    <Switch checked={!isFreeRunner} onChange={(e) => setIsFreeRunner(!e.target.checked)} size="small" />
                  </Box>
                </Box>

                {!isFreeRunner && (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Target 3 (R-Multiple)"
                        size="small"
                        fullWidth
                        type="number"
                        value={t3MultipleR}
                        onChange={(e) => setT3MultipleR(Number(e.target.value))}
                        slotProps={{ htmlInput: { step: '0.5', min: '2.0' } }}
                        helperText="Final planned take-profit level"
                      />
                    </Grid>
                  </Grid>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ── COCKPIT PANE 2: ALGORITHMIC ROUTING & MICROSTRUCTURE PROTECTIONS ── */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'divider',
          bgcolor: isDark ? 'rgba(255,255,255,0.015)' : '#fff',
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityRounded sx={{ color: 'primary.main', fontSize: 20 }} />
              Algorithmic Order Routing & Microstructure Protections
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tier-1 institutional execution algorithms that eliminate adverse slippage and guard against news spread blowouts.
            </Typography>
          </Box>

          <Grid container spacing={2.5}>
            {/* Routing Algorithm Selector */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HubRounded sx={{ color: 'primary.main', fontSize: 18 }} />
                  Execution Algorithm Type
                </Typography>

                <TextField
                  select
                  size="small"
                  label="Order Routing Algorithm"
                  value={executionAlgorithm}
                  onChange={(e) => setExecutionAlgorithm(e.target.value)}
                  fullWidth
                >
                  <MenuItem value="PEGGED_CHASE">
                    <strong>Smart Pegged Limit with Chase (Recommended)</strong>
                  </MenuItem>
                  <MenuItem value="TWAP_SLICING">TWAP Slicing (Time-Weighted Volume Clips)</MenuItem>
                  <MenuItem value="INSTANT_MARKET">Instant Market Fill (Aggressive Sweep)</MenuItem>
                </TextField>

                <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: alpha(muiTheme.palette.primary.main, 0.05), border: `1px solid ${alpha(muiTheme.palette.primary.main, 0.15)}` }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'primary.main', mb: 0.25 }}>
                    {executionAlgorithm === 'PEGGED_CHASE' && '⚡ SMART PEGGED LIMIT WITH CHASE:'}
                    {executionAlgorithm === 'TWAP_SLICING' && '⏱️ TWAP ORDER SLICING:'}
                    {executionAlgorithm === 'INSTANT_MARKET' && '🚀 INSTANT MARKET FILL:'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {executionAlgorithm === 'PEGGED_CHASE' &&
                      'Places a passive limit pegged to the best Bid/Ask to capture the spread. If not fully filled within 3 seconds, it chases into the book to guarantee execution with zero delay.'}
                    {executionAlgorithm === 'TWAP_SLICING' &&
                      'Splits large lot orders into 3-4 smaller micro-clips over 12 seconds to prevent adverse market impact and reduce liquidity depletion on exchange books.'}
                    {executionAlgorithm === 'INSTANT_MARKET' &&
                      'Transmits an immediate market order directly to the broker matching engine, strictly bounded by the adverse slippage cap below.'}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            {/* Microstructure Safeguards */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShieldRounded sx={{ color: '#10B981', fontSize: 18 }} />
                  Microstructure & Slippage Safeguards
                </Typography>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Max Slippage Cap (%)"
                      size="small"
                      type="number"
                      fullWidth
                      value={maxSlippagePercent}
                      onChange={(e) => setMaxSlippagePercent(Number(e.target.value))}
                      slotProps={{ htmlInput: { step: '0.01', min: '0.01', max: '2' } }}
                      helperText="Default: 0.05% tolerance"
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Max Slippage (Points)"
                      size="small"
                      type="number"
                      fullWidth
                      value={maxSlippagePoints}
                      onChange={(e) => setMaxSlippagePoints(Number(e.target.value))}
                      slotProps={{ htmlInput: { step: '0.5', min: '0.5' } }}
                      helperText="e.g. 2 index points"
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 0.5 }} />

                {/* Spread Surge Shield */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Spread Surge Shield
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Pauses auto-orders if spread widens beyond {spreadSurgeMultiplier}x normal baseline (e.g. CPI/NFP news)
                    </Typography>
                  </Box>
                  <Switch
                    checked={spreadSurgeProtectionEnabled}
                    onChange={(e) => setSpreadSurgeProtectionEnabled(e.target.checked)}
                    size="small"
                  />
                </Box>

                {spreadSurgeProtectionEnabled && (
                  <TextField
                    label="Spread Surge Multiplier Threshold"
                    size="small"
                    type="number"
                    fullWidth
                    value={spreadSurgeMultiplier}
                    onChange={(e) => setSpreadSurgeMultiplier(Number(e.target.value))}
                    slotProps={{ htmlInput: { step: '0.5', min: '1.5', max: '5.0' } }}
                    helperText="e.g. 2.0x normal spread halts market exits until liquidity normalizes"
                  />
                )}

                <Divider sx={{ my: 0.5 }} />

                {/* Anti-Loop Throttler */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Order Storm & Anti-Loop Limiter
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Caps automated orders to max {orderRateLimitPer5Sec} per 5s to prevent broker API rate bans
                    </Typography>
                  </Box>
                  <Switch
                    checked={antiLoopProtectionEnabled}
                    onChange={(e) => setAntiLoopProtectionEnabled(e.target.checked)}
                    size="small"
                  />
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ── COCKPIT PANE 3: DYNAMIC TRAILING & GIVEBACK RADAR ── */}
      <Grid container spacing={2.5}>
        {/* Dynamic Trailing Ratchet */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1, borderRadius: 2.5 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SpeedRounded sx={{ color: 'primary.main' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Dynamic Step-Trailing Ratchet
                  </Typography>
                </Box>
                <Switch
                  checked={dynamicTrailingEnabled}
                  onChange={(e) => setDynamicTrailingEnabled(e.target.checked)}
                  size="small"
                />
              </Box>

              <Typography variant="body2" color="text.secondary">
                Ratchets your stop loss forward dynamically as the trade gains R-multiples, locking in gains automatically behind swing points.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                <TextField
                  label="Activation Trigger (R-Multiple)"
                  size="small"
                  fullWidth
                  type="number"
                  value={dynamicTriggerR}
                  onChange={(e) => setDynamicTriggerR(Number(e.target.value))}
                  slotProps={{ htmlInput: { step: '0.1', min: '0.5' } }}
                  helperText="Dynamic trailing activates once trade crosses this threshold"
                />

                <TextField
                  select
                  label="Ratchet Type"
                  size="small"
                  fullWidth
                  value={dynamicTrailType}
                  onChange={(e) => setDynamicTrailType(e.target.value)}
                >
                  <MenuItem value="STEP_R">Step-R Ratchet (Trail by +X R every step)</MenuItem>
                  <MenuItem value="HIGH_WATER_POINTS">High-Water Mark (Trail peak price by fixed pts)</MenuItem>
                </TextField>

                {dynamicTrailType === 'STEP_R' ? (
                  <TextField
                    label="Step Size (R)"
                    size="small"
                    fullWidth
                    type="number"
                    value={dynamicStepR}
                    onChange={(e) => setDynamicStepR(Number(e.target.value))}
                    slotProps={{ htmlInput: { step: '0.1', min: '0.2' } }}
                    helperText="e.g. 0.5R ratchet interval"
                  />
                ) : (
                  <TextField
                    label="Trail Distance (Points)"
                    size="small"
                    fullWidth
                    type="number"
                    value={dynamicTrailPoints}
                    onChange={(e) => setDynamicTrailPoints(Number(e.target.value))}
                    helperText="Fixed points behind peak high water mark"
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Giveback Protection Radar */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1, borderRadius: 2.5 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUpRounded sx={{ color: '#F59E0B' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Anti-Greed Profit Giveback Radar
                  </Typography>
                </Box>
                <Switch
                  checked={givebackAutoExitEnabled}
                  onChange={(e) => setGivebackAutoExitEnabled(e.target.checked)}
                  size="small"
                />
              </Box>

              <Typography variant="body2" color="text.secondary">
                Prevents winning trades from turning into red days. Tracks peak unrealized profit (MFE) in real time and auto-squares off runner if profit retreats beyond tolerance.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
                <TextField
                  label="Activation Gate (Min Peak Profit in R)"
                  size="small"
                  fullWidth
                  type="number"
                  value={givebackMinPeakR}
                  onChange={(e) => setGivebackMinPeakR(Number(e.target.value))}
                  slotProps={{ htmlInput: { step: '0.1', min: '1.0' } }}
                  helperText="Protection only activates after trade achieves at least +1.5R profit"
                />

                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Max Giveback Tolerance
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'error.main', fontFamily: '"JetBrains Mono", monospace' }}>
                      {givebackMaxPercent}% Leak Allowed
                    </Typography>
                  </Box>
                  <Slider
                    value={givebackMaxPercent}
                    onChange={(_, val) => setGivebackMaxPercent(val as number)}
                    min={15}
                    max={60}
                    step={5}
                    marks={[
                      { value: 20, label: '20% (Tight)' },
                      { value: 35, label: '35% (Standard)' },
                      { value: 50, label: '50% (Loose)' },
                    ]}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    If a trade peaks at {formatCurrency(10000, settingsCurrency)} profit and retreats to {formatCurrency(10000 * (1 - givebackMaxPercent / 100), settingsCurrency)}, the radar triggers auto-exit.
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── COCKPIT PANE 4: GOVERNANCE, AUTOMATION & SAFETY ── */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'divider',
          bgcolor: isDark ? 'rgba(255,255,255,0.015)' : '#fff',
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Institutional Governance, Automation & Safety
          </Typography>

          <Grid container spacing={2.5}>
            {/* Master Broker Auto-Execution Arm */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: defaultAutoExecute
                    ? isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)'
                    : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: defaultAutoExecute ? 'success.main' : 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                    {defaultAutoExecute ? '⚡ Auto-Execution Armed Globally' : '✋ Manual Confirmation Mode'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {defaultAutoExecute
                      ? 'When a target or stop price is reached, SetupMint immediately transmits partial exits and SL modifications directly to broker exchange.'
                      : 'Shows high-priority alert prompts and scalper chimes for 1-click execution without auto-firing to broker.'}
                  </Typography>
                </Box>
                <Switch
                  checked={defaultAutoExecute}
                  onChange={(e) => setDefaultAutoExecute(e.target.checked)}
                  color="success"
                />
              </Box>
            </Grid>

            {/* Server-Side Daemon */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: 1,
                  borderColor: serverSideExecutionEnabled ? 'primary.main' : 'divider',
                  bgcolor: serverSideExecutionEnabled ? alpha('#3B82F6', 0.08) : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <CloudSyncRounded sx={{ color: serverSideExecutionEnabled ? 'primary.main' : 'text.secondary', fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      Server-Side Headless Execution Daemon
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Monitors positions directly on cloud backend. Ladder exits, trailing stops, and giveback safety triggers execute even if your browser tab closes.
                  </Typography>
                </Box>
                <Switch
                  checked={serverSideExecutionEnabled}
                  onChange={(e) => setServerSideExecutionEnabled(e.target.checked)}
                  color="primary"
                />
              </Box>
            </Grid>

            {/* Paper Execution Mode */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: 1,
                  borderColor: paperExecutionMode ? 'warning.main' : 'divider',
                  bgcolor: paperExecutionMode ? alpha('#F59E0B', 0.08) : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <ScienceRounded sx={{ color: paperExecutionMode ? 'warning.main' : 'text.secondary', fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      Paper Execution Mode (Simulation)
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Simulates all ladder steps and trailing stops in journal without sending real financial orders to exchange. Great for strategy dry-runs.
                  </Typography>
                </Box>
                <Switch
                  checked={paperExecutionMode}
                  onChange={(e) => setPaperExecutionMode(e.target.checked)}
                  color="warning"
                />
              </Box>
            </Grid>

            {/* MIS Intraday Auto-Squareoff */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: 1,
                  borderColor: misSquareOffEnabled ? 'info.main' : 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      MIS Auto-Square-Off Safety Guard
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Auto-exits intraday MIS trades before broker penalty square-off charges kick in
                    </Typography>
                  </Box>
                  <Switch
                    checked={misSquareOffEnabled}
                    onChange={(e) => setMisSquareOffEnabled(e.target.checked)}
                    size="small"
                  />
                </Box>
                {misSquareOffEnabled && (
                  <TextField
                    size="small"
                    label="Auto Square-Off Time (IST)"
                    value={misSquareOffTime}
                    onChange={(e) => setMisSquareOffTime(e.target.value)}
                    helperText="e.g. 15:14 IST for Indian market intraday square-off"
                    fullWidth
                  />
                )}
              </Box>
            </Grid>
          </Grid>

          {/* Scalper Hotkeys & Audio Soundboard */}
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(muiTheme.palette.primary.main, 0.03), border: `1px solid ${alpha(muiTheme.palette.primary.main, 0.1)}` }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VolumeUpRounded sx={{ color: 'primary.main', fontSize: 18 }} />
                  Tactical Ergonomics, Hotkeys & Audio Profiles
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  [B] Lock True BE • [Space] 50% Quick Exit • [K] Panic Kill Switch
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>Hotkeys</Typography>
                  <Switch checked={scalperHotkeysEnabled} onChange={(e) => setScalperHotkeysEnabled(e.target.checked)} size="small" />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>Audio</Typography>
                  <Switch checked={soundAlertsEnabled} onChange={(e) => setSoundAlertsEnabled(e.target.checked)} size="small" />
                </Box>
              </Box>
            </Box>

            <Grid container spacing={1}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Button
                  size="small"
                  variant="outlined"
                  fullWidth
                  onClick={() => soundEngine.playPriceAlert()}
                  startIcon={<VolumeUpRounded sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.72rem', py: 0.5, textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  🔔 Alert Chime
                </Button>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Button
                  size="small"
                  variant="outlined"
                  fullWidth
                  color="success"
                  onClick={() => soundEngine.playTargetHit()}
                  startIcon={<VolumeUpRounded sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.72rem', py: 0.5, textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  🎯 Target Hit
                </Button>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Button
                  size="small"
                  variant="outlined"
                  fullWidth
                  color="info"
                  onClick={() => soundEngine.playOrderExecuted()}
                  startIcon={<VolumeUpRounded sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.72rem', py: 0.5, textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  ⚡ Order Filled
                </Button>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Button
                  size="small"
                  variant="outlined"
                  fullWidth
                  color="error"
                  onClick={() => soundEngine.playKillSwitch()}
                  startIcon={<VolumeUpRounded sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.72rem', py: 0.5, textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  🛑 Kill Switch
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      {/* Bottom Save Action Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, pb: 2 }}>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSaving}
          sx={{ fontWeight: 800, px: 4, py: 1, borderRadius: 1.5 }}
        >
          {isSaving ? 'Saving Execution Settings...' : 'Save Execution Settings'}
        </Button>
      </Box>
    </form>
  );
}
