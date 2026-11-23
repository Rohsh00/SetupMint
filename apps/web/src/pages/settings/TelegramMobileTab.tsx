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
  Divider,
  Chip,
  Switch,
  Checkbox,
  FormControlLabel,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse,
  Alert,
  useTheme as useMuiTheme,
  alpha,
} from '@mui/material';
import SendRounded from '@mui/icons-material/SendRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import FlashOnRounded from '@mui/icons-material/FlashOnRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import { soundEngine } from '../../lib/sound-engine.js';

export interface TelegramMobileTabProps {
  telegramAlertsEnabled: boolean;
  setTelegramAlertsEnabled: (val: boolean) => void;
  telegramBotToken: string;
  setTelegramBotToken: (val: string) => void;
  telegramChatId: string;
  setTelegramChatId: (val: string) => void;
  userBotToken?: string;
  userChatId?: string;
  testingTelegram: boolean;
  onTestTelegram: () => void;
  sendingSampleAlert: boolean;
  onSendSampleAlert: () => void;
  hasLiveExecutableAccount: boolean;
  registeringWebhook: boolean;
  onRegisterWebhook: () => void;
  onClearTelegramCredentials: () => void;
  restrictTelegramTradeExecution: boolean;
  setRestrictTelegramTradeExecution: (val: boolean) => void;
  goldDefaultLot: number;
  setGoldDefaultLot: (val: number) => void;
  goldSlPoints: number;
  setGoldSlPoints: (val: number) => void;
  goldRrRatio: number;
  setGoldRrRatio: (val: number) => void;
  ethDefaultLot: number;
  setEthDefaultLot: (val: number) => void;
  ethSlPrice: number;
  setEthSlPrice: (val: number) => void;
  ethRrRatio: number;
  setEthRrRatio: (val: number) => void;
  telegramAttachLiveChart: boolean;
  setTelegramAttachLiveChart: (val: boolean) => void;
  telegramChartTimeframe: string;
  setTelegramChartTimeframe: (val: string) => void;
  telegramAlertEvents: any;
  setTelegramAlertEvents: (val: any) => void;
  goldNewsLeadTimesMinutes: number[];
  setGoldNewsLeadTimesMinutes: (val: number[]) => void;
  goldNewsReminderMinutes: number;
  setGoldNewsReminderMinutes: (val: number) => void;
  goldNewsImpactFilter: 'ALL_GOLD_MOVERS' | 'HIGH_IMPACT_ONLY';
  setGoldNewsImpactFilter: (val: 'ALL_GOLD_MOVERS' | 'HIGH_IMPACT_ONLY') => void;
  customLeadInput: string;
  setCustomLeadInput: (val: string) => void;
  testingGoldNewsAlert: boolean;
  onTestGoldNewsAlert: () => void;
  testingGoldNewsResultAlert: boolean;
  onTestGoldNewsResultAlert: () => void;
  isLoadingCarPlay: boolean;
  carPlaySetup: any;
  copiedVoiceKey: string | null;
  speakingEndpoint: string | null;
  onCopyVoiceUrl: (key: string, url: string) => void;
  onTestCarPlaySpeech: (key: string, url: string) => void;
  onRegenerateCarPlayToken: () => void;
  isRegeneratingToken: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  onSave: (e: React.FormEvent) => void;
}

export function TelegramMobileTab({
  telegramAlertsEnabled,
  setTelegramAlertsEnabled,
  telegramBotToken,
  setTelegramBotToken,
  telegramChatId,
  setTelegramChatId,
  userBotToken,
  userChatId,
  testingTelegram,
  onTestTelegram,
  sendingSampleAlert,
  onSendSampleAlert,
  hasLiveExecutableAccount,
  registeringWebhook,
  onRegisterWebhook,
  onClearTelegramCredentials,
  restrictTelegramTradeExecution,
  setRestrictTelegramTradeExecution,
  goldDefaultLot,
  setGoldDefaultLot,
  goldSlPoints,
  setGoldSlPoints,
  goldRrRatio,
  setGoldRrRatio,
  ethDefaultLot,
  setEthDefaultLot,
  ethSlPrice,
  setEthSlPrice,
  ethRrRatio,
  setEthRrRatio,
  telegramAttachLiveChart,
  setTelegramAttachLiveChart,
  telegramChartTimeframe,
  setTelegramChartTimeframe,
  telegramAlertEvents,
  setTelegramAlertEvents,
  goldNewsLeadTimesMinutes,
  setGoldNewsLeadTimesMinutes,
  setGoldNewsReminderMinutes,
  goldNewsImpactFilter,
  setGoldNewsImpactFilter,
  customLeadInput,
  setCustomLeadInput,
  testingGoldNewsAlert,
  onTestGoldNewsAlert,
  testingGoldNewsResultAlert,
  onTestGoldNewsResultAlert,
  isLoadingCarPlay,
  carPlaySetup,
  copiedVoiceKey,
  speakingEndpoint,
  onCopyVoiceUrl,
  onTestCarPlaySpeech,
  onRegenerateCarPlayToken,
  isRegeneratingToken,
  isSaving,
  saveSuccess,
  saveError,
  onSave,
}: TelegramMobileTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [showCarPlay, setShowCarPlay] = useState(false);

  const hasConfiguredCreds = Boolean(telegramBotToken || userBotToken) && Boolean(telegramChatId || userChatId);

  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'grey.50', border: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendRounded sx={{ color: 'info.main', fontSize: 22 }} />
            Telegram Terminal, Mobile Cockpit & Voice Alerts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Off-screen mobile alerts, 1-tap fast trade execution, MT5 Gold & Crypto presets, and hands-free CarPlay shortcuts.
          </Typography>
        </Box>
        <Button
          type="submit"
          variant="contained"
          color="info"
          disabled={isSaving}
          sx={{ fontWeight: 700, px: 3 }}
        >
          {isSaving ? 'Saving Mobile Settings...' : 'Save Mobile Settings'}
        </Button>
      </Box>

      {saveSuccess && (
        <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />}>
          Telegram alerts and mobile configuration saved successfully.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error">
          {saveError}
        </Alert>
      )}

      {/* Card 1: Telegram Bot Credentials & Remote Terminal */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <SendRounded sx={{ color: hasConfiguredCreds ? 'info.main' : 'text.secondary', fontSize: 24 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Telegram Bot Credentials & Connection
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Two-way remote control: receive loud alerts and interact via buttons (/pnl, /trades, /panic).
                </Typography>
              </Box>
              {hasConfiguredCreds ? (
                <Chip
                  icon={<CheckCircleRounded sx={{ fontSize: '15px !important' }} />}
                  label={telegramAlertsEnabled ? 'Connected & Active' : 'Configured (Alerts Muted)'}
                  color={telegramAlertsEnabled ? 'success' : 'default'}
                  size="small"
                  variant={telegramAlertsEnabled ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700 }}
                />
              ) : (
                <Chip
                  label="Not Configured"
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600, color: 'text.secondary' }}
                />
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: telegramAlertsEnabled ? 'info.main' : 'text.secondary', fontSize: '0.85rem' }}>
                {telegramAlertsEnabled ? 'Alerts Active' : 'Alerts Paused'}
              </Typography>
              <Switch
                checked={telegramAlertsEnabled}
                onChange={(e) => setTelegramAlertsEnabled(e.target.checked)}
                color="info"
              />
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                size="small"
                type="password"
                label="Telegram Bot Token"
                placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                helperText={
                  userBotToken
                    ? 'Token encrypted in database. Leave as •••••••• to keep current token, or paste new one.'
                    : 'Paste your Telegram Bot Token from @BotFather'
                }
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                size="small"
                label="Telegram Chat ID"
                placeholder="e.g. 987654321"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                helperText={userChatId ? `Connected to Chat ID: ${userChatId}` : 'Your numeric Telegram chat ID from @userinfobot'}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pt: 0.5 }}>
                <Button
                  variant="outlined"
                  color="info"
                  size="small"
                  onClick={onTestTelegram}
                  disabled={testingTelegram || !(telegramBotToken || userBotToken) || !(telegramChatId || userChatId)}
                  sx={{ fontWeight: 700, flex: 1, whiteSpace: 'nowrap' }}
                >
                  {testingTelegram ? 'Testing...' : 'Test Link'}
                </Button>
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  onClick={onSendSampleAlert}
                  disabled={sendingSampleAlert || !(telegramBotToken || userBotToken) || !(telegramChatId || userChatId)}
                  sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                  title="Dispatches a realistic formatted risk telemetry card to Telegram"
                >
                  {sendingSampleAlert ? 'Sending...' : 'Sample Alert'}
                </Button>
                {hasLiveExecutableAccount && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    size="small"
                    onClick={onRegisterWebhook}
                    disabled={registeringWebhook || !(telegramBotToken || userBotToken)}
                    sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                    title="Connects two-way buttons and commands to your Telegram Bot"
                  >
                    {registeringWebhook ? 'Configuring...' : 'Set Webhook'}
                  </Button>
                )}
                {(userBotToken || userChatId) && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={onClearTelegramCredentials}
                    sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                    title="Disconnect Telegram and remove stored bot credentials"
                  >
                    Disconnect
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 2: Telegram MT5 Fast Execution Presets (Gold XAUUSD & Ethereum ETHUSD) */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <FlashOnRounded sx={{ fontSize: 22 }} />
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  ⚡ Telegram MT5 Fast-Order Presets (Gold &amp; Ethereum)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Default lot sizing, Stop Loss buffers &amp; Target R:R ratios for instant 1-tap orders sent via Telegram.
                </Typography>
              </Box>
            </Box>
            <Chip
              size="small"
              label="Active on /gold, /eth, /trade"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: '0.72rem' }}
            />
          </Box>

          {/* Execution Lock Toggle */}
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: restrictTelegramTradeExecution
                ? (isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)')
                : (isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.04)'),
              border: '1px solid',
              borderColor: restrictTelegramTradeExecution ? 'error.main' : 'success.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: restrictTelegramTradeExecution ? 'error.main' : 'success.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LockRounded sx={{ fontSize: 18 }} />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Restrict Telegram Trade Execution
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {restrictTelegramTradeExecution
                    ? '🔒 RESTRICTED: New trade placement from Telegram is blocked. Live position defense (SL, BE, Close) remains active.'
                    : '🔓 ALLOWED: Fast 1-tap trade execution from Telegram is active.'}
                </Typography>
              </Box>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={restrictTelegramTradeExecution}
                  onChange={(e) => setRestrictTelegramTradeExecution(e.target.checked)}
                  color="error"
                />
              }
              label={restrictTelegramTradeExecution ? 'Restricted' : 'Allowed'}
              sx={{ m: 0 }}
            />
          </Box>

          {/* Gold & ETH Sizing Cards */}
          <Grid container spacing={2}>
            {/* Gold (XAUUSD) Card */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(234, 179, 8, 0.05)' : 'rgba(254, 240, 138, 0.25)',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(234, 179, 8, 0.35)' : 'rgba(234, 179, 8, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'warning.main', color: '#000', fontWeight: 900, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      Au
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#FDE047' : '#854D0E' }}>
                      Gold (XAUUSD) MT5 Presets
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.secondary' }}>
                    100 oz / Lot (Standard Gold)
                  </Typography>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small"
                      label="Default Lots"
                      type="number"
                      value={goldDefaultLot}
                      onChange={(e) => setGoldDefaultLot(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                      slotProps={{ htmlInput: { step: 'any', min: 0.01, max: 100 } }}
                      helperText="e.g. 0.04 or 0.10 lots"
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small"
                      label="SL Buffer (pts)"
                      type="number"
                      value={goldSlPoints}
                      onChange={(e) => setGoldSlPoints(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                      slotProps={{ htmlInput: { step: 'any', min: 1, max: 1000 } }}
                      helperText={`$${((Number(goldSlPoints) || 0) * 0.10).toFixed(2)}/oz move`}
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small"
                      label="Target R:R"
                      type="number"
                      value={goldRrRatio}
                      onChange={(e) => setGoldRrRatio(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                      slotProps={{ htmlInput: { step: 'any', min: 0.1, max: 50 } }}
                      helperText={`${((Number(goldSlPoints) || 0) * (Number(goldRrRatio) || 0)).toFixed(0)} pts TP`}
                      fullWidth
                    />
                  </Grid>
                </Grid>

                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.85)', border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Per-Order Sizing Preview:
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
                      Max SL Risk: -${((Number(goldSlPoints) || 0) * 10 * (Number(goldDefaultLot) || 0)).toFixed(2)} (-${((Number(goldSlPoints) || 0) * 0.1).toFixed(2)}/oz)
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                      Target Gain: +${((Number(goldSlPoints) || 0) * (Number(goldRrRatio) || 0) * 10 * (Number(goldDefaultLot) || 0)).toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>

            {/* Ethereum (ETHUSD) Card */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(2, 132, 199, 0.05)' : 'rgba(224, 242, 254, 0.3)',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(14, 165, 233, 0.45)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#38BDF8', color: '#000', fontWeight: 900, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      Ξ
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDark ? '#38BDF8' : '#0369A1' }}>
                      Ethereum (ETHUSD) MT5 Presets
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.secondary' }}>
                    1 ETH / Contract
                  </Typography>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small"
                      label="Default Lots"
                      type="number"
                      value={ethDefaultLot}
                      onChange={(e) => setEthDefaultLot(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                      slotProps={{ htmlInput: { step: 'any', min: 0.1, max: 100 } }}
                      helperText="e.g. 1.0 or 2.0 ETH"
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small"
                      label="SL Move ($)"
                      type="number"
                      value={ethSlPrice}
                      onChange={(e) => setEthSlPrice(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                      slotProps={{ htmlInput: { step: 'any', min: 1, max: 1000 } }}
                      helperText={`$${Number(ethSlPrice) || 0} price offset`}
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      size="small"
                      label="Target R:R"
                      type="number"
                      value={ethRrRatio}
                      onChange={(e) => setEthRrRatio(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                      slotProps={{ htmlInput: { step: 'any', min: 0.1, max: 50 } }}
                      helperText={`$${((Number(ethSlPrice) || 0) * (Number(ethRrRatio) || 0)).toFixed(0)} TP`}
                      fullWidth
                    />
                  </Grid>
                </Grid>

                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.85)', border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Per-Order Sizing Preview:
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
                      Max SL Risk: -${((Number(ethSlPrice) || 0) * (Number(ethDefaultLot) || 0)).toFixed(2)}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                      Target Gain: +${((Number(ethSlPrice) || 0) * (Number(ethRrRatio) || 0) * (Number(ethDefaultLot) || 0)).toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 3: Alert Event Subscriptions & Push Notifications */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Subscribed Push Alert Categories
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Select which risk, execution, and economic events dispatch audible Telegram notifications.
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.stopThreatCritical !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, stopThreatCritical: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🚨 Critical Stop Threats (&lt;25% Runway)</Typography>}
                />
                <Tooltip title="Audition Stop Threat Siren" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playStopThreat()} sx={{ color: 'error.main', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.givebackLeaking !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, givebackLeaking: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600 }}>⚠️ Profit Giveback Reversals (&gt;35% Leak)</Typography>}
                />
                <Tooltip title="Audition Giveback Chime" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playGivebackAlert()} sx={{ color: 'warning.main', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.dailyLossBreached !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, dailyLossBreached: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🛑 Daily Loss Limit Breached</Typography>}
                />
                <Tooltip title="Audition Loss Horn" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playDailyLossAlert()} sx={{ color: 'error.main', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.ladderMilestoneReached !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, ladderMilestoneReached: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🎯 Ladder Target Milestone (T1, T2)</Typography>}
                />
                <Tooltip title="Audition Target Chime" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playTargetHit()} sx={{ color: 'success.main', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.tradeOpened !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, tradeOpened: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🚀 Trade Opened &amp; Risk Sizing</Typography>}
                />
                <Tooltip title="Audition Trade Fill" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playOrderExecuted()} sx={{ color: 'primary.main', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.tradeClosed !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, tradeClosed: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🏁 Trade Closed &amp; Excursion Summary</Typography>}
                />
                <Tooltip title="Audition Resolution Bell" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playTradeClosed()} sx={{ color: 'secondary.main', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.goldNewsReminder !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, goldNewsReminder: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600, color: '#EAB308' }}>👑 Gold Catalyst News Reminder</Typography>}
                />
                <Tooltip title="Audition Gold News Horn" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playNewsAlert()} sx={{ color: '#EAB308', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={telegramAlertEvents.goldNewsResultAlert !== false}
                      onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, goldNewsResultAlert: e.target.checked })}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 600, color: '#10B981' }}>⚡ Post-News Result Flash</Typography>}
                />
                <Tooltip title="Audition Result Flash" arrow>
                  <IconButton size="small" onClick={() => soundEngine.playNewsAlert()} sx={{ color: '#10B981', p: 0.5 }}>
                    <VolumeUpRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={telegramAlertEvents.eodSummaryDigest !== false}
                    onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, eodSummaryDigest: e.target.checked })}
                  />
                }
                label={<Typography variant="caption" sx={{ fontWeight: 600 }}>📊 Daily EOD Session Digest (15:35 IST)</Typography>}
              />
            </Grid>
          </Grid>

          {/* Chart Snapshots & Timeframe */}
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Attach Live Chart Snapshot
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Includes entry, target, and trailing stop overlays in alert images
                  </Typography>
                </Box>
                <Switch
                  checked={telegramAttachLiveChart}
                  onChange={(e) => setTelegramAttachLiveChart(e.target.checked)}
                />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                size="small"
                label="Default Chart Timeframe"
                fullWidth
                value={telegramChartTimeframe}
                onChange={(e) => setTelegramChartTimeframe(e.target.value)}
                helperText="Tap [⏱️ 1m], [⏱️ 5m], [⏱️ 15m] in Telegram to change anytime"
              >
                <MenuItem value="1">⏱️ 1m (1 Minute Micro)</MenuItem>
                <MenuItem value="3">⏱️ 3m (3 Minutes Scalp)</MenuItem>
                <MenuItem value="5">⏱️ 5m (5 Minutes — Recommended)</MenuItem>
                <MenuItem value="15">⏱️ 15m (15 Minutes Intraday)</MenuItem>
                <MenuItem value="30">⏱️ 30m (30 Minutes Swing)</MenuItem>
                <MenuItem value="60">⏱️ 1h (1 Hour Trend)</MenuItem>
                <MenuItem value="D">📅 1D (Daily Macro)</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 4: Gold Macro Catalyst News Reminders */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'warning.main', color: '#000', fontWeight: 900, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Au
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: isDark ? '#FDE047' : '#854D0E' }}>
                  Gold (XAUUSD) Macro Catalyst News Radar
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Automated warnings before major US releases (CPI, NFP, FOMC, GDP) to prevent slippage sweeps.
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={onTestGoldNewsAlert}
                disabled={testingGoldNewsAlert || !hasConfiguredCreds}
                sx={{ fontWeight: 700, textTransform: 'none', height: 28 }}
              >
                {testingGoldNewsAlert ? 'Sending...' : 'Test News Warning'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="success"
                onClick={onTestGoldNewsResultAlert}
                disabled={testingGoldNewsResultAlert || !hasConfiguredCreds}
                sx={{ fontWeight: 700, textTransform: 'none', height: 28 }}
              >
                {testingGoldNewsResultAlert ? 'Sending...' : 'Test Result Flash'}
              </Button>
            </Box>
          </Box>

          {/* Lead times picker */}
          <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'grey.100', border: 1, borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
              ⏰ Alert Lead Times (Notification stages before economic release):
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {[5, 10, 15, 30, 45, 60, 120].map((mins) => {
                const isSelected = goldNewsLeadTimesMinutes.includes(mins);
                return (
                  <Chip
                    key={mins}
                    label={`${mins}m before`}
                    clickable
                    color={isSelected ? 'warning' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    size="small"
                    onClick={() => {
                      let nextTimes: number[];
                      if (isSelected) {
                        nextTimes = goldNewsLeadTimesMinutes.filter((m) => m !== mins);
                        if (nextTimes.length === 0) nextTimes = [15];
                      } else {
                        nextTimes = [...goldNewsLeadTimesMinutes, mins].sort((a, b) => b - a);
                      }
                      setGoldNewsLeadTimesMinutes(nextTimes);
                      setGoldNewsReminderMinutes(nextTimes[0] || 15);
                    }}
                    sx={{ fontWeight: isSelected ? 800 : 500 }}
                  />
                );
              })}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                type="number"
                placeholder="Custom mins"
                value={customLeadInput}
                onChange={(e) => setCustomLeadInput(e.target.value)}
                sx={{ width: 140 }}
                slotProps={{ htmlInput: { min: 1, max: 720, style: { fontSize: '0.8rem', padding: '4px 8px' } } }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const val = parseInt(customLeadInput, 10);
                  if (Number.isFinite(val) && val > 0 && val <= 720) {
                    if (!goldNewsLeadTimesMinutes.includes(val)) {
                      const nextTimes = [...goldNewsLeadTimesMinutes, val].sort((a, b) => b - a);
                      setGoldNewsLeadTimesMinutes(nextTimes);
                      setGoldNewsReminderMinutes(nextTimes[0] || 15);
                    }
                    setCustomLeadInput('');
                  }
                }}
                disabled={!customLeadInput}
                sx={{ height: 30, fontWeight: 700, textTransform: 'none' }}
              >
                + Add Custom
              </Button>

              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Intensity:
                </Typography>
                <Chip
                  label="All Gold Movers"
                  clickable
                  size="small"
                  color={goldNewsImpactFilter === 'ALL_GOLD_MOVERS' ? 'warning' : 'default'}
                  variant={goldNewsImpactFilter === 'ALL_GOLD_MOVERS' ? 'filled' : 'outlined'}
                  onClick={() => setGoldNewsImpactFilter('ALL_GOLD_MOVERS')}
                  sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                />
                <Chip
                  label="High-Impact Only"
                  clickable
                  size="small"
                  color={goldNewsImpactFilter === 'HIGH_IMPACT_ONLY' ? 'warning' : 'default'}
                  variant={goldNewsImpactFilter === 'HIGH_IMPACT_ONLY' ? 'filled' : 'outlined'}
                  onClick={() => setGoldNewsImpactFilter('HIGH_IMPACT_ONLY')}
                  sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                />
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Collapsible Section 5: Interactive Mobile Bot Commands Cheatsheet */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowCheatsheet(!showCheatsheet)}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              📱 Two-Way Interactive Bot Commands Cheatsheet
            </Typography>
            <IconButton size="small">
              {showCheatsheet ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            </IconButton>
          </Box>

          <Collapse in={showCheatsheet}>
            <Grid container spacing={1.5} sx={{ pt: 1 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'grey.100', border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#EAB308', display: 'block' }}>
                    /gold [buy|sell] [lots]
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    1-tap Gold order with your saved presets
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'grey.100', border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#38BDF8', display: 'block' }}>
                    /eth [buy|sell] [lots]
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    1-tap Ethereum contract order
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'grey.100', border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'success.main', display: 'block' }}>
                    /pnl or /trades
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Live floating PnL, Net R &amp; day total
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'grey.100', border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'error.main', display: 'block' }}>
                    /panic
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Emergency market-exit for all open positions
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Collapse>
        </CardContent>
      </Card>

      {/* Collapsible Section 6: In-Car & Apple CarPlay Siri Voice Shortcuts */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowCarPlay(!showCarPlay)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DirectionsCarRounded sx={{ color: 'primary.main', fontSize: 22 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                In-Car &amp; Apple CarPlay Siri Voice Briefings
              </Typography>
              <Chip label="Hands-Free Driving" size="small" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
            </Box>
            <IconButton size="small">
              {showCarPlay ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            </IconButton>
          </Box>

          <Collapse in={showCarPlay}>
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Query real-time spot prices and check positions hands-free using Siri over Bluetooth or Apple CarPlay.
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  color="inherit"
                  startIcon={<SyncRounded fontSize="small" />}
                  onClick={onRegenerateCarPlayToken}
                  disabled={isRegeneratingToken}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Regenerate CarPlay Key
                </Button>
              </Box>

              {isLoadingCarPlay ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="caption" color="text.secondary">Loading your in-car voice endpoints...</Typography>
                </Box>
              ) : carPlaySetup?.endpoints ? (
                <Grid container spacing={2}>
                  {/* Endpoint 1: Live Gold Price */}
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Card variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', bgcolor: 'background.paper' }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <VolumeUpRounded sx={{ color: '#EAB308', fontSize: 20 }} />
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Live Gold Voice Quote
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                          Phrase: <em>&quot;Hey Siri, Gold Price&quot;</em>
                        </Typography>
                        <Box
                          onClick={() => onCopyVoiceUrl('goldPrice', carPlaySetup.endpoints.goldPriceVoice)}
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'grey.100',
                            mb: 1.5,
                            cursor: 'pointer',
                            userSelect: 'all',
                            border: '1px solid transparent',
                            '&:hover': { borderColor: 'primary.main' },
                          }}
                          title="Click to copy full URL"
                        >
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all', display: 'block' }}>
                            {carPlaySetup.endpoints.goldPriceVoice}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          fullWidth
                          startIcon={copiedVoiceKey === 'goldPrice' ? <CheckRounded fontSize="small" /> : <ContentCopyRounded fontSize="small" />}
                          onClick={() => onCopyVoiceUrl('goldPrice', carPlaySetup.endpoints.goldPriceVoice)}
                          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          {copiedVoiceKey === 'goldPrice' ? 'Copied' : 'Copy Siri Link'}
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={() => onTestCarPlaySpeech('goldPrice', carPlaySetup.endpoints.goldPriceVoice)}
                          disabled={speakingEndpoint === 'goldPrice'}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 70 }}
                        >
                          {speakingEndpoint === 'goldPrice' ? 'Speaking...' : 'Test Voice'}
                        </Button>
                      </Box>
                    </Card>
                  </Grid>

                  {/* Endpoint 2: Open Trades Briefing */}
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Card variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', bgcolor: 'background.paper' }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <VolumeUpRounded sx={{ color: 'info.main', fontSize: 20 }} />
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Active Positions Voice Briefing
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                          Phrase: <em>&quot;Hey Siri, Active Trades&quot;</em>
                        </Typography>
                        <Box
                          onClick={() => onCopyVoiceUrl('trades', carPlaySetup.endpoints.openTradesVoice)}
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'grey.100',
                            mb: 1.5,
                            cursor: 'pointer',
                            userSelect: 'all',
                            border: '1px solid transparent',
                            '&:hover': { borderColor: 'info.main' },
                          }}
                          title="Click to copy full URL"
                        >
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all', display: 'block' }}>
                            {carPlaySetup.endpoints.openTradesVoice}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          fullWidth
                          startIcon={copiedVoiceKey === 'trades' ? <CheckRounded fontSize="small" /> : <ContentCopyRounded fontSize="small" />}
                          onClick={() => onCopyVoiceUrl('trades', carPlaySetup.endpoints.openTradesVoice)}
                          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          {copiedVoiceKey === 'trades' ? 'Copied' : 'Copy Siri Link'}
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="info"
                          onClick={() => onTestCarPlaySpeech('trades', carPlaySetup.endpoints.openTradesVoice)}
                          disabled={speakingEndpoint === 'trades'}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 70 }}
                        >
                          {speakingEndpoint === 'trades' ? 'Speaking...' : 'Test Voice'}
                        </Button>
                      </Box>
                    </Card>
                  </Grid>

                  {/* Endpoint 3: Full Market Briefing */}
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Card variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', bgcolor: 'background.paper' }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <VolumeUpRounded sx={{ color: 'success.main', fontSize: 20 }} />
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Full In-Car Briefing
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                          Phrase: <em>&quot;Hey Siri, Market Briefing&quot;</em>
                        </Typography>
                        <Box
                          onClick={() => onCopyVoiceUrl('briefing', carPlaySetup.endpoints.marketBriefingVoice)}
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'grey.100',
                            mb: 1.5,
                            cursor: 'pointer',
                            userSelect: 'all',
                            border: '1px solid transparent',
                            '&:hover': { borderColor: 'success.main' },
                          }}
                          title="Click to copy full URL"
                        >
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all', display: 'block' }}>
                            {carPlaySetup.endpoints.marketBriefingVoice}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          fullWidth
                          startIcon={copiedVoiceKey === 'briefing' ? <CheckRounded fontSize="small" /> : <ContentCopyRounded fontSize="small" />}
                          onClick={() => onCopyVoiceUrl('briefing', carPlaySetup.endpoints.marketBriefingVoice)}
                          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          {copiedVoiceKey === 'briefing' ? 'Copied' : 'Copy Siri Link'}
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => onTestCarPlaySpeech('briefing', carPlaySetup.endpoints.marketBriefingVoice)}
                          disabled={speakingEndpoint === 'briefing'}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 70 }}
                        >
                          {speakingEndpoint === 'briefing' ? 'Speaking...' : 'Test Voice'}
                        </Button>
                      </Box>
                    </Card>
                  </Grid>
                </Grid>
              ) : null}
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      {/* Bottom Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, pt: 1 }}>
        <Button
          type="submit"
          variant="contained"
          color="info"
          disabled={isSaving}
          sx={{ fontWeight: 700, px: 3 }}
        >
          {isSaving ? 'Saving Mobile Settings...' : 'Save Mobile Settings'}
        </Button>
      </Box>
    </form>
  );
}
