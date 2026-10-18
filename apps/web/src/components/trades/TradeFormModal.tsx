import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Alert,
  Tooltip,
  useTheme as useMuiTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  CloseRounded,
  BoltRounded,
  MenuBookRounded,
  LayersRounded,
  CheckCircleRounded,
  WarningAmberRounded,
  ExpandMoreRounded,
  PsychologyRounded,
  ReceiptLongRounded,
  SwapHorizRounded,
  CollectionsRounded,
} from '@mui/icons-material';
import { IAttachment } from '@tradevault/shared';
import {
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
  calculateFIFOExecution,
  IndianChargesCalculator,
} from '@tradevault/financial-engine';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { TradeCalculationBanner } from './form/TradeCalculationBanner.js';
import { TradeTemplateSelector } from './form/TradeTemplateSelector.js';
import { TradeQuickSection } from './form/TradeQuickSection.js';
import { TradeAdvancedFills } from './form/TradeAdvancedFills.js';
import { TradeJournalDetails } from './form/TradeJournalDetails.js';
import {
  TradeAttachmentUploader,
  StagedAttachment,
} from './attachments/TradeAttachmentUploader.js';
import {
  getRememberedTradePreferences,
  saveRememberedTradePreferences,
  TradeSetupTemplate,
} from './tradeTemplates.js';

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

  // Determine initial account and preferences safely
  const rememberedPrefs = useMemo(() => getRememberedTradePreferences(), []);

  // Workflow mode: 'QUICK' for express trade logging; 'COMPREHENSIVE' for deep journaling
  const [workflowMode, setWorkflowMode] = useState<'QUICK' | 'COMPREHENSIVE'>(
    rememberedPrefs.preferredWorkflow || 'QUICK'
  );
  const [executionMode, setExecutionMode] = useState<'SIMPLE' | 'ADVANCED'>(
    rememberedPrefs.preferredExecutionMode || 'SIMPLE'
  );
  const [isAutoFees, setIsAutoFees] = useState(true);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Staged chart screenshots (ready to be uploaded on save)
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<IAttachment[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

  // Reference data
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });
  const { data: instruments = [] } = useQuery({ queryKey: ['instruments'], queryFn: () => api.instruments.list() });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: () => api.strategies.list() });

  const initialAccountId =
    defaultAccountId ||
    rememberedPrefs.preferredAccountId ||
    accounts[0]?.id ||
    '';

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
      accountId: initialAccountId,
      symbol: rememberedPrefs.preferredSymbol || 'NIFTY',
      assetClass: 'FUTURES',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      status: 'CLOSED',
      strategyId: rememberedPrefs.preferredStrategyId || '',
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

  // Watch form fields for live calculation previews
  const watchedDirection = watch('direction') || 'LONG';
  const watchedStatus = watch('status') || 'CLOSED';
  const watchedSimple = watch('simpleExecution');
  const watchedFills = watch('fills') || [];
  const watchedRisk = watch('risk');
  const watchedSymbol = watch('symbol');
  const watchedAccountId = watch('accountId');

  // Handle edit values or initial opening
  useEffect(() => {
    if (initialValues) {
      reset({
        ...initialValues,
        tagsInput: Array.isArray(initialValues.tags)
          ? initialValues.tags.join(', ')
          : (initialValues.tagsInput || ''),
        tradeDate: initialValues.tradeDate
          ? initialValues.tradeDate.split('T')[0]
          : new Date().toISOString().split('T')[0],
        entryTime: initialValues.entryTime
          ? initialValues.entryTime.slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        exitTime: initialValues.exitTime
          ? initialValues.exitTime.slice(0, 16)
          : new Date().toISOString().slice(0, 16),
      });
      if (initialValues.executionMode) {
        setExecutionMode(initialValues.executionMode);
      }
      // If editing a trade with journal fields, open in COMPREHENSIVE mode
      if (
        initialValues.thesis?.entryRationale ||
        initialValues.psychology?.notes ||
        (initialValues.fills && initialValues.fills.length > 0) ||
        (initialValues.attachments && initialValues.attachments.length > 0)
      ) {
        setWorkflowMode('COMPREHENSIVE');
      }

      if (initialValues.attachments && Array.isArray(initialValues.attachments)) {
        setExistingAttachments(initialValues.attachments);
      }
    } else if (!editTradeId) {
      // Fresh trade: establish clean defaults with remembered preferences
      const prefs = getRememberedTradePreferences();
      if (prefs.preferredWorkflow) {
        setWorkflowMode(prefs.preferredWorkflow);
      }
      if (prefs.preferredExecutionMode) {
        setExecutionMode(prefs.preferredExecutionMode);
      }
      if (prefs.preferredAccountId && (!watch('accountId') || watch('accountId') === '')) {
        setValue('accountId', prefs.preferredAccountId);
      }
      if (prefs.preferredSymbol && (!watch('symbol') || watch('symbol') === '')) {
        setValue('symbol', prefs.preferredSymbol);
      }
      if (prefs.preferredStrategyId && (!watch('strategyId') || watch('strategyId') === '')) {
        setValue('strategyId', prefs.preferredStrategyId);
      }
      setIsAutoFees(true);
      setExistingAttachments([]);
      setStagedAttachments([]);
    } else {
      setIsAutoFees(false);
    }
    setSubmitError(null);
  }, [initialValues, editTradeId, reset, setValue]);

  const handleDeleteExistingAttachment = async (attId: string) => {
    try {
      await api.attachments.delete(attId);
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['trade', editTradeId] });
      toast.success('Chart screenshot removed.');
    } catch (err: any) {
      toast.error(`Failed to delete chart screenshot: ${err.message || 'Server error'}`);
    }
  };

  const watchedStrategyId = watch('strategyId');
  const watchedAssetClass = watch('assetClass');
  const watchedMarketSegment = watch('marketSegment');

  // Selected account for broker identification
  const selectedAccount = useMemo(() => {
    return accounts.find((a: any) => a.id === watchedAccountId);
  }, [accounts, watchedAccountId]);

  // Selected strategy for rules and confluences
  const selectedStrategy = useMemo(() => {
    if (!watchedStrategyId) return null;
    return strategies.find((s: any) => s.id === watchedStrategyId || s._id === watchedStrategyId) || null;
  }, [strategies, watchedStrategyId]);

  // Strategy-aware entry: prefill checklist/confluences when strategy is selected
  const prevStrategyIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!watchedStrategyId || watchedStrategyId === prevStrategyIdRef.current) {
      prevStrategyIdRef.current = watchedStrategyId;
      return;
    }
    prevStrategyIdRef.current = watchedStrategyId;

    if (selectedStrategy) {
      if (selectedStrategy.name) {
        setValue('strategyName', selectedStrategy.name);
      }
      const strategyConfluences = [
        ...(selectedStrategy.checklist || []),
        ...(selectedStrategy.entryRules || []),
      ];
      if (strategyConfluences.length > 0) {
        const currentConfluences: string[] = watch('thesis.confluences') || [];
        const combined = Array.from(new Set([...currentConfluences, ...strategyConfluences]));
        setValue('thesis.confluences', combined, { shouldDirty: true });
        setValue('psychology.checklistCompleted', true, { shouldDirty: true });
      }
    }
  }, [watchedStrategyId, selectedStrategy, setValue, watch]);

  // Persist preferences safely when user actively changes symbol, account, strategy, workflow, or execution mode
  useEffect(() => {
    if (!editTradeId && (watchedAccountId || watchedSymbol || watchedStrategyId)) {
      saveRememberedTradePreferences({
        preferredAccountId: watchedAccountId,
        preferredSymbol: watchedSymbol,
        preferredWorkflow: workflowMode,
        preferredStrategyId: watchedStrategyId,
        preferredExecutionMode: executionMode,
      });
    }
  }, [watchedAccountId, watchedSymbol, watchedStrategyId, workflowMode, executionMode, editTradeId]);

  // Auto statutory fee calculation
  const computeAutoCharges = () => {
    const entryP = Number(watchedSimple?.entryPrice) || 0;
    const exitP = watchedStatus === 'CLOSED'
      ? (Number(watchedSimple?.exitPrice) || entryP)
      : entryP;
    const qty = Number(watchedSimple?.quantity) || 1;
    const mult = Number(watchedSimple?.contractMultiplier) || 1;

    if (entryP > 0 && qty > 0) {
      return IndianChargesCalculator.calculate(
        watchedAssetClass || 'EQUITY',
        watchedMarketSegment || 'NSE_EQ',
        entryP,
        exitP,
        qty,
        mult,
        20,
        selectedAccount?.broker
      );
    }
    return null;
  };

  const handleResetAutoFees = () => {
    setIsAutoFees(true);
    const charges = computeAutoCharges();
    if (charges) {
      setValue('simpleExecution.brokerage', charges.brokerage);
      setValue('simpleExecution.exchangeFees', charges.exchangeFees);
      setValue('simpleExecution.regulatoryFees', charges.regulatoryFees);
      setValue('simpleExecution.taxes', charges.taxes);
    }
  };

  // Automatically recalculate fees when isAutoFees is active
  useEffect(() => {
    if (executionMode === 'SIMPLE' && isAutoFees && !editTradeId) {
      const charges = computeAutoCharges();
      if (charges) {
        setValue('simpleExecution.brokerage', charges.brokerage);
        setValue('simpleExecution.exchangeFees', charges.exchangeFees);
        setValue('simpleExecution.regulatoryFees', charges.regulatoryFees);
        setValue('simpleExecution.taxes', charges.taxes);
      }
    }
  }, [
    executionMode,
    isAutoFees,
    editTradeId,
    watchedAccountId,
    selectedAccount?.broker,
    watchedAssetClass,
    watchedMarketSegment,
    watchedSimple?.entryPrice,
    watchedSimple?.exitPrice,
    watchedSimple?.quantity,
    watchedSimple?.contractMultiplier,
    watchedStatus,
  ]);

  // Live P&L, Execution & Risk Computation using financial-engine
  let liveGross = 0;
  let liveCosts = 0;
  let liveNet = 0;
  let liveOutcome: any = 'BREAKEVEN';
  let positionExposure = 0;
  const multiplier = Number(watchedSimple?.contractMultiplier || 1);

  if (executionMode === 'SIMPLE' && watchedSimple) {
    try {
      const entryP = Number(watchedSimple.entryPrice) || 0;
      const exitP = watchedStatus === 'OPEN' ? undefined : (Number(watchedSimple.exitPrice) || undefined);
      const qty = Number(watchedSimple.quantity) || 1;

      positionExposure = entryP * qty * multiplier;

      const calc = calculateSimpleExecutionPnL(watchedDirection, {
        entryPrice: entryP,
        exitPrice: exitP,
        quantity: qty,
        contractMultiplier: multiplier,
        brokerage: Number(watchedSimple.brokerage) || 0,
        exchangeFees: Number(watchedSimple.exchangeFees) || 0,
        regulatoryFees: Number(watchedSimple.regulatoryFees) || 0,
        taxes: Number(watchedSimple.taxes) || 0,
        otherFees: Number(watchedSimple.otherFees) || 0,
        explicitAdjustments: Number(watchedSimple.explicitAdjustments) || 0,
      });

      liveGross = calc.grossPnLNumber;
      liveCosts = calc.totalCostsNumber;
      liveNet = calc.netPnLNumber;
      liveOutcome = watchedStatus === 'OPEN' ? 'OPEN' : calc.outcome;
    } catch {
      // Incomplete values during typing
    }
  } else if (executionMode === 'ADVANCED' && watchedFills.length > 0) {
    try {
      const fifo = calculateFIFOExecution(watchedDirection, watchedFills, multiplier);
      liveGross = Number(fifo.realizedGrossPnL.toFixed(2));
      liveCosts = Number(fifo.totalCosts.toFixed(2));
      liveNet = Number(fifo.realizedNetPnL.toFixed(2));
      liveOutcome = watchedStatus === 'OPEN' ? 'OPEN' : fifo.outcome;
      positionExposure = Number(fifo.weightedAvgEntryPrice.toFixed(2)) * fifo.closedQuantity.plus(fifo.openQuantity).toNumber() * multiplier;
    } catch {
      // Incomplete fills
    }
  }

  // Calculate live planned risk
  let plannedRiskAmount = Number(watchedRisk?.riskBudgetAmount) || 0;
  const pEntry = Number(watchedRisk?.plannedEntryPrice || watchedSimple?.entryPrice) || 0;
  const pStop = Number(watchedRisk?.initialStopLoss) || 0;
  const pTarget = Number(watchedRisk?.plannedTarget) || 0;

  if (!plannedRiskAmount && pEntry > 0 && pStop > 0) {
    const dist = Math.abs(pEntry - pStop);
    const qty = Number(watchedSimple?.quantity) || 1;
    plannedRiskAmount = dist * qty * multiplier;
  }

  const liveRealizedR = calculateRealizedRMultiple(liveNet, plannedRiskAmount);

  // Direction validity audit (prevents buying high with a stop above entry or selling low with stop below entry)
  let isDirectionValid = true;
  if (pEntry > 0 && pStop > 0) {
    if (watchedDirection === 'LONG' && pStop >= pEntry) {
      isDirectionValid = false;
    } else if (watchedDirection === 'SHORT' && pStop <= pEntry) {
      isDirectionValid = false;
    }
  }

  // Potential Reward-to-Risk ratio preview
  let plannedRewardRiskRatio: number | undefined;
  if (pEntry > 0 && pStop > 0 && pTarget > 0) {
    const riskDist = Math.abs(pEntry - pStop);
    const rewardDist = Math.abs(pTarget - pEntry);
    if (riskDist > 0) {
      plannedRewardRiskRatio = Number((rewardDist / riskDist).toFixed(2));
    }
  }

  // Strategy rule: warn if planned R:R is below strategy minimum
  const strategyRRWarning = useMemo(() => {
    if (!selectedStrategy?.minRiskReward || plannedRewardRiskRatio === undefined) return undefined;
    if (plannedRewardRiskRatio < selectedStrategy.minRiskReward) {
      return `Strategy Rule Warning: Planned R:R (1:${plannedRewardRiskRatio.toFixed(2)}) is below the playbook minimum required (1:${selectedStrategy.minRiskReward.toFixed(2)}) for ${selectedStrategy.name}.`;
    }
    return undefined;
  }, [selectedStrategy, plannedRewardRiskRatio]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (tradeData: any) => api.trades.create(tradeData),
  });

  const updateMutation = useMutation({
    mutationFn: (tradeData: any) => api.trades.update(editTradeId!, tradeData),
  });

  // Template handling: never copies prices, timestamps, or P&L
  const handleSelectTemplate = (template: TradeSetupTemplate) => {
    setValue('symbol', template.symbol, { shouldDirty: true });
    setValue('assetClass', template.assetClass, { shouldDirty: true });
    setValue('direction', template.direction, { shouldDirty: true });
    if (template.session) setValue('session', template.session, { shouldDirty: true });
    if (template.strategyId) setValue('strategyId', template.strategyId, { shouldDirty: true });
    if (template.riskBudgetAmount) setValue('risk.riskBudgetAmount', template.riskBudgetAmount, { shouldDirty: true });
    if (template.confluences) setValue('thesis.confluences', template.confluences, { shouldDirty: true });
    if (template.preMarketBias) setValue('thesis.preMarketBias', template.preMarketBias, { shouldDirty: true });
    if (template.marketStructure) setValue('thesis.marketStructure', template.marketStructure, { shouldDirty: true });
    if (template.tags && template.tags.length > 0) {
      setValue('tagsInput', template.tags.join(', '), { shouldDirty: true });
    }

    // Auto-update lot size and instrument metadata
    const match = instruments.find((i: any) => i.symbol === template.symbol);
    if (match) {
      if (match.exchange) setValue('exchange', match.exchange);
      if (match.marketSegment) setValue('marketSegment', match.marketSegment);
      if (match.lotSize) setValue('simpleExecution.quantity', match.lotSize);
      if (match.contractMultiplier) setValue('simpleExecution.contractMultiplier', match.contractMultiplier);
    }

    setTemplateNotice(`Setup template applied: "${template.name}". Set your execution prices.`);
    setTimeout(() => setTemplateNotice(null), 4000);
  };

  const handleResetDefaults = () => {
    const prefs = getRememberedTradePreferences();
    const acc = defaultAccountId || prefs.preferredAccountId || accounts[0]?.id || '';
    reset({
      accountId: acc,
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
    });
    setExecutionMode('SIMPLE');
    setWorkflowMode('QUICK');
  };

  const getCurrentFormStateForTemplate = (): Omit<TradeSetupTemplate, 'id' | 'isBuiltIn'> => {
    const vals = watch();
    return {
      name: vals.tradeTitle || `${vals.symbol} Setup`,
      description: `Setup template for ${vals.symbol} ${vals.direction}`,
      symbol: vals.symbol || 'NIFTY',
      assetClass: vals.assetClass || 'FUTURES',
      exchange: vals.exchange || 'NSE',
      marketSegment: vals.marketSegment || 'NSE_FNO',
      direction: vals.direction || 'LONG',
      session: vals.session || 'NSE_REGULAR',
      strategyId: vals.strategyId || '',
      riskBudgetAmount: Number(vals.risk?.riskBudgetAmount) || 2000,
      confluences: vals.thesis?.confluences || [],
      tags: vals.tagsInput
        ? vals.tagsInput.split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean)
        : [],
      preMarketBias: vals.thesis?.preMarketBias || 'BULLISH',
      marketStructure: vals.thesis?.marketStructure || 'TRENDING_UP',
    };
  };

  // Safe dismiss with unsaved changes verification
  const handleRequestClose = () => {
    if (isDirty) {
      setDiscardConfirmOpen(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setDiscardConfirmOpen(false);
    onClose();
  };

  // Submission handler
  const onSubmit = async (data: any) => {
    const tags = data.tagsInput
      ? data.tagsInput
          .split(',')
          .map((t: string) => t.trim().toUpperCase())
          .filter(Boolean)
      : [];

    // In advanced execution mode, ensure simpleExecution holds the calculated average prices
    let simpleExecPayload = { ...data.simpleExecution };
    if (executionMode === 'ADVANCED' && watchedFills.length > 0) {
      try {
        const fifo = calculateFIFOExecution(data.direction, watchedFills, multiplier);
        simpleExecPayload.entryPrice = Number(fifo.weightedAvgEntryPrice.toFixed(4));
        if (fifo.weightedAvgExitPrice) {
          simpleExecPayload.exitPrice = Number(fifo.weightedAvgExitPrice.toFixed(4));
        }
        simpleExecPayload.quantity = fifo.closedQuantity.plus(fifo.openQuantity).toNumber();
      } catch {
        // Fallback to existing
      }
    }

    const payload = {
      ...data,
      simpleExecution: simpleExecPayload,
      tags,
      executionMode,
    };
    delete payload.tagsInput;

    try {
      setIsUploadingAttachments(true);
      setSubmitError(null);
      let targetTradeId = editTradeId;
      if (editTradeId) {
        await updateMutation.mutateAsync(payload);
      } else {
        const res = await createMutation.mutateAsync(payload);
        targetTradeId = res?.data?.id || res?.data?._id || res?.id || res?._id;
      }

      // Upload staged chart screenshots linked to this trade
      if (targetTradeId && stagedAttachments.length > 0) {
        for (const staged of stagedAttachments) {
          try {
            await api.attachments.upload(targetTradeId, staged.file, {
              category: staged.category,
              caption: staged.caption,
              timeframe: staged.timeframe,
            });
          } catch (uploadErr) {
            console.error('Failed to upload chart screenshot:', uploadErr);
          }
        }
      }

      // Clean up object URLs
      stagedAttachments.forEach((s) => {
        try {
          URL.revokeObjectURL(s.previewUrl);
        } catch {
          // ignore
        }
      });
      setStagedAttachments([]);

      queryClient.invalidateQueries({ queryKey: ['trades'] });
      if (targetTradeId) {
        queryClient.invalidateQueries({ queryKey: ['trade', targetTradeId] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });

      // Reset form state so isDirty becomes false and close modal cleanly
      reset();
      onClose();
      toast.success(editTradeId ? 'Trade updated successfully.' : 'Trade added successfully.');
    } catch (err: any) {
      console.error('Error saving trade:', err);
      const msg = err.message || 'Failed to save trade record';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const onInvalid = (errors: any) => {
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstKey = errorKeys[0];
      const errorObj = errors[firstKey];
      const message = errorObj?.message || errorObj?.root?.message || `Please check the ${firstKey} field.`;
      toast.warning(`Validation: ${message}`);
    } else {
      toast.warning('Please correct the validation errors in the form.');
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={handleRequestClose}
        maxWidth="lg"
        fullWidth
        scroll="paper"
        aria-labelledby="trade-entry-dialog-title"
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              maxHeight: '94vh',
              border: `1px solid ${muiTheme.palette.divider}`,
              backgroundImage: 'none',
              boxShadow: isDark
                ? '0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)'
                : '0 24px 48px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            },
          },
          backdrop: {
            sx: {
              backdropFilter: 'blur(6px)',
              backgroundColor: isDark ? 'rgba(3, 7, 18, 0.75)' : 'rgba(15, 23, 42, 0.5)',
            },
          },
        }}
      >
        {/* Modal Header */}
        <DialogTitle
          id="trade-entry-dialog-title"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            px: 3,
            py: 2,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(248, 250, 252, 0.95)',
          }}
        >
          {/* Title & Badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                color: muiTheme.palette.primary.main,
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)'}`,
              }}
            >
              <BoltRounded sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
                  {editTradeId ? 'Edit Trade Record' : 'Record New Trade'}
                </Typography>
                <Chip
                  size="small"
                  label={executionMode === 'ADVANCED' ? 'FIFO Multi-Fill' : 'Simple Fill'}
                  sx={{
                    height: 20,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    fontFamily: `'JetBrains Mono', monospace`,
                    backgroundColor: executionMode === 'ADVANCED' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: executionMode === 'ADVANCED' ? '#818cf8' : '#34d399',
                    border: `1px solid ${executionMode === 'ADVANCED' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                High-precision execution auditing, live risk metrics & psychological tracking
              </Typography>
            </Box>
          </Box>

          {/* Header Controls: Workflow Mode Toggle + Templates + Execution Switch */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            {/* Express vs Comprehensive Workflow Switcher */}
            <ToggleButtonGroup
              size="small"
              value={workflowMode}
              exclusive
              onChange={(_e, val) => val && setWorkflowMode(val)}
              sx={{
                height: 32,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                border: `1px solid ${muiTheme.palette.divider}`,
                borderRadius: 2,
                '& .MuiToggleButton-root': {
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  gap: 0.75,
                  border: 'none',
                  '&.Mui-selected': {
                    backgroundColor: muiTheme.palette.primary.main,
                    color: '#fff',
                    '&:hover': {
                      backgroundColor: muiTheme.palette.primary.dark,
                    },
                  },
                },
              }}
            >
              <ToggleButton value="QUICK">
                <BoltRounded sx={{ fontSize: 16 }} />
                Express Entry
              </ToggleButton>
              <ToggleButton value="COMPREHENSIVE">
                <MenuBookRounded sx={{ fontSize: 16 }} />
                Comprehensive Journal
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Template Selector */}
            <TradeTemplateSelector
              onSelectTemplate={handleSelectTemplate}
              onResetDefaults={handleResetDefaults}
              getCurrentFormStateForTemplate={getCurrentFormStateForTemplate}
            />

            {/* Close Button */}
            <IconButton
              size="small"
              onClick={handleRequestClose}
              sx={{
                color: muiTheme.palette.text.secondary,
                '&:hover': {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  color: muiTheme.palette.text.primary,
                },
              }}
            >
              <CloseRounded fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* Real-Time Financial Calculations Ribbon */}
        <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <TradeCalculationBanner
            grossPnL={liveGross}
            totalCosts={liveCosts}
            netPnL={liveNet}
            outcome={liveOutcome}
            realizedR={liveRealizedR}
            plannedRisk={plannedRiskAmount}
            status={watchedStatus}
            isDirectionValid={isDirectionValid}
            rewardRiskRatio={plannedRewardRiskRatio}
            positionValue={positionExposure}
            isAutoFees={executionMode === 'SIMPLE' ? isAutoFees : undefined}
            onResetAutoFees={handleResetAutoFees}
            strategyRRWarning={strategyRRWarning}
          />

          {templateNotice && (
            <Alert
              severity="success"
              icon={<CheckCircleRounded fontSize="small" />}
              sx={{ mt: 1.5, py: 0.5, borderRadius: 2, fontSize: '0.8125rem' }}
            >
              {templateNotice}
            </Alert>
          )}
        </Box>

        {/* Modal Body / Scrollable Form */}
        <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
          <DialogContent
            sx={{
              p: 3,
              pt: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            }}
          >
            {submitError && (
              <Alert severity="error" onClose={() => setSubmitError(null)}>
                {submitError}
              </Alert>
            )}
            {/* Primary Express Trade Entry Section */}
            <TradeQuickSection
              register={register}
              watch={watch}
              setValue={setValue}
              accounts={accounts}
              instruments={instruments}
              strategies={strategies}
              isAutoFees={isAutoFees}
              onToggleAutoFees={(val) => setIsAutoFees(val)}
              onResetAutoFees={handleResetAutoFees}
            />

            {/* Execution Mode Toggle Bar */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.25,
                borderRadius: 2,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: `1px dashed ${muiTheme.palette.divider}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LayersRounded sx={{ fontSize: 18, color: muiTheme.palette.text.secondary }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Execution Engine Mode:
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                  {executionMode === 'SIMPLE'
                    ? 'Single Entry & Exit Price (Standard)'
                    : 'Real-time FIFO Matching with multiple scaled entries & partial profit scales'}
                </Typography>
              </Box>

              <Button
                size="small"
                variant={executionMode === 'ADVANCED' ? 'contained' : 'outlined'}
                color={executionMode === 'ADVANCED' ? 'secondary' : 'inherit'}
                onClick={() => setExecutionMode((prev) => (prev === 'SIMPLE' ? 'ADVANCED' : 'SIMPLE'))}
                startIcon={<SwapHorizRounded />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                }}
              >
                {executionMode === 'SIMPLE' ? 'Switch to Multi-Fill (FIFO)' : 'Switch to Simple Fill'}
              </Button>
            </Box>

            {/* Advanced Multi-Fill Section (if executionMode === 'ADVANCED') */}
            {executionMode === 'ADVANCED' && (
              <TradeAdvancedFills
                register={register}
                watch={watch}
                fillsFieldArray={fillsFieldArray}
              />
            )}

            {/* Comprehensive Journal Section (Progressive disclosure or when workflowMode === 'COMPREHENSIVE') */}
            {workflowMode === 'COMPREHENSIVE' ? (
              <TradeJournalDetails
                register={register}
                watch={watch}
                setValue={setValue}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 2,
                  borderRadius: 2,
                  border: `1px dashed ${muiTheme.palette.divider}`,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.01)',
                }}
              >
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setWorkflowMode('COMPREHENSIVE')}
                  startIcon={<PsychologyRounded />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    color: muiTheme.palette.text.secondary,
                    '&:hover': { color: muiTheme.palette.primary.main },
                  }}
                >
                  Expand Comprehensive Post-Trade Journal (Confluences, Psychology, Mistakes & Notes) ➔
                </Button>
              </Box>
            )}

            {/* Chart Screenshots & Visual Review Section */}
            <Accordion
              defaultExpanded={
                workflowMode === 'COMPREHENSIVE' ||
                stagedAttachments.length > 0 ||
                existingAttachments.length > 0
              }
              sx={{
                borderRadius: 2.5,
                border: `1px solid ${muiTheme.palette.divider}`,
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.7)',
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreRounded />}
                sx={{
                  px: 2.5,
                  py: 1,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
                  borderBottom: `1px solid ${muiTheme.palette.divider}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <CollectionsRounded sx={{ fontSize: 20, color: muiTheme.palette.primary.main }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Chart Screenshots & Visual Attachments
                  </Typography>
                  <Chip
                    size="small"
                    label={`${stagedAttachments.length + existingAttachments.length} attached`}
                    sx={{
                      height: 20,
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      fontFamily: `'JetBrains Mono', monospace`,
                    }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 2.5 }}>
                <TradeAttachmentUploader
                  stagedAttachments={stagedAttachments}
                  onAddStaged={(newItems) => setStagedAttachments((prev) => [...prev, ...newItems])}
                  onUpdateStaged={(id, updates) =>
                    setStagedAttachments((prev) =>
                      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
                    )
                  }
                  onRemoveStaged={(id) => {
                    setStagedAttachments((prev) => {
                      const item = prev.find((i) => i.id === id);
                      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
                      return prev.filter((i) => i.id !== id);
                    });
                  }}
                  existingAttachments={existingAttachments}
                  onDeleteExisting={handleDeleteExistingAttachment}
                  symbol={watchedSymbol}
                />
              </AccordionDetails>
            </Accordion>
          </DialogContent>

          {/* Sticky Dialog Footer */}
          <DialogActions
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 3,
              py: 2,
              borderTop: `1px solid ${muiTheme.palette.divider}`,
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(248, 250, 252, 0.95)',
            }}
          >
            {/* Trust and precision note */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongRounded sx={{ fontSize: 16, color: muiTheme.palette.text.secondary }} />
              <Typography
                variant="caption"
                sx={{
                  fontFamily: `'JetBrains Mono', monospace`,
                  fontSize: '0.75rem',
                  color: muiTheme.palette.text.secondary,
                  display: { xs: 'none', sm: 'inline' },
                }}
              >
                Monetary calculations verified with 30-digit precision arithmetic.
              </Typography>
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="outlined"
                color="inherit"
                onClick={handleRequestClose}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  borderRadius: 2,
                  textTransform: 'none',
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isSubmitting || isUploadingAttachments || createMutation.isPending || updateMutation.isPending}
                sx={{
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  px: 3.5,
                  py: 1,
                  borderRadius: 2,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                }}
              >
                {isSubmitting || isUploadingAttachments || createMutation.isPending || updateMutation.isPending ? (
                  <CircularProgress size={18} color="inherit" />
                ) : editTradeId ? (
                  'Update Trade Record'
                ) : (
                  'Save Trade Entry'
                )}
              </Button>
            </Box>
          </DialogActions>
        </form>
      </Dialog>

      {/* Unsaved Changes Confirmation Modal */}
      <Dialog
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              p: 1,
              border: `1px solid ${muiTheme.palette.divider}`,
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pb: 1 }}>
          <WarningAmberRounded color="warning" />
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
            Discard Unsaved Trade?
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ py: 1 }}>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
            You have unsaved changes in this trade entry. Discarding will permanently lose any entered prices, confluences, or notes.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button
            variant="text"
            onClick={() => setDiscardConfirmOpen(false)}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Keep Editing
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDiscard}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
          >
            Discard & Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
