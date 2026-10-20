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
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import CalculateIcon from '@mui/icons-material/CalculateRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';

import { calculateRiskAndPositionSize, calculateFractionalKelly } from '@tradevault/financial-engine';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { formatCurrency, formatPercent, currentLocalIsoDateTime } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';

export function RiskCalculatorPage() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });
  const { data: instruments = [] } = useQuery({ queryKey: ['instruments'], queryFn: () => api.instruments.list() });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: () => api.strategies.list() });

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [accountEquity, setAccountEquity] = useState<number>(200000);
  const [riskMode, setRiskMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [fixedRiskAmount, setFixedRiskAmount] = useState<number>(2000);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('NIFTY');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntryPrice] = useState<number>(24000);
  const [stopLossPrice, setStopLossPrice] = useState<number>(23940);
  const [targetPrice, setTargetPrice] = useState<number>(24150);
  const [contractMultiplier, setContractMultiplier] = useState<number>(1);
  const [lotSize, setLotSize] = useState<number>(25);
  const [quantityIncrement, setQuantityIncrement] = useState<number>(25);
  const [estimatedCosts, setEstimatedCosts] = useState<number>(50);

  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [prefilledTradeData, setPrefilledTradeData] = useState<any>(null);

  // Auto-set account equity when account is chosen
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
      setAccountEquity(accounts[0].currentBalance || accounts[0].initialBalance || 200000);
    }
  }, [accounts, selectedAccountId]);

  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = accounts.find((a: any) => a.id === accId);
    if (acc) {
      setAccountEquity(acc.currentBalance || acc.initialBalance || 200000);
    }
  };

  const handleSymbolChange = (sym: string) => {
    setSelectedSymbol(sym);
    const inst = instruments.find((i: any) => i.symbol.toUpperCase() === sym.toUpperCase());
    if (inst) {
      setContractMultiplier(inst.contractMultiplier || 1);
      setLotSize(inst.lotSize || 1);
      setQuantityIncrement(inst.quantityIncrement || inst.lotSize || 1);
    }
  };

  // Perform deterministic risk calculation via financial engine
  const calcResult = calculateRiskAndPositionSize({
    accountEquity,
    riskPercent: riskMode === 'PERCENT' ? riskPercent : undefined,
    fixedRiskAmount: riskMode === 'FIXED' ? fixedRiskAmount : undefined,
    entryPrice,
    stopLossPrice,
    targetPrice: targetPrice > 0 ? targetPrice : undefined,
    direction,
    contractMultiplier,
    lotSize,
    quantityIncrement,
    estimatedCosts,
  });

  const isValid = calcResult.isDirectionValid && !calcResult.isStopDistanceZero && calcResult.warnings.length === 0;
  const lotsCount = lotSize > 0 ? Math.round(calcResult.roundedLotQuantity / lotSize) : calcResult.roundedLotQuantity;
  const riskPerShare = calcResult.stopLossDistance;
  const rewardToRiskRatio = calcResult.rewardRiskRatio;
  const potentialMonetaryGain = calcResult.estimatedReward || 0;
  const validationErrors = calcResult.warnings;

  const selectedStrategy = strategies.find((s: any) => (s.id || s._id) === selectedStrategyId);
  const kellyResult = useMemo(() => {
    if (!selectedStrategy) return null;
    const edge = selectedStrategy.edge;
    const winRate = edge?.bayesianWinRate?.posteriorMeanWinRate ?? selectedStrategy.winRate ?? 50;
    const winProb = winRate / 100;
    const avgWin = edge?.bayesianWinRate?.averageWinPnL ?? (rewardToRiskRatio ? rewardToRiskRatio * 1000 : 1500);
    const avgLoss = edge?.bayesianWinRate?.averageLossPnL ?? 1000;

    return calculateFractionalKelly({
      winProbability: winProb,
      averageWinMagnitude: avgWin,
      averageLossMagnitude: avgLoss,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: edge?.verdict || 'UNPROVEN',
    });
  }, [selectedStrategy, rewardToRiskRatio]);

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
        quantity: calcResult.roundedLotQuantity,
        contractMultiplier,
        brokerage: estimatedCosts,
      },
      risk: {
        plannedEntryPrice: entryPrice,
        initialStopLoss: stopLossPrice,
        plannedTarget: targetPrice,
        riskBudgetAmount: calcResult.plannedRiskAmount,
        suggestedQuantity: calcResult.roundedLotQuantity,
        estimatedRiskAmount: calcResult.estimatedMonetaryLoss,
      },
    });
    toast.info('Parameters copied to trade form.');
    setIsTradeModalOpen(true);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Header */}
      <Box sx={{ pb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary }}>
          Position Size & Risk Calculator
        </Typography>
        <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
          Calculate mathematically exact lot-rounded quantities and reward-to-risk ratios before entering the market
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Input Parameters Column (7 Cols) */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalculateIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
              Account & Trade Parameters
            </Typography>
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
                  Account Equity (INR / USD)
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={accountEquity}
                  onChange={(e) => setAccountEquity(Number(e.target.value))}
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

            {/* Risk Mode Toggle */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 1 }}>
                Risk Budget Allocation
              </Typography>
              <ButtonGroup fullWidth size="small" variant="outlined">
                <Button
                  variant={riskMode === 'PERCENT' ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => setRiskMode('PERCENT')}
                  sx={{ fontWeight: 600 }}
                >
                  Percentage of Equity (% Risk)
                </Button>
                <Button
                  variant={riskMode === 'FIXED' ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => setRiskMode('FIXED')}
                  sx={{ fontWeight: 600 }}
                >
                  Fixed Amount (₹ / $)
                </Button>
              </ButtonGroup>

              <Box sx={{ mt: 1.5 }}>
                {riskMode === 'PERCENT' ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <TextField
                      type="number"
                      size="small"
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(Number(e.target.value))}
                      sx={{ width: 120 }}
                      slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                    />
                    <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
                      % of equity ={' '}
                      <Box component="strong" sx={{ color: muiTheme.palette.text.primary, fontFamily: `'JetBrains Mono', monospace` }}>
                        {formatCurrency((accountEquity * riskPercent) / 100)}
                      </Box>{' '}
                      budget
                    </Typography>
                  </Box>
                ) : (
                  <TextField
                    fullWidth
                    type="number"
                    size="small"
                    value={fixedRiskAmount}
                    onChange={(e) => setFixedRiskAmount(Number(e.target.value))}
                    slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                  />
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
                        setRiskPercent(kellyResult.recommendedRiskPercent);
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

            {/* Symbol & Direction */}
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
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700, textTransform: 'uppercase' } } }}
                />
                <Box sx={{ display: 'flex', gap: 0.75, mt: 1, overflowX: 'auto' }}>
                  {['NIFTY', 'BANKNIFTY', 'RELIANCE', 'CRUDEOIL', 'GOLD'].map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      size="small"
                      onClick={() => handleSymbolChange(s)}
                      sx={{ height: 20, fontSize: '0.625rem', fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}
                    />
                  ))}
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Trade Direction
                </Typography>
                <ButtonGroup fullWidth size="small">
                  <Button
                    variant={direction === 'LONG' ? 'contained' : 'outlined'}
                    color="primary"
                    startIcon={<TrendingUpIcon />}
                    onClick={() => setDirection('LONG')}
                    sx={{ fontWeight: 700 }}
                  >
                    LONG
                  </Button>
                  <Button
                    variant={direction === 'SHORT' ? 'contained' : 'outlined'}
                    color="error"
                    startIcon={<TrendingDownIcon />}
                    onClick={() => setDirection('SHORT')}
                    sx={{ fontWeight: 700 }}
                  >
                    SHORT
                  </Button>
                </ButtonGroup>
              </Grid>
            </Grid>

            {/* Entry, Stop Loss, Target */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Entry Price
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(Number(e.target.value))}
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 } } }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Stop Loss Price
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={stopLossPrice}
                  onChange={(e) => setStopLossPrice(Number(e.target.value))}
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600, color: muiTheme.palette.loss.main } } }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Target Price
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(Number(e.target.value))}
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600, color: muiTheme.palette.profit.main } } }}
                />
              </Grid>
            </Grid>

            {/* Instrument Contract Specs */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Lot Size
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={lotSize}
                  onChange={(e) => setLotSize(Number(e.target.value))}
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace` } } }}
                />
              </Grid>

              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Contract Multiplier
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={contractMultiplier}
                  onChange={(e) => setContractMultiplier(Number(e.target.value))}
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace` } } }}
                />
              </Grid>

              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Est. Costs (₹/$)
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={estimatedCosts}
                  onChange={(e) => setEstimatedCosts(Number(e.target.value))}
                  slotProps={{ input: { sx: { fontFamily: `'JetBrains Mono', monospace` } } }}
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
              backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.95)',
              border: `1px solid ${
                isValid
                  ? isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'
                  : isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(220, 38, 38, 0.25)'
              }`,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Risk & Sizing Verdict
                </Typography>
                <Chip
                  label={isValid ? 'VALID RISK PROFILE' : 'INVALID PARAMETERS'}
                  size="small"
                  color={isValid ? 'success' : 'error'}
                  sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                />
              </Box>

              {/* Primary Recommended Quantity Card */}
              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  textAlign: 'center',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(5, 150, 105, 0.08)',
                  border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(5, 150, 105, 0.2)'}`,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recommended Position Size
                </Typography>
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 900,
                    fontFamily: `'JetBrains Mono', monospace`,
                    color: muiTheme.palette.primary.main,
                    my: 0.5,
                  }}
                >
                  {calcResult.roundedLotQuantity} Units
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontFamily: `'JetBrains Mono', monospace` }}>
                  = {lotsCount} lot{lotsCount !== 1 ? 's' : ''} (Lot Size: {lotSize})
                </Typography>
              </Box>

              {/* Detailed Metrics Breakdown */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Risk per Share/Point</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                      {riskPerShare?.toFixed(2)} pts
                    </Typography>
                  </Box>
                </Grid>

                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Estimated Total Risk</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                      {formatCurrency(calcResult.estimatedMonetaryLoss)}
                    </Typography>
                  </Box>
                </Grid>

                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Reward-to-Risk (R:R)</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                      {rewardToRiskRatio ? `1 : ${rewardToRiskRatio.toFixed(2)}` : '—'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid size={{ xs: 6 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Potential Reward</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                      {formatCurrency(potentialMonetaryGain)}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Validation Warning / Success Banner */}
              {validationErrors && validationErrors.length > 0 ? (
                <Alert severity="error" sx={{ fontSize: '0.75rem' }}>
                  {validationErrors[0]}
                </Alert>
              ) : (
                <Alert severity="success" sx={{ fontSize: '0.75rem' }}>
                  Position size respects the maximum risk ceiling of {formatCurrency(calcResult.plannedRiskAmount)}.
                </Alert>
              )}
            </Box>

            {/* Transfer to Trade CTA */}
            <Button
              fullWidth
              variant="contained"
              color="primary"
              disabled={!isValid}
              onClick={handleTransferToTrade}
              endIcon={<ArrowForwardIcon />}
              sx={{ py: 1.25, fontWeight: 700, fontSize: '0.875rem', mt: 3 }}
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
