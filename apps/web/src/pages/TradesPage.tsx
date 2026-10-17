import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Search,
  Filter,
  Download,
  Trash2,
  Copy,
  Edit,
  Eye,
  Plus,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Tag,
  CheckSquare,
  Square,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent, formatR } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';
import { Modal } from '../components/ui/Modal.js';

export function TradesPage() {
  const queryClient = useQueryClient();
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();

  // Filter state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [assetClassFilter, setAssetClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('tradeDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);

  // Modals
  const [isNewTradeModalOpen, setIsNewTradeModalOpen] = useState(false);
  const [editTradeData, setEditTradeData] = useState<any>(null);

  // Fetch accounts & strategies for filter dropdowns
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: () => api.strategies.list() });

  // Query trades
  const { data, isLoading } = useQuery({
    queryKey: [
      'trades',
      selectedAccountId,
      page,
      limit,
      search,
      directionFilter,
      outcomeFilter,
      assetClassFilter,
      statusFilter,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      api.trades.list({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        page,
        limit,
        search: search || undefined,
        direction: directionFilter || undefined,
        outcome: outcomeFilter || undefined,
        assetClass: assetClassFilter || undefined,
        status: statusFilter || undefined,
        sortBy,
        sortOrder,
      }),
  });

  const trades = data?.data || [];
  const pagination = data?.pagination || { page: 1, limit: 25, totalCount: 0, totalPages: 1 };

  // Mutations
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.trades.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.trades.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.trades.bulkDelete(ids),
    onSuccess: () => {
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const bulkTagMutation = useMutation({
    mutationFn: ({ ids, tags }: { ids: string[]; tags: string[] }) =>
      api.trades.bulkTag(ids, tags),
    onSuccess: () => {
      setSelectedIds([]);
      setShowBulkTagModal(false);
      setBulkTagInput('');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === trades.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(trades.map((t: any) => t.id));
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Trade Log & Journal</h1>
          <p className="text-xs text-muted-foreground">
            Complete historical execution records, P&L, fees, and post-trade audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export button */}
          <a
            href={api.exportImport.csvUrl({ accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors shadow-sm"
            download
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>

          {/* New Trade button */}
          <button
            onClick={() => setIsNewTradeModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold shadow-md transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Log Trade</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search symbol, notes, rationale..."
            className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-xs focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Direction */}
          <select
            value={directionFilter}
            onChange={(e) => {
              setDirectionFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Directions</option>
            <option value="LONG">Long (Buy)</option>
            <option value="SHORT">Short (Sell)</option>
          </select>

          {/* Outcome */}
          <select
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Outcomes</option>
            <option value="WIN">Winners (Win)</option>
            <option value="LOSS">Losers (Loss)</option>
            <option value="BREAKEVEN">Breakeven</option>
            <option value="OPEN">Open Positions</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="CLOSED">CLOSED</option>
            <option value="OPEN">OPEN</option>
            <option value="PLANNED">PLANNED</option>
          </select>

          {/* Sort By */}
          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split(':');
              setSortBy(sb);
              setSortOrder(so as any);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-1 focus:ring-emerald-500"
          >
            <option value="tradeDate:desc">Date (Newest First)</option>
            <option value="tradeDate:asc">Date (Oldest First)</option>
            <option value="calculated.netPnL:desc">Highest Profit</option>
            <option value="calculated.netPnL:asc">Largest Loss</option>
            <option value="symbol:asc">Symbol (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Bulk action bar if trades selected */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-foreground animate-fadeIn">
          <span className="font-semibold text-emerald-400">
            {selectedIds.length} trade{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkTagModal(true)}
              className="flex items-center gap-1 rounded bg-background px-2.5 py-1 font-medium hover:bg-accent border border-border"
            >
              <Tag className="h-3.5 w-3.5" /> Bulk Tag
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${selectedIds.length} selected trades permanently?`)) {
                  bulkDeleteMutation.mutate(selectedIds);
                }
              }}
              className="flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Trades Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-accent/20 text-muted-foreground font-mono">
                <th className="py-3 px-4 w-10">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                    {selectedIds.length > 0 && selectedIds.length === trades.length ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Account</th>
                <th className="py-3 px-3">Symbol</th>
                <th className="py-3 px-3">Side</th>
                <th className="py-3 px-3">Strategy</th>
                <th className="py-3 px-3 text-right">Entry</th>
                <th className="py-3 px-3 text-right">Exit</th>
                <th className="py-3 px-3 text-right">Qty</th>
                <th className="py-3 px-3 text-right">Fees</th>
                <th className="py-3 px-3 text-right">Net P&L</th>
                <th className="py-3 px-3 text-right">R-Multiple</th>
                <th className="py-3 px-3 text-center">Score</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-muted-foreground font-mono">
                    Loading trades...
                  </td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <SlidersHorizontal className="h-8 w-8 stroke-[1.5]" />
                      <span className="font-semibold text-sm text-foreground">No trades found</span>
                      <p className="text-xs">
                        Try adjusting your filters or click &quot;Log Trade&quot; to record your first manual execution.
                      </p>
                      <button
                        onClick={() => setIsNewTradeModalOpen(true)}
                        className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow"
                      >
                        Log Trade
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                trades.map((t: any) => {
                  const isSelected = selectedIds.includes(t.id);
                  const isWin = t.calculated.netPnL > 0;
                  const isLoss = t.calculated.netPnL < 0;

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-accent/30 transition-colors ${
                        isSelected ? 'bg-emerald-500/5' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button onClick={() => toggleSelect(t.id)} className="text-muted-foreground hover:text-foreground">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">
                        {t.tradeDate}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground truncate max-w-[110px]" title={t.accountName}>
                        {t.accountName}
                      </td>
                      <td className="py-3 px-3 font-bold font-mono text-foreground whitespace-nowrap">
                        <Link to={`/trades/${t.id}`} className="hover:underline flex items-center gap-1">
                          {t.symbol}
                          <Eye className="h-3 w-3 text-muted-foreground opacity-60" />
                        </Link>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.direction === 'LONG'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground truncate max-w-[120px]">
                        {t.strategyName || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-foreground">
                        {t.simpleExecution?.entryPrice || t.calculated?.averageEntryPrice || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-foreground">
                        {t.simpleExecution?.exitPrice || t.calculated?.averageExitPrice || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-foreground">
                        {t.simpleExecution?.quantity || t.calculated?.closedQuantity || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(t.calculated?.totalCosts)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          isWin
                            ? 'text-emerald-400'
                            : isLoss
                            ? 'text-rose-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatCurrency(t.calculated?.netPnL)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {formatR(t.calculated?.realizedRMultiple)}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="rounded bg-accent/60 px-1.5 py-0.5 text-[10px] font-semibold">
                          {t.psychology?.disciplineScore ? `${t.psychology.disciplineScore}/5` : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/trades/${t.id}`}
                            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
                            title="View Trade Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => duplicateMutation.mutate(t.id)}
                            className="p-1 text-muted-foreground hover:text-emerald-400 rounded hover:bg-accent"
                            title="Duplicate Setup"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete trade for ${t.symbol}?`)) {
                                deleteMutation.mutate(t.id);
                              }
                            }}
                            className="p-1 text-muted-foreground hover:text-rose-400 rounded hover:bg-accent"
                            title="Delete Trade"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground gap-3">
          <span>
            Showing {trades.length} of {pagination.totalCount} total trades (Page {pagination.page} of{' '}
            {pagination.totalPages || 1})
          </span>

          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 rounded border border-border bg-background px-2 text-xs"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-8 items-center gap-1 rounded border border-border bg-background px-3 font-medium disabled:opacity-40 hover:bg-accent"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="flex h-8 items-center gap-1 rounded border border-border bg-background px-3 font-medium disabled:opacity-40 hover:bg-accent"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Manual Trade Entry Modal */}
      <TradeFormModal
        isOpen={isNewTradeModalOpen}
        onClose={() => setIsNewTradeModalOpen(false)}
        defaultAccountId={selectedAccountId !== 'ALL' ? selectedAccountId : undefined}
      />

      {/* Bulk Tag Modal */}
      <Modal
        isOpen={showBulkTagModal}
        onClose={() => setShowBulkTagModal(false)}
        title="Add Tags to Selected Trades"
        description={`Add one or more tags (comma separated) to the ${selectedIds.length} selected trades.`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            placeholder="e.g. TrendFollow, A-Plus, Volatile"
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowBulkTagModal(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const tags = bulkTagInput.split(',').map((t) => t.trim()).filter(Boolean);
                if (tags.length > 0) {
                  bulkTagMutation.mutate({ ids: selectedIds, tags });
                }
              }}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
            >
              Apply Tags
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
