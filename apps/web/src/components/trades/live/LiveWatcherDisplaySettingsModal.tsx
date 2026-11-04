import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import {
  ILiveWatcherDisplaySettings,
  DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS,
} from '@tradevault/shared';

export interface LiveWatcherDisplaySettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings?: ILiveWatcherDisplaySettings;
  onSave: (settings: ILiveWatcherDisplaySettings) => void;
  isSaving?: boolean;
}

export function LiveWatcherDisplaySettingsModal({
  open,
  onClose,
  settings,
  onSave,
  isSaving = false,
}: LiveWatcherDisplaySettingsModalProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [form, setForm] = useState<ILiveWatcherDisplaySettings>(() => ({
    ...DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS,
    ...(settings || {}),
  }));

  useEffect(() => {
    if (open) {
      setForm({
        ...DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS,
        ...(settings || {}),
      });
    }
  }, [open, settings]);

  const handleToggle = (key: keyof ILiveWatcherDisplaySettings) => {
    setForm((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS });
  };

  const handleSave = () => {
    onSave(form);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            backgroundImage: 'none',
            bgcolor: isDark ? '#0F172A' : '#FFFFFF',
            border: `1px solid ${muiTheme.palette.divider}`,
            boxShadow: isDark ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)' : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: alpha(muiTheme.palette.primary.main, 0.12),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TuneRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
              Display & Elements Customization
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Choose which telemetry panels, indicators, and chart features are displayed in real-time.
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          {/* SECTION 1: CHART SETTINGS */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <CandlestickChartRoundedIcon sx={{ fontSize: 18, color: '#8B5CF6' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.78rem', color: '#8B5CF6' }}>
                Chart Terminal Settings
              </Typography>
              <Chip label="Real-time" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 800, bgcolor: alpha('#8B5CF6', 0.15), color: '#8B5CF6' }} />
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Auto-Expand Live Candlestick Charts
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      If disabled, candlestick charts stay collapsed by default to keep the interface uncluttered.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.autoExpandCharts)}
                    onChange={() => handleToggle('autoExpandCharts')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Show Volume Bars
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Displays volume histogram series at the bottom of the candlestick chart.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showChartVolume)}
                    onChange={() => handleToggle('showChartVolume')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Show Trade Price Levels
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Draws Entry, Stop Loss (SL), Target (TP), and Daily Breach horizontal price lines.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showChartTradeLevels)}
                    onChange={() => handleToggle('showChartTradeLevels')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Show OHLC & Live Bar Stats
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Header information displaying Open, High, Low, Close, and % movement.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showChartIndicators)}
                    onChange={() => handleToggle('showChartIndicators')}
                    color="primary"
                  />
                </Box>
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)' }} />

          {/* SECTION 2: LIVE WATCHER PANEL ELEMENTS */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <GridViewRoundedIcon sx={{ fontSize: 18, color: '#10B981' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.78rem', color: '#10B981' }}>
                Live Watcher Panel Elements
              </Typography>
              <Chip label="Telemetry" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 800, bgcolor: alpha('#10B981', 0.15), color: '#10B981' }} />
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Portfolio Risk Banner
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Aggregated portfolio floating MTM, daily loss buffer, and active stop threat warnings.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showPortfolioRiskBanner)}
                    onChange={() => handleToggle('showPortfolioRiskBanner')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Gross vs Net MTM & Cost Breakdown
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Shows brokerage, exchange transaction fees, STT, and net take-home profit.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showCostBreakdown)}
                    onChange={() => handleToggle('showCostBreakdown')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Intra-Trade Sparklines
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Real-time tick mini-charts displaying price trajectory since entry.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showSparklines)}
                    onChange={() => handleToggle('showSparklines')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Multi-Target Scaling Ladder
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Milestones for T1, T2, T3 partial profit-taking and trailing stops.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showScalingLadder)}
                    onChange={() => handleToggle('showScalingLadder')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Peak Profit Giveback Meter
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Real-time giveback percentage gauge protecting gains from leaking away.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showGivebackMeter)}
                    onChange={() => handleToggle('showGivebackMeter')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Next-Action Tactical Advice Strips
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Algorithmic guidance banners recommending moves (e.g. Move SL to BE, Scale 50%).
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showActionHints)}
                    onChange={() => handleToggle('showActionHints')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Quick Cockpit Action Buttons
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      1-click execution buttons: Market Exit, Lock BE+Fees, Scale 50%, Take Profit.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showQuickActionButtons)}
                    onChange={() => handleToggle('showQuickActionButtons')}
                    color="primary"
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ pr: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Options Greeks & IV Card
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                      Real-time Delta, Theta, Gamma, Vega, and Implied Volatility for F&O contracts.
                    </Typography>
                  </Box>
                  <Switch
                    checked={Boolean(form.showOptionsGreeks)}
                    onChange={() => handleToggle('showOptionsGreeks')}
                    color="primary"
                  />
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: `1px solid ${muiTheme.palette.divider}`,
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<RestartAltRoundedIcon />}
          onClick={handleReset}
          sx={{ fontWeight: 600, textTransform: 'none' }}
        >
          Reset to Institutional Defaults
        </Button>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={onClose}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<CheckRoundedIcon />}
            onClick={handleSave}
            disabled={isSaving}
            sx={{ fontWeight: 700, textTransform: 'none', px: 2.5 }}
          >
            {isSaving ? 'Saving...' : 'Apply & Save Settings'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
