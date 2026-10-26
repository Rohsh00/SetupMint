import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Button,
  Card,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  useTheme,
  Alert,
  FormControlLabel,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import {
  AddRounded,
  SearchRounded,
  DeleteOutlineRounded,
  CloseRounded,
  TuneRounded,
  EditRounded,
  WarningAmberRounded,
  LayersClearRounded,
} from '@mui/icons-material';
import { ASSET_CLASSES, MARKET_SEGMENTS } from '@tradevault/shared';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { formatCurrency, formatDate } from '../lib/utils.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';

interface InstrumentFormData {
  symbol: string;
  displayName: string;
  assetClass: string;
  exchange: string;
  marketSegment: string;
  quoteCurrency: string;
  contractMultiplier: number;
  lotSize: number;
  tickSize: number;
  quantityIncrement: number;
  pricePrecision: number;
}

const defaultFormData: InstrumentFormData = {
  symbol: '',
  displayName: '',
  assetClass: 'EQUITY',
  exchange: 'NSE',
  marketSegment: 'NSE_EQ',
  quoteCurrency: 'INR',
  contractMultiplier: 1,
  lotSize: 1,
  tickSize: 0.05,
  quantityIncrement: 1,
  pricePrecision: 2,
};

export function InstrumentsPage() {
  const { openDrill } = useTradeDrilldown();
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');

  React.useEffect(() => {
    const s = searchParams.get('search');
    if (s !== null && s !== search) {
      setSearch(s);
    }
  }, [searchParams]);

  // Creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<InstrumentFormData>(defaultFormData);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit modal state
  const [editingInstrument, setEditingInstrument] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState<InstrumentFormData>(defaultFormData);
  const [applyToTrades, setApplyToTrades] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  // Preview / Cascade confirmation dialog
  const [cascadePreview, setCascadePreview] = useState<{
    open: boolean;
    data: any | null;
    isLoading: boolean;
  }>({ open: false, data: null, isLoading: false });

  // Delete dialog state
  const [instrumentToDelete, setInstrumentToDelete] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch only user's traded/created instruments (no presets!)
  const { data: instruments = [], isLoading } = useQuery({
    queryKey: ['instruments'],
    queryFn: () => api.instruments.list(),
  });

  // Create Custom Instrument Mutation
  const createMutation = useMutation({
    mutationFn: (payload: any) => api.instruments.create(payload),
    onSuccess: () => {
      setCreateError(null);
      toast.success('Custom instrument created successfully.');
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      setIsCreateModalOpen(false);
      setCreateFormData(defaultFormData);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to save instrument';
      setCreateError(msg);
      toast.error(msg);
    },
  });

  // Update Instrument Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      api.instruments.update(id, updates),
    onSuccess: () => {
      setEditError(null);
      setCascadePreview({ open: false, data: null, isLoading: false });
      setEditingInstrument(null);
      toast.success('Instrument updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update instrument';
      setEditError(msg);
      setCascadePreview((prev) => ({ ...prev, isLoading: false }));
      toast.error(msg);
    },
  });

  // Delete Instrument Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.instruments.delete(id),
    onSuccess: () => {
      setDeleteError(null);
      setInstrumentToDelete(null);
      toast.success('Instrument deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete instrument';
      setDeleteError(msg);
      toast.error(msg);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.symbol.trim()) {
      toast.warning('Please enter an instrument symbol.');
      return;
    }
    createMutation.mutate({
      symbol: createFormData.symbol.toUpperCase().trim(),
      displayName: createFormData.displayName.trim() || createFormData.symbol.toUpperCase().trim(),
      assetClass: createFormData.assetClass,
      exchange: createFormData.exchange.toUpperCase().trim(),
      marketSegment: createFormData.marketSegment,
      quoteCurrency: createFormData.quoteCurrency.toUpperCase().trim(),
      contractMultiplier: Number(createFormData.contractMultiplier) || 1,
      lotSize: Number(createFormData.lotSize) || 1,
      tickSize: Number(createFormData.tickSize) || 0.05,
      quantityIncrement: Number(createFormData.quantityIncrement) || Number(createFormData.lotSize) || 1,
      pricePrecision: Number(createFormData.pricePrecision) || 2,
      isActive: true,
    });
  };

  const openEditModal = (inst: any) => {
    setEditingInstrument(inst);
    setEditFormData({
      symbol: inst.symbol,
      displayName: inst.displayName || inst.symbol,
      assetClass: inst.assetClass || 'EQUITY',
      exchange: inst.exchange || 'NSE',
      marketSegment: inst.marketSegment || 'NSE_EQ',
      quoteCurrency: inst.quoteCurrency || 'INR',
      contractMultiplier: inst.contractMultiplier ?? 1,
      lotSize: inst.lotSize ?? 1,
      tickSize: inst.tickSize ?? 0.05,
      quantityIncrement: inst.quantityIncrement ?? inst.lotSize ?? 1,
      pricePrecision: inst.pricePrecision ?? 2,
    });
    setApplyToTrades((inst.tradeCount || 0) > 0);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstrument) return;

    const id = editingInstrument.id || editingInstrument._id;
    const updates = {
      symbol: editFormData.symbol.toUpperCase().trim(),
      displayName: editFormData.displayName.trim(),
      assetClass: editFormData.assetClass,
      exchange: editFormData.exchange.toUpperCase().trim(),
      marketSegment: editFormData.marketSegment,
      quoteCurrency: editFormData.quoteCurrency.toUpperCase().trim(),
      contractMultiplier: Number(editFormData.contractMultiplier) || 1,
      lotSize: Number(editFormData.lotSize) || 1,
      tickSize: Number(editFormData.tickSize) || 0.05,
      quantityIncrement: Number(editFormData.quantityIncrement) || Number(editFormData.lotSize) || 1,
      pricePrecision: Number(editFormData.pricePrecision) || 2,
    };

    const tradesCount = editingInstrument.tradeCount || 0;

    // If applyToTrades is checked and there are trades, preview impact first
    if (applyToTrades && tradesCount > 0) {
      setCascadePreview({ open: true, data: null, isLoading: true });
      try {
        const preview = await api.instruments.previewUpdate(id, updates);
        setCascadePreview({ open: true, data: preview, isLoading: false });
      } catch (err: any) {
        setCascadePreview({ open: false, data: null, isLoading: false });
        const msg = err.message || 'Failed to preview trade update impact';
        setEditError(msg);
        toast.error(msg);
      }
    } else {
      // Save without cascading to trades
      updateMutation.mutate({ id, updates: { ...updates, applyToTrades: false } });
    }
  };

  const confirmCascadeUpdate = () => {
    if (!editingInstrument) return;
    const id = editingInstrument.id || editingInstrument._id;
    const updates = {
      symbol: editFormData.symbol.toUpperCase().trim(),
      displayName: editFormData.displayName.trim(),
      assetClass: editFormData.assetClass,
      exchange: editFormData.exchange.toUpperCase().trim(),
      marketSegment: editFormData.marketSegment,
      quoteCurrency: editFormData.quoteCurrency.toUpperCase().trim(),
      contractMultiplier: Number(editFormData.contractMultiplier) || 1,
      lotSize: Number(editFormData.lotSize) || 1,
      tickSize: Number(editFormData.tickSize) || 0.05,
      quantityIncrement: Number(editFormData.quantityIncrement) || Number(editFormData.lotSize) || 1,
      pricePrecision: Number(editFormData.pricePrecision) || 2,
      applyToTrades: true,
    };
    updateMutation.mutate({ id, updates });
  };

  const filtered = instruments.filter(
    (i: any) =>
      i.symbol.toLowerCase().includes(search.toLowerCase()) ||
      (i.displayName && i.displayName.toLowerCase().includes(search.toLowerCase())) ||
      (i.exchange && i.exchange.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
            <TuneRounded sx={{ color: 'primary.main', fontSize: 28 }} />
            Instruments & Contract Specs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Only instruments you have traded or created appear here. Updates can automatically cascade across all trade history.
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          startIcon={<AddRounded />}
          onClick={() => {
            setCreateError(null);
            setCreateFormData(defaultFormData);
            setIsCreateModalOpen(true);
          }}
          sx={{ fontWeight: 600, px: 2.5 }}
        >
          New Custom Instrument
        </Button>
      </Box>

      {/* Search Bar & Alerts */}
      {deleteError && (
        <Alert severity="error" onClose={() => setDeleteError(null)}>
          {deleteError}
        </Alert>
      )}

      {instruments.length > 0 && (
        <Box sx={{ maxWidth: 360 }}>
          <TextField
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol, exchange, or name..."
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      )}

      {/* Instruments Table or Empty State */}
      <Card variant="outlined" sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Underlying Symbol</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Display Name</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Asset Class</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Exchange</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Multiplier</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Lot Size</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Tick Size</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Trades</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Net Realized P&L</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Last Traded</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, py: 1.5 }}>Source</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    <CircularProgress size={24} sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Loading your instruments...
                  </TableCell>
                </TableRow>
              ) : instruments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 8 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                      <LayersClearRounded sx={{ fontSize: 44, color: 'text.disabled' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        No instruments yet
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
                        Instruments appear automatically when you log or import your first trade, or you can register a custom specification now.
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<AddRounded />}
                        onClick={() => {
                          setCreateError(null);
                          setCreateFormData(defaultFormData);
                          setIsCreateModalOpen(true);
                        }}
                        sx={{ mt: 1 }}
                      >
                        Add Custom Instrument
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No instruments found matching &ldquo;{search}&rdquo;
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inst: any) => {
                  const netPnL = inst.netPnL ?? 0;
                  const tradeCount = inst.tradeCount ?? 0;
                  const isProfit = netPnL > 0;
                  const isLoss = netPnL < 0;

                  return (
                    <TableRow key={inst.id || inst._id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      {/* Symbol & Review Specs badge */}
                      <TableCell sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{inst.symbol}</span>
                          {inst.needsReview && (
                            <Tooltip
                              title="Auto-created from trade fallback with unknown specs. Please review multiplier, lot size, and tick size."
                              arrow
                            >
                              <Chip
                                size="small"
                                icon={<WarningAmberRounded sx={{ fontSize: '14px !important' }} />}
                                label="Review specs"
                                color="warning"
                                variant="outlined"
                                sx={{ fontSize: '0.62rem', height: 20 }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>

                      <TableCell sx={{ color: 'text.secondary' }}>
                        {inst.displayName || inst.symbol}
                      </TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          label={inst.assetClass}
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', fontWeight: 600, height: 20 }}
                        />
                      </TableCell>

                      <TableCell sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        {inst.exchange}
                      </TableCell>

                      <TableCell align="right" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main' }}>
                        x{inst.contractMultiplier}
                      </TableCell>

                      <TableCell align="right" sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {inst.lotSize}
                      </TableCell>

                      <TableCell align="right" sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.secondary' }}>
                        {inst.tickSize}
                      </TableCell>

                      <TableCell
                        align="right"
                        onClick={() => {
                          if (tradeCount > 0) {
                            openDrill({
                              kind: 'FILTER',
                              filter: { symbol: inst.symbol },
                              label: `${inst.symbol} Executions`,
                            });
                          }
                        }}
                        sx={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 700,
                          cursor: tradeCount > 0 ? 'pointer' : 'default',
                          color: tradeCount > 0 ? 'primary.main' : 'inherit',
                          '&:hover': tradeCount > 0 ? { textDecoration: 'underline' } : {},
                        }}
                      >
                        {tradeCount}
                      </TableCell>

                      <TableCell
                        align="right"
                        onClick={() => {
                          if (tradeCount > 0) {
                            openDrill({
                              kind: 'FILTER',
                              filter: { symbol: inst.symbol },
                              label: `${inst.symbol} Executions`,
                            });
                          }
                        }}
                        sx={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 700,
                          cursor: tradeCount > 0 ? 'pointer' : 'default',
                          color: isProfit ? 'success.main' : isLoss ? 'error.main' : 'text.secondary',
                        }}
                      >
                        {tradeCount > 0 ? formatCurrency(netPnL, inst.quoteCurrency) : '—'}
                      </TableCell>

                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {inst.lastTradedAt ? formatDate(inst.lastTradedAt) : 'Never'}
                      </TableCell>

                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={inst.source === 'CUSTOM' ? 'Custom' : 'Auto'}
                          color={inst.source === 'CUSTOM' ? 'primary' : 'default'}
                          variant={inst.source === 'CUSTOM' ? 'filled' : 'outlined'}
                          sx={{ fontSize: '0.65rem', fontWeight: 700, height: 20 }}
                        />
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                          <Tooltip title="Edit specifications" arrow>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => openEditModal(inst)}
                            >
                              <EditRounded sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>

                          <Tooltip
                            title={
                              tradeCount > 0
                                ? `Cannot delete: referenced by ${tradeCount} trade(s)`
                                : 'Delete unused instrument'
                            }
                            arrow
                          >
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={tradeCount > 0 || deleteMutation.isPending}
                                onClick={() => {
                                  setDeleteError(null);
                                  setInstrumentToDelete(inst);
                                }}
                              >
                                <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Create Custom Instrument Modal */}
      <Dialog
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              backgroundImage: 'none',
              bgcolor: 'background.paper',
              borderRadius: 2,
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Add Custom Instrument</Typography>
            <Typography variant="caption" color="text.secondary">
              Define contract multiplier, lot size, tick size, and precision
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsCreateModalOpen(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleCreateSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {createError && (
              <Alert severity="error" onClose={() => setCreateError(null)}>
                {createError}
              </Alert>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Underlying Symbol *"
                placeholder="e.g. SILVER, SENSEX"
                size="small"
                required
                fullWidth
                value={createFormData.symbol}
                onChange={(e) => setCreateFormData({ ...createFormData, symbol: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
              />
              <TextField
                label="Display Name *"
                placeholder="e.g. Silver Futures"
                size="small"
                required
                fullWidth
                value={createFormData.displayName}
                onChange={(e) => setCreateFormData({ ...createFormData, displayName: e.target.value })}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Asset Class"
                size="small"
                fullWidth
                value={createFormData.assetClass}
                onChange={(e) => setCreateFormData({ ...createFormData, assetClass: e.target.value })}
              >
                {ASSET_CLASSES.map((a) => (
                  <MenuItem key={a.value} value={a.value}>
                    {a.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Exchange"
                placeholder="NSE, MCX, BSE"
                size="small"
                fullWidth
                value={createFormData.exchange}
                onChange={(e) => setCreateFormData({ ...createFormData, exchange: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
              />

              <TextField
                label="Currency"
                placeholder="INR, USD"
                size="small"
                fullWidth
                value={createFormData.quoteCurrency}
                onChange={(e) => setCreateFormData({ ...createFormData, quoteCurrency: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                label="Contract Multiplier *"
                type="number"
                size="small"
                required
                fullWidth
                value={createFormData.contractMultiplier}
                onChange={(e) => setCreateFormData({ ...createFormData, contractMultiplier: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Lot Size *"
                type="number"
                size="small"
                required
                fullWidth
                value={createFormData.lotSize}
                onChange={(e) => setCreateFormData({ ...createFormData, lotSize: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 1, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Tick Size *"
                type="number"
                size="small"
                required
                fullWidth
                value={createFormData.tickSize}
                onChange={(e) => setCreateFormData({ ...createFormData, tickSize: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Quantity Increment *"
                type="number"
                size="small"
                required
                fullWidth
                value={createFormData.quantityIncrement}
                onChange={(e) => setCreateFormData({ ...createFormData, quantityIncrement: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 1, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Price Precision"
                type="number"
                size="small"
                fullWidth
                value={createFormData.pricePrecision}
                onChange={(e) => setCreateFormData({ ...createFormData, pricePrecision: Number(e.target.value) })}
                slotProps={{ htmlInput: { min: 0, max: 8, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsCreateModalOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Saving...' : 'Save Instrument'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Instrument Modal */}
      <Dialog
        open={Boolean(editingInstrument)}
        onClose={() => setEditingInstrument(null)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              backgroundImage: 'none',
              bgcolor: 'background.paper',
              borderRadius: 2,
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Edit Instrument: {editingInstrument?.symbol}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Update specification parameters and optionally recalculate all existing trades
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setEditingInstrument(null)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleEditSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {editError && (
              <Alert severity="error" onClose={() => setEditError(null)}>
                {editError}
              </Alert>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Underlying Symbol *"
                size="small"
                required
                fullWidth
                value={editFormData.symbol}
                onChange={(e) => setEditFormData({ ...editFormData, symbol: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
              />
              <TextField
                label="Display Name *"
                size="small"
                required
                fullWidth
                value={editFormData.displayName}
                onChange={(e) => setEditFormData({ ...editFormData, displayName: e.target.value })}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Asset Class"
                size="small"
                fullWidth
                value={editFormData.assetClass}
                onChange={(e) => setEditFormData({ ...editFormData, assetClass: e.target.value })}
              >
                {ASSET_CLASSES.map((a) => (
                  <MenuItem key={a.value} value={a.value}>
                    {a.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Exchange"
                size="small"
                fullWidth
                value={editFormData.exchange}
                onChange={(e) => setEditFormData({ ...editFormData, exchange: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
              />

              <TextField
                label="Currency"
                size="small"
                fullWidth
                value={editFormData.quoteCurrency}
                onChange={(e) => setEditFormData({ ...editFormData, quoteCurrency: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                label="Contract Multiplier *"
                type="number"
                size="small"
                required
                fullWidth
                value={editFormData.contractMultiplier}
                onChange={(e) => setEditFormData({ ...editFormData, contractMultiplier: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Lot Size *"
                type="number"
                size="small"
                required
                fullWidth
                value={editFormData.lotSize}
                onChange={(e) => setEditFormData({ ...editFormData, lotSize: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 1, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Tick Size *"
                type="number"
                size="small"
                required
                fullWidth
                value={editFormData.tickSize}
                onChange={(e) => setEditFormData({ ...editFormData, tickSize: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Quantity Increment *"
                type="number"
                size="small"
                required
                fullWidth
                value={editFormData.quantityIncrement}
                onChange={(e) => setEditFormData({ ...editFormData, quantityIncrement: Number(e.target.value) })}
                slotProps={{ htmlInput: { step: 'any', min: 1, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Price Precision"
                type="number"
                size="small"
                fullWidth
                value={editFormData.pricePrecision}
                onChange={(e) => setEditFormData({ ...editFormData, pricePrecision: Number(e.target.value) })}
                slotProps={{ htmlInput: { min: 0, max: 8, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
            </Box>

            {/* Cascade update checkbox */}
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: 1,
                borderColor: 'divider',
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={applyToTrades}
                    onChange={(e) => setApplyToTrades(e.target.checked)}
                    disabled={(editingInstrument?.tradeCount || 0) === 0}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Apply to all {editingInstrument?.tradeCount || 0} existing trades
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Recalculates trade P&Ls, fees, and account balances using updated specifications.
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setEditingInstrument(null)} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={updateMutation.isPending || cascadePreview.isLoading}
            >
              {cascadePreview.isLoading
                ? 'Previewing...'
                : updateMutation.isPending
                ? 'Saving...'
                : 'Save Changes'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Cascade Confirmation Dialog with Financial Impact */}
      <ConfirmDialog
        open={cascadePreview.open && Boolean(cascadePreview.data)}
        title="Recalculate Existing Trades?"
        severity="warning"
        message={
          cascadePreview.data ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="body2">
                This modification will update{' '}
                <strong>{cascadePreview.data.tradesCount}</strong> existing trade(s) for{' '}
                <strong>{editingInstrument?.symbol}</strong>:
              </Typography>

              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.82rem',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: muiTheme.palette.text.secondary }}>Previous Net P&L:</span>
                  <strong>{formatCurrency(cascadePreview.data.oldTotalNetPnL, editingInstrument?.quoteCurrency)}</strong>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: muiTheme.palette.text.secondary }}>New Net P&L:</span>
                  <strong>{formatCurrency(cascadePreview.data.newTotalNetPnL, editingInstrument?.quoteCurrency)}</strong>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
                  <span style={{ color: muiTheme.palette.text.secondary }}>P&L Difference:</span>
                  <strong
                    style={{
                      color:
                        cascadePreview.data.deltaNetPnL > 0
                          ? muiTheme.palette.success.main
                          : cascadePreview.data.deltaNetPnL < 0
                          ? muiTheme.palette.error.main
                          : muiTheme.palette.text.primary,
                    }}
                  >
                    {cascadePreview.data.deltaNetPnL > 0 ? '+' : ''}
                    {formatCurrency(cascadePreview.data.deltaNetPnL, editingInstrument?.quoteCurrency)}
                  </strong>
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary">
                Account balances will be authoritatively reconciled to match recalculated trade P&Ls.
              </Typography>
            </Box>
          ) : null
        }
        confirmLabel="Recalculate & Save"
        isLoading={updateMutation.isPending}
        error={editError}
        onCancel={() => {
          if (!updateMutation.isPending) {
            setCascadePreview({ open: false, data: null, isLoading: false });
          }
        }}
        onConfirm={confirmCascadeUpdate}
      />

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(instrumentToDelete)}
        title="Delete Instrument"
        message={
          <>
            Are you sure you want to permanently delete instrument{' '}
            <strong>{instrumentToDelete?.symbol}</strong> ({instrumentToDelete?.displayName || instrumentToDelete?.symbol})? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Instrument"
        isLoading={deleteMutation.isPending}
        error={deleteError}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setInstrumentToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => {
          if (instrumentToDelete) {
            deleteMutation.mutate(instrumentToDelete.id || instrumentToDelete._id);
          }
        }}
      />
    </Box>
  );
}
