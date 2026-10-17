import React from 'react';
import { UseFormRegister, UseFormWatch } from 'react-hook-form';
import { formatCurrency, formatPercent } from '../../../lib/utils.js';

interface TradeRiskTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
}

export function TradeRiskTab({ register, watch }: TradeRiskTabProps) {
  const plannedEntry = watch('risk.plannedEntryPrice') || watch('simpleExecution.entryPrice') || 0;
  const stopLoss = watch('risk.initialStopLoss') || 0;
  const target = watch('risk.plannedTarget') || 0;
  const riskBudget = watch('risk.riskBudgetAmount') || 0;
  const quantity = watch('simpleExecution.quantity') || 1;
  const multiplier = watch('simpleExecution.contractMultiplier') || 1;

  const stopDistance = Math.abs(plannedEntry - stopLoss);
  const potentialLoss = stopDistance * quantity * multiplier;
  const rewardDistance = target > 0 ? Math.abs(target - plannedEntry) : 0;
  const potentialReward = rewardDistance * quantity * multiplier;
  const rewardToRisk = potentialLoss > 0 ? Number((potentialReward / potentialLoss).toFixed(2)) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Planned Entry Price
          </label>
          <input
            type="number"
            step="any"
            {...register('risk.plannedEntryPrice', { valueAsNumber: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Initial Stop-Loss Price
          </label>
          <input
            type="number"
            step="any"
            {...register('risk.initialStopLoss', { valueAsNumber: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Planned Profit Target
          </label>
          <input
            type="number"
            step="any"
            {...register('risk.plannedTarget', { valueAsNumber: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Risk Budget Amount
          </label>
          <input
            type="number"
            step="any"
            {...register('risk.riskBudgetAmount', { valueAsNumber: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Calculated Risk/Reward Card */}
      <div className="rounded-xl border border-border bg-card/60 p-4 font-mono text-xs space-y-3">
        <span className="text-foreground font-semibold uppercase text-[11px] block">
          Risk Parameter Calculations
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-muted-foreground">
          <div className="bg-background p-2.5 rounded-lg border border-border">
            <span className="block text-[10px] uppercase">Stop Distance</span>
            <span className="text-foreground font-bold text-sm">{stopDistance.toFixed(2)} pts</span>
          </div>

          <div className="bg-background p-2.5 rounded-lg border border-border">
            <span className="block text-[10px] uppercase">Potential Loss at Stop</span>
            <span className="text-rose-400 font-bold text-sm">{formatCurrency(potentialLoss)}</span>
          </div>

          <div className="bg-background p-2.5 rounded-lg border border-border">
            <span className="block text-[10px] uppercase">Potential Target Gain</span>
            <span className="text-emerald-400 font-bold text-sm">{formatCurrency(potentialReward)}</span>
          </div>

          <div className="bg-background p-2.5 rounded-lg border border-border">
            <span className="block text-[10px] uppercase">Planned Reward:Risk</span>
            <span className="text-foreground font-bold text-sm">
              {rewardToRisk > 0 ? `1 : ${rewardToRisk}` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
