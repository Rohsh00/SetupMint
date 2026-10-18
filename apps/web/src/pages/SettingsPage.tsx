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
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { api } from '../lib/api.js';

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
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

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
  const [fyersSuccess, setFyersSuccess] = useState(false);
  const [fyersError, setFyersError] = useState<string | null>(null);

  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.settings.systemStatus(),
  });

  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
  });

  React.useEffect(() => {
    if (fyersStatus?.appId) {
      setFyersAppId(fyersStatus.appId);
    }
  }, [fyersStatus]);

  const profileMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile(payload),
    onSuccess: () => {
      refreshUser();
      setProfileError(null);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      setProfileError(err.message || 'Failed to update profile');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: any) => api.settings.changePassword(payload),
    onSuccess: () => {
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordMsg(null), 3000);
    },
    onError: (err: any) => {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to update password' });
    },
  });

  const fyersMutation = useMutation({
    mutationFn: (appId: string) => api.integrations.fyersConfig({ appId }),
    onSuccess: () => {
      setFyersError(null);
      setFyersSuccess(true);
      setTimeout(() => setFyersSuccess(false), 3000);
    },
    onError: (err: any) => {
      setFyersError(err.message || 'Failed to save Fyers configuration');
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

      {/* Future FYERS Integration Architecture Card */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <KeyRounded sx={{ color: 'primary.main' }} />
                Future FYERS Broker Integration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Decoupled broker adapter abstraction ready for automated execution synchronization
              </Typography>
            </Box>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              Status: {fyersStatus?.status || 'DISABLED'}
            </Box>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Stratum is architected with a decoupled <strong>BrokerAdapter</strong> interface and <strong>NormalizedExecution</strong> schema. In future updates, FYERS API orders and fills will synchronize without altering your manual trade journal core.
          </Typography>

          <Box
            sx={{
              p: 2,
              borderRadius: 1.5,
              bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              border: 1,
              borderColor: 'divider',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <div>Adapter Version: <strong>v3-compatible (REST / WebSocket)</strong></div>
            <div>Normalized Execution Schema: <strong>INormalizedExecution</strong></div>
            <div>Duplicate Reconciliation Engine: <strong>IdempotencyKey & Manual Review Ready</strong></div>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="FYERS App ID (e.g. XC12345-100)"
              value={fyersAppId}
              onChange={(e) => setFyersAppId(e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
            />
            <Button
              variant="contained"
              color="primary"
              disabled={fyersMutation.isPending}
              onClick={() => fyersMutation.mutate(fyersAppId)}
              sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Save Configuration
            </Button>
          </Box>

          {fyersSuccess && (
            <Alert severity="success" icon={<CheckCircleRounded />}>
              Configuration saved in integration layer
            </Alert>
          )}

          {fyersError && (
            <Alert severity="error" onClose={() => setFyersError(null)}>
              {fyersError}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Active Session & Account Security Card */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShieldRounded sx={{ color: 'primary.main' }} />
                Active Session & Account Security
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Manage your authenticated journal session on this device
              </Typography>
            </Box>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
                bgcolor: 'rgba(16, 185, 129, 0.1)',
                color: 'primary.main',
                fontWeight: 700,
                fontSize: '0.75rem',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              AUTHENTICATED
            </Box>
          </Box>

          <Typography variant="body2" color="text.secondary">
            Logged in as <strong>{user?.name}</strong> ({user?.email}). Stratum uses secure, HttpOnly session cookies isolated to your local environment.
          </Typography>

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
              {isLoggingOut ? 'Signing Out...' : 'Sign Out of Stratum'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
