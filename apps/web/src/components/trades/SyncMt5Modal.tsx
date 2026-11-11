import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  MenuItem,
  useTheme,
} from '@mui/material';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import CloudSyncRoundedIcon from '@mui/icons-material/CloudSyncRounded';
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { formatCurrency } from '../../lib/utils.js';

interface SyncMt5ModalProps {
  open: boolean;
  onClose: () => void;
  accountId?: string;
  accountName?: string;
}

export function SyncMt5Modal({ open, onClose, accountId, accountName }: SyncMt5ModalProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'REMOTE_EA' | 'PASTE_REPORT'>('REMOTE_EA');
  const [rawText, setRawText] = useState('');
  const [defaultRr, setDefaultRr] = useState<number>(2.0);
  const [lastImportResult, setLastImportResult] = useState<any>(null);

  // Fetch MT5 status
  const { data: rawStatusData, refetch: refetchStatus, isFetching: isCheckingStatus } = useQuery({
    queryKey: ['mt5-status', accountId],
    queryFn: () => (accountId ? api.accounts.getMt5Status(accountId) : null),
    enabled: Boolean(open && accountId),
    refetchInterval: open ? 5000 : false,
  });

  const statusData: any = (rawStatusData as any)?.data ?? rawStatusData;
  const eaActive = Boolean(statusData?.eaActive);
  const secondsAgo = statusData?.secondsAgo;

  // Remote fetch mutation
  const fetchMutation = useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error('Account ID is required');
      return api.accounts.fetchMt5History(accountId);
    },
    onSuccess: (res: any) => {
      const data = res?.data ?? res;
      const msg = data?.message || res?.message || 'Fetch command queued to MT5 Bridge!';
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      refetchStatus();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to dispatch fetch command to MT5 EA');
    },
  });

  // Paste / Report import mutation
  const importMutation = useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error('Account ID is required');
      return api.accounts.importMt5Trades(accountId, {
        rawText,
        defaultRiskReward: defaultRr,
      });
    },
    onSuccess: (res: any) => {
      const data = res?.data ?? res;
      setLastImportResult(data);
      setRawText('');
      const total = data?.totalProcessed ?? data?.trades?.length ?? 0;
      const inserted = data?.insertedCount ?? 0;
      const updated = data?.updatedCount ?? 0;
      const msg =
        data?.message ||
        res?.message ||
        `Synced ${total} trade(s) (${inserted} new, ${updated} updated)!`;
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to import MT5 trade report');
    },
  });

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText('http://13.205.58.162/api/v1/integrations/mt5/webhook');
    toast.info('Webhook URL copied to clipboard!');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          fontWeight: 800,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              color: 'success.main',
            }}
          >
            <SyncRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
              Sync MetaTrader 5 Trades
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {accountName || 'Elefin MT5 Account'}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
            },
          }}
        >
          <Tab
            value="REMOTE_EA"
            icon={<CloudSyncRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Remote EA Sync (1-Click)"
          />
          <Tab
            value="PASTE_REPORT"
            icon={<ContentPasteRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Paste MT5 History / Report"
          />
        </Tabs>
      </Box>

      <DialogContent dividers sx={{ py: 2.5 }}>
        {activeTab === 'REMOTE_EA' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Connection Status Card */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: eaActive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)',
                bgcolor: eaActive
                  ? isDark
                    ? 'rgba(34, 197, 94, 0.06)'
                    : 'rgba(34, 197, 94, 0.04)'
                  : isDark
                  ? 'rgba(234, 179, 8, 0.06)'
                  : 'rgba(234, 179, 8, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: eaActive ? '#22C55E' : '#EAB308',
                    boxShadow: eaActive
                      ? '0 0 10px rgba(34, 197, 94, 0.6)'
                      : '0 0 10px rgba(234, 179, 8, 0.6)',
                  }}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {eaActive
                      ? 'MT5 Bridge EA Connected & Listening'
                      : 'MT5 Bridge EA Standby (Waiting for Check-in)'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {eaActive
                      ? `Last active ${secondsAgo !== null && secondsAgo !== undefined ? `${secondsAgo}s ago` : 'just now'}`
                      : 'Ensure MT5 is running on your PC/VPS with the SetupMint Bridge EA attached to a chart.'}
                  </Typography>
                </Box>
              </Box>

              <Button
                size="small"
                variant="outlined"
                onClick={() => refetchStatus()}
                disabled={isCheckingStatus}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 1.5 }}
              >
                {isCheckingStatus ? 'Checking...' : 'Check Status'}
              </Button>
            </Box>

            {/* Action Card */}
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                border: '1px solid',
                borderColor: 'divider',
                textAlign: 'center',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Fetch All Today's Closed Trades from MT5
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', maxWidth: 520, mx: 'auto', mb: 2.5, fontSize: '0.825rem' }}
              >
                Sends an instant background command to your MT5 EA. The EA scans all closed deals from
                today's terminal history and synchronizes them directly into SetupMint.
              </Typography>

              <Button
                variant="contained"
                size="medium"
                onClick={() => fetchMutation.mutate()}
                disabled={fetchMutation.isPending}
                startIcon={
                  fetchMutation.isPending ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SyncRoundedIcon />
                  )
                }
                sx={{
                  bgcolor: '#10B981',
                  '&:hover': { bgcolor: '#059669' },
                  fontWeight: 700,
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  textTransform: 'none',
                }}
              >
                {fetchMutation.isPending ? 'Sending Fetch Command...' : '⚡ Fetch All Today’s MT5 Trades'}
              </Button>
            </Box>

            {/* EA Quick Instructions */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(248, 250, 252, 0.8)',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  📌 MT5 BRIDGE CONFIGURATION &amp; ON-CHART BUTTON
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 13 }} />}
                  onClick={handleCopyWebhookUrl}
                  sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.2 }}
                >
                  Copy Webhook URL
                </Button>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                • Inside MT5: Click <strong>Tools → Options → Expert Advisors</strong> → Enable{' '}
                <strong>"Allow WebRequest for listed URL"</strong> and add{' '}
                <code style={{ color: '#10B981', fontWeight: 600 }}>
                  http://13.205.58.162/api/v1/integrations/mt5/webhook
                </code>
                <br />
                • The EA now displays a green{' '}
                <strong>[ ⚡ Sync SetupMint ]</strong> button directly on your MT5 chart for 1-tap manual sync anytime!
              </Typography>
            </Box>
          </Box>
        )}

        {activeTab === 'PASTE_REPORT' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info" sx={{ fontSize: '0.78rem' }}>
              <strong>100% Reliable Offline Importer:</strong> Copy rows directly from your{' '}
              <strong>MT5 Terminal History tab</strong> (or save report as HTML/CSV) and paste below.
              <ul>
                <li>
                  <strong>MT5 History Tab:</strong> Right-click anywhere in the History list → Click{' '}
                  <strong>"Copy"</strong> (Ctrl+C).
                </li>
                <li>
                  <strong>HTML Report:</strong> In MT5, click <strong>Report → HTML</strong>, open it,
                  and paste the text.
                </li>
                <li>
                  <strong>Automatic Deduplication:</strong> Existing trades are updated cleanly without
                  creating duplicates.
                </li>
              </ul>
            </Alert>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TextField
                select
                size="small"
                label="Fallback Risk:Reward (RR)"
                value={defaultRr}
                onChange={(e) => setDefaultRr(Number(e.target.value))}
                sx={{ width: 220 }}
                helperText="Used if SL is missing from report"
              >
                <MenuItem value={1.5}>1 : 1.5 RR</MenuItem>
                <MenuItem value={2.0}>1 : 2.0 RR (Default)</MenuItem>
                <MenuItem value={2.5}>1 : 2.5 RR</MenuItem>
                <MenuItem value={3.0}>1 : 3.0 RR</MenuItem>
              </TextField>
            </Box>

            <TextField
              multiline
              minRows={6}
              maxRows={12}
              fullWidth
              placeholder={`Paste copied rows from MT5 Terminal History or HTML report here, for example:\n\n2026.11.11 08:30:15\t14541005\tXAUUSD\tbuy\t0.01\t4118.18\t4116.40\t0.00\t2026.11.11 09:03:42\t4134.40\t0.00\t0.00\t16.22\n\nOr paste JSON / HTML statement text...`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: `'JetBrains Mono', monospace`,
                  fontSize: '0.78rem',
                },
              }}
            />

            {lastImportResult && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.05)',
                  border: '1px solid',
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', mb: 1 }}>
                  ✓ {lastImportResult.message}
                </Typography>
                {Array.isArray(lastImportResult.trades) && lastImportResult.trades.length > 0 && (
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Ticket</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Symbol</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Side</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Lots</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Entry</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Exit</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">
                            P&amp;L
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {lastImportResult.trades.map((t: any) => (
                          <TableRow key={t.ticket || t.id}>
                            <TableCell sx={{ fontSize: '0.75rem' }}>#{t.ticket}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{t.symbol}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>
                              <Chip
                                size="small"
                                label={t.direction}
                                color={t.direction === 'LONG' ? 'success' : 'error'}
                                sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>{t.volume}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>{t.entryPrice}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>{t.exitPrice || '-'}</TableCell>
                            <TableCell
                              sx={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: (t.profit || 0) >= 0 ? 'success.main' : 'error.main',
                              }}
                              align="right"
                            >
                              {formatCurrency(t.profit || 0, 'USD')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        {activeTab === 'PASTE_REPORT' && (
          <Button
            variant="contained"
            disabled={!rawText.trim() || importMutation.isPending}
            onClick={() => importMutation.mutate()}
            startIcon={
              importMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <CheckCircleRoundedIcon />
              )
            }
            sx={{
              fontWeight: 700,
              bgcolor: '#10B981',
              '&:hover': { bgcolor: '#059669' },
              textTransform: 'none',
            }}
          >
            {importMutation.isPending ? 'Importing & Reconciling...' : 'Import & Reconcile MT5 Trades'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

