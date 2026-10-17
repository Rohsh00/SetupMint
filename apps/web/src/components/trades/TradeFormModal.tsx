import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Sliders,
  DollarSign,
  ShieldCheck,
  Brain,
  Sparkles,
} from 'lucide-react';
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

  // Handle escape key to close modal safely
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (!isDirty || window.confirm('You have unsaved changes. Discard and close?')) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, onClose]);

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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card/60">
          <div>
            <h2 id="trade-modal-title" className="text-lg font-bold text-foreground flex items-center gap-2">
              {editTradeId ? 'Edit Trade Entry' : 'Log New Manual Trade'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Deterministic monetary calculations, risk controls, and execution audit log
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live Calculation Banner */}
        <div className="px-6 pt-4">
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
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-border px-6 pt-3 gap-2 overflow-x-auto text-xs font-medium">
          {[
            { id: 'IDENTITY', label: 'Trade Identity', icon: Sliders },
            { id: 'EXECUTION', label: 'Execution & Fills', icon: DollarSign },
            { id: 'RISK', label: 'Risk Parameters', icon: ShieldCheck },
            { id: 'THESIS', label: 'Thesis & Confluences', icon: Sparkles },
            { id: 'PSYCHOLOGY', label: 'Psychology & Discipline', icon: Brain },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-medium transition-all ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400 font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-4">
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

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-6">
            <span className="text-[11px] text-muted-foreground font-mono">
              All financial values calculated with 30-digit decimal arithmetic.
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting || createMutation.isPending || updateMutation.isPending
                  ? 'Saving Trade...'
                  : editTradeId
                  ? 'Update Trade'
                  : 'Save Trade Entry'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
