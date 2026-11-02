import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import SnoozeRoundedIcon from '@mui/icons-material/SnoozeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api.js';
import { toast } from '../../../context/ToastContext.js';
import { ILiveAlertState } from '@tradevault/shared';

export interface LiveAlertCenterDialogProps {
  open: boolean;
  onClose: () => void;
}

export const LiveAlertCenterDialog: React.FC<LiveAlertCenterDialogProps> = ({ open, onClose }) => {
  const queryClient = useQueryClient();
  const [tabFilter, setTabFilter] = useState<'ACTIVE' | 'SNOOZED' | 'CLEARED' | 'ALL'>('ACTIVE');

  const {
    data: alerts = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ILiveAlertState[]>({
    queryKey: ['live-alerts'],
    queryFn: () => api.trades.getLiveAlerts(),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, durationMinutes }: { id: string; durationMinutes: number }) =>
      api.trades.snoozeLiveAlert(id, durationMinutes),
    onSuccess: (_, vars) => {
      toast.success(`Alert snoozed for ${vars.durationMinutes} minutes (synced with Telegram)`);
      queryClient.invalidateQueries({ queryKey: ['live-alerts'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to snooze alert');
    },
  });

  const clearMutation = useMutation({
    mutationFn: (id: string) => api.trades.clearLiveAlert(id),
    onSuccess: () => {
      toast.success('Alert cleared and resolved');
      queryClient.invalidateQueries({ queryKey: ['live-alerts'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to clear alert');
    },
  });

  const filteredAlerts = alerts.filter((a) => {
    if (tabFilter === 'ALL') return true;
    return a.state === tabFilter;
  });

  const activeCount = alerts.filter((a) => a.state === 'ACTIVE').length;
  const snoozedCount = alerts.filter((a) => a.state === 'SNOOZED').length;

  const formatIST = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const getAlertSeverityChip = (severity: number) => {
    if (severity >= 3) {
      return (
        <Chip
          icon={<ErrorOutlineRoundedIcon sx={{ fontSize: '13px !important' }} />}
          label="P1 CRITICAL"
          size="small"
          sx={{
            bgcolor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontWeight: 700,
            fontSize: '0.68rem',
            fontFamily: 'monospace',
          }}
        />
      );
    }
    if (severity === 2) {
      return (
        <Chip
          icon={<WarningAmberRoundedIcon sx={{ fontSize: '13px !important' }} />}
          label="P2 WARNING"
          size="small"
          sx={{
            bgcolor: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontWeight: 700,
            fontSize: '0.68rem',
            fontFamily: 'monospace',
          }}
        />
      );
    }
    return (
      <Chip
        label="P3 INFO"
        size="small"
        sx={{
          bgcolor: 'rgba(59, 130, 246, 0.15)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          fontWeight: 700,
          fontSize: '0.68rem',
          fontFamily: 'monospace',
        }}
      />
    );
  };

  const getAlertTitle = (type: string) => {
    switch (type) {
      case 'STOP_THREAT':
        return 'Stop Loss Breach Threat';
      case 'GIVEBACK':
        return 'Unrealized MFE Profit Leaking';
      case 'LADDER':
        return 'Target Milestone Reached';
      case 'DAILY_LOSS':
        return 'Account Daily Loss Limit Approached';
      case 'NAKED_POSITION':
        return 'Naked Position (Missing Stop Loss)';
      case 'TOKEN_EXPIRY':
        return 'FYERS Broker Token Expiring';
      case 'TRADE_OPENED':
        return 'Trade Opened';
      case 'TRADE_CLOSED':
        return 'Trade Closed';
      default:
        return type.replace(/_/g, ' ');
    }
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
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          p: 2.5,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: activeCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)',
              color: activeCount > 0 ? '#ef4444' : '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <NotificationsActiveRoundedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
              In-App Threat Alert Center
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.25 }}>
              <SyncAltRoundedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                Multi-channel sync: Snoozes & clears apply concurrently across Web & Telegram
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Refresh Alerts" arrow>
            <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
              <RefreshRoundedIcon fontSize="small" sx={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2.5 }}>
        <Tabs
          value={tabFilter}
          onChange={(_, val) => setTabFilter(val)}
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'none',
              px: 2,
            },
          }}
        >
          <Tab
            value="ACTIVE"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>Active</span>
                {activeCount > 0 && (
                  <Chip
                    label={activeCount}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      bgcolor: '#ef4444',
                      color: '#ffffff',
                    }}
                  />
                )}
              </Box>
            }
          />
          <Tab
            value="SNOOZED"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>Snoozed</span>
                {snoozedCount > 0 && (
                  <Chip
                    label={snoozedCount}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      bgcolor: 'rgba(245, 158, 11, 0.2)',
                      color: '#f59e0b',
                    }}
                  />
                )}
              </Box>
            }
          />
          <Tab value="CLEARED" label="Cleared / Resolved" />
          <Tab value="ALL" label={`All (${alerts.length})`} />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 2.5, minHeight: 320, maxHeight: 480, overflowY: 'auto' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Loading alert telemetry...
            </Typography>
          </Box>
        ) : filteredAlerts.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              textAlign: 'center',
            }}
          >
            <CheckCircleRoundedIcon sx={{ fontSize: 48, color: '#10b981', mb: 1.5, opacity: 0.8 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              All Systems Nominal
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mt: 0.5, fontSize: '0.82rem' }}>
              {tabFilter === 'ACTIVE'
                ? 'No active threat conditions detected. Your open positions and portfolio limits are within safe parameters.'
                : `No ${tabFilter.toLowerCase()} alerts in history.`}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {filteredAlerts.map((alert) => (
              <Card
                key={alert.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor:
                    alert.state === 'ACTIVE' && alert.severity >= 3
                      ? 'rgba(239, 68, 68, 0.04)'
                      : alert.state === 'ACTIVE'
                      ? 'rgba(245, 158, 11, 0.03)'
                      : 'background.default',
                  border: '1px solid',
                  borderColor:
                    alert.state === 'ACTIVE' && alert.severity >= 3
                      ? 'rgba(239, 68, 68, 0.35)'
                      : alert.state === 'ACTIVE'
                      ? 'rgba(245, 158, 11, 0.3)'
                      : 'divider',
                  transition: 'all 0.2s ease',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                      {getAlertSeverityChip(alert.severity)}
                      {alert.symbol && (
                        <Chip
                          label={alert.symbol}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            fontSize: '0.72rem',
                            bgcolor: 'action.hover',
                          }}
                        />
                      )}
                      {alert.direction && (
                        <Chip
                          label={alert.direction}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.65rem',
                            bgcolor: alert.direction === 'LONG' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: alert.direction === 'LONG' ? '#10b981' : '#ef4444',
                          }}
                        />
                      )}
                      <Chip
                        label={alert.state}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.65rem',
                          fontFamily: 'monospace',
                          bgcolor:
                            alert.state === 'ACTIVE'
                              ? 'rgba(239, 68, 68, 0.1)'
                              : alert.state === 'SNOOZED'
                              ? 'rgba(245, 158, 11, 0.1)'
                              : 'action.selected',
                          color:
                            alert.state === 'ACTIVE'
                              ? '#ef4444'
                              : alert.state === 'SNOOZED'
                              ? '#f59e0b'
                              : 'text.secondary',
                        }}
                      />
                    </Box>

                    <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                      {getAlertTitle(alert.type)}
                    </Typography>

                    {alert.lastMetricValue && (
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 0.5,
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          color: 'text.primary',
                          bgcolor: 'action.hover',
                          px: 1,
                          py: 0.4,
                          borderRadius: 1,
                          display: 'inline-block',
                        }}
                      >
                        {alert.lastMetricValue}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                        Triggered: {formatIST(alert.firstAt)} IST
                      </Typography>
                      {alert.enterCount > 1 && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                          Escalations: {alert.enterCount}x
                        </Typography>
                      )}
                      {alert.state === 'SNOOZED' && alert.snoozedUntil && (
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}
                        >
                          💤 Snoozed until {formatIST(alert.snoozedUntil)} IST
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Actions: Snooze / Clear */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    {alert.state === 'ACTIVE' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', mr: 0.5 }}>
                          Snooze:
                        </Typography>
                        {[15, 30, 60].map((mins) => (
                          <Button
                            key={mins}
                            size="small"
                            variant="outlined"
                            disabled={snoozeMutation.isPending}
                            onClick={() => snoozeMutation.mutate({ id: alert.id, durationMinutes: mins })}
                            sx={{
                              minWidth: 38,
                              px: 0.8,
                              py: 0.2,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              textTransform: 'none',
                              borderColor: 'divider',
                            }}
                          >
                            {mins}m
                          </Button>
                        ))}
                      </Box>
                    )}

                    {alert.state !== 'CLEARED' && alert.state !== 'RESOLVED' && (
                      <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        startIcon={<DoneAllRoundedIcon sx={{ fontSize: '14px !important' }} />}
                        disabled={clearMutation.isPending}
                        onClick={() => clearMutation.mutate(alert.id)}
                        sx={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'none',
                          color: 'text.secondary',
                          '&:hover': { color: 'text.primary' },
                        }}
                      >
                        Clear Alert
                      </Button>
                    )}
                  </Box>
                </Box>
              </Card>
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, px: 2.5, borderTop: '1px solid', borderColor: 'divider', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          Real-time hysteresis: Snoozed alerts will automatically un-snooze and escalate if stop loss is breached.
        </Typography>
        <Button onClick={onClose} variant="contained" size="small" sx={{ fontWeight: 700, textTransform: 'none', px: 2.5 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};
