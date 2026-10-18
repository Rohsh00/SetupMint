import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastOptions {
  id?: string;
  duration?: number;
  title?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
  createdAt: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Module-level emitter to support calling toast.success() outside React render lifecycle
let toastEmitter: {
  add: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismiss: (id?: string) => void;
} | null = null;

let toastIdCounter = 0;

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    return toastEmitter ? toastEmitter.add('success', message, options) : '';
  },
  error: (message: string, options?: ToastOptions) => {
    return toastEmitter ? toastEmitter.add('error', message, options) : '';
  },
  warning: (message: string, options?: ToastOptions) => {
    return toastEmitter ? toastEmitter.add('warning', message, options) : '';
  },
  info: (message: string, options?: ToastOptions) => {
    return toastEmitter ? toastEmitter.add('info', message, options) : '';
  },
  loading: (message: string, options?: ToastOptions) => {
    return toastEmitter ? toastEmitter.add('loading', message, { duration: 0, ...options }) : '';
  },
  dismiss: (id?: string) => {
    if (toastEmitter) {
      toastEmitter.dismiss(id);
    }
  },
  promise: async <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: any) => string);
    },
    options?: ToastOptions
  ): Promise<T> => {
    const id = toast.loading(messages.loading, options);
    try {
      const result = await promise;
      const successMsg = typeof messages.success === 'function' ? messages.success(result) : messages.success;
      toast.dismiss(id);
      toast.success(successMsg, options);
      return result;
    } catch (err: any) {
      const errorMsg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
      toast.dismiss(id);
      toast.error(errorMsg || err?.message || 'Operation failed', options);
      throw err;
    }
  },
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return {
    toasts: context.toasts,
    toast,
    dismiss: context.dismissToast,
  };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id?: string) => {
    if (!id) {
      setToasts([]);
    } else {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }
  }, []);

  const addToast = useCallback((type: ToastType, message: string, options?: ToastOptions): string => {
    // Duplicate suppression: suppress identical toast within 1.5s
    const dedupeKey = `${type}:${message}`;
    const now = Date.now();
    const lastSeen = recentToastsRef.current.get(dedupeKey);
    if (lastSeen && now - lastSeen < 1500 && type !== 'loading') {
      return '';
    }
    recentToastsRef.current.set(dedupeKey, now);

    // Clean up cache periodically
    if (recentToastsRef.current.size > 50) {
      recentToastsRef.current.forEach((time, key) => {
        if (now - time > 5000) {
          recentToastsRef.current.delete(key);
        }
      });
    }

    const id = options?.id || `toast-${now}-${++toastIdCounter}`;
    const defaultDuration = type === 'loading' ? 0 : type === 'error' ? 5000 : 4000;
    const duration = options?.duration !== undefined ? options.duration : defaultDuration;

    const newToast: ToastItem = {
      id,
      type,
      message,
      title: options?.title,
      duration,
      createdAt: now,
      action: options?.action,
    };

    setToasts((prev) => {
      // If a toast with this id already exists (e.g. updating a loading toast), replace it
      const existingIdx = prev.findIndex((t) => t.id === id);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = newToast;
        return next;
      }
      // Maximum 5 visible toasts at any time
      return [...prev.slice(-4), newToast];
    });

    return id;
  }, []);

  useEffect(() => {
    toastEmitter = {
      add: addToast,
      dismiss: dismissToast,
    };
    return () => {
      toastEmitter = null;
    };
  }, [addToast, dismissToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (toasts.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: { xs: 16, sm: 24 },
        right: { xs: 16, sm: 24 },
        zIndex: 99999, // Above MUI Dialogs (1300) and menus (1400)
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        maxWidth: { xs: 'calc(100vw - 32px)', sm: 420 },
        width: '100%',
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} isDark={isDark} />
      ))}
    </Box>
  );
}

function ToastCard({
  item,
  onDismiss,
  isDark,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
  isDark: boolean;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (item.duration <= 0) return;

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(item.id), 250);
    }, item.duration);

    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(item.id), 250);
  };

  const configByType = {
    success: {
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(236, 253, 245, 0.95)',
      border: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.4)',
      icon: <CheckCircleRoundedIcon sx={{ color: '#10B981', fontSize: 20 }} />,
    },
    error: {
      color: '#F43F5E',
      bg: isDark ? 'rgba(244, 63, 94, 0.14)' : 'rgba(255, 241, 242, 0.95)',
      border: isDark ? 'rgba(244, 63, 94, 0.4)' : 'rgba(244, 63, 94, 0.4)',
      icon: <ErrorRoundedIcon sx={{ color: '#F43F5E', fontSize: 20 }} />,
    },
    warning: {
      color: '#F59E0B',
      bg: isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(254, 252, 232, 0.95)',
      border: isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.4)',
      icon: <WarningAmberRoundedIcon sx={{ color: '#F59E0B', fontSize: 20 }} />,
    },
    info: {
      color: '#06B6D4',
      bg: isDark ? 'rgba(6, 182, 212, 0.12)' : 'rgba(236, 254, 255, 0.95)',
      border: isDark ? 'rgba(6, 182, 212, 0.35)' : 'rgba(6, 182, 212, 0.35)',
      icon: <InfoRoundedIcon sx={{ color: '#06B6D4', fontSize: 20 }} />,
    },
    loading: {
      color: '#10B981',
      bg: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)',
      border: isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.4)',
      icon: <CircularProgress size={18} sx={{ color: '#10B981' }} />,
    },
  };

  const styleConfig = configByType[item.type];

  return (
    <Box
      role="alert"
      sx={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        p: 1.75,
        borderRadius: '12px',
        backgroundColor: styleConfig.bg,
        backdropFilter: 'blur(16px)',
        border: `1px solid ${styleConfig.border}`,
        boxShadow: isDark
          ? '0 16px 36px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          : '0 12px 28px -6px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        color: isDark ? '#F8FAFC' : '#0F172A',
        transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isExiting ? 'translateX(100%) scale(0.95)' : 'translateX(0) scale(1)',
        opacity: isExiting ? 0 : 1,
        animation: 'toastSlideIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        '@keyframes toastSlideIn': {
          '0%': { transform: 'translateX(80px) scale(0.95)', opacity: 0 },
          '100%': { transform: 'translateX(0) scale(1)', opacity: 1 },
        },
      }}
    >
      <Box sx={{ flexShrink: 0, mt: 0.25, display: 'flex', alignItems: 'center' }}>
        {styleConfig.icon}
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {item.title && (
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              display: 'block',
              letterSpacing: '0.01em',
              color: styleConfig.color,
              mb: 0.25,
            }}
          >
            {item.title}
          </Typography>
        )}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            fontSize: '0.875rem',
            lineHeight: 1.45,
            color: isDark ? '#F1F5F9' : '#1E293B',
            wordBreak: 'break-word',
          }}
        >
          {item.message}
        </Typography>

        {item.action && (
          <Button
            size="small"
            variant="text"
            onClick={item.action.onClick}
            sx={{
              mt: 0.75,
              p: 0,
              minWidth: 0,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: styleConfig.color,
              textTransform: 'none',
              '&:hover': {
                backgroundColor: 'transparent',
                textDecoration: 'underline',
              },
            }}
          >
            {item.action.label}
          </Button>
        )}
      </Box>

      <IconButton
        size="small"
        onClick={handleClose}
        aria-label="Close notification"
        sx={{
          color: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
          p: 0.5,
          mt: -0.25,
          mr: -0.5,
          '&:hover': {
            color: isDark ? '#FFFFFF' : '#000000',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
        }}
      >
        <CloseRoundedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}
