import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Calculator,
  ShieldCheck,
  Brain,
  Sliders,
  DollarSign,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  calculateLinearPnL,
  calculateRealizedRMultiple,
  calculateRiskAndPositionSize,
  calculateSimpleExecutionPnL,
} from '@tradevault/financial-engine';
import {
  ASSET_CLASSES,
  CONFLUENCES,
  EMOTIONS,
  MARKET_SEGMENTS,
  MISTAKE_TAGS,
  TRADING_SESSIONS,
} from '@tradevault/shared';
import { api } from '../../lib/api.js';
import { formatCurrency, formatPercent, formatR } from '../../lib/utils.js';

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
    formState: { errors, isSubmitting },
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

      // Simple execution
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

      // Fills for advanced mode
      fills: [],

      // Risk
      risk: {
        plannedEntryPrice: 24000,
        initialStopLoss: 23940,
        plannedTarget: 24150,
        riskBudgetAmount: 2500,
      },

      // Thesis
      thesis: {
        preMarketBias: 'BULLISH',
        marketStructure: 'TRENDING_UP',
        entryRationale: '',
        confluences: ['BOS', 'FVG'],
      },

      // Psychology
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

  const { fields: fillFields, append: appendFill, remove: removeFill } = useFieldArray({
    control,
    name: 'fills',
  });

  // Load initialValues if editing or prefilled from Risk Calculator
  useEffect(() => {
    if (initialValues) {
      reset(initialValues);
      if (initialValues.executionMode) setExecutionMode(initialValues.executionMode);
    } else if (defaultAccountId) {
      setValue('accountId', defaultAccountId);
    }
  }, [initialValues, defaultAccountId, reset, setValue]);

  // Watch form fields for live calculation preview
  const watchedDirection = watch('direction') || 'LONG';
  const watchedSimple = watch('simpleExecution');
  const watchedRisk = watch('risk');
  const watchedSymbol = watch('symbol');

  // Auto-fill instrument multipliers & lot size when symbol changes
  const handleSymbolSelect = (sym: string) => {
    setValue('symbol', sym.toUpperCase());
    const matched = instruments.find((i: any) => i.symbol.toUpperCase() === sym.toUpperCase());
    if (matched) {
      setValue('assetClass', matched.assetClass);
      setValue('exchange', matched.exchange);
      setValue('marketSegment', matched.marketSegment);
      setValue('simpleExecution.contractMultiplier', matched.contractMultiplier);
      setValue('simpleExecution.quantity', matched.lotSize);
    }
  };

  // Live P&L Calculation Preview
  let previewGrossPnL = 0;
  let previewTotalCosts = 0;
  let previewNetPnL = 0;
  let previewOutcome = 'OPEN';
  let previewRealizedR: number | undefined = undefined;

  try {
    if (watchedSimple?.entryPrice && watchedSimple?.quantity) {
      const pnlRes = calculateSimpleExecutionPnL(watchedDirection, {
        entryPrice: Number(watchedSimple.entryPrice) || 0,
        exitPrice: watchedSimple.exitPrice ? Number(watchedSimple.exitPrice) : undefined,
        quantity: Number(watchedSimple.quantity) || 1,
        contractMultiplier: Number(watchedSimple.contractMultiplier) || 1,
        brokerage: Number(watchedSimple.brokerage) || 0,
        exchangeFees: Number(watchedSimple.exchangeFees) || 0,
        regulatoryFees: Number(watchedSimple.regulatoryFees) || 0,
        taxes: Number(watchedSimple.taxes) || 0,
        otherFees: Number(watchedSimple.otherFees) || 0,
        explicitAdjustments: Number(watchedSimple.explicitAdjustments) || 0,
      });

      previewGrossPnL = pnlRes.grossPnLNumber;
      previewTotalCosts = pnlRes.totalCostsNumber;
      previewNetPnL = pnlRes.netPnLNumber;
      previewOutcome = pnlRes.outcome;

      let riskBudget = Number(watchedRisk?.riskBudgetAmount);
      if (!riskBudget && watchedRisk?.plannedEntryPrice && watchedRisk?.initialStopLoss) {
        riskBudget =
          Math.abs(Number(watchedRisk.plannedEntryPrice) - Number(watchedRisk.initialStopLoss)) *
          (Number(watchedSimple.quantity) || 1) *
          (Number(watchedSimple.contractMultiplier) || 1);
      }
      previewRealizedR = calculateRealizedRMultiple(previewNetPnL, riskBudget);
    }
  } catch (err) {
    // Gracefully handle incomplete input during typing
  }

  // Mutation for creating/updating trade
  const tradeMutation = useMutation({
    mutationFn: async (formData: any) => {
      // Format tags from comma-separated input
      const tags = formData.tagsInput
        ? formData.tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];

      const payload = {
        ...formData,
        tags,
        executionMode,
        simpleExecution: {
          ...formData.simpleExecution,
          entryPrice: Number(formData.simpleExecution.entryPrice),
          exitPrice: formData.simpleExecution.exitPrice ? Number(formData.simpleExecution.exitPrice) : undefined,
          quantity: Number(formData.simpleExecution.quantity),
          contractMultiplier: Number(formData.simpleExecution.contractMultiplier) || 1,
          brokerage: Number(formData.simpleExecution.brokerage) || 0,
          exchangeFees: Number(formData.simpleExecution.exchangeFees) || 0,
          regulatoryFees: Number(formData.simpleExecution.regulatoryFees) || 0,
          taxes: Number(formData.simpleExecution.taxes) || 0,
          otherFees: Number(formData.simpleExecution.otherFees) || 0,
          explicitAdjustments: Number(formData.simpleExecution.explicitAdjustments) || 0,
        },
        risk: {
          ...formData.risk,
          plannedEntryPrice: formData.risk.plannedEntryPrice ? Number(formData.risk.plannedEntryPrice) : undefined,
          initialStopLoss: formData.risk.initialStopLoss ? Number(formData.risk.initialStopLoss) : undefined,
          plannedTarget: formData.risk.plannedTarget ? Number(formData.risk.plannedTarget) : undefined,
          riskBudgetAmount: formData.risk.riskBudgetAmount ? Number(formData.risk.riskBudgetAmount) : undefined,
        },
      };

      if (editTradeId) {
        return api.trades.update(editTradeId, payload);
      }
      return api.trades.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      onClose();
    },
  });

  const onSubmit = (data: any) => {
    tradeMutation.mutate(data);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {editTradeId ? 'Edit Trade Record' : 'Manual Trade Entry'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Log execution parameters, thesis, risk budget, and psychology
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live Calculation Preview Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-border bg-accent/30 px-6 py-3 text-xs font-mono">
          <div>
            <span className="text-muted-foreground block text-[10px] font-sans">Direction</span>
            <span className={watchedDirection === 'LONG' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {watchedDirection}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] font-sans">Gross P&L</span>
            <span className={`font-semibold ${previewGrossPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(previewGrossPnL)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] font-sans">Total Costs</span>
            <span className="text-muted-foreground font-semibold">
              {formatCurrency(previewTotalCosts)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] font-sans">Net P&L</span>
            <span className={`font-bold ${previewNetPnL > 0 ? 'text-emerald-400' : previewNetPnL < 0 ? 'text-rose-400' : 'text-muted-foreground'}`}>
              {formatCurrency(previewNetPnL)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] font-sans">Realized R</span>
            <span className="font-bold text-foreground">
              {formatR(previewRealizedR)}
            </span>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-border px-6 bg-card">
          {[
            { id: 'IDENTITY', label: '1. Identity', icon: Sliders },
            { id: 'EXECUTION', label: '2. Execution', icon: DollarSign },
            { id: 'RISK', label: '3. Risk', icon: ShieldCheck },
            { id: 'THESIS', label: '4. Thesis', icon: Calculator },
            { id: 'PSYCHOLOGY', label: '5. Psychology', icon: Brain },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400'
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: TRADE IDENTITY */}
          {activeTab === 'IDENTITY' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Trading Account *
                  </label>
                  <select
                    {...register('accountId', { required: 'Account is required' })}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.broker})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Direction *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setValue('direction', 'LONG')}
                      className={`h-10 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        watchedDirection === 'LONG'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <TrendingUp className="h-4 w-4" /> LONG (BUY)
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('direction', 'SHORT')}
                      className={`h-10 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        watchedDirection === 'SHORT'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <TrendingDown className="h-4 w-4" /> SHORT (SELL)
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Symbol / Ticker *
                  </label>
                  <input
                    type="text"
                    {...register('symbol', { required: 'Symbol is required' })}
                    onChange={(e) => handleSymbolSelect(e.target.value)}
                    placeholder="e.g. NIFTY, CRUDEOIL"
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold uppercase focus:ring-1 focus:ring-emerald-500"
                  />
                  {/* Quick Preset Buttons */}
                  <div className="flex gap-1.5 mt-1.5 overflow-x-auto pb-1">
                    {['NIFTY', 'BANKNIFTY', 'RELIANCE', 'CRUDEOIL', 'GOLD'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSymbolSelect(s)}
                        className="rounded bg-accent/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Asset Class
                  </label>
                  <select
                    {...register('assetClass')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    {ASSET_CLASSES.map((ac) => (
                      <option key={ac.value} value={ac.value}>
                        {ac.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Market Segment
                  </label>
                  <select
                    {...register('marketSegment')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    {MARKET_SEGMENTS.map((ms) => (
                      <option key={ms.value} value={ms.value}>
                        {ms.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Strategy Playbook
                  </label>
                  <select
                    {...register('strategyId')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">No Strategy (Discretionary)</option>
                    {strategies.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Trade Status
                  </label>
                  <select
                    {...register('status')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="CLOSED">CLOSED (Completed Trade)</option>
                    <option value="OPEN">OPEN (Currently Active)</option>
                    <option value="PLANNED">PLANNED (Upcoming Setup)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Trading Session
                  </label>
                  <select
                    {...register('session')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    {TRADING_SESSIONS.map((sess) => (
                      <option key={sess.value} value={sess.value}>
                        {sess.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Trade Date *
                  </label>
                  <input
                    type="date"
                    {...register('tradeDate', { required: true })}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Entry Time
                  </label>
                  <input
                    type="datetime-local"
                    {...register('entryTime')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Exit Time
                  </label>
                  <input
                    type="datetime-local"
                    {...register('exitTime')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Trade Title / Description
                </label>
                <input
                  type="text"
                  {...register('tradeTitle')}
                  placeholder="e.g. Nifty 15m Morning ORB Breakout"
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  {...register('tagsInput')}
                  placeholder="Breakout, TrendDay, A-Plus-Setup"
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: EXECUTION DETAILS */}
          {activeTab === 'EXECUTION' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-semibold text-foreground">Execution Mode</span>
                <div className="flex rounded-lg border border-border p-1 bg-background text-xs">
                  <button
                    type="button"
                    onClick={() => setExecutionMode('SIMPLE')}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                      executionMode === 'SIMPLE'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Simple Mode (Average Prices)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecutionMode('ADVANCED')}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                      executionMode === 'ADVANCED'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Advanced Mode (Multi-Fill / Partial Exits)
                  </button>
                </div>
              </div>

              {executionMode === 'SIMPLE' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Entry Price *
                      </label>
                      <input
                        type="number"
                        step="any"
                        {...register('simpleExecution.entryPrice', { required: true })}
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Exit Price
                      </label>
                      <input
                        type="number"
                        step="any"
                        {...register('simpleExecution.exitPrice')}
                        placeholder="Leave empty if open"
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        step="any"
                        {...register('simpleExecution.quantity', { required: true })}
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Contract Multiplier
                      </label>
                      <input
                        type="number"
                        step="any"
                        {...register('simpleExecution.contractMultiplier')}
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4 bg-accent/10 space-y-3">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Trading Costs & Charges Breakdown
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Brokerage</label>
                        <input
                          type="number"
                          step="any"
                          {...register('simpleExecution.brokerage')}
                          className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Exchange Fees</label>
                        <input
                          type="number"
                          step="any"
                          {...register('simpleExecution.exchangeFees')}
                          className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Taxes (STT / GST)</label>
                        <input
                          type="number"
                          step="any"
                          {...register('simpleExecution.taxes')}
                          className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">Other / Stamp</label>
                        <input
                          type="number"
                          step="any"
                          {...register('simpleExecution.otherFees')}
                          className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ADVANCED MODE (FILLS) */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Execution Fills (FIFO Matched)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        appendFill({
                          fillId: `fill-${Date.now()}`,
                          type: 'ENTRY',
                          price: 100,
                          quantity: 10,
                          timestamp: new Date().toISOString(),
                          fee: 10,
                        })
                      }
                      className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Fill
                    </button>
                  </div>

                  {fillFields.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      No fills added yet. Click &quot;Add Fill&quot; to log individual entries and partial exits.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {fillFields.map((field, idx) => (
                        <div
                          key={field.id}
                          className="grid grid-cols-1 sm:grid-cols-6 gap-2 rounded-lg border border-border bg-background p-2.5 items-center text-xs"
                        >
                          <div>
                            <select
                              {...register(`fills.${idx}.type` as const)}
                              className="w-full h-8 rounded border border-border bg-card px-2 font-semibold text-xs"
                            >
                              <option value="ENTRY">ENTRY (Buy/Short)</option>
                              <option value="EXIT">EXIT (Cover/Sell)</option>
                            </select>
                          </div>
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Price"
                              {...register(`fills.${idx}.price` as const)}
                              className="w-full h-8 rounded border border-border bg-card px-2 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Qty"
                              {...register(`fills.${idx}.quantity` as const)}
                              className="w-full h-8 rounded border border-border bg-card px-2 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Fee"
                              {...register(`fills.${idx}.fee` as const)}
                              className="w-full h-8 rounded border border-border bg-card px-2 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <input
                              type="datetime-local"
                              {...register(`fills.${idx}.timestamp` as const)}
                              className="w-full h-8 rounded border border-border bg-card px-2 text-xs"
                            />
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeFill(idx)}
                              className="text-muted-foreground hover:text-rose-400 p-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RISK MANAGEMENT */}
          {activeTab === 'RISK' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Planned Entry Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    {...register('risk.plannedEntryPrice')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Initial Stop Loss *
                  </label>
                  <input
                    type="number"
                    step="any"
                    {...register('risk.initialStopLoss')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Planned Profit Target
                  </label>
                  <input
                    type="number"
                    step="any"
                    {...register('risk.plannedTarget')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Risk Budget Amount (INR / USD)
                </label>
                <input
                  type="number"
                  step="any"
                  {...register('risk.riskBudgetAmount')}
                  placeholder="e.g. 2500"
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Used for calculating realized R-multiples and verifying rule compliance.
                </span>
              </div>
            </div>
          )}

          {/* TAB 4: TRADE THESIS */}
          {activeTab === 'THESIS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Pre-Market Bias
                  </label>
                  <select
                    {...register('thesis.preMarketBias')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="BULLISH">BULLISH</option>
                    <option value="BEARISH">BEARISH</option>
                    <option value="NEUTRAL">NEUTRAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Market Structure
                  </label>
                  <select
                    {...register('thesis.marketStructure')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="TRENDING_UP">Trending Up (Bullish Structure)</option>
                    <option value="TRENDING_DOWN">Trending Down (Bearish Structure)</option>
                    <option value="RANGING">Ranging / Consolidating</option>
                    <option value="VOLATILE">High Volatility Expansion</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Entry Rationale / Technical Thesis
                </label>
                <textarea
                  {...register('thesis.entryRationale')}
                  rows={3}
                  placeholder="Why did you take this setup? What confirmed the entry?"
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Technical Confluences Checklist */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Technical Confluences Present
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CONFLUENCES.map((c) => (
                    <label
                      key={c.value}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-2 text-xs hover:bg-accent cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        value={c.value}
                        {...register('thesis.confluences')}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PSYCHOLOGY & DISCIPLINE */}
          {activeTab === 'PSYCHOLOGY' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Emotion Before Entry
                  </label>
                  <select
                    {...register('psychology.emotionBefore')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    {EMOTIONS.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Emotion During Trade
                  </label>
                  <select
                    {...register('psychology.emotionDuring')}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  >
                    {EMOTIONS.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Discipline Score (1-5) *
                  </label>
                  <select
                    {...register('psychology.disciplineScore', { valueAsNumber: true })}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={5}>5 - Flawless Execution</option>
                    <option value={4}>4 - Good Execution</option>
                    <option value={3}>3 - Acceptable / Hesitated</option>
                    <option value={2}>2 - Rule Violation</option>
                    <option value={1}>1 - Completely Undisciplined</option>
                  </select>
                </div>
              </div>

              {/* Checklist & Rule compliance checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-xs cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    {...register('psychology.rulesFollowed')}
                    className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-semibold block text-foreground">Followed Trading Rules</span>
                    <span className="text-[11px] text-muted-foreground">Executed according to playbook rules</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-xs cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    {...register('psychology.checklistCompleted')}
                    className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-semibold block text-foreground">Completed Pre-Trade Checklist</span>
                    <span className="text-[11px] text-muted-foreground">Checked spreads, news, and risk budget</span>
                  </div>
                </label>
              </div>

              {/* Mistake Flags */}
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
                <span className="text-xs font-semibold text-rose-400 block uppercase tracking-wider">
                  Discipline Violations & Mistakes
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('psychology.revengeTrading')}
                      className="rounded text-rose-500 focus:ring-rose-500"
                    />
                    <span>Revenge Trading</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('psychology.overtrading')}
                      className="rounded text-rose-500 focus:ring-rose-500"
                    />
                    <span>Overtrading</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('psychology.prematureExit')}
                      className="rounded text-rose-500 focus:ring-rose-500"
                    />
                    <span>Premature Exit</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('psychology.stopLossMoved')}
                      className="rounded text-rose-500 focus:ring-rose-500"
                    />
                    <span>Moved Stop Loss</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('psychology.positionSizeViolation')}
                      className="rounded text-rose-500 focus:ring-rose-500"
                    />
                    <span>Sizing Violation</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Lessons Learned & Post-Trade Notes
                </label>
                <textarea
                  {...register('psychology.notes')}
                  rows={2}
                  placeholder="What did you learn from this trade? What will you do better next time?"
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-2">
              {activeTab !== 'IDENTITY' && (
                <button
                  type="button"
                  onClick={() => {
                    const tabs: any[] = ['IDENTITY', 'EXECUTION', 'RISK', 'THESIS', 'PSYCHOLOGY'];
                    const idx = tabs.indexOf(activeTab);
                    if (idx > 0) setActiveTab(tabs[idx - 1]);
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Previous
                </button>
              )}
              {activeTab !== 'PSYCHOLOGY' && (
                <button
                  type="button"
                  onClick={() => {
                    const tabs: any[] = ['IDENTITY', 'EXECUTION', 'RISK', 'THESIS', 'PSYCHOLOGY'];
                    const idx = tabs.indexOf(activeTab);
                    if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Next Tab
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || tradeMutation.isPending}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 transition-all"
              >
                {tradeMutation.isPending ? 'Saving Trade...' : editTradeId ? 'Update Trade' : 'Save Trade Entry'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
