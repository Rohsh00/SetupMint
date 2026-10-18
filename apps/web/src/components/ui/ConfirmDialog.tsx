import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { useTheme } from '@mui/material/styles';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'error' | 'warning' | 'info';
  isLoading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  severity = 'error',
  isLoading = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const badgeColor =
    severity === 'error'
      ? {
          bg: isDark ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 63, 94, 0.1)',
          color: theme.palette.error.main,
          border: isDark ? 'rgba(244, 63, 94, 0.3)' : 'rgba(244, 63, 94, 0.25)',
        }
      : severity === 'warning'
      ? {
          bg: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
          color: theme.palette.warning.main,
          border: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)',
        }
      : {
          bg: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.1)',
          color: theme.palette.info.main,
          border: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(56, 189, 248, 0.25)',
        };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (!isLoading && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
          onCancel();
        }
      }}
      maxWidth="xs"
      fullWidth
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            backgroundImage: 'none',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)'}`,
            boxShadow: isDark
              ? '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)'
              : '0 20px 45px -10px rgba(15, 23, 42, 0.2)',
            p: 1,
            overflow: 'hidden',
          },
        },
        backdrop: {
          sx: {
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
          },
        },
      }}
    >
      <DialogTitle id="confirm-dialog-title" sx={{ p: '16px 20px 8px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: badgeColor.bg,
            color: badgeColor.color,
            border: `1px solid ${badgeColor.border}`,
            flexShrink: 0,
          }}
        >
          {severity === 'error' ? (
            <DeleteOutlineRoundedIcon sx={{ fontSize: 22 }} />
          ) : severity === 'warning' ? (
            <WarningAmberRoundedIcon sx={{ fontSize: 22 }} />
          ) : (
            <HelpOutlineRoundedIcon sx={{ fontSize: 22 }} />
          )}
        </Box>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, fontSize: '1.05rem', color: theme.palette.text.primary }}>
          {title}
        </Typography>
      </DialogTitle>

      <DialogContent id="confirm-dialog-description" sx={{ p: '8px 20px 16px', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {error && (
          <Alert severity="error" sx={{ fontSize: '0.8125rem' }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, lineHeight: 1.6 }}>
          {message}
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: '8px 20px 16px', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          size="medium"
          onClick={onCancel}
          disabled={isLoading}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            borderColor: theme.palette.divider,
            color: theme.palette.text.primary,
            '&:hover': {
              borderColor: theme.palette.text.secondary,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
            },
          }}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={severity === 'error' ? 'error' : 'primary'}
          size="medium"
          onClick={onConfirm}
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            px: 2.5,
          }}
        >
          {isLoading ? 'Processing...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
