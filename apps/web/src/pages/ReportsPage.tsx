import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Database,
  ArrowRight,
  FileCode,
} from 'lucide-react';
import { api } from '../lib/api.js';

export function ReportsPage() {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetAccount, setImportTargetAccount] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<any>(null);

  const previewMutation = useMutation({
    mutationFn: (file: File) => api.exportImport.previewCsv(file),
    onSuccess: (data) => {
      setPreviewData(data);
      setColumnMapping(data.suggestedMapping || {});
      setImportResult(null);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (payload: any) => api.exportImport.commitImport(payload),
    onSuccess: (data) => {
      setImportResult(data);
      setPreviewData(null);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      previewMutation.mutate(file);
    }
  };

  const handleCommit = () => {
    if (!importTargetAccount || !previewData) return;
    commitMutation.mutate({
      accountId: importTargetAccount,
      rows: previewData.previewRows,
      mapping: columnMapping,
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Reports & Data Portability
        </h1>
        <p className="text-xs text-muted-foreground">
          Export your journal in CSV/JSON, import historical trade CSVs with column mapping, and manage backups
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Data Export */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Download className="h-4 w-4 text-emerald-400" /> Export Journal Data
          </h3>

          <p className="text-xs text-muted-foreground">
            Download your trade executions, P&L, fees, and psychological notes. Keep your trading data 100% portable and private.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Filter by Account</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
              >
                <option value="">All Accounts</option>
                {accounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <a
                href={api.exportImport.csvUrl({ accountId: selectedAccountId, startDate, endDate })}
                download
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 text-xs shadow-md transition-all"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Export CSV Spreadsheet</span>
              </a>

              <a
                href={api.exportImport.jsonUrl({ accountId: selectedAccountId, startDate, endDate })}
                download
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-background hover:bg-accent font-semibold py-2.5 text-xs text-foreground transition-all"
              >
                <FileCode className="h-4 w-4 text-blue-400" />
                <span>Export Full JSON</span>
              </a>
            </div>
          </div>
        </div>

        {/* Card 2: Local Backup & Restore Guide */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <HardDrive className="h-4 w-4 text-emerald-400" /> Local Backup & Restore
          </h3>

          <p className="text-xs text-muted-foreground">
            TradeVault runs locally on your MacBook with all personal data in MongoDB and chart screenshots in private disk storage.
          </p>

          <div className="space-y-3 font-mono text-xs">
            <div className="rounded-lg border border-border bg-accent/20 p-3 space-y-1">
              <span className="font-sans font-semibold text-foreground block">One-Command Backup:</span>
              <code className="text-emerald-400 block bg-background p-2 rounded border border-border">
                npm run db:backup
              </code>
              <span className="font-sans text-[11px] text-muted-foreground block">
                Exports all MongoDB collections and private screenshots into a timestamped archive in <code>./backups/</code>.
              </span>
            </div>

            <div className="rounded-lg border border-border bg-accent/20 p-3 space-y-1">
              <span className="font-sans font-semibold text-foreground block">One-Command Restore:</span>
              <code className="text-emerald-400 block bg-background p-2 rounded border border-border">
                npm run db:restore
              </code>
              <span className="font-sans text-[11px] text-muted-foreground block">
                Restores complete journal state from your latest local backup.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CSV Import Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-400" /> Import External Trade History (CSV)
            </h3>
            <p className="text-xs text-muted-foreground">
              Import past trades from Zerodha, Dhan, Fyers, TradingView, or generic CSV spreadsheets with column mapping
            </p>
          </div>
        </div>

        {/* Upload Box */}
        {!previewData && (
          <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-accent/10 p-8 cursor-pointer hover:bg-accent/20 transition-all text-center">
            <Upload className="h-8 w-8 text-emerald-400 mb-2" />
            <span className="text-sm font-semibold text-foreground">Click to upload CSV file</span>
            <span className="text-xs text-muted-foreground mt-1">
              Select any CSV file containing Date, Symbol, Entry Price, Exit Price, Quantity
            </span>
            <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          </label>
        )}

        {/* Import Results Banner */}
        {importResult && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              <span>Import Completed Successfully!</span>
            </div>
            <div className="font-mono text-foreground space-y-0.5">
              <div>Successfully imported: <strong>{importResult.importedCount} trades</strong></div>
              <div>Duplicates skipped: <strong>{importResult.duplicateCount} trades</strong></div>
              {importResult.errors?.length > 0 && (
                <div className="text-rose-400 mt-2">
                  Errors ({importResult.errors.length}): {importResult.errors.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Column Mapping & Preview */}
        {previewData && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-background p-4 space-y-3">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                Target Trading Account *
              </span>
              <select
                value={importTargetAccount}
                onChange={(e) => setImportTargetAccount(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Select target account to receive imported trades...</option>
                {accounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.broker})
                  </option>
                ))}
              </select>
            </div>

            {/* Column Mapping Inputs */}
            <div className="rounded-lg border border-border bg-accent/10 p-4 space-y-3 text-xs">
              <span className="font-semibold text-foreground uppercase tracking-wider block">
                Map CSV Columns to TradeVault Fields
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { field: 'tradeDate', label: 'Trade Date' },
                  { field: 'symbol', label: 'Symbol / Instrument' },
                  { field: 'direction', label: 'Direction (Buy/Sell)' },
                  { field: 'entryPrice', label: 'Entry Price' },
                  { field: 'exitPrice', label: 'Exit Price' },
                  { field: 'quantity', label: 'Quantity' },
                  { field: 'totalCosts', label: 'Fees / Costs' },
                  { field: 'notes', label: 'Notes' },
                ].map((item) => (
                  <div key={item.field}>
                    <label className="block text-muted-foreground mb-1">{item.label}</label>
                    <select
                      value={columnMapping[item.field] || ''}
                      onChange={(e) =>
                        setColumnMapping({ ...columnMapping, [item.field]: e.target.value })
                      }
                      className="w-full h-8 rounded border border-border bg-background px-2 font-mono text-xs"
                    >
                      <option value="">(Select column)</option>
                      {previewData.headers.map((h: string) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground block">
                Preview Rows ({previewData.previewRows.length} of {previewData.totalRows} rows)
              </span>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-accent/40 border-b border-border text-muted-foreground">
                    <tr>
                      {previewData.headers.map((h: string) => (
                        <th key={h} className="p-2 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.previewRows.map((row: any, i: number) => (
                      <tr key={i}>
                        {previewData.headers.map((h: string) => (
                          <td key={h} className="p-2 whitespace-nowrap text-foreground">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Commit Button */}
            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importTargetAccount || commitMutation.isPending}
                onClick={handleCommit}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md"
              >
                <span>Commit Import</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
