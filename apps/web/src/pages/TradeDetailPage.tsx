import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Copy,
  Edit,
  Trash2,
  Calendar,
  Clock,
  Shield,
  Brain,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Upload,
  CheckCircle2,
  AlertTriangle,
  History,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatCurrency, formatDateTime, formatR } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';

export function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data: trade, isLoading, isError } = useQuery({
    queryKey: ['trade', id],
    queryFn: () => api.trades.get(id!),
    enabled: !!id,
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.trades.duplicate(id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      navigate(`/trades/${data.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.trades.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      navigate('/trades');
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => api.attachments.upload(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attId: string) => api.attachments.delete(attId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          <span className="text-xs text-muted-foreground font-mono">Loading trade details...</span>
        </div>
      </div>
    );
  }

  if (isError || !trade) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <span className="text-sm font-semibold text-foreground">Trade not found</span>
        <button
          onClick={() => navigate('/trades')}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-medium"
        >
          Back to Trades
        </button>
      </div>
    );
  }

  const isWin = trade.calculated.netPnL > 0;
  const isLoss = trade.calculated.netPnL < 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/trades')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold font-mono text-foreground">{trade.symbol}</h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                  trade.direction === 'LONG'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {trade.direction}
              </span>
              <span className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {trade.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {trade.accountName} • {trade.exchange} ({trade.marketSegment}) • {trade.tradeDate}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => duplicateMutation.mutate()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Duplicate Setup</span>
          </button>
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />
            <span>Edit Trade</span>
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this trade record permanently?')) {
                deleteMutation.mutate();
              }
            }}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600/10 border border-rose-500/20 text-rose-400 hover:bg-rose-600/20 px-3 py-2 text-xs font-semibold transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm font-mono">
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Net Realized P&L</span>
          <span
            className={`text-2xl font-bold ${
              isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-muted-foreground'
            }`}
          >
            {formatCurrency(trade.calculated.netPnL)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Gross P&L</span>
          <span className="text-xl font-semibold text-foreground">
            {formatCurrency(trade.calculated.grossPnL)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Trading Costs</span>
          <span className="text-xl font-semibold text-muted-foreground">
            {formatCurrency(trade.calculated.totalCosts)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Realized R</span>
          <span className="text-xl font-bold text-foreground">
            {formatR(trade.calculated.realizedRMultiple)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Holding Duration</span>
          <span className="text-xl font-semibold text-foreground">
            {trade.calculated.holdingTimeMinutes ? `${trade.calculated.holdingTimeMinutes}m` : '—'}
          </span>
        </div>
      </div>

      {/* Main Grid: Execution Details & Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Execution & Fills */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" /> Execution Parameters
            </h3>
            <span className="text-xs text-muted-foreground uppercase font-mono">
              {trade.executionMode} Mode
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Avg Entry</span>
              <span className="font-bold text-foreground">
                {trade.simpleExecution?.entryPrice || trade.calculated.averageEntryPrice}
              </span>
            </div>
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Avg Exit</span>
              <span className="font-bold text-foreground">
                {trade.simpleExecution?.exitPrice || trade.calculated.averageExitPrice || '—'}
              </span>
            </div>
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Quantity</span>
              <span className="font-bold text-foreground">
                {trade.simpleExecution?.quantity || trade.calculated.closedQuantity}
              </span>
            </div>
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Multiplier</span>
              <span className="font-bold text-foreground">
                x{trade.simpleExecution?.contractMultiplier || 1}
              </span>
            </div>
          </div>

          {/* Costs breakdown */}
          <div className="rounded-lg border border-border bg-accent/10 p-3 space-y-2 text-xs">
            <span className="font-semibold text-foreground block text-[11px] uppercase tracking-wider">
              Costs & Charges Itemization
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div>
                <span className="text-muted-foreground block">Brokerage:</span>
                <span>{formatCurrency(trade.simpleExecution?.brokerage)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Exchange:</span>
                <span>{formatCurrency(trade.simpleExecution?.exchangeFees)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Taxes (STT/GST):</span>
                <span>{formatCurrency(trade.simpleExecution?.taxes)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Other Fees:</span>
                <span>{formatCurrency(trade.simpleExecution?.otherFees)}</span>
              </div>
            </div>
          </div>

          {/* Advanced Fills Table if present */}
          {trade.fills && trade.fills.length > 0 && (
            <div className="pt-2">
              <span className="text-xs font-semibold text-foreground block mb-2">
                Fills Breakdown ({trade.fills.length} fills)
              </span>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-accent/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-2">Type</th>
                      <th className="p-2 text-right">Price</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trade.fills.map((fill: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2 font-bold">{fill.type}</td>
                        <td className="p-2 text-right">{fill.price}</td>
                        <td className="p-2 text-right">{fill.quantity}</td>
                        <td className="p-2 text-right text-muted-foreground">{fill.fee || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Risk Management */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" /> Planned Risk vs Actual Outcome
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Stop Loss</span>
              <span className="font-bold text-rose-400">
                {trade.risk?.initialStopLoss || '—'}
              </span>
            </div>
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Planned Target</span>
              <span className="font-bold text-emerald-400">
                {trade.risk?.plannedTarget || '—'}
              </span>
            </div>
            <div className="rounded-lg bg-accent/30 p-2.5">
              <span className="text-[10px] text-muted-foreground block font-sans">Risk Budget</span>
              <span className="font-bold text-foreground">
                {formatCurrency(trade.risk?.riskBudgetAmount)}
              </span>
            </div>
          </div>

          {/* Trade Thesis */}
          <div className="space-y-2 text-xs pt-2">
            <span className="font-semibold text-foreground block text-[11px] uppercase tracking-wider">
              Technical Rationale & Thesis
            </span>
            <p className="rounded-lg border border-border bg-background p-3 text-muted-foreground leading-relaxed">
              {trade.thesis?.entryRationale || 'No written entry rationale logged for this trade.'}
            </p>

            {trade.thesis?.confluences && trade.thesis.confluences.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {trade.thesis.confluences.map((c: string) => (
                  <span
                    key={c}
                    className="rounded bg-accent/60 border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Psychology & Discipline Section */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" /> Psychology & Discipline Report
          </h3>
          <span className="text-xs font-mono font-bold text-emerald-400">
            Discipline Rating: {trade.psychology?.disciplineScore || 4}/5
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <span className="text-muted-foreground text-[10px] block">Emotion Before Entry</span>
            <span className="font-semibold text-foreground">{trade.psychology?.emotionBefore || 'NEUTRAL'}</span>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <span className="text-muted-foreground text-[10px] block">Emotion During Trade</span>
            <span className="font-semibold text-foreground">{trade.psychology?.emotionDuring || 'CALM'}</span>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <span className="text-muted-foreground text-[10px] block">Rule Adherence</span>
            <span
              className={`font-semibold ${
                trade.psychology?.rulesFollowed ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trade.psychology?.rulesFollowed ? 'Rules Followed Cleanly' : 'Rules Violated'}
            </span>
          </div>
        </div>

        {trade.psychology?.notes && (
          <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground block mb-1">Post-Trade Notes & Lessons Learned:</span>
            {trade.psychology.notes}
          </div>
        )}
      </div>

      {/* Chart Screenshots Gallery */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-emerald-400" /> Private Chart Screenshots
            </h3>
            <p className="text-xs text-muted-foreground">
              Stored privately in local storage outside web root
            </p>
          </div>

          <label className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/80 px-3 py-1.5 text-xs font-medium text-foreground border border-border transition-colors">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Chart</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  uploadAttachmentMutation.mutate(file);
                }
              }}
            />
          </label>
        </div>

        {trade.screenshotIds && trade.screenshotIds.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {trade.screenshotIds.map((attId: string) => (
              <div
                key={attId}
                className="group relative rounded-lg border border-border overflow-hidden bg-background aspect-video cursor-pointer"
                onClick={() => setSelectedImage(api.attachments.downloadUrl(attId))}
              >
                <img
                  src={api.attachments.downloadUrl(attId)}
                  alt="Chart Screenshot"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete screenshot?')) {
                      deleteAttachmentMutation.mutate(attId);
                    }
                  }}
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-black/70 text-rose-400 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No chart screenshots uploaded for this trade. Click &quot;Upload Chart&quot; to attach pre-entry or exit charts.
          </div>
        )}
      </div>

      {/* Audit History Log */}
      {trade.auditLog && trade.auditLog.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" /> Audit Trail
          </h3>
          <div className="space-y-1.5 font-mono text-[11px] text-muted-foreground">
            {trade.auditLog.map((log: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <span>{formatDateTime(log.timestamp)}</span>
                <span className="font-bold text-foreground">[{log.action}]</span>
                <span>by {log.changedBy}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Trade Modal */}
      {isEditModalOpen && (
        <TradeFormModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          editTradeId={trade.id}
          initialValues={{
            ...trade,
            tradeDate: trade.tradeDate,
            entryTime: trade.entryTime ? trade.entryTime.slice(0, 16) : undefined,
            exitTime: trade.exitTime ? trade.exitTime.slice(0, 16) : undefined,
            tagsInput: trade.tags?.join(', ') || '',
          }}
        />
      )}

      {/* Full Screen Image Zoom Modal */}
      {selectedImage && (
        <div
          role="dialog"
          aria-label="Enlarged Chart View"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setSelectedImage(null)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedImage(null);
          }}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-card/80 text-foreground hover:bg-card border border-border shadow-md"
            aria-label="Close enlarged image"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={selectedImage}
            alt="Enlarged Chart"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
