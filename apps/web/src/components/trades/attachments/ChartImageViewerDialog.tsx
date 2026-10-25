import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  Divider,
  useTheme,
  Button,
} from '@mui/material';
import {
  CloseRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  ZoomInRounded,
  ZoomOutRounded,
  RestartAltRounded,
  FileDownloadRounded,
  DeleteOutlineRounded,
  AccessTimeRounded,
  LayersRounded,
  ShowChartRounded,
} from '@mui/icons-material';
import { IAttachment, CHART_ATTACHMENT_CATEGORIES } from '@tradevault/shared';
import { api } from '../../../lib/api.js';
import { ConfirmDialog } from '../../ui/ConfirmDialog.js';

interface ChartImageViewerDialogProps {
  open: boolean;
  onClose: () => void;
  attachments: IAttachment[];
  initialIndex?: number;
  symbol?: string;
  onDelete?: (id: string) => void;
  onOpenInteractive?: (resolution?: string) => void;
}

export function ChartImageViewerDialog({
  open,
  onClose,
  attachments,
  initialIndex = 0,
  symbol,
  onDelete,
  onOpenInteractive,
}: ChartImageViewerDialogProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync index on initialIndex change
  useEffect(() => {
    if (open) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, attachments.length - 1)));
      setZoomLevel(1);
    }
  }, [open, initialIndex, attachments.length]);

  const currentAttachment = attachments[currentIndex];

  const handleNext = useCallback(() => {
    if (attachments.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % attachments.length);
      setZoomLevel(1);
    }
  }, [attachments.length]);

  const handlePrev = useCallback(() => {
    if (attachments.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + attachments.length) % attachments.length);
      setZoomLevel(1);
    }
  }, [attachments.length]);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 3.0));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleNext, handlePrev, onClose]);

  if (!currentAttachment) return null;

  const categoryMeta = CHART_ATTACHMENT_CATEGORIES.find((c) => c.value === currentAttachment.category);
  const imageUrl = currentAttachment.downloadUrl || api.attachments.downloadUrl(currentAttachment.id);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: isDark ? 'rgba(10, 15, 29, 0.95)' : 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(16px)',
            borderRadius: 3,
            border: `1px solid ${muiTheme.palette.divider}`,
            color: muiTheme.palette.text.primary,
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        },
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
          },
        },
      }}
    >
      {/* Viewer Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 1.5,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        {/* Left: Metadata Badges */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          {symbol && (
            <Chip
              label={symbol}
              size="small"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                fontSize: '0.75rem',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
              }}
            />
          )}

          <Chip
            label={categoryMeta?.label || currentAttachment.category}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              backgroundColor: categoryMeta?.badgeColor ? `${categoryMeta.badgeColor}22` : undefined,
              color: categoryMeta?.badgeColor || muiTheme.palette.primary.main,
              border: `1px solid ${categoryMeta?.badgeColor ? `${categoryMeta.badgeColor}55` : muiTheme.palette.divider}`,
            }}
          />

          {currentAttachment.timeframe && (
            <Chip
              icon={<AccessTimeRounded sx={{ fontSize: 14 }} />}
              label={currentAttachment.timeframe}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.6875rem' }}
            />
          )}

          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, ml: 1 }}>
            {currentIndex + 1} of {attachments.length}
          </Typography>
        </Box>

        {/* Right Controls: Zoom, Download, Delete, Close */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Zoom Controls */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              borderRadius: 2,
              px: 0.5,
              border: `1px solid ${muiTheme.palette.divider}`,
            }}
          >
            <Tooltip title="Zoom Out (-)">
              <IconButton size="small" onClick={handleZoomOut} disabled={zoomLevel <= 0.5}>
                <ZoomOutRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                fontFamily: `'JetBrains Mono', monospace`,
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            >
              {Math.round(zoomLevel * 100)}%
            </Typography>
            <Tooltip title="Zoom In (+)">
              <IconButton size="small" onClick={handleZoomIn} disabled={zoomLevel >= 3.0}>
                <ZoomInRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            {zoomLevel !== 1 && (
              <Tooltip title="Reset Zoom">
                <IconButton size="small" onClick={handleResetZoom}>
                  <RestartAltRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Open in Interactive TradingView Chart */}
          {onOpenInteractive && (
            <Tooltip title="Switch to Real Interactive TradingView Chart (with zoom & candle panning)">
              <Button
                variant="contained"
                size="small"
                startIcon={<ShowChartRounded />}
                onClick={() => {
                  onClose();
                  onOpenInteractive(
                    currentAttachment.timeframe ||
                      (currentAttachment as any).chartMeta?.resolution ||
                      '5'
                  );
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(6, 182, 212, 0.35)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #0891b2 0%, #0369a1 100%)',
                  },
                }}
              >
                Interactive Real Chart
              </Button>
            </Tooltip>
          )}

          {/* Download Original */}
          <Tooltip title="Download Original Screenshot">
            <IconButton
              component="a"
              href={imageUrl}
              download={currentAttachment.originalName}
              target="_blank"
              rel="noreferrer"
              size="small"
              sx={{ border: `1px solid ${muiTheme.palette.divider}`, borderRadius: 2 }}
            >
              <FileDownloadRounded fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Delete (if callback provided) */}
          {onDelete && (
            <Tooltip title="Delete Chart Screenshot">
              <IconButton
                size="small"
                color="error"
                onClick={() => setShowDeleteConfirm(true)}
                sx={{ border: `1px solid ${muiTheme.palette.divider}`, borderRadius: 2 }}
              >
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Close */}
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ border: `1px solid ${muiTheme.palette.divider}`, borderRadius: 2 }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Main Image Display Area with Nav Chevrons */}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          p: 2,
          minHeight: 460,
          backgroundColor: isDark ? '#050811' : '#f1f5f9',
        }}
      >
        {/* Previous Button */}
        {attachments.length > 1 && (
          <IconButton
            onClick={handlePrev}
            sx={{
              position: 'absolute',
              left: 20,
              zIndex: 2,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.85)',
              boxShadow: 4,
              border: `1px solid ${muiTheme.palette.divider}`,
              '&:hover': {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.9)' : '#ffffff',
                transform: 'scale(1.08)',
              },
              transition: 'all 0.2s',
            }}
          >
            <ChevronLeftRounded />
          </IconButton>
        )}

        {/* The Scaled Image */}
        <Box
          component="img"
          src={imageUrl}
          alt={currentAttachment.caption || currentAttachment.originalName}
          sx={{
            maxWidth: '100%',
            maxHeight: '75vh',
            objectFit: 'contain',
            borderRadius: 1.5,
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
          }}
        />

        {/* Next Button */}
        {attachments.length > 1 && (
          <IconButton
            onClick={handleNext}
            sx={{
              position: 'absolute',
              right: 20,
              zIndex: 2,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.85)',
              boxShadow: 4,
              border: `1px solid ${muiTheme.palette.divider}`,
              '&:hover': {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.9)' : '#ffffff',
                transform: 'scale(1.08)',
              },
              transition: 'all 0.2s',
            }}
          >
            <ChevronRightRounded />
          </IconButton>
        )}
      </Box>

      {/* Viewer Footer: Caption & File Info */}
      <Box
        sx={{
          px: 3,
          py: 1.75,
          borderTop: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 260 }}>
          {currentAttachment.caption || currentAttachment.description ? (
            <Typography variant="body2" sx={{ fontWeight: 600, color: muiTheme.palette.text.primary }}>
              "{currentAttachment.caption || currentAttachment.description}"
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontStyle: 'italic' }}>
              No caption provided for this screenshot.
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontFamily: `'JetBrains Mono', monospace`,
              fontSize: '0.6875rem',
              color: muiTheme.palette.text.secondary,
            }}
          >
            {currentAttachment.originalName} • {(currentAttachment.sizeBytes / 1024 / 1024).toFixed(2)} MB
          </Typography>
        </Box>
      </Box>

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Chart Screenshot"
        message="Are you sure you want to permanently delete this chart screenshot? This action cannot be undone."
        confirmLabel="Delete Screenshot"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          if (onDelete && currentAttachment) {
            onDelete(currentAttachment.id || (currentAttachment as any)._id);
          }
        }}
      />
    </Dialog>
  );
}
