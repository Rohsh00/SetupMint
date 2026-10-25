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
import {
  IAttachment,
  ITradeTemplate,
  TemplatePatch,
  ProvenanceSource,
  BUILT_IN_TEMPLATES,
} from '@tradevault/shared';
import {
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateSimpleExecutionPnL,
  calculateFIFOExecution,
  IndianChargesCalculator,
  resolveTemplate,
  rankTemplates,
  calculateContinuousTiltScore,
} from '@tradevault/financial-engine';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { toLocalIsoDateTime, currentLocalIsoDateTime, fromLocalIsoDateTime } from '../../lib/utils.js';
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
  const { data: recentTradesResponse } = useQuery({
    queryKey: ['trades', 'recent-tilt'],
    queryFn: () => api.trades.list({ limit: 20 }),
  });
  const recentTrades = recentTradesResponse?.data || [];

  // When editing from ledger/tables where full attachments may not be populated, load full trade data
  const { data: fullTradeData } = useQuery({
    queryKey: ['trade', editTradeId],
    queryFn: () => api.trades.get(editTradeId!),
    enabled: Boolean(editTradeId && isOpen && (!initialValues?.attachments || initialValues.attachments.length === 0)),
  });

  useEffect(() => {
    if (fullTradeData?.attachments && Array.isArray(fullTradeData.attachments) && fullTradeData.attachments.length > 0) {
      setExistingAttachments(fullTradeData.attachments);
    }
  }, [fullTradeData]);

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
    getValues,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
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
      entryTime: currentLocalIsoDateTime(),
      exitTime: currentLocalIsoDateTime(),
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

  // Continuous Tilt Score calculation (advisory pre-trade alert)
  const watchedQty = watchedSimple?.quantity || 1;
  const tiltResult = useMemo(() => {
    if (!recentTrades || recentTrades.length === 0) return null;
    const mapped = recentTrades.map((t: any) => ({
      netPnL: t.calculated?.netPnL ?? 0,
      tradeDate: t.tradeDate,
      quantity: t.simpleExecution?.quantity ?? t.calculated?.closedQuantity ?? 1,
      exitDate: t.exitTime || t.tradeDate,
    }));

    const currentAccount = accounts.find((a: any) => a.id === watchedAccountId);
    const dailyLimit = currentAccount?.maxDailyLoss ?? 10000;

    return calculateContinuousTiltScore({
      recentTrades: mapped,
      proposedQuantity: Number(watchedQty) || 1,
      dailyLossLimit: dailyLimit,
    });
  }, [recentTrades, watchedQty, watchedAccountId, accounts]);

  // Handle edit values or initial opening
  useEffect(() => {
    if (initialValues) {
      const initialEntry = Number(initialValues.simpleExecution?.entryPrice) || 0;
      const initialRisk = initialValues.risk ? { ...initialValues.risk } : {};
      // Auto-heal corrupted/truncated plannedEntryPrice (e.g. truncated keystroke '9' vs entryPrice '9233')
      if (
        initialEntry > 0 &&
        (!initialRisk.plannedEntryPrice ||
          (initialRisk.plannedEntryPrice < initialEntry / 2 && Math.abs(initialEntry - initialRisk.plannedEntryPrice) > 50))
      ) {
        initialRisk.plannedEntryPrice = initialEntry;
      }

      // Format fills timestamps properly for datetime-local input (YYYY-MM-DDTHH:mm)
      const formattedFills = Array.isArray(initialValues.fills)
        ? initialValues.fills.map((f: any) => ({
            ...f,
            fee: f.fee ?? 0,
            timestamp: toLocalIsoDateTime(f.timestamp) || toLocalIsoDateTime(initialValues.entryTime) || currentLocalIsoDateTime(),
          }))
        : [];

      // Auto-harmonize exchange, marketSegment, and assetClass for MCX / Commodities
      let initialExchange = initialValues.exchange || 'NSE';
      let initialMarketSegment = initialValues.marketSegment || 'NSE_FNO';
      let initialAssetClass = initialValues.assetClass || 'FUTURES';

      const symUpper = (initialValues.symbol || '').toUpperCase();
      if (
        initialExchange === 'MCX' ||
        symUpper.startsWith('MCX:') ||
        /^(CRUDEOIL|NATGAS|NATURALGAS|GOLD|SILVER|COPPER|ZINC|NICKEL|ALUMINIUM|LEAD)/i.test(symUpper.replace(/^MCX:/i, ''))
      ) {
        initialExchange = 'MCX';
        initialMarketSegment = 'MCX';
        initialAssetClass = 'COMMODITY';
      }

      let initialExec = initialValues.simpleExecution ? { ...initialValues.simpleExecution } : {};
      const hasItemizedFees =
        Number(initialExec.brokerage || 0) > 0 ||
        Number(initialExec.exchangeFees || 0) > 0 ||
        Number(initialExec.regulatoryFees || 0) > 0 ||
        Number(initialExec.taxes || 0) > 0;

      let shouldAutoFees = true;
      if (hasItemizedFees) {
        shouldAutoFees = false;
      } else {
        let entryP = Number(initialExec.entryPrice) || Number(initialValues.calculated?.averageEntryPrice) || 0;
        let exitP = Number(initialExec.exitPrice) || Number(initialValues.calculated?.averageExitPrice) || undefined;
        let qty = Number(initialExec.quantity) || Number(initialValues.calculated?.closedQuantity) || Number(initialValues.calculated?.openQuantity) || 1;
        const mult = Number(initialExec.contractMultiplier) || 1;

        if (initialValues.executionMode === 'ADVANCED' && formattedFills.length > 0) {
          try {
            const fifo = calculateFIFOExecution(initialValues.direction, formattedFills, mult);
            entryP = fifo.weightedAvgEntryPrice.toNumber() || entryP;
            if (fifo.weightedAvgExitPrice) {
              exitP = fifo.weightedAvgExitPrice.toNumber();
            }
            qty = fifo.closedQuantity.toNumber() || fifo.openQuantity.toNumber() || qty;
          } catch {
            // keep derived
          }
        }

        if (entryP > 0 && qty > 0) {
          const matchedAcc = accounts.find(
            (a: any) => a.id === (typeof initialValues.accountId === 'object' ? initialValues.accountId?.id || initialValues.accountId?._id : initialValues.accountId)
          );
          const brokerCode = matchedAcc?.broker || initialValues.accountId?.broker;
          const autoCharges = IndianChargesCalculator.calculate(
            initialAssetClass,
            initialMarketSegment,
            entryP,
            exitP,
            qty,
            mult,
            20,
            brokerCode
          );
          if (autoCharges) {
            initialExec = {
              ...initialExec,
              brokerage: autoCharges.brokerage,
              exchangeFees: autoCharges.exchangeFees,
              regulatoryFees: autoCharges.regulatoryFees,
              taxes: autoCharges.taxes,
              entryPrice: entryP,
              exitPrice: exitP,
              quantity: qty,
              contractMultiplier: mult,
            };
          }
        }
      }

      // Sanitize confluences (remove any accidental multi-sentence checklist questions or phase descriptions)
      let initialThesis = initialValues.thesis ? { ...initialValues.thesis } : {};
      if (Array.isArray(initialThesis.confluences)) {
        initialThesis.confluences = initialThesis.confluences.filter((c: string) => {
          if (!c || c.trim().length === 0) return false;
          const trimmed = c.trim();
          if (trimmed.length > 55) return false;
          if (/^\d+\.\s+/i.test(trimmed)) return false;
          if (/^(Phase \d|Bullish Trap|Bearish Trap|For a (Short|Long) Setup)/i.test(trimmed)) return false;
          return true;
        });
      }

      reset({
        ...initialValues,
        exchange: initialExchange,
        marketSegment: initialMarketSegment,
        assetClass: initialAssetClass,
        risk: initialRisk,
        thesis: initialThesis,
        simpleExecution: initialExec,
        fills: formattedFills,
        tagsInput: Array.isArray(initialValues.tags)
          ? initialValues.tags.join(', ')
          : (initialValues.tagsInput || ''),
        tradeDate: initialValues.tradeDate
          ? initialValues.tradeDate.split('T')[0]
          : new Date().toISOString().split('T')[0],
        entryTime: initialValues.entryTime
          ? toLocalIsoDateTime(initialValues.entryTime)
          : currentLocalIsoDateTime(),
        exitTime: initialValues.exitTime
          ? toLocalIsoDateTime(initialValues.exitTime)
          : (initialValues.status === 'OPEN' ? '' : currentLocalIsoDateTime()),
      });
      setIsAutoFees(shouldAutoFees);

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

  // Strategy-aware sync: sync strategyName when strategy is selected
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
    }
  }, [watchedStrategyId, selectedStrategy, setValue]);

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
    let entryP = Number(watchedSimple?.entryPrice) || 0;
    let exitP = watchedStatus === 'CLOSED'
      ? (Number(watchedSimple?.exitPrice) || entryP)
      : entryP;
    let qty = Number(watchedSimple?.quantity) || 1;
    const mult = Number(watchedSimple?.contractMultiplier) || 1;

    if (executionMode === 'ADVANCED' && watchedFills.length > 0) {
      try {
        const fifo = calculateFIFOExecution(watchedDirection, watchedFills, mult);
        entryP = fifo.weightedAvgEntryPrice.toNumber() || entryP;
        if (fifo.weightedAvgExitPrice) {
          exitP = fifo.weightedAvgExitPrice.toNumber();
        }
        qty = fifo.closedQuantity.toNumber() || fifo.openQuantity.toNumber() || qty;
      } catch {
        // Fallback to watchedSimple
      }
    }

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
    if (isAutoFees) {
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
    watchedAccountId,
    selectedAccount?.broker,
    watchedAssetClass,
    watchedMarketSegment,
    watchedDirection,
    watchedSimple?.entryPrice,
    watchedSimple?.exitPrice,
    watchedSimple?.quantity,
    watchedSimple?.contractMultiplier,
    watchedStatus,
    watchedFills,
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
      const fifoCosts = Number(fifo.totalCosts.toFixed(2));
      const simpleCosts = Number(
        (
          (Number(watchedSimple?.brokerage) || 0) +
          (Number(watchedSimple?.exchangeFees) || 0) +
          (Number(watchedSimple?.regulatoryFees) || 0) +
          (Number(watchedSimple?.taxes) || 0) +
          (Number(watchedSimple?.otherFees) || 0) +
          (Number(watchedSimple?.explicitAdjustments) || 0)
        ).toFixed(2)
      );

      liveCosts = fifoCosts > 0 ? fifoCosts : simpleCosts;
      if (liveCosts === 0 && isAutoFees) {
        const auto = computeAutoCharges();
        if (auto) liveCosts = auto.totalCosts;
      }
      liveNet = Number((liveGross - liveCosts).toFixed(2));
      liveOutcome = watchedStatus === 'OPEN' ? 'OPEN' : liveNet > 0 ? 'WIN' : liveNet < 0 ? 'LOSS' : 'BREAKEVEN';
      positionExposure = Number(fifo.weightedAvgEntryPrice.toFixed(2)) * fifo.closedQuantity.plus(fifo.openQuantity).toNumber() * multiplier;
    } catch {
      // Incomplete fills
    }
  }

  // Calculate live planned risk
  let plannedRiskAmount = Number(watchedRisk?.riskBudgetAmount) || 0;
  const pEntry = Number(
    workflowMode === 'QUICK'
      ? (watchedSimple?.entryPrice || watchedRisk?.plannedEntryPrice)
      : (watchedRisk?.plannedEntryPrice || watchedSimple?.entryPrice)
  ) || 0;
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

  // Query templates for user custom templates
  const { data: allTemplatesData = [] } = useQuery<ITradeTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => api.templates.list(),
  });

  // Selected instrument for contract specifications & tick size
  const selectedInstrument = useMemo(() => {
    if (!watchedSymbol) return null;
    return instruments.find((i: any) => i.symbol?.toUpperCase() === watchedSymbol.toUpperCase()) || null;
  }, [instruments, watchedSymbol]);

  // Market-based rule-driven template state
  const [activeTemplate, setActiveTemplate] = useState<ITradeTemplate | null>(null);
  const [provenanceMap, setProvenanceMap] = useState<Record<string, ProvenanceSource>>({});
  const [manualSlHint, setManualSlHint] = useState<string | null>(null);
  const [missingStrategyName, setMissingStrategyName] = useState<string | null>(null);
  const [isCreatingStrategy, setIsCreatingStrategy] = useState(false);
  const [previousFormSnapshot, setPreviousFormSnapshot] = useState<any | null>(null);

  // Dynamic recomputation of SL and target when entryPrice or direction changes later
  const watchedEntryPrice = watch('simpleExecution.entryPrice');
  const prevEntryPriceRef = useRef<number | undefined>(undefined);
  const prevDirectionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!activeTemplate || activeTemplate.slRule.type === 'MANUAL') return;

    const entryNum = Number(watchedEntryPrice) || 0;
    const dir = watchedDirection;

    if (entryNum === prevEntryPriceRef.current && dir === prevDirectionRef.current) {
      return;
    }
    prevEntryPriceRef.current = entryNum;
    prevDirectionRef.current = dir;

    if (entryNum > 0 && dir) {
      const isSlRuleDerived = provenanceMap['risk.initialStopLoss'] === 'RULE' && !dirtyFields.risk?.initialStopLoss;
      const isTargetRuleDerived = provenanceMap['risk.plannedTarget'] === 'RULE' && !dirtyFields.risk?.plannedTarget;

      if (isSlRuleDerived || isTargetRuleDerived) {
        const tick = selectedInstrument?.tickSize || 0.05;
        const recomputed = resolveTemplate(activeTemplate, {
          symbol: watchedSymbol,
          assetClass: watchedAssetClass,
          direction: dir,
          entryPrice: entryNum,
          tickSize: tick,
        });

        if (isSlRuleDerived && recomputed.risk?.initialStopLoss) {
          setValue('risk.initialStopLoss', recomputed.risk.initialStopLoss, { shouldDirty: false });
        }
        if (isTargetRuleDerived && recomputed.risk?.plannedTarget) {
          setValue('risk.plannedTarget', recomputed.risk.plannedTarget, { shouldDirty: false });
        }
      }
    }
  }, [watchedEntryPrice, watchedDirection, activeTemplate, provenanceMap, dirtyFields, selectedInstrument, watchedSymbol, watchedAssetClass, setValue]);

  // Template handling: never overwrites dirty/edited fields, fills empty/untouched fields
  const handleApplyTemplatePatch = (patch: TemplatePatch, template: ITradeTemplate) => {
    const cur = getValues();
    setPreviousFormSnapshot(JSON.parse(JSON.stringify(cur)));

    const newProvenance: Record<string, ProvenanceSource> = { ...patch.provenance };

    // Trade title: fill if not dirty and empty or placeholder
    if (!dirtyFields.tradeTitle && patch.tradeTitle) {
      setValue('tradeTitle', patch.tradeTitle, { shouldDirty: true });
    } else {
      delete newProvenance['tradeTitle'];
    }

    // Direction: fill if template has direction and not dirty
    if (patch.direction && !dirtyFields.direction) {
      setValue('direction', patch.direction, { shouldDirty: true });
    }

    // Strategy matching (case-insensitive)
    if (template.strategyName) {
      const matched = strategies.find(
        (s: any) => (s.name || '').trim().toLowerCase() === template.strategyName!.trim().toLowerCase()
      );
      if (matched) {
        setValue('strategyId', matched.id || matched._id, { shouldDirty: true });
        setValue('strategyName', matched.name, { shouldDirty: true });
        setMissingStrategyName(null);
      } else {
        setMissingStrategyName(template.strategyName);
        setValue('strategyId', '', { shouldDirty: true });
        setValue('strategyName', template.strategyName, { shouldDirty: true });
      }
    }

    // Tags
    if (!dirtyFields.tagsInput && patch.tags && patch.tags.length > 0) {
      setValue('tagsInput', patch.tags.join(', '), { shouldDirty: true });
    }

    // Confluences
    if (patch.confluences && patch.confluences.length > 0) {
      const curConfs = cur.thesis?.confluences || [];
      const combined = Array.from(new Set([...curConfs, ...patch.confluences]));
      setValue('thesis.confluences', combined, { shouldDirty: true });
      setValue('psychology.checklistCompleted', true, { shouldDirty: true });
    }

    // Planned R:R
    if (patch.risk?.plannedRewardRiskRatio) {
      setValue('risk.plannedRewardRiskRatio', patch.risk.plannedRewardRiskRatio);
    }

    // Stop loss & target
    if (template.slRule.type === 'MANUAL') {
      setManualSlHint(patch.risk?.slHint || template.slRule.manualHint || 'Structure-based stop loss required');
    } else {
      setManualSlHint(null);
      if (patch.risk?.initialStopLoss && !dirtyFields.risk?.initialStopLoss) {
        setValue('risk.initialStopLoss', patch.risk.initialStopLoss, { shouldDirty: true });
      } else {
        delete newProvenance['risk.initialStopLoss'];
      }
      if (patch.risk?.plannedTarget && !dirtyFields.risk?.plannedTarget) {
        setValue('risk.plannedTarget', patch.risk.plannedTarget, { shouldDirty: true });
      } else {
        delete newProvenance['risk.plannedTarget'];
      }
    }

    // Trading session
    if (patch.session && !dirtyFields.session) {
      setValue('session', patch.session, { shouldDirty: true });
    }

    setActiveTemplate(template);
    setProvenanceMap(newProvenance);
    setTemplateNotice(`Setup template applied: "${template.name}". Set execution details.`);
    setTimeout(() => setTemplateNotice(null), 4000);
  };

  const handleUndoTemplate = () => {
    if (previousFormSnapshot) {
      if (previousFormSnapshot.tradeTitle !== undefined) setValue('tradeTitle', previousFormSnapshot.tradeTitle);
      if (previousFormSnapshot.direction !== undefined) setValue('direction', previousFormSnapshot.direction);
      if (previousFormSnapshot.strategyId !== undefined) setValue('strategyId', previousFormSnapshot.strategyId);
      if (previousFormSnapshot.strategyName !== undefined) setValue('strategyName', previousFormSnapshot.strategyName);
      if (previousFormSnapshot.tagsInput !== undefined) setValue('tagsInput', previousFormSnapshot.tagsInput);
      if (previousFormSnapshot.thesis?.confluences !== undefined) setValue('thesis.confluences', previousFormSnapshot.thesis.confluences);
      if (previousFormSnapshot.risk?.initialStopLoss !== undefined) setValue('risk.initialStopLoss', previousFormSnapshot.risk.initialStopLoss);
      if (previousFormSnapshot.risk?.plannedTarget !== undefined) setValue('risk.plannedTarget', previousFormSnapshot.risk.plannedTarget);
      if (previousFormSnapshot.risk?.plannedRewardRiskRatio !== undefined) setValue('risk.plannedRewardRiskRatio', previousFormSnapshot.risk.plannedRewardRiskRatio);
      if (previousFormSnapshot.session !== undefined) setValue('session', previousFormSnapshot.session);
    }
    setActiveTemplate(null);
    setProvenanceMap({});
    setManualSlHint(null);
    setMissingStrategyName(null);
    setPreviousFormSnapshot(null);
    toast.info('Template undone. Previous values restored.');
  };

  const handleCreateMissingStrategy = async (strategyName: string) => {
    if (!strategyName || isCreatingStrategy) return;
    try {
      setIsCreatingStrategy(true);

      // Check if strategy already exists in current list (case-insensitive)
      let targetStrategy = strategies.find(
        (s: any) => (s.name || '').trim().toLowerCase() === strategyName.trim().toLowerCase()
      );

      if (!targetStrategy) {
        try {
          const res = await api.strategies.create({
            name: strategyName.trim(),
            description: activeTemplate?.description || `Playbook strategy for ${strategyName}`,
            tags: activeTemplate?.tags || [],
            entryRules: activeTemplate?.confluences || [],
            minRiskReward: activeTemplate?.minRR || 1.5,
          });
          targetStrategy = res?.data || res;
        } catch (createErr: any) {
          // If server reports it already exists (409), refetch the list and find it
          const freshList = await api.strategies.list();
          targetStrategy = freshList.find(
            (s: any) => (s.name || '').trim().toLowerCase() === strategyName.trim().toLowerCase()
          );
          if (!targetStrategy) {
            throw createErr;
          }
        }
      }

      const stratId = targetStrategy?.id || targetStrategy?._id;
      if (!stratId) {
        throw new Error('Strategy was created but no ID was returned');
      }

      // Update React Query cache immediately so dropdown has the new option
      queryClient.setQueryData(['strategies'], (old: any[] = []) => {
        const alreadyInList = old.some((s: any) => (s.id || s._id) === stratId);
        return alreadyInList ? old : [...old, targetStrategy];
      });
      await queryClient.invalidateQueries({ queryKey: ['strategies'] });

      // Update form values with both strategyId and strategyName
      setValue('strategyId', stratId, { shouldDirty: true });
      setValue('strategyName', targetStrategy.name || strategyName, { shouldDirty: true });

      // Clear missingStrategyName so the helper button disappears
      setMissingStrategyName(null);

      toast.success(`Strategy "${strategyName}" created and linked to trade!`);
    } catch (err: any) {
      console.error('Error creating strategy from template:', err);
      toast.error(err?.message || 'Failed to create strategy playbook');
    } finally {
      setIsCreatingStrategy(false);
    }
  };

  const handleSelectTemplate = (template: any) => {
    const matchBuiltIn = BUILT_IN_TEMPLATES.find((t) => t.id === template.id);
    const targetTemplate: ITradeTemplate = matchBuiltIn || {
      id: template.id || `custom-${Date.now()}`,
      name: template.name,
      description: template.description || 'Custom template',
      group: 'PRICE_ACTION',
      markets: [watch('assetClass') || 'FUTURES'],
      slRule: { type: 'PERCENT', value: 0.5 },
      minRR: 2.0,
      titlePattern: `${watch('symbol') || 'Trade'} {DIR}`,
      tags: template.tags || [],
      confluences: template.confluences || [],
      isBuiltIn: false,
    };

    const patch = resolveTemplate(targetTemplate, {
      symbol: watch('symbol'),
      assetClass: watch('assetClass'),
      direction: watch('direction'),
      entryPrice: Number(watch('simpleExecution.entryPrice')) || undefined,
      tickSize: selectedInstrument?.tickSize || 0.05,
    });
    handleApplyTemplatePatch(patch, targetTemplate);
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
      entryTime: currentLocalIsoDateTime(),
      exitTime: currentLocalIsoDateTime(),
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

  const getCurrentFormStateForTemplate = () => {
    const vals = watch();
    return {
      assetClass: vals.assetClass,
      direction: vals.direction,
      strategyName: selectedStrategy?.name || vals.strategyName,
      entryPrice: Number(vals.simpleExecution?.entryPrice) || undefined,
      initialStopLoss: Number(vals.risk?.initialStopLoss) || undefined,
      plannedTarget: Number(vals.risk?.plannedTarget) || undefined,
      plannedRR: plannedRewardRiskRatio,
      tags: vals.tagsInput
        ? vals.tagsInput.split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean)
        : [],
      confluences: vals.thesis?.confluences || [],
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

    const hasItemizedInPayload =
      Number(simpleExecPayload.brokerage || 0) > 0 ||
      Number(simpleExecPayload.exchangeFees || 0) > 0 ||
      Number(simpleExecPayload.regulatoryFees || 0) > 0 ||
      Number(simpleExecPayload.taxes || 0) > 0;

    if (!hasItemizedInPayload && isAutoFees) {
      const auto = computeAutoCharges();
      if (auto) {
        simpleExecPayload.brokerage = auto.brokerage;
        simpleExecPayload.exchangeFees = auto.exchangeFees;
        simpleExecPayload.regulatoryFees = auto.regulatoryFees;
        simpleExecPayload.taxes = auto.taxes;
      }
    }

    // Ensure plannedEntryPrice in risk is synced with entry price in Quick mode
    const finalRisk = { ...data.risk };
    if (workflowMode === 'QUICK' && simpleExecPayload.entryPrice) {
      finalRisk.plannedEntryPrice = simpleExecPayload.entryPrice;
    }

    const finalEntryTime = data.entryTime
      ? fromLocalIsoDateTime(data.entryTime) || new Date(data.entryTime).toISOString()
      : new Date().toISOString();
    const finalExitTime = data.exitTime && data.status !== 'OPEN'
      ? fromLocalIsoDateTime(data.exitTime) || new Date(data.exitTime).toISOString()
      : undefined;

    // Sanitize fills payloads
    const sanitizedFills = Array.isArray(data.fills)
      ? data.fills.map((f: any) => ({
          ...f,
          fee: Number(f.fee) || 0,
          price: Number(f.price) || 0,
          quantity: Number(f.quantity) || 0,
          timestamp: f.timestamp
            ? fromLocalIsoDateTime(f.timestamp) || new Date(f.timestamp).toISOString()
            : finalEntryTime,
        }))
      : [];

    // Auto-harmonize exchange, marketSegment, and assetClass for MCX / Commodities
    let finalExchange = data.exchange || 'NSE';
    let finalMarketSegment = data.marketSegment || 'NSE_FNO';
    let finalAssetClass = data.assetClass || 'FUTURES';
    const subSymUpper = (data.symbol || '').toUpperCase();
    if (
      finalExchange === 'MCX' ||
      subSymUpper.startsWith('MCX:') ||
      /^(CRUDEOIL|NATGAS|NATURALGAS|GOLD|SILVER|COPPER|ZINC|NICKEL|ALUMINIUM|LEAD)/i.test(subSymUpper.replace(/^MCX:/i, ''))
    ) {
      finalExchange = 'MCX';
      finalMarketSegment = 'MCX';
      finalAssetClass = 'COMMODITY';
    }

    const payload = {
      ...data,
      entryTime: finalEntryTime,
      exitTime: finalExitTime,
      exchange: finalExchange,
      marketSegment: finalMarketSegment,
      assetClass: finalAssetClass,
      risk: finalRisk,
      fills: sanitizedFills,
      templateId: activeTemplate?.id || data.templateId || undefined,
      simpleExecution: simpleExecPayload,
      tags,
      executionMode,
    };
    if (!finalExitTime) {
      delete payload.exitTime;
    }
    delete payload.tagsInput;

    // If template has a strategy that wasn't explicitly created via the button, auto-create it now
    if (!payload.strategyId && missingStrategyName) {
      try {
        let autoStrat = strategies.find(
          (s: any) => (s.name || '').trim().toLowerCase() === missingStrategyName.trim().toLowerCase()
        );
        if (!autoStrat) {
          const res = await api.strategies.create({
            name: missingStrategyName.trim(),
            description: activeTemplate?.description || `Playbook strategy for ${missingStrategyName}`,
            tags: activeTemplate?.tags || [],
            entryRules: activeTemplate?.confluences || [],
            minRiskReward: activeTemplate?.minRR || 1.5,
          });
          autoStrat = res?.data || res;
        }
        const sid = autoStrat?.id || autoStrat?._id;
        if (sid) {
          payload.strategyId = sid;
          payload.strategyName = autoStrat.name || missingStrategyName;
          queryClient.invalidateQueries({ queryKey: ['strategies'] });
        }
      } catch (err) {
        console.warn('Auto-create strategy on submit skipped:', err);
      }
    }

    if (!payload.strategyId) delete payload.strategyId;
    if (!payload.instrumentId) delete payload.instrumentId;
    if (!payload.templateId) delete payload.templateId;

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
      queryClient.invalidateQueries({ queryKey: ['templates'] });

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
            isAutoFees={isAutoFees}
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
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
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

            {/* Advisory Continuous Tilt Alert */}
            {tiltResult && (tiltResult.level === 'HIGH_TILT' || tiltResult.level === 'SEVERE_TILT') && (
              <Alert
                severity="warning"
                icon={<WarningAmberRounded />}
                sx={{
                  border: `1px solid ${muiTheme.palette.warning.main}`,
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Advisory Risk Warning: Tilt Detected ({tiltResult.score}/100 — {tiltResult.level})
                  </Typography>
                  <Chip
                    label={`${tiltResult.score}/100`}
                    size="small"
                    color="warning"
                    sx={{ fontWeight: 800, height: 20, fontSize: '0.625rem' }}
                  />
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                  {tiltResult.advisoryNote}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Streak: {tiltResult.components.lossStreakScore}/100
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Size Escalation: {tiltResult.components.sizeEscalationScore}/100
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Time Compression: {tiltResult.components.timeCompressionScore}/100
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic', color: 'text.secondary', fontSize: '0.625rem' }}>
                  Non-blocking advisory alert. Does not prevent trade logging or diagnose psychology.
                </Typography>
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
              dirtyFields={dirtyFields}
              activeTemplate={activeTemplate}
              provenanceMap={provenanceMap}
              manualSlHint={manualSlHint}
              onApplyTemplatePatch={handleApplyTemplatePatch}
              onUndoTemplate={handleUndoTemplate}
              hasAppliedTemplate={Boolean(activeTemplate)}
              appliedTemplateName={activeTemplate?.name}
              missingStrategyName={missingStrategyName}
              onCreateMissingStrategy={handleCreateMissingStrategy}
              isCreatingStrategy={isCreatingStrategy}
              userTemplates={allTemplatesData.filter((t: any) => !t.isBuiltIn)}
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
                setValue={setValue}
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
