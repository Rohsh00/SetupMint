import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Grid,
  Button,
  Chip,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import {
  CollectionsRounded,
  CloudUploadRounded,
  VisibilityRounded,
  DeleteOutlineRounded,
  FileDownloadRounded,
  AddPhotoAlternateRounded,
  AccessTimeRounded,
  CloseRounded,
  CheckCircleRounded,
  PhotoCameraRounded,
  ElectricBoltRounded,
  ShowChartRounded,
  CandlestickChartRounded,
  WarningAmberRounded,
  RefreshRounded,
} from '@mui/icons-material';
import {
  AttachmentCategory,
  CHART_ATTACHMENT_CATEGORIES,
  CHART_TIMEFRAMES,
  IAttachment,
} from '@tradevault/shared';
import { api } from '../../../lib/api.js';
import { toast } from '../../../context/ToastContext.js';
import { ChartImageViewerDialog } from './ChartImageViewerDialog.js';
import { InteractiveTradingViewModal } from './InteractiveTradingViewModal.js';
import { ConfirmDialog } from '../../ui/ConfirmDialog.js';

interface TradeScreenshotGalleryProps {
  tradeId: string;
  attachments?: IAttachment[];
  symbol?: string;
  onRefresh?: () => void;
  readOnly?: boolean;
}

export function TradeScreenshotGallery({
  tradeId,
  attachments = [],
  symbol,
  onRefresh,
  readOnly = false,
}: TradeScreenshotGalleryProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Interactive TradingView Real Chart modal state
  const [interactiveChartOpen, setInteractiveChartOpen] = useState(false);
  const [interactiveResolution, setInteractiveResolution] = useState<string>('5');

  const openInteractiveChart = (res?: string) => {
    let cleanRes = res || '5';
    if (cleanRes === '1m' || cleanRes === '1') cleanRes = '1';
    else if (cleanRes === '3m' || cleanRes === '3') cleanRes = '3';
    else if (cleanRes === '5m' || cleanRes === '5') cleanRes = '5';
    else if (cleanRes === '15m' || cleanRes === '15') cleanRes = '15';
    else if (cleanRes === '30m' || cleanRes === '30') cleanRes = '30';
    else if (cleanRes === '1h' || cleanRes === '60m' || cleanRes === '60') cleanRes = '60';
    else if (cleanRes === '4h' || cleanRes === '240m' || cleanRes === '240') cleanRes = '240';
    else if (cleanRes === '1D' || cleanRes === 'Daily' || cleanRes === 'D') cleanRes = 'D';
    else cleanRes = '5';

    setInteractiveResolution(cleanRes);
    setInteractiveChartOpen(true);
  };

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>('ENTRY');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('5m');
  const [caption, setCaption] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingAutoChart, setIsGeneratingAutoChart] = useState(false);
  const [regeneratingAttachmentId, setRegeneratingAttachmentId] = useState<string | null>(null);

  const autoChartAttachment = attachments.find((a) => a.category === 'AUTO_CHART');
  const hasStaleSnapshots = attachments.some(
    (a) => a.category === 'AUTO_CHART' && a.chartMeta?.isStale
  );

  const handleGenerateAutoChart = async () => {
    try {
      setIsGeneratingAutoChart(true);
      await api.trades.generateChart(tradeId, Boolean(autoChartAttachment));
      toast.success(
        autoChartAttachment
          ? 'Auto chart regenerated from FYERS historical candles.'
          : 'Auto chart generated and attached from FYERS market data.'
      );
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate auto chart screenshot.');
    } finally {
      setIsGeneratingAutoChart(false);
    }
  };

  const handleRegenerateSnapshot = async (attId?: string) => {
    try {
      if (attId) {
        setRegeneratingAttachmentId(attId);
      } else {
        setIsGeneratingAutoChart(true);
      }
      await api.trades.generateChart(tradeId, true);
      toast.success('Auto chart snapshots regenerated with current trade parameters and settings.');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to regenerate snapshot.');
    } finally {
      setRegeneratingAttachmentId(null);
      setIsGeneratingAutoChart(false);
    }
  };

  const TIMEFRAME_ORDER: Record<string, number> = {
    '1m': 1,
    '5m': 2,
    '15m': 3,
    '30m': 4,
    '1h': 5,
    '1D': 6,
  };

  // Filter attachments based on category tab and sort AUTO_CHARTs by timeframe order (1m to 1D)
  const filteredAttachments = [...attachments]
    .filter((att) => {
      if (activeCategoryFilter === 'ALL') return true;
      return att.category === activeCategoryFilter;
    })
    .sort((a, b) => {
      if (a.category === 'AUTO_CHART' && b.category === 'AUTO_CHART') {
        const tfA = a.timeframe || a.chartMeta?.resolution || '';
        const tfB = b.timeframe || b.chartMeta?.resolution || '';
        const orderA = TIMEFRAME_ORDER[tfA] ?? 99;
        const orderB = TIMEFRAME_ORDER[tfB] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const handleOpenUpload = (defaultCat?: AttachmentCategory) => {
    setSelectedFile(null);
    setFilePreview(null);
    setSelectedCategory(defaultCat || 'ENTRY');
    setSelectedTimeframe('5m');
    setCaption('');
    setUploadError(null);
    setUploadModalOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setUploadError('Only PNG, JPEG, and WebP images are supported.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('File exceeds 10MB limit.');
        return;
      }
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setUploadError(null);
    }
  };

  const closeUploadModal = () => {
    if (isUploading) return;
    if (filePreview) {
      try {
        URL.revokeObjectURL(filePreview);
      } catch {
        // ignore
      }
      setFilePreview(null);
    }
    setSelectedFile(null);
    setCaption('');
    setUploadError(null);
    setUploadModalOpen(false);
  };

  const handleSaveUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select an image file to upload.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      await api.attachments.upload(tradeId, selectedFile, {
        category: selectedCategory,
        caption,
        timeframe: selectedTimeframe,
      });
      toast.success('Chart screenshot uploaded successfully.');
      closeUploadModal();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Screenshot upload failed. Please try again.';
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await api.attachments.delete(attachmentId);
      toast.success('Chart screenshot deleted.');
      if (viewerOpen) setViewerOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Failed to delete attachment';
      toast.error(msg);
    }
  };

  const openViewerAt = (attId: string) => {
    const index = attachments.findIndex((a) => a.id === attId || (a as any)._id === attId);
    if (index !== -1) {
      setViewerIndex(index);
      setViewerOpen(true);
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 3,
        border: `1px solid ${muiTheme.palette.divider}`,
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.7)',
      }}
    >
      {/* Header Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CollectionsRounded sx={{ color: muiTheme.palette.primary.main, fontSize: 22 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
              Saved Snapshots & Visual Review
            </Typography>
            <Chip
              label={`${attachments.length} ${attachments.length === 1 ? 'snapshot' : 'snapshots'}`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.6875rem',
                fontFamily: `'JetBrains Mono', monospace`,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
            Permanent historical SVG snapshots and user attachments ensuring visual trade auditability when broker lookback expires
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<ShowChartRounded />}
            onClick={() => openInteractiveChart('5')}
            sx={{
              fontWeight: 800,
              fontSize: '0.8125rem',
              borderRadius: 2,
              textTransform: 'none',
              background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)',
              '&:hover': {
                background: 'linear-gradient(135deg, #0891b2 0%, #0369a1 100%)',
              },
            }}
          >
            Interactive Real Chart
          </Button>

          {!readOnly && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  isGeneratingAutoChart ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <ElectricBoltRounded sx={{ color: '#06b6d4' }} />
                  )
                }
                onClick={handleGenerateAutoChart}
                disabled={isGeneratingAutoChart}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  borderRadius: 2,
                  textTransform: 'none',
                  borderColor: 'rgba(6, 182, 212, 0.4)',
                  color: '#06b6d4',
                  '&:hover': {
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.08)',
                  },
                }}
              >
                {autoChartAttachment ? 'Regenerate Auto Chart' : 'Generate FYERS Chart'}
              </Button>

              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<CloudUploadRounded />}
                onClick={() => handleOpenUpload()}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  borderRadius: 2,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                }}
              >
                Attach Screenshot
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Stale Snapshots Notice Banner */}
      {hasStaleSnapshots && (
        <Alert
          severity="warning"
          icon={<WarningAmberRounded />}
          action={
            !readOnly && (
              <Button
                color="inherit"
                size="small"
                startIcon={
                  isGeneratingAutoChart ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : (
                    <RefreshRounded fontSize="small" />
                  )
                }
                disabled={isGeneratingAutoChart}
                onClick={() => handleRegenerateSnapshot()}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 1.5 }}
              >
                Regenerate All Snapshots
              </Button>
            )
          }
          sx={{ mt: 2, borderRadius: 2 }}
        >
          One or more auto-generated snapshots were created before trade parameters were updated and are marked stale.
        </Alert>
      )}

      {/* Category Filter Tabs (if attachments exist) */}
      {attachments.length > 0 && (
        <Box sx={{ pt: 1.5, pb: 2 }}>
          <Tabs
            value={activeCategoryFilter}
            onChange={(_e, val) => setActiveCategoryFilter(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 36,
              '& .MuiTab-root': {
                minHeight: 36,
                py: 0.5,
                px: 1.5,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'none',
              },
            }}
          >
            <Tab
              value="ALL"
              label={`All (${attachments.length})`}
            />
            {CHART_ATTACHMENT_CATEGORIES.map((cat) => {
              const count = attachments.filter((a) => a.category === cat.value).length;
              if (count === 0) return null;
              return (
                <Tab
                  key={cat.value}
                  value={cat.value}
                  label={`${cat.label} (${count})`}
                />
              );
            })}
          </Tabs>
        </Box>
      )}

      {/* Gallery Grid */}
      {filteredAttachments.length > 0 ? (
        <Grid container spacing={2.5}>
          {filteredAttachments.map((att) => {
            const catMeta = CHART_ATTACHMENT_CATEGORIES.find((c) => c.value === att.category);
            return (
              <Grid key={att.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2.5,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s ease-in-out',
                    border: `1px solid ${muiTheme.palette.divider}`,
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      boxShadow: isDark
                        ? '0 12px 24px -8px rgba(0, 0, 0, 0.7)'
                        : '0 12px 24px -8px rgba(15, 23, 42, 0.15)',
                      borderColor: muiTheme.palette.primary.main,
                    },
                  }}
                >
                  {/* Thumbnail Image Container */}
                  <Box
                    onClick={() => {
                      openInteractiveChart(
                        att.timeframe || (att.chartMeta as any)?.resolution || '5'
                      );
                    }}
                    sx={{
                      position: 'relative',
                      height: 190,
                      backgroundColor: '#030712',
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      component="img"
                      src={api.attachments.resolveAttachmentUrl(att)}
                      alt={att.caption || att.originalName}
                      crossOrigin="anonymous"
                      loading="lazy"
                      onError={(e: any) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const fallback = parent.querySelector('.snapshot-img-fallback');
                          if (fallback) (fallback as HTMLElement).style.display = 'flex';
                        }
                      }}
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'transform 0.3s ease',
                        '&:hover': { transform: 'scale(1.05)' },
                      }}
                    />

                    {/* Graceful Fallback if image fails to load */}
                    <Box
                      className="snapshot-img-fallback"
                      sx={{
                        display: 'none',
                        width: '100%',
                        height: '100%',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        backgroundColor: '#0a0f1d',
                        color: muiTheme.palette.text.secondary,
                        p: 2,
                        textAlign: 'center',
                      }}
                    >
                      <CandlestickChartRounded sx={{ fontSize: 36, color: '#06b6d4', opacity: 0.8 }} />
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#94a3b8' }}>
                        {att.caption || `${att.timeframe || ''} Snapshot`}
                      </Typography>
                    </Box>

                    {/* Category Chip Badge */}
                    <Chip
                      icon={
                        att.category === 'AUTO_CHART' ? (
                          <ElectricBoltRounded sx={{ fontSize: 13, color: '#06b6d4 !important' }} />
                        ) : undefined
                      }
                      label={att.category === 'AUTO_CHART' ? 'Auto Chart' : catMeta?.label || att.category}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        fontWeight: 700,
                        fontSize: '0.6875rem',
                        backgroundColor: att.category === 'AUTO_CHART' ? 'rgba(8, 51, 68, 0.92)' : 'rgba(0, 0, 0, 0.8)',
                        color: catMeta?.badgeColor || '#fff',
                        backdropFilter: 'blur(6px)',
                        border: `1px solid ${catMeta?.badgeColor ? `${catMeta.badgeColor}88` : 'rgba(255,255,255,0.2)'}`,
                      }}
                    />

                    {/* Timeframe Badge */}
                    {(att.timeframe || att.chartMeta?.resolution) && (
                      <Tooltip
                        title={
                          att.chartMeta
                            ? `Padding: ${att.chartMeta.appliedBefore ?? att.chartMeta.paddingBefore} pre / ${att.chartMeta.appliedAfter ?? att.chartMeta.paddingAfter} post`
                            : ''
                        }
                      >
                        <Chip
                          icon={<AccessTimeRounded sx={{ fontSize: 13, color: '#fff !important' }} />}
                          label={att.timeframe || att.chartMeta?.resolution}
                          size="small"
                          sx={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            fontWeight: 700,
                            fontSize: '0.6875rem',
                            backgroundColor: att.category === 'AUTO_CHART' ? 'rgba(6, 182, 212, 0.85)' : 'rgba(0, 0, 0, 0.75)',
                            color: '#fff',
                            backdropFilter: 'blur(6px)',
                          }}
                        />
                      </Tooltip>
                    )}

                    {/* Stale Badge on Image Thumbnail */}
                    {att.category === 'AUTO_CHART' && att.chartMeta?.isStale && (
                      <Chip
                        icon={<WarningAmberRounded sx={{ fontSize: 13, color: '#fff !important' }} />}
                        label="Stale Snapshot"
                        size="small"
                        color="warning"
                        sx={{
                          position: 'absolute',
                          bottom: 10,
                          left: 10,
                          fontWeight: 700,
                          fontSize: '0.6875rem',
                          backdropFilter: 'blur(6px)',
                          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                        }}
                      />
                    )}

                    {/* Hover Overlay with Action Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        p: 1.5,
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          openInteractiveChart(att.timeframe || att.chartMeta?.resolution || '5');
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          backgroundColor: 'rgba(6, 182, 212, 0.95)',
                          color: '#fff',
                          px: 2,
                          py: 0.75,
                          borderRadius: 2,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          backdropFilter: 'blur(4px)',
                          boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            backgroundColor: '#0891b2',
                            transform: 'scale(1.03)',
                          },
                        }}
                      >
                        <ShowChartRounded sx={{ fontSize: 16 }} />
                        Interactive Real Chart
                      </Box>

                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          openViewerAt(att.id || (att as any)._id);
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          backgroundColor: 'rgba(0, 0, 0, 0.75)',
                          color: '#e2e8f0',
                          px: 1.75,
                          py: 0.5,
                          borderRadius: 2,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          backdropFilter: 'blur(4px)',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.9)',
                            transform: 'scale(1.03)',
                          },
                        }}
                      >
                        <VisibilityRounded sx={{ fontSize: 14 }} />
                        View Full Screen
                      </Box>
                    </Box>
                  </Box>

                  {/* Card Content & Caption */}
                  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                    <Box sx={{ mb: 1.5 }}>
                      {att.caption || att.description ? (
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.8125rem',
                            color: muiTheme.palette.text.primary,
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          "{att.caption || att.description}"
                        </Typography>
                      ) : (
                        <Typography
                          variant="caption"
                          sx={{ color: muiTheme.palette.text.secondary, fontStyle: 'italic' }}
                        >
                          {att.category === 'AUTO_CHART' ? 'Permanent SVG Snapshot' : 'No caption recorded'}
                        </Typography>
                      )}

                      {/* Settings Source indicator */}
                      {att.chartMeta?.settingsSource && (
                        <Box sx={{ mt: 0.75 }}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={att.chartMeta.settingsSource}
                            sx={{
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              height: 20,
                              maxWidth: '100%',
                              borderColor: isDark ? 'rgba(6, 182, 212, 0.35)' : 'rgba(6, 182, 212, 0.5)',
                              color: isDark ? '#38bdf8' : '#0284c7',
                              backgroundColor: isDark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(6, 182, 212, 0.05)',
                            }}
                          />
                        </Box>
                      )}
                    </Box>

                    {/* Footer Info & Actions */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        pt: 1,
                        borderTop: `1px solid ${muiTheme.palette.divider}`,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: `'JetBrains Mono', monospace`,
                            fontSize: '0.6875rem',
                            color: muiTheme.palette.text.secondary,
                          }}
                        >
                          {(att.sizeBytes / 1024 / 1024).toFixed(2)} MB
                        </Typography>

                        {att.category === 'AUTO_CHART' && att.chartMeta?.isStale && !readOnly && (
                          <Button
                            size="small"
                            variant="text"
                            color="warning"
                            startIcon={
                              regeneratingAttachmentId === att.id ? (
                                <CircularProgress size={10} color="inherit" />
                              ) : (
                                <RefreshRounded sx={{ fontSize: 13 }} />
                              )
                            }
                            disabled={Boolean(regeneratingAttachmentId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegenerateSnapshot(att.id);
                            }}
                            sx={{
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              p: 0,
                              minWidth: 'auto',
                              textTransform: 'none',
                            }}
                          >
                            Regenerate
                          </Button>
                        )}
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title="Open in Real Interactive TradingView Chart">
                          <IconButton
                            size="small"
                            sx={{
                              color: '#06b6d4',
                              '&:hover': { backgroundColor: 'rgba(6, 182, 212, 0.15)' },
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openInteractiveChart(att.timeframe || att.chartMeta?.resolution || '5');
                            }}
                          >
                            <CandlestickChartRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Download Original">
                          <IconButton
                            size="small"
                            component="a"
                            href={api.attachments.resolveAttachmentUrl(att)}
                            download={att.originalName}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileDownloadRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        {!readOnly && (
                          <Tooltip title="Delete Screenshot">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeletingAttachmentId(att.id || (att as any)._id)}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        /* Empty State */
        <Box
          sx={{
            py: 6,
            px: 3,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: muiTheme.palette.text.secondary,
              mb: 0.5,
            }}
          >
            <PhotoCameraRounded sx={{ fontSize: 28 }} />
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            No Chart Screenshots Attached
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, maxWidth: 480 }}>
            Visual chart snapshots let you review execution quality, compare planned setups with outcomes, and identify recurring patterns.
          </Typography>

          {!readOnly && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<CloudUploadRounded />}
              onClick={() => handleOpenUpload()}
              sx={{ mt: 1, fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
            >
              Upload First Chart
            </Button>
          )}
        </Box>
      )}

      {/* Lightbox Viewer Dialog */}
      <ChartImageViewerDialog
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        attachments={attachments}
        initialIndex={viewerIndex}
        symbol={symbol}
        onDelete={!readOnly ? handleDeleteAttachment : undefined}
        onOpenInteractive={(res) => openInteractiveChart(res)}
      />

      {/* Real Interactive TradingView Modal */}
      <InteractiveTradingViewModal
        open={interactiveChartOpen}
        onClose={() => setInteractiveChartOpen(false)}
        tradeId={tradeId}
        initialResolution={interactiveResolution}
        symbol={symbol}
      />

      {/* Upload Screenshot Dialog */}
      <Dialog
        open={uploadModalOpen}
        onClose={closeUploadModal}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 3, p: 1 } },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Attach Chart Screenshot
          </Typography>
          <IconButton size="small" onClick={closeUploadModal} disabled={isUploading}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1.5 }}>
          {uploadError && (
            <Alert severity="error" onClose={() => setUploadError(null)} sx={{ borderRadius: 2 }}>
              {uploadError}
            </Alert>
          )}

          {/* File Picker or Preview */}
          {filePreview ? (
            <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', maxHeight: 220, backgroundColor: '#000' }}>
              <Box
                component="img"
                src={filePreview}
                alt="Selected Preview"
                sx={{ width: '100%', height: 200, objectFit: 'contain' }}
              />
              <Button
                size="small"
                variant="contained"
                color="inherit"
                component="label"
                sx={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  fontSize: '0.6875rem',
                  textTransform: 'none',
                  backgroundColor: 'rgba(0,0,0,0.75)',
                  color: '#fff',
                  '&:hover': { backgroundColor: '#000' },
                }}
              >
                Change Image
                <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleFileSelect} />
              </Button>
            </Box>
          ) : (
            <Box
              component="label"
              sx={{
                border: `2px dashed ${muiTheme.palette.divider}`,
                borderRadius: 2.5,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                '&:hover': { borderColor: muiTheme.palette.primary.main },
              }}
            >
              <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleFileSelect} />
              <CloudUploadRounded sx={{ fontSize: 36, color: muiTheme.palette.primary.main }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Click to browse chart image
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                PNG, JPEG, or WebP up to 10MB
              </Typography>
            </Box>
          )}

          {/* Category & Timeframe */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Chart Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as AttachmentCategory)}
              slotProps={{ inputLabel: { shrink: true } }}
            >
              {CHART_ATTACHMENT_CATEGORIES.map((cat) => (
                <MenuItem key={cat.value} value={cat.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cat.badgeColor }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{cat.label}</Typography>
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>
                        {cat.description}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Timeframe"
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              sx={{ width: 140 }}
              slotProps={{ inputLabel: { shrink: true } }}
            >
              {CHART_TIMEFRAMES.map((tf) => (
                <MenuItem key={tf} value={tf}>{tf}</MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Caption */}
          <TextField
            fullWidth
            size="small"
            label="Caption / Annotation Note"
            placeholder="e.g. 5m sweep of previous day high into 15m order block"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" color="inherit" onClick={closeUploadModal} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveUpload}
            disabled={!selectedFile || isUploading}
            sx={{ fontWeight: 700, px: 3 }}
          >
            {isUploading ? <CircularProgress size={18} color="inherit" /> : 'Upload & Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingAttachmentId)}
        title="Delete Chart Screenshot"
        message="Are you sure you want to permanently delete this chart screenshot? This action cannot be undone."
        confirmLabel="Delete Screenshot"
        isLoading={isDeleting}
        onCancel={() => {
          if (!isDeleting) setDeletingAttachmentId(null);
        }}
        onConfirm={async () => {
          if (deletingAttachmentId) {
            setIsDeleting(true);
            try {
              await handleDeleteAttachment(deletingAttachmentId);
            } finally {
              setIsDeleting(false);
              setDeletingAttachmentId(null);
            }
          }
        }}
      />
    </Card>
  );
}
