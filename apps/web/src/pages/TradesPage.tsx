import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useOutletContext } from 'react-router-dom';
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
import ContentCopyIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import LocalOfferIcon from '@mui/icons-material/LocalOfferRounded';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOffRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import CollectionsIcon from '@mui/icons-material/CollectionsRounded';

import { api } from '../lib/api.js';
import { formatCurrency, formatPercent, formatR } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';

export function TradesPage() {
  const queryClient = useQueryClient();
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals
  const [isNewTradeModalOpen, setIsNewTradeModalOpen] = useState(false);

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
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to duplicate trade setup');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.trades.delete(id),
    onSuccess: () => {
      setDeleteConfirmId(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      setDeleteError(err.message || 'Failed to delete trade record');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.trades.bulkDelete(ids),
    onSuccess: () => {
      setSelectedIds([]);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to delete selected trades');
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
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to apply tags to selected trades');
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
    search || directionFilter || outcomeFilter || statusFilter || assetClassFilter
  );

  const clearFilters = () => {
    setSearch('');
    setDirectionFilter('');
    setOutcomeFilter('');
    setStatusFilter('');
    setAssetClassFilter('');
    setPage(1);
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Export CSV button */}
          <Button
            component="a"
            href={api.exportImport.csvUrl({
              accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
            })}
            download
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.8125rem' }}
          >
            Export CSV
          </Button>

          {/* New Trade button */}
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
        </Box>
      </Box>

      {/* Filter and Search Bar */}
      <Card sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
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

          {/* Sort By */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
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
              <MenuItem value="symbol:asc">Symbol (A-Z)</MenuItem>
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
      {selectedIds.length > 0 && (
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
              onClick={() => {
                if (window.confirm(`Delete ${selectedIds.length} selected trades permanently?`)) {
                  bulkDeleteMutation.mutate(selectedIds);
                }
              }}
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
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={selectedIds.length > 0 && selectedIds.length < trades.length}
                    checked={trades.length > 0 && selectedIds.length === trades.length}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Side</TableCell>
                <TableCell>Setup</TableCell>
                <TableCell align="right">Entry</TableCell>
                <TableCell align="right">Exit</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Fees</TableCell>
                <TableCell align="right">Net P&L</TableCell>
                <TableCell align="right">R-Mult</TableCell>
                <TableCell align="center">Discipline</TableCell>
                <TableCell align="center">Status</TableCell>
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
              ) : trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 8 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: muiTheme.palette.text.primary }}>
                      No trades match your criteria
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.5, mb: 2 }}>
                      Adjust filters or log a new trade execution
                    </Typography>
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      onClick={() => setIsNewTradeModalOpen(true)}
                      startIcon={<AddIcon />}
                    >
                      Log Trade
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((t: any) => {
                  const tradeId = t.id || t._id;
                  const isSelected = selectedIds.includes(tradeId);
                  const isWin = (t.calculated?.netPnL || 0) > 0;
                  const isLoss = (t.calculated?.netPnL || 0) < 0;

                  return (
                    <TableRow
                      key={tradeId}
                      hover
                      selected={isSelected}
                      sx={{
                        '&:last-child td, &:last-child th': { border: 0 },
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={() => toggleSelect(tradeId)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary, whiteSpace: 'nowrap' }}>
                        {t.tradeDate}
                      </TableCell>
                      <TableCell sx={{ color: muiTheme.palette.text.secondary, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.accountName}>
                        {t.accountName}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, whiteSpace: 'nowrap' }}>
                        <RouterLink
                          to={`/trades/${tradeId}`}
                          style={{
                            color: muiTheme.palette.text.primary,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {t.symbol}
                          {t.screenshotIds && t.screenshotIds.length > 0 && (
                            <Tooltip title={`${t.screenshotIds.length} chart screenshot${t.screenshotIds.length > 1 ? 's' : ''} attached`}>
                              <Box
                                component="span"
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  color: muiTheme.palette.primary.main,
                                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                                  px: 0.6,
                                  py: 0.15,
                                  borderRadius: 1,
                                  fontSize: '0.625rem',
                                  fontWeight: 700,
                                }}
                              >
                                <CollectionsIcon sx={{ fontSize: 12 }} />
                                {t.screenshotIds.length}
                              </Box>
                            </Tooltip>
                          )}
                        </RouterLink>
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
                      <TableCell sx={{ color: muiTheme.palette.text.secondary, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.strategyName || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {t.simpleExecution?.entryPrice || t.calculated?.averageEntryPrice || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {t.simpleExecution?.exitPrice || t.calculated?.averageExitPrice || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {t.simpleExecution?.quantity || t.calculated?.closedQuantity || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary }}>
                        {formatCurrency(t.calculated?.totalCosts)}
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
                        {formatCurrency(t.calculated?.netPnL)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                        {formatR(t.calculated?.realizedRMultiple)}
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmId)}
        onClose={() => {
          if (!deleteMutation.isPending) {
            setDeleteConfirmId(null);
            setDeleteError(null);
          }
        }}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 3 } },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Trade</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {deleteError && (
            <Alert severity="error" onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
            Are you sure you want to permanently delete this trade record? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteConfirmId(null);
              setDeleteError(null);
            }}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            startIcon={deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={() => {
              if (deleteConfirmId) {
                deleteMutation.mutate(deleteConfirmId);
              }
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
