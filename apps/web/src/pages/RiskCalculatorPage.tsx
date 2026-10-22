import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import CalculateIcon from '@mui/icons-material/CalculateRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHighRounded';
import TuneIcon from '@mui/icons-material/TuneRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { calculateRiskAndPositionSize, calculateFractionalKelly } from '@tradevault/financial-engine';
import { getPresetSpec } from '@tradevault/shared';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { formatCurrency, formatPercent, currentLocalIsoDateTime } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';

/**
 * Sanitizes input text into a clean numeric string, preventing leading zeros
 * (like "0120845" -> "120845" or "0100" -> "100") and supporting smooth backspacing.
 */
function sanitizeNumericInput(val: string): string {
  let clean = val.replace(/[^\d.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }
  if (/^0\d/.test(clean)) {
    clean = clean.replace(/^0+/, '');
  }
  return clean;
}

export function RiskCalculatorPage() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });
  const { data: instruments = [] } = useQuery({ queryKey: ['instruments'], queryFn: () => api.instruments.list() });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: () => api.strategies.list() });

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');

  // 1. Account & Risk Budget string states (for seamless live typing & clearing)
  const [accountEquityStr, setAccountEquityStr] = useState<string>('200000');
  const [riskMode, setRiskMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [riskPercentStr, setRiskPercentStr] = useState<string>('1.0');
  const [fixedRiskAmountStr, setFixedRiskAmountStr] = useState<string>('2000');

  // 2. Trade Setup string states
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NIFTY');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPriceStr, setEntryPriceStr] = useState<string>('24000');
  const [stopLossPriceStr, setStopLossPriceStr] = useState<string>('23940');
  const [targetPriceStr, setTargetPriceStr] = useState<string>('24150');

  // 3. Contract & Execution parameters
  const [lotSizeStr, setLotSizeStr] = useState<string>('25');
  const [contractMultiplierStr, setContractMultiplierStr] = useState<string>('1');
  const [estimatedCostsStr, setEstimatedCostsStr] = useState<string>('50');

  // 4. Sizing Mode: Conservative Floor vs Nearest Lot vs Cash Single Shares
  const [sizingMode, setSizingMode] = useState<'FLOOR' | 'NEAREST' | 'CASH_1'>('FLOOR');

  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [prefilledTradeData, setPrefilledTradeData] = useState<any>(null);

  // Auto-set account equity when accounts list loads
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
      const balance = accounts[0].currentBalance || accounts[0].initialBalance || 200000;
      setAccountEquityStr(String(balance));
      if (riskMode === 'PERCENT') {
        const p = parseFloat(riskPercentStr) || 1.0;
        setFixedRiskAmountStr(((balance * p) / 100).toFixed(2));
      } else {
        const f = parseFloat(fixedRiskAmountStr) || 2000;
        setRiskPercentStr(balance > 0 ? ((f / balance) * 100).toFixed(2) : '1.0');
      }
    }
  }, [accounts, selectedAccountId]);

  // Account change handler (live updates connected risk budget)
  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = accounts.find((a: any) => a.id === accId);
    if (acc) {
      const balance = acc.currentBalance || acc.initialBalance || 200000;
      setAccountEquityStr(String(balance));
      if (riskMode === 'PERCENT') {
        const p = parseFloat(riskPercentStr) || 1.0;
        setFixedRiskAmountStr(((balance * p) / 100).toFixed(2));
      } else {
        const f = parseFloat(fixedRiskAmountStr) || 2000;
        setRiskPercentStr(balance > 0 ? ((f / balance) * 100).toFixed(2) : '1.0');
      }
    }
  };

  // Live 2-way sync for Account Equity
  const handleEquityChange = (newVal: string) => {
    const clean = sanitizeNumericInput(newVal);
    setAccountEquityStr(clean);
    const eq = parseFloat(clean) || 0;
    if (riskMode === 'PERCENT') {
      const p = parseFloat(riskPercentStr) || 0;
      setFixedRiskAmountStr(eq > 0 ? ((eq * p) / 100).toFixed(2) : '0');
    } else {
      const f = parseFloat(fixedRiskAmountStr) || 0;
      setRiskPercentStr(eq > 0 ? ((f / eq) * 100).toFixed(2) : '0');
    }
  };

  // Live 2-way sync for Risk %
  const handleRiskPercentChange = (newVal: string) => {
    const clean = sanitizeNumericInput(newVal);
    setRiskPercentStr(clean);
    const p = parseFloat(clean) || 0;
    const eq = parseFloat(accountEquityStr) || 0;
    setFixedRiskAmountStr(eq > 0 ? ((eq * p) / 100).toFixed(2) : '0');
  };

  // Live 2-way sync for Fixed Risk Amount
  const handleFixedRiskChange = (newVal: string) => {
    const clean = sanitizeNumericInput(newVal);
    setFixedRiskAmountStr(clean);
    const f = parseFloat(clean) || 0;
    const eq = parseFloat(accountEquityStr) || 0;
    setRiskPercentStr(eq > 0 ? ((f / eq) * 100).toFixed(2) : '0');
  };

  // Live intelligent direction toggle (mirrors Stop & Target across Entry so setup stays immediately valid)
  const handleDirectionChange = (newDir: 'LONG' | 'SHORT') => {
    if (newDir === direction) return;
    setDirection(newDir);
    const entry = parseFloat(entryPriceStr) || 0;
    const stop = parseFloat(stopLossPriceStr) || 0;
    const target = parseFloat(targetPriceStr) || 0;
    if (entry > 0 && stop > 0) {
      const stopDist = Math.abs(entry - stop);
      const newStop = newDir === 'LONG' ? entry - stopDist : entry + stopDist;
      setStopLossPriceStr(newStop > 0 ? String(Number(newStop.toFixed(2))) : '');
      if (target > 0) {
        const targetDist = Math.abs(target - entry);
        const newTarget = newDir === 'LONG' ? entry + targetDist : entry - targetDist;
        setTargetPriceStr(newTarget > 0 ? String(Number(newTarget.toFixed(2))) : '');
      }
    }
  };

  // Symbol change handler: matches user's instruments first, then preset catalog fallback
  const handleSymbolChange = (sym: string) => {
    setSelectedSymbol(sym);
    const cleanSym = sym.trim().toUpperCase();
    const inst = instruments.find((i: any) => i.symbol.toUpperCase() === cleanSym);
    if (inst) {
      setContractMultiplierStr(String(inst.contractMultiplier || 1));
      setLotSizeStr(String(inst.lotSize || 1));
    } else {
      const preset = getPresetSpec(cleanSym);
      if (preset) {
        setContractMultiplierStr(String(preset.contractMultiplier || 1));
        setLotSizeStr(String(preset.lotSize || 1));
      } else {
        setContractMultiplierStr('1');
        setLotSizeStr('1');
      }
    }
  };

  // Live Quick R:R Preset Applicator (1:1.5, 1:2.0, 1:2.5, 1:3.0, etc.)
  const applyRRRatio = (ratio: number) => {
    const entry = parseFloat(entryPriceStr) || 0;
    const stop = parseFloat(stopLossPriceStr) || 0;
    if (entry <= 0 || stop <= 0) {
      toast.warning('Please enter valid Entry and Stop Loss prices first.');
      return;
    }
    const stopDist = Math.abs(entry - stop);
    if (stopDist === 0) {
      toast.warning('Stop Loss cannot equal Entry Price.');
      return;
    }
    const targetDist = stopDist * ratio;
    const newTarget = direction === 'LONG' ? entry + targetDist : entry - targetDist;
    if (newTarget > 0) {
      setTargetPriceStr(String(Number(newTarget.toFixed(2))));
      toast.success(`Target updated live to ${newTarget.toFixed(2)} for 1 : ${ratio.toFixed(2)} R:R`);
    }
  };

  // Live Quick Stop Distance Presets
  const applyStopDistance = (pts: number) => {
    const entry = parseFloat(entryPriceStr) || 0;
    if (entry <= 0) return;
    const newStop = direction === 'LONG' ? entry - pts : entry + pts;
    if (newStop > 0) {
      setStopLossPriceStr(String(Number(newStop.toFixed(2))));
    }
  };

  const applyStopPercent = (pct: number) => {
    const entry = parseFloat(entryPriceStr) || 0;
    if (entry <= 0) return;
    const pts = (entry * pct) / 100;
    applyStopDistance(pts);
  };

  // ==================== NUMERICAL PARSING & DERIVED QUANTITIES ====================
  const entryPrice = parseFloat(entryPriceStr) || 0;
  const stopLossPrice = parseFloat(stopLossPriceStr) || 0;
  const targetPrice = parseFloat(targetPriceStr) || 0;
  const accountEquity = parseFloat(accountEquityStr) || 0;
  const contractMultiplier = Math.max(1, parseFloat(contractMultiplierStr) || 1);
  const lotSize = Math.max(1, parseFloat(lotSizeStr) || 1);
  const estimatedCosts = Math.max(0, parseFloat(estimatedCostsStr) || 0);
  const riskPercent = parseFloat(riskPercentStr) || 0;
  const fixedRiskAmount = parseFloat(fixedRiskAmountStr) || 0;

  // Perform deterministic financial calculation via financial engine
  const calcResult = calculateRiskAndPositionSize({
    accountEquity: accountEquity > 0 ? accountEquity : 1,
    riskPercent: riskMode === 'PERCENT' ? (riskPercent > 0 ? riskPercent : 0.01) : undefined,
    fixedRiskAmount: riskMode === 'FIXED' ? (fixedRiskAmount > 0 ? fixedRiskAmount : 1) : undefined,
    entryPrice: entryPrice > 0 ? entryPrice : 1,
    stopLossPrice: stopLossPrice > 0 ? stopLossPrice : 0.9,
    targetPrice: targetPrice > 0 ? targetPrice : undefined,
    direction,
    contractMultiplier,
    lotSize,
    quantityIncrement: lotSize, // Synchronized with lot size
    estimatedCosts,
  });

  // Setup geometric metrics (always live)
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  const stopDistancePercent = entryPrice > 0 ? (stopDistance / entryPrice) * 100 : 0;
  const targetDistance = targetPrice > 0 ? Math.abs(targetPrice - entryPrice) : 0;
  const targetDistancePercent = (entryPrice > 0 && targetPrice > 0) ? (targetDistance / entryPrice) * 100 : 0;
  const structuralRR = stopDistance > 0 && targetDistance > 0 ? Number((targetDistance / stopDistance).toFixed(2)) : undefined;

  // Geometry validation (independent of sizing budget)
  const isZeroStopDistance = entryPrice > 0 && stopLossPrice > 0 && stopDistance === 0;
  const isDirectionValid = direction === 'LONG'
    ? (entryPrice > 0 && stopLossPrice > 0 && stopLossPrice < entryPrice)
    : (entryPrice > 0 && stopLossPrice > 0 && stopLossPrice > entryPrice);
  const isTargetDirectionValid = targetPrice > 0
    ? (direction === 'LONG' ? targetPrice > entryPrice : targetPrice < entryPrice)
    : true;
  const isGeometryValid = isDirectionValid && !isZeroStopDistance && entryPrice > 0 && stopLossPrice > 0;

  // Multi-tier lot sizing options
  const rawQuantity = calcResult.rawSuggestedQuantity || 0;
  const floorLotQuantity = calcResult.roundedLotQuantity || 0;
  const nearestLots = Math.round(rawQuantity / lotSize);
  const nearestLotQuantity = nearestLots * lotSize;
  const cashShareQuantity = Math.floor(rawQuantity);

  // Determine effective quantity by user's selected mode
  let effectiveQuantity = floorLotQuantity;
  if (sizingMode === 'CASH_1') {
    effectiveQuantity = cashShareQuantity;
  } else if (sizingMode === 'NEAREST') {
    effectiveQuantity = nearestLotQuantity;
  }

  const effectiveLots = lotSize > 0 ? Math.round(effectiveQuantity / lotSize) : effectiveQuantity;
  const lossPerUnit = stopDistance * contractMultiplier;
  const effectiveRiskMonetary = effectiveQuantity * lossPerUnit + estimatedCosts;
  const effectiveRiskPercent = accountEquity > 0 ? (effectiveRiskMonetary / accountEquity) * 100 : 0;
  const effectiveGrossReward = targetDistance * contractMultiplier * effectiveQuantity;
  const effectiveNetReward = Math.max(0, effectiveGrossReward - estimatedCosts);
  const effectiveNotionalCapital = effectiveQuantity * entryPrice;
  const effectiveCapitalPercent = accountEquity > 0 ? (effectiveNotionalCapital / accountEquity) * 100 : 0;

  // Budget deficit diagnostics & 1-click remedies
  const plannedBudget = riskMode === 'FIXED' ? fixedRiskAmount : (accountEquity * riskPercent) / 100;
  const oneLotRiskAmount = 1 * lotSize * lossPerUnit + estimatedCosts;
  const isBudgetDeficit = isGeometryValid && floorLotQuantity === 0 && rawQuantity > 0;
  const budgetGap = Math.max(0, oneLotRiskAmount - plannedBudget);

  // Strategy & Kelly recommendations
  const selectedStrategy = strategies.find((s: any) => (s.id || s._id) === selectedStrategyId);
  const kellyResult = useMemo(() => {
    if (!selectedStrategy) return null;
    const edge = selectedStrategy.edge;
    const winRate = edge?.bayesianWinRate?.posteriorMeanWinRate ?? selectedStrategy.winRate ?? 50;
    const winProb = winRate / 100;
    const avgWin = edge?.bayesianWinRate?.averageWinPnL ?? (structuralRR ? structuralRR * 1000 : 1500);
    const avgLoss = edge?.bayesianWinRate?.averageLossPnL ?? 1000;

    return calculateFractionalKelly({
      winProbability: winProb,
      averageWinMagnitude: avgWin,
      averageLossMagnitude: avgLoss,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: edge?.verdict || 'UNPROVEN',
    });
  }, [selectedStrategy, structuralRR]);

  // ==================== REMEDY QUICK-ACTIONS ====================
  const handleAdjustBudgetTo1Lot = () => {
    setRiskMode('FIXED');
    const adjustedAmount = Math.ceil(oneLotRiskAmount);
    setFixedRiskAmountStr(String(adjustedAmount));
    if (accountEquity > 0) {
      setRiskPercentStr(((adjustedAmount / accountEquity) * 100).toFixed(2));
    }
    toast.success(`Risk budget adjusted live to ${formatCurrency(adjustedAmount)} (covers 1 full lot).`);
  };

  const handleTightenStopFor1Lot = () => {
    if (entryPrice <= 0 || plannedBudget <= 0 || lotSize <= 0) return;
    const allowableRiskPerUnit = (plannedBudget - estimatedCosts) / (lotSize * contractMultiplier);
    if (allowableRiskPerUnit <= 0) {
      toast.warning('Budget is smaller than estimated costs.');
      return;
    }
    const newStop = direction === 'LONG' ? entryPrice - allowableRiskPerUnit : entryPrice + allowableRiskPerUnit;
    if (newStop > 0) {
      setStopLossPriceStr(String(Number(newStop.toFixed(2))));
      toast.success(`Stop Loss adjusted live to ${newStop.toFixed(2)} (${allowableRiskPerUnit.toFixed(1)} pts) to fit 1 lot within budget.`);
    }
  };

  const handleSwitchToCashShares = () => {
    setLotSizeStr('1');
    setSizingMode('CASH_1');
    toast.success('Switched to Single Share (Lot Size: 1) cash equity sizing.');
  };

  // Transfer prefilled parameters to Trade Form Modal
  const handleTransferToTrade = () => {
    setPrefilledTradeData({
      accountId: selectedAccountId,
      symbol: selectedSymbol,
      direction,
      status: 'OPEN',
      executionMode: 'SIMPLE',
      tradeDate: new Date().toISOString().split('T')[0],
      entryTime: currentLocalIsoDateTime(),
      simpleExecution: {
        entryPrice,
        quantity: effectiveQuantity,
        contractMultiplier,
        brokerage: estimatedCosts,
      },
      risk: {
        plannedEntryPrice: entryPrice,
        initialStopLoss: stopLossPrice,
        plannedTarget: targetPrice,
        riskBudgetAmount: plannedBudget,
        suggestedQuantity: effectiveQuantity,
        estimatedRiskAmount: effectiveRiskMonetary,
        plannedRewardRiskRatio: structuralRR,
      },
    });
    toast.info('Parameters copied to trade form.');
    setIsTradeModalOpen(true);
  };

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5, pb: 4 }}>
      {/* Header */}
      <Box sx={{ pb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary, display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <CalculateIcon sx={{ color: muiTheme.palette.primary.main, fontSize: 28 }} />
              Position Size & Live Risk Calculator
            </Typography>
            <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
              Live interactive sizing, geometric Reward-to-Risk, lot quantization, and capital exposure analytics.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<SecurityIcon sx={{ fontSize: '1rem !important' }} />}
              label="Real-Time 2-Way Sync Active"
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontWeight: 600, fontSize: '0.75rem' }}
            />
          </Box>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Input Parameters Column (7 Cols) */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TuneIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                Account & Trade Parameters
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Values update calculations instantaneously
              </Typography>
            </Box>
            <Divider />

            {/* Account & Equity */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Trading Account
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={selectedAccountId}
                    onChange={(e) => handleAccountChange(e.target.value)}
                  >
                    {accounts.map((acc: any) => (
                      <MenuItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.broker})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Account Equity (₹ / $)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={accountEquityStr}
                  onChange={(e) => handleEquityChange(e.target.value)}
                  placeholder="e.g. 650000"
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                />
              </Grid>
            </Grid>

            {/* Strategy Selection (Edge & Fractional Kelly) */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                Strategy Setup (Edge & Kelly Sizing)
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={selectedStrategyId}
                  onChange={(e) => setSelectedStrategyId(e.target.value)}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>Discretionary (No Strategy Assigned)</em>
                  </MenuItem>
                  {strategies.map((s: any) => (
                    <MenuItem key={s.id || s._id} value={s.id || s._id}>
                      {s.name} — {s.edge?.verdict === 'LIKELY_EDGE' ? 'Likely Edge' : s.edge?.verdict === 'NO_EDGE_NEGATIVE' ? 'Negative Edge' : 'Unproven Edge'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Risk Mode Toggle & 2-Way Live Sync */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary }}>
                  Risk Budget Allocation
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.primary.main, fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 }}>
                  Active Budget: {formatCurrency(plannedBudget)} ({formatPercent(riskMode === 'PERCENT' ? riskPercent : (accountEquity > 0 ? (fixedRiskAmount / accountEquity) * 100 : 0))})
                </Typography>
              </Box>

              <ButtonGroup fullWidth size="small" variant="outlined">
                <Button
                  variant={riskMode === 'PERCENT' ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => setRiskMode('PERCENT')}
                  sx={{ fontWeight: 700 }}
                >
                  Percentage of Equity (% Risk)
                </Button>
                <Button
                  variant={riskMode === 'FIXED' ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => setRiskMode('FIXED')}
                  sx={{ fontWeight: 700 }}
                >
                  Fixed Cash Amount (₹ / $)
                </Button>
              </ButtonGroup>

              <Box sx={{ mt: 1.5 }}>
                {riskMode === 'PERCENT' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <TextField
                        size="small"
                        value={riskPercentStr}
                        onChange={(e) => handleRiskPercentChange(e.target.value)}
                        placeholder="1.0"
                        sx={{ width: 130 }}
                        slotProps={{
                          input: {
                            endAdornment: <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>%</Typography>,
                            sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
                          },
                        }}
                      />
                      <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
                        = <Box component="strong" sx={{ color: muiTheme.palette.text.primary, fontFamily: `'JetBrains Mono', monospace` }}>{formatCurrency(plannedBudget)}</Box> maximum risk budget
                      </Typography>
                    </Box>
                    {/* Quick Risk % presets */}
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>Presets:</Typography>
                      {[0.5, 1.0, 1.5, 2.0, 3.0].map((pct) => (
                        <Chip
                          key={pct}
                          label={`${pct}%`}
                          size="small"
                          onClick={() => handleRiskPercentChange(String(pct))}
                          variant={parseFloat(riskPercentStr) === pct ? 'filled' : 'outlined'}
                          color={parseFloat(riskPercentStr) === pct ? 'primary' : 'default'}
                          sx={{ height: 20, fontSize: '0.625rem', fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700, cursor: 'pointer' }}
                        />
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={fixedRiskAmountStr}
                        onChange={(e) => handleFixedRiskChange(e.target.value)}
                        placeholder="e.g. 1500"
                        slotProps={{
                          input: {
                            startAdornment: <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.5 }}>₹/$</Typography>,
                            sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
                          },
                        }}
                      />
                      <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, whiteSpace: 'nowrap' }}>
                        = <Box component="strong" sx={{ color: muiTheme.palette.text.primary, fontFamily: `'JetBrains Mono', monospace` }}>{formatPercent(accountEquity > 0 ? (fixedRiskAmount / accountEquity) * 100 : 0)}</Box> of equity
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>

              {/* Quarter-Kelly Sizing Recommendation Card */}
              {selectedStrategy && kellyResult && (
                <Box
                  sx={{
                    mt: 2,
                    p: 1.5,
                    borderRadius: 2,
                    border: `1px solid ${muiTheme.palette.divider}`,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: muiTheme.palette.text.secondary }}>
                      Quarter-Kelly Recommendation
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        !kellyResult.isSuppressed && kellyResult.recommendedRiskPercent > 0
                          ? `${kellyResult.recommendedRiskPercent}% Risk (Quarter-Kelly)`
                          : 'Kelly Suppressed'
                      }
                      color={!kellyResult.isSuppressed && kellyResult.recommendedRiskPercent > 0 ? 'success' : 'default'}
                      sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ display: 'block', color: muiTheme.palette.text.secondary, fontSize: '0.6875rem' }}>
                    {kellyResult.explanation}
                  </Typography>
                  {!kellyResult.isSuppressed && kellyResult.recommendedRiskPercent > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      onClick={() => {
                        setRiskMode('PERCENT');
                        handleRiskPercentChange(String(kellyResult.recommendedRiskPercent));
                        toast.success(`Applied Quarter-Kelly risk: ${kellyResult.recommendedRiskPercent}%`);
                      }}
                      sx={{ mt: 1, fontSize: '0.6875rem', py: 0.25 }}
                    >
                      Apply {kellyResult.recommendedRiskPercent}% Risk
                    </Button>
                  )}
                </Box>
              )}
            </Box>

            {/* Symbol & Trade Direction */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Instrument Symbol
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={selectedSymbol}
                  onChange={(e) => handleSymbolChange(e.target.value.toUpperCase())}
                  placeholder="e.g. NIFTY, BANKNIFTY, RELIANCE"
                  slotProps={{
                    input: {
                      sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700, textTransform: 'uppercase' },
                      inputProps: { list: 'risk-calculator-symbol-list' },
                    },
                  }}
                />
                <datalist id="risk-calculator-symbol-list">
                  {instruments.map((i: any) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.displayName || i.symbol} ({i.exchange})
                    </option>
                  ))}
                </datalist>
                <Box sx={{ display: 'flex', gap: 0.6, mt: 1, flexWrap: 'wrap' }}>
                  {(instruments.length > 0
                    ? Array.from(new Set(instruments.map((i: any) => i.symbol))).slice(0, 7)
                    : ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'CRUDEOIL', 'GOLD']
                  ).map((s: any) => (
                    <Chip
                      key={s}
                      label={s}
                      size="small"
                      onClick={() => handleSymbolChange(s)}
                      color={selectedSymbol.toUpperCase() === s ? 'primary' : 'default'}
                      variant={selectedSymbol.toUpperCase() === s ? 'filled' : 'outlined'}
                      sx={{ height: 20, fontSize: '0.625rem', fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700, cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Trade Direction (Live Flip)
                </Typography>
                <ButtonGroup fullWidth size="small">
                  <Button
                    variant={direction === 'LONG' ? 'contained' : 'outlined'}
                    color="success"
                    startIcon={<TrendingUpIcon />}
                    onClick={() => handleDirectionChange('LONG')}
                    sx={{ fontWeight: 800, letterSpacing: '0.04em' }}
                  >
                    LONG
                  </Button>
                  <Button
                    variant={direction === 'SHORT' ? 'contained' : 'outlined'}
                    color="error"
                    startIcon={<TrendingDownIcon />}
                    onClick={() => handleDirectionChange('SHORT')}
                    sx={{ fontWeight: 800, letterSpacing: '0.04em' }}
                  >
                    SHORT
                  </Button>
                </ButtonGroup>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75, fontSize: '0.6875rem' }}>
                  {direction === 'LONG' ? '🟢 Stop Loss must be below Entry' : '🔴 Stop Loss must be above Entry'}
                </Typography>
              </Grid>
            </Grid>

            {/* Entry, Stop Loss, Target & Live R:R Sync */}
            <Grid container spacing={2}>
              {/* Entry Price */}
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Entry Price
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={entryPriceStr}
                  onChange={(e) => setEntryPriceStr(sanitizeNumericInput(e.target.value))}
                  placeholder="e.g. 121105"
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 } } }}
                />
              </Grid>

              {/* Stop Loss Price */}
              <Grid size={{ xs: 12, sm: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.loss.main }}>
                    Stop Loss Price
                  </Typography>
                  {isGeometryValid && (
                    <Typography variant="caption" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, fontWeight: 700 }}>
                      {stopDistance.toFixed(2)} pts ({stopDistancePercent.toFixed(2)}%)
                    </Typography>
                  )}
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  value={stopLossPriceStr}
                  onChange={(e) => setStopLossPriceStr(sanitizeNumericInput(e.target.value))}
                  placeholder="e.g. 120845"
                  error={!isDirectionValid && stopLossPrice > 0}
                  slotProps={{
                    input: {
                      sx: {
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontWeight: 700,
                        color: muiTheme.palette.loss.main,
                      },
                    },
                  }}
                />
                {/* Stop Loss Distance Quick Presets */}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                  {[0.5, 1.0, 1.5, 2.0].map((pct) => (
                    <Chip
                      key={pct}
                      label={`${pct}%`}
                      size="small"
                      onClick={() => applyStopPercent(pct)}
                      sx={{ height: 18, fontSize: '0.5625rem', fontFamily: `'JetBrains Mono', monospace`, cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Grid>

              {/* Target Price & Live R:R Selector */}
              <Grid size={{ xs: 12, sm: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.profit.main }}>
                    Target Price
                  </Typography>
                  {targetPrice > 0 && structuralRR !== undefined && (
                    <Typography variant="caption" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, fontWeight: 700 }}>
                      1 : {structuralRR.toFixed(2)} R:R
                    </Typography>
                  )}
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  value={targetPriceStr}
                  onChange={(e) => setTargetPriceStr(sanitizeNumericInput(e.target.value))}
                  placeholder="e.g. 121605"
                  slotProps={{
                    input: {
                      sx: {
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontWeight: 700,
                        color: muiTheme.palette.profit.main,
                      },
                    },
                  }}
                />
                {/* Quick R:R buttons */}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                  {[1.5, 2.0, 2.5, 3.0, 4.0].map((rr) => (
                    <Chip
                      key={rr}
                      label={`1:${rr}`}
                      size="small"
                      onClick={() => applyRRRatio(rr)}
                      color={structuralRR === rr ? 'success' : 'default'}
                      variant={structuralRR === rr ? 'filled' : 'outlined'}
                      sx={{ height: 18, fontSize: '0.5625rem', fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700, cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>

            {/* Instrument Contract Specs */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary }}>
                    Lot Size
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Typography
                      variant="caption"
                      onClick={() => setLotSizeStr('1')}
                      sx={{ cursor: 'pointer', color: 'primary.main', fontSize: '0.625rem', textDecoration: 'underline' }}
                    >
                      1 (Cash)
                    </Typography>
                  </Box>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  value={lotSizeStr}
                  onChange={(e) => setLotSizeStr(sanitizeNumericInput(e.target.value))}
                  placeholder="e.g. 6 or 25"
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                />
              </Grid>

              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Contract Multiplier
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={contractMultiplierStr}
                  onChange={(e) => setContractMultiplierStr(sanitizeNumericInput(e.target.value))}
                  placeholder="1"
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                />
              </Grid>

              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Est. Costs (₹/$)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={estimatedCostsStr}
                  onChange={(e) => setEstimatedCostsStr(sanitizeNumericInput(e.target.value))}
                  placeholder="e.g. 50"
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                />
              </Grid>
            </Grid>
          </Card>
        </Grid>

        {/* Calculation Output Column (5 Cols) */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card
            sx={{
              p: 3,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              backgroundColor: isDark ? 'rgba(17, 24, 39, 0.75)' : 'rgba(255, 255, 255, 0.98)',
              border: `1px solid ${
                !isGeometryValid
                  ? (isDark ? 'rgba(244, 63, 94, 0.4)' : 'rgba(220, 38, 38, 0.35)')
                  : isBudgetDeficit && sizingMode === 'FLOOR'
                  ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.35)')
                  : (isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(5, 150, 105, 0.35)')
              }`,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Verdict Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  Risk & Sizing Verdict
                </Typography>
                <Chip
                  label={
                    !isGeometryValid
                      ? 'INVALID PRICE LEVELS'
                      : isBudgetDeficit && sizingMode === 'FLOOR'
                      ? `BUDGET BELOW 1 LOT (GAP: ${formatCurrency(budgetGap)})`
                      : sizingMode === 'NEAREST' && effectiveRiskMonetary > plannedBudget
                      ? 'NEAREST LOT SIZED (OVERRUN)'
                      : 'OPTIMAL RISK PROFILE'
                  }
                  size="small"
                  color={
                    !isGeometryValid
                      ? 'error'
                      : isBudgetDeficit && sizingMode === 'FLOOR'
                      ? 'warning'
                      : sizingMode === 'NEAREST' && effectiveRiskMonetary > plannedBudget
                      ? 'info'
                      : 'success'
                  }
                  sx={{ fontWeight: 800, fontSize: '0.6875rem' }}
                />
              </Box>

              {/* Primary Recommended Quantity Card */}
              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  textAlign: 'center',
                  backgroundColor: !isGeometryValid
                    ? (isDark ? 'rgba(244, 63, 94, 0.08)' : 'rgba(220, 38, 38, 0.05)')
                    : isBudgetDeficit && sizingMode === 'FLOOR'
                    ? (isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(217, 119, 6, 0.05)')
                    : (isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(5, 150, 105, 0.08)'),
                  border: `1px solid ${
                    !isGeometryValid
                      ? (isDark ? 'rgba(244, 63, 94, 0.25)' : 'rgba(220, 38, 38, 0.2)')
                      : isBudgetDeficit && sizingMode === 'FLOOR'
                      ? (isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(217, 119, 6, 0.2)')
                      : (isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(5, 150, 105, 0.2)')
                  }`,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recommended Position Size
                </Typography>
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 900,
                    fontFamily: `'JetBrains Mono', monospace`,
                    color: !isGeometryValid
                      ? muiTheme.palette.loss.main
                      : isBudgetDeficit && sizingMode === 'FLOOR'
                      ? muiTheme.palette.warning.main
                      : muiTheme.palette.primary.main,
                    my: 0.5,
                  }}
                >
                  {isGeometryValid ? `${effectiveQuantity} Units` : '—'}
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontFamily: `'JetBrains Mono', monospace` }}>
                  {isGeometryValid
                    ? `= ${effectiveLots} lot${effectiveLots !== 1 ? 's' : ''} (Lot Size: ${lotSize}) • Raw: ${rawQuantity.toFixed(2)} units`
                    : 'Check price geometry'}
                </Typography>

                {/* Sizing Mode Selection Pills */}
                {isGeometryValid && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={`Strict Floor (${floorLotQuantity}u)`}
                      size="small"
                      onClick={() => setSizingMode('FLOOR')}
                      color={sizingMode === 'FLOOR' ? 'primary' : 'default'}
                      variant={sizingMode === 'FLOOR' ? 'filled' : 'outlined'}
                      sx={{ height: 22, fontSize: '0.625rem', fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      label={`Nearest Lot (${nearestLotQuantity}u)`}
                      size="small"
                      onClick={() => setSizingMode('NEAREST')}
                      color={sizingMode === 'NEAREST' ? 'info' : 'default'}
                      variant={sizingMode === 'NEAREST' ? 'filled' : 'outlined'}
                      sx={{ height: 22, fontSize: '0.625rem', fontWeight: 700, cursor: 'pointer' }}
                    />
                    {lotSize > 1 && (
                      <Chip
                        label={`Cash Shares (${cashShareQuantity}u)`}
                        size="small"
                        onClick={() => setSizingMode('CASH_1')}
                        color={sizingMode === 'CASH_1' ? 'success' : 'default'}
                        variant={sizingMode === 'CASH_1' ? 'filled' : 'outlined'}
                        sx={{ height: 22, fontSize: '0.625rem', fontWeight: 700, cursor: 'pointer' }}
                      />
                    )}
                  </Box>
                )}
              </Box>

              {/* Detailed Metrics Breakdown */}
              <Grid container spacing={1.5}>
                {/* Risk per share */}
                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Risk per Point / Share</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                      {stopDistance > 0 ? `${stopDistance.toFixed(2)} pts` : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontSize: '0.6875rem' }}>
                      {stopDistancePercent > 0 ? `${stopDistancePercent.toFixed(2)}% distance` : ''}
                    </Typography>
                  </Box>
                </Grid>

                {/* Estimated Total Risk */}
                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Estimated Total Risk</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                      {isGeometryValid ? formatCurrency(effectiveRiskMonetary) : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.loss.main, fontSize: '0.6875rem' }}>
                      {isGeometryValid ? `${effectiveRiskPercent.toFixed(2)}% of equity` : ''}
                    </Typography>
                  </Box>
                </Grid>

                {/* Reward to Risk Ratio (Always Live) */}
                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Reward-to-Risk (R:R)</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                      {structuralRR !== undefined ? `1 : ${structuralRR.toFixed(2)}` : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontSize: '0.6875rem' }}>
                      {targetDistance > 0 ? `+${targetDistance.toFixed(2)} pts target` : 'Set target price'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Potential Reward */}
                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Potential Reward</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                      {isGeometryValid && effectiveQuantity > 0 ? formatCurrency(effectiveNetReward) : (targetDistance > 0 && effectiveQuantity === 0 ? `(1 lot: ${formatCurrency(targetDistance * contractMultiplier * lotSize)})` : '₹0.00')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.profit.main, fontSize: '0.6875rem' }}>
                      {accountEquity > 0 && effectiveNetReward > 0 ? `+${((effectiveNetReward / accountEquity) * 100).toFixed(2)}% gain` : ''}
                    </Typography>
                  </Box>
                </Grid>

                {/* Capital Required / Notional Value */}
                <Grid size={{ xs: 12 }}>
                  <Box sx={{ p: 1.25, px: 1.75, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Total Trade Capital (Notional)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                        {isGeometryValid && effectiveQuantity > 0 ? formatCurrency(effectiveNotionalCapital) : '₹0.00'}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Capital Utilization</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: effectiveCapitalPercent > 100 ? 'warning.main' : 'text.primary' }}>
                        {isGeometryValid && effectiveQuantity > 0 ? `${effectiveCapitalPercent.toFixed(1)}% of Account` : '0%'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>

              {/* Dynamic Smart Advisory & 1-Click Fixes */}
              {!isGeometryValid ? (
                <Alert severity="error" sx={{ fontSize: '0.75rem' }}>
                  {!isDirectionValid
                    ? (direction === 'LONG'
                        ? 'For LONG trades, Stop Loss must be strictly below Entry Price.'
                        : 'For SHORT trades, Stop Loss must be strictly above Entry Price.')
                    : 'Stop Loss cannot be equal to Entry Price (zero risk distance).'}
                </Alert>
              ) : isBudgetDeficit && sizingMode === 'FLOOR' ? (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(217, 119, 6, 0.05)',
                    border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(217, 119, 6, 0.2)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.25,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main' }}>
                      Risk Budget Deficit for Minimum Lot Size
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem', lineHeight: 1.5 }}>
                    Your risk budget of <strong>{formatCurrency(plannedBudget)}</strong> covers <strong>{rawQuantity.toFixed(2)} units</strong>. 1 minimum lot of {lotSize} units requires <strong>{formatCurrency(oneLotRiskAmount)}</strong> (short by <strong>{formatCurrency(budgetGap)}</strong>).
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="warning"
                      startIcon={<AutoFixHighIcon fontSize="small" />}
                      onClick={handleAdjustBudgetTo1Lot}
                      sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none', py: 0.5 }}
                    >
                      Adjust Risk Budget to {formatCurrency(Math.ceil(oneLotRiskAmount))} (1 Lot)
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        onClick={handleTightenStopFor1Lot}
                        sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'none', py: 0.25, flex: 1 }}
                      >
                        Tighten Stop to Fit Budget
                      </Button>
                      {lotSize > 1 && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          onClick={handleSwitchToCashShares}
                          sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'none', py: 0.25, flex: 1 }}
                        >
                          Cash Shares ({cashShareQuantity} units)
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Alert severity="success" sx={{ fontSize: '0.75rem' }}>
                  Position size of <strong>{effectiveQuantity} units</strong> strictly respects your planned risk ceiling of {formatCurrency(plannedBudget)}.
                </Alert>
              )}
            </Box>

            {/* Transfer to Trade CTA */}
            <Button
              fullWidth
              variant="contained"
              color="primary"
              disabled={!isGeometryValid || effectiveQuantity <= 0}
              onClick={handleTransferToTrade}
              endIcon={<ArrowForwardIcon />}
              sx={{ py: 1.25, fontWeight: 800, fontSize: '0.875rem', mt: 3 }}
            >
              Transfer to Log Trade Entry
            </Button>
          </Card>
        </Grid>
      </Grid>

      {/* Prefilled Trade Modal */}
      <TradeFormModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        initialValues={prefilledTradeData}
      />
    </Box>
  );
}
