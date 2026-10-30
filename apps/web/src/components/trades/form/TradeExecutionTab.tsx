import React from 'react';
import { UseFormRegister, UseFormWatch, UseFieldArrayReturn } from 'react-hook-form';
import { Plus, Trash2, Sliders } from 'lucide-react';
import { formatCurrency, currentLocalIsoDateTime } from '../../../lib/utils.js';
import { HelpHint } from '../../help/index.js';

interface TradeExecutionTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  executionMode: 'SIMPLE' | 'ADVANCED';
  setExecutionMode: (mode: 'SIMPLE' | 'ADVANCED') => void;
  fillsFieldArray: UseFieldArrayReturn<any, 'fills'>;
}

export function TradeExecutionTab({
  register,
  watch,
  executionMode,
  setExecutionMode,
  fillsFieldArray,
}: TradeExecutionTabProps) {
  const { fields, append, remove } = fillsFieldArray;

  const handleAddFill = (type: 'ENTRY' | 'EXIT') => {
    append({
      fillId: `fill-${Date.now()}`,
      type,
      price: watch('simpleExecution.entryPrice') || 100,
      quantity: 1,
      timestamp: currentLocalIsoDateTime(),
      fee: 20,
      notes: '',
    });
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div>
          <span className="text-xs font-semibold text-foreground">Execution Workflow Mode</span>
          <p className="text-[11px] text-muted-foreground">
            Simple mode for completed trades; Advanced mode for multi-fill scaling and partial exits
          </p>
        </div>

        <div className="flex rounded-lg border border-border bg-card p-1 text-xs">
          <button
            type="button"
            onClick={() => setExecutionMode('SIMPLE')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              executionMode === 'SIMPLE'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Simple Mode
          </button>
          <button
            type="button"
            onClick={() => setExecutionMode('ADVANCED')}
            className={`px-3 py-1 rounded-md font-medium transition-all inline-flex items-center gap-1 ${
              executionMode === 'ADVANCED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Advanced Fills (FIFO)
            <HelpHint hintKey="trade.form.fifo" />
          </button>
        </div>
      </div>

      {executionMode === 'SIMPLE' ? (
        /* SIMPLE MODE */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Entry Price <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                {...register('simpleExecution.entryPrice', { valueAsNumber: true, required: true })}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Exit Price (Leave blank if Open)
              </label>
              <input
                type="number"
                step="any"
                {...register('simpleExecution.exitPrice', { valueAsNumber: true })}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                {...register('simpleExecution.quantity', { valueAsNumber: true, required: true })}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center mb-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Contract Multiplier
                </label>
                <HelpHint hintKey="trade.form.multiplier" />
              </div>
              <input
                type="number"
                step="any"
                {...register('simpleExecution.contractMultiplier', { valueAsNumber: true })}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Transaction Costs Section */}
          <div className="pt-3 border-t border-border">
            <div className="flex items-center mb-2">
              <span className="text-xs font-semibold text-foreground">
                Trading Costs & Fee Breakdown
              </span>
              <HelpHint hintKey="trade.fees.autoManual" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Brokerage</label>
                <input
                  type="number"
                  step="any"
                  {...register('simpleExecution.brokerage', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Exchange Fees</label>
                <input
                  type="number"
                  step="any"
                  {...register('simpleExecution.exchangeFees', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">STT / Taxes</label>
                <input
                  type="number"
                  step="any"
                  {...register('simpleExecution.taxes', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Regulatory Fees</label>
                <input
                  type="number"
                  step="any"
                  {...register('simpleExecution.regulatoryFees', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Other Fees</label>
                <input
                  type="number"
                  step="any"
                  {...register('simpleExecution.otherFees', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Adjustments (±)</label>
                <input
                  type="number"
                  step="any"
                  {...register('simpleExecution.explicitAdjustments', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ADVANCED FILLS MODE */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Add individual execution fills. They will be matched in chronological FIFO sequence.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddFill('ENTRY')}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-600/30"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Entry Fill</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddFill('EXIT')}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs font-medium hover:bg-rose-600/30"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Exit Fill</span>
              </button>
            </div>
          </div>

          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              No fills recorded yet. Click &quot;Add Entry Fill&quot; to begin building your trade timeline.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs text-left">
                <thead className="bg-card/80 text-muted-foreground uppercase text-[10px] font-semibold border-b border-border">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Fee</th>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fields.map((field, index) => {
                    const fillType = watch(`fills.${index}.type`);
                    return (
                      <tr key={field.id} className="hover:bg-accent/30 font-mono">
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              fillType === 'ENTRY'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {fillType}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="any"
                            {...register(`fills.${index}.price`, { valueAsNumber: true })}
                            className="w-24 rounded border border-border bg-card px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="any"
                            {...register(`fills.${index}.quantity`, { valueAsNumber: true })}
                            className="w-20 rounded border border-border bg-card px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="any"
                            {...register(`fills.${index}.fee`, { valueAsNumber: true })}
                            className="w-16 rounded border border-border bg-card px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="datetime-local"
                            {...register(`fills.${index}.timestamp`)}
                            className="rounded border border-border bg-card px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="p-1 text-muted-foreground hover:text-rose-400"
                            aria-label="Remove fill"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
