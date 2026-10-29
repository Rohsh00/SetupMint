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
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

import {
  ILiveOpenTradeMetric,
  ICustomLadderRules,
  ICustomLadderRuleStep,
} from '@tradevault/shared';
import { formatCurrency } from '../../../lib/utils.js';

export interface LiveCustomRulesDialogProps {
  open: boolean;
  onClose: () => void;
  metric: ILiveOpenTradeMetric | null;
  onSave: (rules: ICustomLadderRules) => void;
}

export function LiveCustomRulesDialog({
  open,
  onClose,
  metric,
  onSave,
}: LiveCustomRulesDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const defaultLotSize = useMemo(() => {
    if (!metric) return 1;
    return metric.lotSize ?? (metric.contractMultiplier && metric.contractMultiplier > 1 ? metric.contractMultiplier : 1);
  }, [metric]);

  const [lotSize, setLotSize] = useState<number>(defaultLotSize);
  const [autoExecute, setAutoExecute] = useState<boolean>(false);

  // Target 1
  const [t1R, setT1R] = useState<number>(1.0);
  const [t1Ratio, setT1Ratio] = useState<number>(0.5);
  const [t1TrailAction, setT1TrailAction] = useState<'TRUE_BE_WITH_FEES' | 'NOMINAL_BE' | 'CUSTOM_POINTS' | 'NONE'>('TRUE_BE_WITH_FEES');
  const [t1TrailPoints, setT1TrailPoints] = useState<number>(15);

  // Target 2
  const [t2R, setT2R] = useState<number>(2.0);
  const [t2Ratio, setT2Ratio] = useState<number>(0.5);
  const [t2TrailAction, setT2TrailAction] = useState<'TRAIL_T1' | 'CUSTOM_POINTS' | 'NONE'>('TRAIL_T1');
  const [t2TrailPoints, setT2TrailPoints] = useState<number>(30);

  // Target 3 (Runner)
  const [t3R, setT3R] = useState<number>(3.0);

  // Load existing rules from localStorage on open
  useEffect(() => {
    if (metric && open) {
      const savedKey = `tv_live_rules_${metric.tradeId}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as ICustomLadderRules;
          if (parsed.lotSize) setLotSize(parsed.lotSize);
          setAutoExecute(Boolean(parsed.autoExecuteEnabled));
          if (parsed.t1) {
            setT1R(parsed.t1.targetR ?? 1.0);
            setT1Ratio(parsed.t1.exitRatio ?? 0.5);
            setT1TrailAction((parsed.t1.trailAction as any) ?? 'TRUE_BE_WITH_FEES');
            if (parsed.t1.trailPoints) setT1TrailPoints(parsed.t1.trailPoints);
          }
          if (parsed.t2) {
            setT2R(parsed.t2.targetR ?? 2.0);
            setT2Ratio(parsed.t2.exitRatio ?? 0.5);
            setT2TrailAction((parsed.t2.trailAction as any) ?? 'TRAIL_T1');
            if (parsed.t2.trailPoints) setT2TrailPoints(parsed.t2.trailPoints);
          }
          if (parsed.t3) {
            setT3R(parsed.t3.targetR ?? 3.0);
          }
          return;
        } catch {
          // fallback to defaults
        }
      }

      setLotSize(defaultLotSize);
      setAutoExecute(false);
      setT1R(1.0);
      setT1Ratio(0.5);
      setT1TrailAction('TRUE_BE_WITH_FEES');
      setT2R(2.0);
      setT2Ratio(0.5);
      setT2TrailAction('TRAIL_T1');
      setT3R(3.0);
    }
  }, [metric, open, defaultLotSize]);

  if (!metric) return null;

  const totalQty = metric.quantity || 1;
  const isLong = metric.direction === 'LONG';
  const isLotBased = lotSize > 1;
  const totalLots = isLotBased ? Math.max(1, Math.floor(totalQty / lotSize)) : totalQty;

  // Calculate live prices based on risk
  const riskPts = metric.targetLadder?.initialRiskPoints ?? (metric.stopLoss !== null ? Math.abs(metric.entryPrice - metric.stopLoss) : 10);
  const t1Price = Number((isLong ? metric.entryPrice + t1R * riskPts : metric.entryPrice - t1R * riskPts).toFixed(2));
  const t2Price = Number((isLong ? metric.entryPrice + t2R * riskPts : metric.entryPrice - t2R * riskPts).toFixed(2));
  const t3Price = Number((isLong ? metric.entryPrice + t3R * riskPts : metric.entryPrice - t3R * riskPts).toFixed(2));

  // Exit lots calculation
  let t1ExitLots = 1;
  if (totalLots > 1) {
    t1ExitLots = Math.max(1, Math.min(totalLots - 1, Math.round(totalLots * t1Ratio)));
  }
  const t1ExitUnits = isLotBased ? t1ExitLots * lotSize : Math.round(totalQty * t1Ratio);

  const remLots = Math.max(1, totalLots - t1ExitLots);
  const t2ExitLots = remLots > 1 ? Math.max(1, Math.min(remLots - 1, Math.round(remLots * t2Ratio))) : 1;
  const t2ExitUnits = isLotBased ? t2ExitLots * lotSize : Math.round((totalQty - t1ExitUnits) * t2Ratio);

  const runnerLots = Math.max(1, totalLots - t1ExitLots - (t2ExitLots > 0 ? t2ExitLots : 0));
  const runnerUnits = isLotBased ? runnerLots * lotSize : Math.max(1, totalQty - t1ExitUnits - t2ExitUnits);

  const trueBe = metric.trueBreakevenPrice ?? metric.entryPrice;

  const handleSave = () => {
    const rules: ICustomLadderRules = {
      tradeId: metric.tradeId,
      lotSize,
      autoExecuteEnabled: autoExecute,
      t1: {
        targetR: t1R,
        exitRatio: t1Ratio,
        customLots: isLotBased ? t1ExitLots : undefined,
        trailAction: t1TrailAction,
        trailPoints: t1TrailAction === 'CUSTOM_POINTS' ? t1TrailPoints : undefined,
      },
      t2: {
        targetR: t2R,
        exitRatio: t2Ratio,
        customLots: isLotBased ? t2ExitLots : undefined,
        trailAction: t2TrailAction,
        trailPoints: t2TrailAction === 'CUSTOM_POINTS' ? t2TrailPoints : undefined,
      },
      t3: {
        targetR: t3R,
        exitRatio: 1.0,
        customLots: isLotBased ? runnerLots : undefined,
        trailAction: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(`tv_live_rules_${metric.tradeId}`, JSON.stringify(rules));
    onSave(rules);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
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
              bgcolor: alpha('#3B82F6', 0.15),
              color: '#3B82F6',
              display: 'flex',
            }}
          >
            <TuneRoundedIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              Custom R1-R3 & Auto-Execution Rules
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {metric.symbol} ({metric.direction}) • Entry: ₹{metric.entryPrice} • 1R = {riskPts.toFixed(1)} pts
            </Typography>
          </Box>
        </Box>

        <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Lot Sizing Configuration */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Instrument Lot Size & Multiplier
            </Typography>
            <Chip
              label={`${totalLots} ${totalLots === 1 ? 'Lot' : 'Lots'} Total (${totalQty} units)`}
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#3B82F6', 0.12), color: '#3B82F6' }}
            />
          </Box>

          <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Units per Lot (Lot Size)"
                value={lotSize}
                onChange={(e) => setLotSize(Math.max(1, Number(e.target.value)))}
                helperText={lotSize > 1 ? `e.g. NIFTY=65, BANKNIFTY=15` : 'Equity / Cash shares = 1'}
                slotProps={{ htmlInput: { min: 1 } }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Box sx={{ p: 1, borderRadius: '8px', bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
                  Fee-Adjusted Breakeven:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, color: '#10B981' }}>
                  ₹{trueBe} {metric.feeBufferPoints ? `(covers +₹${metric.estimatedCharges} fees)` : ''}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* Target 1 (R1) Rule Card */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: alpha('#10B981', isDark ? 0.06 : 0.04),
            border: '1px solid',
            borderColor: alpha('#10B981', 0.25),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrackChangesRoundedIcon sx={{ fontSize: 16, color: '#10B981' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#10B981', fontSize: '0.8rem' }}>
                TARGET 1 (R1)
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              @ ₹{t1Price}
            </Typography>
          </Box>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Target R"
                value={t1R}
                onChange={(e) => setT1R(Math.max(0.5, Number(e.target.value)))}
                slotProps={{ htmlInput: { step: 0.1, min: 0.5 } }}
              />
            </Grid>

            <Grid size={{ xs: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Exit Scope</InputLabel>
                <Select
                  value={t1Ratio}
                  label="Exit Scope"
                  onChange={(e) => setT1Ratio(Number(e.target.value))}
                >
                  <MenuItem value={0.3}>30% ({isLotBased ? `${t1ExitLots} lots` : `${t1ExitUnits} qty`})</MenuItem>
                  <MenuItem value={0.5}>50% ({isLotBased ? `${t1ExitLots} lots` : `${t1ExitUnits} qty`})</MenuItem>
                  <MenuItem value={0.7}>70% ({isLotBased ? `${t1ExitLots} lots` : `${t1ExitUnits} qty`})</MenuItem>
                  <MenuItem value={1.0}>100% (All {totalQty} qty)</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Trailing SL Action</InputLabel>
                <Select
                  value={t1TrailAction}
                  label="Trailing SL Action"
                  onChange={(e) => setT1TrailAction(e.target.value as any)}
                >
                  <MenuItem value="TRUE_BE_WITH_FEES">🛡️ True BE (with Fees)</MenuItem>
                  <MenuItem value="NOMINAL_BE">Nominal BE (Entry)</MenuItem>
                  <MenuItem value="CUSTOM_POINTS">Trail Custom Pts</MenuItem>
                  <MenuItem value="NONE">Don't Move SL</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {t1TrailAction === 'CUSTOM_POINTS' && (
            <TextField
              size="small"
              type="number"
              label="Trail by Points"
              value={t1TrailPoints}
              onChange={(e) => setT1TrailPoints(Math.max(1, Number(e.target.value)))}
              sx={{ mt: 1, width: 180 }}
            />
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontSize: '0.65rem' }}>
            Action: Book {isLotBased ? `${t1ExitLots} lot (${t1ExitUnits} units)` : `${t1ExitUnits} units`} &{' '}
            {t1TrailAction === 'TRUE_BE_WITH_FEES'
              ? `move SL to True BE (₹${trueBe}, fees protected)`
              : t1TrailAction === 'NOMINAL_BE'
              ? `move SL to Entry (₹${metric.entryPrice})`
              : t1TrailAction === 'CUSTOM_POINTS'
              ? `trail SL by +${t1TrailPoints} pts`
              : 'maintain current SL'}
          </Typography>
        </Box>

        {/* Target 2 (R2) Rule Card */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: alpha('#3B82F6', isDark ? 0.06 : 0.04),
            border: '1px solid',
            borderColor: alpha('#3B82F6', 0.25),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrackChangesRoundedIcon sx={{ fontSize: 16, color: '#3B82F6' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#3B82F6', fontSize: '0.8rem' }}>
                TARGET 2 (R2)
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              @ ₹{t2Price}
            </Typography>
          </Box>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 4 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Target R"
                value={t2R}
                onChange={(e) => setT2R(Math.max(t1R + 0.5, Number(e.target.value)))}
                slotProps={{ htmlInput: { step: 0.5, min: t1R + 0.5 } }}
              />
            </Grid>

            <Grid size={{ xs: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Exit Scope</InputLabel>
                <Select
                  value={t2Ratio}
                  label="Exit Scope"
                  onChange={(e) => setT2Ratio(Number(e.target.value))}
                >
                  <MenuItem value={0.5}>50% of Remainder ({isLotBased ? `${t2ExitLots} lots` : `${t2ExitUnits} qty`})</MenuItem>
                  <MenuItem value={1.0}>100% of Remainder</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Trailing SL Action</InputLabel>
                <Select
                  value={t2TrailAction}
                  label="Trailing SL Action"
                  onChange={(e) => setT2TrailAction(e.target.value as any)}
                >
                  <MenuItem value="TRAIL_T1">Trail to +1R (₹{t1Price})</MenuItem>
                  <MenuItem value="CUSTOM_POINTS">Trail Custom Pts</MenuItem>
                  <MenuItem value="NONE">Don't Move SL</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>

        {/* Target 3 / Runner (R3) Rule Card */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrackChangesRoundedIcon sx={{ fontSize: 16, color: '#A855F7' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#A855F7', fontSize: '0.8rem' }}>
                RUNNER (R3)
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              @ ₹{t3Price}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              size="small"
              type="number"
              label="Runner Target R"
              value={t3R}
              onChange={(e) => setT3R(Math.max(t2R + 0.5, Number(e.target.value)))}
              slotProps={{ htmlInput: { step: 0.5, min: t2R + 0.5 } }}
              sx={{ width: 140 }}
            />
            <Typography variant="caption" color="text.secondary">
              Exits remaining position: <strong>{isLotBased ? `${runnerLots} lot (${runnerUnits} units)` : `${runnerUnits} units`}</strong>
            </Typography>
          </Box>
        </Box>

        {/* ⚡ AUTO-EXECUTION MASTER SWITCH */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: autoExecute
              ? alpha('#10B981', isDark ? 0.15 : 0.08)
              : isDark
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(0, 0, 0, 0.02)',
            border: '1px solid',
            borderColor: autoExecute ? alpha('#10B981', 0.4) : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                p: 0.75,
                borderRadius: '8px',
                bgcolor: autoExecute ? '#10B981' : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                color: autoExecute ? '#FFFFFF' : 'text.secondary',
                display: 'flex',
              }}
            >
              <FlashOnRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Auto-Execute Live on FYERS
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {autoExecute
                  ? '⚡ ARMED: Automatic market partial exit and SL trailing to FYERS when target hit.'
                  : 'Manual Mode: You click to execute ladder steps. (Toggle on to automate)'}
              </Typography>
            </Box>
          </Box>

          <Switch
            checked={autoExecute}
            onChange={(e) => setAutoExecute(e.target.checked)}
            color="success"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', color: 'text.secondary' }}>
          Cancel
        </Button>

        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />}
          sx={{
            textTransform: 'none',
            fontWeight: 800,
            borderRadius: '8px',
            bgcolor: autoExecute ? '#10B981' : '#3B82F6',
            '&:hover': { bgcolor: autoExecute ? '#059669' : '#2563EB' },
          }}
        >
          {autoExecute ? 'Arm Live Auto-Execution' : 'Save Custom Rules'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
