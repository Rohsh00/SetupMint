import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  Shield,
  Layers,
  X,
  History,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatCurrency, formatDateTime } from '../lib/utils.js';

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedAccountForTx, setSelectedAccountForTx] = useState<any>(null);

  // New Account state
  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('EQUITY');
  const [baseCurrency, setBaseCurrency] = useState('INR');
  const [initialBalance, setInitialBalance] = useState<number>(100000);

  // Transaction state
  const [txType, setTxType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [txAmount, setTxAmount] = useState<number>(10000);
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [txNotes, setTxNotes] = useState('');

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
  });

  const createAccountMutation = useMutation({
    mutationFn: (payload: any) => api.accounts.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsAddAccountModalOpen(false);
      setName('');
      setBroker('');
      setAccountNumber('');
    },
  });

  const addTxMutation = useMutation({
    mutationFn: ({ accountId, payload }: { accountId: string; payload: any }) =>
      api.accounts.addTransaction(accountId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsTxModalOpen(false);
      setTxAmount(10000);
      setTxNotes('');
    },
  });

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    createAccountMutation.mutate({
      name,
      broker,
      accountNumber,
      accountType,
      baseCurrency,
      initialBalance: Number(initialBalance) || 0,
    });
  };

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountForTx) return;

    addTxMutation.mutate({
      accountId: selectedAccountForTx.id,
      payload: {
        type: txType,
        amount: Number(txAmount),
        currency: selectedAccountForTx.baseCurrency,
        date: txDate,
        notes: txNotes,
      },
    });
  };

  const totalConsolidatedEquity = accounts.reduce((sum: number, a: any) => sum + (a.currentBalance || 0), 0);
  const totalConsolidatedPnL = accounts.reduce((sum: number, a: any) => sum + (a.realizedPnL || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Trading Accounts & Cash Flow
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage multiple broker accounts, cash deposits, withdrawals, and consolidated portfolio balances
          </p>
        </div>

        <button
          onClick={() => setIsAddAccountModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Add Trading Account</span>
        </button>
      </div>

      {/* Portfolio Totals Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm font-mono text-xs">
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Consolidated Total Equity</span>
          <span className="text-2xl font-bold text-foreground">
            {formatCurrency(totalConsolidatedEquity)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Total Realized P&L</span>
          <span className={`text-2xl font-bold ${totalConsolidatedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(totalConsolidatedPnL)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Active Broker Accounts</span>
          <span className="text-2xl font-bold text-foreground">{accounts.length}</span>
        </div>
      </div>

      {/* Accounts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-xs text-muted-foreground">Loading accounts...</div>
        ) : (
          accounts.map((acc: any) => {
            const isProfitable = (acc.realizedPnL || 0) >= 0;

            return (
              <div
                key={acc.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm space-y-4 hover:border-emerald-500/30 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground leading-snug">{acc.name}</h3>
                      <span className="text-xs text-muted-foreground font-mono">
                        {acc.broker} • {acc.accountType} ({acc.baseCurrency})
                      </span>
                    </div>
                    <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {acc.status}
                    </span>
                  </div>

                  {/* Account balances grid */}
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-accent/20 p-3 mt-4 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Current Equity</span>
                      <span className="text-lg font-bold text-foreground">
                        {formatCurrency(acc.currentBalance, acc.baseCurrency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Realized P&L</span>
                      <span className={`text-lg font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(acc.realizedPnL, acc.baseCurrency)}
                      </span>
                    </div>
                  </div>

                  {/* Cash flow details */}
                  <div className="mt-3 space-y-1 text-[11px] font-mono text-muted-foreground">
                    <div className="flex justify-between">
                      <span className="font-sans">Opening Balance:</span>
                      <span>{formatCurrency(acc.initialBalance, acc.baseCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">Total Deposits:</span>
                      <span className="text-emerald-400">+{formatCurrency(acc.totalDeposits, acc.baseCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans">Total Withdrawals:</span>
                      <span className="text-rose-400">-{formatCurrency(acc.totalWithdrawals, acc.baseCurrency)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedAccountForTx(acc);
                      setIsTxModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent text-foreground transition-colors"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>Deposit / Withdraw</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Account Modal */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Add Trading Account</h3>
              <button onClick={() => setIsAddAccountModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Account Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Zerodha F&O Primary"
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Broker *</label>
                  <input
                    type="text"
                    required
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                    placeholder="e.g. Zerodha, Dhan, Fyers"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Account ID (Optional)</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. ZR1234"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                  >
                    <option value="EQUITY">Equity</option>
                    <option value="FUTURES_OPTIONS">Futures & Options</option>
                    <option value="COMMODITY">Commodity (MCX)</option>
                    <option value="FOREX">Forex</option>
                    <option value="CRYPTO">Crypto</option>
                    <option value="PROP_FIRM">Prop Firm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Base Currency</label>
                  <select
                    value={baseCurrency}
                    onChange={(e) => setBaseCurrency(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Starting Initial Balance</label>
                <input
                  type="number"
                  required
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(Number(e.target.value))}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAccountMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
                >
                  {createAccountMutation.isPending ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Flow Transaction Modal */}
      {isTxModalOpen && selectedAccountForTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">
                Record Cash Flow: {selectedAccountForTx.name}
              </h3>
              <button onClick={() => setIsTxModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddTx} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType('DEPOSIT')}
                    className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 ${
                      txType === 'DEPOSIT'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <ArrowDownLeft className="h-4 w-4" /> Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('WITHDRAWAL')}
                    className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 ${
                      txType === 'WITHDRAWAL'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4" /> Withdrawal
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">
                  Amount ({selectedAccountForTx.baseCurrency}) *
                </label>
                <input
                  type="number"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(Number(e.target.value))}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Date *</label>
                <input
                  type="date"
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Notes / Reference</label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="e.g. Added capital, bank transfer"
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addTxMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
                >
                  {addTxMutation.isPending ? 'Recording...' : 'Record Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
