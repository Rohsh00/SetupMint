import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';

export type ModalMaxWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | false;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: ModalMaxWidth;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  maxWidth = 'sm',
  children,
  actions,
}: ModalProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Map custom maxWidth names to standard MUI Dialog maxWidth
  const muiMaxWidth =
    maxWidth === '2xl' || maxWidth === '3xl'
      ? 'md'
      : maxWidth === '4xl'
      ? 'lg'
      : (maxWidth as 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false);

  return (
    <Dialog
      open={isOpen}
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          onClose();
        }
      }}
      maxWidth={muiMaxWidth}
      fullWidth
      scroll="paper"
      aria-labelledby="stratum-modal-title"
      aria-describedby={description ? 'stratum-modal-description' : undefined}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            backgroundColor: theme.palette.background.paper,
            backgroundImage: 'none',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.1)'}`,
            boxShadow: isDark
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)'
              : '0 20px 40px -12px rgba(15, 23, 42, 0.18)',
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
      {/* Dialog Header */}
      <DialogTitle
        id="stratum-modal-title"
        sx={{
          m: 0,
          p: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(248, 250, 252, 0.8)',
        }}
      >
        <Box sx={{ pr: 2 }}>
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontWeight: 700,
              fontSize: '1.05rem',
              color: theme.palette.text.primary,
            }}
          >
            {title}
          </Typography>
          {description && (
            <Typography
              id="stratum-modal-description"
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                display: 'block',
                mt: 0.25,
                fontSize: '0.75rem',
              }}
            >
              {description}
            </Typography>
          )}
        </Box>
        <IconButton
          aria-label="close dialog"
          onClick={onClose}
          size="small"
          sx={{
            color: theme.palette.text.secondary,
            '&:hover': {
              color: theme.palette.text.primary,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Dialog Body */}
      <DialogContent
        sx={{
          p: '20px',
          '&:first-of-type': { pt: '20px' },
        }}
      >
        {children}
      </DialogContent>

      {/* Dialog Actions if provided */}
      {actions && (
        <DialogActions
          sx={{
            p: '12px 20px',
            borderTop: `1px solid ${theme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.4)' : 'rgba(248, 250, 252, 0.5)',
          }}
        >
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
}
