import React from 'react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { CONFLUENCES } from '@tradevault/shared';

interface TradeThesisTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

export function TradeThesisTab({ register, watch, setValue }: TradeThesisTabProps) {
  const selectedConfluences: string[] = watch('thesis.confluences') || [];

  const handleToggleConfluence = (item: string) => {
    if (selectedConfluences.includes(item)) {
      setValue(
        'thesis.confluences',
        selectedConfluences.filter((c) => c !== item)
      );
    } else {
      setValue('thesis.confluences', [...selectedConfluences, item]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Pre-Market Bias
          </label>
          <select
            {...register('thesis.preMarketBias')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="TRENDING_UP">TRENDING UP (Higher Highs / Higher Lows)</option>
            <option value="TRENDING_DOWN">TRENDING DOWN (Lower Highs / Lower Lows)</option>
            <option value="RANGING">RANGING / CONSOLIDATION</option>
            <option value="EXPANDING">EXPANDING RANGE</option>
          </select>
        </div>
      </div>

      {/* Technical Confluences Checklist */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Technical Confluences & Setup Confirmation
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {CONFLUENCES.map((conf) => {
            const isChecked = selectedConfluences.includes(conf.value);
            return (
              <button
                type="button"
                key={conf.value}
                onClick={() => handleToggleConfluence(conf.value)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                  isChecked
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 font-semibold'
                    : 'bg-card border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded flex items-center justify-center border ${
                    isChecked ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-border'
                  }`}
                >
                  {isChecked && '✓'}
                </div>
                <span>{conf.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Entry Rationale */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Entry Rationale & Setup Details
        </label>
        <textarea
          rows={3}
          {...register('thesis.entryRationale')}
          placeholder="Describe what confirmed the trade: liquidity sweep of previous day high, 5m fair value gap tap, break of structure on 1m chart..."
          className="w-full rounded-lg border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Invalidation Conditions */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Invalidation Criteria
        </label>
        <input
          type="text"
          {...register('thesis.invalidationConditions')}
          placeholder="e.g. 5m candle close below 23,940 swing low"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>
    </div>
  );
}
