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
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';

import {
  ILiveOpenTradeMetric,
  ICustomLadderRules,
  ICustomLadderRuleStep,
} from '@tradevault/shared';
import { formatCurrency } from '../../../lib/utils.js';

export type TargetPlanningPreset = 'T1_FREE_RUNNER' | 'TWO_TARGETS_RUNNER' | 'CLASSIC_THREE' | 'T1_ONLY';

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
  const [targetMode, setTargetMode] = useState<TargetPlanningPreset>('T1_FREE_RUNNER');

  // Target 1
  const [t1R, setT1R] = useState<number>(1.0);
  const [t1Ratio, setT1Ratio] = useState<number>(0.5);
  const [t1TrailAction, setT1TrailAction] = useState<'TRUE_BE_WITH_FEES' | 'NOMINAL_BE' | 'CUSTOM_POINTS' | 'NONE'>('TRUE_BE_WITH_FEES');
  const [t1TrailPoints, setT1TrailPoints] = useState<number>(15);

  // Target 2
  const [t2Enabled, setT2Enabled] = useState<boolean>(false);
  const [t2R, setT2R] = useState<number>(2.0);
  const [t2Ratio, setT2Ratio] = useState<number>(0.5);
  const [t2TrailAction, setT2TrailAction] = useState<'TRAIL_T1' | 'CUSTOM_POINTS' | 'NONE'>('TRAIL_T1');
  const [t2TrailPoints, setT2TrailPoints] = useState<number>(30);

  // Runner
  const [isFreeRunner, setIsFreeRunner] = useState<boolean>(true);
  const [t3R, setT3R] = useState<number>(3.0);

  // Dynamic Trailing Ratchet
  const [dynamicTrailingEnabled, setDynamicTrailingEnabled] = useState<boolean>(false);
  const [dynamicTriggerR, setDynamicTriggerR] = useState<number>(1.5);
  const [dynamicTrailType, setDynamicTrailType] = useState<'STEP_R' | 'HIGH_WATER_POINTS'>('STEP_R');
  const [dynamicStepR, setDynamicStepR] = useState<number>(0.5);
  const [dynamicTrailPoints, setDynamicTrailPoints] = useState<number>(15);

  // Giveback Protection Auto-Exit
  const [givebackAutoExitEnabled, setGivebackAutoExitEnabled] = useState<boolean>(false);
  const [givebackMinPeakR, setGivebackMinPeakR] = useState<number>(1.5);
  const [givebackMaxPercent, setGivebackMaxPercent] = useState<number>(40);

  // Intraday MIS Square-Off Guard
  const [misSquareOffEnabled, setMisSquareOffEnabled] = useState<boolean>(false);

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
          if (parsed.targetMode) {
            setTargetMode(parsed.targetMode as TargetPlanningPreset);
          }
          if (parsed.t1) {
            setT1R(parsed.t1.targetR ?? 1.0);
            setT1Ratio(parsed.t1.exitRatio ?? 0.5);
            setT1TrailAction((parsed.t1.trailAction as any) ?? 'TRUE_BE_WITH_FEES');
            if (parsed.t1.trailPoints) setT1TrailPoints(parsed.t1.trailPoints);
          }
          if (parsed.t2) {
            setT2Enabled(parsed.t2.enabled !== false);
            setT2R(parsed.t2.targetR ?? 2.0);
            setT2Ratio(parsed.t2.exitRatio ?? 0.5);
            setT2TrailAction((parsed.t2.trailAction as any) ?? 'TRAIL_T1');
            if (parsed.t2.trailPoints) setT2TrailPoints(parsed.t2.trailPoints);
          } else if (parsed.targetMode === 'T1_FREE_RUNNER' || parsed.targetMode === 'T1_ONLY') {
            setT2Enabled(false);
          }
          if (parsed.t3) {
            setIsFreeRunner(parsed.t3.isFreeRunner === true);
            setT3R(parsed.t3.targetR ?? 3.0);
          }
          if (parsed.dynamicTrailing) {
            setDynamicTrailingEnabled(Boolean(parsed.dynamicTrailing.enabled));
            if (parsed.dynamicTrailing.triggerR) setDynamicTriggerR(parsed.dynamicTrailing.triggerR);
            if (parsed.dynamicTrailing.trailType) setDynamicTrailType(parsed.dynamicTrailing.trailType);
            if (parsed.dynamicTrailing.trailStepR) setDynamicStepR(parsed.dynamicTrailing.trailStepR);
            if (parsed.dynamicTrailing.trailPoints) setDynamicTrailPoints(parsed.dynamicTrailing.trailPoints);
          }
          if (parsed.givebackAutoExit) {
            setGivebackAutoExitEnabled(Boolean(parsed.givebackAutoExit.enabled));
            if (parsed.givebackAutoExit.minPeakR) setGivebackMinPeakR(parsed.givebackAutoExit.minPeakR);
            if (parsed.givebackAutoExit.maxGivebackPercent) setGivebackMaxPercent(parsed.givebackAutoExit.maxGivebackPercent);
          }
          if (parsed.misSquareOff) {
            setMisSquareOffEnabled(Boolean(parsed.misSquareOff.enabled));
          }
          return;
        } catch {
          // fallback to defaults
        }
      }

      // Default preset: Target 1 + Free Move Runner (T2 disabled, Free Runner enabled)
      setLotSize(defaultLotSize);
      setAutoExecute(false);
      setTargetMode('T1_FREE_RUNNER');
      setT1R(1.0);
      setT1Ratio(0.5);
      setT1TrailAction('TRUE_BE_WITH_FEES');
      setT2Enabled(false);
      setT2R(2.0);
      setT2Ratio(0.5);
      setT2TrailAction('TRAIL_T1');
      setIsFreeRunner(true);
      setT3R(3.0);
      setDynamicTrailingEnabled(false);
      setDynamicTriggerR(1.5);
      setDynamicTrailType('STEP_R');
      setDynamicStepR(0.5);
      setDynamicTrailPoints(15);
      setGivebackAutoExitEnabled(false);
      setGivebackMinPeakR(1.5);
      setGivebackMaxPercent(40);
      setMisSquareOffEnabled(false);
    }
  }, [metric, open, defaultLotSize]);

  if (!metric) return null;

  const totalQty = metric.quantity || 1;
  const isLong = metric.direction === 'LONG';
  const isLotBased = lotSize > 1;
  const totalLots = isLotBased ? Math.max(1, Math.floor(totalQty / lotSize)) : totalQty;

  const isT1AllOut = t1Ratio >= 1.0;
  const effectiveT2Enabled = !isT1AllOut && t2Enabled;
  const effectiveRunnerEnabled = !isT1AllOut;

  // Calculate live prices based on risk
  const riskPts = metric.targetLadder?.initialRiskPoints ?? (metric.stopLoss !== null ? Math.abs(metric.entryPrice - metric.stopLoss) : 10);
  const t1Price = Number((isLong ? metric.entryPrice + t1R * riskPts : metric.entryPrice - t1R * riskPts).toFixed(2));
  const t2Price = Number((isLong ? metric.entryPrice + t2R * riskPts : metric.entryPrice - t2R * riskPts).toFixed(2));
  const t3Price = Number((isLong ? metric.entryPrice + t3R * riskPts : metric.entryPrice - t3R * riskPts).toFixed(2));

  // Exit lots calculation
  let t1ExitLots = 1;
  if (isT1AllOut) {
    t1ExitLots = totalLots;
  } else if (totalLots > 1) {
    t1ExitLots = Math.max(1, Math.min(totalLots - 1, Math.round(totalLots * t1Ratio)));
  }
  const t1ExitUnits = isLotBased ? t1ExitLots * lotSize : Math.round(totalQty * t1Ratio);

  const remLotsAfterT1 = Math.max(0, totalLots - t1ExitLots);
  const remUnitsAfterT1 = Math.max(0, totalQty - t1ExitUnits);

  let t2ExitLots = 0;
  let t2ExitUnits = 0;
  if (effectiveT2Enabled && remLotsAfterT1 > 0) {
    if (remLotsAfterT1 > 1) {
      t2ExitLots = Math.max(1, Math.min(remLotsAfterT1 - 1, Math.round(remLotsAfterT1 * t2Ratio)));
    } else {
      t2ExitLots = 1;
    }
    t2ExitUnits = isLotBased ? t2ExitLots * lotSize : Math.round(remUnitsAfterT1 * t2Ratio);
  }

  let runnerLots = 0;
  let runnerUnits = 0;
  if (effectiveRunnerEnabled) {
    runnerLots = Math.max(1, totalLots - t1ExitLots - (effectiveT2Enabled ? t2ExitLots : 0));
    runnerUnits = isLotBased
      ? runnerLots * lotSize
      : Math.max(1, totalQty - t1ExitUnits - (effectiveT2Enabled ? t2ExitUnits : 0));
  }

  const trueBe = metric.trueBreakevenPrice ?? metric.entryPrice;

  const handleApplyPreset = (mode: TargetPlanningPreset) => {
    setTargetMode(mode);
    if (mode === 'T1_FREE_RUNNER') {
      setT1Ratio(0.5);
      setT2Enabled(false);
      setIsFreeRunner(true);
    } else if (mode === 'TWO_TARGETS_RUNNER') {
      setT1Ratio(0.5);
      setT2Enabled(true);
      setIsFreeRunner(true);
    } else if (mode === 'CLASSIC_THREE') {
      setT1Ratio(totalLots >= 3 ? 0.33 : 0.5);
      setT2Enabled(true);
      setIsFreeRunner(false);
    } else if (mode === 'T1_ONLY') {
      setT1Ratio(1.0);
      setT2Enabled(false);
      setIsFreeRunner(false);
    }
  };

  const handleSave = () => {
    const rules: ICustomLadderRules = {
      tradeId: metric.tradeId,
      lotSize,
      autoExecuteEnabled: autoExecute,
      targetMode,
      t1: {
        targetR: t1R,
        exitRatio: t1Ratio,
        customLots: isLotBased ? t1ExitLots : undefined,
        trailAction: t1TrailAction,
        trailPoints: t1TrailAction === 'CUSTOM_POINTS' ? t1TrailPoints : undefined,
      },
      t2: {
        enabled: effectiveT2Enabled,
        targetR: t2R,
        exitRatio: t2Ratio,
        customLots: isLotBased && effectiveT2Enabled ? t2ExitLots : undefined,
        trailAction: t2TrailAction,
        trailPoints: t2TrailAction === 'CUSTOM_POINTS' ? t2TrailPoints : undefined,
      },
      t3: {
        enabled: effectiveRunnerEnabled && runnerLots > 0,
        targetR: isFreeRunner ? 0 : t3R,
        exitRatio: 1.0,
        customLots: isLotBased && effectiveRunnerEnabled ? runnerLots : undefined,
        trailAction: 'NONE',
        isFreeRunner,
      },
      dynamicTrailing: {
        enabled: dynamicTrailingEnabled,
        triggerR: dynamicTriggerR,
        trailType: dynamicTrailType,
        trailStepR: dynamicStepR,
        trailPoints: dynamicTrailPoints,
      },
      givebackAutoExit: {
        enabled: givebackAutoExitEnabled,
        minPeakR: givebackMinPeakR,
        maxGivebackPercent: givebackMaxPercent,
      },
      misSquareOff: {
        enabled: misSquareOffEnabled,
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
        {/* Quick Strategy Presets */}
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.secondary', display: 'block', mb: 1 }}>
            Target Strategy Preset
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
            <Button
              size="small"
              variant={targetMode === 'T1_FREE_RUNNER' ? 'contained' : 'outlined'}
              onClick={() => handleApplyPreset('T1_FREE_RUNNER')}
              startIcon={<RocketLaunchRoundedIcon sx={{ fontSize: '14px !important' }} />}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                py: 0.75,
                bgcolor: targetMode === 'T1_FREE_RUNNER' ? '#8B5CF6' : 'transparent',
                borderColor: targetMode === 'T1_FREE_RUNNER' ? '#8B5CF6' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                color: targetMode === 'T1_FREE_RUNNER' ? '#FFFFFF' : 'text.primary',
                '&:hover': {
                  bgcolor: targetMode === 'T1_FREE_RUNNER' ? '#7C3AED' : alpha('#8B5CF6', 0.1),
                },
              }}
            >
              ⚡ Target 1 + Free Move
            </Button>

            <Button
              size="small"
              variant={targetMode === 'TWO_TARGETS_RUNNER' ? 'contained' : 'outlined'}
              onClick={() => handleApplyPreset('TWO_TARGETS_RUNNER')}
              startIcon={<TrendingUpRoundedIcon sx={{ fontSize: '14px !important' }} />}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                py: 0.75,
                bgcolor: targetMode === 'TWO_TARGETS_RUNNER' ? '#3B82F6' : 'transparent',
                borderColor: targetMode === 'TWO_TARGETS_RUNNER' ? '#3B82F6' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                color: targetMode === 'TWO_TARGETS_RUNNER' ? '#FFFFFF' : 'text.primary',
                '&:hover': {
                  bgcolor: targetMode === 'TWO_TARGETS_RUNNER' ? '#2563EB' : alpha('#3B82F6', 0.1),
                },
              }}
            >
              🎯 2 Targets + Free Move
            </Button>

            <Button
              size="small"
              variant={targetMode === 'CLASSIC_THREE' ? 'contained' : 'outlined'}
              onClick={() => handleApplyPreset('CLASSIC_THREE')}
              startIcon={<TrackChangesRoundedIcon sx={{ fontSize: '14px !important' }} />}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                py: 0.75,
                bgcolor: targetMode === 'CLASSIC_THREE' ? '#0284C7' : 'transparent',
                borderColor: targetMode === 'CLASSIC_THREE' ? '#0284C7' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                color: targetMode === 'CLASSIC_THREE' ? '#FFFFFF' : 'text.primary',
                '&:hover': {
                  bgcolor: targetMode === 'CLASSIC_THREE' ? '#0369A1' : alpha('#0284C7', 0.1),
                },
              }}
            >
              📐 Classic Fixed R1-R3
            </Button>

            <Button
              size="small"
              variant={targetMode === 'T1_ONLY' ? 'contained' : 'outlined'}
              onClick={() => handleApplyPreset('T1_ONLY')}
              startIcon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important' }} />}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                py: 0.75,
                bgcolor: targetMode === 'T1_ONLY' ? '#10B981' : 'transparent',
                borderColor: targetMode === 'T1_ONLY' ? '#10B981' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                color: targetMode === 'T1_ONLY' ? '#FFFFFF' : 'text.primary',
                '&:hover': {
                  bgcolor: targetMode === 'T1_ONLY' ? '#059669' : alpha('#10B981', 0.1),
                },
              }}
            >
              🏁 All-Out at T1 (100%)
            </Button>
          </Box>
        </Box>

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

        {/* Live Lot & Position Distribution Preview */}
        <Box
          sx={{
            p: 1.25,
            borderRadius: '8px',
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            border: '1px dashed',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 700, display: 'block', mb: 0.75 }}>
            PLANNED POSITION DISTRIBUTION:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={`T1: ${isLotBased ? `${t1ExitLots} lots` : `${t1ExitUnits} qty`} (${Math.round((t1ExitUnits / totalQty) * 100)}%)`}
              size="small"
              sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#10B981', 0.15), color: '#10B981', border: `1px solid ${alpha('#10B981', 0.3)}` }}
            />
            {effectiveT2Enabled && (
              <Chip
                label={`T2: ${isLotBased ? `${t2ExitLots} lots` : `${t2ExitUnits} qty`} (${Math.round((t2ExitUnits / totalQty) * 100)}%)`}
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#3B82F6', 0.15), color: '#3B82F6', border: `1px solid ${alpha('#3B82F6', 0.3)}` }}
              />
            )}
            {effectiveRunnerEnabled && (
              <Chip
                label={`Runner (${isFreeRunner ? 'Free Move' : `+${t3R}R`}): ${isLotBased ? `${runnerLots} lots` : `${runnerUnits} qty`} (${Math.round((runnerUnits / totalQty) * 100)}%)`}
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#8B5CF6', 0.15), color: '#8B5CF6', border: `1px solid ${alpha('#8B5CF6', 0.3)}` }}
              />
            )}
          </Box>
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
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setT1Ratio(val);
                    if (val >= 1.0) {
                      setTargetMode('T1_ONLY');
                    }
                  }}
                >
                  <MenuItem value={0.3}>30% ({isLotBased ? `${Math.max(1, Math.round(totalLots * 0.3))} lots` : `${Math.round(totalQty * 0.3)} qty`})</MenuItem>
                  <MenuItem value={0.5}>50% ({isLotBased ? `${Math.max(1, Math.round(totalLots * 0.5))} lots` : `${Math.round(totalQty * 0.5)} qty`})</MenuItem>
                  <MenuItem value={0.7}>70% ({isLotBased ? `${Math.max(1, Math.round(totalLots * 0.7))} lots` : `${Math.round(totalQty * 0.7)} qty`})</MenuItem>
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
            bgcolor: effectiveT2Enabled
              ? alpha('#3B82F6', isDark ? 0.06 : 0.04)
              : isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.015)',
            border: '1px solid',
            borderColor: effectiveT2Enabled
              ? alpha('#3B82F6', 0.25)
              : isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            opacity: isT1AllOut ? 0.5 : 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TrackChangesRoundedIcon sx={{ fontSize: 16, color: effectiveT2Enabled ? '#3B82F6' : 'text.disabled' }} />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 800,
                  color: effectiveT2Enabled ? '#3B82F6' : 'text.disabled',
                  fontSize: '0.8rem',
                }}
              >
                TARGET 2 (R2)
              </Typography>
              {!effectiveT2Enabled && !isT1AllOut && (
                <Chip label="DISABLED" size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {effectiveT2Enabled && (
                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                  @ ₹{t2Price}
                </Typography>
              )}
              {!isT1AllOut && (
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={t2Enabled}
                      onChange={(e) => setT2Enabled(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      {t2Enabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
              )}
            </Box>
          </Box>

          {effectiveT2Enabled ? (
            <>
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
                      <MenuItem value={1.0}>100% of Remainder ({isLotBased ? `${remLotsAfterT1} lots` : `${remUnitsAfterT1} qty`})</MenuItem>
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

              {t2TrailAction === 'CUSTOM_POINTS' && (
                <TextField
                  size="small"
                  type="number"
                  label="Trail by Points"
                  value={t2TrailPoints}
                  onChange={(e) => setT2TrailPoints(Math.max(1, Number(e.target.value)))}
                  sx={{ mt: 1, width: 180 }}
                />
              )}

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontSize: '0.65rem' }}>
                Action: Book {isLotBased ? `${t2ExitLots} lot (${t2ExitUnits} units)` : `${t2ExitUnits} units`} &{' '}
                {t2TrailAction === 'TRAIL_T1'
                  ? `trail SL to +1R (₹${t1Price})`
                  : t2TrailAction === 'CUSTOM_POINTS'
                  ? `trail SL by +${t2TrailPoints} pts`
                  : 'maintain current SL'}
              </Typography>
            </>
          ) : (
            <Box sx={{ py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                {isT1AllOut
                  ? 'Target 2 inactive because Target 1 is set to 100% all-out exit.'
                  : 'Target 2 is disabled. 100% of the remaining position after Target 1 passes directly to the Runner.'}
              </Typography>
              {!isT1AllOut && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setT2Enabled(true)}
                  startIcon={<AddCircleOutlineRoundedIcon sx={{ fontSize: '13px !important' }} />}
                  sx={{ height: 24, fontSize: '0.65rem', textTransform: 'none', fontWeight: 700 }}
                >
                  Enable T2
                </Button>
              )}
            </Box>
          )}
        </Box>

        {/* Runner Rule Card */}
        {effectiveRunnerEnabled && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: '10px',
              bgcolor: isFreeRunner
                ? alpha('#8B5CF6', isDark ? 0.08 : 0.04)
                : isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
              border: '1px solid',
              borderColor: isFreeRunner
                ? alpha('#8B5CF6', 0.3)
                : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <RocketLaunchRoundedIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#8B5CF6', fontSize: '0.8rem' }}>
                  RUNNER {isFreeRunner ? '(FREE MOVE)' : '(FIXED TARGET)'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {!isFreeRunner && (
                  <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                    @ ₹{t3Price}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)', borderRadius: '6px', p: 0.25 }}>
                  <Button
                    size="small"
                    onClick={() => setIsFreeRunner(true)}
                    sx={{
                      height: 20,
                      px: 0.75,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      bgcolor: isFreeRunner ? '#8B5CF6' : 'transparent',
                      color: isFreeRunner ? '#FFFFFF' : 'text.secondary',
                      borderRadius: '4px',
                      '&:hover': { bgcolor: isFreeRunner ? '#7C3AED' : alpha('#8B5CF6', 0.1) },
                    }}
                  >
                    🚀 Free Move
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setIsFreeRunner(false)}
                    sx={{
                      height: 20,
                      px: 0.75,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      bgcolor: !isFreeRunner ? '#8B5CF6' : 'transparent',
                      color: !isFreeRunner ? '#FFFFFF' : 'text.secondary',
                      borderRadius: '4px',
                      '&:hover': { bgcolor: !isFreeRunner ? '#7C3AED' : alpha('#8B5CF6', 0.1) },
                    }}
                  >
                    🎯 Fixed R
                  </Button>
                </Box>
              </Box>
            </Box>

            {isFreeRunner ? (
              <Box sx={{ p: 1, borderRadius: '6px', bgcolor: alpha('#8B5CF6', 0.08), border: `1px solid ${alpha('#8B5CF6', 0.2)}` }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: '#8B5CF6', display: 'block', mb: 0.25 }}>
                  ✨ Open Trend Runner Active (No Target Price Cap)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  Remaining <strong>{isLotBased ? `${runnerLots} lot (${runnerUnits} units)` : `${runnerUnits} units`}</strong> will ride market momentum without an artificial ceiling. Trailing Stop Loss protects profits.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TextField
                  size="small"
                  type="number"
                  label="Runner Target R"
                  value={t3R}
                  onChange={(e) => setT3R(Math.max(t2Enabled ? t2R + 0.5 : t1R + 0.5, Number(e.target.value)))}
                  slotProps={{ htmlInput: { step: 0.5, min: t2Enabled ? t2R + 0.5 : t1R + 0.5 } }}
                  sx={{ width: 140 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Exits remaining: <strong>{isLotBased ? `${runnerLots} lot (${runnerUnits} units)` : `${runnerUnits} units`}</strong>
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* 🔄 DYNAMIC STEP-TRAILING RATCHET */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: dynamicTrailingEnabled
              ? alpha('#3B82F6', isDark ? 0.12 : 0.06)
              : isDark
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(0, 0, 0, 0.02)',
            border: '1px solid',
            borderColor: dynamicTrailingEnabled ? alpha('#3B82F6', 0.4) : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: dynamicTrailingEnabled ? 1.5 : 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TuneRoundedIcon sx={{ fontSize: 18, color: dynamicTrailingEnabled ? '#3B82F6' : 'text.secondary' }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Dynamic Step-Trailing Ratchet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Continuously advances broker Stop Loss as trade sets new peak highs
                </Typography>
              </Box>
            </Box>
            <Switch
              size="small"
              checked={dynamicTrailingEnabled}
              onChange={(e) => setDynamicTrailingEnabled(e.target.checked)}
              color="primary"
            />
          </Box>

          {dynamicTrailingEnabled && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <TextField
                  size="small"
                  type="number"
                  label="Activation Trigger R"
                  value={dynamicTriggerR}
                  onChange={(e) => setDynamicTriggerR(Math.max(1.0, Number(e.target.value)))}
                  slotProps={{ htmlInput: { step: 0.5, min: 1.0 } }}
                  sx={{ width: 150 }}
                  helperText="Start trailing once R is reached"
                />

                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Trailing Method</InputLabel>
                  <Select
                    value={dynamicTrailType}
                    label="Trailing Method"
                    onChange={(e) => setDynamicTrailType(e.target.value as any)}
                  >
                    <MenuItem value="STEP_R">Step R (+0.5R ratchet)</MenuItem>
                    <MenuItem value="HIGH_WATER_POINTS">High-Water Mark (Points)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {dynamicTrailType === 'HIGH_WATER_POINTS' ? (
                <TextField
                  size="small"
                  type="number"
                  label="Trailing Distance (Points)"
                  value={dynamicTrailPoints}
                  onChange={(e) => setDynamicTrailPoints(Math.max(1, Number(e.target.value)))}
                  slotProps={{ htmlInput: { step: 1, min: 1 } }}
                  sx={{ width: 180 }}
                  helperText="Points behind peak price"
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Locks in <strong>+{Math.max(0.5, dynamicTriggerR - dynamicStepR).toFixed(1)}R</strong> upon hitting {dynamicTriggerR}R, then ratchets stop by <strong>+{dynamicStepR}R</strong> for every additional {dynamicStepR}R gained.
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* 🛡️ GIVEBACK PROTECTION AUTO-EXIT */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: givebackAutoExitEnabled
              ? alpha('#F59E0B', isDark ? 0.12 : 0.06)
              : isDark
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(0, 0, 0, 0.02)',
            border: '1px solid',
            borderColor: givebackAutoExitEnabled ? alpha('#F59E0B', 0.4) : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: givebackAutoExitEnabled ? 1.5 : 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldRoundedIcon sx={{ fontSize: 18, color: givebackAutoExitEnabled ? '#F59E0B' : 'text.secondary' }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Giveback Protection Auto-Exit
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Auto-exits runner if peak profit surrenders beyond safety threshold
                </Typography>
              </Box>
            </Box>
            <Switch
              size="small"
              checked={givebackAutoExitEnabled}
              onChange={(e) => setGivebackAutoExitEnabled(e.target.checked)}
              color="warning"
            />
          </Box>

          {givebackAutoExitEnabled && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', pt: 1, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
              <TextField
                size="small"
                type="number"
                label="Min Peak MFE (R)"
                value={givebackMinPeakR}
                onChange={(e) => setGivebackMinPeakR(Math.max(1.0, Number(e.target.value)))}
                slotProps={{ htmlInput: { step: 0.5, min: 1.0 } }}
                sx={{ width: 140 }}
                helperText="Must reach e.g. +1.5R"
              />
              <TextField
                size="small"
                type="number"
                label="Max Giveback %"
                value={givebackMaxPercent}
                onChange={(e) => setGivebackMaxPercent(Math.min(90, Math.max(10, Number(e.target.value))))}
                slotProps={{ htmlInput: { step: 5, min: 10, max: 90 } }}
                sx={{ width: 140 }}
                helperText="Exit if gives back > 40%"
              />
            </Box>
          )}
        </Box>

        {/* ⏱️ INTRADAY MIS AUTO-SQUARE-OFF */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: '10px',
            bgcolor: misSquareOffEnabled
              ? alpha('#EC4899', isDark ? 0.12 : 0.06)
              : isDark
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(0, 0, 0, 0.02)',
            border: '1px solid',
            borderColor: misSquareOffEnabled ? alpha('#EC4899', 0.4) : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ color: misSquareOffEnabled ? '#EC4899' : 'text.secondary' }}>⏱️</Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Intraday MIS Auto-Square-Off Guard (15:14 IST)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Auto-exits at 15:14 IST before FYERS levies ₹50+GST broker square-off penalties
              </Typography>
            </Box>
          </Box>
          <Switch
            size="small"
            checked={misSquareOffEnabled}
            onChange={(e) => setMisSquareOffEnabled(e.target.checked)}
            color="secondary"
          />
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
