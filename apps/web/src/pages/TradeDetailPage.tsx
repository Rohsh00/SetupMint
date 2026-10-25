import React, { useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import ContentCopyIcon from '@mui/icons-material/ContentCopyRounded';
import LinkIcon from '@mui/icons-material/LinkRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import AttachMoneyIcon from '@mui/icons-material/AttachMoneyRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import PsychologyIcon from '@mui/icons-material/PsychologyRounded';
import CollectionsIcon from '@mui/icons-material/CollectionsRounded';
import CloudUploadIcon from '@mui/icons-material/CloudUploadRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import ElectricBoltRoundedIcon from '@mui/icons-material/ElectricBoltRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import moment from 'moment';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { TradeInstrumentBadge } from '../components/trades/TradeInstrumentBadge.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { formatCurrency, formatR } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';
import { TradeScreenshotGallery } from '../components/trades/attachments/TradeScreenshotGallery.js';
import { GenerateExecutionChartsPanel } from '../components/trades/GenerateExecutionChartsPanel.js';
import { QuickCloseTradeDialog } from '../components/trades/QuickCloseTradeDialog.js';
import { HelpHint } from '../components/help/index.js';

export function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isQuickCloseOpen, setIsQuickCloseOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: rawTrade, isLoading, isError } = useQuery({
    queryKey: ['trade', id],
    queryFn: () => api.trades.get(id!),
    enabled: !!id,
  });

  const trade = (rawTrade as any)?.data || rawTrade;

  const { data: strategyData } = useQuery({
    queryKey: ['strategy', trade?.strategyId],
    queryFn: () => api.strategies.get(trade!.strategyId),
    enabled: Boolean(trade?.strategyId),
  });
  const strategy = (strategyData as any)?.data?.strategy || (strategyData as any)?.strategy || strategyData;
  const currentVariant = strategy?.variants?.find((v: any) => v.key === trade?.setup?.variantKey);

  const duplicateMutation = useMutation({
    mutationFn: () => api.trades.duplicate(id!),
    onSuccess: (data: any) => {
      setActionError(null);
      toast.success('Trade duplicated successfully.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      const newId = data?.id || data?.data?.id || data?._id;
      if (newId) {
        navigate(`/trades/${newId}`);
      } else {
        navigate('/trades');
      }
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to duplicate trade setup';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.trades.delete(id!),
    onSuccess: () => {
      setShowDeleteConfirm(false);
      setDeleteError(null);
      toast.success('Trade deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      navigate('/trades');
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete trade record';
      setDeleteError(msg);
      toast.error(msg);
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => api.attachments.upload(id!, file),
    onSuccess: () => {
      setActionError(null);
      toast.success('Chart screenshot uploaded successfully.');
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Screenshot upload failed. Please try again.';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attId: string) => api.attachments.delete(attId),
    onSuccess: () => {
      setActionError(null);
      toast.success('Chart screenshot deleted.');
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete attachment';
      setActionError(msg);
      toast.error(msg);
    },
  });

  const autoClassifyMutation = useMutation({
    mutationFn: () => api.trades.autoClassify(id!),
    onSuccess: (res: any) => {
      toast.success(res?.message || 'Trade classified successfully!');
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Auto classification failed');
    },
  });

  const computeExcursionMutation = useMutation({
    mutationFn: (options?: { provider?: 'AUTO' | 'ANGEL_ONE'; forceRefetch?: boolean }) =>
      api.trades.computeExcursion(id!, options),
    onSuccess: () => {
      setActionError(null);
      toast.success('Excursion metrics computed successfully.');
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to compute excursion metrics';
      setActionError(msg);
      toast.error(msg);
    },
  });


  const detectStopMovesMutation = useMutation({
    mutationFn: () => api.trades.detectStopMoves(id!),
    onSuccess: (data: any) => {
      setActionError(null);
      const summary = data?.data?.stopMoveSummary;
      if (summary?.hasWidenedRisk) {
        toast.warning(`Detected ${summary.widenedCount} risk-widening stop modifications.`);
      } else if (summary?.trailedCount > 0) {
        toast.success(`Detected ${summary.trailedCount} favorable trailing stop modifications.`);
      } else {
        toast.success('Stop move analysis completed. No modifications detected.');
      }
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to detect stop moves for trade';
      setActionError(msg);
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', height: 400, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
        <CircularProgress size={32} color="primary" />
        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
          Loading trade details...
        </Typography>
      </Box>
    );
  }

  if (isError || !trade) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Trade Not Found</Typography>
        <Button variant="contained" onClick={() => navigate('/trades')} startIcon={<ArrowBackIcon />}>
          Back to Trades
        </Button>
      </Box>
    );
  }

  const isWin = (trade.calculated?.netPnL || 0) > 0;
  const isLoss = (trade.calculated?.netPnL || 0) < 0;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {/* Top Header & Actions */}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={() => navigate('/trades')}
            size="small"
            sx={{
              border: `1px solid ${muiTheme.palette.divider}`,
              borderRadius: 2,
              color: muiTheme.palette.text.secondary,
            }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <TradeInstrumentBadge
                trade={trade}
                linkToTrade={false}
                size="large"
                showSubtitle={false}
              />
              <Chip
                label={trade.direction}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor:
                    trade.direction === 'LONG'
                      ? muiTheme.palette.profit.bg
                      : muiTheme.palette.loss.bg,
                  color:
                    trade.direction === 'LONG'
                      ? muiTheme.palette.profit.main
                      : muiTheme.palette.loss.main,
                  border: `1px solid ${
                    trade.direction === 'LONG'
                      ? isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'
                      : isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(220, 38, 38, 0.25)'
                  }`,
                }}
              />
              <Chip
                label={trade.status}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
                  color: muiTheme.palette.text.secondary,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5, display: 'block', fontFamily: `'JetBrains Mono', monospace` }}>
              {trade.instrumentName && trade.instrumentName !== trade.symbol ? `${trade.instrumentName} • ` : ''}{trade.accountName} • {trade.exchange} ({trade.marketSegment}) • {trade.tradeDate}
            </Typography>
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {(trade.status === 'OPEN' || trade.status === 'PLANNED') && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => setIsQuickCloseOpen(true)}
              startIcon={<CheckCircleRoundedIcon fontSize="small" />}
              sx={{ fontWeight: 700, fontSize: '0.75rem', borderRadius: 2 }}
            >
              Close Trade
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                toast.success('Copied to clipboard!');
              } catch {
                toast.error('Failed to copy to clipboard.');
              }
            }}
            startIcon={<LinkIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            Copy Link
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => duplicateMutation.mutate()}
            startIcon={<ContentCopyIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            Duplicate
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setIsEditModalOpen(true)}
            startIcon={<EditIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => setShowDeleteConfirm(true)}
            startIcon={<DeleteOutlineIcon fontSize="small" />}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            Delete
          </Button>
        </Box>
      </Box>

      {/* Summary KPI Banner */}
      <Card sx={{ p: 2.5 }}>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 6, sm: 2.4 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Net Realized P&L
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                color: isWin ? muiTheme.palette.profit.main : isLoss ? muiTheme.palette.loss.main : muiTheme.palette.text.primary,
                mt: 0.5,
              }}
            >
              {formatCurrency(trade.calculated?.netPnL)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 2.4 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Gross P&L
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
              {formatCurrency(trade.calculated?.grossPnL)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 2.4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Costs
              </Typography>
              <HelpHint hintKey="trade.fees.autoManual" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary, mt: 0.5 }}>
              {formatCurrency(trade.calculated?.totalCosts)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 2.4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Realized R
              </Typography>
              <HelpHint hintKey="metric.rMultiple" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
              {formatR(trade.calculated?.realizedRMultiple)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 2.4 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Duration
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
              {trade.calculated?.holdingTimeMinutes ? `${trade.calculated.holdingTimeMinutes}m` : '—'}
            </Typography>
          </Grid>
        </Grid>
      </Card>

      {/* Playbook Strategy & Setup Variant Classification Card */}
      <Card sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 2, mb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}`, flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <AccountTreeRoundedIcon sx={{ color: 'primary.main', fontSize: 22 }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>
                Playbook Strategy & Setup Variant
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Classification, structural criteria, and post-trade execution adherence
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={autoClassifyMutation.isPending}
              onClick={() => autoClassifyMutation.mutate()}
              startIcon={autoClassifyMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRoundedIcon fontSize="small" />}
              sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
            >
              {autoClassifyMutation.isPending ? 'Detecting 4H + 5M...' : 'Auto-Detect Setup (4H + 5M)'}
            </Button>
            {trade.strategyId && (
              <Button
                component={RouterLink}
                to={`/strategies/${trade.strategyId}/analytics`}
                size="small"
                variant="outlined"
                startIcon={<InsightsRoundedIcon fontSize="small" />}
                sx={{ borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 700 }}
              >
                Variant Analytics
              </Button>
            )}
            <Chip
              label={trade.setup?.variantStatus || 'UNCLASSIFIED'}
              size="small"
              color={
                trade.setup?.variantStatus === 'CLASSIFIED'
                  ? 'success'
                  : trade.setup?.variantStatus === 'NOT_APPLICABLE'
                  ? 'default'
                  : 'warning'
              }
              sx={{ fontWeight: 800, fontSize: '0.6875rem' }}
            />
          </Box>
        </Box>

        <Grid container spacing={2.5}>
          {/* Strategy Details */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', border: `1px solid ${muiTheme.palette.divider}`, height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary', display: 'block', mb: 1 }}>
                Parent Strategy
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
                {strategy?.name || trade.strategyName || 'None / Discretionary'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8125rem', mb: 1.5 }}>
                {strategy?.description || 'No parent strategy description logged.'}
              </Typography>

              {strategy?.minRiskReward && (
                <Chip
                  label={`Strategy Target R:R 1:${strategy.minRiskReward}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.625rem', fontWeight: 600 }}
                />
              )}
            </Box>
          </Grid>

          {/* Setup Variant Details */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(99, 102, 241, 0.04)' : 'rgba(99, 102, 241, 0.02)', border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)'}`, height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'primary.main', display: 'block', mb: 1 }}>
                Child Setup Variant
              </Typography>

              {trade.setup?.variantKey ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {currentVariant?.name || trade.setup.variantKey}
                    </Typography>
                    <Chip
                      label={trade.setup.variantKey}
                      size="small"
                      color="primary"
                      sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }}
                    />
                  </Box>

                  {currentVariant?.description && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8125rem', mb: 1.5 }}>
                      {currentVariant.description}
                    </Typography>
                  )}

                  {/* Attributes chips */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                    {trade.setup.htfBias && (
                      <Chip label={`HTF Bias: ${trade.setup.htfBias}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
                    )}
                    {trade.setup.executionTimeframe && (
                      <Chip label={`Execution TF: ${trade.setup.executionTimeframe}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
                    )}
                    {trade.setup.liquiditySide && trade.setup.liquiditySide !== 'NONE' && (
                      <Chip label={`Liquidity: ${trade.setup.liquiditySide}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
                    )}
                    {trade.setup.patternType && (
                      <Chip label={`Pattern: ${trade.setup.patternType}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
                    )}
                    {trade.setup.secondLegStatus && trade.setup.secondLegStatus !== 'NOT_APPLICABLE' && (
                      <Chip label={`Second Leg: ${trade.setup.secondLegStatus}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
                    )}
                    {trade.setup.entryModel && (
                      <Chip label={`Model: ${trade.setup.entryModel}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
                    )}
                  </Box>
                </>
              ) : (
                <Box sx={{ py: 1 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                    This trade does not have an assigned setup variant.
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      disabled={autoClassifyMutation.isPending}
                      onClick={() => autoClassifyMutation.mutate()}
                      startIcon={autoClassifyMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRoundedIcon fontSize="small" />}
                      sx={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'none' }}
                    >
                      {autoClassifyMutation.isPending ? 'Detecting 4H + 5M...' : 'Auto-Detect Setup (4H + 5M)'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setIsEditModalOpen(true)}
                      sx={{ fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      Assign Setup Variant
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>

        {/* Audit Log / Classification Events */}
        {(() => {
          const classificationEvents = (trade.auditLog || []).filter(
            (log: any) =>
              log.event === 'CLASSIFIED' ||
              log.action === 'CLASSIFIED' ||
              log.action === 'AUTO_CLASSIFIED'
          );
          if (classificationEvents.length === 0) return null;

          return (
            <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary', display: 'block', mb: 1 }}>
                Setup Classification Audit History
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Timestamp</TableCell>
                      <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Action</TableCell>
                      <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Variant Transition</TableCell>
                      <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontSize: '0.6875rem', fontWeight: 700 }}>Reason / Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {classificationEvents.map((evt: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          {evt.event || evt.action || 'CLASSIFIED'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.75rem' }}>
                          {evt.previousVariantKey ? (
                            <span>{evt.previousVariantKey} &rarr; <strong>{evt.newVariantKey || 'None'}</strong></span>
                          ) : (
                            <strong>{evt.newVariantKey || 'Initial'}</strong>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={evt.newStatus || 'CLASSIFIED'} size="small" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {evt.reason || 'Manual user classification'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          );
        })()}
      </Card>

      {/* Execution Parameters & Risk Management Row */}
      <Grid container spacing={3}>
        {/* Execution Parameters */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 2, mb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachMoneyIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                Execution Parameters
              </Typography>
              <Chip
                label={`${trade.executionMode} MODE`}
                size="small"
                sx={{ fontSize: '0.625rem', fontWeight: 700, height: 20 }}
              />
            </Box>

            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid size={{ xs: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Entry Price</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                    {trade.simpleExecution?.entryPrice || trade.calculated?.averageEntryPrice}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Exit Price</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                    {trade.simpleExecution?.exitPrice || trade.calculated?.averageExitPrice || '—'}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Quantity</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                    {trade.simpleExecution?.quantity || trade.calculated?.closedQuantity}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Multiplier</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                    x{trade.simpleExecution?.contractMultiplier || 1}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Itemized Charges */}
            <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary, display: 'block', mb: 1 }}>
                Trading Costs Itemization
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Brokerage</Typography>
                  <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                    {formatCurrency(trade.simpleExecution?.brokerage)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Exchange</Typography>
                  <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                    {formatCurrency(trade.simpleExecution?.exchangeFees)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Taxes (STT/GST)</Typography>
                  <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                    {formatCurrency(trade.simpleExecution?.taxes)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Other Fees</Typography>
                  <Typography variant="body2" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 }}>
                    {formatCurrency(trade.simpleExecution?.otherFees)}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Card>
        </Grid>

        {/* Risk Management & Rationale */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 2, mb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                <SecurityIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                Planned Risk vs Outcome
              </Typography>
            </Box>

            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid size={{ xs: 4 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Initial Stop Loss</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                    {trade.risk?.initialStopLoss || '—'}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Planned Target</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                    {trade.risk?.plannedTarget || '—'}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)', textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Risk Budget</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                    {formatCurrency(trade.risk?.riskBudgetAmount)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Technical Rationale */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary, display: 'block', mb: 1 }}>
                Technical Thesis & Entry Rationale
              </Typography>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${muiTheme.palette.divider}`,
                  backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(248, 250, 252, 0.8)',
                  color: muiTheme.palette.text.primary,
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                }}
              >
                {trade.thesis?.entryRationale || 'No written entry rationale logged for this trade.'}
              </Box>

              {trade.thesis?.confluences && trade.thesis.confluences.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                  {trade.thesis.confluences.map((c: string) => (
                    <Chip key={c} label={c} size="small" sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 22 }} />
                  ))}
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Excursion Analytics & Execution Quality Card */}
      {(() => {
        const exc = trade.calculated?.excursion;
        const isComputed = exc?.status === 'COMPUTED';
        const isPending = exc?.status === 'PENDING';
        const isUnavailable = exc?.status === 'UNAVAILABLE';
        const isErrorState = exc?.status === 'ERROR';

        return (
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 2, mb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}`, flexWrap: 'wrap', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <TimelineRoundedIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Excursion Analytics & Execution Quality
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    FYERS-powered Maximum Favorable Excursion (MFE), Adverse Excursion (MAE), and Exit Efficiency
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {exc?.provider && (
                  <Chip
                    label={
                      exc.provider === 'ANGEL_ONE'
                        ? 'ANGEL ONE'
                        : exc.isUnderlyingFallback
                        ? 'UNDERLYING PROXY'
                        : 'FYERS'
                    }
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      backgroundColor:
                        exc.provider === 'ANGEL_ONE'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : exc.isUnderlyingFallback
                          ? 'rgba(168, 85, 247, 0.15)'
                          : 'rgba(6, 182, 212, 0.15)',
                      color:
                        exc.provider === 'ANGEL_ONE'
                          ? '#f59e0b'
                          : exc.isUnderlyingFallback
                          ? '#a855f7'
                          : '#06b6d4',
                      border: `1px solid ${
                        exc.provider === 'ANGEL_ONE'
                          ? 'rgba(245, 158, 11, 0.3)'
                          : exc.isUnderlyingFallback
                          ? 'rgba(168, 85, 247, 0.3)'
                          : 'rgba(6, 182, 212, 0.3)'
                      }`,
                    }}
                  />
                )}

                <Chip
                  label={exc?.status || (trade.status === 'CLOSED' ? 'NOT COMPUTED' : 'TRADE OPEN')}
                  size="small"
                  color={
                    isComputed ? 'success' :
                    isPending ? 'warning' :
                    isErrorState ? 'error' : 'default'
                  }
                  sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                />

                {trade.status === 'CLOSED' && (
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ElectricBoltRoundedIcon fontSize="small" sx={{ color: '#06b6d4' }} />}
                      onClick={() => {
                        const el = document.getElementById('execution-charts-panel');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        borderColor: 'rgba(6, 182, 212, 0.4)',
                        color: '#06b6d4',
                        '&:hover': {
                          borderColor: '#06b6d4',
                          backgroundColor: 'rgba(6, 182, 212, 0.08)',
                        },
                      }}
                    >
                      Execution Charts
                    </Button>

                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        computeExcursionMutation.isPending ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <SyncRoundedIcon fontSize="small" />
                        )
                      }
                      disabled={computeExcursionMutation.isPending}
                      onClick={() => computeExcursionMutation.mutate()}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                    >
                      {isComputed ? 'Recompute' : 'Compute Excursion'}
                    </Button>
                  </>
                )}
              </Box>
            </Box>

            {isComputed && exc ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Grid container spacing={2}>
                  {/* MFE */}
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.04)' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Max Favorable Excursion (MFE)
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.profit.main, mt: 0.5 }}>
                        +{exc.mfePoints} pts
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                        +{formatCurrency(exc.mfeAmount)} {exc.mfeR !== undefined ? `• +${exc.mfeR}R` : ''}
                      </Typography>
                      {exc.timeToMfeMinutes !== undefined && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                          Reached in {exc.timeToMfeMinutes}m
                        </Typography>
                      )}
                    </Box>
                  </Grid>

                  {/* MAE */}
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}`, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.04)' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Max Adverse Excursion (MAE)
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.loss.main, mt: 0.5 }}>
                        -{exc.maePoints} pts
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                        -{formatCurrency(exc.maeAmount)} {exc.maeR !== undefined ? `• -${exc.maeR}R` : ''}
                      </Typography>
                      {exc.timeToMaeMinutes !== undefined && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                          Reached in {exc.timeToMaeMinutes}m
                        </Typography>
                      )}
                    </Box>
                  </Grid>

                  {/* Exit Efficiency */}
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Exit Efficiency
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                        {exc.exitEfficiency !== undefined ? `${(exc.exitEfficiency * 100).toFixed(1)}%` : '—'}
                      </Typography>
                      <Box sx={{ mt: 1, mb: 0.5 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, Math.max(0, (exc.exitEfficiency || 0) * 100))}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor:
                                (exc.exitEfficiency || 0) >= 0.7 ? muiTheme.palette.profit.main :
                                (exc.exitEfficiency || 0) >= 0.4 ? muiTheme.palette.warning.main :
                                muiTheme.palette.loss.main,
                            },
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                        Captured % of maximum favorable run
                      </Typography>
                    </Box>
                  </Grid>

                  {/* Analysis Metadata */}
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Candle Coverage
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, mt: 0.5 }}>
                        {exc.resolution}m • {exc.candleCount || 0} bars
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                        Source: {exc.source || 'FYERS_HISTORY'}
                      </Typography>
                      {exc.stopHit && (
                        <Typography variant="caption" sx={{ color: exc.reversedAfterStopHit ? 'warning.main' : 'text.secondary', fontSize: '0.6875rem', fontWeight: 600 }}>
                          {exc.reversedAfterStopHit ? 'Stop Hit (Reversed)' : 'Stop Hit'}
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                </Grid>

                {/* Excursion Flags & Reversal Alerts */}
                {exc.reversedAfterStopHit && (
                  <Alert severity="warning" sx={{ fontSize: '0.8125rem' }}>
                    <strong>Stop-and-Reverse Evidence Detected:</strong> After your initial stop was hit, market price subsequently reversed and pushed back past your entry price into favorable territory. Consider reviewing if your initial stop was placed inside liquidity or set too tight.
                  </Alert>
                )}

                {exc.excursionFlags && exc.excursionFlags.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Diagnostic Flags:
                    </Typography>
                    {exc.excursionFlags.map((flag: string) => {
                      let label = flag;
                      let color: 'default' | 'warning' | 'info' | 'error' | 'secondary' = 'default';
                      if (flag === 'GAVE_BACK_PROFIT') {
                        label = 'Gave Back Profit (>50% MFE surrendered)';
                        color = 'warning';
                      } else if (flag === 'STOP_TOO_TIGHT_EVIDENCE') {
                        label = 'Stop Too Tight (Post-stop reversal)';
                        color = 'secondary';
                      } else if (flag === 'EXITED_EARLY') {
                        label = 'Exited Early (<50% MFE captured)';
                        color = 'info';
                      } else if (flag === 'HELD_INTO_REVERSAL') {
                        label = 'Held Into Reversal';
                        color = 'error';
                      }
                      return (
                        <Chip
                          key={flag}
                          label={label}
                          size="small"
                          color={color as any}
                          sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 22 }}
                        />
                      );
                    })}
                  </Box>
                )}
              </Box>
            ) : trade.status !== 'CLOSED' ? (
              <Box sx={{ p: 2.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Excursion analysis (MAE, MFE, and Exit Efficiency) is available once the trade is closed with entry/exit timestamps.
                </Typography>
              </Box>
            ) : isUnavailable ? (
              <Box sx={{ p: 2.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                  Historical candle data unavailable for this trade lifecycle {exc?.failureReason ? `(${exc.failureReason})` : ''}.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => computeExcursionMutation.mutate({ provider: 'AUTO' })}
                    disabled={computeExcursionMutation.isPending}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Retry Fetch (Auto)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => computeExcursionMutation.mutate({ provider: 'ANGEL_ONE' })}
                    disabled={computeExcursionMutation.isPending}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Retry with Angel One
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ p: 2.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                  Excursion metrics have not been computed yet for this trade. Compute now using FYERS historical candles to reveal your maximum potential vs captured profit.
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={computeExcursionMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SyncRoundedIcon fontSize="small" />}
                  onClick={() => computeExcursionMutation.mutate()}
                  disabled={computeExcursionMutation.isPending}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Compute Excursion Metrics
                </Button>
              </Box>
            )}
          </Card>
        );
      })()}

      {/* Stop-Loss Modification History & Trail Tracking Card */}
      {(() => {
        const events = trade.stopLossMoveEvents || [];
        const summary = trade.calculated?.stopMoveSummary;
        const isScanned = !!summary || events.length > 0;
        const hasWidened = summary?.hasWidenedRisk || events.some((e: any) => e.moveType === 'WIDENED_RISK');
        const trailedCount = summary?.trailedCount ?? events.filter((e: any) => e.moveType === 'TRAILED_FAVORABLY').length;
        const widenedCount = summary?.widenedCount ?? events.filter((e: any) => e.moveType === 'WIDENED_RISK').length;
        const initialStop = summary?.initialStop ?? trade.risk?.initialStopLoss;
        const finalStop = summary?.finalStop ?? (events.length > 0 ? events[events.length - 1].newStop : null);

        return (
          <Card sx={{ p: 2.5 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                pb: 2,
                mb: 2,
                borderBottom: `1px solid ${muiTheme.palette.divider}`,
                gap: 1.5,
              }}
            >
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon fontSize="small" sx={{ color: '#0EA5E9' }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Stop-Loss Modifications & Trail Tracking
                  </Typography>
                  <HelpHint hintKey="trade.stopMoves.audit" />
                </Box>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, mt: 0.25, display: 'block' }}>
                  FYERS orderbook tracking of stop adjustments, trailing discipline, and downside risk expansion
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {hasWidened ? (
                  <Chip
                    icon={<WarningRoundedIcon fontSize="small" />}
                    label={`RISK WIDENED (${widenedCount})`}
                    color="error"
                    size="small"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                ) : trailedCount > 0 ? (
                  <Chip
                    icon={<CheckCircleRoundedIcon fontSize="small" />}
                    label={`TRAILED FAVORABLY (${trailedCount})`}
                    color="success"
                    size="small"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                  />
                ) : isScanned ? (
                  <Chip
                    label="STOP MAINTAINED"
                    size="small"
                    sx={{ fontWeight: 700, fontSize: '0.6875rem', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)' }}
                  />
                ) : (
                  <Chip
                    label="NOT SCANNED"
                    variant="outlined"
                    size="small"
                    sx={{ fontWeight: 600, fontSize: '0.6875rem' }}
                  />
                )}

                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    detectStopMovesMutation.isPending ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <SyncRoundedIcon fontSize="small" sx={{ color: '#0EA5E9' }} />
                    )
                  }
                  disabled={detectStopMovesMutation.isPending}
                  onClick={() => detectStopMovesMutation.mutate()}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    borderColor: 'rgba(14, 165, 233, 0.4)',
                    color: '#0EA5E9',
                    '&:hover': {
                      borderColor: '#0EA5E9',
                      backgroundColor: 'rgba(14, 165, 233, 0.08)',
                    },
                  }}
                >
                  {isScanned ? 'Rescan Stop Moves' : 'Detect Stop Moves'}
                </Button>
              </Box>
            </Box>

            {/* Violation Alert Callout */}
            {hasWidened && (
              <Alert
                severity="error"
                icon={<WarningRoundedIcon />}
                sx={{
                  mb: 2,
                  borderRadius: 2,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 242, 242, 0.9)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, color: muiTheme.palette.loss.main }}>
                  Discipline Warning: Stop-loss was widened during this trade ({widenedCount} time{widenedCount > 1 ? 's' : ''}), increasing downside capital risk
                  {summary?.netRiskChangePoints ? ` by ${Math.abs(summary.netRiskChangePoints).toFixed(2)} pts` : ''}. This trade has been flagged with the <strong>STOP_MOVED</strong> mistake tag.
                </Typography>
              </Alert>
            )}

            {isScanned ? (
              <>
                {/* Metric Summary Tiles */}
                <Grid container spacing={1.5} sx={{ mb: events.length > 0 ? 2.5 : 0 }}>
                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.7)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                        Initial Stop Loss
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25, fontFamily: `'JetBrains Mono', monospace` }}>
                        {initialStop != null ? Number(initialStop).toFixed(2) : '—'}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.7)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                        Final Stop Loss
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25, fontFamily: `'JetBrains Mono', monospace` }}>
                        {finalStop != null ? Number(finalStop).toFixed(2) : '—'}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.7)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                        Modifications
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25 }}>
                        {summary?.totalMoves ?? events.length}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.7)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                        Trailed Favorably
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25, color: muiTheme.palette.profit.main }}>
                        {trailedCount}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.7)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                        Risk Widened
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          mt: 0.25,
                          color: widenedCount > 0 ? muiTheme.palette.loss.main : muiTheme.palette.text.secondary,
                        }}
                      >
                        {widenedCount}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.7)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                        Net Risk Delta
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          mt: 0.25,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color:
                            summary?.netRiskChangePoints != null && summary.netRiskChangePoints > 0
                              ? muiTheme.palette.loss.main
                              : summary?.netRiskChangePoints != null && summary.netRiskChangePoints < 0
                              ? muiTheme.palette.profit.main
                              : 'inherit',
                        }}
                      >
                        {summary?.netRiskChangePoints != null
                          ? `${summary.netRiskChangePoints > 0 ? '+' : ''}${summary.netRiskChangePoints.toFixed(2)} pts`
                          : '0.00 pts'}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                {/* Event Timeline Table */}
                {events.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.03)' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Time</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Action Type</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Previous Stop</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>New Stop</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Points Delta</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Order / Reason</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {events.map((evt: any, idx: number) => {
                          const isTrailed = evt.moveType === 'TRAILED_FAVORABLY';
                          const isWidened = evt.moveType === 'WIDENED_RISK';
                          return (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontSize: '0.75rem', fontFamily: `'JetBrains Mono', monospace` }}>
                                {moment(evt.movedAt).format('DD MMM YYYY, HH:mm:ss')}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={isTrailed ? 'Trailed Favorably' : isWidened ? 'Widened Risk' : 'Unchanged'}
                                  sx={{
                                    height: 20,
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    backgroundColor: isTrailed ? muiTheme.palette.profit.bg : isWidened ? muiTheme.palette.loss.bg : 'transparent',
                                    color: isTrailed ? muiTheme.palette.profit.main : isWidened ? muiTheme.palette.loss.main : muiTheme.palette.text.secondary,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontFamily: `'JetBrains Mono', monospace` }}>
                                {Number(evt.previousStop).toFixed(2)}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: `'JetBrains Mono', monospace` }}>
                                {Number(evt.newStop).toFixed(2)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  fontFamily: `'JetBrains Mono', monospace`,
                                  color: isTrailed ? muiTheme.palette.profit.main : isWidened ? muiTheme.palette.loss.main : 'inherit',
                                }}
                              >
                                {evt.changePoints > 0 ? `+${Number(evt.changePoints).toFixed(2)}` : Number(evt.changePoints).toFixed(2)} pts ({evt.changePercent > 0 ? `+${Number(evt.changePercent).toFixed(2)}` : Number(evt.changePercent).toFixed(2)}%)
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}>
                                {evt.reason || (evt.orderId ? `Order #${evt.orderId}` : 'FYERS Orderbook')}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      textAlign: 'center',
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.6)',
                      border: `1px solid ${muiTheme.palette.divider}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
                      Stop-loss was maintained cleanly without modification throughout the trade. Zero trailing or widening adjustments were detected.
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <Box
                sx={{
                  p: 3,
                  borderRadius: 2,
                  textAlign: 'center',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.6)',
                  border: `1px dashed ${muiTheme.palette.divider}`,
                }}
              >
                <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mb: 2 }}>
                  Stop-move tracking scans your FYERS orderbook modifications to detect whether your stop loss was trailed to protect capital or widened under market pressure.
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={detectStopMovesMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SyncRoundedIcon fontSize="small" />}
                  onClick={() => detectStopMovesMutation.mutate()}
                  disabled={detectStopMovesMutation.isPending}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Scan Orderbook Stop Moves
                </Button>
              </Box>
            )}
          </Card>
        );
      })()}

      {/* Psychology & Discipline Report */}
      <Card sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 2, mb: 2, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            <PsychologyIcon fontSize="small" sx={{ color: '#8B5CF6' }} />
            Psychology & Discipline Audit
          </Typography>
          <Chip
            label={`Discipline Rating: ${trade.psychology?.disciplineScore || 4}/5`}
            size="small"
            color="primary"
            sx={{ fontWeight: 700 }}
          />
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Emotion Before Entry</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>{trade.psychology?.emotionBefore || 'NEUTRAL'}</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Emotion During Trade</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>{trade.psychology?.emotionDuring || 'CALM'}</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${muiTheme.palette.divider}` }}>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Rule Adherence</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  mt: 0.5,
                  color: trade.psychology?.rulesFollowed ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                }}
              >
                {trade.psychology?.rulesFollowed ? 'Rules Followed Cleanly' : 'Rules Violated'}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {trade.psychology?.notes && (
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              border: `1px solid ${muiTheme.palette.divider}`,
              backgroundColor: isDark ? 'rgba(17, 24, 39, 0.4)' : 'rgba(248, 250, 252, 0.6)',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
              Post-Trade Notes & Lessons:
            </Typography>
            <Typography variant="body2" sx={{ color: muiTheme.palette.text.primary, lineHeight: 1.6 }}>
              {trade.psychology.notes}
            </Typography>
          </Box>
        )}
      </Card>

      {/* Automated Execution Charts Generator Panel */}
      <Box id="execution-charts-panel">
        <GenerateExecutionChartsPanel
          tradeId={id!}
          symbol={trade.symbol}
          status={trade.status}
          entryDate={trade.entryDate}
          exitDate={trade.exitDate}
          attachments={trade.attachments || []}
          onGenerated={() => queryClient.invalidateQueries({ queryKey: ['trade', id] })}
        />
      </Box>

      {/* Chart Screenshots & Visual Review Gallery */}
      <TradeScreenshotGallery
        tradeId={id!}
        attachments={trade.attachments || []}
        symbol={trade.symbol}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['trade', id] })}
      />

      {/* Edit Trade Modal */}
      <TradeFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        editTradeId={id}
        initialValues={trade}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Trade Record"
        message={
          <>
            Are you sure you want to permanently delete this trade record for <strong>{trade.symbol}</strong>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Trade"
        isLoading={deleteMutation.isPending}
        error={deleteError}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }
        }}
        onConfirm={() => {
          deleteMutation.mutate();
        }}
      />

      {/* Quick Close Trade Dialog */}
      <QuickCloseTradeDialog
        open={isQuickCloseOpen}
        onClose={() => setIsQuickCloseOpen(false)}
        trade={trade}
        accountBroker={trade?.accountId?.broker || trade?.accountBroker || 'ZERODHA'}
      />
    </Box>
  );
}
