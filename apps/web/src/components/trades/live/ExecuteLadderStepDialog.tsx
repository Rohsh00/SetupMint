import React, { useState, useEffect } from 'react';
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
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import PieChartRoundedIcon from '@mui/icons-material/PieChartRounded';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { ILiveTargetLadderStep, ILiveOpenTradeMetric } from '@tradevault/shared';

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
}

export function ExecuteLadderStepDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  step,
  metric,
}: ExecuteLadderStepDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [exitQty, setExitQty] = useState<number>(1);
  const [newStopLoss, setNewStopLoss] = useState<number>(0);
  const [executeBroker, setExecuteBroker] = useState<boolean>(true);

  useEffect(() => {
    if (step) {
      setExitQty(step.plannedExitQty);
      setNewStopLoss(step.suggestedStopLoss);
    }
  }, [step]);

  if (!step || !metric) return null;

  const totalOpenQty = metric.quantity || 1;
  const isLong = metric.direction === 'LONG';
  const lotSize = step.lotSize ?? metric.lotSize ?? 1;
  const isLotBased = lotSize > 1;
  const totalLots = isLotBased ? Math.max(1, Math.floor(totalOpenQty / lotSize)) : totalOpenQty;
  const selectedLots = isLotBased ? Math.max(1, Math.round(exitQty / lotSize)) : exitQty;

  const handleExecute = () => {
    onConfirm({
      targetIndex: step.targetIndex,
      label: step.name,
      exitQty: Number(exitQty),
      newStopLoss: Number(newStopLoss) > 0 ? Number(newStopLoss) : undefined,
      executeBroker,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="xs"
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

      <DialogContent dividers sx={{ p: 2.5 }}>
        {/* Step Summary Banner */}
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: '10px',
            bgcolor: alpha('#10B981', 0.08),
            border: '1px solid',
            borderColor: alpha('#10B981', 0.25),
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#10B981', display: 'block', mb: 0.5 }}>
            TARGET OBJECTIVE
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Target Price: <strong>₹{step.targetPrice}</strong> (+{step.targetR}R)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Current LTP: ₹{metric.currentLtp} ({step.distancePoints > 0 ? `${step.distancePoints} pts away` : 'Target reached!'})
          </Typography>
        </Box>

        {/* Action 1: Book Partial Profit */}
        <Box sx={{ mb: 2 }}>
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
            sx={{ mb: 0.5 }}
          />

          {isLotBased && totalLots > 1 && (
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
              {Array.from({ length: Math.min(totalLots, 4) }, (_, i) => i + 1).map((lots) => (
                <Chip
                  key={lots}
                  label={`${lots} Lot${lots === 1 ? '' : 's'} (${lots * lotSize})`}
                  size="small"
                  clickable
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
        <Box sx={{ mb: 2 }}>
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
            label="New Trailed Stop Loss"
            value={newStopLoss}
            onChange={(e) => setNewStopLoss(Number(e.target.value))}
            helperText={step.suggestedStopLabel}
            sx={{ mb: 0.5 }}
          />
        </Box>

        {/* Live Broker Execution Toggle */}
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
                Execute on FYERS Broker
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
              {executeBroker
                ? 'Submits real market exit and trails SL on FYERS orderbook'
                : 'Simulates ladder step in SetupMint without broker order'}
            </Typography>
          </Box>
          <Switch
            checked={executeBroker}
            onChange={(e) => setExecuteBroker(e.target.checked)}
            color="success"
            size="small"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={isLoading} sx={{ borderRadius: '8px', textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleExecute}
          disabled={isLoading || exitQty <= 0}
          startIcon={<FlashOnRoundedIcon />}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
            bgcolor: '#10B981',
            fontWeight: 800,
            '&:hover': { bgcolor: '#059669' },
          }}
        >
          {isLoading ? 'Executing...' : `Execute ${step.name}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
