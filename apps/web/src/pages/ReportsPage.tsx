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
} from '@mui/icons-material';
import { api } from '../lib/api.js';

export function ReportsPage() {
  const muiTheme = useTheme();
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
  const [importError, setImportError] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: (file: File) => api.exportImport.previewCsv(file),
    onSuccess: (data) => {
      setImportError(null);
      setPreviewData(data);
      setColumnMapping(data.suggestedMapping || {});
      setImportResult(null);
    },
    onError: (err: any) => {
      setImportError(err.message || 'Failed to preview CSV file');
    },
  });

  const commitMutation = useMutation({
    mutationFn: (payload: any) => api.exportImport.commitImport(payload),
    onSuccess: (data) => {
      setImportError(null);
      setImportResult(data);
      setPreviewData(null);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => {
      setImportError(err.message || 'Failed to commit trade import');
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
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Header */}
      <Box sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageRounded sx={{ color: 'primary.main', fontSize: 28 }} />
          Reports & Data Portability
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Export your journal in CSV/JSON, import historical broker trades with column mapping, and manage local backups
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
                Stratum runs locally on your MacBook with all personal records in MongoDB and chart screenshots in private disk storage.
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
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <UploadFileRounded sx={{ color: 'primary.main' }} />
              Import External Trade History (CSV)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Import past trades from Zerodha, Dhan, Fyers, TradingView, or custom spreadsheets with column mapping
            </Typography>
          </Box>

          {importError && (
            <Alert severity="error" onClose={() => setImportError(null)}>
              {importError}
            </Alert>
          )}

          {/* Upload Dropzone */}
          {!previewData && (
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
                Select any CSV containing Date, Symbol, Entry Price, Exit Price, Quantity
              </Typography>
              <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            </Box>
          )}

          {/* Import Results Banner */}
          {importResult && (
            <Alert severity="success" icon={<CheckCircleRounded />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Import Completed Successfully!
              </Typography>
              <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', mt: 0.5 }}>
                <div>Successfully imported: <strong>{importResult.importedCount} trades</strong></div>
                <div>Duplicates skipped: <strong>{importResult.duplicateCount} trades</strong></div>
                {importResult.errors?.length > 0 && (
                  <div style={{ color: muiTheme.palette.error.main, marginTop: 4 }}>
                    Errors ({importResult.errors.length}): {importResult.errors.join(', ')}
                  </div>
                )}
              </Box>
            </Alert>
          )}

          {/* Column Mapping & Preview */}
          {previewData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Map CSV Columns to Stratum Fields
                </Typography>
                <Grid container spacing={2}>
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
                        <MenuItem value="">(Select column)</MenuItem>
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
                  <TableContainer sx={{ maxHeight: 300 }}>
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

              {/* Commit Button */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 1 }}>
                <Button variant="outlined" color="inherit" onClick={() => setPreviewData(null)}>
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
                  {commitMutation.isPending ? 'Importing...' : 'Commit Import'}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
