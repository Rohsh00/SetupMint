import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Alert,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  useTheme,
  Divider,
  Chip,
  FormControlLabel,
  Checkbox,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  DownloadRounded,
  UploadFileRounded,
  TableChartRounded,
  DataObjectRounded,
  StorageRounded,
  CheckCircleRounded,
  ArrowForwardRounded,
  CloudUploadRounded,
  UndoRounded,
  AutoAwesomeRounded,
  HistoryRounded,
  WarningAmberRounded,
  ContentPasteRounded,
} from '@mui/icons-material';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { formatCurrency } from '../lib/utils.js';

export function ReportsPage() {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() });

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Import states
  const [importMode, setImportMode] = useState<'FILE' | 'PASTE'>('FILE');
  const [pastedText, setPastedText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetAccount, setImportTargetAccount] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedBroker, setSelectedBroker] = useState<string>('CUSTOM');
  const [saveMapping, setSaveMapping] = useState<boolean>(true);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [undoTargetBatch, setUndoTargetBatch] = useState<string | null>(null);

  // Recent import batches query
  const { data: batches = [], refetch: refetchBatches } = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => api.exportImport.getBatches(),
  });

  const previewMutation = useMutation({
    mutationFn: (input: File | string) => api.exportImport.previewCsv(input),
    onSuccess: (data) => {
      setImportError(null);
      setPreviewData(data);
      setSelectedBroker(data.detectedBroker || 'CUSTOM');
      setColumnMapping(data.suggestedMapping || {});
      setImportResult(null);
      toast.info(
        `CSV analyzed: ${data.totalRows} rows. Format: ${data.detectedBroker} (${
          data.isRawExecutionLog ? 'Raw Executions / FIFO' : 'Completed Trades'
        }).`
      );
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to preview CSV file';
      setImportError(msg);
      toast.error(msg);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (payload: any) => api.exportImport.commitImport(payload),
    onSuccess: (data) => {
      setImportError(null);
      setImportResult(data);
      setPreviewData(null);
      setImportFile(null);
      setPastedText('');
      toast.success(`Import completed successfully! (${data.importedCount} trades imported)`);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      refetchBatches();
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to commit trade import';
      setImportError(msg);
      toast.error(msg);
    },
  });

  const undoMutation = useMutation({
    mutationFn: (batchId?: string) => api.exportImport.undoImport(batchId),
    onSuccess: (data) => {
      toast.success(`Undo successful! Removed ${data.deletedCount} imported trades and reconciled balance.`);
      setImportResult(null);
      setUndoTargetBatch(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      refetchBatches();
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to undo import';
      toast.error(msg);
      setUndoTargetBatch(null);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      previewMutation.mutate(file);
    }
  };

  const handlePastedAnalyze = () => {
    if (!pastedText.trim()) {
      toast.error('Please paste CSV tradebook content first');
      return;
    }
    previewMutation.mutate(pastedText);
  };

  const handleCommit = () => {
    if (!importTargetAccount || !previewData) return;
    commitMutation.mutate({
      accountId: importTargetAccount,
      rows: previewData.allRows || previewData.previewRows,
      mapping: columnMapping,
      broker: selectedBroker,
      saveMapping,
    });
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Header */}
      <Box sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageRounded sx={{ color: 'primary.main', fontSize: 28 }} />
          Reports & Data Portability
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Export journal data, import broker tradebooks with auto-format detection and FIFO matching, and manage local backups
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Card 1: Data Export */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DownloadRounded sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Export Journal Data
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary">
                Download your trade executions, P&L, fees, and psychological notes. Keep your trading records 100% portable and private.
              </Typography>

              <TextField
                select
                size="small"
                label="Filter by Account"
                fullWidth
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <MenuItem value="">All Accounts</MenuItem>
                {accounts.map((acc: any) => (
                  <MenuItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  size="small"
                  label="From Date"
                  type="date"
                  fullWidth
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="To Date"
                  type="date"
                  fullWidth
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, pt: 1 }}>
                <Button
                  component="a"
                  href={api.exportImport.csvUrl({ accountId: selectedAccountId, startDate, endDate })}
                  download
                  variant="contained"
                  color="primary"
                  onClick={() => toast.success('CSV export started.')}
                  startIcon={<TableChartRounded />}
                  sx={{ flex: 1, fontWeight: 600, py: 1 }}
                >
                  Export CSV
                </Button>

                <Button
                  component="a"
                  href={api.exportImport.jsonUrl({ accountId: selectedAccountId, startDate, endDate })}
                  download
                  variant="outlined"
                  color="inherit"
                  onClick={() => toast.success('JSON export started.')}
                  startIcon={<DataObjectRounded sx={{ color: 'info.main' }} />}
                  sx={{ flex: 1, fontWeight: 600, py: 1 }}
                >
                  Export JSON
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Local Backup & Restore Guide */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageRounded sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Local Backup & Restore
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary">
                SetupMint runs locally on your machine with personal records in MongoDB and chart screenshots in private disk storage.
              </Typography>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  One-Command Backup:
                </Typography>
                <Box
                  component="code"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '0.8rem',
                    color: 'primary.main',
                    bgcolor: 'background.paper',
                    p: 1,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    display: 'block',
                  }}
                >
                  npm run db:backup
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Exports all MongoDB collections and screenshots into a timestamped archive in <code>./backups/</code>.
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  One-Command Restore:
                </Typography>
                <Box
                  component="code"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '0.8rem',
                    color: 'primary.main',
                    bgcolor: 'background.paper',
                    p: 1,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    display: 'block',
                  }}
                >
                  npm run db:restore
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Restores complete journal state from your latest local backup snapshot.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* CSV Import Section */}
      <Card variant="outlined" sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <UploadFileRounded sx={{ color: 'primary.main' }} />
                Smart Broker CSV Import
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Auto-detects Zerodha, FYERS, Angel One, and Upstox tradebooks. Groups raw executions into FIFO round-trip trades with auto-charges.
              </Typography>
            </Box>
          </Box>

          {importError && (
            <Alert severity="error" onClose={() => setImportError(null)}>
              {importError}
            </Alert>
          )}

          {/* Upload Dropzone or Paste Input Box */}
          {!previewData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <ToggleButtonGroup
                  value={importMode}
                  exclusive
                  onChange={(_, val) => val && setImportMode(val)}
                  size="small"
                  sx={{
                    bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                    p: 0.5,
                    borderRadius: 2,
                  }}
                >
                  <ToggleButton value="FILE" sx={{ px: 2.5, py: 0.75, fontWeight: 600, textTransform: 'none' }}>
                    <CloudUploadRounded sx={{ fontSize: 18, mr: 1 }} />
                    Upload CSV File
                  </ToggleButton>
                  <ToggleButton value="PASTE" sx={{ px: 2.5, py: 0.75, fontWeight: 600, textTransform: 'none' }}>
                    <ContentPasteRounded sx={{ fontSize: 18, mr: 1 }} />
                    Paste CSV Data
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {importMode === 'FILE' ? (
                <Box
                  component="label"
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 5,
                    border: '2px dashed',
                    borderColor: 'divider',
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.02)',
                    },
                  }}
                >
                  <CloudUploadRounded sx={{ fontSize: 44, color: 'primary.main', mb: 1 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Click or drag & drop CSV file to upload
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    Supports FYERS Tradebook, Zerodha Console, Angel One, Upstox, or custom spreadsheet exports
                  </Typography>
                  <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <TextField
                    multiline
                    rows={8}
                    fullWidth
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Paste tradebook CSV report or rows here (e.g. from FYERS, Zerodha, etc.):\n\nReport Title,Tradebook report\n...\nSymbol name,Symbol code,Date & time,Side,Product type,Qty,Traded price,Total value,Segment,Exchange order ID,OMS order ID\nNIFTY26O1923100PE,NIFTY 23100 PE,"16 Oct 2026, 10:48:23 AM",SELL,Overnight,130.00,124.30,"16,159.00",Derivatives,...`}
                    sx={{
                      '& .MuiInputBase-root': {
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: '0.8rem',
                      },
                    }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    {pastedText && (
                      <Button size="small" color="inherit" onClick={() => setPastedText('')}>
                        Clear
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AutoAwesomeRounded />}
                      onClick={handlePastedAnalyze}
                      disabled={!pastedText.trim() || previewMutation.isPending}
                      sx={{ fontWeight: 600, px: 3 }}
                    >
                      {previewMutation.isPending ? 'Analyzing Data...' : 'Analyze Tradebook Data'}
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Import Results Banner with Undo Action */}
          {importResult && (
            <Alert
              severity={importResult.errorCount > 0 && importResult.importedCount === 0 ? 'error' : 'success'}
              icon={<CheckCircleRounded />}
              action={
                importResult.batchId && (
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<UndoRounded />}
                    onClick={() => setUndoTargetBatch(importResult.batchId)}
                    disabled={undoMutation.isPending}
                    sx={{ fontWeight: 700 }}
                  >
                    Undo Import
                  </Button>
                )
              }
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Import Processed! Batch ID: <code>{importResult.batchId}</code>
              </Typography>
              <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', mt: 0.5 }}>
                <div>Successfully imported: <strong>{importResult.importedCount} trades</strong></div>
                <div>Duplicates skipped: <strong>{importResult.duplicateCount} trades</strong></div>
                {importResult.errorCount > 0 && (
                  <div style={{ color: muiTheme.palette.error.main, marginTop: 4 }}>
                    Errors / Warnings ({importResult.errorCount}):
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {importResult.errors.slice(0, 5).map((e: any, idx: number) => (
                        <li key={idx}>
                          {e.row > 0 ? `Row ${e.row}: ` : ''}{e.symbol ? `[${e.symbol}] ` : ''}{e.message}
                        </li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>...and {importResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </Box>
            </Alert>
          )}

          {/* Column Mapping & Preview */}
          {previewData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Auto-Detection & Format Header */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <AutoAwesomeRounded sx={{ color: 'primary.main', fontSize: 24 }} />
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Detected Format:
                      </Typography>
                      <Chip
                        label={previewData.detectedBroker}
                        color="primary"
                        size="small"
                        sx={{ fontWeight: 700, letterSpacing: '0.02em' }}
                      />
                      {previewData.hasSavedMapping && (
                        <Chip
                          label="Saved Custom Mapping"
                          color="info"
                          variant="outlined"
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {previewData.isRawExecutionLog
                        ? 'Raw executions detected — will be matched into round-trip trades using FIFO with automated statutory charges'
                        : 'Completed trade rows detected — will be imported with automated statutory fee calculation'}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TextField
                    select
                    size="small"
                    label="Broker Preset"
                    value={selectedBroker}
                    onChange={(e) => setSelectedBroker(e.target.value)}
                    sx={{ minWidth: 150 }}
                  >
                    {previewData.availableBrokers?.map((b: string) => (
                      <MenuItem key={b} value={b}>
                        {b}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
              </Box>

              <TextField
                select
                size="small"
                label="Target Trading Account *"
                required
                fullWidth
                value={importTargetAccount}
                onChange={(e) => setImportTargetAccount(e.target.value)}
                helperText="Select the account to receive imported trade records"
              >
                <MenuItem value="">Select target account...</MenuItem>
                {accounts.map((acc: any) => (
                  <MenuItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.broker})
                  </MenuItem>
                ))}
              </TextField>

              {/* Column Mapping Grid */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    Map CSV Columns to SetupMint Fields
                  </Typography>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={saveMapping}
                        onChange={(e) => setSaveMapping(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="caption" color="text.secondary">
                        Save as default mapping for {selectedBroker}
                      </Typography>
                    }
                  />
                </Box>

                <Grid container spacing={2}>
                  {[
                    { field: 'tradeDate', label: 'Trade Date / Time *' },
                    { field: 'symbol', label: 'Symbol / Instrument *' },
                    { field: 'direction', label: 'Direction / Side (Buy/Sell) *' },
                    { field: 'price', label: 'Execution Price / Rate *' },
                    { field: 'quantity', label: 'Quantity / Lots *' },
                    { field: 'entryPrice', label: 'Entry Price (Simple Mode)' },
                    { field: 'exitPrice', label: 'Exit Price (Simple Mode)' },
                    { field: 'orderId', label: 'Order ID' },
                    { field: 'tradeId', label: 'Trade ID' },
                    { field: 'segment', label: 'Market Segment (MCX/NSE/BSE)' },
                    { field: 'notes', label: 'Notes / Comments' },
                  ].map((item) => (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={item.field}>
                      <TextField
                        select
                        size="small"
                        label={item.label}
                        fullWidth
                        value={columnMapping[item.field] || ''}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, [item.field]: e.target.value })
                        }
                      >
                        <MenuItem value="">(Not mapped)</MenuItem>
                        {previewData.headers.map((h: string) => (
                          <MenuItem key={h} value={h}>
                            {h}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Preview Table */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Preview Rows ({previewData.previewRows.length} of {previewData.totalRows} rows)
                </Typography>
                <Card variant="outlined" sx={{ overflow: 'hidden' }}>
                  <TableContainer sx={{ maxHeight: 260 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          {previewData.headers.map((h: string) => (
                            <TableCell key={h} sx={{ fontWeight: 600, py: 1, whiteSpace: 'nowrap' }}>
                              {h}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {previewData.previewRows.map((row: any, i: number) => (
                          <TableRow key={i}>
                            {previewData.headers.map((h: string) => (
                              <TableCell key={h} sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', py: 0.75, whiteSpace: 'nowrap' }}>
                                {row[h]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 1 }}>
                <Button variant="outlined" color="inherit" onClick={() => { setPreviewData(null); setPastedText(''); }}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  endIcon={<ArrowForwardRounded />}
                  disabled={!importTargetAccount || commitMutation.isPending}
                  onClick={handleCommit}
                  sx={{ fontWeight: 600, px: 3 }}
                >
                  {commitMutation.isPending ? 'Processing FIFO Fills...' : `Commit Import (${previewData.totalRows} Rows)`}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Recent Import Batches & Undo Section */}
      {batches.length > 0 && (
        <Card variant="outlined" sx={{ p: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryRounded sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Recent Import Batches
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                You can undo any batch. Deleting a batch removes its trades and reconciles account balances.
              </Typography>
            </Box>

            <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Batch ID</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Trades</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Symbols</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Total Realized P&L</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches.map((b: any) => (
                    <TableRow key={b.batchId}>
                      <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' }}>
                        {b.batchId}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        {new Date(b.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {b.tradeCount} trades
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.symbols?.join(', ') || '—'}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem', color: b.totalNetPnL >= 0 ? 'success.main' : 'error.main' }}>
                        {formatCurrency(b.totalNetPnL)}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<UndoRounded />}
                          onClick={() => setUndoTargetBatch(b.batchId)}
                          disabled={undoMutation.isPending}
                          sx={{ textTransform: 'none', py: 0.25, fontSize: '0.75rem' }}
                        >
                          Undo Batch
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Undo Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(undoTargetBatch)}
        title="Undo Import Batch"
        message={`Are you sure you want to undo import batch "${undoTargetBatch}"? All trades created in this batch will be permanently removed and your account balance will be automatically recalculated.`}
        confirmLabel="Undo Batch"
        severity="error"
        onConfirm={() => {
          if (undoTargetBatch) {
            undoMutation.mutate(undoTargetBatch);
          }
        }}
        onCancel={() => setUndoTargetBatch(null)}
      />
    </Box>
  );
}
