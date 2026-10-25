import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import { useTheme } from '@mui/material/styles';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { HelpKey, HELP_CONTENT, IHelpEntry } from '@tradevault/shared';

export interface HelpHintProps {
  hintKey: HelpKey;
  size?: 'small' | 'medium';
  inline?: boolean;
  color?: 'default' | 'primary' | 'secondary';
  sx?: any;
}

export const HelpHint: React.FC<HelpHintProps> = ({
  hintKey,
  size = 'small',
  inline = true,
  color = 'default',
  sx = {},
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [currentKey, setCurrentKey] = useState<HelpKey>(hintKey);
  const [enabled, setEnabled] = useState<boolean>(() => {
    return localStorage.getItem('tv_show_help_hints') !== 'false';
  });

  useEffect(() => {
    setCurrentKey(hintKey);
  }, [hintKey]);

  useEffect(() => {
    const handleStorage = () => {
      setEnabled(localStorage.getItem('tv_show_help_hints') !== 'false');
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('tv_help_hints_changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tv_help_hints_changed', handleStorage);
    };
  }, []);

  const entry: IHelpEntry | undefined = HELP_CONTENT[currentKey];
  if (!entry) return null;

  // If user disabled help hints in settings, don't render the icon
  if (!enabled) return null;

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setCurrentKey(hintKey); // reset back to initial key
  };

  const isOpen = Boolean(anchorEl);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      component="span"
      sx={{
        display: inline ? 'inline-flex' : 'flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
        ml: 0.5,
        ...sx,
      }}
    >
      <IconButton
        size="small"
        onClick={handleOpen}
        aria-label={`Help: ${entry.title}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        sx={{
          p: 0.25,
          color:
            color === 'primary'
              ? theme.palette.primary.main
              : isDark
                ? 'rgba(255, 255, 255, 0.45)'
                : 'rgba(15, 23, 42, 0.4)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            color: theme.palette.primary.main,
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(14, 165, 233, 0.08)',
            transform: 'scale(1.1)',
          },
        }}
      >
        <HelpOutlineRoundedIcon
          sx={{ fontSize: size === 'small' ? '0.95rem' : '1.15rem' }}
        />
      </IconButton>

      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 300, sm: 380 },
              maxWidth: '92vw',
              maxHeight: 520,
              overflowY: 'auto',
              p: 2.25,
              borderRadius: 2.5,
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.1)'}`,
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              boxShadow: isDark
                ? '0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                : '0 20px 40px -10px rgba(15, 23, 42, 0.18), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(14, 165, 233, 0.1)',
                color: theme.palette.primary.main,
              }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
              {entry.title}
            </Typography>
          </Box>

          {/* Summary */}
          <Typography
            variant="body2"
            sx={{
              color: isDark ? '#E2E8F0' : '#334155',
              lineHeight: 1.55,
              fontSize: '0.84rem',
            }}
          >
            {entry.summary}
          </Typography>

          {/* Details (if any) */}
          {entry.details && (
            <Typography
              variant="body2"
              sx={{
                color: isDark ? '#94A3B8' : '#64748B',
                fontSize: '0.8rem',
                lineHeight: 1.5,
              }}
            >
              {entry.details}
            </Typography>
          )}

          {/* Formula Card */}
          {entry.formula && (
            <Box
              sx={{
                p: 1.25,
                borderRadius: 1.5,
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : '#F1F5F9',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)'}`,
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: theme.palette.primary.main,
                wordBreak: 'break-word',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 700,
                  color: isDark ? '#94A3B8' : '#64748B',
                  fontSize: '0.68rem',
                  mb: 0.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Formula
              </Typography>
              {entry.formula}
            </Box>
          )}

          {/* Example Callout */}
          {entry.example && (
            <Box
              sx={{
                p: 1.25,
                borderRadius: 1.5,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)'}`,
                fontSize: '0.78rem',
                color: isDark ? '#A7F3D0' : '#065F46',
                lineHeight: 1.45,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  mb: 0.25,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Concrete Example
              </Typography>
              {entry.example}
            </Box>
          )}

          {/* Caveats Callout */}
          {entry.caveats && (
            <Box
              sx={{
                p: 1.25,
                borderRadius: 1.5,
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.06)',
                border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)'}`,
                fontSize: '0.78rem',
                color: isDark ? '#FDE68A' : '#92400E',
                lineHeight: 1.45,
                display: 'flex',
                gap: 1,
                alignItems: 'flex-start',
              }}
            >
              <WarningAmberRoundedIcon sx={{ fontSize: 16, mt: 0.25, flexShrink: 0 }} />
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    mb: 0.25,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Important Caveat
                </Typography>
                {entry.caveats}
              </Box>
            </Box>
          )}

          {/* See Also */}
          {entry.seeAlso && entry.seeAlso.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 700,
                  color: isDark ? '#94A3B8' : '#64748B',
                  fontSize: '0.7rem',
                  mb: 0.5,
                }}
              >
                Related Concepts
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {entry.seeAlso.map((alsoKey) => {
                  const target = HELP_CONTENT[alsoKey];
                  if (!target) return null;
                  return (
                    <Chip
                      key={alsoKey}
                      size="small"
                      label={target.title}
                      onClick={() => setCurrentKey(alsoKey)}
                      sx={{
                        fontSize: '0.7rem',
                        height: 22,
                        cursor: 'pointer',
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                        '&:hover': {
                          backgroundColor: theme.palette.primary.main,
                          color: '#FFFFFF',
                        },
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Footer with Documentation link */}
          <Box
            sx={{
              pt: 1,
              mt: 0.5,
              borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="caption" sx={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: '0.7rem' }}>
              Press Esc to dismiss
            </Typography>
            {entry.docsAnchor && (
              <Link
                href={`/docs/${entry.docsAnchor}`}
                target="_blank"
                rel="noreferrer"
                underline="hover"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: theme.palette.primary.main,
                }}
              >
                <MenuBookRoundedIcon sx={{ fontSize: 13 }} />
                Read in docs
              </Link>
            )}
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};
