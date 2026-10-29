import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DangerousRoundedIcon from '@mui/icons-material/DangerousRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { ILiveOpenTradeMetric, ILiveWatcherSummary } from '@tradevault/shared';
import { api } from '../../../lib/api.js';
import { soundEngine } from '../../../lib/sound-engine.js';
import { notificationService } from '../../../lib/notification-service.js';
import { formatCurrency } from '../../../lib/utils.js';

export interface PanicKillSwitchDialogProps {
  open: boolean;
  onClose: () => void;
  summary: ILiveWatcherSummary | null;
  onCompleted: () => void;
}

export function PanicKillSwitchDialog({
  open,
  onClose,
  summary,
  onCompleted,
}: PanicKillSwitchDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [executeBroker, setExecuteBroker] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [progressMap, setProgressMap] = useState<Record<string, 'PENDING' | 'DONE' | 'ERROR'>>({});

  const positions = summary?.positions || [];
  const openCount = positions.length;
  const netMtm = summary?.totalFloatingNetPnL ?? 0;

  const handleExecuteKillSwitch = async () => {
    setIsExecuting(true);
    soundEngine.playKillSwitch();

    const newMap: Record<string, 'PENDING' | 'DONE' | 'ERROR'> = {};
    positions.forEach((p) => {
      newMap[p.tradeId] = 'PENDING';
    });
    setProgressMap(newMap);

    let successCount = 0;
    let failCount = 0;

    for (const pos of positions) {
      try {
        await api.trades.liveBrokerExit(pos.tradeId, {
          quantity: pos.quantity,
          exitPrice: pos.currentLtp,
          isFullClose: true,
          executeBroker,
        });
        setProgressMap((prev) => ({ ...prev, [pos.tradeId]: 'DONE' }));
        successCount++;
      } catch (err) {
        console.error(`Kill switch exit failed for ${pos.symbol}:`, err);
        setProgressMap((prev) => ({ ...prev, [pos.tradeId]: 'ERROR' }));
        failCount++;
      }
    }

    notificationService.sendNotification('🚨 Kill Switch Completed', {
      body: `Closed ${successCount} of ${positions.length} open positions ${
        executeBroker ? 'on FYERS & Journal' : 'in Journal'
      }.`,
    });

    setIsExecuting(false);
    onCompleted();
  };

  return (
    <Dialog
      open={open}
      onClose={isExecuting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            border: '2px solid #EF4444',
            bgcolor: isDark ? '#0B0F19' : '#FFFFFF',
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          color: '#EF4444',
          bgcolor: alpha('#EF4444', 0.1),
          py: 2,
        }}
      >
        <DangerousRoundedIcon sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '0.02em' }}>
            EMERGENCY PANIC KILL SWITCH
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Immediately square off all open positions and cancel open stop orders
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Alert
          severity="error"
          icon={<WarningAmberRoundedIcon sx={{ fontSize: 28 }} />}
          sx={{
            mb: 2.5,
            bgcolor: alpha('#EF4444', 0.08),
            color: isDark ? '#FCA5A5' : '#991B1B',
            border: `1px solid ${alpha('#EF4444', 0.3)}`,
          }}
        >
          <strong>High-Urgency Action:</strong> This will place MARKET orders to close all{' '}
          <strong>{openCount}</strong> active positions simultaneously.
        </Alert>

        {/* Portfolio Summary Card */}
        <Box
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 2,
            bgcolor: isDark ? alpha('#1E293B', 0.6) : alpha('#F1F5F9', 0.8),
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              OPEN POSITIONS
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {openCount}
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              TOTAL FLOATING MTM
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                color: netMtm >= 0 ? '#10B981' : '#EF4444',
              }}
            >
              {formatCurrency(netMtm)}
            </Typography>
          </Box>
        </Box>

        {/* Positions Table */}
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 240 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Side</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">LTP</TableCell>
                <TableCell align="right">Floating P&L</TableCell>
                <TableCell align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((p) => {
                const status = progressMap[p.tradeId];
                return (
                  <TableRow key={p.tradeId}>
                    <TableCell sx={{ fontWeight: 700 }}>{p.symbol}</TableCell>
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          px: 0.8,
                          py: 0.2,
                          borderRadius: 1,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          bgcolor: p.direction === 'LONG' ? alpha('#10B981', 0.15) : alpha('#EF4444', 0.15),
                          color: p.direction === 'LONG' ? '#10B981' : '#EF4444',
                        }}
                      >
                        {p.direction}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{p.quantity}</TableCell>
                    <TableCell align="right">₹{p.currentLtp.toFixed(2)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        color: p.floatingNetPnL >= 0 ? '#10B981' : '#EF4444',
                      }}
                    >
                      {formatCurrency(p.floatingNetPnL)}
                    </TableCell>
                    <TableCell align="center">
                      {status === 'PENDING' && <CircularProgress size={16} sx={{ color: '#EF4444' }} />}
                      {status === 'DONE' && <CheckCircleRoundedIcon sx={{ color: '#10B981', fontSize: 18 }} />}
                      {status === 'ERROR' && <DangerousRoundedIcon sx={{ color: '#EF4444', fontSize: 18 }} />}
                      {!status && <Typography variant="caption">Ready</Typography>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Broker Mode Switch */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: executeBroker ? alpha('#EF4444', 0.4) : alpha('#64748B', 0.3),
            bgcolor: executeBroker ? alpha('#EF4444', 0.05) : 'transparent',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {executeBroker ? '⚡ Execute Live on FYERS' : 'Journal Only (No Broker Orders)'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {executeBroker
                ? 'Dispatches market close orders directly to FYERS exchange API'
                : 'Closes trades in SetupMint journal records without sending broker orders'}
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={executeBroker}
                onChange={(e) => setExecuteBroker(e.target.checked)}
                color="error"
                disabled={isExecuting}
              />
            }
            label=""
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={isExecuting} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleExecuteKillSwitch}
          disabled={isExecuting || openCount === 0}
          startIcon={isExecuting ? <CircularProgress size={18} color="inherit" /> : <DangerousRoundedIcon />}
          sx={{
            fontWeight: 800,
            px: 3,
            py: 1,
            bgcolor: '#DC2626',
            '&:hover': { bgcolor: '#B91C1C' },
          }}
        >
          {isExecuting ? 'FLATTENING POSITIONS...' : 'FLATTEN ALL POSITIONS NOW'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
