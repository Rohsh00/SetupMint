import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  TextField,
  Select,
  FormControl,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Chip,
  Switch,
  CircularProgress,
  Alert,
  FormControlLabel,
  Collapse,
  IconButton,
  useTheme as useMuiTheme,
} from '@mui/material';
import PersonRounded from '@mui/icons-material/PersonRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import LaptopRounded from '@mui/icons-material/LaptopRounded';
import PhoneAndroidRounded from '@mui/icons-material/PhoneAndroidRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import SettingsBrightnessRounded from '@mui/icons-material/SettingsBrightnessRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import PsychologyRounded from '@mui/icons-material/PsychologyRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { ILiveWatcherDisplaySettings } from '@tradevault/shared';
import { AiQuotaMonitorCard } from './AiQuotaMonitorCard.js';

function parseUserAgent(ua?: string): { browser: string; os: string; full: string; isMobile: boolean } {
  if (!ua) return { browser: 'Unknown Browser', os: 'Unknown Device', full: 'Web Session (Unknown Device)', isMobile: false };

  let os = 'Unknown OS';
  let isMobile = false;
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad|ipod/i.test(ua)) { os = 'iOS'; isMobile = true; }
  else if (/android/i.test(ua)) { os = 'Android'; isMobile = true; }
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  return { browser, os, full: `${browser} on ${os}`, isMobile };
}

export interface ProfileSystemTabProps {
  name: string;
  setName: (val: string) => void;
  email: string;
  selectedScopeValue: string;
  setScopeValue: (val: string) => void;
  personalAccounts: any[];
  propAccounts: any[];
  baseCurrency: string;
  setBaseCurrency: (val: string) => void;
  theme: string;
  setTheme: (val: any) => void;
  showHelpHints: boolean;
  setShowHelpHints: (val: boolean) => void;
  displaySettings: ILiveWatcherDisplaySettings;
  setDisplaySettings: (val: any) => void;
  onSaveDisplaySettings: () => void;
  currentPassword: string;
  setCurrentPassword: (val: string) => void;
  newPassword: string;
  setNewPassword: (val: string) => void;
  passwordMsg: { type: 'success' | 'error'; text: string } | null;
  onProfileSubmit: (e: React.FormEvent) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  isSavingProfile: boolean;
  profileSuccess: boolean;
  profileError: string | null;
  isChangingPassword: boolean;
  activeSessions: any[];
  isLoadingSessions: boolean;
  onRevokeSession: (id: string) => void;
  isRevokingSession: boolean;
  onLogoutAll: () => void;
  isLoggingOutAll: boolean;
  onLogout: () => void;
  isLoggingOut: boolean;
  systemStatus: any;
  geminiApiKey: string;
  setGeminiApiKey: (val: string) => void;
  aiModel?: string;
  setAiModel?: (val: string) => void;
  aiEnabled: boolean;
  setAiEnabled: (val: boolean) => void;
  autoAnalyzeTrades?: boolean;
  setAutoAnalyzeTrades?: (val: boolean) => void;
  autoApplyTradeDetails?: boolean;
  setAutoApplyTradeDetails?: (val: boolean) => void;
  hasGeminiKey: boolean;
  onClearGeminiKey?: () => void;
  onTestGemini?: (keyToTest?: string) => void;
  isTestingGemini?: boolean;
  geminiTestResult?: {
    success: boolean;
    model?: string;
    latencyMs?: number;
    message?: string;
    error?: string;
  } | null;
}

export function ProfileSystemTab({
  name,
  setName,
  email,
  selectedScopeValue,
  setScopeValue,
  personalAccounts,
  propAccounts,
  baseCurrency,
  setBaseCurrency,
  theme,
  setTheme,
  showHelpHints,
  setShowHelpHints,
  displaySettings,
  setDisplaySettings,
  onSaveDisplaySettings,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  passwordMsg,
  onProfileSubmit,
  onPasswordSubmit,
  isSavingProfile,
  profileSuccess,
  profileError,
  isChangingPassword,
  activeSessions,
  isLoadingSessions,
  onRevokeSession,
  isRevokingSession,
  onLogoutAll,
  isLoggingOutAll,
  onLogout,
  isLoggingOut,
  systemStatus,
  geminiApiKey,
  setGeminiApiKey,
  aiModel = 'gemini-2.5-flash',
  setAiModel,
  aiEnabled,
  setAiEnabled,
  autoAnalyzeTrades = true,
  setAutoAnalyzeTrades,
  autoApplyTradeDetails = false,
  setAutoApplyTradeDetails,
  hasGeminiKey,
  onClearGeminiKey,
  onTestGemini,
  isTestingGemini = false,
  geminiTestResult,
}: ProfileSystemTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const [showDisplayPrefs, setShowDisplayPrefs] = useState(false);

  const sysData = systemStatus?.data || systemStatus;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Profile & Password Grid */}
      <Grid container spacing={2.5}>
        {/* Profile Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonRounded sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Trader Profile & Preferences
                </Typography>
              </Box>

              <form onSubmit={onProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <TextField
                  label="Full Name *"
                  size="small"
                  required
                  fullWidth
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <TextField
                  label="Email Address"
                  size="small"
                  disabled
                  fullWidth
                  value={email}
                  helperText="Local database login identity (read-only)"
                  slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
                />

                <TextField
                  select
                  label="Default Trading Mode (Saved to Account)"
                  size="small"
                  fullWidth
                  value={
                    selectedScopeValue.startsWith('PROP_FIRM')
                      ? 'PROP_FIRM:ALL'
                      : selectedScopeValue.startsWith('TYPE:LIVE')
                      ? 'TYPE:LIVE'
                      : 'ALL'
                  }
                  onChange={(e) => setScopeValue(e.target.value)}
                  helperText="Automatically scopes all pages, charts, and analytics on login"
                >
                  <MenuItem value="ALL">🌐 All Accounts (Consolidated)</MenuItem>
                  <MenuItem value="TYPE:LIVE">
                    💼 Normal / Personal Account Only{personalAccounts.length === 1 ? ` (${personalAccounts[0].name})` : ''}
                  </MenuItem>
                  <MenuItem value="PROP_FIRM:ALL">
                    🏆 Prop Firm Mode Only{propAccounts.length === 1 ? ` (${propAccounts[0].name})` : ''}
                  </MenuItem>
                </TextField>

                <TextField
                  select
                  label="Default Base Currency"
                  size="small"
                  fullWidth
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  <MenuItem value="INR">Indian Rupee (INR)</MenuItem>
                  <MenuItem value="USD">US Dollar (USD)</MenuItem>
                  <MenuItem value="EUR">Euro (EUR)</MenuItem>
                  <MenuItem value="GBP">British Pound (GBP)</MenuItem>
                  <MenuItem value="AED">UAE Dirham (AED)</MenuItem>
                </TextField>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Theme Mode
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    fullWidth
                    size="small"
                    value={theme}
                    onChange={(_, val) => val && setTheme(val)}
                  >
                    <ToggleButton value="dark" sx={{ py: 0.75, fontWeight: 600, gap: 0.5 }}>
                      <DarkModeRounded sx={{ fontSize: 16 }} />
                      Dark
                    </ToggleButton>
                    <ToggleButton value="light" sx={{ py: 0.75, fontWeight: 600, gap: 0.5 }}>
                      <LightModeRounded sx={{ fontSize: 16 }} />
                      Light
                    </ToggleButton>
                    <ToggleButton value="system" sx={{ py: 0.75, fontWeight: 600, gap: 0.5 }}>
                      <SettingsBrightnessRounded sx={{ fontSize: 16 }} />
                      System
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Show Contextual Help Hints
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Display interactive tooltips and calculation explainers
                    </Typography>
                  </Box>
                  <Switch
                    checked={showHelpHints}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setShowHelpHints(val);
                      localStorage.setItem('tv_show_help_hints', String(val));
                      window.dispatchEvent(new Event('tv_help_hints_changed'));
                    }}
                  />
                </Box>

                {profileSuccess && (
                  <Alert severity="success" icon={<CheckCircleRounded />}>
                    Profile updated successfully
                  </Alert>
                )}

                {profileError && (
                  <Alert severity="error">
                    {profileError}
                  </Alert>
                )}

                <Box sx={{ pt: 1 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={isSavingProfile}
                    sx={{ fontWeight: 600, px: 3 }}
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Preferences'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* Password Security Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockRounded sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Security & Password
                </Typography>
              </Box>

              <form onSubmit={onPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <TextField
                  label="Current Password *"
                  type="password"
                  size="small"
                  required
                  fullWidth
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />

                <TextField
                  label="New Password (Min 8 chars) *"
                  type="password"
                  size="small"
                  required
                  fullWidth
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  slotProps={{ htmlInput: { minLength: 8 } }}
                />

                {passwordMsg && (
                  <Alert severity={passwordMsg.type === 'success' ? 'success' : 'error'}>
                    {passwordMsg.text}
                  </Alert>
                )}

                <Box sx={{ pt: 1 }}>
                  <Button
                    type="submit"
                    variant="outlined"
                    color="inherit"
                    disabled={isChangingPassword}
                    sx={{ fontWeight: 600, px: 3 }}
                  >
                    {isChangingPassword ? 'Updating...' : 'Change Password'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* AI Trading Coach Configuration Card */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined" sx={{ p: 1, borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PsychologyRounded sx={{ color: 'primary.main' }} />
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      AI Trading Coach Configuration
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Powers institutional post-session debriefs and psychological coaching
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  size="small"
                  label={hasGeminiKey ? 'Gemini Flash (Active)' : 'Quant Engine (Free Built-in)'}
                  sx={{
                    fontWeight: 700,
                    bgcolor: hasGeminiKey ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: hasGeminiKey ? '#c084fc' : '#10b981',
                  }}
                />
              </Box>

              <Alert severity="info" sx={{ borderRadius: 1.5, py: 0.5 }}>
                <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.5 }}>
                  <b>100% Free Integration:</b> Google provides a free tier for Gemini with <b>1,500 free requests per day</b> (zero credit card or subscription required). If left blank, SetupMint automatically runs the built-in <b>Deterministic Quant Coach</b> at ₹0.
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Google Gemini API Key (Free Tier)
                    </Typography>
                    {hasGeminiKey && onClearGeminiKey && (
                      <Button
                        size="small"
                        color="error"
                        onClick={onClearGeminiKey}
                        sx={{ fontSize: '0.7rem', py: 0, textTransform: 'none', minWidth: 'auto' }}
                      >
                        Disconnect Key
                      </Button>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                      size="small"
                      fullWidth
                      type="password"
                      placeholder={hasGeminiKey ? '•••••••••••••••••••• (API Key Active & Stored)' : 'Paste your AI Studio API key (AQ...)'}
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      helperText={
                        hasGeminiKey ? (
                          <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            <CheckCircleRounded sx={{ fontSize: 15 }} /> API Key is securely stored and active. Enter a new key only if you want to replace it.
                          </span>
                        ) : (
                          <span>
                            Get a free key from{' '}
                            <a
                              href="https://aistudio.google.com/app/apikey"
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#6366f1', textDecoration: 'underline' }}
                            >
                              Google AI Studio
                            </a>{' '}
                            (takes 30 seconds). Leave empty to use the built-in Quant Engine.
                          </span>
                        )
                      }
                    />
                    <Button
                      variant="outlined"
                      color="primary"
                      disabled={isTestingGemini || (!geminiApiKey && !hasGeminiKey)}
                      onClick={() => onTestGemini?.(geminiApiKey && !geminiApiKey.startsWith('••') ? geminiApiKey : undefined)}
                      sx={{
                        whiteSpace: 'nowrap',
                        height: 40,
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2,
                        minWidth: 145,
                      }}
                      startIcon={isTestingGemini ? <CircularProgress size={16} color="inherit" /> : <BoltRounded />}
                    >
                      {isTestingGemini ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </Box>

                  {/* Live Connection Status & Verification Feedback */}
                  {isTestingGemini ? (
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        bgcolor: 'action.hover',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <CircularProgress size={18} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Testing Google Gemini API...
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Pinging Google servers with gemini-3.5-flash-lite model
                        </Typography>
                      </Box>
                    </Box>
                  ) : geminiTestResult ? (
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        bgcolor: geminiTestResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid',
                        borderColor: geminiTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        {geminiTestResult.success ? (
                          <CheckCircleRounded sx={{ color: '#10b981', fontSize: 22 }} />
                        ) : (
                          <ErrorOutlineRounded sx={{ color: '#ef4444', fontSize: 22 }} />
                        )}
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: geminiTestResult.success ? '#10b981' : '#ef4444',
                              lineHeight: 1.2,
                            }}
                          >
                            {geminiTestResult.success ? 'Gemini API Operational & Verified' : 'Gemini Connection Test Failed'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                            {geminiTestResult.message || geminiTestResult.error}
                          </Typography>
                        </Box>
                      </Box>
                      {geminiTestResult.success && geminiTestResult.latencyMs !== undefined && (
                        <Chip
                          size="small"
                          label={`${geminiTestResult.model || 'gemini-3.5-flash-lite'} • ${geminiTestResult.latencyMs}ms`}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            bgcolor: 'rgba(16, 185, 129, 0.2)',
                            color: '#10b981',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </Box>
                  ) : hasGeminiKey ? (
                    <Box
                      sx={{
                        p: 1.25,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        bgcolor: 'rgba(168, 85, 247, 0.08)',
                        border: '1px solid',
                        borderColor: 'rgba(168, 85, 247, 0.2)',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircleRounded sx={{ color: '#a855f7', fontSize: 18 }} />
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          API Key is active and ready. Click <b>"Test Connection"</b> above to verify live Google server response.
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={aiModel}
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          bgcolor: 'rgba(168, 85, 247, 0.15)',
                          color: '#c084fc',
                          height: 20,
                        }}
                      />
                    </Box>
                  ) : null}

                  {/* AI Model Selection */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      AI Model Selection
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={aiModel}
                        onChange={(e) => setAiModel?.(e.target.value)}
                        sx={{ borderRadius: 1.5 }}
                      >
                        <MenuItem value="gemini-2.5-flash">
                          Gemini 2.5 Flash — Ultra-Low Latency & High Intelligence (Recommended)
                        </MenuItem>
                        <MenuItem value="gemini-3.8-flash">
                          Gemini 3.8 Flash — High-Performance Multimodal Reasoning
                        </MenuItem>
                        <MenuItem value="gemini-3.5-flash-lite">
                          Gemini 3.5 Flash Lite — Cost-Effective & Lightweight
                        </MenuItem>
                        <MenuItem value="gemini-2.0-flash">
                          Gemini 2.0 Flash — Standard Multimodal Engine
                        </MenuItem>
                        <MenuItem value="gemini-1.5-flash">
                          Gemini 1.5 Flash — Established Standard Flash
                        </MenuItem>
                      </Select>
                    </FormControl>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      All models operate on Google's free tier with zero subscription costs.
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Enable AI Post-Session Coach
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Allows generating session audits on the Daily Journal & Telegram (/coach)
                    </Typography>
                  </Box>
                  <Switch
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Auto-Analyze Every Trade Taken
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Automatically runs AI vision & candlestick price action analysis on new or synced trades
                    </Typography>
                  </Box>
                  <Switch
                    checked={autoAnalyzeTrades}
                    onChange={(e) => setAutoAnalyzeTrades?.(e.target.checked)}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Auto-Fill Trade Details from AI
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Automatically writes detected setup, thesis, confluences, mistakes, and lessons directly into trade records
                    </Typography>
                  </Box>
                  <Switch
                    checked={autoApplyTradeDetails}
                    onChange={(e) => setAutoApplyTradeDetails?.(e.target.checked)}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">
                    Changes take effect immediately upon saving.
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {profileSuccess && (
                      <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CheckCircleRounded sx={{ fontSize: 16 }} /> Saved
                      </Typography>
                    )}
                    <Button
                      variant="contained"
                      color="primary"
                      disabled={isSavingProfile}
                      onClick={onProfileSubmit}
                      sx={{ fontWeight: 600, px: 2.5, py: 0.75 }}
                    >
                      {isSavingProfile ? 'Saving...' : 'Save AI Settings'}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* AI API Quota & Usage Monitor Card */}
          <Box sx={{ mt: 2.5 }}>
            <AiQuotaMonitorCard />
          </Box>
        </Grid>
      </Grid>

      {/* Live Watcher UI & Chart Display Preferences */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowDisplayPrefs(!showDisplayPrefs)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TuneRounded sx={{ color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Live Watcher & Chart Display Card Preferences
              </Typography>
            </Box>
            <IconButton size="small">
              {showDisplayPrefs ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            </IconButton>
          </Box>

          <Collapse in={showDisplayPrefs}>
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Customize which analytical cards, tactical strips, and charts render on the Live Open Trade Watcher cockpit.
              </Typography>

              {/* Chart Display Elements */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: 'primary.main', display: 'block', mb: 1 }}>
                  Candlestick Chart Elements
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={Boolean(displaySettings.autoExpandCharts)}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, autoExpandCharts: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Auto-Expand Candlestick Charts</Typography>
                          <Typography variant="caption" color="text.secondary">If disabled, charts stay collapsed by default</Typography>
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showChartVolume !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showChartVolume: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Show Volume Histogram</Typography>
                          <Typography variant="caption" color="text.secondary">Render volume bars below candles</Typography>
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showChartTradeLevels !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showChartTradeLevels: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Show Trade Price Lines</Typography>
                          <Typography variant="caption" color="text.secondary">Draw Entry, SL, and Target lines on chart</Typography>
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showChartIndicators !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showChartIndicators: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Show OHLC &amp; Live Bar Stats</Typography>
                          <Typography variant="caption" color="text.secondary">Header bar with candle Open, High, Low, Close</Typography>
                        </Box>
                      }
                    />
                  </Grid>
                </Grid>
              </Box>

              <Divider />

              {/* Panel Cards */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: 'success.main', display: 'block', mb: 1 }}>
                  Tactical Cockpit Cards
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showScalingLadder !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showScalingLadder: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Interactive Scaling Ladder</Typography>
                          <Typography variant="caption" color="text.secondary">T1, T2, Runner scaling progress card</Typography>
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showGivebackMeter !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showGivebackMeter: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Peak Profit Giveback Meter</Typography>
                          <Typography variant="caption" color="text.secondary">Guards peak gains from reversing</Typography>
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showOptionsGreeks !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showOptionsGreeks: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Options Greeks &amp; IV Card</Typography>
                          <Typography variant="caption" color="text.secondary">Delta, Theta, Gamma, IV for F&amp;O contracts</Typography>
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={displaySettings.showQuickActionButtons !== false}
                          onChange={(e) => setDisplaySettings({ ...displaySettings, showQuickActionButtons: e.target.checked })}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Quick Cockpit Action Buttons</Typography>
                          <Typography variant="caption" color="text.secondary">Book 50%, Close 100%, Lock BE buttons</Typography>
                        </Box>
                      }
                    />
                  </Grid>
                </Grid>
              </Box>

              <Box sx={{ pt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  onClick={onSaveDisplaySettings}
                  sx={{ fontWeight: 600 }}
                >
                  Save Display Card Preferences
                </Button>
              </Box>
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      {/* Active Sessions & Devices */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShieldRounded sx={{ color: 'primary.main' }} />
                Active Sessions & Device Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Review and manage authenticated browser and mobile sessions
              </Typography>
            </Box>
            {activeSessions.filter((s) => !s.isCurrent).length > 0 && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                disabled={isLoggingOutAll}
                onClick={() => {
                  if (window.confirm('Log out of all other devices?')) {
                    onLogoutAll();
                  }
                }}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                {isLoggingOutAll ? 'Logging out...' : 'Log Out All Other Devices'}
              </Button>
            )}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {isLoadingSessions ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Loading active sessions...
                </Typography>
              </Box>
            ) : (
              activeSessions.map((session) => {
                const uaInfo = parseUserAgent(session.userAgent);
                return (
                  <Box
                    key={session.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.25,
                      borderRadius: 1.5,
                      border: 1,
                      borderColor: session.isCurrent ? 'success.main' : 'divider',
                      bgcolor: session.isCurrent ? (isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)') : 'background.paper',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {uaInfo.isMobile ? <PhoneAndroidRounded sx={{ fontSize: 20 }} /> : <LaptopRounded sx={{ fontSize: 20 }} />}
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {uaInfo.full}
                          </Typography>
                          {session.isCurrent && (
                            <Chip label="Current Device" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem' }}>
                          IP: {session.ipAddress || 'Unknown'} • Last active: {new Date(session.lastUsedAt).toLocaleDateString()}
                        </Typography>
                      </Box>
                    </Box>

                    {!session.isCurrent && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={isRevokingSession}
                        onClick={() => onRevokeSession(session.id)}
                        sx={{ fontSize: '0.75rem', py: 0.25 }}
                      >
                        Revoke
                      </Button>
                    )}
                  </Box>
                );
              })
            )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Button
              variant="outlined"
              color="error"
              disabled={isLoggingOut}
              onClick={onLogout}
              startIcon={<LogoutRounded />}
              sx={{ fontWeight: 700 }}
            >
              {isLoggingOut ? 'Signing Out...' : 'Sign Out of Current Device'}
            </Button>

            {/* Private Cloud System Status Bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip
                icon={<StorageRounded sx={{ fontSize: '0.875rem !important' }} />}
                label={`${sysData?.tradeCount || 0} Trades Stored`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
              />
              <Chip
                label={sysData?.backup?.result === 'OK' ? 'Backup Healthy' : 'Backup Checked'}
                size="small"
                color={sysData?.backup?.result === 'OK' ? 'success' : 'default'}
                variant="outlined"
                sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }}>
                100% Private Cloud • v1.0.0
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

