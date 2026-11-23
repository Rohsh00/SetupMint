import React from 'react';
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
} from '@mui/material';
import TrackChangesRounded from '@mui/icons-material/TrackChangesRounded';
import FlashOnRounded from '@mui/icons-material/FlashOnRounded';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import CloudSyncRounded from '@mui/icons-material/CloudSyncRounded';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { ILiveWatcherSettings } from '@tradevault/shared';
import { formatCurrency } from '../../lib/utils.js';
import { soundEngine } from '../../lib/sound-engine.js';

export interface ExecutionSettingsTabProps {
  settingsCurrency: string;
  defaultAutoExecute: boolean;
  setDefaultAutoExecute: (val: boolean) => void;
  defaultTargetMode: string;
  onApplyPresetMode: (mode: 'T1_ONLY' | 'T1_FREE_RUNNER' | 'TWO_TARGETS_RUNNER' | 'CLASSIC_THREE') => void;
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

  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Quick Save Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'grey.50', border: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlashOnRounded sx={{ color: 'primary.main', fontSize: 22 }} />
            Automated Scaling Ladder & Execution Engine
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure automated scaling ratios, dynamic trailing stops, profit giveback radars, and execution simulation.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={onResetDefaults}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Reset Defaults
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSaving}
            sx={{ fontWeight: 700, px: 2.5 }}
          >
            {isSaving ? 'Saving...' : 'Save Execution Settings'}
          </Button>
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" icon={<CheckCircleRounded />}>
          Live Trade Watcher & Execution defaults saved successfully.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error">
          {saveError}
        </Alert>
      )}

      {/* Card 1: Interactive Scaling Ladder & Target Multiples */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrackChangesRounded sx={{ color: 'primary.main' }} />
                Default Scaling Ladder & Trailing Stop Rules
              </Typography>
              <Typography variant="body2" color="text.secondary">
                These rules apply automatically to open orders. Customize ratios, target R-multiples, and trailing stop actions.
              </Typography>
            </Box>

            {/* Preset Selector */}
            <ToggleButtonGroup
              size="small"
              exclusive
              value={defaultTargetMode}
              onChange={(_, val) => val && onApplyPresetMode(val)}
              sx={{
                '& .MuiToggleButton-root': {
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  px: 1.5,
                  textTransform: 'none',
                },
              }}
            >
              <ToggleButton value="TWO_TARGETS_RUNNER">2 Targets + Runner</ToggleButton>
              <ToggleButton value="T1_FREE_RUNNER">T1 + Free Runner</ToggleButton>
              <ToggleButton value="CLASSIC_THREE">Classic 3 Targets</ToggleButton>
              <ToggleButton value="T1_ONLY">T1 Only (100%)</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Visual Timeline Preview */}
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              border: 1,
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live Execution Workflow Preview for Every Open Trade:
            </Typography>

            <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
              <Grid size={{ xs: 12, sm: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)', border: 1, borderColor: 'primary.main' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', display: 'block' }}>
                    STEP 1: ENTRY (0.0R)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Initial SL Armed
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Full position size active
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)', border: 1, borderColor: '#10B981' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#10B981', display: 'block' }}>
                    STEP 2: TARGET 1 (+{t1MultipleR}R)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Exit {t1ExitPercent}% Position
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t1TrailingAction === 'TRUE_BE_WITH_FEES'
                      ? 'Trail SL to True BE + Fees'
                      : t1TrailingAction === 'NOMINAL_BE'
                      ? 'Trail SL to Entry Price'
                      : t1TrailingAction === 'CUSTOM_POINTS'
                      ? `Trail SL +${t1TrailPoints} pts`
                      : 'SL Unchanged'}
                  </Typography>
                </Box>
              </Grid>

              {t2Enabled && (
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)', border: 1, borderColor: '#8B5CF6' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#8B5CF6', display: 'block' }}>
                      STEP 3: TARGET 2 (+{t2MultipleR}R)
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Exit {t2ExitPercent}% Position
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t2TrailingAction === 'TRAIL_T1' ? `Trail SL to T1 (+${t1MultipleR}R)` : 'Trail by custom rule'}
                    </Typography>
                  </Box>
                </Grid>
              )}

              <Grid size={{ xs: 12, sm: t2Enabled ? 3 : 6 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)', border: 1, borderColor: '#F59E0B' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#F59E0B', display: 'block' }}>
                    STEP 4: RUNNER ({Math.max(0, 100 - t1ExitPercent - (t2Enabled ? t2ExitPercent : 0))}%)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {isFreeRunner ? 'Free Runner Ride' : `Target 3 (+${t3MultipleR}R)`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {givebackAutoExitEnabled ? `Max ${givebackMaxPercent}% giveback radar` : 'Manual exit'}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>

          {/* Ladder Step Controls */}
          <Grid container spacing={2.5}>
            {/* Target 1 Controls */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label="T1" color="primary" sx={{ fontWeight: 800, height: 20 }} />
                    Target 1 (Primary Scaling Level)
                  </Typography>
                </Box>

                <Grid container spacing={2}>
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
                      helperText="Automated order adjustment sent to broker"
                    >
                      <MenuItem value="TRUE_BE_WITH_FEES">
                        <strong>Lock True BE + Fees (Guaranteed Net Non-Negative)</strong>
                      </MenuItem>
                      <MenuItem value="NOMINAL_BE">
                        Nominal Breakeven (Exact Entry Price)
                      </MenuItem>
                      <MenuItem value="CUSTOM_POINTS">
                        Trail Stop Loss by Custom Points (+X pts)
                      </MenuItem>
                      <MenuItem value="NONE">
                        Do Not Move Stop Loss (Leave Initial Risk)
                      </MenuItem>
                    </TextField>
                  </Grid>

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
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label="T2" color="secondary" sx={{ fontWeight: 800, height: 20 }} />
                    Target 2 (Secondary Milestone)
                  </Typography>
                  <Switch
                    checked={t2Enabled}
                    onChange={(e) => setT2Enabled(e.target.checked)}
                    size="small"
                  />
                </Box>

                {t2Enabled ? (
                  <Grid container spacing={2}>
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

            {/* Runner / Target 3 Controls */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label="T3" color="warning" sx={{ fontWeight: 800, height: 20 }} />
                    Final Target & Runner Management
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {isFreeRunner ? 'Free Runner Ride (Exit on Signal / Radar)' : 'Fixed Target 3 Multiple'}
                    </Typography>
                    <Switch
                      checked={!isFreeRunner}
                      onChange={(e) => setIsFreeRunner(!e.target.checked)}
                      size="small"
                    />
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

      {/* Card 2: Dynamic Trailing Ratchet & Profit Giveback Protection Radar */}
      <Grid container spacing={2.5}>
        {/* Dynamic Trailing Ratchet */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SpeedRounded sx={{ color: 'primary.main' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
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
                  <MenuItem value="HIGH_WATER_MARK">High-Water Mark (Trail peak price by fixed pts)</MenuItem>
                  <MenuItem value="POINTS">Fixed Points Trailing</MenuItem>
                </TextField>

                {dynamicTrailType === 'STEP_R' && (
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
                )}

                {dynamicTrailType !== 'STEP_R' && (
                  <TextField
                    label="Trail Distance (Points)"
                    size="small"
                    fullWidth
                    type="number"
                    value={dynamicTrailPoints}
                    onChange={(e) => setDynamicTrailPoints(Number(e.target.value))}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Giveback Protection Radar */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SpeedRounded sx={{ color: '#F59E0B' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
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
                Prevents winning trades from turning into red days. Tracks peak unrealized profit (MFE) in real time and alerts or auto-squares off if profit retreats beyond tolerance.
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
                    If a trade peaks at {formatCurrency(10000, settingsCurrency)} profit and retreats to {formatCurrency(10000 * (1 - givebackMaxPercent / 100), settingsCurrency)}, the radar triggers exit prompt.
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Card 3: Fast Ergonomics, Hotkeys & MIS Square-Off Safety */}
      <Grid container spacing={2.5}>
        {/* Auto-Execution Master & Hotkeys */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FlashOnRounded sx={{ color: defaultAutoExecute ? 'success.main' : 'text.secondary' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Master Broker Auto-Execution Arm
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
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
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {defaultAutoExecute ? '⚡ Auto-Execution Armed Globally' : '✋ Manual Confirmation Mode'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {defaultAutoExecute
                      ? 'When a target or stop price is reached, SetupMint immediately fires partial exits and SL modifications to broker book.'
                      : 'Shows high-priority alert prompts and scalper chimes for 1-click execution without auto-firing to broker.'}
                  </Typography>
                </Box>
                <Switch
                  checked={defaultAutoExecute}
                  onChange={(e) => setDefaultAutoExecute(e.target.checked)}
                  color="success"
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Scalper Keyboard Hotkeys
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      [B] Lock True BE • [Space] 50% Quick Exit • [K] Panic Kill Switch
                    </Typography>
                  </Box>
                  <Switch
                    checked={scalperHotkeysEnabled}
                    onChange={(e) => setScalperHotkeysEnabled(e.target.checked)}
                    size="small"
                  />
                </Box>

                <Divider />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Audio Sound Alerts
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Crisp institutional chimes for price alerts, targets, stop threats, and executions
                    </Typography>
                  </Box>
                  <Switch
                    checked={soundAlertsEnabled}
                    onChange={(e) => setSoundAlertsEnabled(e.target.checked)}
                    size="small"
                  />
                </Box>

                {/* Audio Soundboard */}
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(muiTheme.palette.primary.main, 0.04), border: `1px solid ${alpha(muiTheme.palette.primary.main, 0.12)}` }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} /> Distinct Audio Profile Soundboard (Tap to Test)
                  </Typography>
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
                        🔔 Alert
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
                        🎯 Target
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
                        ⚡ Fill
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
                        🛑 Kill
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Polling Cadence & MIS Auto-Square-off */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Intraday Safety & Refresh Cadence
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      MIS Auto-Square-Off Safety
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Auto-exits intraday MIS trades before broker penalty fees kick in
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

                <Divider />

                <TextField
                  select
                  label="Live Watcher Refresh Interval"
                  size="small"
                  fullWidth
                  value={defaultRefreshIntervalSec}
                  onChange={(e) => setDefaultRefreshIntervalSec(Number(e.target.value))}
                  helperText="Frequency of live price polls from broker feeds"
                >
                  <MenuItem value={1}>1 Second (Ultra-Fast Scalping)</MenuItem>
                  <MenuItem value={2}>2 Seconds (Recommended Low Latency)</MenuItem>
                  <MenuItem value={5}>5 Seconds (Balanced API Quota)</MenuItem>
                  <MenuItem value={10}>10 Seconds (Conservative Intraday)</MenuItem>
                </TextField>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Card 4: Simulation & Institutional Automation */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Simulation & Server-Side Automation
          </Typography>

          <Grid container spacing={2.5}>
            {/* Paper Execution Mode Toggle */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: paperExecutionMode ? 'warning.main' : 'divider', bgcolor: paperExecutionMode ? alpha('#F59E0B', 0.08) : 'transparent' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ScienceRounded sx={{ color: paperExecutionMode ? 'warning.main' : 'text.secondary', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Paper Execution Mode (Simulation)
                    </Typography>
                  </Box>
                  <Switch
                    checked={paperExecutionMode}
                    onChange={(e) => setPaperExecutionMode(e.target.checked)}
                    color="warning"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  When enabled, ladder steps and auto-exits will simulate in journal without transmitting live financial orders to broker exchange. Great for dry-runs.
                </Typography>
              </Box>
            </Grid>

            {/* Server-Side Execution Daemon Toggle */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: serverSideExecutionEnabled ? 'primary.main' : 'divider', bgcolor: serverSideExecutionEnabled ? alpha('#3B82F6', 0.08) : 'transparent' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CloudSyncRounded sx={{ color: serverSideExecutionEnabled ? 'primary.main' : 'text.secondary', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Server-Side Execution Daemon
                    </Typography>
                  </Box>
                  <Switch
                    checked={serverSideExecutionEnabled}
                    onChange={(e) => setServerSideExecutionEnabled(e.target.checked)}
                    color="primary"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Monitors positions directly on the backend server every 2 seconds. Ladder exits, trailing stops, and giveback safety triggers execute even if your browser tab closes.
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Bottom Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, pt: 1 }}>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSaving}
          sx={{ fontWeight: 700, px: 3 }}
        >
          {isSaving ? 'Saving Execution Settings...' : 'Save Execution Settings'}
        </Button>
      </Box>
    </form>
  );
}
