import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Card,
  InputAdornment,
  CircularProgress,
  Alert,
  Tooltip,
  IconButton,
  Switch,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { IndianChargesCalculator, ChargesBreakdown } from '@tradevault/financial-engine';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { formatCurrency, currentLocalIsoDateTime } from '../../lib/utils.js';

export interface QuickCloseTradeProps {
  open: boolean;
  onClose: () => void;
  trade: any;
  accountBroker?: string;
  onSuccess?: () => void;
  defaultExitPrice?: number | string;
  defaultCloseRatio?: number; // e.g. 0.5 for 50% partial, 1.0 for full
}

export function QuickCloseTradeDialog({
  open,
  onClose,
  trade,
  accountBroker = 'ZERODHA',
  onSuccess,
  defaultExitPrice,
  defaultCloseRatio = 1.0,
}: QuickCloseTradeProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  const entryPrice = trade?.simpleExecution?.entryPrice || trade?.calculated?.averageEntryPrice || trade?.entryPrice || 0;
  const totalOpenQuantity =
    trade?.calculated?.openQuantity ??
    trade?.openQuantity ??
    trade?.simpleExecution?.quantity ??
    trade?.quantity ??
    1;
  const contractMultiplier = trade?.simpleExecution?.contractMultiplier || trade?.contractMultiplier || 1;
  const direction = trade?.direction || 'LONG';
  const marketSegment = trade?.marketSegment || 'NSE_EQ';
  const assetClass = trade?.assetClass || 'EQUITY';

  // State
  const [exitMode, setExitMode] = useState<'PARTIAL_50' | 'FULL' | 'CUSTOM'>(() => {
    return defaultCloseRatio === 0.5 && totalOpenQuantity > 1 ? 'PARTIAL_50' : 'FULL';
  });
  const [customQty, setCustomQty] = useState<string>(() => {
    return String(Math.max(1, Math.floor(totalOpenQuantity / 2)));
  });
  const [exitPrice, setExitPrice] = useState<string>('');
  const [exitTime, setExitTime] = useState<string>('');
  const [manualFeesOverride, setManualFeesOverride] = useState(false);
  const [customExitFees, setCustomExitFees] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executeOnBroker, setExecuteOnBroker] = useState<boolean>(true);

  // Determine actual quantity being closed
  const selectedCloseQty = useMemo(() => {
    if (exitMode === 'PARTIAL_50') {
      return Math.max(1, Math.floor(totalOpenQuantity / 2));
    }
    if (exitMode === 'CUSTOM') {
      const parsed = parseInt(customQty, 10);
      if (isNaN(parsed) || parsed <= 0) return 1;
      return Math.min(totalOpenQuantity, parsed);
    }
    return totalOpenQuantity;
  }, [exitMode, customQty, totalOpenQuantity]);

  const remainingQty = Math.max(0, totalOpenQuantity - selectedCloseQty);
  const isPartial = selectedCloseQty < totalOpenQuantity;

  // Initialize defaults whenever trade opens
  useEffect(() => {
    if (open && trade) {
      setErrorMessage(null);
      setManualFeesOverride(false);
      setCustomExitFees('');
      const initialPrice =
        defaultExitPrice !== undefined && defaultExitPrice !== null && defaultExitPrice !== ''
          ? String(defaultExitPrice)
          : trade?.simpleExecution?.exitPrice
          ? String(trade.simpleExecution.exitPrice)
          : '';
      setExitPrice(initialPrice);

      setExitMode(defaultCloseRatio === 0.5 && totalOpenQuantity > 1 ? 'PARTIAL_50' : 'FULL');
      setCustomQty(String(Math.max(1, Math.floor(totalOpenQuantity / 2))));

      // Default exit time to current local time in ISO format for datetime-local
      setExitTime(currentLocalIsoDateTime());
    }
  }, [open, trade, defaultExitPrice, defaultCloseRatio, totalOpenQuantity]);

  const numExitPrice = parseFloat(exitPrice);
  const isPriceValid = !isNaN(numExitPrice) && numExitPrice > 0;

  // Auto compute charges using @tradevault/financial-engine for the selected close quantity
  const autoCharges: ChargesBreakdown | null = useMemo(() => {
    if (!isPriceValid || entryPrice <= 0 || selectedCloseQty <= 0) return null;
    try {
      return IndianChargesCalculator.calculate(
        assetClass as any,
        marketSegment as any,
        entryPrice,
        numExitPrice,
        selectedCloseQty,
        contractMultiplier,
        20,
        accountBroker
      );
    } catch {
      return null;
    }
  }, [isPriceValid, entryPrice, numExitPrice, selectedCloseQty, contractMultiplier, accountBroker, marketSegment, assetClass]);

  // Live P&L computation on closed quantity
  const { grossPnL, totalCosts, netPnL } = useMemo(() => {
    if (!isPriceValid || entryPrice <= 0 || selectedCloseQty <= 0) {
      return { grossPnL: 0, totalCosts: 0, netPnL: 0 };
    }
    const rawGross = direction === 'LONG'
      ? (numExitPrice - entryPrice) * selectedCloseQty * contractMultiplier
      : (entryPrice - numExitPrice) * selectedCloseQty * contractMultiplier;

    let costs = 0;
    if (manualFeesOverride) {
      costs = parseFloat(customExitFees) || 0;
    } else if (autoCharges) {
      costs = autoCharges.totalCosts;
    } else {
      costs = (trade?.simpleExecution?.brokerage || 0) +
        (trade?.simpleExecution?.exchangeFees || 0) +
        (trade?.simpleExecution?.taxes || 0);
    }

    const net = rawGross - costs;
    return {
      grossPnL: Number(rawGross.toFixed(2)),
      totalCosts: Number(costs.toFixed(2)),
      netPnL: Number(net.toFixed(2)),
    };
  }, [isPriceValid, entryPrice, numExitPrice, selectedCloseQty, contractMultiplier, direction, manualFeesOverride, customExitFees, autoCharges, trade]);

  // Mutation to close the trade (partial or full)
  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!isPriceValid) throw new Error('Please enter a valid positive exit price.');
      if (!exitTime) throw new Error('Please specify an exit timestamp.');
      if (selectedCloseQty <= 0 || selectedCloseQty > totalOpenQuantity) {
        throw new Error(`Close quantity must be between 1 and ${totalOpenQuantity}.`);
      }

      if (executeOnBroker) {
        return api.trades.liveBrokerExit(trade.id || trade._id, {
          quantity: selectedCloseQty,
          exitPrice: numExitPrice,
          isFullClose: !isPartial,
          executeBroker: true,
        });
      }

      const exitIso = new Date(exitTime).toISOString();

      const feesToSave = manualFeesOverride && customExitFees !== ''
        ? {
            otherFees: parseFloat(customExitFees) || 0,
          }
        : autoCharges
        ? {
            brokerage: autoCharges.brokerage,
            exchangeFees: autoCharges.exchangeFees,
            regulatoryFees: autoCharges.regulatoryFees,
            taxes: autoCharges.taxes,
            otherFees: 0,
          }
        : {};

      if (isPartial) {
        // Advanced multi-fill execution for partial exit
        let updatedFills: any[] = [];
        if (trade.fills && Array.isArray(trade.fills) && trade.fills.length > 0) {
          updatedFills = [
            ...trade.fills,
            {
              fillId: `fill-exit-${Date.now()}`,
              type: 'EXIT',
              price: numExitPrice,
              quantity: selectedCloseQty,
              timestamp: exitIso,
              brokerage: autoCharges?.brokerage ?? 20,
              exchangeFee: autoCharges?.exchangeFees ?? 0,
              taxes: autoCharges?.taxes ?? 0,
              notes: `Live partial close (${selectedCloseQty} of ${totalOpenQuantity} qty @ ₹${numExitPrice})`,
            },
          ];
        } else {
          // Transition SIMPLE mode trade to ADVANCED mode with original entry and new partial exit
          const entryTimeStr = trade.entryTime ? new Date(trade.entryTime).toISOString() : exitIso;
          updatedFills = [
            {
              fillId: `fill-entry-${trade.id || trade._id}`,
              type: 'ENTRY',
              price: entryPrice,
              quantity: totalOpenQuantity,
              timestamp: entryTimeStr,
              brokerage: 20,
              exchangeFee: 0,
              taxes: 0,
              notes: 'Initial position entry',
            },
            {
              fillId: `fill-exit-${Date.now()}`,
              type: 'EXIT',
              price: numExitPrice,
              quantity: selectedCloseQty,
              timestamp: exitIso,
              brokerage: autoCharges?.brokerage ?? 20,
              exchangeFee: autoCharges?.exchangeFees ?? 0,
              taxes: autoCharges?.taxes ?? 0,
              notes: `Live partial close (${selectedCloseQty} of ${totalOpenQuantity} qty @ ₹${numExitPrice})`,
            },
          ];
        }

        return api.trades.update(trade.id || trade._id, {
          executionMode: 'ADVANCED',
          status: 'OPEN',
          fills: updatedFills,
        });
      } else {
        // 100% Full close
        return api.trades.update(trade.id || trade._id, {
          status: 'CLOSED',
          exitTime: exitIso,
          simpleExecution: {
            exitPrice: numExitPrice,
            ...feesToSave,
          },
        });
      }
    },
    onSuccess: (data: any) => {
      if (data?.brokerResult?.executedOnBroker) {
        toast.success(`🟢 FYERS Live: ${data.brokerResult.message || `Exit executed for ${selectedCloseQty} qty`}`);
      } else if (isPartial) {
        toast.success(`Partial exit of ${selectedCloseQty} qty @ ₹${numExitPrice} executed (+₹${netPnL} locked). Remaining: ${remainingQty} qty.`);
      } else {
        toast.success(`Trade ${trade.symbol} closed successfully.`);
      }
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['trade', trade.id || trade._id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to close trade position.');
    },
  });

  if (!trade) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : '#FFFFFF',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${muiTheme.palette.divider}`,
            boxShadow: isDark
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
              : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1.5,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleRoundedIcon color={isPartial ? 'success' : 'primary'} sx={{ fontSize: 22 }} />
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>
            {isPartial ? 'Book Partial Profit' : 'Close Trade Position'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: muiTheme.palette.text.secondary }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2.5 }}>
        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ borderRadius: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Trade Identity Summary Card */}
        <Card
          variant="outlined"
          sx={{
            p: 1.75,
            borderRadius: 2,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            borderColor: muiTheme.palette.divider,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                {trade.symbol}
              </Typography>
              <Chip
                label={direction}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: direction === 'LONG' ? muiTheme.palette.profit.bg : muiTheme.palette.loss.bg,
                  color: direction === 'LONG' ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                }}
              />
            </Box>
            <Chip
              label={trade.status}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.625rem',
                fontWeight: 600,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}>
            <span>Entry: <strong style={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary }}>₹{entryPrice}</strong></span>
            <span>Total Position: <strong style={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary }}>{totalOpenQuantity} Qty</strong></span>
            <span>Account: <strong>{trade.accountName || 'Trading Account'}</strong></span>
          </Box>
        </Card>

        {/* Position Exit Ratio Selector */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
              Execution Scope
            </Typography>
            {isPartial && (
              <Chip
                label="PARTIAL EXIT"
                size="small"
                color="success"
                sx={{ height: 18, fontSize: '0.6rem', fontWeight: 800 }}
              />
            )}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
            <Button
              size="small"
              variant={exitMode === 'PARTIAL_50' ? 'contained' : 'outlined'}
              color="primary"
              onClick={() => setExitMode('PARTIAL_50')}
              sx={{
                flexDirection: 'column',
                py: 0.75,
                textTransform: 'none',
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              <span>50% Partial</span>
              <Typography variant="caption" sx={{ fontSize: '0.625rem', opacity: 0.85 }}>
                {Math.max(1, Math.floor(totalOpenQuantity / 2))} Qty
              </Typography>
            </Button>

            <Button
              size="small"
              variant={exitMode === 'FULL' ? 'contained' : 'outlined'}
              color="inherit"
              onClick={() => setExitMode('FULL')}
              sx={{
                flexDirection: 'column',
                py: 0.75,
                textTransform: 'none',
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              <span>100% Full</span>
              <Typography variant="caption" sx={{ fontSize: '0.625rem', opacity: 0.85 }}>
                All {totalOpenQuantity} Qty
              </Typography>
            </Button>

            <Button
              size="small"
              variant={exitMode === 'CUSTOM' ? 'contained' : 'outlined'}
              color="inherit"
              onClick={() => setExitMode('CUSTOM')}
              sx={{
                flexDirection: 'column',
                py: 0.75,
                textTransform: 'none',
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              <span>Custom Qty</span>
              <Typography variant="caption" sx={{ fontSize: '0.625rem', opacity: 0.85 }}>
                {selectedCloseQty} Qty
              </Typography>
            </Button>
          </Box>

          {exitMode === 'CUSTOM' && (
            <TextField
              size="small"
              type="number"
              label="Quantity to Exit"
              value={customQty}
              onChange={(e) => setCustomQty(e.target.value)}
              slotProps={{
                input: {
                  inputProps: { min: 1, max: totalOpenQuantity },
                  sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
                },
              }}
              helperText={`Enter between 1 and ${totalOpenQuantity} quantity to exit`}
            />
          )}

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
              py: 0.8,
              borderRadius: 1.5,
              backgroundColor: isPartial ? (isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)') : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'),
              border: `1px solid ${isPartial ? 'rgba(16, 185, 129, 0.3)' : muiTheme.palette.divider}`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Closing: <span style={{ color: muiTheme.palette.primary.main }}>{selectedCloseQty} Qty</span>
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Runner Remaining:{' '}
              <strong style={{ color: remainingQty > 0 ? (isDark ? '#34D399' : '#059669') : 'inherit' }}>
                {remainingQty} Qty
              </strong>
            </Typography>
          </Box>
        </Box>

        {/* Live Broker Execution (FYERS) Toggle */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: executeOnBroker
              ? isDark
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(16, 185, 129, 0.08)'
              : isDark
              ? 'rgba(100, 116, 139, 0.1)'
              : 'rgba(100, 116, 139, 0.05)',
            border: '1px solid',
            borderColor: executeOnBroker ? 'rgba(16, 185, 129, 0.3)' : 'rgba(100, 116, 139, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                bgcolor: executeOnBroker ? '#10B981' : '#64748B',
                boxShadow: executeOnBroker ? '0 0 8px #10B981' : 'none',
              }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 800, color: executeOnBroker ? '#10B981' : 'text.secondary' }}>
                Live Broker Order (FYERS API v3)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.72rem' }}>
                {executeOnBroker
                  ? `Places a real market exit order for ${selectedCloseQty} qty directly with FYERS exchange gateway`
                  : 'Record in SetupMint journal only without placing exchange order'}
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={executeOnBroker}
            onChange={(e) => setExecuteOnBroker(e.target.checked)}
            color="success"
            size="small"
          />
        </Box>

        {/* Exit Price Input */}
        <TextField
          label="Exit Price"
          type="number"
          required
          autoFocus
          value={exitPrice}
          onChange={(e) => setExitPrice(e.target.value)}
          placeholder={`e.g. ${entryPrice}`}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
            },
          }}
          helperText="Execution price at which the position was closed"
        />

        {/* Exit Timestamp Input */}
        <TextField
          label="Exit Date & Time"
          type="datetime-local"
          required
          value={exitTime}
          onChange={(e) => setExitTime(e.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.875rem' } },
          }}
        />

        {/* Fees Section */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Statutory Charges & Fees
              </Typography>
              <Chip
                label={manualFeesOverride ? 'MANUAL' : 'AUTO'}
                size="small"
                color={manualFeesOverride ? 'warning' : 'primary'}
                sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 800 }}
              />
            </Box>
            {manualFeesOverride ? (
              <Button
                size="small"
                startIcon={<RestartAltRoundedIcon sx={{ fontSize: 14 }} />}
                onClick={() => {
                  setManualFeesOverride(false);
                  setCustomExitFees('');
                }}
                sx={{ fontSize: '0.6875rem', py: 0.2 }}
              >
                Reset to Auto
              </Button>
            ) : (
              <Button
                size="small"
                startIcon={<AutoFixHighRoundedIcon sx={{ fontSize: 14 }} />}
                onClick={() => {
                  setManualFeesOverride(true);
                  setCustomExitFees(autoCharges ? String(autoCharges.totalCosts) : '0');
                }}
                sx={{ fontSize: '0.6875rem', py: 0.2 }}
              >
                Override
              </Button>
            )}
          </Box>

          {manualFeesOverride ? (
            <TextField
              size="small"
              type="number"
              label="Custom Round-Trip Fees"
              value={customExitFees}
              onChange={(e) => setCustomExitFees(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  sx: { fontFamily: `'JetBrains Mono', monospace` },
                },
              }}
              helperText="Overrides automatic statutory calculation for this exit"
            />
          ) : (
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Auto-calculated: {formatCurrency(totalCosts)} ({accountBroker || 'Broker'} • {marketSegment})
            </Typography>
          )}
        </Box>

        {/* Live Calculation Preview Banner */}
        <Card
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)',
            borderColor: netPnL > 0
              ? muiTheme.palette.profit.main
              : netPnL < 0
              ? muiTheme.palette.loss.main
              : muiTheme.palette.divider,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Gross P&L
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
              {isPriceValid ? formatCurrency(grossPnL) : '—'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Total Costs & Taxes
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary }}>
              {isPriceValid ? formatCurrency(totalCosts) : '—'}
            </Typography>
          </Box>
          <Box
            sx={{
              pt: 1,
              mt: 0.5,
              borderTop: `1px dashed ${muiTheme.palette.divider}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              Net Realized P&L
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                color: netPnL > 0
                  ? muiTheme.palette.profit.main
                  : netPnL < 0
                  ? muiTheme.palette.loss.main
                  : muiTheme.palette.text.primary,
              }}
            >
              {isPriceValid ? formatCurrency(netPnL) : '₹0.00'}
            </Typography>
          </Box>
        </Card>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} disabled={closeMutation.isPending} sx={{ fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={isPartial ? 'success' : 'primary'}
          onClick={() => closeMutation.mutate()}
          disabled={!isPriceValid || closeMutation.isPending}
          startIcon={closeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
          sx={{ fontWeight: 700, borderRadius: 2 }}
        >
          {closeMutation.isPending
            ? 'Transmitting Order...'
            : executeOnBroker
            ? isPartial
              ? `⚡ Execute 50% Live Exit (${selectedCloseQty} Qty)`
              : `⚡ Execute Live Close (${selectedCloseQty} Qty)`
            : isPartial
            ? `Book ${selectedCloseQty} Qty Partial Exit`
            : `Close Full Position (${selectedCloseQty} Qty)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
