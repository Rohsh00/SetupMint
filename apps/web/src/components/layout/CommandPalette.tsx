import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  InputBase,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  CircularProgress,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import TableViewRoundedIcon from '@mui/icons-material/TableViewRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import CurrencyExchangeRoundedIcon from '@mui/icons-material/CurrencyExchangeRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import KeyboardReturnRoundedIcon from '@mui/icons-material/KeyboardReturnRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import RateReviewRoundedIcon from '@mui/icons-material/RateReviewRounded';

import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenNewTrade: () => void;
}

interface PaletteItem {
  id: string;
  category: 'ACTIONS' | 'NAVIGATION';
  title: string;
  subtitle: string;
  icon: React.ElementType;
  shortcut?: string;
  keywords: string[];
  action: () => void | Promise<void>;
}

export function CommandPalette({ open, onClose, onOpenNewTrade }: CommandPaletteProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input whenever opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setIsExecuting(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Repeat last trade execution
  const handleRepeatLastTrade = async () => {
    try {
      setIsExecuting(true);
      const res = await api.trades.list({ limit: 1, sortBy: 'createdAt', sortOrder: 'desc' });
      const trades = Array.isArray(res) ? res : res?.data || [];
      if (!trades || trades.length === 0) {
        toast.info('No recent trades found to repeat.');
        onClose();
        return;
      }

      const latestTrade = trades[0];
      const dupRes = await api.trades.duplicate(latestTrade.id || latestTrade._id);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      const newId = dupRes?.id || dupRes?.data?.id || dupRes?._id;
      toast.success(`Repeated setup for ${latestTrade.symbol}. Opened new draft.`);
      onClose();
      if (newId) {
        navigate(`/trades/${newId}`);
      } else {
        navigate('/trades');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to repeat last trade');
    } finally {
      setIsExecuting(false);
    }
  };

  // Commands definition
  const items: PaletteItem[] = useMemo(() => [
    {
      id: 'action-new-trade',
      category: 'ACTIONS',
      title: 'Log New Trade',
      subtitle: 'Open the trade capture modal for fast logging',
      icon: AddRoundedIcon,
      shortcut: 'N',
      keywords: ['new', 'trade', 'create', 'log', 'entry', 'buy', 'sell'],
      action: () => {
        onClose();
        onOpenNewTrade();
      },
    },
    {
      id: 'action-repeat-last',
      category: 'ACTIONS',
      title: 'Repeat Last Trade',
      subtitle: 'Duplicate your most recent trade setup for fast re-entry',
      icon: ContentCopyRoundedIcon,
      shortcut: 'R',
      keywords: ['repeat', 'last', 'duplicate', 'clone', 'copy', 're-entry'],
      action: handleRepeatLastTrade,
    },
    {
      id: 'action-jump-journal',
      category: 'ACTIONS',
      title: "Jump to Today's Journal",
      subtitle: 'Open the trading journal reflection for today',
      icon: CalendarMonthRoundedIcon,
      shortcut: 'J',
      keywords: ['journal', 'today', 'reflection', 'diary', 'calendar', 'psychology'],
      action: () => {
        onClose();
        navigate('/journal');
      },
    },
    {
      id: 'action-risk-calc',
      category: 'ACTIONS',
      title: 'Open Risk & Position Size Calculator',
      subtitle: 'Calculate exact position size and statutory charges preview',
      icon: CalculateRoundedIcon,
      shortcut: 'C',
      keywords: ['risk', 'calculator', 'size', 'position', 'sizing', 'capital', 'r:r'],
      action: () => {
        onClose();
        navigate('/risk-calculator');
      },
    },
    {
      id: 'action-trade-templates',
      category: 'ACTIONS',
      title: 'Apply Trade Setup Template',
      subtitle: 'Pick a rule-driven setup (F&O, Stocks, Forex, Crypto, MCX) for fast prefill',
      icon: AutoAwesomeRoundedIcon,
      shortcut: 'T',
      keywords: ['template', 'setup', 'orb', 'gap and go', 'breakout', 'rule', 'prefill', 'strategy'],
      action: () => {
        onClose();
        onOpenNewTrade();
      },
    },
    // Navigation
    {
      id: 'nav-overview',
      category: 'NAVIGATION',
      title: 'Go to Overview',
      subtitle: 'Dashboard KPI summary, win rate, and recent activity',
      icon: DashboardRoundedIcon,
      keywords: ['overview', 'dashboard', 'home', 'kpi', 'stats'],
      action: () => {
        onClose();
        navigate('/');
      },
    },
    {
      id: 'nav-trades',
      category: 'NAVIGATION',
      title: 'Go to Trades',
      subtitle: 'Full tabular trade history, filters, and batch actions',
      icon: TableViewRoundedIcon,
      keywords: ['trades', 'log', 'history', 'table', 'orders'],
      action: () => {
        onClose();
        navigate('/trades');
      },
    },
    {
      id: 'nav-weekly-review',
      category: 'NAVIGATION',
      title: 'Weekly Review',
      subtitle: 'Synthesize trading week, evaluate focus rule & set next goals',
      icon: RateReviewRoundedIcon,
      shortcut: 'W',
      keywords: ['weekly', 'review', 'focus', 'rule', 'report', 'discipline', 'synthesis', 'expectancy'],
      action: () => {
        onClose();
        navigate('/review/weekly');
      },
    },
    {
      id: 'nav-analytics',
      category: 'NAVIGATION',
      title: 'Go to Analytics',
      subtitle: 'Deep performance breakdown, equity curve, and session stats',
      icon: ShowChartRoundedIcon,
      keywords: ['analytics', 'charts', 'performance', 'equity', 'curve', 'breakdown', 'drawdown'],
      action: () => {
        onClose();
        navigate('/analytics');
      },
    },
    {
      id: 'nav-strategies',
      category: 'NAVIGATION',
      title: 'Go to Strategy Playbook',
      subtitle: 'Manage execution playbooks, rules, and entry confluences',
      icon: MenuBookRoundedIcon,
      keywords: ['strategies', 'playbook', 'rules', 'confluences', 'setups'],
      action: () => {
        onClose();
        navigate('/strategies');
      },
    },
    {
      id: 'nav-templates',
      category: 'NAVIGATION',
      title: 'Go to Trade Setup Templates',
      subtitle: 'Inspect 20 market-based setups & custom rules with statistical win rates',
      icon: LayersRoundedIcon,
      keywords: ['templates', 'setups', 'rules', 'fno', 'stocks', 'forex', 'crypto', 'mcx'],
      action: () => {
        onClose();
        navigate('/strategies?tab=templates');
      },
    },
    {
      id: 'nav-accounts',
      category: 'NAVIGATION',
      title: 'Go to Accounts & Cash Flows',
      subtitle: 'Trading accounts, broker connections, deposits, and withdrawals',
      icon: AccountBalanceWalletRoundedIcon,
      keywords: ['accounts', 'broker', 'balance', 'cash', 'deposits', 'withdrawals'],
      action: () => {
        onClose();
        navigate('/accounts');
      },
    },
    {
      id: 'nav-instruments',
      category: 'NAVIGATION',
      title: 'Go to Instruments',
      subtitle: 'Search symbols, lot sizes, multipliers, and exchange segments',
      icon: CurrencyExchangeRoundedIcon,
      keywords: ['instruments', 'symbols', 'lots', 'fno', 'multiplier', 'market'],
      action: () => {
        onClose();
        navigate('/instruments');
      },
    },
    {
      id: 'nav-reports',
      category: 'NAVIGATION',
      title: 'Go to Reports & Exports',
      subtitle: 'Financial year reports, CSV imports, and data exports',
      icon: AssessmentRoundedIcon,
      keywords: ['reports', 'exports', 'csv', 'import', 'financial year', 'tax'],
      action: () => {
        onClose();
        navigate('/reports');
      },
    },
    {
      id: 'nav-settings',
      category: 'NAVIGATION',
      title: 'Go to Settings',
      subtitle: 'Account preferences, risk limits, and local backup tools',
      icon: SettingsRoundedIcon,
      keywords: ['settings', 'preferences', 'backup', 'restore', 'limits'],
      action: () => {
        onClose();
        navigate('/settings');
      },
    },
  ], [navigate, onClose, onOpenNewTrade]);

  // Filter items by query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const lower = query.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.subtitle.toLowerCase().includes(lower) ||
        item.keywords.some((k) => k.toLowerCase().includes(lower))
    );
  }, [items, query]);

  // Reset selected index on filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation within the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${muiTheme.palette.divider}`,
            boxShadow: isDark
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            top: { xs: 0, sm: -100 },
          },
        },
      }}
    >
      <DialogContent sx={{ p: 0 }} onKeyDown={handleKeyDown}>
        {/* Search Input Bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 2,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
          }}
        >
          {isExecuting ? (
            <CircularProgress size={20} color="primary" />
          ) : (
            <SearchRoundedIcon sx={{ color: muiTheme.palette.text.secondary, fontSize: 22 }} />
          )}
          <InputBase
            inputRef={inputRef}
            fullWidth
            placeholder="Search commands, pages, or actions... (Cmd+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isExecuting}
            sx={{
              fontSize: '1rem',
              fontWeight: 500,
              color: muiTheme.palette.text.primary,
            }}
          />
          <Chip
            label="ESC"
            size="small"
            onClick={onClose}
            sx={{
              height: 22,
              fontSize: '0.625rem',
              fontWeight: 700,
              fontFamily: `'JetBrains Mono', monospace`,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              color: muiTheme.palette.text.secondary,
              cursor: 'pointer',
            }}
          />
        </Box>

        {/* Results List */}
        <Box sx={{ maxHeight: 380, overflowY: 'auto', p: 1 }}>
          {filteredItems.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
                No commands matching &ldquo;{query}&rdquo;
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {filteredItems.map((item, index) => {
                const IconComponent = item.icon;
                const isSelected = index === selectedIndex;
                const isFirstOfCategory =
                  index === 0 || filteredItems[index - 1].category !== item.category;

                return (
                  <React.Fragment key={item.id}>
                    {isFirstOfCategory && (
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          px: 2,
                          pt: 1.5,
                          pb: 0.5,
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          color: muiTheme.palette.text.secondary,
                          fontSize: '0.6875rem',
                        }}
                      >
                        {item.category === 'ACTIONS' ? 'Quick Actions' : 'Navigation'}
                      </Typography>
                    )}
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(index)}
                        sx={{
                          borderRadius: 2,
                          py: 1,
                          px: 1.5,
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(16, 185, 129, 0.1)'
                            : 'transparent',
                          '&:hover': {
                            backgroundColor: isDark
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(16, 185, 129, 0.12)',
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 38,
                            color: isSelected
                              ? muiTheme.palette.primary.main
                              : muiTheme.palette.text.secondary,
                          }}
                        >
                          <IconComponent fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: isSelected ? 700 : 500,
                                color: muiTheme.palette.text.primary,
                              }}
                            >
                              {item.title}
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="caption"
                              sx={{ color: muiTheme.palette.text.secondary, fontSize: '0.75rem' }}
                            >
                              {item.subtitle}
                            </Typography>
                          }
                        />
                        {item.shortcut && (
                          <Chip
                            label={item.shortcut}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              fontFamily: `'JetBrains Mono', monospace`,
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                              color: muiTheme.palette.text.secondary,
                            }}
                          />
                        )}
                        {isSelected && (
                          <KeyboardReturnRoundedIcon
                            sx={{
                              fontSize: 16,
                              ml: 1,
                              color: muiTheme.palette.primary.main,
                            }}
                          />
                        )}
                      </ListItemButton>
                    </ListItem>
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </Box>

        {/* Footer Shortcut Legend */}
        <Divider />
        <Box
          sx={{
            px: 2.5,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.6875rem',
            color: muiTheme.palette.text.secondary,
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.02)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span>
              <strong style={{ fontFamily: `'JetBrains Mono', monospace` }}>↑↓</strong> Navigate
            </span>
            <span>
              <strong style={{ fontFamily: `'JetBrains Mono', monospace` }}>↵</strong> Select
            </span>
            <span>
              <strong style={{ fontFamily: `'JetBrains Mono', monospace` }}>Esc</strong> Close
            </span>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span style={{ fontFamily: `'JetBrains Mono', monospace` }}>SetupMint Quick Palette</span>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
