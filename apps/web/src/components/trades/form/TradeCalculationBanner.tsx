import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShieldCheck, AlertCircle } from 'lucide-react';
import { formatCurrency, formatPercent, formatR } from '../../../lib/utils.js';
import { TradeOutcome } from '@tradevault/shared';

interface TradeCalculationBannerProps {
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  outcome: TradeOutcome;
  realizedR?: number;
  plannedRisk?: number;
  status: string;
  isDirectionValid?: boolean;
}

export function TradeCalculationBanner({
  grossPnL,
  totalCosts,
  netPnL,
  outcome,
  realizedR,
  plannedRisk,
  status,
  isDirectionValid = true,
}: TradeCalculationBannerProps) {
  const isNetPositive = netPnL > 0;
  const isNetNegative = netPnL < 0;

  return (
    <div
      className={`rounded-xl border p-4 transition-all shadow-sm ${
        isNetPositive
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : isNetNegative
          ? 'bg-rose-500/10 border-rose-500/30'
          : 'bg-card border-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* P&L Block */}
        <div className="flex items-center gap-4">
          <div
            className={`p-2.5 rounded-lg border ${
              isNetPositive
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isNetNegative
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                : 'bg-accent text-muted-foreground border-border'
            }`}
          >
            {isNetPositive ? (
              <TrendingUp className="h-5 w-5" />
            ) : isNetNegative ? (
              <TrendingDown className="h-5 w-5" />
            ) : (
              <DollarSign className="h-5 w-5" />
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {status === 'CLOSED' ? 'Realized Net P&L' : 'Status / Estimated P&L'}
            </div>
            <div
              className={`text-2xl font-bold font-mono tracking-tight ${
                isNetPositive ? 'text-emerald-400' : isNetNegative ? 'text-rose-400' : 'text-foreground'
              }`}
            >
              {formatCurrency(netPnL)}
            </div>
          </div>
        </div>

        {/* Metrics Pill Grid */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="bg-background/80 px-3 py-1.5 rounded-md border border-border">
            <span className="text-muted-foreground text-[10px] block uppercase">Gross P&L</span>
            <span className={grossPnL >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {formatCurrency(grossPnL)}
            </span>
          </div>

          <div className="bg-background/80 px-3 py-1.5 rounded-md border border-border">
            <span className="text-muted-foreground text-[10px] block uppercase">Total Costs</span>
            <span className="text-muted-foreground font-semibold">
              {formatCurrency(totalCosts)}
            </span>
          </div>

          <div className="bg-background/80 px-3 py-1.5 rounded-md border border-border">
            <span className="text-muted-foreground text-[10px] block uppercase">Outcome</span>
            <span
              className={`font-semibold ${
                outcome === 'WIN'
                  ? 'text-emerald-400'
                  : outcome === 'LOSS'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {outcome}
            </span>
          </div>

          {realizedR !== undefined && (
            <div className="bg-background/80 px-3 py-1.5 rounded-md border border-border">
              <span className="text-muted-foreground text-[10px] block uppercase">Realized R</span>
              <span className={realizedR >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {formatR(realizedR)}
              </span>
            </div>
          )}

          {plannedRisk !== undefined && plannedRisk > 0 && (
            <div className="bg-background/80 px-3 py-1.5 rounded-md border border-border">
              <span className="text-muted-foreground text-[10px] block uppercase">Risk Budget</span>
              <span className="text-foreground font-semibold">
                {formatCurrency(plannedRisk)}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isDirectionValid && (
        <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5 font-medium">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Warning: Stop-loss is on the invalid side for the chosen direction.</span>
        </div>
      )}
    </div>
  );
}
