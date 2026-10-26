import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Drawer from '@mui/material/Drawer';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import TableSortLabel from '@mui/material/TableSortLabel';
import Dialog from '@mui/material/Dialog';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOffRounded';
import CollectionsIcon from '@mui/icons-material/CollectionsRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import OpenInNewIcon from '@mui/icons-material/OpenInNewRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineRounded';

import { api } from '../lib/api.js';
import { formatCurrency, formatPercent, formatR } from '../lib/utils.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';

type SortColumn =
  | 'key'
  | 'closedTrades'
  | 'winRate'
  | 'netPnL'
  | 'profitFactor'
  | 'avgR'
  | 'maxDrawdown'
  | 'adherenceRate';

export function StrategyVariantAnalyticsPage() {
  const { openDrill } = useTradeDrilldown();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const { selectedAccountId } = useOutletContext<{ selectedAccountId?: string }>() || {};

  const backTarget = (location.state as any)?.from;

  const handleBack = () => {
    if (backTarget) {
      navigate(backTarget);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/strategies');
    }
  };

  const backTooltipTitle = backTarget?.includes('/trades/')
    ? 'Back to Trade'
    : backTarget === '/strategies'
    ? 'Back to Playbook'
    : 'Back';

  // Filter states
  const [datePreset, setDatePreset] = useState<'ALL' | '30D' | '90D' | 'YTD'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<string>('');
  const [entryModelFilter, setEntryModelFilter] = useState<string>('');
  const [momentumFilter, setMomentumFilter] = useState<string>('');

  // Table sort
  const [orderBy, setOrderBy] = useState<SortColumn>('closedTrades');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  // Drawer drill-down
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Quick Preset handler
  const handlePresetChange = (preset: 'ALL' | '30D' | '90D' | 'YTD') => {
    setDatePreset(preset);
    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === '30D') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === '90D') {
      const past = new Date();
      past.setDate(past.getDate() - 90);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'YTD') {
      const ytd = new Date(today.getFullYear(), 0, 1);
      setStartDate(ytd.toISOString().split('T')[0]);
      setEndDate(endStr);
    }
  };

  // Reset filters
  const resetFilters = () => {
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setSymbolFilter('');
    setDirectionFilter('');
    setEntryModelFilter('');
    setMomentumFilter('');
  };

  // Queries
  const { data: strategy, isLoading: isStrategyLoading } = useQuery({
    queryKey: ['strategy', id],
    queryFn: () => api.strategies.get(id!),
    enabled: !!id,
  });

  const queryParams = useMemo(() => {
    const params: Record<string, any> = {};
    if (selectedAccountId && selectedAccountId !== 'ALL') params.accountId = selectedAccountId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (symbolFilter.trim()) params.symbol = symbolFilter.trim();
    if (directionFilter) params.direction = directionFilter;
    if (entryModelFilter) params.entryModel = entryModelFilter;
    if (momentumFilter) params.momentum = momentumFilter;
    return params;
  }, [selectedAccountId, startDate, endDate, symbolFilter, directionFilter, entryModelFilter, momentumFilter]);

  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    error: analyticsError,
  } = useQuery({
    queryKey: ['strategy-analytics', id, queryParams],
    queryFn: () => api.strategies.getAnalytics(id!, queryParams),
    enabled: !!id,
  });

  const analytics = analyticsData?.data || analyticsData;

  // Sorting buckets with nulls always sorted last
  const sortedBuckets = useMemo(() => {
    if (!analytics?.buckets) return [];
    const list = [...analytics.buckets];

    return list.sort((a: any, b: any) => {
      const valA = a[orderBy];
      const valB = b[orderBy];

      // Nulls last invariant
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'string') {
        const comp = valA.localeCompare(String(valB));
        return order === 'asc' ? comp : -comp;
      }

      const numA = Number(valA);
      const numB = Number(valB);
      return order === 'asc' ? numA - numB : numB - numA;
    });
  }, [analytics?.buckets, orderBy, order]);

  const handleRequestSort = (property: SortColumn) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Drawer trades query for selected bucket
  const selectedBucket = useMemo(() => {
    if (!selectedBucketKey || !analytics?.buckets) return null;
    return analytics.buckets.find((b: any) => b.key === selectedBucketKey) || null;
  }, [selectedBucketKey, analytics?.buckets]);

  const drawerTradesQueryParams = useMemo(() => {
    if (!selectedBucketKey) return null;
    const params: Record<string, any> = { strategyId: id, limit: 100 };
    if (selectedAccountId && selectedAccountId !== 'ALL') params.accountId = selectedAccountId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (symbolFilter.trim()) params.symbol = symbolFilter.trim();
    if (directionFilter) params.direction = directionFilter;

    if (selectedBucketKey === 'UNCLASSIFIED') {
      params.variantStatus = 'UNCLASSIFIED';
    } else if (selectedBucketKey === 'NOT_APPLICABLE') {
      params.variantStatus = 'NOT_APPLICABLE';
    } else {
      params.variantKey = selectedBucketKey;
    }
    return params;
  }, [selectedBucketKey, id, selectedAccountId, startDate, endDate, symbolFilter, directionFilter]);

  const { data: drawerTradesData, isLoading: isDrawerLoading } = useQuery({
    queryKey: ['variant-trades-drilldown', drawerTradesQueryParams],
    queryFn: () => (drawerTradesQueryParams ? api.trades.list(drawerTradesQueryParams) : Promise.resolve({ data: [] as any[], pagination: {} as any })),
    enabled: !!drawerTradesQueryParams,
  });

  const drawerTrades = drawerTradesData?.data || [];

  if (isStrategyLoading || isAnalyticsLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">
          Computing Strategy Variant analytics...
        </Typography>
      </Box>
    );
  }

  if (analyticsError || !analytics) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load analytics: {(analyticsError as any)?.message || 'Strategy not found or no data available'}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
          {backTooltipTitle}
        </Button>
      </Box>
    );
  }

  const parentMetrics = analytics.parent;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header & Breadcrumb */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title={backTooltipTitle} arrow>
            <IconButton onClick={handleBack} sx={{ border: `1px solid ${muiTheme.palette.divider}` }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {analytics.strategy?.name || strategy?.name || 'Strategy'}
              </Typography>
              <Chip label="Variant Analytics" size="small" color="primary" sx={{ fontWeight: 700 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Parent Strategy & Child Setup Variant classification, adherence, and performance breakdown.
            </Typography>
          </Box>
        </Box>

        {/* Quick Date Presets */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {(['ALL', '30D', '90D', 'YTD'] as const).map((p) => (
            <Button
              key={p}
              size="small"
              variant={datePreset === p ? 'contained' : 'outlined'}
              onClick={() => handlePresetChange(p)}
              sx={{ textTransform: 'none', fontWeight: 600, minWidth: 60 }}
            >
              {p === 'ALL' ? 'All Time' : p}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Filter Toolbar */}
      <Card sx={{ p: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <TextField
          label="Start Date"
          type="date"
          size="small"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setDatePreset('ALL');
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 150 }}
        />
        <TextField
          label="End Date"
          type="date"
          size="small"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setDatePreset('ALL');
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 150 }}
        />
        <TextField
          label="Symbol"
          size="small"
          placeholder="e.g. NIFTY, AAPL"
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          sx={{ width: 150 }}
        />
        <FormControl size="small" sx={{ width: 130 }}>
          <InputLabel>Direction</InputLabel>
          <Select
            label="Direction"
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
          >
            <MenuItem value="">All Directions</MenuItem>
            <MenuItem value="LONG">LONG</MenuItem>
            <MenuItem value="SHORT">SHORT</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: 160 }}>
          <InputLabel>Entry Model</InputLabel>
          <Select
            label="Entry Model"
            value={entryModelFilter}
            onChange={(e) => setEntryModelFilter(e.target.value)}
          >
            <MenuItem value="">All Models</MenuItem>
            <MenuItem value="CONFIRMATION_CANDLE">Confirmation Candle</MenuItem>
            <MenuItem value="RETEST">Retest</MenuItem>
            <MenuItem value="OTHER">Other</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: 160 }}>
          <InputLabel>Momentum</InputLabel>
          <Select
            label="Momentum"
            value={momentumFilter}
            onChange={(e) => setMomentumFilter(e.target.value)}
          >
            <MenuItem value="">All Relations</MenuItem>
            <MenuItem value="WITH_HTF">With HTF</MenuItem>
            <MenuItem value="AGAINST_HTF">Against HTF</MenuItem>
            <MenuItem value="UNKNOWN">Unknown</MenuItem>
          </Select>
        </FormControl>

        <Button
          startIcon={<FilterAltOffIcon />}
          size="small"
          onClick={resetFilters}
          color="inherit"
          sx={{ ml: 'auto', textTransform: 'none' }}
        >
          Reset Filters
        </Button>
      </Card>

      {/* Parent Strategy Metrics Overview */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Card
            onClick={() =>
              openDrill({
                kind: 'FILTER',
                filter: { strategyId: id },
                label: `${strategy?.name || 'Strategy'} Closed Trades`,
              })
            }
            sx={{
              p: 2,
              height: '100%',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              '&:hover': {
                borderColor: muiTheme.palette.primary.main,
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
              },
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Closed Trades
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
              {parentMetrics.closedTrades}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Open: {parentMetrics.statusCounts?.OPEN || 0} | Plan: {parentMetrics.statusCounts?.PLANNED || 0}
            </Typography>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="caption" color="text.secondary">
              Win Rate
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                mt: 0.5,
                color: (parentMetrics.winRate || 0) >= 50 ? 'success.main' : 'text.primary',
              }}
            >
              {formatPercent(parentMetrics.winRate || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {parentMetrics.wins}W / {parentMetrics.losses}L / {parentMetrics.breakeven}BE
            </Typography>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="caption" color="text.secondary">
              Net P&L
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                mt: 0.5,
                color: (parentMetrics.netPnL || 0) >= 0 ? 'success.main' : 'error.main',
              }}
            >
              {formatCurrency(parentMetrics.netPnL || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Costs: {formatCurrency(parentMetrics.totalCosts || 0)}
            </Typography>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="caption" color="text.secondary">
              Profit Factor
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                {parentMetrics.profitFactorState === 'NO_LOSSES'
                  ? 'No Losses'
                  : parentMetrics.profitFactorState === 'NO_TRADES'
                  ? '—'
                  : parentMetrics.profitFactor?.toFixed(2) || '—'}
              </Typography>
              {parentMetrics.profitFactorState === 'NO_LOSSES' && (
                <Chip label="100% Win" size="small" color="success" sx={{ height: 20, fontSize: '0.625rem' }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Gross Win: {formatCurrency(parentMetrics.grossProfit || 0)}
            </Typography>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="caption" color="text.secondary">
              Realized Net R
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                mt: 0.5,
                color: (parentMetrics.netR || 0) >= 0 ? 'success.main' : 'error.main',
              }}
            >
              {parentMetrics.netR !== null ? formatR(parentMetrics.netR) : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Avg R: {parentMetrics.avgR !== null ? formatR(parentMetrics.avgR) : '—'} (
              {Math.round((parentMetrics.rCoverage || 0) * 100)}% cov)
            </Typography>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="caption" color="text.secondary">
              Max Drawdown
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                mt: 0.5,
                color: parentMetrics.maxDrawdown > 0 ? 'error.main' : 'text.primary',
              }}
            >
              {formatCurrency(parentMetrics.maxDrawdown || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Adherence: {formatPercent(parentMetrics.adherenceRate || 0)} (as recorded)
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Setup Variant Comparison Table */}
      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Mutually Exclusive Setup Variant Breakdown
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Invariant: Sum of variant bucket closed trades ({analytics.buckets.reduce((acc: number, b: any) => acc + b.closedTrades, 0)}) equals parent closed trades ({parentMetrics.closedTrades}).
            </Typography>
          </Box>
          <Chip label={`${sortedBuckets.length} Buckets`} size="small" variant="outlined" />
        </Box>

        <TableContainer component={Paper} elevation={0}>
          <Table size="medium">
            <TableHead sx={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)' }}>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'key'}
                    direction={orderBy === 'key' ? order : 'asc'}
                    onClick={() => handleRequestSort('key')}
                  >
                    Setup Variant
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'closedTrades'}
                    direction={orderBy === 'closedTrades' ? order : 'asc'}
                    onClick={() => handleRequestSort('closedTrades')}
                  >
                    Trades (N)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'winRate'}
                    direction={orderBy === 'winRate' ? order : 'asc'}
                    onClick={() => handleRequestSort('winRate')}
                  >
                    Win Rate
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'netPnL'}
                    direction={orderBy === 'netPnL' ? order : 'asc'}
                    onClick={() => handleRequestSort('netPnL')}
                  >
                    Net P&L
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'profitFactor'}
                    direction={orderBy === 'profitFactor' ? order : 'asc'}
                    onClick={() => handleRequestSort('profitFactor')}
                  >
                    Profit Factor
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'avgR'}
                    direction={orderBy === 'avgR' ? order : 'asc'}
                    onClick={() => handleRequestSort('avgR')}
                  >
                    Avg R (Net R)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'maxDrawdown'}
                    direction={orderBy === 'maxDrawdown' ? order : 'asc'}
                    onClick={() => handleRequestSort('maxDrawdown')}
                  >
                    Max DD
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'adherenceRate'}
                    direction={orderBy === 'adherenceRate' ? order : 'asc'}
                    onClick={() => handleRequestSort('adherenceRate')}
                  >
                    Adherence
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Avg MFE</TableCell>
                <TableCell align="right">Avg MAE</TableCell>
                <TableCell align="right">Exit Eff</TableCell>
                <TableCell align="center">Sample Size & Edge</TableCell>
                <TableCell align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedBuckets.map((bucket: any) => {
                const isSystem = bucket.isSystemBucket;
                const isZero = bucket.closedTrades === 0;

                return (
                  <TableRow
                    key={bucket.key}
                    hover
                    sx={{
                      backgroundColor: isSystem ? (isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.01)') : 'inherit',
                      opacity: isZero ? 0.7 : 1,
                    }}
                  >
                    {/* Variant Key & Name */}
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                            {bucket.key}
                          </Typography>
                          {bucket.isActive === false && (
                            <Chip label="Archived" size="small" sx={{ height: 18, fontSize: '0.625rem' }} />
                          )}
                          {isSystem && (
                            <Chip label="System Bucket" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {bucket.name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Trades count */}
                    <TableCell
                      align="right"
                      onClick={() => {
                        if (!isZero) {
                          openDrill({
                            kind: 'FILTER',
                            filter: {
                              strategyId: id,
                              variantKey: bucket.key === 'UNASSIGNED' ? undefined : bucket.key,
                            },
                            label: `Variant: ${bucket.name || bucket.key}`,
                          });
                        }
                      }}
                      sx={{ cursor: isZero ? 'default' : 'pointer' }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                        {bucket.closedTrades}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {bucket.wins}W / {bucket.losses}L / {bucket.breakeven}BE
                      </Typography>
                    </TableCell>

                    {/* Win Rate */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: (bucket.winRate || 0) >= 50 ? 'success.main' : isZero ? 'text.secondary' : 'error.main',
                        }}
                      >
                        {bucket.winRate !== null ? formatPercent(bucket.winRate) : '—'}
                      </Typography>
                    </TableCell>

                    {/* Net P&L */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: bucket.netPnL > 0 ? 'success.main' : bucket.netPnL < 0 ? 'error.main' : 'text.primary',
                        }}
                      >
                        {formatCurrency(bucket.netPnL || 0)}
                      </Typography>
                    </TableCell>

                    {/* Profit Factor */}
                    <TableCell align="right">
                      {bucket.profitFactorState === 'NO_LOSSES' ? (
                        <Chip label="No Losses" size="small" color="success" sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }} />
                      ) : bucket.profitFactorState === 'NO_TRADES' ? (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          {bucket.profitFactor !== null ? bucket.profitFactor.toFixed(2) : '—'}
                        </Typography>
                      )}
                    </TableCell>

                    {/* R Multiple */}
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontFamily: `'JetBrains Mono', monospace`,
                            color: (bucket.avgR || 0) >= 0 ? 'success.main' : 'error.main',
                          }}
                        >
                          {bucket.avgR !== null ? formatR(bucket.avgR) : '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Net: {bucket.netR !== null ? formatR(bucket.netR) : '—'} ({Math.round(bucket.rCoverage * 100)}% cov)
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Max Drawdown */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: bucket.maxDrawdown > 0 ? 'error.main' : 'text.primary',
                        }}
                      >
                        {formatCurrency(bucket.maxDrawdown || 0)}
                      </Typography>
                    </TableCell>

                    {/* Adherence Rate */}
                    <TableCell align="right">
                      <Tooltip title="Discipline adherence as recorded in trade logs" arrow>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          {bucket.adherenceRate !== null ? formatPercent(bucket.adherenceRate) : '—'}
                        </Typography>
                      </Tooltip>
                    </TableCell>

                    {/* Excursion Avg MFE */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: bucket.avgMfeR !== null && bucket.avgMfeR !== undefined ? 'success.main' : 'text.secondary',
                        }}
                      >
                        {bucket.avgMfeR !== null && bucket.avgMfeR !== undefined ? `+${bucket.avgMfeR}R` : '—'}
                      </Typography>
                    </TableCell>

                    {/* Excursion Avg MAE */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: bucket.avgMaeR !== null && bucket.avgMaeR !== undefined ? 'error.main' : 'text.secondary',
                        }}
                      >
                        {bucket.avgMaeR !== null && bucket.avgMaeR !== undefined ? `-${bucket.avgMaeR}R` : '—'}
                      </Typography>
                    </TableCell>

                    {/* Excursion Exit Efficiency */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: 'text.primary',
                        }}
                      >
                        {bucket.avgExitEfficiency !== null && bucket.avgExitEfficiency !== undefined ? `${(bucket.avgExitEfficiency * 100).toFixed(1)}%` : '—'}
                      </Typography>
                    </TableCell>

                    {/* Sample Size & Edge */}
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title={bucket.sampleSize?.warningText || 'Sample size is statistically adequate (N >= 30)'} arrow>
                          <Chip
                            label={
                              bucket.sampleSize?.level === 'ADEQUATE'
                                ? 'N ≥ 30'
                                : bucket.sampleSize?.level === 'LOW'
                                ? 'Low (N < 30)'
                                : 'Very Low (N < 10)'
                            }
                            size="small"
                            color={
                              bucket.sampleSize?.level === 'ADEQUATE'
                                ? 'success'
                                : bucket.sampleSize?.level === 'LOW'
                                ? 'warning'
                                : 'default'
                            }
                            sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
                          />
                        </Tooltip>

                        {bucket.edgeVerdict && (
                          <Chip
                            label={bucket.edgeVerdict}
                            size="small"
                            color={
                              bucket.edgeVerdict === 'LIKELY_EDGE'
                                ? 'success'
                                : bucket.edgeVerdict === 'NO_EDGE_NEGATIVE'
                                ? 'error'
                                : 'default'
                            }
                            sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }}
                          />
                        )}
                      </Box>
                    </TableCell>

                    {/* Drill-down action */}
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          openDrill({
                            kind: 'FILTER',
                            filter: {
                              strategyId: id,
                              variantKey: bucket.key === 'UNASSIGNED' ? undefined : bucket.key,
                            },
                            label: `Variant: ${bucket.name || bucket.key}`,
                          })
                        }
                        disabled={isZero}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
                      >
                        View Trades
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Trades Drill-Down Slide-Over Drawer */}
      <Drawer
        anchor="right"
        open={Boolean(selectedBucketKey)}
        onClose={() => setSelectedBucketKey(null)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 600, md: 720 },
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Variant Drill-Down: {selectedBucket?.name || selectedBucketKey}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Key: {selectedBucketKey} | {selectedBucket?.closedTrades || 0} Trades | Net P&L:{' '}
              {formatCurrency(selectedBucket?.netPnL || 0)}
            </Typography>
          </Box>
          <IconButton onClick={() => setSelectedBucketKey(null)}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider />

        {isDrawerLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={30} />
          </Box>
        ) : drawerTrades.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
            No trades found in this variant bucket with active filters.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
            {drawerTrades.map((t: any) => {
              const tradeId = t.id || t._id;
              const netPnL = t.calculated?.netPnL ?? 0;
              const rMult = t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple;
              const screenshots = t.screenshotIds || [];

              return (
                <Card key={tradeId} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        {t.symbol}
                      </Typography>
                      <Chip
                        label={t.direction}
                        size="small"
                        color={t.direction === 'LONG' ? 'success' : 'error'}
                        sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                      />
                      <Chip
                        label={t.status}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.625rem' }}
                      />
                    </Box>

                    <Button
                      size="small"
                      endIcon={<OpenInNewIcon fontSize="small" />}
                      component={RouterLink}
                      to={`/trades/${tradeId}`}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Open Journal
                    </Button>
                  </Box>

                  <Grid container spacing={1}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Trade Date
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {new Date(t.tradeDate).toISOString().split('T')[0]}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Net P&L
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: netPnL >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {formatCurrency(netPnL)}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        R-Multiple
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: (rMult || 0) >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {rMult !== undefined && rMult !== null ? formatR(rMult) : '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Discipline
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace` }}>
                        {t.psychology?.rulesFollowed ? 'Followed' : 'Violated'}
                      </Typography>
                    </Grid>
                  </Grid>

                  {/* Screenshots gallery thumbnail strip */}
                  {screenshots.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <CollectionsIcon sx={{ fontSize: 14 }} /> Attachments ({screenshots.length})
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', py: 0.5 }}>
                        {screenshots.map((s: any, idx: number) => {
                          const url = s.url || s.thumbnailUrl || (typeof s === 'string' ? s : '');
                          if (!url) return null;
                          return (
                            <Box
                              key={idx}
                              component="img"
                              src={url}
                              alt="Chart setup"
                              onClick={() => setPreviewImage(url)}
                              sx={{
                                width: 70,
                                height: 50,
                                objectFit: 'cover',
                                borderRadius: 1,
                                cursor: 'pointer',
                                border: `1px solid ${muiTheme.palette.divider}`,
                                '&:hover': { borderColor: muiTheme.palette.primary.main },
                              }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  )}
                </Card>
              );
            })}
          </Box>
        )}
      </Drawer>

      {/* Lightbox Dialog for Screenshot Preview */}
      <Dialog open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} maxWidth="lg">
        <Box sx={{ p: 1, position: 'relative' }}>
          <IconButton
            size="small"
            onClick={() => setPreviewImage(null)}
            sx={{ position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          {previewImage && (
            <Box
              component="img"
              src={previewImage}
              alt="Preview"
              sx={{ maxWidth: '100%', maxHeight: '85vh', display: 'block', borderRadius: 1 }}
            />
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
export default StrategyVariantAnalyticsPage;
