import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  TextField,
  MenuItem,
  Card,
  Grid,
  Alert,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  CloudUploadRounded,
  DeleteOutlineRounded,
  VisibilityRounded,
  CollectionsRounded,
  AddPhotoAlternateRounded,
  CheckCircleRounded,
  AccessTimeRounded,
  InfoOutlined,
} from '@mui/icons-material';
import {
  AttachmentCategory,
  CHART_ATTACHMENT_CATEGORIES,
  CHART_TIMEFRAMES,
  IAttachment,
} from '@tradevault/shared';
import { ChartImageViewerDialog } from './ChartImageViewerDialog.js';
import { ConfirmDialog } from '../../ui/ConfirmDialog.js';
import { api } from '../../../lib/api.js';

export interface StagedAttachment {
  id: string;
  file: File;
  previewUrl: string;
  category: AttachmentCategory;
  caption: string;
  timeframe: string;
  sizeBytes: number;
}

interface TradeAttachmentUploaderProps {
  stagedAttachments: StagedAttachment[];
  onAddStaged: (newItems: StagedAttachment[]) => void;
  onUpdateStaged: (id: string, updates: Partial<StagedAttachment>) => void;
  onRemoveStaged: (id: string) => void;
  existingAttachments?: IAttachment[];
  onDeleteExisting?: (id: string) => void;
  maxFiles?: number;
  symbol?: string;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function TradeAttachmentUploader({
  stagedAttachments,
  onAddStaged,
  onUpdateStaged,
  onRemoveStaged,
  existingAttachments = [],
  onDeleteExisting,
  maxFiles = 12,
  symbol,
}: TradeAttachmentUploaderProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Full-size preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<IAttachment[]>([]);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [deletingAttId, setDeletingAttId] = useState<string | null>(null);

  const totalCurrentFiles = stagedAttachments.length + existingAttachments.length;

  const processFiles = (files: FileList | File[]) => {
    setErrorMessage(null);
    const validNewItems: StagedAttachment[] = [];

    if (totalCurrentFiles + files.length > maxFiles) {
      setErrorMessage(`Cannot exceed ${maxFiles} attachments per trade. Currently attached: ${totalCurrentFiles}.`);
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setErrorMessage(`"${file.name}" has an unsupported format. Only PNG, JPEG, and WebP are allowed.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 10MB.`);
        continue;
      }

      // Default category distribution: 1st is SETUP, 2nd is ENTRY, 3rd is EXIT, 4th is REVIEW
      let defaultCategory: AttachmentCategory = 'ENTRY';
      const existingCount = totalCurrentFiles + validNewItems.length;
      if (existingCount === 0) defaultCategory = 'SETUP';
      else if (existingCount === 1) defaultCategory = 'ENTRY';
      else if (existingCount === 2) defaultCategory = 'EXIT';
      else if (existingCount === 3) defaultCategory = 'REVIEW';

      const previewUrl = URL.createObjectURL(file);
      validNewItems.push({
        id: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        file,
        previewUrl,
        category: defaultCategory,
        caption: '',
        timeframe: '5m',
        sizeBytes: file.size,
      });
    }

    if (validNewItems.length > 0) {
      onAddStaged(validNewItems);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Clipboard paste support (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      // If focused inside a text input or textarea without files, let normal text paste proceed
      if ((activeTag === 'input' || activeTag === 'textarea') && (!e.clipboardData.files || e.clipboardData.files.length === 0)) {
        return;
      }

      const files: File[] = [];
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        processFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [totalCurrentFiles, maxFiles]);

  // Preview an existing or staged attachment in the lightbox
  const openStagedPreview = (index: number) => {
    const convertedItems: IAttachment[] = stagedAttachments.map((s) => ({
      id: s.id,
      userId: '',
      originalName: s.file.name,
      downloadUrl: s.previewUrl,
      mimeType: s.file.type,
      sizeBytes: s.sizeBytes,
      category: s.category,
      caption: s.caption,
      timeframe: s.timeframe,
      createdAt: new Date().toISOString(),
    }));
    setPreviewItems(convertedItems);
    setPreviewInitialIndex(index);
    setPreviewOpen(true);
  };

  const openExistingPreview = (index: number) => {
    setPreviewItems(existingAttachments);
    setPreviewInitialIndex(index);
    setPreviewOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Upload Zone */}
      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        sx={{
          border: `2px dashed ${isDragging ? muiTheme.palette.primary.main : muiTheme.palette.divider}`,
          borderRadius: 2.5,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragging
            ? isDark
              ? 'rgba(16, 185, 129, 0.08)'
              : 'rgba(16, 185, 129, 0.04)'
            : isDark
            ? 'rgba(255, 255, 255, 0.015)'
            : 'rgba(0, 0, 0, 0.015)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: muiTheme.palette.primary.main,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          },
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
              color: muiTheme.palette.primary.main,
              mb: 0.5,
            }}
          >
            <CloudUploadRounded sx={{ fontSize: 26 }} />
          </Box>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>
            Drag & drop chart screenshots, paste from clipboard (Ctrl+V), or{' '}
            <span style={{ color: muiTheme.palette.primary.main, textDecoration: 'underline' }}>browse</span>
          </Typography>

          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, maxWidth: 520, textAlign: 'center' }}>
            Multi-file drop & instant clipboard paste (PNG, JPG, WebP up to 10MB each). Auto-categorized by trade lifecycle.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Chip
              size="small"
              label={`${totalCurrentFiles} / ${maxFiles} screenshots attached`}
              sx={{
                fontFamily: `'JetBrains Mono', monospace`,
                fontWeight: 600,
                fontSize: '0.6875rem',
              }}
            />
            <Chip
              size="small"
              label="Ctrl+V / ⌘V Paste Active"
              color="primary"
              variant="outlined"
              sx={{
                fontFamily: `'JetBrains Mono', monospace`,
                fontWeight: 700,
                fontSize: '0.625rem',
                height: 22,
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Error alert */}
      {errorMessage && (
        <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ borderRadius: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {/* Existing Attachments (if editing a saved trade) */}
      {existingAttachments.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="caption"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
              color: muiTheme.palette.text.secondary,
              mb: 1.5,
              display: 'block',
            }}
          >
            Saved Chart Screenshots ({existingAttachments.length})
          </Typography>

          <Grid container spacing={2}>
            {existingAttachments.map((att, idx) => {
              const catMeta = CHART_ATTACHMENT_CATEGORIES.find((c) => c.value === att.category);
              return (
                <Grid key={att.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.6)',
                    }}
                  >
                    {/* Thumbnail */}
                    <Box
                      onClick={() => openExistingPreview(idx)}
                      sx={{
                        position: 'relative',
                        height: 140,
                        backgroundColor: '#000',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        '&:hover img': { transform: 'scale(1.04)' },
                      }}
                    >
                      <Box
                        component="img"
                        src={api.attachments.resolveAttachmentUrl(att)}
                        alt={att.caption || att.originalName}
                        crossOrigin="anonymous"
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transition: 'transform 0.2s',
                        }}
                      />
                      <Chip
                        label={catMeta?.label || att.category}
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          fontWeight: 700,
                          fontSize: '0.6875rem',
                          backgroundColor: 'rgba(0, 0, 0, 0.75)',
                          color: catMeta?.badgeColor || '#fff',
                          backdropFilter: 'blur(4px)',
                        }}
                      />
                    </Box>

                    {/* Metadata & Actions */}
                    <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{ display: 'block', fontWeight: 600, color: muiTheme.palette.text.primary }}
                        >
                          {att.caption || att.originalName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                          {(att.sizeBytes / 1024 / 1024).toFixed(2)} MB {att.timeframe && `• ${att.timeframe}`}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Tooltip title="Preview Full Size">
                          <IconButton size="small" onClick={() => openExistingPreview(idx)}>
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        {onDeleteExisting && (
                          <Tooltip title="Delete Screenshot">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeletingAttId(att.id)}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Staged New Attachments (ready to be uploaded on save) */}
      {stagedAttachments.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="caption"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
              color: muiTheme.palette.text.secondary,
              mb: 1.5,
              display: 'block',
            }}
          >
            Pending Screenshots to Save ({stagedAttachments.length})
          </Typography>

          <Grid container spacing={2}>
            {stagedAttachments.map((staged, idx) => (
              <Grid key={staged.id} size={{ xs: 12, sm: 6 }}>
                <Card
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    {/* Thumbnail preview */}
                    <Box
                      onClick={() => openStagedPreview(idx)}
                      sx={{
                        width: 90,
                        height: 70,
                        borderRadius: 1.5,
                        overflow: 'hidden',
                        position: 'relative',
                        flexShrink: 0,
                        cursor: 'pointer',
                        backgroundColor: '#000',
                        border: `1px solid ${muiTheme.palette.divider}`,
                      }}
                    >
                      <Box
                        component="img"
                        src={staged.previewUrl}
                        alt="Preview"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          '&:hover': { opacity: 1 },
                        }}
                      >
                        <VisibilityRounded sx={{ color: '#fff', fontSize: 18 }} />
                      </Box>
                    </Box>

                    {/* Category & Timeframe Controls */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          select
                          size="small"
                          label="Category"
                          value={staged.category}
                          onChange={(e) => onUpdateStaged(staged.id, { category: e.target.value as AttachmentCategory })}
                          sx={{ flex: 1 }}
                          slotProps={{
                            select: { sx: { fontSize: '0.8125rem' } },
                            inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
                          }}
                        >
                          {CHART_ATTACHMENT_CATEGORIES.map((cat) => (
                            <MenuItem key={cat.value} value={cat.value} sx={{ fontSize: '0.8125rem' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: cat.badgeColor,
                                  }}
                                />
                                {cat.label}
                              </Box>
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          select
                          size="small"
                          label="Timeframe"
                          value={staged.timeframe}
                          onChange={(e) => onUpdateStaged(staged.id, { timeframe: e.target.value })}
                          sx={{ width: 100 }}
                          slotProps={{
                            select: { sx: { fontSize: '0.8125rem' } },
                            inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
                          }}
                        >
                          {CHART_TIMEFRAMES.map((tf) => (
                            <MenuItem key={tf} value={tf} sx={{ fontSize: '0.8125rem' }}>
                              {tf}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>

                      {/* File Name & Remove */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{
                            fontFamily: `'JetBrains Mono', monospace`,
                            fontSize: '0.6875rem',
                            color: muiTheme.palette.text.secondary,
                            maxWidth: 160,
                          }}
                        >
                          {staged.file.name}
                        </Typography>

                        <Tooltip title="Remove Staged File">
                          <IconButton size="small" color="error" onClick={() => onRemoveStaged(staged.id)}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>

                  {/* Caption Input */}
                  <TextField
                    size="small"
                    placeholder="Optional caption (e.g. 5m FVG retest with RSI divergence)"
                    value={staged.caption}
                    onChange={(e) => onUpdateStaged(staged.id, { caption: e.target.value })}
                    fullWidth
                    slotProps={{
                      htmlInput: { sx: { fontSize: '0.8125rem', py: 0.75 } },
                    }}
                  />
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Lightbox Preview */}
      <ChartImageViewerDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        attachments={previewItems}
        initialIndex={previewInitialIndex}
        symbol={symbol}
      />

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingAttId)}
        title="Delete Chart Screenshot"
        message="Are you sure you want to delete this chart screenshot? This action cannot be undone."
        confirmLabel="Delete Screenshot"
        onCancel={() => setDeletingAttId(null)}
        onConfirm={() => {
          if (deletingAttId && onDeleteExisting) {
            onDeleteExisting(deletingAttId);
            setDeletingAttId(null);
          }
        }}
      />
    </Box>
  );
}
