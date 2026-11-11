import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useOutletContext, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import SearchIcon from '@mui/icons-material/SearchRounded';
import AddIcon from '@mui/icons-material/AddRounded';
import DownloadIcon from '@mui/icons-material/DownloadRounded';
import VisibilityIcon from '@mui/icons-material/VisibilityRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import ContentCopyIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import LocalOfferIcon from '@mui/icons-material/LocalOfferRounded';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOffRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import CollectionsIcon from '@mui/icons-material/CollectionsRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';

import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { formatCurrency, formatPercent, formatPrice, formatR } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';
import { QuickCloseTradeDialog } from '../components/trades/QuickCloseTradeDialog.js';
import { TradeInstrumentBadge } from '../components/trades/TradeInstrumentBadge.js';
import { DateRangeFilter } from '../components/ui/DateRangeFilter.js';
import { useDateRange } from '../context/DateRangeContext.js';
import { useAccountScope, useAccountCapabilities } from '../context/AccountScopeContext.js';
import { LiveOpenTradeWatcher } from '../components/trades/live/LiveOpenTradeWatcher.js';
import { HelpHint } from '../components/help/index.js';

export function TradesPage() {
  const queryClient = useQueryClient();
  const { scope, isPropMode, queryParams, selectedAccountId, propAccounts } = useAccountScope();
  const caps = useAccountCapabilities();
  const { startDate, endDate } = useDateRange();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Filter state
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || searchParams.get('underlying') || '';

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState(urlSearch);

  React.useEffect(() => {
    const q = searchParams.get('search') || searchParams.get('underlying');
    if (q !== null && q !== search) {
      setSearch(q);
      setPage(1);
    }
  }, [searchParams]);
  const [directionFilter, setDirectionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [assetClassFilter, setAssetClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [variantFilter, setVariantFilter] = useState('');
  const [sortBy, setSortBy] = useState('tradeDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      if (field === 'symbol' || field === 'direction') {
        setSortOrder('asc');
      } else {
        setSortOrder('desc');
      }
    }
    setPage(1);
  };

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [isBulkClassifyOpen, setIsBulkClassifyOpen] = useState(false);
  const [bulkStrategyId, setBulkStrategyId] = useState('');
  const [bulkVariantKey, setBulkVariantKey] = useState('');
  const [bulkVariantStatus, setBulkVariantStatus] = useState<'CLASSIFIED' | 'UNCLASSIFIED' | 'NOT_APPLICABLE'>('CLASSIFIED');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals
  const [isNewTradeModalOpen, setIsNewTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<any | null>(null);
  const [quickCloseTrade, setQuickCloseTrade] = useState<any | null>(null);

  // Query strategies for filtering and bulk classifying
  const { data: strategiesRes } = useQuery({
    queryKey: ['strategies', queryParams],
    queryFn: () => api.strategies.list(queryParams),
  });
  const strategiesList: any[] = Array.isArray(strategiesRes)
    ? strategiesRes
    : (strategiesRes as any)?.data || [];

  const selectedStrategyForFilter = strategiesList.find((s) => (s.id || s._id) === strategyFilter);
  const availableFilterVariants = selectedStrategyForFilter?.variants || [];

  // Query trades
  const { data, isLoading } = useQuery({
    queryKey: [
      'trades',
      queryParams,
      selectedAccountId,
      page,
      limit,
      search,
      directionFilter,
      outcomeFilter,
      assetClassFilter,
      statusFilter,
      strategyFilter,
      variantFilter,
      sortBy,
      sortOrder,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api.trades.list({
        ...queryParams,
        accountId: selectedAccountId && selectedAccountId !== 'ALL' ? selectedAccountId : queryParams.accountId,
        page,
        limit,
        search: search || undefined,
        direction: directionFilter || undefined,
        outcome: outcomeFilter || undefined,
        assetClass: assetClassFilter || undefined,
        status: statusFilter || undefined,
        strategyId: strategyFilter || undefined,
        variantKey: variantFilter || undefined,
        sortBy,
        sortOrder,
        startDate,
        endDate,
      }),
  });

  const trades = Array.isArray(data) ? data : data?.data || [];
  const pagination = data?.pagination || { page: 1, limit: 25, totalCount: trades.length, totalPages: 1 };

  // Mutations
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.trades.duplicate(id),
    onSuccess: () => {
      setActionError(null);
      toast.success('Trade duplicated successfully.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to duplicate trade setup';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.trades.delete(id),
    onSuccess: () => {
      setDeleteConfirmId(null);
      setDeleteError(null);
      toast.success('Trade deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete trade record';
      setDeleteError(msg);
      toast.error(msg);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.trades.bulkDelete(ids),
    onSuccess: () => {
      setSelectedIds([]);
      setActionError(null);
      setShowBulkDeleteConfirm(false);
      toast.success('Selected trades deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete selected trades';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const bulkTagMutation = useMutation({
    mutationFn: ({ ids, tags }: { ids: string[]; tags: string[] }) =>
      api.trades.bulkTag(ids, tags),
    onSuccess: () => {
      setSelectedIds([]);
      setShowBulkTagModal(false);
      setBulkTagInput('');
      setActionError(null);
      toast.success('Tags applied to selected trades.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to apply tags to selected trades';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const bulkClassifyMutation = useMutation({
    mutationFn: ({
      tradeIds,
      strategyId,
      variantKey,
      variantStatus,
    }: {
      tradeIds: string[];
      strategyId?: string;
      variantKey?: string;
      variantStatus?: 'CLASSIFIED' | 'UNCLASSIFIED' | 'NOT_APPLICABLE';
    }) => api.trades.bulkClassify({ tradeIds, strategyId, variantKey, variantStatus }),
    onSuccess: (res: any) => {
      setSelectedIds([]);
      setIsBulkClassifyOpen(false);
      setBulkStrategyId('');
      setBulkVariantKey('');
      setActionError(null);
      toast.success(res?.message || 'Trades classified successfully.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to classify trades';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const autoClassifyMutation = useMutation({
    mutationFn: (tradeIds: string[]) => api.trades.autoClassifyBatch(tradeIds),
    onSuccess: (res: any) => {
      setSelectedIds([]);
      toast.success(res?.message || 'Pattern recognition completed successfully!');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['trade'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Auto pattern classification failed');
    },
  });

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === trades.length && trades.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(trades.map((t: any) => t.id || t._id));
    }
  };

  const hasActiveFilters = Boolean(
    search || directionFilter || outcomeFilter || statusFilter || assetClassFilter || strategyFilter || variantFilter
  );

  const clearFilters = () => {
    setSearch('');
    setDirectionFilter('');
    setOutcomeFilter('');
    setStatusFilter('');
    setAssetClassFilter('');
    setStrategyFilter('');
    setVariantFilter('');
    setPage(1);
    toast.info('Filters reset.');
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header bar */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary }}>
            Trade Log & History
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Comprehensive trade executions, P&L, transaction fees, and post-session audits
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Import CSV button */}
          <Button
            component={RouterLink}
            to="/reports"
            variant="outlined"
            size="small"
            startIcon={<UploadFileRoundedIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.8125rem' }}
          >
            Import CSV
          </Button>

          {/* Export CSV button */}
          <Button
            component="a"
            href={api.exportImport.csvUrl({
              ...queryParams,
              accountId: selectedAccountId !== 'ALL' ? selectedAccountId : queryParams.accountId,
              startDate,
              endDate,
            })}
            download
            variant="outlined"
            size="small"
            onClick={() => toast.success('CSV export started.')}
            startIcon={<DownloadIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.8125rem' }}
          >
            Export CSV
          </Button>

          {/* New Trade button */}
          {!caps.isArchived && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => setIsNewTradeModalOpen(true)}
              startIcon={<AddIcon />}
              sx={{ fontWeight: 700, fontSize: '0.8125rem', px: 2 }}
            >
              Log Trade
            </Button>
          )}
        </Box>
      </Box>

      {/* Live Open Trade Watcher */}
      {caps.live.watcher && (
        <LiveOpenTradeWatcher
          accountId={selectedAccountId !== 'ALL' ? selectedAccountId : undefined}
        />
      )}

      {/* Filter and Search Bar */}
      <Card sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          {/* Date Range Filter */}
          <DateRangeFilter />

          {/* Search Input */}
          <TextField
            size="small"
            placeholder="Search symbol, notes, rationale..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: muiTheme.palette.text.secondary }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flex: { xs: '1 1 100%', sm: '1 1 240px' }, minWidth: 200 }}
          />

          {/* Direction Filter */}
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                setPage(1);
                if (e.target.value) toast.info('Filters applied.');
              }}
              displayEmpty
            >
              <MenuItem value="">
                <em>All Sides</em>
              </MenuItem>
              <MenuItem value="LONG">Long (Buy)</MenuItem>
              <MenuItem value="SHORT">Short (Sell)</MenuItem>
            </Select>
          </FormControl>

          {/* Outcome Filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setPage(1);
                if (e.target.value) toast.info('Filters applied.');
              }}
              displayEmpty
            >
              <MenuItem value="">
                <em>All Outcomes</em>
              </MenuItem>
              <MenuItem value="WIN">Winners (Win)</MenuItem>
              <MenuItem value="LOSS">Losers (Loss)</MenuItem>
              <MenuItem value="BREAKEVEN">Breakeven</MenuItem>
              <MenuItem value="OPEN">Open Positions</MenuItem>
            </Select>
          </FormControl>

          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
                if (e.target.value) toast.info('Filters applied.');
              }}
              displayEmpty
            >
              <MenuItem value="">
                <em>All Status</em>
              </MenuItem>
              <MenuItem value="CLOSED">CLOSED</MenuItem>
              <MenuItem value="OPEN">OPEN</MenuItem>
              <MenuItem value="PLANNED">PLANNED</MenuItem>
            </Select>
          </FormControl>

          {/* Strategy Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={strategyFilter}
              onChange={(e) => {
                setStrategyFilter(e.target.value);
                setVariantFilter('');
                setPage(1);
                if (e.target.value) toast.info('Filters applied.');
              }}
              displayEmpty
            >
              <MenuItem value="">
                <em>All Strategies</em>
              </MenuItem>
              {strategiesList.map((strat: any) => {
                const sId = strat.id || strat._id;
                return (
                  <MenuItem key={sId} value={sId}>
                    {strat.name}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {/* Setup Variant Filter (visible when chosen strategy has variants) */}
          {availableFilterVariants.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={variantFilter}
                onChange={(e) => {
                  setVariantFilter(e.target.value);
                  setPage(1);
                  if (e.target.value) toast.info('Filters applied.');
                }}
                displayEmpty
              >
                <MenuItem value="">
                  <em>All Variants</em>
                </MenuItem>
                {availableFilterVariants.map((v: any) => (
                  <MenuItem key={v.key} value={v.key}>
                    {v.name} ({v.key})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Sort By */}
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <Select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(':');
                setSortBy(sb);
                setSortOrder(so as any);
                setPage(1);
              }}
            >
              <MenuItem value="tradeDate:desc">Date (Newest First)</MenuItem>
              <MenuItem value="tradeDate:asc">Date (Oldest First)</MenuItem>
              <MenuItem value="calculated.netPnL:desc">Highest Profit</MenuItem>
              <MenuItem value="calculated.netPnL:asc">Largest Loss</MenuItem>
              <MenuItem value="calculated.realizedRMultiple:desc">Highest R-Multiple</MenuItem>
              <MenuItem value="calculated.realizedRMultiple:asc">Lowest R-Multiple</MenuItem>
              <MenuItem value="symbol:asc">Symbol (A-Z)</MenuItem>
              <MenuItem value="symbol:desc">Symbol (Z-A)</MenuItem>
              <MenuItem value="entryPrice:desc">Entry Price (High-Low)</MenuItem>
              <MenuItem value="entryPrice:asc">Entry Price (Low-High)</MenuItem>
              <MenuItem value="quantity:desc">Quantity (High-Low)</MenuItem>
              <MenuItem value="fees:desc">Highest Fees</MenuItem>
              <MenuItem value="status:asc">Status</MenuItem>
              {![
                'tradeDate:desc',
                'tradeDate:asc',
                'calculated.netPnL:desc',
                'calculated.netPnL:asc',
                'calculated.realizedRMultiple:desc',
                'calculated.realizedRMultiple:asc',
                'symbol:asc',
                'symbol:desc',
                'entryPrice:desc',
                'entryPrice:asc',
                'quantity:desc',
                'fees:desc',
                'status:asc',
              ].includes(`${sortBy}:${sortOrder}`) && (
                <MenuItem value={`${sortBy}:${sortOrder}`}>
                  Sort: {sortBy} ({sortOrder.toUpperCase()})
                </MenuItem>
              )}
            </Select>
          </FormControl>

          {hasActiveFilters && (
            <Button
              size="small"
              onClick={clearFilters}
              startIcon={<FilterAltOffIcon fontSize="small" />}
              sx={{ color: muiTheme.palette.text.secondary, textTransform: 'none' }}
            >
              Reset
            </Button>
          )}
        </Box>
      </Card>

      {/* Bulk action notification bar */}
      {!caps.isArchived && selectedIds.length > 0 && (
        <Card
          sx={{
            p: 1.5,
            px: 2,
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.08)',
            border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: muiTheme.palette.primary.main }}>
            {selectedIds.length} trade{selectedIds.length > 1 ? 's' : ''} selected
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={autoClassifyMutation.isPending}
              onClick={() => autoClassifyMutation.mutate(selectedIds)}
              startIcon={autoClassifyMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRoundedIcon fontSize="small" />}
              sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none' }}
            >
              {autoClassifyMutation.isPending ? 'Detecting 4H + 5M...' : 'Auto-Detect Setup (4H + 5M)'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setBulkStrategyId(strategyFilter || '');
                setBulkVariantKey('');
                setBulkVariantStatus('CLASSIFIED');
                setIsBulkClassifyOpen(true);
              }}
              startIcon={<AccountTreeRoundedIcon fontSize="small" />}
              sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
            >
              Classify Variant
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowBulkTagModal(true)}
              startIcon={<LocalOfferIcon fontSize="small" />}
              sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
            >
              Bulk Tag
            </Button>
            <Button
              size="small"
              variant="contained"
              color="error"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => setShowBulkDeleteConfirm(true)}
              startIcon={bulkDeleteMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon fontSize="small" />}
              sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
            >
              {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete Selected'}
            </Button>
          </Box>
        </Card>
      )}

      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Main Trades Table */}
      <Card sx={{ overflow: 'hidden' }}>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {!caps.isArchived && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      indeterminate={selectedIds.length > 0 && selectedIds.length < trades.length}
                      checked={trades.length > 0 && selectedIds.length === trades.length}
                      onChange={toggleSelectAll}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'tradeDate' || sortBy === 'entryTime'}
                    direction={sortBy === 'tradeDate' || sortBy === 'entryTime' ? sortOrder : 'desc'}
                    onClick={() => handleSort('tradeDate')}
                    sx={{ fontWeight: 700 }}
                  >
                    Date / Time
                  </TableSortLabel>
                </TableCell>
                <TableCell>Account</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'symbol'}
                    direction={sortBy === 'symbol' ? sortOrder : 'asc'}
                    onClick={() => handleSort('symbol')}
                    sx={{ fontWeight: 700 }}
                  >
                    Symbol
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'direction'}
                    direction={sortBy === 'direction' ? sortOrder : 'asc'}
                    onClick={() => handleSort('direction')}
                    sx={{ fontWeight: 700 }}
                  >
                    Side
                  </TableSortLabel>
                </TableCell>
                <TableCell>Setup</TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'entryPrice'}
                    direction={sortBy === 'entryPrice' ? sortOrder : 'desc'}
                    onClick={() => handleSort('entryPrice')}
                    sx={{ fontWeight: 700 }}
                  >
                    Entry
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'exitPrice'}
                    direction={sortBy === 'exitPrice' ? sortOrder : 'desc'}
                    onClick={() => handleSort('exitPrice')}
                    sx={{ fontWeight: 700 }}
                  >
                    Exit
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'quantity'}
                    direction={sortBy === 'quantity' ? sortOrder : 'desc'}
                    onClick={() => handleSort('quantity')}
                    sx={{ fontWeight: 700 }}
                  >
                    Qty
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'fees'}
                    direction={sortBy === 'fees' ? sortOrder : 'desc'}
                    onClick={() => handleSort('fees')}
                    sx={{ fontWeight: 700 }}
                  >
                    Fees
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'calculated.netPnL'}
                    direction={sortBy === 'calculated.netPnL' ? sortOrder : 'desc'}
                    onClick={() => handleSort('calculated.netPnL')}
                    sx={{ fontWeight: 700 }}
                  >
                    Net P&L
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'calculated.realizedRMultiple'}
                    direction={sortBy === 'calculated.realizedRMultiple' ? sortOrder : 'desc'}
                    onClick={() => handleSort('calculated.realizedRMultiple')}
                    sx={{ fontWeight: 700 }}
                  >
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      R-Mult
                      <HelpHint hintKey="metric.rMultiple" />
                    </Box>
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    Discipline
                    <HelpHint hintKey="journal.disciplineScore" />
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={sortBy === 'status'}
                    direction={sortBy === 'status' ? sortOrder : 'desc'}
                    onClick={() => handleSort('status')}
                    sx={{ fontWeight: 700 }}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 8 }}>
                    <CircularProgress size={28} color="primary" />
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: muiTheme.palette.text.secondary }}>
                      Loading trades...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : isPropMode && propAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 8 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: muiTheme.palette.text.primary, mb: 0.5 }}>
                      No Prop Firm Accounts in Scope
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mb: 2 }}>
                      You have selected Prop Mode, but no prop firm challenge accounts exist. Add a prop firm account to start logging and tracking evaluation trades.
                    </Typography>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      component={RouterLink}
                      to="/accounts"
                      startIcon={<AddIcon />}
                      sx={{ fontWeight: 700 }}
                    >
                      Setup Prop Account
                    </Button>
                  </TableCell>
                </TableRow>
              ) : trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 8 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: muiTheme.palette.text.primary }}>
                      No trades match your criteria
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.5, mb: 2 }}>
                      Adjust filters or log a new trade execution
                    </Typography>
                    {!caps.isArchived && (
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        onClick={() => setIsNewTradeModalOpen(true)}
                        startIcon={<AddIcon />}
                      >
                        Log Trade
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((t: any) => {
                  const tradeId = t.id || t._id;
                  const isSelected = selectedIds.includes(tradeId);

                  const entryP = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice);
                  const exitP = Number(t.simpleExecution?.exitPrice ?? t.calculated?.averageExitPrice);
                  const qty = Number(t.simpleExecution?.quantity ?? t.calculated?.closedQuantity ?? 1);
                  const mult = Number(t.simpleExecution?.contractMultiplier || 1);
                  const costs = Number(t.calculated?.totalCosts ?? 0);

                  // Resilient net PnL resolution: fallback to simple execution if calculated.grossPnL is 0 for a closed trade with valid exit
                  let effectiveNetPnL = t.calculated?.netPnL;
                  if (
                    t.status === 'CLOSED' &&
                    entryP > 0 &&
                    exitP > 0 &&
                    entryP !== exitP &&
                    (t.calculated?.grossPnL === 0 || t.calculated?.closedQuantity === 0 || effectiveNetPnL === undefined)
                  ) {
                    const priceDiff = t.direction === 'SHORT' ? entryP - exitP : exitP - entryP;
                    effectiveNetPnL = Number((priceDiff * qty * mult - costs).toFixed(2));
                  }

                  let effectiveRealizedR = t.calculated?.realizedRMultiple;
                  if (
                    effectiveNetPnL !== undefined &&
                    (effectiveRealizedR === undefined || effectiveRealizedR === null || (effectiveRealizedR <= 0 && effectiveNetPnL > 0)) &&
                    entryP > 0 &&
                    t.risk?.initialStopLoss &&
                    Number(t.risk.initialStopLoss) > 0
                  ) {
                    const stopDist = Math.abs(entryP - Number(t.risk.initialStopLoss));
                    const riskBudget = stopDist * qty * mult;
                    if (riskBudget > 0) {
                      effectiveRealizedR = Number((effectiveNetPnL / riskBudget).toFixed(2));
                    }
                  }

                  const isWin = (effectiveNetPnL || 0) > 0;
                  const isLoss = (effectiveNetPnL || 0) < 0;

                  return (
                    <TableRow
                      key={tradeId}
                      hover
                      selected={isSelected}
                      sx={{
                        '&:last-child td, &:last-child th': { border: 0 },
                      }}
                    >
                      {!caps.isArchived && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={isSelected}
                            onChange={() => toggleSelect(tradeId)}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary, whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: `'JetBrains Mono', monospace`,
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: muiTheme.palette.text.primary,
                              lineHeight: 1.2,
                            }}
                          >
                            {t.tradeDate}
                          </Typography>
                          {t.entryTime && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: `'JetBrains Mono', monospace`,
                                fontSize: '0.68rem',
                                color: muiTheme.palette.text.secondary,
                                lineHeight: 1.1,
                                mt: 0.25,
                              }}
                            >
                              {new Date(t.entryTime).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: muiTheme.palette.text.secondary, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.accountName}>
                        {t.accountName}
                      </TableCell>
                      <TableCell sx={{ minWidth: 150 }}>
                        <TradeInstrumentBadge
                          trade={t}
                          linkToTrade={true}
                          size="small"
                          onFilterUnderlying={(und) => {
                            setSearch(und);
                            setPage(1);
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev);
                              next.set('search', und);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Chip
                          label={t.direction}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            backgroundColor:
                              t.direction === 'LONG'
                                ? muiTheme.palette.profit.bg
                                : muiTheme.palette.loss.bg,
                            color:
                              t.direction === 'LONG'
                                ? muiTheme.palette.profit.main
                                : muiTheme.palette.loss.main,
                            border: `1px solid ${
                              t.direction === 'LONG'
                                ? isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'
                                : isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(220, 38, 38, 0.25)'
                            }`,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.8125rem',
                              color: muiTheme.palette.text.primary,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={t.strategyName || t.tradeTitle}
                          >
                            {t.strategyName || t.tradeTitle || '—'}
                          </Typography>
                          {t.setup?.variantKey ? (
                            <Chip
                              label={t.setup.variantKey}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.5625rem',
                                fontWeight: 700,
                                alignSelf: 'flex-start',
                                bgcolor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                                color: 'primary.main',
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)',
                              }}
                            />
                          ) : t.setup?.variantStatus === 'UNCLASSIFIED' ? (
                            <Chip
                              label="Unclassified"
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 16,
                                fontSize: '0.5625rem',
                                alignSelf: 'flex-start',
                                color: 'text.secondary',
                              }}
                            />
                          ) : null}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {formatPrice(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {formatPrice(t.simpleExecution?.exitPrice ?? t.calculated?.averageExitPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {formatPrice(t.simpleExecution?.quantity ?? t.calculated?.closedQuantity)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary }}>
                        {formatCurrency(t.calculated?.totalCosts, t.currency)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontFamily: `'JetBrains Mono', monospace`,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          color: isWin
                            ? muiTheme.palette.profit.main
                            : isLoss
                            ? muiTheme.palette.loss.main
                            : muiTheme.palette.text.secondary,
                        }}
                      >
                        {formatCurrency(effectiveNetPnL, t.currency)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                        {formatR(effectiveRealizedR)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={t.psychology?.disciplineScore ? `${t.psychology.disciplineScore}/5` : '—'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.05)',
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={t.status}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
                            color: muiTheme.palette.text.secondary,
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          {!caps.isArchived && (t.status === 'OPEN' || t.status === 'PLANNED') && (
                            <Tooltip title="Quick Close Trade" arrow>
                              <IconButton
                                size="small"
                                onClick={() => setQuickCloseTrade(t)}
                                sx={{
                                  color: muiTheme.palette.primary.main,
                                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.08)',
                                  border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.2)'}`,
                                  '&:hover': {
                                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(5, 150, 105, 0.18)',
                                  },
                                }}
                              >
                                <CheckCircleRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="View Details" arrow>
                            <IconButton
                              component={RouterLink}
                              to={`/trades/${t.id}`}
                              size="small"
                              sx={{ color: muiTheme.palette.text.secondary }}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!caps.isArchived && (
                            <>
                              <Tooltip title="Edit Trade" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => setEditingTrade(t)}
                                  sx={{
                                    color: muiTheme.palette.text.secondary,
                                    '&:hover': { color: muiTheme.palette.primary.main },
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Duplicate Setup" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => duplicateMutation.mutate(tradeId)}
                                  disabled={duplicateMutation.isPending}
                                  sx={{
                                    color: muiTheme.palette.text.secondary,
                                    '&:hover': { color: muiTheme.palette.primary.main },
                                  }}
                                >
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Trade" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteConfirmId(tradeId);
                                  }}
                                  sx={{
                                    color: muiTheme.palette.text.secondary,
                                    '&:hover': { color: muiTheme.palette.error.main },
                                  }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination Bar */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 1.5,
            borderTop: `1px solid ${muiTheme.palette.divider}`,
            gap: 2,
          }}
        >
          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
            Showing {trades.length} of {pagination.totalCount} total trades (Page {pagination.page} of{' '}
            {pagination.totalPages || 1})
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FormControl size="small">
              <Select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                sx={{ height: 32, fontSize: '0.75rem' }}
              >
                <MenuItem value={25}>25 / page</MenuItem>
                <MenuItem value={50}>50 / page</MenuItem>
                <MenuItem value={100}>100 / page</MenuItem>
              </Select>
            </FormControl>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              startIcon={<ChevronLeftIcon fontSize="small" />}
              sx={{ height: 32, fontSize: '0.75rem', fontWeight: 600 }}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              endIcon={<ChevronRightIcon fontSize="small" />}
              sx={{ height: 32, fontSize: '0.75rem', fontWeight: 600 }}
            >
              Next
            </Button>
          </Box>
        </Box>
      </Card>

      {/* Manual Trade Entry Modal */}
      <TradeFormModal
        isOpen={isNewTradeModalOpen}
        onClose={() => setIsNewTradeModalOpen(false)}
        defaultAccountId={selectedAccountId !== 'ALL' ? selectedAccountId : undefined}
      />

      {/* Edit Trade Modal */}
      {editingTrade && (
        <TradeFormModal
          isOpen={Boolean(editingTrade)}
          onClose={() => setEditingTrade(null)}
          editTradeId={editingTrade.id || editingTrade._id}
          initialValues={editingTrade}
        />
      )}

      {/* Bulk Tag Dialog */}
      <Dialog
        open={showBulkTagModal}
        onClose={() => setShowBulkTagModal(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 3 } },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Add Tags to Selected Trades</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mb: 2 }}>
            Add comma-separated tags to the {selectedIds.length} selected trades:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            placeholder="e.g. TrendFollow, Breakout, A-Plus"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowBulkTagModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              const tags = bulkTagInput.split(',').map((t) => t.trim()).filter(Boolean);
              if (tags.length > 0) {
                bulkTagMutation.mutate({ ids: selectedIds, tags });
              }
            }}
          >
            Apply Tags
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Classify Setup Variant Dialog */}
      <Dialog
        open={isBulkClassifyOpen}
        onClose={() => setIsBulkClassifyOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Classify Setup Variant ({selectedIds.length} Trades)
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Assign parent strategy and child setup variant to {selectedIds.length} selected trades:
          </Typography>

          <FormControl fullWidth size="small">
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
              Parent Strategy
            </Typography>
            <Select
              value={bulkStrategyId}
              onChange={(e) => {
                setBulkStrategyId(e.target.value);
                setBulkVariantKey('');
              }}
              displayEmpty
            >
              <MenuItem value="">
                <em>Keep Current Strategy</em>
              </MenuItem>
              {strategiesList.map((strat: any) => {
                const sId = strat.id || strat._id;
                return (
                  <MenuItem key={sId} value={sId}>
                    {strat.name}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {(() => {
            const strat = strategiesList.find((s) => (s.id || s._id) === bulkStrategyId);
            const stratVariants = strat?.variants || [];

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <FormControl fullWidth size="small">
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Child Setup Variant
                  </Typography>
                  {stratVariants.length > 0 ? (
                    <Select
                      value={bulkVariantKey}
                      onChange={(e) => setBulkVariantKey(e.target.value)}
                      displayEmpty
                    >
                      <MenuItem value="">
                        <em>None / Unclassified</em>
                      </MenuItem>
                      {stratVariants.map((v: any) => (
                        <MenuItem key={v.key} value={v.key}>
                          {v.name} ({v.key})
                        </MenuItem>
                      ))}
                    </Select>
                  ) : (
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="e.g. VAR-01, BULL-SSL-EQL"
                      value={bulkVariantKey}
                      onChange={(e) => setBulkVariantKey(e.target.value.toUpperCase())}
                      helperText={strat ? 'No variants defined on this strategy yet; type custom key' : 'Select a strategy or type a custom variant key'}
                    />
                  )}
                </FormControl>

                <FormControl fullWidth size="small">
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Variant Status
                  </Typography>
                  <Select
                    value={bulkVariantStatus}
                    onChange={(e) => setBulkVariantStatus(e.target.value as any)}
                  >
                    <MenuItem value="CLASSIFIED">CLASSIFIED (Variant Verified)</MenuItem>
                    <MenuItem value="UNCLASSIFIED">UNCLASSIFIED (Pending Classification)</MenuItem>
                    <MenuItem value="NOT_APPLICABLE">NOT_APPLICABLE (Discretionary)</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setIsBulkClassifyOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={bulkClassifyMutation.isPending}
            onClick={() => {
              bulkClassifyMutation.mutate({
                tradeIds: selectedIds,
                strategyId: bulkStrategyId || undefined,
                variantKey: bulkVariantKey || undefined,
                variantStatus: bulkVariantStatus,
              });
            }}
          >
            {bulkClassifyMutation.isPending ? 'Applying...' : 'Apply Classification'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Single Trade Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteConfirmId)}
        title="Delete Trade"
        message="Are you sure you want to permanently delete this trade record? This action cannot be undone."
        confirmLabel="Delete Trade"
        isLoading={deleteMutation.isPending}
        error={deleteError}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setDeleteConfirmId(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => {
          if (deleteConfirmId) {
            deleteMutation.mutate(deleteConfirmId);
          }
        }}
      />

      {/* Bulk Delete Trades Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="Delete Selected Trades"
        message={`Are you sure you want to permanently delete ${selectedIds.length} selected trade record(s)? This action cannot be undone.`}
        confirmLabel={`Delete ${selectedIds.length} Trades`}
        isLoading={bulkDeleteMutation.isPending}
        error={actionError}
        onCancel={() => {
          if (!bulkDeleteMutation.isPending) {
            setShowBulkDeleteConfirm(false);
          }
        }}
        onConfirm={() => {
          bulkDeleteMutation.mutate(selectedIds);
        }}
      />

      {/* Quick Close Trade Dialog */}
      <QuickCloseTradeDialog
        open={Boolean(quickCloseTrade)}
        onClose={() => setQuickCloseTrade(null)}
        trade={quickCloseTrade}
        accountBroker={quickCloseTrade?.accountId?.broker || quickCloseTrade?.accountBroker || 'ZERODHA'}
      />
    </Box>
  );
}
