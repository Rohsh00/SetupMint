import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface StratumLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  collapsed?: boolean;
}

export function StratumLogo({ size = 'md', showSubtitle = true, collapsed = false }: StratumLogoProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 40,
  };

  const titleSizes = {
    sm: '0.95rem',
    md: '1.15rem',
    lg: '1.35rem',
  };

  const currentIconSize = iconSizes[size];

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, userSelect: 'none' }}>
      {/* Precision Geometric Strata Icon */}
      <Box
        sx={{
          width: currentIconSize,
          height: currentIconSize,
          borderRadius: size === 'sm' ? '6px' : '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDark
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(99, 102, 241, 0.15) 100%)'
            : 'linear-gradient(135deg, rgba(5, 150, 105, 0.15) 0%, rgba(79, 70, 229, 0.1) 100%)',
          border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.3)'}`,
          boxShadow: isDark
            ? '0 0 15px rgba(16, 185, 129, 0.15)'
            : '0 2px 6px rgba(5, 150, 105, 0.1)',
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
          {/* Top Pinnacle Diamond */}
          <path
            d="M12 2L17 7L12 12L7 7L12 2Z"
            fill={isDark ? '#34D399' : '#059669'}
          />
          {/* Middle Strata Layer */}
          <path
            d="M4 14L12 10L20 14L12 18L4 14Z"
            fill={isDark ? '#10B981' : '#10B981'}
            fillOpacity={0.8}
          />
          {/* Foundation Strata Layer */}
          <path
            d="M4 18L12 22L20 18"
            stroke={isDark ? '#6EE7B7' : '#047857'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Box>

      {/* Brand Wordmark & Label */}
      {!collapsed && (
        <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                fontSize: titleSizes[size],
                letterSpacing: '0.05em',
                color: theme.palette.text.primary,
                fontFamily: `'Inter', sans-serif`,
              }}
            >
              STRATUM
            </Typography>
            <Box
              component="span"
              sx={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                px: 0.75,
                py: 0.2,
                borderRadius: '4px',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(5, 150, 105, 0.12)',
                color: isDark ? '#34D399' : '#059669',
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'}`,
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
                fontWeight: 500,
                letterSpacing: '0.02em',
                mt: 0.25,
              }}
            >
              Discretionary Execution Journal
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
