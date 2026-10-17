import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Award,
  TrendingUp,
  TrendingDown,
  Layers,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';
import { Modal } from '../components/ui/Modal.js';

export function StrategyPlaybookPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<any>(null);

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => api.strategies.list(),
  });

  // Strategy form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minRiskReward, setMinRiskReward] = useState(1.5);
  const [entryRulesInput, setEntryRulesInput] = useState('');
  const [stopRulesInput, setStopRulesInput] = useState('');
  const [targetRulesInput, setTargetRulesInput] = useState('');
  const [invalidationInput, setInvalidationInput] = useState('');
  const [checklistInput, setChecklistInput] = useState('');

  const openCreateModal = () => {
    setEditingStrategy(null);
    setName('');
    setDescription('');
    setMinRiskReward(1.5);
    setEntryRulesInput('');
    setStopRulesInput('');
    setTargetRulesInput('');
    setInvalidationInput('');
    setChecklistInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (strat: any) => {
    setEditingStrategy(strat);
    setName(strat.name);
    setDescription(strat.description || '');
    setMinRiskReward(strat.minRiskReward || 1.5);
    setEntryRulesInput(strat.entryRules?.join('\n') || '');
    setStopRulesInput(strat.stopLossRules?.join('\n') || '');
    setTargetRulesInput(strat.targetRules?.join('\n') || '');
    setInvalidationInput(strat.invalidationCriteria?.join('\n') || '');
    setChecklistInput(strat.checklist?.join('\n') || '');
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingStrategy) {
        return api.strategies.update(editingStrategy.id, payload);
      }
      return api.strategies.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.strategies.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      description,
      minRiskReward: Number(minRiskReward) || 1.5,
      entryRules: entryRulesInput.split('\n').map((s) => s.trim()).filter(Boolean),
      stopLossRules: stopRulesInput.split('\n').map((s) => s.trim()).filter(Boolean),
      targetRules: targetRulesInput.split('\n').map((s) => s.trim()).filter(Boolean),
      invalidationCriteria: invalidationInput.split('\n').map((s) => s.trim()).filter(Boolean),
      checklist: checklistInput.split('\n').map((s) => s.trim()).filter(Boolean),
      assetClasses: ['EQUITY', 'FUTURES'],
      timeframes: ['5m', '15m'],
      tags: [],
    };
    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Strategy Playbook
          </h1>
          <p className="text-xs text-muted-foreground">
            Codified rules, invalidation conditions, checklists, and real trade statistical edges
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>New Playbook Setup</span>
        </button>
      </div>

      {/* Strategies Grid */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
          Loading strategies...
        </div>
      ) : strategies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto stroke-[1.5]" />
          <h3 className="text-sm font-semibold text-foreground">No Strategies in Playbook</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Codify your trading edge into concrete setups with strict entry rules, invalidation levels, and checklists.
          </p>
          <button
            onClick={openCreateModal}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow"
          >
            Create First Strategy
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {strategies.map((strat: any) => {
            const isProfitable = (strat.netPnL || 0) >= 0;

            return (
              <div
                key={strat.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm space-y-4 hover:border-emerald-500/30 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-foreground leading-snug">{strat.name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(strat)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded"
                        title="Edit Strategy"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete strategy ${strat.name}?`)) {
                            deleteMutation.mutate(strat.id);
                          }
                        }}
                        className="p-1 text-muted-foreground hover:text-rose-400 rounded"
                        title="Delete Strategy"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {strat.description || 'No description provided.'}
                  </p>

                  {/* Performance badge strip */}
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-accent/20 p-2.5 mt-3 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Net P&L</span>
                      <span className={`font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(strat.netPnL)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Win Rate</span>
                      <span className="font-bold text-foreground">{formatPercent(strat.winRate)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Trades</span>
                      <span className="font-bold text-foreground">{strat.totalTrades || 0}</span>
                    </div>
                  </div>

                  {/* Rules preview */}
                  <div className="mt-4 space-y-2 text-xs">
                    <span className="font-semibold text-foreground text-[11px] block uppercase tracking-wider">
                      Key Entry Criteria
                    </span>
                    <ul className="space-y-1 text-muted-foreground">
                      {strat.entryRules?.slice(0, 3).map((rule: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>Min R:R: {strat.minRiskReward || 1.5}:1</span>
                  <span className="font-mono text-[10px]">
                    {strat.checklist?.length || 0} checklist items
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Creating / Editing Strategy */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStrategy ? 'Edit Strategy Setup' : 'Create Playbook Setup'}
        description="Formalize setup rules, timeframe triggers, checklist confluences, and risk targets"
        maxWidth="2xl"
      >

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Strategy Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. 15-Min Opening Range Breakout"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Min Planned R:R Ratio</label>
                  <input
                    type="number"
                    step="0.1"
                    value={minRiskReward}
                    onChange={(e) => setMinRiskReward(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-muted-foreground mb-1 font-medium">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Core thesis, market condition suitability, and timeframe context"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">
                    Entry Rules (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={entryRulesInput}
                    onChange={(e) => setEntryRulesInput(e.target.value)}
                    placeholder="e.g. Clean 15m breakout close&#10;Volume > 1.5x 20 EMA&#10;Sector aligns"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">
                    Stop Loss & Invalidation Rules
                  </label>
                  <textarea
                    rows={3}
                    value={stopRulesInput}
                    onChange={(e) => setStopRulesInput(e.target.value)}
                    placeholder="e.g. Opposite extreme of range&#10;Two closes back inside range"
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-muted-foreground mb-1 font-medium">
                  Pre-Trade Checklist Items (one per line)
                </label>
                <textarea
                  rows={2}
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  placeholder="e.g. No high-impact news in next 15 mins&#10;Risk is strictly <= 1%&#10;Spread is normal"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
                >
                  {saveMutation.isPending ? 'Saving Setup...' : 'Save Strategy'}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
