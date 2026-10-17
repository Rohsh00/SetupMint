import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, Edit, Trash2, CheckCircle2, Shield, X, Search } from 'lucide-react';
import { ASSET_CLASSES, MARKET_SEGMENTS } from '@tradevault/shared';
import { api } from '../lib/api.js';
import { Modal } from '../components/ui/Modal.js';

export function InstrumentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New instrument state
  const [symbol, setSymbol] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [assetClass, setAssetClass] = useState('EQUITY');
  const [exchange, setExchange] = useState('NSE');
  const [marketSegment, setMarketSegment] = useState('NSE_EQ');
  const [quoteCurrency, setQuoteCurrency] = useState('INR');
  const [contractMultiplier, setContractMultiplier] = useState<number>(1);
  const [lotSize, setLotSize] = useState<number>(1);
  const [tickSize, setTickSize] = useState<number>(0.05);
  const [pricePrecision, setPricePrecision] = useState<number>(2);

  const { data: instruments = [], isLoading } = useQuery({
    queryKey: ['instruments'],
    queryFn: () => api.instruments.list(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.instruments.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      setIsModalOpen(false);
      setSymbol('');
      setDisplayName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.instruments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      symbol: symbol.toUpperCase().trim(),
      displayName,
      assetClass,
      exchange,
      marketSegment,
      quoteCurrency,
      contractMultiplier: Number(contractMultiplier) || 1,
      lotSize: Number(lotSize) || 1,
      tickSize: Number(tickSize) || 0.05,
      quantityIncrement: Number(lotSize) || 1,
      pricePrecision: Number(pricePrecision) || 2,
      isActive: true,
    });
  };

  const filtered = instruments.filter(
    (i: any) =>
      i.symbol.toLowerCase().includes(search.toLowerCase()) ||
      i.displayName.toLowerCase().includes(search.toLowerCase()) ||
      i.exchange.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Instrument Specifications
          </h1>
          <p className="text-xs text-muted-foreground">
            Contract multipliers, lot sizes, tick sizes, and precision configurations across markets
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>New Custom Instrument</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol, exchange, or name..."
          className="w-full h-9 rounded-lg border border-border bg-card pl-9 pr-3 text-xs focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Instruments Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-accent/20 text-muted-foreground">
                <th className="py-3 px-4 font-sans font-medium">Symbol</th>
                <th className="py-3 px-3 font-sans font-medium">Display Name</th>
                <th className="py-3 px-3 font-sans font-medium">Asset Class</th>
                <th className="py-3 px-3 font-sans font-medium">Exchange</th>
                <th className="py-3 px-3 text-right">Multiplier</th>
                <th className="py-3 px-3 text-right">Lot Size</th>
                <th className="py-3 px-3 text-right">Tick Size</th>
                <th className="py-3 px-3 font-sans text-center">Type</th>
                <th className="py-3 px-4 text-right font-sans">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    Loading instruments...
                  </td>
                </tr>
              ) : (
                filtered.map((inst: any) => (
                  <tr key={inst.id} className="hover:bg-accent/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-foreground">{inst.symbol}</td>
                    <td className="py-3 px-3 font-sans text-muted-foreground">{inst.displayName}</td>
                    <td className="py-3 px-3 font-sans">
                      <span className="rounded bg-accent/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {inst.assetClass}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans text-muted-foreground">{inst.exchange}</td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-bold">x{inst.contractMultiplier}</td>
                    <td className="py-3 px-3 text-right text-foreground">{inst.lotSize}</td>
                    <td className="py-3 px-3 text-right text-muted-foreground">{inst.tickSize}</td>
                    <td className="py-3 px-3 text-center font-sans">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          inst.isPreset
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {inst.isPreset ? 'Preset' : 'Custom'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      {!inst.isPreset && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete custom instrument ${inst.symbol}?`)) {
                              deleteMutation.mutate(inst.id);
                            }
                          }}
                          className="p-1 text-muted-foreground hover:text-rose-400 rounded hover:bg-accent"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Instrument Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Custom Instrument"
        description="Define tick size, lot size, multiplier, and exchange specifications"
        maxWidth="lg"
      >

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Symbol *</label>
                  <input
                    type="text"
                    required
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. SENSEX, SILVER"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm font-bold uppercase font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Display Name *</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. BSE Sensex Index Futures"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Asset Class</label>
                  <select
                    value={assetClass}
                    onChange={(e) => setAssetClass(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs"
                  >
                    {ASSET_CLASSES.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Exchange</label>
                  <input
                    type="text"
                    value={exchange}
                    onChange={(e) => setExchange(e.target.value)}
                    placeholder="NSE, MCX, BSE"
                    className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Currency</label>
                  <input
                    type="text"
                    value={quoteCurrency}
                    onChange={(e) => setQuoteCurrency(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 font-mono">
                <div>
                  <label className="block text-[11px] font-sans text-muted-foreground mb-1">
                    Contract Multiplier *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={contractMultiplier}
                    onChange={(e) => setContractMultiplier(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-sans text-muted-foreground mb-1">
                    Lot Size *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={lotSize}
                    onChange={(e) => setLotSize(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-sans text-muted-foreground mb-1">
                    Tick Size
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={tickSize}
                    onChange={(e) => setTickSize(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs"
                  />
                </div>
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
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
                >
                  {createMutation.isPending ? 'Saving...' : 'Save Instrument'}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
