import React from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  TextField,
  Chip,
  Switch,
  IconButton,
  InputAdornment,
  Tooltip,
  Collapse,
  Alert,
  CircularProgress,
  useTheme as useMuiTheme,
} from '@mui/material';
import KeyRounded from '@mui/icons-material/KeyRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import CloudDoneRounded from '@mui/icons-material/CloudDoneRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import TimelineRounded from '@mui/icons-material/TimelineRounded';
import FlashOnRounded from '@mui/icons-material/FlashOnRounded';
import { HelpHint } from '../../components/help/index.js';
import { toast } from '../../context/ToastContext.js';

export interface BrokerConnectionsTabProps {
  hasFyersAccount: boolean;
  hasMarketDataAccount: boolean;
  hasMt5Account: boolean;
  // FYERS
  isFyersConnected: boolean;
  isFyersConfigured: boolean;
  fyersData: any;
  fyersRedirectUri: string;
  fyersAppId: string;
  setFyersAppId: (val: string) => void;
  fyersSecretKey: string;
  setFyersSecretKey: (val: string) => void;
  showSecretKey: boolean;
  setShowSecretKey: (val: boolean) => void;
  fyersAutoSync: boolean;
  setFyersAutoSync: (val: boolean) => void;
  showFyersDevDetails: boolean;
  setShowFyersDevDetails: (val: boolean) => void;
  onSaveFyersConfig: () => void;
  onConnectFyers: () => void;
  onSyncFyers: () => void;
  onDisconnectFyers: () => void;
  isSavingFyers: boolean;
  isConnectingFyers: boolean;
  isSyncingFyers: boolean;
  isDisconnectingFyers: boolean;
  fyersSuccess: boolean;
  fyersError: string | null;
  onCopyText: (text: string) => Promise<boolean>;
  // Angel One
  isAngelOneLoading: boolean;
  isAngelOneConnected: boolean;
  isAngelOneConfigured: boolean;
  isAngelOneTokenExpired: boolean;
  angelOneData: any;
  angelOneApiKey: string;
  setAngelOneApiKey: (val: string) => void;
  angelOneClientCode: string;
  setAngelOneClientCode: (val: string) => void;
  angelOnePin: string;
  setAngelOnePin: (val: string) => void;
  showAngelOneKey: boolean;
  setShowAngelOneKey: (val: boolean) => void;
  showAngelOnePin: boolean;
  setShowAngelOnePin: (val: boolean) => void;
  onOpenTotpDialog: () => void;
  onSaveAngelOneConfig: () => void;
  onRefreshAngelOne: () => void;
  onDisconnectAngelOne: () => void;
  isSavingAngelOne: boolean;
  isConnectingAngelOne: boolean;
  isRefreshingAngelOne: boolean;
  isDisconnectingAngelOne: boolean;
  // MT5
  goldDefaultLot: number;
  goldSlPoints: number;
  goldRrRatio: number;
  ethDefaultLot: number;
  ethSlPrice: number;
  ethRrRatio: number;
  defaultDollarRisk: number;
  onNavigateToTelegramTab: () => void;
}

export function BrokerConnectionsTab({
  hasFyersAccount,
  hasMarketDataAccount,
  hasMt5Account,
  isFyersConnected,
  isFyersConfigured,
  fyersData,
  fyersRedirectUri,
  fyersAppId,
  setFyersAppId,
  fyersSecretKey,
  setFyersSecretKey,
  showSecretKey,
  setShowSecretKey,
  fyersAutoSync,
  setFyersAutoSync,
  showFyersDevDetails,
  setShowFyersDevDetails,
  onSaveFyersConfig,
  onConnectFyers,
  onSyncFyers,
  onDisconnectFyers,
  isSavingFyers,
  isConnectingFyers,
  isSyncingFyers,
  isDisconnectingFyers,
  fyersSuccess,
  fyersError,
  onCopyText,
  isAngelOneLoading,
  isAngelOneConnected,
  isAngelOneConfigured,
  isAngelOneTokenExpired,
  angelOneData,
  angelOneApiKey,
  setAngelOneApiKey,
  angelOneClientCode,
  setAngelOneClientCode,
  angelOnePin,
  setAngelOnePin,
  showAngelOneKey,
  setShowAngelOneKey,
  showAngelOnePin,
  setShowAngelOnePin,
  onOpenTotpDialog,
  onSaveAngelOneConfig,
  onRefreshAngelOne,
  onDisconnectAngelOne,
  isSavingAngelOne,
  isConnectingAngelOne,
  isRefreshingAngelOne,
  isDisconnectingAngelOne,
  goldDefaultLot,
  goldSlPoints,
  goldRrRatio,
  ethDefaultLot,
  ethSlPrice,
  ethRrRatio,
  defaultDollarRisk,
  onNavigateToTelegramTab,
}: BrokerConnectionsTabProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  if (!hasFyersAccount && !hasMarketDataAccount && !hasMt5Account) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          No External Broker Integrations Needed
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your configured trading accounts use manual journaling, CSV tradebook imports, or simulated feeds. Broker connections appear automatically when an account adapter requires them.
        </Typography>
      </Card>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* FYERS Live Broker Card */}
      {hasFyersAccount && (
        <Card variant="outlined" sx={{ p: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <KeyRounded sx={{ color: 'primary.main' }} />
                    FYERS Broker Integration (Live API v3)
                  </Typography>
                  <HelpHint hintKey="settings.fyersExpiry" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Real-time execution, round-trip FIFO tradebook synchronization, and Indian statutory charges
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
                  <strong>Active Broker Session:</strong> Trades executed on FYERS are fetched automatically into your journal with exact fills, fees, and auto-backfilled excursion analytics.
                </span>
              ) : (
                <span>
                  <strong>SEBI 24-Hour Token Rule:</strong> Broker API tokens expire daily. Click <strong>&quot;Connect to FYERS (1-Click Daily Auth)&quot;</strong> once per trading day to authorize SetupMint.
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
            </Box>

            {/* Credentials Inputs */}
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
                  placeholder={fyersData?.hasSecretKey ? 'Secret saved — enter new key to update' : 'Enter 32-char Secret Key'}
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
            </Grid>

            {/* Real-Time Background Auto-Sync Switch */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: isDark ? 'rgba(34, 197, 94, 0.04)' : 'rgba(34, 197, 94, 0.05)',
                border: '1px solid',
                borderColor: fyersAutoSync ? (isDark ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.35)') : 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  ⚡ Real-Time Automated Trade & SL Sync
                  {fyersAutoSync && isFyersConnected && (
                    <Chip size="small" color="success" label="ACTIVE (15s Cadence)" sx={{ fontSize: '0.65rem', fontWeight: 800, height: 20 }} />
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                  Automatically detects new trades and Stop Loss exits every 15s during market hours. Zero manual clicking required.
                </Typography>
              </Box>
              <Switch
                checked={fyersAutoSync}
                onChange={(e) => {
                  const val = e.target.checked;
                  setFyersAutoSync(val);
                  onSaveFyersConfig();
                }}
                color="success"
              />
            </Box>

            {/* Collapsible Developer Details */}
            <Box>
              <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={() => setShowFyersDevDetails(!showFyersDevDetails)}
                endIcon={showFyersDevDetails ? <ExpandLessRounded /> : <ExpandMoreRounded />}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', p: 0 }}
              >
                {showFyersDevDetails ? 'Hide Redirect URI Details' : 'Show Registered Redirect URL for FYERS Dashboard'}
              </Button>
              <Collapse in={showFyersDevDetails}>
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
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
                      Redirect URL saved in your FYERS API Dashboard:
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main' }}>
                      {fyersRedirectUri}
                    </Typography>
                  </Box>
                  <Tooltip title="Copy URL">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ContentCopyRounded fontSize="small" />}
                      onClick={async () => {
                        const ok = await onCopyText(fyersRedirectUri);
                        if (ok) toast.info('Redirect URL copied');
                      }}
                      sx={{ fontSize: '0.6875rem' }}
                    >
                      Copy
                    </Button>
                  </Tooltip>
                </Box>
              </Collapse>
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', pt: 0.5 }}>
              <Button
                variant="outlined"
                color="inherit"
                disabled={isSavingFyers || !fyersAppId}
                onClick={onSaveFyersConfig}
                sx={{ fontWeight: 600 }}
              >
                {isSavingFyers ? 'Saving...' : 'Save Credentials'}
              </Button>

              {!isFyersConnected && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<LinkRounded />}
                  disabled={isConnectingFyers || !fyersAppId}
                  onClick={onConnectFyers}
                  sx={{ fontWeight: 700 }}
                >
                  {isConnectingFyers ? 'Opening FYERS...' : 'Connect to FYERS (1-Click Daily Auth)'}
                </Button>
              )}

              <Button
                variant={isFyersConnected ? 'contained' : 'outlined'}
                color={isFyersConnected ? 'success' : 'inherit'}
                startIcon={
                  <SyncRounded
                    sx={{
                      animation: isSyncingFyers ? 'spin 1s linear infinite' : 'none',
                      '@keyframes spin': {
                        '0%': { transform: 'rotate(0deg)' },
                        '100%': { transform: 'rotate(360deg)' },
                      },
                    }}
                  />
                }
                disabled={isSyncingFyers || isConnectingFyers}
                onClick={onSyncFyers}
                sx={{ fontWeight: 700 }}
              >
                {isSyncingFyers ? 'Syncing...' : 'Sync FYERS Trades Now'}
              </Button>

              {isFyersConnected && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LinkOffRounded />}
                  disabled={isDisconnectingFyers}
                  onClick={onDisconnectFyers}
                  sx={{ fontWeight: 600 }}
                >
                  Disconnect
                </Button>
              )}
            </Box>

            {fyersSuccess && (
              <Alert severity="success" icon={<CheckCircleRounded />}>
                FYERS credentials saved securely.
              </Alert>
            )}

            {fyersError && (
              <Alert severity="error">
                {fyersError}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Angel One SmartAPI Market Data Fallback Card */}
      {hasMarketDataAccount && (
        <Card variant="outlined" sx={{ p: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TimelineRounded sx={{ color: '#f59e0b' }} />
                    Angel One SmartAPI (Market Data Fallback)
                  </Typography>
                  <HelpHint hintKey="settings.angelOneFallback" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Secondary candle feed for excursion analytics and chart snapshots when primary feeds are unavailable
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isAngelOneLoading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : isAngelOneConnected ? (
                  <Chip
                    icon={<CheckCircleRounded />}
                    label="CONNECTED & ACTIVE"
                    color="success"
                    size="small"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                ) : isAngelOneTokenExpired ? (
                  <Chip
                    label="DAILY TOKEN EXPIRED"
                    color="warning"
                    size="small"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                ) : isAngelOneConfigured ? (
                  <Chip
                    label="READY TO CONNECT"
                    color="info"
                    size="small"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                ) : (
                  <Chip
                    label="NOT CONFIGURED"
                    size="small"
                    sx={{ fontWeight: 600, fontSize: '0.6875rem' }}
                  />
                )}
              </Box>
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="SmartAPI Key"
                  value={angelOneApiKey}
                  onChange={(e) => setAngelOneApiKey(e.target.value)}
                  placeholder={angelOneData?.hasApiKey ? '••••••••••••••••' : 'Enter SmartAPI Key'}
                  fullWidth
                  size="small"
                  type={showAngelOneKey ? 'text' : 'password'}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowAngelOneKey(!showAngelOneKey)}>
                            {showAngelOneKey ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Client Code"
                  value={angelOneClientCode}
                  onChange={(e) => setAngelOneClientCode(e.target.value.toUpperCase().trim())}
                  placeholder={angelOneData?.clientCode || 'e.g. A123456'}
                  fullWidth
                  size="small"
                />
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Trading PIN / MPIN"
                  value={angelOnePin}
                  onChange={(e) => setAngelOnePin(e.target.value)}
                  placeholder={angelOneData?.hasPin ? '••••' : 'Enter 4-6 digit PIN'}
                  fullWidth
                  size="small"
                  type={showAngelOnePin ? 'text' : 'password'}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowAngelOnePin(!showAngelOnePin)}>
                            {showAngelOnePin ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="outlined"
                color="inherit"
                disabled={isSavingAngelOne || (!angelOneApiKey && !angelOneClientCode && !angelOnePin)}
                onClick={onSaveAngelOneConfig}
                sx={{ fontWeight: 600 }}
              >
                {isSavingAngelOne ? 'Saving...' : 'Save Credentials'}
              </Button>

              <Button
                variant={isAngelOneConnected ? 'outlined' : 'contained'}
                color="warning"
                startIcon={<LinkRounded />}
                disabled={isConnectingAngelOne || (!isAngelOneConfigured && !angelOneApiKey)}
                onClick={onOpenTotpDialog}
                sx={{ fontWeight: 700 }}
              >
                {isAngelOneConnected ? 'Re-authenticate with TOTP' : 'Connect with TOTP'}
              </Button>

              {isAngelOneConfigured && (
                <Button
                  variant="outlined"
                  color="info"
                  startIcon={<SyncRounded />}
                  disabled={isRefreshingAngelOne}
                  onClick={onRefreshAngelOne}
                  sx={{ fontWeight: 600 }}
                >
                  {isRefreshingAngelOne ? 'Refreshing...' : 'Refresh Instrument Cache'}
                </Button>
              )}

              {isAngelOneConnected && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LinkOffRounded />}
                  disabled={isDisconnectingAngelOne}
                  onClick={onDisconnectAngelOne}
                  sx={{ fontWeight: 600 }}
                >
                  Disconnect
                </Button>
              )}
            </Box>

            {angelOneData && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  Cached Instruments: <strong>{Number(angelOneData.instrumentCount ?? 0).toLocaleString()} symbols</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Quota: <strong>{angelOneData.dailyCallsUsed ?? 0} / {angelOneData.dailyBudget ?? 500} calls used today</strong>
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* MetaTrader 5 (MT5) EA Bridge & Telegram Execution Card */}
      {hasMt5Account && (
        <Card variant="outlined" sx={{ p: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlashOnRounded sx={{ color: 'primary.main' }} />
                    MetaTrader 5 (MT5) EA Bridge &amp; Telegram Execution
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Sub-second order placement, automatic Stop Loss &amp; Take Profit, floating PnL tracking, and Telegram fast entries
                </Typography>
              </Box>

              <Chip
                icon={<CheckCircleRounded sx={{ fontSize: '1rem !important' }} />}
                label="MT5 BRIDGE READY"
                color="success"
                size="small"
                sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
              />
            </Box>

            <Alert severity="info" sx={{ fontSize: '0.8125rem', py: 0.75 }}>
              <span>
                <strong>Forex &amp; Crypto Execution:</strong> SetupMint communicates directly with your MT5 terminal via the <code>SetupMint_Elefin_Bridge.mq5</code> Expert Advisor. You can place market orders, manage SL/TP, and track live Gold (<code>XAUUSD</code>) and Ethereum (<code>ETHUSD</code>) quotes from your Telegram Bot.
              </span>
            </Alert>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                size="small"
                variant="outlined"
                label={`Gold Presets: ${goldDefaultLot} Lots • ${goldSlPoints} pts SL • 1:${goldRrRatio} RR`}
                color="warning"
                sx={{ fontSize: '0.75rem', fontWeight: 700 }}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`ETH Presets: ${ethDefaultLot} Lots • $${ethSlPrice} SL • 1:${ethRrRatio} RR`}
                color="info"
                sx={{ fontSize: '0.75rem', fontWeight: 700 }}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`Risk Budget: $${defaultDollarRisk} / order`}
                color="success"
                sx={{ fontSize: '0.75rem', fontWeight: 700 }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', pt: 0.5 }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<FlashOnRounded />}
                onClick={onNavigateToTelegramTab}
                sx={{ fontWeight: 700, textTransform: 'none' }}
              >
                ⚡ Configure Telegram MT5 Presets &amp; Sizing
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
