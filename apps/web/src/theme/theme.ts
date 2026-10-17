import { createTheme, alpha, Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    profit: {
      main: string;
      light: string;
      dark: string;
      contrastText: string;
      bg: string;
    };
    loss: {
      main: string;
      light: string;
      dark: string;
      contrastText: string;
      bg: string;
    };
  }
  interface PaletteOptions {
    profit?: {
      main: string;
      light?: string;
      dark?: string;
      contrastText?: string;
      bg?: string;
    };
    loss?: {
      main: string;
      light?: string;
      dark?: string;
      contrastText?: string;
      bg?: string;
    };
  }
}

export function buildTheme(mode: 'dark' | 'light'): Theme {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#10B981' : '#059669', // Emerald
        light: isDark ? '#34D399' : '#10B981',
        dark: isDark ? '#059669' : '#047857',
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: isDark ? '#6366F1' : '#4F46E5', // Indigo
        light: isDark ? '#818CF8' : '#6366F1',
        dark: isDark ? '#4F46E5' : '#3730A3',
        contrastText: '#FFFFFF',
      },
      background: {
        default: isDark ? '#0B0F19' : '#F8FAFC',
        paper: isDark ? '#111827' : '#FFFFFF',
      },
      text: {
        primary: isDark ? '#F8FAFC' : '#0F172A',
        secondary: isDark ? '#94A3B8' : '#64748B',
        disabled: isDark ? '#475569' : '#94A3B8',
      },
      divider: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
      action: {
        hover: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
        selected: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.1)',
        disabled: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.2)',
        disabledBackground: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
      },
      profit: {
        main: '#10B981',
        light: '#34D399',
        dark: '#059669',
        contrastText: '#FFFFFF',
        bg: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.10)',
      },
      loss: {
        main: '#F43F5E',
        light: '#FB7185',
        dark: '#E11D48',
        contrastText: '#FFFFFF',
        bg: isDark ? 'rgba(244, 63, 94, 0.12)' : 'rgba(244, 63, 94, 0.10)',
      },
      success: {
        main: '#10B981',
        contrastText: '#FFFFFF',
      },
      error: {
        main: '#F43F5E',
        contrastText: '#FFFFFF',
      },
      warning: {
        main: '#F59E0B',
        contrastText: '#FFFFFF',
      },
      info: {
        main: '#3B82F6',
        contrastText: '#FFFFFF',
      },
    },
    typography: {
      fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
      h1: {
        fontSize: '2rem',
        fontWeight: 700,
        letterSpacing: '-0.025em',
      },
      h2: {
        fontSize: '1.5rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
      },
      h3: {
        fontSize: '1.25rem',
        fontWeight: 600,
        letterSpacing: '-0.015em',
      },
      h4: {
        fontSize: '1.125rem',
        fontWeight: 600,
        letterSpacing: '-0.01em',
      },
      h5: {
        fontSize: '1rem',
        fontWeight: 600,
      },
      h6: {
        fontSize: '0.875rem',
        fontWeight: 600,
      },
      subtitle1: {
        fontSize: '0.875rem',
        fontWeight: 500,
        lineHeight: 1.5,
      },
      subtitle2: {
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: 1.4,
      },
      body1: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '0.8125rem',
        lineHeight: 1.45,
      },
      button: {
        fontSize: '0.8125rem',
        fontWeight: 600,
        textTransform: 'none',
      },
      caption: {
        fontSize: '0.75rem',
        lineHeight: 1.4,
      },
      overline: {
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': {
              width: 6,
              height: 6,
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              borderRadius: 9999,
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '6px 14px',
            transition: 'all 0.15s ease-in-out',
            fontWeight: 600,
          },
          contained: {
            '&:hover': {
              backgroundColor: isDark ? '#059669' : '#047857',
            },
          },
          outlined: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.15)',
            '&:hover': {
              borderColor: isDark ? '#10B981' : '#059669',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(5, 150, 105, 0.06)',
            },
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'}`,
          },
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'}`,
            backgroundImage: 'none',
            transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.1)'}`,
            boxShadow: isDark
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)'
              : '0 25px 50px -12px rgba(15, 23, 42, 0.15)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '1rem',
            fontWeight: 700,
            padding: '16px 24px',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'}`,
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '16px 24px',
            borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'}`,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(248, 250, 252, 0.8)',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.25)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? '#10B981' : '#059669',
              borderWidth: 1.5,
            },
          },
          notchedOutline: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.12)',
          },
          input: {
            fontSize: '0.875rem',
            padding: '8.5px 12px',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
            padding: '10px 14px',
            fontSize: '0.8125rem',
          },
          head: {
            fontWeight: 600,
            color: isDark ? '#94A3B8' : '#64748B',
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.8)' : 'rgba(248, 250, 252, 0.9)',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.1)'}`,
            textTransform: 'uppercase',
            fontSize: '0.6875rem',
            letterSpacing: '0.04em',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            borderRadius: 6,
            height: 24,
            fontSize: '0.75rem',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#1E293B' : '#0F172A',
            color: '#F8FAFC',
            fontSize: '0.75rem',
            borderRadius: 6,
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'transparent'}`,
            padding: '5px 10px',
          },
          arrow: {
            color: isDark ? '#1E293B' : '#0F172A',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 40,
          },
          indicator: {
            height: 2.5,
            borderRadius: '2px 2px 0 0',
            backgroundColor: isDark ? '#10B981' : '#059669',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '0.8125rem',
            textTransform: 'none',
            color: isDark ? '#94A3B8' : '#64748B',
            '&.Mui-selected': {
              color: isDark ? '#10B981' : '#059669',
            },
          },
        },
      },
    },
  });
}
