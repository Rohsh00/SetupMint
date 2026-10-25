import React from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

export interface DisabledReasonProps {
  disabled: boolean;
  reason: React.ReactNode;
  children: React.ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  sx?: any;
}

export const DisabledReason: React.FC<DisabledReasonProps> = ({
  disabled,
  reason,
  children,
  placement = 'top',
  sx = {},
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!disabled) {
    return children;
  }

  return (
    <Tooltip
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: theme.palette.warning.main, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
            {reason}
          </Typography>
        </Box>
      }
      placement={placement}
      arrow
      slotProps={{
        tooltip: {
          sx: {
            backgroundColor: isDark ? '#1E293B' : '#0F172A',
            color: '#FFFFFF',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)'}`,
            borderRadius: 2,
            px: 1.5,
            py: 1,
            maxWidth: 320,
          },
        },
      }}
    >
      <Box
        component="span"
        tabIndex={0}
        role="button"
        aria-disabled="true"
        aria-label={typeof reason === 'string' ? `Disabled: ${reason}` : 'Disabled control'}
        sx={{
          display: 'inline-flex',
          cursor: 'not-allowed',
          outline: 'none',
          '&:focus-visible': {
            boxShadow: `0 0 0 2px ${theme.palette.primary.main}`,
            borderRadius: 1,
          },
          '& > *': {
            pointerEvents: 'none',
          },
          ...sx,
        }}
      >
        {children}
      </Box>
    </Tooltip>
  );
};
