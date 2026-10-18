import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

export interface SetupMintLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  collapsed?: boolean;
}

export function SetupMintLogo({ size = 'md', showSubtitle = true, collapsed = false }: SetupMintLogoProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const iconSizes = {
    sm: 26,
    md: 34,
    lg: 42,
  };

  const titleSizes = {
    sm: '0.95rem',
    md: '1.2rem',
    lg: '1.45rem',
  };

  const currentIconSize = iconSizes[size];

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, userSelect: 'none' }}>
      {/* Precision Mint Geometric Icon */}
      <Box
        sx={{
          width: currentIconSize,
          height: currentIconSize,
          borderRadius: size === 'sm' ? '7px' : '9px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDark
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(20, 184, 166, 0.15) 100%)'
            : 'linear-gradient(135deg, rgba(5, 150, 105, 0.16) 0%, rgba(13, 148, 136, 0.12) 100%)',
          border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(5, 150, 105, 0.35)'}`,
          boxShadow: isDark
            ? '0 0 16px rgba(16, 185, 129, 0.2)'
            : '0 2px 8px rgba(5, 150, 105, 0.12)',
          flexShrink: 0,
        }}
      >
        <svg
          width={currentIconSize * 0.65}
          height={currentIconSize * 0.65}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Mint Peak Chevron (Ascending Trend) */}
          <path
            d="M3 13L12 4L21 13"
            stroke={isDark ? '#34D399' : '#059669'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Inner Candlestick Bar */}
          <path
            d="M12 8V18"
            stroke={isDark ? '#10B981' : '#10B981'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Foundation Diamond Base */}
          <path
            d="M7 16L12 21L17 16"
            stroke={isDark ? '#6EE7B7' : '#047857'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Box>

      {/* Brand Wordmark & Tagline */}
      {!collapsed && (
        <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
                fontSize: titleSizes[size],
                letterSpacing: '0.06em',
                color: theme.palette.text.primary,
                fontFamily: `'Inter', -apple-system, sans-serif`,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              SETUP<span style={{ color: isDark ? '#34D399' : '#059669' }}>MINT</span>
            </Typography>
            <Box
              component="span"
              sx={{
                fontSize: '0.625rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                px: 0.75,
                py: 0.15,
                borderRadius: '4px',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(5, 150, 105, 0.12)',
                color: isDark ? '#34D399' : '#059669',
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(5, 150, 105, 0.25)'}`,
                fontFamily: `'JetBrains Mono', monospace`,
              }}
            >
              PRO
            </Box>
          </Box>
          {showSubtitle && (
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6875rem',
                color: theme.palette.text.secondary,
                fontWeight: 600,
                letterSpacing: '0.03em',
                mt: 0.25,
              }}
            >
              Trade. Track. Improve.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

// Re-export as StratumLogo for backward compatibility across any existing imports
export const StratumLogo = SetupMintLogo;
