import React, { useState, useEffect, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import PieChartRoundedIcon from '@mui/icons-material/PieChartRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { ILiveTargetLadderStep, ILiveOpenTradeMetric, ILiveDataHealth } from '@tradevault/shared';
import {
  calculatePreFlightExecutionPreview,
  IPreFlightExecutionPreviewResult,
} from '@tradevault/financial-engine';
import { formatCurrency, getCurrencySymbol } from '../../../lib/utils.js';
import { useAccountCapabilities } from '../../../context/AccountScopeContext.js';
import { HoldToConfirmButton } from './HoldToConfirmButton.js';

interface ExecuteLadderStepDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    targetIndex: number;
    label: string;
    exitQty: number;
    newStopLoss?: number;
    executeBroker: boolean;
  }) => void;
  isLoading: boolean;
  step: ILiveTargetLadderStep | null;
  metric: ILiveOpenTradeMetric | null;
  dataHealth?: ILiveDataHealth;
}

export function ExecuteLadderStepDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  step,
  metric,
  dataHealth,
}: ExecuteLadderStepDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const caps = useAccountCapabilities();

  const [exitQty, setExitQty] = useState<number>(1);
  const [newStopLoss, setNewStopLoss] = useState<number>(0);
  const currSym = caps.currency.symbol || getCurrencySymbol((metric as any)?.currency || caps.currency.code || 'USD');

  const isMt5 = Boolean((metric as any)?.isMt5 || /elefin|mt5/i.test((metric as any)?.accountBroker || ''));
  const brokerLabel = isMt5 ? 'MT5 (Elefin)' : 'FYERS';

  // Data health check
  const effectiveDataHealth: ILiveDataHealth | undefined = dataHealth || metric?.dataHealth;
  const isBrokerExecutionBlocked = effectiveDataHealth ? !effectiveDataHealth.canExecuteBroker : false;
  const brokerBlockReason = effectiveDataHealth?.brokerExecutionBlockedReason;

  const [executeBroker, setExecuteBroker] = useState<boolean>(() => caps.broker.canExecuteLive && !isBrokerExecutionBlocked);

  useEffect(() => {
    if (step) {
      setExitQty(step.plannedExitQty);
      setNewStopLoss(step.suggestedStopLoss);
      if (!caps.broker.canExecuteLive || isBrokerExecutionBlocked) {
        setExecuteBroker(false);
      } else {
        setExecuteBroker(true);
      }
    }
  }, [step, caps.broker.canExecuteLive, isBrokerExecutionBlocked]);

  const totalOpenQty = metric?.quantity || 1;
  const lotSize = step?.lotSize ?? metric?.lotSize ?? 1;
  const isLotBased = lotSize > 1;
  const totalLots = isLotBased ? Math.max(1, Math.floor(totalOpenQty / lotSize)) : totalOpenQty;
  const selectedLots = isLotBased ? Math.max(1, Math.round(exitQty / lotSize)) : exitQty;

  // Pre-flight calculation
  const preFlightPreview: IPreFlightExecutionPreviewResult | null = useMemo(() => {
    if (!metric || !step || exitQty <= 0) return null;
    try {
      return calculatePreFlightExecutionPreview({
        entryPrice: metric.entryPrice,
        currentLtp: metric.currentLtp,
        totalOpenQuantity: totalOpenQty,
        exitQuantity: exitQty,
        direction: metric.direction as any,
        lotSize,
        contractMultiplier: metric.contractMultiplier || 1,
        newStopLoss: newStopLoss > 0 ? newStopLoss : null,
        initialRiskAmount: metric.initialRiskAmount,
        initialStopLoss: (metric as any).initialStopLoss ?? metric.stopLoss,
        currentStopLoss: metric.stopLoss,
        assetClass: (metric as any).assetClass || 'EQUITY',
        marketSegment: (metric as any).marketSegment || 'NSE_EQ',
        referencePrice: step.targetPrice,
        slippageGuardPercent: 0.5,
      });
    } catch {
      return null;
    }
  }, [metric, step, exitQty, newStopLoss, totalOpenQty, lotSize]);

  if (!step || !metric) return null;

  const handleExecute = () => {
    if (isLoading) return;
    onConfirm({
      targetIndex: step.targetIndex,
      label: step.name,
      exitQty: Number(exitQty),
      newStopLoss: Number(newStopLoss) > 0 ? Number(newStopLoss) : undefined,
      executeBroker: isBrokerExecutionBlocked ? false : executeBroker,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: '16px',
            bgcolor: isDark ? '#0F172A' : '#FFFFFF',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          },
        },
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              p: 0.75,
              borderRadius: '8px',
              bgcolor: alpha('#10B981', 0.15),
              color: '#10B981',
              display: 'flex',
            }}
          >
            <FlashOnRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              Execute {step.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {metric.symbol} ({metric.direction} • {totalOpenQty} Open Lots)
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} disabled={isLoading}>
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Step Summary Banner */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: alpha('#10B981', 0.08),
            border: '1px solid',
            borderColor: alpha('#10B981', 0.25),
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#10B981', display: 'block' }}>
              TARGET OBJECTIVE
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Target: {currSym}{step.targetPrice} (+{step.targetR}R)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Current LTP: {currSym}{metric.currentLtp} ({step.distancePoints > 0 ? `${step.distancePoints} pts away` : 'Target reached!'})
            </Typography>
          </Box>
          <Chip
            label={step.status}
            size="small"
            color={step.status === 'MET' ? 'success' : 'default'}
            sx={{ fontWeight: 800, fontSize: '0.65rem' }}
          />
        </Box>

        {/* Data Freshness Warning / Guard Banner */}
        {caps.broker.canExecuteLive && isBrokerExecutionBlocked && (
          <Alert
            severity="warning"
            icon={<WarningAmberRoundedIcon sx={{ fontSize: 18 }} />}
            sx={{ py: 0.5, borderRadius: 2, fontSize: '0.75rem' }}
          >
            <strong>Broker Execution Guard:</strong> {brokerBlockReason || 'Market data is not real-time or broker token expired.'} Ladder execution will apply in SetupMint journal only.
          </Alert>
        )}

        {/* Action 1: Book Partial Profit */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <PieChartRoundedIcon sx={{ fontSize: 16, color: '#3B82F6' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
              1. Partial Profit Exit
            </Typography>
          </Box>

          <TextField
            fullWidth
            size="small"
            type="number"
            disabled={isLoading}
            label={isLotBased ? `Quantity to Close (Lot Size: ${lotSize} units)` : 'Quantity to Close (Units)'}
            value={exitQty}
            onChange={(e) => {
              const val = Number(e.target.value);
              setExitQty(Math.min(totalOpenQty, Math.max(1, isNaN(val) ? 1 : val)));
            }}
            helperText={
              isLotBased
                ? `Exiting ${selectedLots} lot${selectedLots === 1 ? '' : 's'} (${exitQty} units) of ${totalLots} total lots (${totalOpenQty} units)`
                : `Exiting ${exitQty} of ${totalOpenQty} open units (${Math.round((exitQty / totalOpenQty) * 100)}%) @ current LTP`
            }
            slotProps={{
              htmlInput: { min: isLotBased ? lotSize : 1, max: totalOpenQty, step: isLotBased ? lotSize : 1 },
            }}
          />

          {isLotBased && totalLots > 1 && (
            <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
              {Array.from({ length: Math.min(totalLots, 4) }, (_, i) => i + 1).map((lots) => (
                <Chip
                  key={lots}
                  label={`${lots} Lot${lots === 1 ? '' : 's'} (${lots * lotSize})`}
                  size="small"
                  clickable={!isLoading}
                  onClick={() => setExitQty(lots * lotSize)}
                  sx={{
                    height: 22,
                    fontSize: '0.62rem',
                    fontWeight: exitQty === lots * lotSize ? 800 : 600,
                    bgcolor: exitQty === lots * lotSize ? alpha('#3B82F6', 0.2) : 'transparent',
                    color: exitQty === lots * lotSize ? '#3B82F6' : 'text.secondary',
                    border: '1px solid',
                    borderColor: exitQty === lots * lotSize ? '#3B82F6' : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'),
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Action 2: Trail Stop Loss to protect gains */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <ShieldRoundedIcon sx={{ fontSize: 16, color: '#10B981' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
              2. Auto-Trail Stop Loss
            </Typography>
          </Box>

          <TextField
            fullWidth
            size="small"
            type="number"
            disabled={isLoading}
            label="New Trailed Stop Loss"
            value={newStopLoss}
            onChange={(e) => setNewStopLoss(Number(e.target.value))}
            helperText={step.suggestedStopLabel}
          />
        </Box>

        {/* Pre-Flight Preview Card */}
        {preFlightPreview && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: '10px',
              bgcolor: isDark ? alpha('#1E293B', 0.5) : alpha('#F1F5F9', 0.8),
              border: '1px solid',
              borderColor: muiTheme.palette.divider,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                PRE-FLIGHT OUTCOME PREVIEW
              </Typography>
              {preFlightPreview.realizedR !== null && (
                <Chip
                  label={`+${preFlightPreview.realizedR}R Realized`}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    bgcolor: alpha('#10B981', 0.15),
                    color: '#10B981',
                  }}
                />
              )}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: muiTheme.palette.text.secondary }}>Estimated Net P&L:</span>
              <strong style={{ color: preFlightPreview.netPnL >= 0 ? '#10B981' : '#EF4444', fontFamily: `'JetBrains Mono', monospace` }}>
                {formatCurrency(preFlightPreview.netPnL)}
              </strong>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: muiTheme.palette.text.secondary }}>{caps.fees.showStatutoryBreakdown ? 'Statutory Charges (Auto):' : 'Estimated Fees:'}</span>
              <span style={{ fontFamily: `'JetBrains Mono', monospace` }}>{formatCurrency(preFlightPreview.estimatedCharges)}</span>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: muiTheme.palette.text.secondary }}>Remaining Runner:</span>
              <strong style={{ color: '#3B82F6', fontFamily: `'JetBrains Mono', monospace` }}>
                {preFlightPreview.remainingQuantity} Qty ({preFlightPreview.remainingLots} Lots)
              </strong>
            </Box>

            {newStopLoss > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', pt: 0.5, borderTop: `1px dashed ${muiTheme.palette.divider}` }}>
                <span style={{ color: muiTheme.palette.text.secondary }}>New Trailed SL:</span>
                <strong style={{ color: '#10B981', fontFamily: `'JetBrains Mono', monospace` }}>
                  {currSym}{newStopLoss.toFixed(2)} ({step.suggestedStopLabel || 'Locked'})
                </strong>
              </Box>
            )}
          </Box>
        )}

        {/* Live Broker Execution Toggle */}
        {caps.broker.canExecuteLive && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: '10px',
              bgcolor: executeBroker
                ? isDark
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(16, 185, 129, 0.08)'
                : isDark
                ? 'rgba(255, 255, 255, 0.03)'
                : 'rgba(0, 0, 0, 0.02)',
              border: '1px solid',
              borderColor: executeBroker
                ? alpha('#10B981', 0.4)
                : isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.78rem' }}>
                  Execute on {brokerLabel} Broker
                </Typography>
                <Chip
                  label={executeBroker ? 'LIVE BROKER' : 'JOURNAL ONLY'}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    bgcolor: executeBroker ? '#10B981' : '#64748B',
                    color: '#FFFFFF',
                    borderRadius: '3px',
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', mt: 0.25 }}>
                {isBrokerExecutionBlocked
                  ? brokerBlockReason || 'Broker execution is unavailable'
                  : executeBroker
                  ? (isMt5 ? 'Submits real market exit and trails SL via MT5 bridge' : 'Submits real market exit and trails SL on FYERS orderbook')
                  : 'Simulates ladder step in SetupMint without broker order'}
              </Typography>
            </Box>
            <Tooltip title={isBrokerExecutionBlocked ? (brokerBlockReason || 'Broker execution blocked') : ''} arrow>
              <span>
                <Switch
                  checked={executeBroker}
                  disabled={isBrokerExecutionBlocked || isLoading}
                  onChange={(e) => setExecuteBroker(e.target.checked)}
                  color="success"
                  size="small"
                />
              </span>
            </Tooltip>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="outlined" onClick={onClose} disabled={isLoading} sx={{ borderRadius: '8px', textTransform: 'none' }}>
          Cancel
        </Button>

        {executeBroker ? (
          <HoldToConfirmButton
            holdDurationMs={600}
            onConfirm={handleExecute}
            disabled={isLoading || exitQty <= 0}
            disabledReason={
              exitQty <= 0
                ? 'Quantity must be greater than 0'
                : isBrokerExecutionBlocked
                ? brokerBlockReason || 'Broker execution blocked'
                : undefined
            }
            color="success"
            variant="contained"
            holdingText="Executing in"
            completedText="Ladder Dispatched!"
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <FlashOnRoundedIcon />}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 800,
              px: 2.5,
              py: 0.9,
            }}
          >
            {isLoading ? 'Executing...' : `⚡ Hold to Execute ${step.name}`}
          </HoldToConfirmButton>
        ) : (
          <Button
            variant="contained"
            onClick={handleExecute}
            disabled={isLoading || exitQty <= 0}
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <FlashOnRoundedIcon />}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              bgcolor: '#10B981',
              fontWeight: 800,
              '&:hover': { bgcolor: '#059669' },
            }}
          >
            {isLoading ? 'Executing...' : `Execute ${step.name} in Journal`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
