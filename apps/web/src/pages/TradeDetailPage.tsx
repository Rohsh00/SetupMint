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
import Alert from '@mui/material/Alert';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import ContentCopyIcon from '@mui/icons-material/ContentCopyRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import AttachMoneyIcon from '@mui/icons-material/AttachMoneyRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import PsychologyIcon from '@mui/icons-material/PsychologyRounded';
import CollectionsIcon from '@mui/icons-material/CollectionsRounded';
import CloudUploadIcon from '@mui/icons-material/CloudUploadRounded';
import { api } from '../lib/api.js';
import { formatCurrency, formatR } from '../lib/utils.js';
import { TradeFormModal } from '../components/trades/TradeFormModal.js';
import { TradeScreenshotGallery } from '../components/trades/attachments/TradeScreenshotGallery.js';

export function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: trade, isLoading, isError } = useQuery({
    queryKey: ['trade', id],
    queryFn: () => api.trades.get(id!),
    enabled: !!id,
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.trades.duplicate(id!),
    onSuccess: (data: any) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      const newId = data?.id || data?.data?.id || data?._id;
      if (newId) {
        navigate(`/trades/${newId}`);
      } else {
        navigate('/trades');
      }
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to duplicate trade setup');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.trades.delete(id!),
    onSuccess: () => {
      setShowDeleteConfirm(false);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      navigate('/trades');
    },
    onError: (err: any) => {
      setDeleteError(err.message || 'Failed to delete trade record');
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => api.attachments.upload(id!, file),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to upload attachment');
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attId: string) => api.attachments.delete(attId),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to delete attachment');
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary }}>
                {trade.symbol}
              </Typography>
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
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, mt: 0.25, display: 'block', fontFamily: `'JetBrains Mono', monospace` }}>
              {trade.accountName} • {trade.exchange} ({trade.marketSegment}) • {trade.tradeDate}
            </Typography>
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Total Costs
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.secondary, mt: 0.5 }}>
              {formatCurrency(trade.calculated?.totalCosts)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 2.4 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Realized R
            </Typography>
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
      <Dialog
        open={showDeleteConfirm}
        onClose={() => {
          if (!deleteMutation.isPending) {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }
        }}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Trade Record</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {deleteError && (
            <Alert severity="error" onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
            Are you sure you want to permanently delete this trade record for <strong>{trade.symbol}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setShowDeleteConfirm(false);
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
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
