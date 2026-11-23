import React from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  TextField,
  Divider,
  Switch,
  Alert,
  useTheme as useMuiTheme,
  alpha,
} from '@mui/material';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import LockClockRounded from '@mui/icons-material/LockClockRounded';
import FlashOnRounded from '@mui/icons-material/FlashOnRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { HelpHint } from '../../components/help/index.js';

export interface RiskGuardrailsTabProps {
  currSym: string;
  maxDailyLoss: number;
  setMaxDailyLoss: (val: number) => void;
  maxDailyTrades: number;
  setMaxDailyTrades: (val: number) => void;
  maxOpenTrades: number;
  setMaxOpenTrades: (val: number) => void;
  maxRiskPerTradePercent: number;
  setMaxRiskPerTradePercent: (val: number) => void;
  revengeTradingMinutes: number;
  setRevengeTradingMinutes: (val: number) => void;
  hardDisciplineLockoutEnabled: boolean;
  setHardDisciplineLockoutEnabled: (val: boolean) => void;
  hardDisciplineLockoutDurationMins: number;
  setHardDisciplineLockoutDurationMins: (val: number) => void;
  enforceTelegramOrderGuardrails: boolean;
  setEnforceTelegramOrderGuardrails: (val: boolean) => void;
  enforceAdaptiveDayRiskGuardrails: boolean;
  setEnforceAdaptiveDayRiskGuardrails: (val: boolean) => void;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  onSave: (e: React.FormEvent) => void;
}

export function RiskGuardrailsTab({
  currSym,
  maxDailyLoss,
  setMaxDailyLoss,
  maxDailyTrades,
  setMaxDailyTrades,
  maxOpenTrades,
  setMaxOpenTrades,
  maxRiskPerTradePercent,
  setMaxRiskPerTradePercent,
  revengeTradingMinutes,
  setRevengeTradingMinutes,
  hardDisciplineLockoutEnabled,
  setHardDisciplineLockoutEnabled,
  hardDisciplineLockoutDurationMins,
  setHardDisciplineLockoutDurationMins,
  enforceTelegramOrderGuardrails,
  setEnforceTelegramOrderGuardrails,
  enforceAdaptiveDayRiskGuardrails,
  setEnforceAdaptiveDayRiskGuardrails,
  isSaving,
  saveSuccess,
  saveError,
  onSave,
}: RiskGuardrailsTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'grey.50', border: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShieldRounded sx={{ color: 'primary.main', fontSize: 22 }} />
            Capital Preservation & Discipline Guardrails
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enforced across all charts, trade entries, live watchers, and automated execution pipelines.
          </Typography>
        </Box>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSaving}
          sx={{ fontWeight: 700, px: 3 }}
        >
          {isSaving ? 'Saving Guardrails...' : 'Save Guardrails'}
        </Button>
      </Box>

      {saveSuccess && (
        <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />}>
          Discipline guardrails and remote order policies saved successfully.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error">
          {saveError}
        </Alert>
      )}

      {/* Card 1: Capital & Daily Exposure Guardrails */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShieldRounded sx={{ color: 'primary.main' }} />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Capital & Daily Exposure Limits
                </Typography>
                <HelpHint hintKey="settings.riskGuardrails" />
              </Box>
              <Typography variant="body2" color="text.secondary">
                Parameters used by the financial engine for mistake detection, revenge trade warnings, and daily loss alerts.
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label={`Max Daily Loss Limit (${currSym}) *`}
                type="number"
                size="small"
                required
                fullWidth
                value={maxDailyLoss}
                onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                helperText="Critical warning banner fires across all tabs when breached"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Max Trades Per Day *"
                type="number"
                size="small"
                required
                fullWidth
                value={maxDailyTrades}
                onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
                helperText="Flags overtrading beyond this threshold"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Max Concurrent Open Positions *"
                type="number"
                size="small"
                required
                fullWidth
                value={maxOpenTrades}
                onChange={(e) => setMaxOpenTrades(Number(e.target.value))}
                helperText="Max allowed simultaneous open risk exposures"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Max Risk Per Trade (% of Capital) *"
                type="number"
                size="small"
                required
                fullWidth
                value={maxRiskPerTradePercent}
                onChange={(e) => setMaxRiskPerTradePercent(Number(e.target.value))}
                helperText="Flags oversized positions as discipline mistakes"
                slotProps={{ htmlInput: { step: '0.1', min: '0.1' } }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 2: Psychological Discipline & Hard Lockout */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockClockRounded sx={{ color: 'error.main' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Psychological Discipline & Hard Lockout
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Anti-tilt mechanisms that protect your capital from emotional spirals and revenge trading.
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={2.5}>
            {/* Revenge Trading Cooldown */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Revenge Trading Cooldown Window (Minutes) *"
                type="number"
                size="small"
                required
                fullWidth
                value={revengeTradingMinutes}
                onChange={(e) => setRevengeTradingMinutes(Number(e.target.value))}
                helperText="Flags trades entered with equal or larger size within N minutes of an emotional loss"
              />
            </Grid>

            {/* Hard Discipline Lockout */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: hardDisciplineLockoutEnabled ? 'error.main' : 'divider', bgcolor: hardDisciplineLockoutEnabled ? alpha('#EF4444', 0.08) : 'transparent' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LockClockRounded sx={{ color: hardDisciplineLockoutEnabled ? 'error.main' : 'text.secondary', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Hard Discipline Lockout Mode
                    </Typography>
                  </Box>
                  <Switch
                    checked={hardDisciplineLockoutEnabled}
                    onChange={(e) => setHardDisciplineLockoutEnabled(e.target.checked)}
                    color="error"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Opt-in hard guardrail: If daily loss limit is breached or 3 consecutive losses occur, new trade logging and entry actions are hard-locked for the cooldown window to eliminate revenge trading.
                </Typography>
                {hardDisciplineLockoutEnabled && (
                  <TextField
                    size="small"
                    type="number"
                    label="Lockout Cooldown (Minutes)"
                    value={hardDisciplineLockoutDurationMins}
                    onChange={(e) => setHardDisciplineLockoutDurationMins(Math.max(15, Number(e.target.value)))}
                    sx={{ width: 220 }}
                    helperText="Recommended: 45–60 mins"
                  />
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 3: Remote & Telegram Order Enforcement Policies */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlashOnRounded sx={{ color: 'primary.main' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Remote & Telegram Order Execution Policies
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Control whether discipline guardrails and dynamic daily limits strictly block 1-tap orders placed from Telegram.
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={2}>
            {/* Telegram Order Pre-Trade Guardrails */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: enforceTelegramOrderGuardrails ? 'success.main' : 'warning.main',
                  bgcolor: enforceTelegramOrderGuardrails
                    ? (isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.04)')
                    : (isDark ? 'rgba(234, 179, 8, 0.08)' : 'rgba(234, 179, 8, 0.04)'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Telegram Order Guardrails
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {enforceTelegramOrderGuardrails
                      ? '🛡️ ENFORCED: Stale quotes, max positions, per-trade risk, revenge cooldown'
                      : '⚡ BYPASSED (OPTIONAL): 1-tap orders execute without being blocked'}
                  </Typography>
                </Box>
                <Switch
                  checked={enforceTelegramOrderGuardrails}
                  onChange={(e) => setEnforceTelegramOrderGuardrails(e.target.checked)}
                  color="success"
                />
              </Box>
            </Grid>

            {/* Adaptive Day-Risk Guardrails */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: enforceAdaptiveDayRiskGuardrails ? 'info.main' : 'warning.main',
                  bgcolor: enforceAdaptiveDayRiskGuardrails
                    ? (isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(14, 165, 233, 0.04)')
                    : (isDark ? 'rgba(234, 179, 8, 0.08)' : 'rgba(234, 179, 8, 0.04)'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Adaptive Day-Risk Guardrails
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {enforceAdaptiveDayRiskGuardrails
                      ? '📈 ENFORCED: Dynamic daily trade limits, loss limit & defensive lot caps'
                      : '⚡ BYPASSED (OPTIONAL): Adaptive limits do not block trade execution'}
                  </Typography>
                </Box>
                <Switch
                  checked={enforceAdaptiveDayRiskGuardrails}
                  onChange={(e) => setEnforceAdaptiveDayRiskGuardrails(e.target.checked)}
                  color="info"
                />
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
          {isSaving ? 'Saving Guardrails...' : 'Save Guardrails'}
        </Button>
      </Box>
    </form>
  );
}

