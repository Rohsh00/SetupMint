import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/TuneRounded';
import AttachMoneyIcon from '@mui/icons-material/AttachMoneyRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import PsychologyIcon from '@mui/icons-material/PsychologyRounded';
import { useTheme as useMuiTheme } from '@mui/material/styles';

import {
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
} from '@tradevault/financial-engine';
import { api } from '../../lib/api.js';
import { TradeCalculationBanner } from './form/TradeCalculationBanner.js';
import { TradeIdentityTab } from './form/TradeIdentityTab.js';
import { TradeExecutionTab } from './form/TradeExecutionTab.js';
import { TradeRiskTab } from './form/TradeRiskTab.js';
import { TradeThesisTab } from './form/TradeThesisTab.js';
import { TradePsychologyTab } from './form/TradePsychologyTab.js';

interface TradeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
  editTradeId?: string;
  initialValues?: any;
}

export function TradeFormModal({
  isOpen,
  onClose,
  defaultAccountId,
  editTradeId,
  initialValues,
}: TradeFormModalProps) {
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'EXECUTION' | 'RISK' | 'THESIS' | 'PSYCHOLOGY'>('IDENTITY');
  const [executionMode, setExecutionMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');

  // Fetch accounts, instruments, strategies
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });
  const { data: instruments = [] } = useQuery({ queryKey: ['instruments'], queryFn: () => api.instruments.list() });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: () => api.strategies.list() });

  const defaultAccount = defaultAccountId || accounts[0]?.id || '';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<any>({
    defaultValues: {
      accountId: defaultAccount,
      symbol: 'NIFTY',
      assetClass: 'FUTURES',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      status: 'CLOSED',
      strategyId: '',
      tradeDate: new Date().toISOString().split('T')[0],
      entryTime: new Date().toISOString().slice(0, 16),
      exitTime: new Date().toISOString().slice(0, 16),
      session: 'NSE_REGULAR',
      tradeTitle: '',
      tagsInput: '',

      simpleExecution: {
        entryPrice: 24000,
        exitPrice: 24100,
        quantity: 25,
        contractMultiplier: 1,
        brokerage: 40,
        exchangeFees: 30,
        regulatoryFees: 5,
        taxes: 80,
        otherFees: 0,
        explicitAdjustments: 0,
      },

      fills: [],

      risk: {
        plannedEntryPrice: 24000,
        initialStopLoss: 23940,
        plannedTarget: 24150,
        riskBudgetAmount: 2500,
      },

      thesis: {
        preMarketBias: 'BULLISH',
        marketStructure: 'TRENDING_UP',
        entryRationale: '',
        confluences: ['BOS', 'FVG'],
      },

      psychology: {
        emotionBefore: 'CALM',
        emotionDuring: 'CONFIDENT',
        emotionAfter: 'DISCIPLINED',
        disciplineScore: 5,
        rulesFollowed: true,
        checklistCompleted: true,
        revengeTrading: false,
        overtrading: false,
        prematureExit: false,
        stopLossMoved: false,
        positionSizeViolation: false,
        mistakes: [],
        notes: '',
      },
    },
  });

  const fillsFieldArray = useFieldArray({
    control,
    name: 'fills',
  });

  // Watch fields for live calculation preview
  const watchedDirection = watch('direction');
  const watchedStatus = watch('status');
  const watchedSimple = watch('simpleExecution');
  const watchedRisk = watch('risk');

  // Load initial values or edit values when opening modal
  useEffect(() => {
    if (initialValues) {
      reset({
        ...initialValues,
        tagsInput: initialValues.tags?.join(', ') || '',
      });
      if (initialValues.executionMode) {
        setExecutionMode(initialValues.executionMode);
      }
    }
  }, [initialValues, reset]);

  // Live P&L and Risk computation
  let liveGross = 0;
  let liveCosts = 0;
  let liveNet = 0;
  let liveOutcome: any = 'BREAKEVEN';

  if (executionMode === 'SIMPLE' && watchedSimple) {
    try {
      const calc = calculateSimpleExecutionPnL(watchedDirection, {
        entryPrice: watchedSimple.entryPrice || 0,
        exitPrice: watchedSimple.exitPrice || undefined,
        quantity: watchedSimple.quantity || 1,
        contractMultiplier: watchedSimple.contractMultiplier || 1,
        brokerage: watchedSimple.brokerage || 0,
        exchangeFees: watchedSimple.exchangeFees || 0,
        regulatoryFees: watchedSimple.regulatoryFees || 0,
        taxes: watchedSimple.taxes || 0,
        otherFees: watchedSimple.otherFees || 0,
        explicitAdjustments: watchedSimple.explicitAdjustments || 0,
      });
      liveGross = calc.grossPnLNumber;
      liveCosts = calc.totalCostsNumber;
      liveNet = calc.netPnLNumber;
      liveOutcome = watchedStatus === 'OPEN' ? 'OPEN' : calc.outcome;
    } catch {
      // Incomplete fields
    }
  }

  // Calculate live R
  let plannedRiskAmount = watchedRisk?.riskBudgetAmount || 0;
  if (!plannedRiskAmount && watchedRisk?.plannedEntryPrice && watchedRisk?.initialStopLoss) {
    const dist = Math.abs(watchedRisk.plannedEntryPrice - watchedRisk.initialStopLoss);
    const qty = watchedSimple?.quantity || 1;
    const mult = watchedSimple?.contractMultiplier || 1;
    plannedRiskAmount = dist * qty * mult;
  }
  const liveRealizedR = calculateRealizedRMultiple(liveNet, plannedRiskAmount);

  // Direction validity
  let isDirectionValid = true;
  if (watchedRisk?.plannedEntryPrice && watchedRisk?.initialStopLoss) {
    if (watchedDirection === 'LONG' && watchedRisk.initialStopLoss >= watchedRisk.plannedEntryPrice) {
      isDirectionValid = false;
    } else if (watchedDirection === 'SHORT' && watchedRisk.initialStopLoss <= watchedRisk.plannedEntryPrice) {
      isDirectionValid = false;
    }
  }

  // Submit mutations
  const createMutation = useMutation({
    mutationFn: (tradeData: any) => api.trades.create(tradeData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (tradeData: any) => api.trades.update(editTradeId!, tradeData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
  });

  const onSubmit = async (data: any) => {
    const tags = data.tagsInput
      ? data.tagsInput
          .split(',')
          .map((t: string) => t.trim().toUpperCase())
          .filter(Boolean)
      : [];

    const payload = {
      ...data,
      tags,
      executionMode,
    };
    delete payload.tagsInput;

    if (editTradeId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Discard and close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      aria-labelledby="trade-dialog-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            maxHeight: '90vh',
          },
        },
        backdrop: {
          sx: { backdropFilter: 'blur(4px)' },
        },
      }}
    >
      {/* Dialog Title */}
      <DialogTitle
        id="trade-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(248, 250, 252, 0.8)',
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', color: muiTheme.palette.text.primary }}>
            {editTradeId ? 'Edit Trade Entry' : 'Log New Manual Trade'}
          </Typography>
          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
            Deterministic monetary calculations, risk controls, and execution audit log
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ color: muiTheme.palette.text.secondary }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Live Calculation Banner */}
      <Box sx={{ px: 3, pt: 2 }}>
        <TradeCalculationBanner
          grossPnL={liveGross}
          totalCosts={liveCosts}
          netPnL={liveNet}
          outcome={liveOutcome}
          realizedR={liveRealizedR}
          plannedRisk={plannedRiskAmount}
          status={watchedStatus}
          isDirectionValid={isDirectionValid}
        />
      </Box>

      {/* Tab Selector */}
      <Box sx={{ px: 3, pt: 1, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
        <Tabs
          value={activeTab}
          onChange={(_e, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab
            value="IDENTITY"
            label="Trade Identity"
            icon={<TuneIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            value="EXECUTION"
            label="Execution & Fills"
            icon={<AttachMoneyIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            value="RISK"
            label="Risk Parameters"
            icon={<SecurityIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            value="THESIS"
            label="Thesis & Context"
            icon={<AutoAwesomeIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            value="PSYCHOLOGY"
            label="Psychology & Rules"
            icon={<PsychologyIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Form Body */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ p: 3 }}>
          {activeTab === 'IDENTITY' && (
            <TradeIdentityTab
              register={register}
              watch={watch}
              setValue={setValue}
              accounts={accounts}
              instruments={instruments}
              strategies={strategies}
            />
          )}

          {activeTab === 'EXECUTION' && (
            <TradeExecutionTab
              register={register}
              watch={watch}
              executionMode={executionMode}
              setExecutionMode={setExecutionMode}
              fillsFieldArray={fillsFieldArray}
            />
          )}

          {activeTab === 'RISK' && (
            <TradeRiskTab register={register} watch={watch} />
          )}

          {activeTab === 'THESIS' && (
            <TradeThesisTab register={register} watch={watch} setValue={setValue} />
          )}

          {activeTab === 'PSYCHOLOGY' && (
            <TradePsychologyTab register={register} watch={watch} setValue={setValue} />
          )}
        </DialogContent>

        {/* Footer Actions */}
        <DialogActions
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            borderTop: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.4)' : 'rgba(248, 250, 252, 0.5)',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: `'JetBrains Mono', monospace`,
              fontSize: '0.6875rem',
              color: muiTheme.palette.text.secondary,
              display: { xs: 'none', sm: 'inline' },
            }}
          >
            All financial values calculated with 30-digit decimal arithmetic.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={handleClose}
              sx={{ fontWeight: 600, fontSize: '0.8125rem' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
              sx={{ fontWeight: 700, fontSize: '0.8125rem', px: 3 }}
            >
              {isSubmitting || createMutation.isPending || updateMutation.isPending ? (
                <CircularProgress size={18} color="inherit" />
              ) : editTradeId ? (
                'Update Trade'
              ) : (
                'Save Trade Entry'
              )}
            </Button>
          </Box>
        </DialogActions>
      </form>
    </Dialog>
  );
}
