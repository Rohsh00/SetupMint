import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calculator,
  Shield,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { calculateRiskAndPositionSize } from '@tradevault/financial-engine';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';

export function RiskCalculatorPage() {
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });
  const { data: instruments = [] } = useQuery({ queryKey: ['instruments'], queryFn: () => api.instruments.list() });

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
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

  const handleTransferToTrade = () => {
    setPrefilledTradeData({
      accountId: selectedAccountId,
      symbol: selectedSymbol,
      direction,
      status: 'OPEN',
      executionMode: 'SIMPLE',
      tradeDate: new Date().toISOString().split('T')[0],
      entryTime: new Date().toISOString().slice(0, 16),
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
    setIsTradeModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Position Size & Risk Calculator
        </h1>
        <p className="text-xs text-muted-foreground">
          Calculate mathematically exact lot-rounded quantities and reward-to-risk ratios before entering the market
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Parameters Column (7 Cols) */}
        <div className="lg:col-span-7 rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Calculator className="h-4 w-4 text-emerald-400" /> Account & Trade Parameters
          </h3>

          {/* Account Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Trading Account</label>
              <select
                value={selectedAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
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
              <label className="block text-muted-foreground mb-1 font-medium">Account Equity (INR / USD)</label>
              <input
                type="number"
                value={accountEquity}
                onChange={(e) => setAccountEquity(Number(e.target.value))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Risk Budget Mode */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">Risk Budget Allocation</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRiskMode('PERCENT')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  riskMode === 'PERCENT'
                    ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                Percentage of Equity (% Risk)
              </button>
              <button
                type="button"
                onClick={() => setRiskMode('FIXED')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  riskMode === 'FIXED'
                    ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                Fixed Monetary Amount (₹ / $)
              </button>
            </div>

            {riskMode === 'PERCENT' ? (
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-28 h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-xs text-muted-foreground">
                  % of equity ={' '}
                  <strong className="text-foreground font-mono">
                    {formatCurrency((accountEquity * riskPercent) / 100)}
                  </strong>{' '}
                  budget
                </span>
              </div>
            ) : (
              <div className="pt-1">
                <input
                  type="number"
                  step="100"
                  value={fixedRiskAmount}
                  onChange={(e) => setFixedRiskAmount(Number(e.target.value))}
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Instrument & Direction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Instrument Symbol</label>
              <input
                type="text"
                value={selectedSymbol}
                onChange={(e) => handleSymbolChange(e.target.value.toUpperCase())}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-bold uppercase font-mono focus:ring-1 focus:ring-emerald-500"
              />
              <div className="flex gap-1.5 mt-1.5 overflow-x-auto">
                {['NIFTY', 'BANKNIFTY', 'RELIANCE', 'CRUDEOIL', 'GOLD'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSymbolChange(s)}
                    className="rounded bg-accent/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Trade Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('LONG')}
                  className={`h-10 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    direction === 'LONG'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <TrendingUp className="h-4 w-4" /> LONG
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SHORT')}
                  className={`h-10 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    direction === 'SHORT'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <TrendingDown className="h-4 w-4" /> SHORT
                </button>
              </div>
            </div>
          </div>

          {/* Pricing parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Entry Price *</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Stop-Loss Price *</label>
              <input
                type="number"
                step="any"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(Number(e.target.value))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Profit Target Price</label>
              <input
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Number(e.target.value))}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Multipliers & Lot Size */}
          <div className="grid grid-cols-3 gap-3 text-xs font-mono rounded-lg border border-border bg-accent/10 p-3">
            <div>
              <label className="block text-[11px] text-muted-foreground font-sans mb-1">Contract Multiplier</label>
              <input
                type="number"
                step="any"
                value={contractMultiplier}
                onChange={(e) => setContractMultiplier(Number(e.target.value))}
                className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground font-sans mb-1">Lot Size</label>
              <input
                type="number"
                step="any"
                value={lotSize}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLotSize(val);
                  setQuantityIncrement(val);
                }}
                className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground font-sans mb-1">Est. Fees (INR)</label>
              <input
                type="number"
                step="any"
                value={estimatedCosts}
                onChange={(e) => setEstimatedCosts(Number(e.target.value))}
                className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Output & Sizing Summary Column (5 Cols) */}
        <div className="lg:col-span-5 rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
              <Shield className="h-4 w-4 text-emerald-400" /> Sizing & Risk Verdict
            </h3>

            {/* Warnings list */}
            {calcResult.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 my-4 space-y-1">
                {calcResult.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Sizing Results Grid */}
            <div className="space-y-4 pt-3 font-mono text-xs">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                <span className="text-[11px] font-sans text-muted-foreground uppercase tracking-wider block">
                  Suggested Valid Lot Quantity
                </span>
                <span className="text-3xl font-extrabold text-emerald-400 mt-1 block">
                  {calcResult.roundedLotQuantity}
                </span>
                <span className="text-[11px] text-muted-foreground font-sans block mt-1">
                  (Raw: {calcResult.rawSuggestedQuantity} • Rounded down to lot of {lotSize})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground font-sans block">Planned Risk Budget</span>
                  <span className="text-base font-bold text-foreground">
                    {formatCurrency(calcResult.plannedRiskAmount)}
                  </span>
                </div>
                <div className="rounded-lg bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground font-sans block">Est. Loss at Stop</span>
                  <span className="text-base font-bold text-rose-400">
                    {formatCurrency(calcResult.estimatedMonetaryLoss)}
                  </span>
                </div>
                <div className="rounded-lg bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground font-sans block">Estimated Reward</span>
                  <span className="text-base font-bold text-emerald-400">
                    {formatCurrency(calcResult.estimatedReward)}
                  </span>
                </div>
                <div className="rounded-lg bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground font-sans block">Reward-to-Risk (R:R)</span>
                  <span className="text-base font-bold text-foreground">
                    {calcResult.rewardRiskRatio ? `${calcResult.rewardRiskRatio}:1` : '—'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 text-[11px] font-sans text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Stop Loss Distance:</span>
                  <span className="font-mono text-foreground">{calcResult.stopLossDistance} points</span>
                </div>
                <div className="flex justify-between">
                  <span>Actual Risk % of Equity:</span>
                  <span className="font-mono text-foreground">{formatPercent(calcResult.actualRiskPercentage)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transfer button */}
          <div className="pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleTransferToTrade}
              disabled={calcResult.roundedLotQuantity <= 0 || calcResult.isStopDistanceZero}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-3 text-sm shadow-md transition-all"
            >
              <Sparkles className="h-4 w-4" />
              <span>Transfer to Trade Form</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Manual Trade Entry Modal pre-filled */}
      <TradeFormModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        initialValues={prefilledTradeData}
      />
    </div>
  );
}
