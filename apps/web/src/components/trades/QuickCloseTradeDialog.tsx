import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import {
  IndianChargesCalculator,
  ChargesBreakdown,
  calculatePreFlightExecutionPreview,
  IPreFlightExecutionPreviewResult,
  resolveAccountUiCapabilities,
} from '@tradevault/financial-engine';
import { ILiveDataHealth } from '@tradevault/shared';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { formatCurrency, currentLocalIsoDateTime, getCurrencySymbol } from '../../lib/utils.js';
import { useAccountScope, useAccountCapabilities } from '../../context/AccountScopeContext.js';
import { HoldToConfirmButton } from './live/HoldToConfirmButton.js';

export interface QuickCloseTradeProps {
  open: boolean;
  onClose: () => void;
  trade: any;
  accountBroker?: string;
  onSuccess?: (closedTradeData?: any) => void;
  defaultExitPrice?: number | string;
  defaultCloseRatio?: number; // e.g. 0.5 for 50% partial, 1.0 for full
  dataHealth?: ILiveDataHealth;
}

export type OrderExecutionStage = 'IDLE' | 'SENDING' | 'WORKING' | 'FILLED' | 'REJECTED';

export function QuickCloseTradeDialog({
  open,
  onClose,
  trade,
  accountBroker = 'ZERODHA',
  onSuccess,
  defaultExitPrice,
  defaultCloseRatio = 1.0,
  dataHealth,
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

  // Dynamic instrument lot size resolution
  const lotSize = useMemo(() => {
    if (trade?.lotSize && trade.lotSize > 0) return trade.lotSize;
    const sym = (trade?.symbol || '').toUpperCase();
    if (sym.includes('NIFTY') && !sym.includes('BANKNIFTY') && !sym.includes('FINNIFTY') && !sym.includes('MIDCPNIFTY')) {
      if (totalOpenQuantity % 65 === 0) return 65;
      if (totalOpenQuantity % 25 === 0) return 25;
      if (totalOpenQuantity % 50 === 0) return 50;
      if (totalOpenQuantity % 75 === 0) return 75;
      return 65;
    }
    if (sym.includes('BANKNIFTY')) {
      if (totalOpenQuantity % 15 === 0) return 15;
      if (totalOpenQuantity % 30 === 0) return 30;
      return 15;
    }
    if (sym.includes('FINNIFTY')) {
      if (totalOpenQuantity % 25 === 0) return 25;
      if (totalOpenQuantity % 40 === 0) return 40;
      return 25;
    }
    if (sym.includes('MIDCPNIFTY')) return 50;
    if (sym.includes('SENSEX')) return 10;
    if (contractMultiplier > 1) return contractMultiplier;
    return 1;
  }, [trade, totalOpenQuantity, contractMultiplier]);

  const isLotBased = lotSize > 1;
  const totalLots = isLotBased ? Math.max(1, Math.floor(totalOpenQuantity / lotSize)) : totalOpenQuantity;

  const isMt5Trade = Boolean(
    (trade as any)?.isMt5 ||
    (trade as any)?.tags?.some((t: string) => t.toUpperCase() === 'MT5' || t.toUpperCase() === 'ELEFIN' || t.startsWith('MT5_TICKET')) ||
    trade?.importBatchId?.startsWith('MT5_') ||
    (trade as any)?.accountBroker === 'Elefin' ||
    (trade as any)?.accountBroker === 'MT5'
  );

  const { accounts } = useAccountScope();
  const scopeCaps = useAccountCapabilities();
  const tradeAccount = useMemo(() => {
    return accounts.find((a: any) => a.id === trade?.accountId || a._id === trade?.accountId);
  }, [accounts, trade?.accountId]);

  const tradeCaps = useMemo(() => {
    if (!tradeAccount) return scopeCaps;
    return resolveAccountUiCapabilities({ mode: 'ACCOUNT', accountId: tradeAccount.id || tradeAccount._id }, accounts);
  }, [tradeAccount, accounts, scopeCaps]);

  const canBrokerExecute = tradeCaps.broker.canExecuteLive;

  const isUsdTrade =
    trade?.currency === 'USD' ||
    trade?.symbol?.includes('USD') ||
    trade?.symbol === 'XAUUSD' ||
    trade?.assetClass === 'FOREX' ||
    isMt5Trade;

  const tradeCurrency = trade?.currency || tradeAccount?.baseCurrency || tradeCaps.currency.code || (isUsdTrade ? 'USD' : 'INR');
  const currSym = tradeCaps.currency.symbol || getCurrencySymbol(tradeCurrency);

  // Data health & provider guard check
  const effectiveDataHealth: ILiveDataHealth | undefined = dataHealth || trade?.dataHealth;
  const isBrokerExecutionBlocked = effectiveDataHealth ? !effectiveDataHealth.canExecuteBroker : false;
  const brokerBlockReason = effectiveDataHealth?.brokerExecutionBlockedReason;

  // State
  const [exitMode, setExitMode] = useState<'PARTIAL_50' | 'FULL' | 'CUSTOM'>(() => {
    if (defaultCloseRatio === 0.5) {
      if (isLotBased && totalLots <= 1) return 'FULL';
      if (totalOpenQuantity > 1) return 'PARTIAL_50';
    }
    return 'FULL';
  });
  const [customQty, setCustomQty] = useState<string>(() => {
    if (isLotBased) {
      const halfLots = Math.max(1, Math.round(totalLots * 0.5));
      return String(halfLots * lotSize);
    }
    return String(Math.max(1, Math.floor(totalOpenQuantity / 2)));
  });
  const [exitPrice, setExitPrice] = useState<string>('');
  const [exitTime, setExitTime] = useState<string>('');
  const [manualFeesOverride, setManualFeesOverride] = useState(false);
  const [customExitFees, setCustomExitFees] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executeOnBroker, setExecuteOnBroker] = useState<boolean>(() => canBrokerExecute && !isBrokerExecutionBlocked);

  // Stepper & order state
  const [orderStage, setOrderStage] = useState<OrderExecutionStage>('IDLE');
  const [brokerResultDetails, setBrokerResultDetails] = useState<{
    orderId?: string;
    commandId?: string;
    tradedPrice?: number;
    tradedQty?: number;
    orderStatus?: string;
    message?: string;
  } | null>(null);

  // Double-submission lock
  const isSubmittingRef = useRef(false);

  // Determine actual quantity being closed
  const selectedCloseQty = useMemo(() => {
    if (exitMode === 'PARTIAL_50') {
      if (isLotBased) {
        if (totalLots > 1) {
          const lotsToClose = Math.max(1, Math.round(totalLots * 0.5));
          return lotsToClose * lotSize;
        }
        return totalOpenQuantity;
      }
      return Math.max(1, Math.floor(totalOpenQuantity / 2));
    }
    if (exitMode === 'CUSTOM') {
      const parsed = parseInt(customQty, 10);
      if (isNaN(parsed) || parsed <= 0) return isLotBased ? lotSize : 1;
      return Math.min(totalOpenQuantity, parsed);
    }
    return totalOpenQuantity;
  }, [exitMode, customQty, totalOpenQuantity, isLotBased, totalLots, lotSize]);

  const remainingQty = Math.max(0, totalOpenQuantity - selectedCloseQty);
  const isPartial = selectedCloseQty < totalOpenQuantity;

  // Initialize defaults whenever trade opens
  useEffect(() => {
    if (open && trade) {
      setErrorMessage(null);
      setOrderStage('IDLE');
      setBrokerResultDetails(null);
      isSubmittingRef.current = false;
      setManualFeesOverride(false);
      setCustomExitFees('');
      const initialPrice =
        defaultExitPrice !== undefined && defaultExitPrice !== null && defaultExitPrice !== ''
          ? String(defaultExitPrice)
          : trade?.currentLtp
          ? String(trade.currentLtp)
          : trade?.simpleExecution?.exitPrice
          ? String(trade.simpleExecution.exitPrice)
          : '';
      setExitPrice(initialPrice);

      setExitMode(defaultCloseRatio === 0.5 && totalOpenQuantity > 1 ? 'PARTIAL_50' : 'FULL');
      setCustomQty(String(Math.max(1, Math.floor(totalOpenQuantity / 2))));

      // Default exit time to current local time in ISO format for datetime-local
      setExitTime(currentLocalIsoDateTime());

      // If broker execution is blocked or not supported, force journal only
      if (!canBrokerExecute || isBrokerExecutionBlocked) {
        setExecuteOnBroker(false);
      } else {
        setExecuteOnBroker(true);
      }
    }
  }, [open, trade, defaultExitPrice, defaultCloseRatio, totalOpenQuantity, canBrokerExecute, isBrokerExecutionBlocked]);

  const numExitPrice = parseFloat(exitPrice);
  const isPriceValid = !isNaN(numExitPrice) && numExitPrice > 0;

  // Reference price for slippage detection
  const referencePrice = trade?.currentLtp || trade?.calculated?.currentLtp || entryPrice;

  // Pre-flight execution preview calculated via @tradevault/financial-engine Decimal.js
  const preFlightPreview: IPreFlightExecutionPreviewResult | null = useMemo(() => {
    if (!isPriceValid || entryPrice <= 0 || selectedCloseQty <= 0) return null;
    try {
      return calculatePreFlightExecutionPreview({
        entryPrice,
        currentLtp: numExitPrice,
        totalOpenQuantity,
        exitQuantity: selectedCloseQty,
        direction: direction as any,
        lotSize,
        contractMultiplier,
        initialRiskAmount: trade?.risk?.plannedRiskAmount || trade?.risk?.riskBudgetAmount,
        initialStopLoss: trade?.risk?.initialStopLoss,
        currentStopLoss: trade?.risk?.currentStopLoss,
        assetClass: assetClass as any,
        marketSegment: marketSegment as any,
        referencePrice,
        slippageGuardPercent: 0.5,
      });
    } catch {
      return null;
    }
  }, [
    isPriceValid,
    entryPrice,
    numExitPrice,
    totalOpenQuantity,
    selectedCloseQty,
    direction,
    lotSize,
    contractMultiplier,
    trade,
    assetClass,
    marketSegment,
    referencePrice,
  ]);

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
        accountBroker,
        direction,
        tradeCurrency
      );
    } catch {
      return null;
    }
  }, [isPriceValid, entryPrice, numExitPrice, selectedCloseQty, contractMultiplier, accountBroker, marketSegment, assetClass, direction, isUsdTrade]);

  // Live P&L computation on closed quantity
  const { grossPnL, totalCosts, netPnL, realizedR } = useMemo(() => {
    if (!preFlightPreview) {
      return { grossPnL: 0, totalCosts: 0, netPnL: 0, realizedR: null };
    }
    let costs = preFlightPreview.estimatedCharges;
    if (manualFeesOverride) {
      costs = parseFloat(customExitFees) || 0;
    } else if (autoCharges) {
      costs = autoCharges.totalCosts;
    }
    const net = preFlightPreview.grossPnL - costs;
    return {
      grossPnL: preFlightPreview.grossPnL,
      totalCosts: Number(costs.toFixed(2)),
      netPnL: Number(net.toFixed(2)),
      realizedR: preFlightPreview.realizedR,
    };
  }, [preFlightPreview, manualFeesOverride, customExitFees, autoCharges]);

  // Mutation to close the trade (partial or full)
  const closeMutation = useMutation({
    mutationFn: async () => {
      if (isSubmittingRef.current) throw new Error('Order execution is already in flight.');
      if (!isPriceValid) throw new Error('Please enter a valid positive exit price.');
      if (!exitTime) throw new Error('Please specify an exit timestamp.');
      if (selectedCloseQty <= 0 || selectedCloseQty > totalOpenQuantity) {
        throw new Error(`Close quantity must be between 1 and ${totalOpenQuantity}.`);
      }

      isSubmittingRef.current = true;
      setOrderStage('SENDING');

      // Progress stepper to WORKING state after slight delay
      const workingTimer = setTimeout(() => {
        setOrderStage((prev) => (prev === 'SENDING' ? 'WORKING' : prev));
      }, 350);

      try {
        if (executeOnBroker) {
          const res = await api.trades.liveBrokerExit(trade.id || trade._id, {
            quantity: selectedCloseQty,
            exitPrice: numExitPrice,
            isFullClose: !isPartial,
            executeBroker: true,
            idempotencyKey: `${trade.id || trade._id}_exit_${Date.now()}`,
          });
          clearTimeout(workingTimer);
          return res;
        }

        const exitIso = new Date(exitTime).toISOString();
        const feesToSave = manualFeesOverride && customExitFees !== ''
          ? { otherFees: parseFloat(customExitFees) || 0 }
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
                notes: `Live partial close (${selectedCloseQty} of ${totalOpenQuantity} qty @ ${currSym}${numExitPrice})`,
              },
            ];
          } else {
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
                notes: `Live partial close (${selectedCloseQty} of ${totalOpenQuantity} qty @ ${currSym}${numExitPrice})`,
              },
            ];
          }

          const res = await api.trades.update(trade.id || trade._id, {
            executionMode: 'ADVANCED',
            status: 'OPEN',
            fills: updatedFills,
          });
          clearTimeout(workingTimer);
          return res;
        } else {
          const res = await api.trades.update(trade.id || trade._id, {
            status: 'CLOSED',
            exitTime: exitIso,
            simpleExecution: {
              exitPrice: numExitPrice,
              ...feesToSave,
            },
          });
          clearTimeout(workingTimer);
          return res;
        }
      } catch (err: any) {
        clearTimeout(workingTimer);
        isSubmittingRef.current = false;
        throw err;
      }
    },
    onSuccess: (data: any) => {
      isSubmittingRef.current = false;
      const bRes = data?.brokerResult;
      setBrokerResultDetails(bRes || null);

      if (bRes && bRes.orderStatus === 'REJECTED') {
        setOrderStage('REJECTED');
        setErrorMessage(bRes.message || 'Broker order was rejected by exchange.');
        return;
      }

      setOrderStage('FILLED');

      if (bRes?.action === 'QUEUED_TO_MT5' || isMt5Trade) {
        toast.success(`🟢 MT5 Live: Exit order queued to MT5 bridge for ${selectedCloseQty} lot`);
      } else if (bRes?.executedOnBroker) {
        toast.success(`🟢 FYERS Live: ${bRes.message || `Exit executed for ${selectedCloseQty} qty`}`);
      } else if (isPartial) {
        toast.success(`Partial exit of ${selectedCloseQty} qty @ ${currSym}${numExitPrice} executed (+${currSym}${netPnL} locked). Remaining: ${remainingQty} qty.`);
      } else {
        toast.success(`Trade ${trade.symbol} closed successfully.`);
      }

      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['trade', trade.id || trade._id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });

      // Auto close dialog after brief delay on success so user sees filled state
      setTimeout(() => {
        if (onSuccess) {
          if (!isPartial) {
            const plannedRisk = trade?.risk?.plannedRiskAmount || trade?.risk?.riskBudgetAmount || null;
            const rMult = plannedRisk && plannedRisk > 0 ? Number((netPnL / plannedRisk).toFixed(2)) : null;
            const closedPayload = data?.data || {
              ...trade,
              status: 'CLOSED',
              calculated: {
                ...(trade.calculated || {}),
                netPnL,
                grossPnL,
                realizedR: rMult,
                totalFees: totalCosts,
              },
              simpleExecution: {
                entryPrice,
                exitPrice: numExitPrice,
                quantity: totalOpenQuantity,
                brokerage: autoCharges?.brokerage ?? 20,
                taxes: autoCharges?.taxes ?? 0,
              },
            };
            onSuccess(closedPayload);
          } else {
            onSuccess();
          }
        }
        onClose();
      }, 1200);
    },
    onError: (err: any) => {
      isSubmittingRef.current = false;
      setOrderStage('REJECTED');
      setErrorMessage(err.message || 'Failed to close trade position.');
    },
  });

  if (!trade) return null;

  // Active step index for MUI Stepper
  const activeStep =
    orderStage === 'SENDING'
      ? 0
      : orderStage === 'WORKING'
      ? 1
      : orderStage === 'FILLED' || orderStage === 'REJECTED'
      ? 2
      : -1;

  return (
    <Dialog
      open={open}
      onClose={orderStage === 'SENDING' || orderStage === 'WORKING' ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.98)' : '#FFFFFF',
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
        <IconButton
          size="small"
          onClick={onClose}
          disabled={orderStage === 'SENDING' || orderStage === 'WORKING'}
          sx={{ color: muiTheme.palette.text.secondary }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2.5 }}>
        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ borderRadius: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Order Status Stepper (Active during and after execution) */}
        {orderStage !== 'IDLE' && (
          <Card
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: orderStage === 'FILLED'
                ? alpha('#10B981', 0.08)
                : orderStage === 'REJECTED'
                ? alpha('#EF4444', 0.08)
                : alpha('#3B82F6', 0.08),
              borderColor: orderStage === 'FILLED'
                ? alpha('#10B981', 0.4)
                : orderStage === 'REJECTED'
                ? alpha('#EF4444', 0.4)
                : alpha('#3B82F6', 0.4),
            }}
          >
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 1.5 }}>
              <Step>
                <StepLabel
                  icon={
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: activeStep >= 0 ? '#3B82F6' : 'text.disabled',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {activeStep > 0 ? '✓' : '1'}
                    </Box>
                  }
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    Sending
                  </Typography>
                </StepLabel>
              </Step>
              <Step>
                <StepLabel
                  icon={
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor:
                          activeStep > 1
                            ? '#3B82F6'
                            : activeStep === 1
                            ? '#F59E0B'
                            : 'text.disabled',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {activeStep > 1 ? '✓' : '2'}
                    </Box>
                  }
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    Exchange Ack
                  </Typography>
                </StepLabel>
              </Step>
              <Step>
                <StepLabel
                  icon={
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor:
                          orderStage === 'FILLED'
                            ? '#10B981'
                            : orderStage === 'REJECTED'
                            ? '#EF4444'
                            : 'text.disabled',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {orderStage === 'FILLED' ? '✓' : orderStage === 'REJECTED' ? '✕' : '3'}
                    </Box>
                  }
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {orderStage === 'REJECTED' ? 'Rejected' : 'Filled'}
                  </Typography>
                </StepLabel>
              </Step>
            </Stepper>

            <Box sx={{ textAlign: 'center', mt: 1 }}>
              {orderStage === 'SENDING' && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <CircularProgress size={14} />
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {isMt5Trade ? 'Queuing exit command to MT5 bridge...' : 'Transmitting market order to FYERS API gateway...'}
                  </Typography>
                </Box>
              )}
              {orderStage === 'WORKING' && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <SyncRoundedIcon sx={{ fontSize: 16, animation: 'spin 1s linear infinite' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#F59E0B' }}>
                    {isMt5Trade ? 'Command dispatched to MT5 EA — awaiting confirmation...' : 'Order working on exchange orderbook — awaiting execution fill...'}
                  </Typography>
                </Box>
              )}
              {orderStage === 'FILLED' && (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#10B981' }}>
                    🟢 {isMt5Trade ? 'Order Queued to MT5 Successfully' : 'Order Filled Successfully'}
                  </Typography>
                  {(brokerResultDetails?.orderId || brokerResultDetails?.commandId) && (
                    <Typography variant="caption" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: 'text.secondary', display: 'block' }}>
                      {isMt5Trade ? 'MT5 Command ID' : 'FYERS Order ID'}: <strong>{brokerResultDetails.orderId || brokerResultDetails.commandId}</strong>
                      {brokerResultDetails.tradedPrice ? ` @ ${currSym}${brokerResultDetails.tradedPrice}` : ''}
                    </Typography>
                  )}
                </Box>
              )}
              {orderStage === 'REJECTED' && (
                <Typography variant="body2" sx={{ fontWeight: 800, color: '#EF4444' }}>
                  🚨 Order Rejected: {brokerResultDetails?.message || errorMessage || 'Exchange rejected the order.'}
                </Typography>
              )}
            </Box>
          </Card>
        )}

        {/* Data Freshness Warning / Guard Banner */}
        {canBrokerExecute && isBrokerExecutionBlocked && (
          <Alert
            severity="warning"
            icon={<WarningAmberRoundedIcon sx={{ fontSize: 20 }} />}
            sx={{ borderRadius: 2, fontSize: '0.78rem' }}
          >
            <strong>Live Broker Execution Disabled:</strong> {brokerBlockReason || 'Market data is not real-time or broker token expired.'} Actions will record in SetupMint journal only.
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
            <span>Entry: <strong style={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary }}>{currSym}{entryPrice}</strong></span>
            <span>Position: <strong style={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary }}>{totalOpenQuantity} Qty{isLotBased ? ` (${totalLots} Lots)` : ''}</strong></span>
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

          {isLotBased && totalLots <= 1 && (
            <Alert severity="info" sx={{ py: 0.5, fontSize: '0.75rem', borderRadius: 2 }}>
              Single lot position (1 lot = {lotSize} units). Orders on exchange must be in multiples of {lotSize} units.
            </Alert>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
            <Button
              size="small"
              variant={exitMode === 'PARTIAL_50' ? 'contained' : 'outlined'}
              color="primary"
              disabled={isLotBased && totalLots <= 1}
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
                {isLotBased
                  ? totalLots > 1
                    ? `${Math.round(totalLots * 0.5)} Lot (${Math.round(totalLots * 0.5) * lotSize} Qty)`
                    : `${totalOpenQuantity} Qty (1 Lot)`
                  : `${Math.max(1, Math.floor(totalOpenQuantity / 2))} Qty`}
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
                {isLotBased ? `${totalLots} Lots (${totalOpenQuantity} Qty)` : `All ${totalOpenQuantity} Qty`}
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                size="small"
                type="number"
                label={isLotBased ? `Quantity to Exit (Lot Size: ${lotSize})` : 'Quantity to Exit'}
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                slotProps={{
                  input: {
                    inputProps: { min: isLotBased ? lotSize : 1, max: totalOpenQuantity, step: isLotBased ? lotSize : 1 },
                    sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
                  },
                }}
                helperText={isLotBased ? `Enter multiples of ${lotSize} up to ${totalOpenQuantity}` : `Enter between 1 and ${totalOpenQuantity} quantity to exit`}
              />

              {isLotBased && totalLots > 1 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.min(totalLots, 4) }, (_, i) => i + 1).map((lot) => (
                    <Chip
                      key={lot}
                      label={`${lot} Lot${lot === 1 ? '' : 's'} (${lot * lotSize})`}
                      size="small"
                      clickable
                      onClick={() => setCustomQty(String(lot * lotSize))}
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: Number(customQty) === lot * lotSize ? 800 : 500,
                        color: Number(customQty) === lot * lotSize ? '#3B82F6' : 'text.secondary',
                        border: '1px solid',
                        borderColor: Number(customQty) === lot * lotSize ? '#3B82F6' : 'divider',
                      }}
                    />
                  ))}
                </Box>
              )}
            </Box>
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
              Closing: <span style={{ color: muiTheme.palette.primary.main }}>{selectedCloseQty} Qty{isLotBased ? ` (${preFlightPreview?.exitLots || 1} Lots)` : ''}</span>
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Runner Remaining:{' '}
              <strong style={{ color: remainingQty > 0 ? (isDark ? '#34D399' : '#059669') : 'inherit' }}>
                {remainingQty} Qty{isLotBased ? ` (${preFlightPreview?.remainingLots || 0} Lots)` : ''}
              </strong>
            </Typography>
          </Box>
        </Box>

        {/* Live Broker Execution Toggle */}
        {canBrokerExecute && (
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
                  Live Broker Order ({isMt5Trade ? 'MT5 / Elefin Bridge' : 'FYERS API v3'})
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.72rem' }}>
                  {isBrokerExecutionBlocked
                    ? brokerBlockReason || 'Broker execution is unavailable'
                    : executeOnBroker
                    ? (isMt5Trade
                        ? `Queues a real market exit order for ${selectedCloseQty} lot directly with MT5 bridge EA`
                        : `Places a real market exit order for ${selectedCloseQty} qty directly with FYERS exchange gateway`)
                    : 'Record in SetupMint journal only without placing exchange order'}
                </Typography>
              </Box>
            </Box>
            <Tooltip title={isBrokerExecutionBlocked ? (brokerBlockReason || 'Broker execution blocked') : ''} arrow>
              <span>
                <Switch
                  checked={executeOnBroker}
                  disabled={isBrokerExecutionBlocked || orderStage !== 'IDLE'}
                  onChange={(e) => setExecuteOnBroker(e.target.checked)}
                  color="success"
                  size="small"
                />
              </span>
            </Tooltip>
          </Box>
        )}

        {/* Exit Price Input */}
        <TextField
          label="Estimated Exit Fill Price"
          type="number"
          required
          autoFocus
          value={exitPrice}
          disabled={orderStage !== 'IDLE'}
          onChange={(e) => setExitPrice(e.target.value)}
          placeholder={`e.g. ${entryPrice}`}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">{currSym}</InputAdornment>,
              sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
            },
          }}
          helperText="Reference price for financial outcome preview & market order"
        />

        {/* Slippage Warning Alert if deviation detected */}
        {preFlightPreview?.isSlippageWarning && (
          <Alert
            severity="warning"
            icon={<WarningAmberRoundedIcon sx={{ fontSize: 18 }} />}
            sx={{ py: 0.5, borderRadius: 2, fontSize: '0.75rem' }}
          >
            <strong>Slippage Alert:</strong> {preFlightPreview.slippageMessage}
          </Alert>
        )}

        {/* Exit Timestamp Input */}
        <TextField
          label="Exit Date & Time"
          type="datetime-local"
          required
          disabled={orderStage !== 'IDLE'}
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
                label={manualFeesOverride ? 'MANUAL' : 'AUTO (SEBI/GST)'}
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
                  startAdornment: <InputAdornment position="start">{currSym}</InputAdornment>,
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

        {/* Pre-Flight Financial Outcome Preview Banner */}
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
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              PRE-FLIGHT OUTCOME PREVIEW
            </Typography>
            {realizedR !== null && (
              <Chip
                label={realizedR >= 0 ? `+${realizedR}R Realized` : `${realizedR}R`}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.625rem',
                  fontWeight: 800,
                  bgcolor: realizedR >= 0 ? alpha('#10B981', 0.2) : alpha('#EF4444', 0.2),
                  color: realizedR >= 0 ? '#10B981' : '#EF4444',
                }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Gross P&L ({selectedCloseQty} {isLotBased || isMt5Trade ? 'Lot' : 'Qty'} @ {currSym}{numExitPrice || 0})
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
              {isPriceValid ? formatCurrency(grossPnL, tradeCurrency) : '—'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              {tradeCurrency === 'USD' ? 'Total Costs (Forex / Elefin: Spread-based)' : 'Total Costs & Taxes (STT, Stamp, Exchange, GST)'}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary }}>
              {isPriceValid ? formatCurrency(totalCosts, tradeCurrency) : '—'}
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
              Estimated Net Realized P&L
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
              {isPriceValid ? formatCurrency(netPnL, tradeCurrency) : `${currSym}0.00`}
            </Typography>
          </Box>
        </Card>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          onClick={onClose}
          disabled={orderStage === 'SENDING' || orderStage === 'WORKING'}
          sx={{ fontWeight: 600 }}
        >
          Cancel
        </Button>

        {executeOnBroker ? (
          <HoldToConfirmButton
            holdDurationMs={600}
            onConfirm={() => closeMutation.mutate()}
            disabled={!isPriceValid || orderStage !== 'IDLE'}
            disabledReason={
              !isPriceValid
                ? 'Please specify a valid exit price'
                : isBrokerExecutionBlocked
                ? brokerBlockReason || 'Broker execution is blocked'
                : orderStage !== 'IDLE'
                ? 'Order is currently processing'
                : undefined
            }
            color={isPartial ? 'success' : 'error'}
            variant="contained"
            holdingText="Transmitting in"
            completedText="Order Dispatched!"
            startIcon={orderStage === 'SENDING' ? <CircularProgress size={16} color="inherit" /> : <FlashOnRoundedIcon />}
            sx={{ fontWeight: 700, borderRadius: 2, px: 2.5, py: 0.9 }}
          >
            {orderStage === 'SENDING'
              ? 'Sending Order...'
              : orderStage === 'WORKING'
              ? 'Working on Gateway...'
              : orderStage === 'FILLED'
              ? 'Order Filled'
              : isPartial
              ? `⚡ Hold to Exit 50% (${selectedCloseQty} ${isLotBased || isMt5Trade ? 'Lot' : 'Qty'})`
              : `⚡ Hold to Close 100% (${selectedCloseQty} ${isLotBased || isMt5Trade ? 'Lot' : 'Qty'})`}
          </HoldToConfirmButton>
        ) : (
          <Button
            variant="contained"
            color={isPartial ? 'success' : 'primary'}
            onClick={() => closeMutation.mutate()}
            disabled={!isPriceValid || orderStage !== 'IDLE'}
            startIcon={orderStage === 'SENDING' ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            {orderStage === 'SENDING'
              ? 'Saving Journal...'
              : isPartial
              ? `Book ${selectedCloseQty} Qty in Journal`
              : `Close Full Position (${selectedCloseQty} Qty)`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
