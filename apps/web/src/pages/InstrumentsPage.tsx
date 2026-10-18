import React, { useState } from 'react';
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
} from '@mui/material';
import {
  ShowChartRounded,
  AddRounded,
  SearchRounded,
  DeleteOutlineRounded,
  CloseRounded,
  TuneRounded,
} from '@mui/icons-material';
import { ASSET_CLASSES, MARKET_SEGMENTS } from '@tradevault/shared';
import { api } from '../lib/api.js';

export function InstrumentsPage() {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      setIsModalOpen(false);
      setSymbol('');
      setDisplayName('');
    },
    onError: (err: any) => {
      setCreateError(err.message || 'Failed to save instrument');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.instruments.delete(id),
    onSuccess: () => {
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
    },
    onError: (err: any) => {
      setDeleteError(err.message || 'Failed to delete custom instrument');
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
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
            <TuneRounded sx={{ color: 'primary.main', fontSize: 28 }} />
            Instrument Specifications
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contract multipliers, lot sizes, tick sizes, and precision configurations across markets
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          startIcon={<AddRounded />}
          onClick={() => setIsModalOpen(true)}
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

      {/* Instruments Table */}
      <Card variant="outlined" sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Symbol</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Display Name</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Asset Class</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1.5 }}>Exchange</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Multiplier</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Lot Size</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Tick Size</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, py: 1.5 }}>Type</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1.5 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    Loading instrument specifications...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No instruments found matching &ldquo;{search}&rdquo;
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inst: any) => (
                  <TableRow key={inst.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                      {inst.symbol}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {inst.displayName}
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
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={inst.isPreset ? 'Preset' : 'Custom'}
                        color={inst.isPreset ? 'info' : 'primary'}
                        variant={inst.isPreset ? 'outlined' : 'filled'}
                        sx={{ fontSize: '0.65rem', fontWeight: 700, height: 20 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {!inst.isPreset ? (
                        <Tooltip title="Delete custom instrument" arrow>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Delete custom instrument ${inst.symbol}?`)) {
                                deleteMutation.mutate(inst.id || inst._id);
                              }
                            }}
                          >
                            <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Add Custom Instrument Modal */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
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
              Define multiplier, lot size, tick size, and exchange parameters
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsModalOpen(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleCreate}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {createError && (
              <Alert severity="error" onClose={() => setCreateError(null)}>
                {createError}
              </Alert>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Symbol *"
                placeholder="e.g. SENSEX, SILVER"
                size="small"
                required
                fullWidth
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
              />
              <TextField
                label="Display Name *"
                placeholder="e.g. BSE Sensex Futures"
                size="small"
                required
                fullWidth
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Asset Class"
                size="small"
                fullWidth
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value)}
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
                value={exchange}
                onChange={(e) => setExchange(e.target.value.toUpperCase())}
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
              />

              <TextField
                label="Currency"
                placeholder="INR, USD"
                size="small"
                fullWidth
                value={quoteCurrency}
                onChange={(e) => setQuoteCurrency(e.target.value.toUpperCase())}
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
                value={contractMultiplier}
                onChange={(e) => setContractMultiplier(Number(e.target.value))}
                slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Lot Size *"
                type="number"
                size="small"
                required
                fullWidth
                value={lotSize}
                onChange={(e) => setLotSize(Number(e.target.value))}
                slotProps={{ htmlInput: { step: 'any', min: 1, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Tick Size *"
                type="number"
                size="small"
                required
                fullWidth
                value={tickSize}
                onChange={(e) => setTickSize(Number(e.target.value))}
                slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsModalOpen(false)} color="inherit">
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
    </Box>
  );
}
