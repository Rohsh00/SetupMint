import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Alert,
  Divider,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Tooltip,
  useTheme as useMuiTheme,
} from '@mui/material';
import {
  SettingsRounded,
  PersonRounded,
  LockRounded,
  StorageRounded,
  KeyRounded,
  DarkModeRounded,
  LightModeRounded,
  SettingsBrightnessRounded,
  CheckCircleRounded,
  ShieldRounded,
  LogoutRounded,
  LaptopRounded,
  PhoneAndroidRounded,
  DevicesRounded,
  SyncRounded,
  LinkRounded,
  LinkOffRounded,
  VisibilityRounded,
  VisibilityOffRounded,
  CloudDoneRounded,
  ContentCopyRounded,
  OpenInNewRounded,
  TimelineRounded,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';

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

export function SettingsPage() {
  const muiTheme = useMuiTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      queryClient.clear();
      toast.success('Logged out successfully.');
      navigate('/login', { replace: true });
    } catch (err: any) {
      console.error('Logout error:', err);
      toast.error(err?.message || 'Logout failed');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Sessions Query & Mutations
  const { data: activeSessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.auth.sessions(),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: (_, id) => {
      const revoked = activeSessions.find((s) => s.id === id);
      if (revoked?.isCurrent) {
        handleLogout();
      } else {
        queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
        toast.success('Session revoked successfully.');
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to revoke session');
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => api.auth.logoutAll(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
      toast.success('All other devices have been logged out.');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to revoke other sessions');
    },
  });

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency || 'INR');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // FYERS Integration state
  const [fyersAppId, setFyersAppId] = useState('');
  const [fyersSecretKey, setFyersSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [fyersSuccess, setFyersSuccess] = useState(false);
  const [fyersError, setFyersError] = useState<string | null>(null);

  // Risk Guardrails state
  const [maxDailyLoss, setMaxDailyLoss] = useState(user?.riskSettings?.maxDailyLoss ?? 5000);
  const [maxDailyTrades, setMaxDailyTrades] = useState(user?.riskSettings?.maxDailyTrades ?? 6);
  const [maxOpenTrades, setMaxOpenTrades] = useState(user?.riskSettings?.maxOpenTrades ?? 3);
  const [maxRiskPerTradePercent, setMaxRiskPerTradePercent] = useState(user?.riskSettings?.maxRiskPerTradePercent ?? 2.0);
  const [revengeTradingMinutes, setRevengeTradingMinutes] = useState(user?.riskSettings?.revengeTradingMinutes ?? 30);
  const [riskSuccess, setRiskSuccess] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  React.useEffect(() => {
    if (user?.riskSettings) {
      if (user.riskSettings.maxDailyLoss !== undefined) setMaxDailyLoss(user.riskSettings.maxDailyLoss);
      if (user.riskSettings.maxDailyTrades !== undefined) setMaxDailyTrades(user.riskSettings.maxDailyTrades);
      if (user.riskSettings.maxOpenTrades !== undefined) setMaxOpenTrades(user.riskSettings.maxOpenTrades);
      if (user.riskSettings.maxRiskPerTradePercent !== undefined) setMaxRiskPerTradePercent(user.riskSettings.maxRiskPerTradePercent);
      if (user.riskSettings.revengeTradingMinutes !== undefined) setRevengeTradingMinutes(user.riskSettings.revengeTradingMinutes);
    }
  }, [user]);

  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.settings.systemStatus(),
  });

  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
  });

  const fyersData = (fyersStatus as any)?.data ?? fyersStatus;
  const isFyersConfigured = Boolean(fyersData?.isConfigured || fyersData?.appId);
  const isFyersConnected = Boolean(fyersData?.isConnected);
  const fyersRedirectUri =
    fyersData?.redirectUri || `${window.location.origin}/api/v1/integrations/fyers/callback`;

  React.useEffect(() => {
    if (fyersData?.appId) {
      setFyersAppId(fyersData.appId);
    }

    // Detect OAuth callback redirect parameters
    const params = new URLSearchParams(window.location.search);
    if (params.get('fyers') === 'connected') {
      toast.success('FYERS broker account successfully connected! Today\'s trades synced.');
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('fyers') === 'error') {
      const msg = params.get('message') || 'Authentication failed';
      toast.error(`FYERS Connection: ${msg}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fyersData, queryClient]);

  const profileMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile(payload),
    onSuccess: () => {
      refreshUser();
      setProfileError(null);
      setProfileSuccess(true);
      toast.success('Settings saved successfully.');
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update profile';
      setProfileError(msg);
      toast.error(msg);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: any) => api.settings.changePassword(payload),
    onSuccess: () => {
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordMsg(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update password';
      setPasswordMsg({ type: 'error', text: msg });
      toast.error(msg);
    },
  });

  const riskMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile({ riskSettings: payload }),
    onSuccess: () => {
      refreshUser();
      setRiskError(null);
      setRiskSuccess(true);
      toast.success('Discipline & risk guardrails saved successfully.');
      setTimeout(() => setRiskSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update risk guardrails';
      setRiskError(msg);
      toast.error(msg);
    },
  });

  const handleRiskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    riskMutation.mutate({
      maxDailyLoss: Number(maxDailyLoss),
      maxDailyTrades: Number(maxDailyTrades),
      maxOpenTrades: Number(maxOpenTrades),
      maxRiskPerTradePercent: Number(maxRiskPerTradePercent),
      revengeTradingMinutes: Number(revengeTradingMinutes),
    });
  };


  const fyersConfigMutation = useMutation({
    mutationFn: (payload: { appId: string; secretKey?: string }) =>
      api.integrations.fyersConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      setFyersError(null);
      setFyersSuccess(true);
      setFyersSecretKey('');
      toast.success('FYERS credentials saved securely.');
      setTimeout(() => setFyersSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to save FYERS configuration';
      setFyersError(msg);
      toast.error(msg);
    },
  });

  const fyersConnectMutation = useMutation({
    mutationFn: async () => {
      const needsConfig =
        Boolean(fyersAppId) &&
        (fyersAppId !== fyersData?.appId || Boolean(fyersSecretKey.trim()));
      if (needsConfig) {
        await api.integrations.fyersConfig({ appId: fyersAppId, secretKey: fyersSecretKey });
        setFyersSecretKey('');
      }
      return api.integrations.fyersLoginUrl();
    },
    onSuccess: (res: any) => {
      const url = res?.url || res?.data?.url;
      if (url) {
        toast.info('Opening FYERS login portal...');
        window.location.href = url;
      } else {
        toast.error('Unable to retrieve FYERS login portal URL.');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to initialize FYERS login.');
    },
  });

  const fyersSyncMutation = useMutation({
    mutationFn: () => api.integrations.fyersSync(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(res?.message || 'Synchronized trades from FYERS successfully.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to sync trades from FYERS.');
    },
  });

  const fyersDisconnectMutation = useMutation({
    mutationFn: () => api.integrations.fyersDisconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      toast.info('FYERS broker session disconnected.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to disconnect FYERS session.');
    },
  });

  const [backfillResult, setBackfillResult] = useState<any>(null);

  const fyersBackfillMutation = useMutation({
    mutationFn: (params: { limit?: number } = {}) => api.integrations.fyersBackfillExcursion(params),
    onSuccess: (data: any) => {
      const res = data?.data || data;
      setBackfillResult(res);
      toast.success(`Excursion backfill complete: ${res.computed} computed, ${res.remaining} remaining.`);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-excursion'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to backfill excursion data');
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate({ name, baseCurrency });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Header */}
      <Box sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsRounded sx={{ color: 'primary.main', fontSize: 28 }} />
          Settings & Local Security
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Trader profile preferences, appearance theme, security credentials, and future broker integration layer
        </Typography>
      </Box>

      <Grid container spacing={3}>
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

              <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  value={user?.email || ''}
                  helperText="Local database login identity (read-only)"
                  slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
                />

                <TextField
                  select
                  label="Default Base Currency"
                  size="small"
                  fullWidth
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  <MenuItem value="INR">Indian Rupee (INR ₹)</MenuItem>
                  <MenuItem value="USD">US Dollar (USD $)</MenuItem>
                  <MenuItem value="EUR">Euro (EUR €)</MenuItem>
                  <MenuItem value="GBP">British Pound (GBP £)</MenuItem>
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

                {profileSuccess && (
                  <Alert severity="success" icon={<CheckCircleRounded />}>
                    Profile updated successfully
                  </Alert>
                )}

                {profileError && (
                  <Alert severity="error" onClose={() => setProfileError(null)}>
                    {profileError}
                  </Alert>
                )}

                <Box sx={{ pt: 1 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={profileMutation.isPending}
                    sx={{ fontWeight: 600, px: 3 }}
                  >
                    {profileMutation.isPending ? 'Saving...' : 'Save Preferences'}
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

              <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    disabled={passwordMutation.isPending}
                    sx={{ fontWeight: 600, px: 3 }}
                  >
                    {passwordMutation.isPending ? 'Updating...' : 'Change Password'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* Discipline & Risk Guardrails Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShieldRounded sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Discipline & Risk Guardrails
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary">
                Configure heuristic parameters used by the financial engine for mistake detection, revenge trade alerts, daily loss warnings, and discipline scoring.
              </Typography>

              <form onSubmit={handleRiskSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Daily Loss (₹)"
                      type="number"
                      size="small"
                      required
                      fullWidth
                      value={maxDailyLoss}
                      onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                      helperText="Warning banner fires when breached"
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Trades Per Day"
                      type="number"
                      size="small"
                      required
                      fullWidth
                      value={maxDailyTrades}
                      onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
                      helperText="Flags overtrading beyond cap"
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Open Trades"
                      type="number"
                      size="small"
                      required
                      fullWidth
                      value={maxOpenTrades}
                      onChange={(e) => setMaxOpenTrades(Number(e.target.value))}
                      helperText="Max concurrent positions"
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Risk Per Trade (%)"
                      type="number"
                      size="small"
                      required
                      fullWidth
                      value={maxRiskPerTradePercent}
                      onChange={(e) => setMaxRiskPerTradePercent(Number(e.target.value))}
                      helperText="Flags position size violation"
                      slotProps={{ htmlInput: { step: '0.1', min: '0.1' } }}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Revenge Trading Window (Minutes)"
                      type="number"
                      size="small"
                      required
                      fullWidth
                      value={revengeTradingMinutes}
                      onChange={(e) => setRevengeTradingMinutes(Number(e.target.value))}
                      helperText="Flags trades entered with larger size within N mins of a loss"
                    />
                  </Grid>
                </Grid>

                {riskSuccess && (
                  <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />}>
                    Discipline guardrails saved successfully.
                  </Alert>
                )}

                {riskError && (
                  <Alert severity="error" onClose={() => setRiskError(null)}>
                    {riskError}
                  </Alert>
                )}

                <Box sx={{ pt: 1 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={riskMutation.isPending}
                    sx={{ fontWeight: 600, px: 3 }}
                  >
                    {riskMutation.isPending ? 'Saving Guardrails...' : 'Save Guardrails'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* System Status & Local Privacy Panel */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageRounded sx={{ color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Local Storage & Zero-Telemetry Privacy
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Database Engine
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                  MongoDB Community (Local)
                </Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Private Data Privacy
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main', fontFamily: '"JetBrains Mono", monospace' }}>
                  100% Local / MacBook Only
                </Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Total Stored Records
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                  {systemStatus?.tradeCount || 0} Trades • {systemStatus?.attachmentCount || 0} Screenshots
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Live FYERS Broker Integration Card */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <KeyRounded sx={{ color: 'primary.main' }} />
                FYERS Broker Integration (Live API v3)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Automated tradebook synchronization with FIFO round-trip matching & statutory charges calculation
              </Typography>
            </Box>
            <Chip
              icon={
                isFyersConnected ? (
                  <CloudDoneRounded sx={{ fontSize: '1rem !important' }} />
                ) : isFyersConfigured ? (
                  <LinkRounded sx={{ fontSize: '1rem !important' }} />
                ) : (
                  <LinkOffRounded sx={{ fontSize: '1rem !important' }} />
                )
              }
              label={
                isFyersConnected
                  ? 'CONNECTED (LIVE SYNC)'
                  : isFyersConfigured
                  ? 'CONFIGURED (NEEDS DAILY LOGIN)'
                  : 'NOT CONFIGURED'
              }
              size="small"
              color={isFyersConnected ? 'success' : isFyersConfigured ? 'warning' : 'default'}
              sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
            />
          </Box>

          <Alert
            severity={isFyersConnected ? 'success' : 'info'}
            sx={{ fontSize: '0.8125rem', py: 0.75 }}
          >
            {isFyersConnected ? (
              <span>
                <strong>Active Broker Session:</strong> Trades executed on FYERS (mobile, web, or TradingView) can now be fetched automatically into your journal with exact fills and fees.
              </span>
            ) : (
              <span>
                <strong>SEBI 24-Hour Token Rule:</strong> Broker API tokens expire daily. Click <strong>"Connect to FYERS (1-Click Daily Auth)"</strong> once per trading day to authorize SetupMint to fetch your tradebook.
              </span>
            )}
          </Alert>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              size="small"
              variant="outlined"
              label={fyersData?.hasSecretKey ? 'Secret saved (encrypted)' : 'Secret not saved'}
              color={fyersData?.hasSecretKey ? 'success' : 'default'}
              sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
            />
            {fyersData?.clientId && (
              <Chip
                size="small"
                variant="outlined"
                label={`Client ${fyersData.clientId}`}
                sx={{ fontSize: '0.6875rem', fontFamily: '"JetBrains Mono", monospace' }}
              />
            )}
            {fyersData?.tokenExpiresAt && (
              <Typography variant="caption" color="text.secondary">
                Token expires: <strong>{new Date(fyersData.tokenExpiresAt).toLocaleString()}</strong>
              </Typography>
            )}
            {fyersData?.lastFundsSyncAt && (
              <Typography variant="caption" color="text.secondary">
                Funds synced: <strong>{new Date(fyersData.lastFundsSyncAt).toLocaleString()}</strong>
              </Typography>
            )}
          </Box>

          {fyersData?.fundsSyncError && (
            <Alert severity="warning" sx={{ fontSize: '0.8125rem', py: 0.75 }}>
              Last funds sync failed: {fyersData.fundsSyncError}
            </Alert>
          )}

          {/* Configuration Inputs */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                FYERS App ID (Client ID)
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g. YOUR_APP_ID-100"
                value={fyersAppId}
                onChange={(e) => setFyersAppId(e.target.value.trim())}
                slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 } } }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                FYERS Secret Key
              </Typography>
              <TextField
                fullWidth
                size="small"
                type={showSecretKey ? 'text' : 'password'}
                placeholder={fyersData?.hasSecretKey ? 'Secret saved — enter a new key to replace it' : 'Enter 32-char Secret Key'}
                value={fyersSecretKey}
                onChange={(e) => setFyersSecretKey(e.target.value.trim())}
                slotProps={{
                  htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowSecretKey(!showSecretKey)}
                          edge="end"
                        >
                          {showSecretKey ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Grid>

            {/* Redirect URI reference */}
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Registered Redirect / Callback URL (Saved in FYERS Dashboard):
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main' }}>
                    {fyersRedirectUri}
                  </Typography>
                </Box>
                <Tooltip title="Copy Redirect URL to clipboard">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ContentCopyRounded fontSize="small" />}
                    onClick={() => {
                      navigator.clipboard.writeText(fyersRedirectUri);
                      toast.info('Redirect URL copied to clipboard');
                    }}
                    sx={{ fontSize: '0.6875rem' }}
                  >
                    Copy
                  </Button>
                </Tooltip>
              </Box>
            </Grid>
          </Grid>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', pt: 0.5 }}>
            <Button
              variant="outlined"
              color="inherit"
              disabled={fyersConfigMutation.isPending || !fyersAppId}
              onClick={() => fyersConfigMutation.mutate({ appId: fyersAppId, secretKey: fyersSecretKey })}
              sx={{ fontWeight: 600 }}
            >
              {fyersConfigMutation.isPending ? 'Saving...' : 'Save Credentials'}
            </Button>

            {!isFyersConnected && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<LinkRounded />}
                disabled={fyersConnectMutation.isPending || !fyersAppId}
                onClick={() => fyersConnectMutation.mutate()}
                sx={{ fontWeight: 700 }}
              >
                {fyersConnectMutation.isPending ? 'Opening FYERS...' : 'Connect to FYERS (1-Click Daily Auth)'}
              </Button>
            )}

            <Button
              variant={isFyersConnected ? 'contained' : 'outlined'}
              color={isFyersConnected ? 'success' : 'inherit'}
              startIcon={
                <SyncRounded
                  sx={{
                    animation: fyersSyncMutation.isPending ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              }
              disabled={fyersSyncMutation.isPending || fyersConnectMutation.isPending}
              onClick={() => {
                if (!isFyersConnected) {
                  toast.info('FYERS session not authorized for today. Launching 1-Click Daily Auth...');
                  fyersConnectMutation.mutate();
                } else {
                  fyersSyncMutation.mutate();
                }
              }}
              sx={{ fontWeight: 700 }}
            >
              {fyersSyncMutation.isPending ? 'Syncing Tradebook...' : 'Sync FYERS Trades Now'}
            </Button>

            {isFyersConnected && (
              <Button
                variant="outlined"
                color="secondary"
                startIcon={fyersBackfillMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <TimelineRounded />}
                disabled={fyersBackfillMutation.isPending}
                onClick={() => fyersBackfillMutation.mutate({})}
                sx={{ fontWeight: 600 }}
              >
                {fyersBackfillMutation.isPending ? 'Backfilling Excursion...' : 'Backfill Excursion Data'}
              </Button>
            )}

            {isFyersConnected && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<LinkOffRounded />}
                disabled={fyersDisconnectMutation.isPending}
                onClick={() => fyersDisconnectMutation.mutate()}
                sx={{ fontWeight: 600 }}
              >
                Disconnect
              </Button>
            )}
          </Box>

          {backfillResult && (
            <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>
              Excursion backfill batch: <strong>{backfillResult.computed}</strong> computed, <strong>{backfillResult.failed}</strong> failed, <strong>{backfillResult.remaining}</strong> remaining.
            </Alert>
          )}

          {/* Sync History & Diagnostics */}
          {fyersData?.lastSyncAt && (
            <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Last Synced: <strong>{new Date(fyersData.lastSyncAt).toLocaleString()}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Engine: <strong>FIFO Round-Trip + Indian Statutory Charges</strong>
              </Typography>
            </Box>
          )}

          {fyersSuccess && (
            <Alert severity="success" icon={<CheckCircleRounded />}>
              FYERS credentials saved securely in integration layer.
            </Alert>
          )}

          {fyersError && (
            <Alert severity="error" onClose={() => setFyersError(null)}>
              {fyersError}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions & Device Management Card */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShieldRounded sx={{ color: 'primary.main' }} />
                Active Sessions & Device Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Review and manage authenticated browser and device sessions
              </Typography>
            </Box>
            {activeSessions.filter((s) => !s.isCurrent).length > 0 && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                disabled={logoutAllMutation.isPending}
                onClick={() => {
                  if (window.confirm('Are you sure you want to log out of all other devices?')) {
                    logoutAllMutation.mutate();
                  }
                }}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                {logoutAllMutation.isPending ? 'Logging out...' : 'Log Out All Other Devices'}
              </Button>
            )}
          </Box>

          <Typography variant="body2" color="text.secondary">
            Logged in as <strong>{user?.name}</strong> ({user?.email}). SetupMint uses production-grade sliding sessions with secure, HttpOnly cookies. Sessions remain active until you explicitly log out or remain idle past your policy window.
          </Typography>

          {/* Device Sessions List */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {isLoadingSessions ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Loading active sessions...
                </Typography>
              </Box>
            ) : activeSessions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                No active sessions found.
              </Typography>
            ) : (
              activeSessions.map((session) => {
                const uaInfo = parseUserAgent(session.userAgent);
                const lastUsedStr = new Date(session.lastUsedAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                });
                const createdStr = new Date(session.createdAt).toLocaleDateString('en-IN', {
                  dateStyle: 'medium',
                });

                return (
                  <Box
                    key={session.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: session.isCurrent
                        ? muiTheme.palette.mode === 'dark'
                          ? 'rgba(16, 185, 129, 0.4)'
                          : 'rgba(16, 185, 129, 0.5)'
                        : 'divider',
                      bgcolor: session.isCurrent
                        ? muiTheme.palette.mode === 'dark'
                          ? 'rgba(16, 185, 129, 0.05)'
                          : 'rgba(16, 185, 129, 0.03)'
                        : 'background.paper',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                      <Box
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: session.isCurrent
                            ? 'rgba(16, 185, 129, 0.15)'
                            : muiTheme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.05)'
                            : 'rgba(0, 0, 0, 0.04)',
                          color: session.isCurrent ? 'primary.main' : 'text.secondary',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {uaInfo.isMobile ? (
                          <PhoneAndroidRounded sx={{ fontSize: 20 }} />
                        ) : (
                          <LaptopRounded sx={{ fontSize: 20 }} />
                        )}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {uaInfo.full}
                          </Typography>
                          {session.isCurrent && (
                            <Chip
                              label="Current Device"
                              size="small"
                              color="success"
                              variant="outlined"
                              sx={{
                                height: 20,
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                              }}
                            />
                          )}
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: '0.6875rem',
                          }}
                        >
                          IP: {session.ipAddress || 'Unknown'} • Last active: {lastUsedStr} • Signed in: {createdStr}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {!session.isCurrent && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={revokeSessionMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Log out ${uaInfo.full}?`)) {
                              revokeSessionMutation.mutate(session.id);
                            }
                          }}
                          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', py: 0.25 }}
                        >
                          Log out
                        </Button>
                      )}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Button
              id="settings-logout-btn"
              variant="outlined"
              color="error"
              disabled={isLoggingOut}
              onClick={handleLogout}
              startIcon={<LogoutRounded />}
              sx={{ fontWeight: 700 }}
            >
              {isLoggingOut ? 'Signing Out...' : 'Sign Out of Current Device'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
