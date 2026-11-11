import React, { useState, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import FormatBoldIcon from '@mui/icons-material/FormatBoldRounded';
import FormatItalicIcon from '@mui/icons-material/FormatItalicRounded';
import TitleIcon from '@mui/icons-material/TitleRounded';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulletedRounded';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import FormatQuoteIcon from '@mui/icons-material/FormatQuoteRounded';
import CodeIcon from '@mui/icons-material/CodeRounded';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import EditNoteIcon from '@mui/icons-material/EditNoteRounded';
import VisibilityIcon from '@mui/icons-material/VisibilityRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import { toast } from '../../context/ToastContext.js';

interface RichMarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minRows?: number;
  label?: string;
  helperText?: string;
  maxLength?: number;
}

/**
 * Optimizes pasted/dropped images in-browser to WebP/JPEG data URLs
 * to ensure responsive performance without payload bloating.
 */
function compressImageToDataUrl(file: File, maxWidth = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Use WebP if supported, fallback to JPEG
        const dataUrl = canvas.toDataURL('image/webp', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Lightweight, zero-dependency Markdown Parser for trading reflections.
 * Supports: Headers (H1-H3), bold, italic, quotes, bullet lists, interactive checklists, code, and images.
 */
export function MarkdownRenderer({ content, onImageClick }: { content: string; onImageClick?: (src: string) => void }) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  if (!content || !content.trim()) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', py: 1 }}>
        Nothing written yet. Use markdown formatting or paste chart screenshots.
      </Typography>
    );
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = (keyPrefix: string) => {
    if (inList && listItems.length > 0) {
      elements.push(
        <Box component="ul" key={`${keyPrefix}-list`} sx={{ pl: 2.5, my: 0.75, listStyleType: 'disc' }}>
          {listItems}
        </Box>
      );
      listItems = [];
      inList = false;
    }
  };

  const renderInlineFormatted = (text: string): React.ReactNode[] => {
    // Replace inline markdown: `code`, **bold**, *italic*, ![img](url)
    const tokens: React.ReactNode[] = [];
    let remainder = text;
    let tokenKey = 0;

    while (remainder.length > 0) {
      // 1. Image: ![caption](url)
      const imgMatch = remainder.match(/^!\[(.*?)\]\((.*?)\)/);
      if (imgMatch) {
        const caption = imgMatch[1] || 'Chart Screenshot';
        const url = imgMatch[2];
        tokens.push(
          <Box key={`img-${tokenKey++}`} sx={{ my: 1.5, textAlign: 'center' }}>
            <Box
              component="img"
              src={url}
              alt={caption}
              onClick={() => onImageClick?.(url)}
              sx={{
                maxWidth: '100%',
                maxHeight: 380,
                borderRadius: 2,
                border: `1px solid ${muiTheme.palette.divider}`,
                cursor: onImageClick ? 'zoom-in' : 'default',
                boxShadow: isDark
                  ? '0 6px 20px rgba(0, 0, 0, 0.4)'
                  : '0 6px 20px rgba(15, 23, 42, 0.08)',
                transition: 'transform 0.15s ease',
                '&:hover': { transform: onImageClick ? 'scale(1.01)' : 'none' },
              }}
            />
            {caption && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, fontStyle: 'italic' }}>
                {caption}
              </Typography>
            )}
          </Box>
        );
        remainder = remainder.slice(imgMatch[0].length);
        continue;
      }

      // 2. Inline Code: `code`
      const codeMatch = remainder.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push(
          <Box
            component="span"
            key={`code-${tokenKey++}`}
            sx={{
              fontFamily: `'JetBrains Mono', monospace`,
              fontSize: '0.75rem',
              px: 0.6,
              py: 0.2,
              borderRadius: 1,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
              color: isDark ? '#38BDF8' : '#0284C7',
            }}
          >
            {codeMatch[1]}
          </Box>
        );
        remainder = remainder.slice(codeMatch[0].length);
        continue;
      }

      // 3. Bold: **text**
      const boldMatch = remainder.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        tokens.push(
          <strong key={`bold-${tokenKey++}`}>{boldMatch[1]}</strong>
        );
        remainder = remainder.slice(boldMatch[0].length);
        continue;
      }

      // 4. Italic: *text*
      const italicMatch = remainder.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        tokens.push(
          <em key={`italic-${tokenKey++}`}>{italicMatch[1]}</em>
        );
        remainder = remainder.slice(italicMatch[0].length);
        continue;
      }

      // Plain character / word
      tokens.push(remainder[0]);
      remainder = remainder.slice(1);
    }

    return tokens;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList(`line-${index}`);
      elements.push(
        <Typography
          key={`h3-${index}`}
          variant="subtitle1"
          sx={{ fontWeight: 800, mt: 1.5, mb: 0.5, color: muiTheme.palette.text.primary }}
        >
          {renderInlineFormatted(trimmed.slice(4))}
        </Typography>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(`line-${index}`);
      elements.push(
        <Typography
          key={`h2-${index}`}
          variant="h6"
          sx={{ fontWeight: 800, fontSize: '1rem', mt: 2, mb: 0.5, color: muiTheme.palette.text.primary }}
        >
          {renderInlineFormatted(trimmed.slice(3))}
        </Typography>
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(`line-${index}`);
      elements.push(
        <Typography
          key={`h1-${index}`}
          variant="h6"
          sx={{ fontWeight: 800, fontSize: '1.125rem', mt: 2, mb: 0.75, color: muiTheme.palette.primary.main }}
        >
          {renderInlineFormatted(trimmed.slice(2))}
        </Typography>
      );
      return;
    }

    // Blockquotes: > quote
    if (trimmed.startsWith('> ')) {
      flushList(`line-${index}`);
      elements.push(
        <Box
          key={`quote-${index}`}
          sx={{
            pl: 2,
            py: 0.75,
            my: 1,
            borderLeft: `3px solid ${muiTheme.palette.primary.main}`,
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.06)' : 'rgba(5, 150, 105, 0.04)',
            borderRadius: '0 8px 8px 0',
            fontStyle: 'italic',
            fontSize: '0.8125rem',
            color: muiTheme.palette.text.primary,
          }}
        >
          {renderInlineFormatted(trimmed.slice(2))}
        </Box>
      );
      return;
    }

    // Checklist items: - [ ] or - [x]
    const checklistMatch = trimmed.match(/^- \[( |x|X)\] (.*)/);
    if (checklistMatch) {
      flushList(`line-${index}`);
      const checked = checklistMatch[1].toLowerCase() === 'x';
      elements.push(
        <Box key={`check-${index}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, my: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: 0.5,
              mt: 0.3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1.5px solid ${checked ? muiTheme.palette.primary.main : muiTheme.palette.text.secondary}`,
              backgroundColor: checked ? muiTheme.palette.primary.main : 'transparent',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {checked ? '✓' : ''}
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.8125rem',
              color: checked ? muiTheme.palette.text.secondary : muiTheme.palette.text.primary,
              textDecoration: checked ? 'line-through' : 'none',
            }}
          >
            {renderInlineFormatted(checklistMatch[2])}
          </Typography>
        </Box>
      );
      return;
    }

    // Bullet lists: - item or * item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(
        <li key={`li-${index}`} style={{ margin: '3px 0', fontSize: '0.8125rem' }}>
          {renderInlineFormatted(trimmed.slice(2))}
        </li>
      );
      return;
    }

    // Empty line / paragraph break
    flushList(`line-${index}`);
    if (trimmed === '') {
      elements.push(<Box key={`br-${index}`} sx={{ height: 8 }} />);
      return;
    }

    // Standalone paragraph
    elements.push(
      <Typography key={`p-${index}`} variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.6, my: 0.5 }}>
        {renderInlineFormatted(line)}
      </Typography>
    );
  });

  flushList('end');
  return <Box sx={{ py: 0.5 }}>{elements}</Box>;
}

export function RichMarkdownEditor({
  value,
  onChange,
  placeholder = 'Write reflection notes... Paste screenshots directly (Cmd+V) or use markdown.',
  minRows = 3,
  label,
  helperText,
  maxLength = 5000,
}: RichMarkdownEditorProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isInsertImageOpen, setIsInsertImageOpen] = useState(false);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualImageCaption, setManualImageCaption] = useState('');

  // Helper to insert markdown tokens at cursor
  const insertText = useCallback(
    (prefix: string, suffix = '', defaultText = '') => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + prefix + defaultText + suffix);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end) || defaultText;
      const replacement = prefix + selected + suffix;

      const nextValue = value.substring(0, start) + replacement + value.substring(end);
      if (maxLength && nextValue.length > maxLength) {
        toast.warning(`Text exceeds ${maxLength} character limit.`);
        return;
      }

      onChange(nextValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
      }, 0);
    },
    [value, onChange, maxLength]
  );

  // Handle direct image paste (Cmd+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setIsProcessingImage(true);
        try {
          const dataUrl = await compressImageToDataUrl(file);
          const timeStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
          const imageMd = `\n![Chart Screenshot - ${timeStr}](${dataUrl})\n`;
          insertText('', '', imageMd);
          toast.success('Chart screenshot pasted into reflection!');
        } catch (err: any) {
          console.error('Image paste failed:', err);
          toast.error('Failed to process pasted screenshot.');
        } finally {
          setIsProcessingImage(false);
        }
        return;
      }
    }
  };

  // Handle drag and drop image
  const handleDrop = async (e: React.DragEvent) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        setIsProcessingImage(true);
        try {
          const dataUrl = await compressImageToDataUrl(file);
          const timeStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
          const imageMd = `\n![${file.name || `Chart - ${timeStr}`}](${dataUrl})\n`;
          insertText('', '', imageMd);
          toast.success('Image dropped into reflection!');
        } catch (err: any) {
          console.error('Image drop failed:', err);
          toast.error('Failed to process dropped image.');
        } finally {
          setIsProcessingImage(false);
        }
      }
    }
  };

  const handleInsertManualImage = () => {
    if (!manualImageUrl) return;
    const caption = manualImageCaption || 'Chart Screenshot';
    const md = `\n![${caption}](${manualImageUrl})\n`;
    insertText('', '', md);
    setIsInsertImageOpen(false);
    setManualImageUrl('');
    setManualImageCaption('');
    toast.success('Image inserted.');
  };

  return (
    <Box sx={{ width: '100%' }}>
      {label && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
            {value.length}{maxLength ? ` / ${maxLength}` : ''} chars
          </Typography>
        </Box>
      )}

      {/* Editor Frame */}
      <Box
        sx={{
          borderRadius: 2,
          border: `1px solid ${muiTheme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : '#FFFFFF',
          overflow: 'hidden',
          transition: 'border-color 0.15s ease',
          '&:focus-within': {
            borderColor: muiTheme.palette.primary.main,
          },
        }}
      >
        {/* Formatting Toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1,
            py: 0.5,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
            flexWrap: 'wrap',
            gap: 0.5,
          }}
        >
          {/* Markdown Action Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <Tooltip title="Bold (**text**)" arrow>
              <IconButton size="small" onClick={() => insertText('**', '**', 'bold text')} disabled={mode === 'preview'}>
                <FormatBoldIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Italic (*text*)" arrow>
              <IconButton size="small" onClick={() => insertText('*', '*', 'italic text')} disabled={mode === 'preview'}>
                <FormatItalicIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Heading (### Title)" arrow>
              <IconButton size="small" onClick={() => insertText('### ', '', 'Heading')} disabled={mode === 'preview'}>
                <TitleIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Bullet List (- item)" arrow>
              <IconButton size="small" onClick={() => insertText('- ', '', 'List item')} disabled={mode === 'preview'}>
                <FormatListBulletedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Task Checklist (- [ ] item)" arrow>
              <IconButton size="small" onClick={() => insertText('- [ ] ', '', 'Checklist task')} disabled={mode === 'preview'}>
                <CheckBoxOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Quote / Insight (> quote)" arrow>
              <IconButton size="small" onClick={() => insertText('> ', '', 'Insight or lesson')} disabled={mode === 'preview'}>
                <FormatQuoteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Inline Code (`code`)" arrow>
              <IconButton size="small" onClick={() => insertText('`', '`', 'symbol / rule')} disabled={mode === 'preview'}>
                <CodeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Insert Image / Chart Screenshot" arrow>
              <IconButton size="small" onClick={() => setIsInsertImageOpen(true)} disabled={mode === 'preview'}>
                <AddPhotoAlternateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Mode Switcher: Write vs Preview */}
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, next) => next && setMode(next)}
            size="small"
            sx={{ height: 26 }}
          >
            <ToggleButton value="write" sx={{ px: 1, py: 0.25, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none' }}>
              <EditNoteIcon sx={{ fontSize: 16, mr: 0.5 }} />
              Write
            </ToggleButton>
            <ToggleButton value="preview" sx={{ px: 1, py: 0.25, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none' }}>
              <VisibilityIcon sx={{ fontSize: 16, mr: 0.5 }} />
              Preview
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Content Area */}
        <Box sx={{ p: 1.5, minHeight: minRows * 24, position: 'relative' }} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          {isProcessingImage && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                borderRadius: 1,
              }}
            >
              <CircularProgress size={24} color="inherit" sx={{ mb: 1 }} />
              <Typography variant="caption" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                Optimizing screenshot...
              </Typography>
            </Box>
          )}

          {mode === 'write' ? (
            <TextField
              inputRef={textareaRef}
              fullWidth
              multiline
              minRows={minRows}
              variant="standard"
              value={value}
              onChange={(e) => {
                if (maxLength && e.target.value.length > maxLength) {
                  onChange(e.target.value.slice(0, maxLength));
                } else {
                  onChange(e.target.value);
                }
              }}
              onPaste={handlePaste}
              placeholder={placeholder}
              slotProps={{
                input: {
                  disableUnderline: true,
                  sx: {
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    fontFamily: value.includes('```') ? `'JetBrains Mono', monospace` : 'inherit',
                  },
                },
              }}
            />
          ) : (
            <MarkdownRenderer content={value} onImageClick={(url) => setLightboxImage(url)} />
          )}
        </Box>

        {/* Quick Paste Hint Footer */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 0.5,
            borderTop: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(15, 23, 42, 0.01)',
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
            💡 Tip: Paste screenshots directly from TradingView / clipboard with <strong>Cmd+V</strong>.
          </Typography>
          {helperText && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
              {helperText}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Insert Image Dialog */}
      <Dialog open={isInsertImageOpen} onClose={() => setIsInsertImageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>
          Insert Chart Screenshot
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Image URL or Web Link"
            fullWidth
            size="small"
            value={manualImageUrl}
            onChange={(e) => setManualImageUrl(e.target.value)}
            placeholder="https://... or data:image/..."
            autoFocus
          />
          <TextField
            label="Caption (Optional)"
            fullWidth
            size="small"
            value={manualImageCaption}
            onChange={(e) => setManualImageCaption(e.target.value)}
            placeholder="e.g. 5M Liquidity Sweep Entry"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setIsInsertImageOpen(false)}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={handleInsertManualImage} disabled={!manualImageUrl}>
            Insert Image
          </Button>
        </DialogActions>
      </Dialog>

      {/* Fullscreen Image Lightbox Modal */}
      {lightboxImage && (
        <Dialog
          open={Boolean(lightboxImage)}
          onClose={() => setLightboxImage(null)}
          maxWidth="lg"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                backgroundColor: 'transparent',
                boxShadow: 'none',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
          }}
        >
          <Box sx={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <IconButton
              onClick={() => setLightboxImage(null)}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                color: '#FFFFFF',
                '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
              }}
            >
              <CloseIcon />
            </IconButton>
            <Box
              component="img"
              src={lightboxImage}
              alt="Fullscreen Chart View"
              sx={{
                maxWidth: '100%',
                maxHeight: '85vh',
                borderRadius: 2,
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              }}
            />
          </Box>
        </Dialog>
      )}
    </Box>
  );
}
