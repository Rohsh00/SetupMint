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
  Chip,
  Switch,
  IconButton,
  Tooltip,
  Alert,
  useTheme as useMuiTheme,
} from '@mui/material';
import TimelineRounded from '@mui/icons-material/TimelineRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import { IInstrumentDetectionSetting, IExcursionSettings, DEFAULT_EXCURSION_SETTINGS } from '@tradevault/shared';

export interface MarketStructureTabProps {
  defaultHtf: string;
  setDefaultHtf: (val: string) => void;
  defaultLtf: string;
  setDefaultLtf: (val: string) => void;
  autoDetectOnImport: boolean;
  setAutoDetectOnImport: (val: boolean) => void;
  autoDetectMistakes: boolean;
  setAutoDetectMistakes: (val: boolean) => void;
  instrumentOverrides: IInstrumentDetectionSetting[];
  excursionSettings?: IExcursionSettings;
  setExcursionSettings?: React.Dispatch<React.SetStateAction<IExcursionSettings>>;
  onOpenAddOverride: () => void;
  onEditOverride: (idx: number) => void;
  onDeleteOverride: (idx: number) => void;
  onAddPreset: (symbol: string, htf: string, ltf: string) => void;
  onResetDefaults: () => void;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  onSave: (e?: React.FormEvent) => void;
}

export function formatResLabel(res: string): string {
  const map: Record<string, string> = {
    '1': '1m',
    '3': '3m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '240': '4h',
    'D': '1D',
  };
  return map[res] || `${res}m`;
}

export function MarketStructureTab({
  defaultHtf,
  setDefaultHtf,
  defaultLtf,
  setDefaultLtf,
  autoDetectOnImport,
  setAutoDetectOnImport,
  autoDetectMistakes,
  setAutoDetectMistakes,
  instrumentOverrides,
  excursionSettings = DEFAULT_EXCURSION_SETTINGS,
  setExcursionSettings,
  onOpenAddOverride,
  onEditOverride,
  onDeleteOverride,
  onAddPreset,
  onResetDefaults,
  isSaving,
  saveSuccess,
  saveError,
  onSave,
}: MarketStructureTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const updateExc = (patch: Partial<IExcursionSettings>) => {
    if (setExcursionSettings) {
      setExcursionSettings((prev) => ({ ...prev, ...patch }));
    }
  };

  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'grey.50', border: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimelineRounded sx={{ color: 'primary.main', fontSize: 22 }} />
            Market Structure & Timeframe Detection Engine
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Higher timeframe trend bias, liquidity sweep detection, and instrument-specific timeframes.
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
            {isSaving ? 'Saving...' : 'Save Structure Settings'}
          </Button>
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />}>
          Market structure & timeframe detection settings saved successfully.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error">
          {saveError}
        </Alert>
      )}

      {/* Card: Global Timeframe Defaults */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LayersRounded sx={{ color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Global Timeframe Defaults (Fallback for All Instruments)
              </Typography>
            </Box>
            <Chip
              icon={<AutoAwesomeRounded sx={{ fontSize: '1rem !important' }} />}
              label="4H Trend + 5M Confirmation Baseline"
              color="primary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 600, fontFamily: '"JetBrains Mono", monospace' }}
            />
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Default Higher Timeframe (HTF) Trend"
                size="small"
                fullWidth
                value={defaultHtf}
                onChange={(e) => setDefaultHtf(e.target.value)}
                helperText="Calculates institutional bias & structural trend (EMA 20/50 + swing points)"
              >
                <MenuItem value="60">1 Hour (60m) — Fast Intraday Trend</MenuItem>
                <MenuItem value="240">4 Hours (240m) — Recommended Institutional Baseline</MenuItem>
                <MenuItem value="D">Daily (1D) — Macro Swing Bias</MenuItem>
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Default Lower Timeframe (LTF) Confirmation"
                size="small"
                fullWidth
                value={defaultLtf}
                onChange={(e) => setDefaultLtf(e.target.value)}
                helperText="Evaluates liquidity sweeps (EQL/EQH/W/M) and entry candlestick window"
              >
                <MenuItem value="1">1 Minute (1m) — Precision Scalping Confirmation</MenuItem>
                <MenuItem value="3">3 Minutes (3m) — Fast Execution Window</MenuItem>
                <MenuItem value="5">5 Minutes (5m) — Recommended Confirmation Baseline</MenuItem>
                <MenuItem value="15">15 Minutes (15m) — Conservative Setup Confirmation</MenuItem>
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Auto-Classify on Import & Chart Gen
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Automatically evaluate HTF trend + LTF sweep pattern on trade sync
                  </Typography>
                </Box>
                <Switch
                  checked={autoDetectOnImport}
                  onChange={(e) => setAutoDetectOnImport(e.target.checked)}
                  color="primary"
                />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Auto-Detect Execution Mistakes
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Detect counter-trend entries, missing sweeps, premature entries
                  </Typography>
                </Box>
                <Switch
                  checked={autoDetectMistakes}
                  onChange={(e) => setAutoDetectMistakes(e.target.checked)}
                  color="primary"
                />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card: Instrument-Specific Overrides */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TuneRounded sx={{ color: 'primary.main' }} />
                Instrument-Specific Overrides & Strategy Routing
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Assign custom timeframes and preferred strategies to specific assets (e.g. NIFTY 1h+1m, CRUDEOIL 4h+5m).
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddRounded />}
              onClick={onOpenAddOverride}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Add Instrument Override
            </Button>
          </Box>

          {/* Quick Presets */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Quick Presets:
            </Typography>
            <Chip
              label="+ NIFTY (1h • 1m)"
              size="small"
              clickable
              onClick={() => onAddPreset('NIFTY', '60', '1')}
              sx={{ fontSize: '0.75rem', fontWeight: 600 }}
            />
            <Chip
              label="+ BANKNIFTY (1h • 1m)"
              size="small"
              clickable
              onClick={() => onAddPreset('BANKNIFTY', '60', '1')}
              sx={{ fontSize: '0.75rem', fontWeight: 600 }}
            />
            <Chip
              label="+ CRUDEOIL (4h • 5m)"
              size="small"
              clickable
              onClick={() => onAddPreset('CRUDEOIL', '240', '5')}
              sx={{ fontSize: '0.75rem', fontWeight: 600 }}
            />
            <Chip
              label="+ GOLD (4h • 5m)"
              size="small"
              clickable
              onClick={() => onAddPreset('GOLD', '240', '5')}
              sx={{ fontSize: '0.75rem', fontWeight: 600 }}
            />
          </Box>

          {/* Overrides List */}
          {instrumentOverrides.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center', bgcolor: isDark ? 'rgba(255,255,255,0.01)' : 'grey.50', borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary">
                No instrument-specific overrides configured. All trades will use global defaults (
                {formatResLabel(defaultHtf)} HTF + {formatResLabel(defaultLtf)} LTF).
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {instrumentOverrides.map((item, idx) => (
                <Box
                  key={`${item.symbol}-${idx}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: 1,
                    borderColor: 'divider',
                    gap: 2,
                    flexWrap: 'wrap',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={item.symbol}
                      color="primary"
                      size="small"
                      sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}
                    />
                    <Chip
                      label={`HTF: ${formatResLabel(item.htf)}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: '"JetBrains Mono", monospace' }}
                    />
                    <Chip
                      label={`LTF: ${formatResLabel(item.ltf)}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: '"JetBrains Mono", monospace' }}
                    />
                    {item.preferredStrategyName ? (
                      <Chip
                        label={`Preferred: ${item.preferredStrategyName}`}
                        size="small"
                        color="info"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        label="Dynamic Pattern Match"
                        size="small"
                        sx={{ color: 'text.secondary', bgcolor: 'transparent' }}
                      />
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Tooltip title="Edit override">
                      <IconButton size="small" onClick={() => onEditOverride(idx)}>
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete override">
                      <IconButton size="small" color="error" onClick={() => onDeleteOverride(idx)}>
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: POST-TRADE EXCURSION & EXECUTION QUALITY ENGINE */}
      <Card variant="outlined">
        <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HourglassEmptyRounded sx={{ color: 'primary.main', fontSize: 22 }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Post-Trade Excursion (PTE) & Lookahead Timing
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Configure candle lookahead duration, adaptive scaling, and session boundary clamping for MFE/MAE quality analytics.
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={2}>
            {/* Lookahead Duration */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Base Post-Exit Lookahead Window"
                value={String(excursionSettings.postExitLookaheadMinutes ?? 60)}
                onChange={(e) => updateExc({ postExitLookaheadMinutes: parseInt(e.target.value, 10) })}
                helperText="Window size for tracking runner continuation beyond exit"
              >
                <MenuItem value="15">15 Minutes (Micro-Scalps)</MenuItem>
                <MenuItem value="30">30 Minutes (Index Options Scalping)</MenuItem>
                <MenuItem value="60">60 Minutes (Standard Intraday Benchmark)</MenuItem>
                <MenuItem value="120">120 Minutes (Forex / Gold Sessions)</MenuItem>
                <MenuItem value="180">180 Minutes (Multi-Hour Runners)</MenuItem>
              </TextField>
            </Grid>

            {/* Optimal Exit Adverse Drop Threshold */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Optimal Exit Precision Threshold"
                value={String(excursionSettings.optimalExitMinAdverseR ?? 0.75)}
                onChange={(e) => updateExc({ optimalExitMinAdverseR: parseFloat(e.target.value) })}
                helperText="Adverse reversal R required post-exit to award Optimal Exit badge"
              >
                <MenuItem value="0.5">≥ 0.50R Adverse Drop</MenuItem>
                <MenuItem value="0.75">≥ 0.75R Adverse Drop (Recommended)</MenuItem>
                <MenuItem value="1.0">≥ 1.00R Adverse Drop (Strict Top-Tick)</MenuItem>
                <MenuItem value="1.5">≥ 1.50R Adverse Drop (Major Exhaustion)</MenuItem>
              </TextField>
            </Grid>

            {/* Adaptive Lookahead Switch */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  height: '100%',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Adaptive Hold-Time Multiplier
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Dynamically scale window to 1.5× trade hold time (min 15m, max 180m)
                  </Typography>
                </Box>
                <Switch
                  checked={Boolean(excursionSettings.adaptiveLookahead)}
                  onChange={(e) => updateExc({ adaptiveLookahead: e.target.checked })}
                  color="primary"
                />
              </Box>
            </Grid>

            {/* Clamp to Session Close */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  height: '100%',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Clamp to Session Close (3:30 PM IST)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Prevent lookahead from crossing into overnight gap noise
                  </Typography>
                </Box>
                <Switch
                  checked={excursionSettings.clampToSessionClose !== false}
                  onChange={(e) => updateExc({ clampToSessionClose: e.target.checked })}
                  color="primary"
                />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </form>
  );
}

