import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import FormControl from '@mui/material/FormControl';
import ListSubheader from '@mui/material/ListSubheader';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import LayoutDashboardIcon from '@mui/icons-material/DashboardRounded';
import TableViewIcon from '@mui/icons-material/TableViewRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import ShowChartIcon from '@mui/icons-material/ShowChartRounded';
import MenuBookIcon from '@mui/icons-material/MenuBookRounded';
import CalculateIcon from '@mui/icons-material/CalculateRounded';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchangeRounded';
import AssessmentIcon from '@mui/icons-material/AssessmentRounded';
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import AddIcon from '@mui/icons-material/AddRounded';
import SearchIcon from '@mui/icons-material/SearchRounded';
import LightModeIcon from '@mui/icons-material/LightModeRounded';
import DarkModeIcon from '@mui/icons-material/DarkModeRounded';
import MenuIcon from '@mui/icons-material/MenuRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import SyncIcon from '@mui/icons-material/SyncRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import RateReviewIcon from '@mui/icons-material/RateReviewRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useAccountScope, useAccountCapabilities } from '../../context/AccountScopeContext.js';
import { api } from '../../lib/api.js';
import { TradeFormModal } from '../trades/TradeFormModal.js';
import { TradeDrillDrawer } from '../drilldown/TradeDrillDrawer.js';
import { SetupMintLogo } from '../brand/SetupMintLogo.js';
import { CommandPalette } from './CommandPalette.js';
import { toast } from '../../context/ToastContext.js';

const DRAWER_WIDTH = 250;
const COLLAPSED_DRAWER_WIDTH = 72;

export function AppLayout() {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const {
    scope,
    isPropMode,
    selectedScopeValue,
    setScopeValue,
    selectedAccountId,
    accounts,
    propAccounts,
    personalAccounts,
    demoAccounts,
    propFirms,
    queryParams,
    isMultiCurrency,
    currencies,
    currency,
  } = useAccountScope();
  const caps = useAccountCapabilities();

  // Global Keyboard Shortcuts (Cmd+K palette, N for new trade)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K opens/toggles command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Avoid interrupting form inputs
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputActive =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isInputActive) return;

      // Single-key global shortcuts when no modal is open (N disabled in archived mode)
      if (!isTradeModalOpen && !isCommandPaletteOpen) {
        if (e.key.toLowerCase() === 'n' && !caps.isArchived) {
          e.preventDefault();
          setIsTradeModalOpen(true);
        } else if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          navigate('/review/weekly');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTradeModalOpen, isCommandPaletteOpen, caps.isArchived, navigate]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      try {
        sessionStorage.removeItem('setupmint_account_scope');
      } catch {}
      queryClient.clear();
      toast.success('Logged out successfully.');
      navigate('/login', { replace: true });
    } catch (err: any) {
      console.error('Logout error:', err);
      toast.error(err?.message || 'Logout failed');
    } finally {
      setIsLoggingOut(false);
      setUserMenuAnchor(null);
    }
  };



  // Prefetch trade form reference data so opening 'Log New Trade' happens in 0ms synchronously from memory cache
  const prefetchTradeFormData = React.useCallback(() => {
    queryClient.prefetchQuery({ queryKey: ['instruments', queryParams], queryFn: () => api.instruments.list(queryParams), staleTime: 10 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ['strategies', queryParams], queryFn: () => api.strategies.list(queryParams), staleTime: 5 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ['templates', queryParams], queryFn: () => api.templates.list(queryParams), staleTime: 5 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ['trades', 'recent-tilt', queryParams], queryFn: () => api.trades.list({ ...queryParams, limit: 20 }), staleTime: 60 * 1000 });
  }, [queryClient, queryParams]);

  useEffect(() => {
    prefetchTradeFormData();
  }, [prefetchTradeFormData]);

  // Query FYERS live connection status (only when scope supports FYERS)
  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
    enabled: Boolean(caps.broker.isFyers),
  });

  const fyersData = (fyersStatus as any)?.data ?? fyersStatus;
  const isFyersConfigured = Boolean(fyersData?.isConfigured || fyersData?.appId);
  const isFyersConnected = Boolean(fyersData?.isConnected);

  const [isSyncingFyers, setIsSyncingFyers] = useState(false);
  const [isConnectingFyers, setIsConnectingFyers] = useState(false);

  const handleQuickFyersConnect = async () => {
    if (!isFyersConfigured) {
      toast.info('Configure your FYERS API credentials in Settings.');
      navigate('/settings');
      return;
    }
    setIsConnectingFyers(true);
    try {
      const res = await api.integrations.fyersLoginUrl();
      const url = res?.url || res?.data?.url;
      if (url) {
        toast.info('Opening FYERS login portal...');
        window.location.href = url;
      } else {
        toast.info('Redirecting to Settings to complete FYERS setup...');
        navigate('/settings');
      }
    } catch (err: any) {
      toast.info('Redirecting to Settings to configure FYERS credentials...');
      navigate('/settings');
    } finally {
      setIsConnectingFyers(false);
    }
  };

  const handleQuickFyersSync = async () => {
    if (!isFyersConnected) {
      navigate('/settings');
      return;
    }
    setIsSyncingFyers(true);
    try {
      const res = await api.integrations.fyersSync();
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(res?.message || 'Synchronized trades from FYERS successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sync trades from FYERS.');
    } finally {
      setIsSyncingFyers(false);
    }
  };

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboardIcon },
    { to: '/trades', label: 'Trades', icon: TableViewIcon },
    { to: '/journal', label: 'Journal Calendar', icon: CalendarMonthIcon },
    { to: '/review/weekly', label: 'Weekly Review', icon: RateReviewIcon },
    { to: '/analytics', label: 'Analytics', icon: ShowChartIcon },
    { to: '/strategies', label: 'Strategy Playbook', icon: MenuBookIcon },
    { to: '/risk-calculator', label: 'Risk Calculator', icon: CalculateIcon },
    { to: '/accounts', label: 'Accounts', icon: AccountBalanceWalletIcon },
    { to: '/instruments', label: 'Instruments', icon: CurrencyExchangeIcon },
    { to: '/reports', label: 'Reports & Exports', icon: AssessmentIcon },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const currentDrawerWidth = sidebarCollapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH;

  // Preserve global scope and date range query params when switching pages via Sidebar
  const preservedSearch = React.useMemo(() => {
    const currentParams = new URLSearchParams(location.search);
    const kept = new URLSearchParams();
    for (const key of ['scope', 'firm', 'firmKey', 'type', 'accountType', 'account', 'accountId', 'range', 'from', 'to']) {
      const val = currentParams.get(key);
      if (val) kept.set(key, val);
    }
    const str = kept.toString();
    return str ? `?${str}` : '';
  }, [location.search]);

  const drawerContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: muiTheme.palette.background.paper,
        borderRight: `1px solid ${muiTheme.palette.divider}`,
      }}
    >
      {/* Brand Header */}
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          px: sidebarCollapsed ? 1 : 2.5,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <SetupMintLogo
          size={sidebarCollapsed ? 'sm' : 'md'}
          collapsed={sidebarCollapsed}
          showSubtitle={!sidebarCollapsed}
        />
        {!isMobile && (
          <IconButton
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            size="small"
            sx={{
              display: sidebarCollapsed ? 'none' : 'inline-flex',
              color: muiTheme.palette.text.secondary,
              border: `1px solid ${muiTheme.palette.divider}`,
              borderRadius: 1.5,
              '&:hover': {
                backgroundColor: muiTheme.palette.action.hover,
                color: muiTheme.palette.text.primary,
              },
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Log Trade CTA (Hidden in Archived Mode) */}
      {!caps.isArchived && (
        <Box sx={{ p: sidebarCollapsed ? 1 : 2 }}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onMouseEnter={prefetchTradeFormData}
            onClick={() => {
              setIsTradeModalOpen(true);
              if (isMobile) setMobileOpen(false);
            }}
            startIcon={<AddIcon />}
            sx={{
              py: 1,
              borderRadius: 2,
              fontWeight: 700,
              fontSize: '0.8125rem',
              minWidth: sidebarCollapsed ? 0 : 'auto',
              px: sidebarCollapsed ? 0 : 2,
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              '& .MuiButton-startIcon': {
                mr: sidebarCollapsed ? 0 : 1,
                ml: sidebarCollapsed ? 0 : 0,
              },
            }}
          >
            {!sidebarCollapsed && 'Log New Trade'}
          </Button>
        </Box>
      )}

      {/* Navigation Links */}
      <List sx={{ px: 1, py: 0.5, flex: 1, overflowY: 'auto' }}>
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive =
            location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));

          const listItem = (
            <ListItem key={item.to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={{ pathname: item.to, search: preservedSearch }}
                onClick={() => {
                  if (isMobile) setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  py: 1,
                  px: sidebarCollapsed ? 1.5 : 2,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  backgroundColor: isActive
                    ? isDark
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(5, 150, 105, 0.1)'
                    : 'transparent',
                  color: isActive
                    ? muiTheme.palette.primary.main
                    : muiTheme.palette.text.secondary,
                  border: isActive
                    ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(5, 150, 105, 0.2)'}`
                    : '1px solid transparent',
                  '&:hover': {
                    backgroundColor: isActive
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'rgba(5, 150, 105, 0.15)'
                      : muiTheme.palette.action.hover,
                    color: muiTheme.palette.text.primary,
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: sidebarCollapsed ? 0 : 36,
                    color: isActive
                      ? muiTheme.palette.primary.main
                      : muiTheme.palette.text.secondary,
                    justifyContent: 'center',
                  }}
                >
                  <IconComponent sx={{ fontSize: 20 }} />
                </ListItemIcon>
                {!sidebarCollapsed && (
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.8125rem',
                          fontWeight: isActive ? 600 : 500,
                          color: isActive
                            ? muiTheme.palette.primary.main
                            : muiTheme.palette.text.secondary,
                        }}
                      >
                        {item.label}
                      </Typography>
                    }
                  />
                )}
              </ListItemButton>
            </ListItem>
          );

          return sidebarCollapsed ? (
            <Tooltip key={item.to} title={item.label} placement="right" arrow>
              {listItem}
            </Tooltip>
          ) : (
            listItem
          );
        })}
      </List>

      {/* Expand Button for Collapsed State */}
      {!isMobile && sidebarCollapsed && (
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
          <IconButton
            onClick={() => setSidebarCollapsed(false)}
            size="small"
            sx={{
              color: muiTheme.palette.text.secondary,
              border: `1px solid ${muiTheme.palette.divider}`,
              borderRadius: 1.5,
              '&:hover': {
                backgroundColor: muiTheme.palette.action.hover,
                color: muiTheme.palette.text.primary,
              },
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Footer Profile & Logout */}
      <Divider />
      <Box
        sx={{
          p: sidebarCollapsed ? 1 : 1.75,
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
        }}
      >
        {!sidebarCollapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, mr: 1 }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(5, 150, 105, 0.15)',
                color: muiTheme.palette.primary.main,
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.3)'}`,
              }}
            >
              {user?.name?.slice(0, 2).toUpperCase() || 'TR'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                noWrap
                sx={{ fontWeight: 600, fontSize: '0.8125rem', color: muiTheme.palette.text.primary }}
              >
                {user?.name || 'Trader'}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                sx={{
                  color: muiTheme.palette.text.secondary,
                  display: 'block',
                  fontSize: '0.6875rem',
                  fontFamily: `'JetBrains Mono', monospace`,
                }}
              >
                {user?.email || 'trader@setupmint.com'}
              </Typography>
            </Box>
          </Box>
        )}
        <Tooltip title="Sign Out" arrow>
          <IconButton
            id="sidebar-logout-btn"
            size="small"
            disabled={isLoggingOut}
            onClick={handleLogout}
            aria-label="Sign Out"
            sx={{
              color: muiTheme.palette.text.secondary,
              '&:hover': {
                color: muiTheme.palette.error.main,
                backgroundColor: isDark ? 'rgba(244, 63, 94, 0.1)' : 'rgba(220, 38, 38, 0.08)',
              },
            }}
          >
            {isLoggingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Mobile Drawer */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        /* Desktop Persistent Collapsible Drawer */
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: currentDrawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: currentDrawerWidth,
              boxSizing: 'border-box',
              transition: muiTheme.transitions.create('width', {
                easing: muiTheme.transitions.easing.sharp,
                duration: muiTheme.transitions.duration.enteringScreen,
              }),
              overflowX: 'hidden',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main Execution Shell */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: muiTheme.palette.background.default,
        }}
      >
        {/* Top Header / App Bar */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            height: 64,
            justifyContent: 'center',
            backgroundColor: isDark
              ? 'rgba(11, 15, 25, 0.85)'
              : 'rgba(248, 250, 252, 0.85)',
            backdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            color: muiTheme.palette.text.primary,
            px: { xs: 2, md: 3 },
          }}
        >
          <Toolbar disableGutters sx={{ minHeight: '64px !important', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {isMobile && (
                <IconButton
                  color="inherit"
                  aria-label="open drawer"
                  edge="start"
                  onClick={() => setMobileOpen(true)}
                  size="small"
                  sx={{ mr: 0.5 }}
                >
                  <MenuIcon />
                </IconButton>
              )}

              {/* Global Account Selector */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: muiTheme.palette.text.secondary,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: { xs: 'none', sm: 'inline' },
                  }}
                >
                  Account:
                </Typography>
                <FormControl size="small">
                  <Select
                    value={selectedScopeValue}
                    onChange={(e) => setScopeValue(e.target.value)}
                    sx={{
                      height: 36,
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      borderRadius: 2,
                      minWidth: { xs: 140, sm: 220 },
                    }}
                  >
                    <MenuItem value="ALL">
                      🌐 All Accounts (Consolidated)
                    </MenuItem>
                    {personalAccounts.length > 0 && (
                      <MenuItem value="TYPE:LIVE">
                        💼{' '}
                        {personalAccounts.length === 1
                          ? `${personalAccounts[0].name} (${personalAccounts[0].baseCurrency})`
                          : `Personal / Live Accounts (${personalAccounts.length})`}
                      </MenuItem>
                    )}
                    <MenuItem value="PROP_FIRM:ALL">
                      🏆{' '}
                      {propAccounts.length === 1
                        ? `${propAccounts[0].name} (${propAccounts[0].baseCurrency})`
                        : `Prop Firm Mode${propAccounts.length > 1 ? ` (${propAccounts.length})` : ''}`}
                    </MenuItem>
                    {propFirms.length > 1 &&
                      propFirms.map((firm) => (
                        <MenuItem key={firm} value={`PROP_FIRM:${firm}`} sx={{ pl: 3.5, fontSize: '0.8rem' }}>
                          ↳ Firm: {firm.toUpperCase()}
                        </MenuItem>
                      ))}
                    {demoAccounts.length > 0 && (
                      <MenuItem value="TYPE:DEMO">
                        🧪{' '}
                        {demoAccounts.length === 1
                          ? `${demoAccounts[0].name} (${demoAccounts[0].baseCurrency})`
                          : `Demo Accounts (${demoAccounts.length})`}
                      </MenuItem>
                    )}
                    {(personalAccounts.length > 1 || propAccounts.length > 1 || demoAccounts.length > 1) && [
                      <Divider key="ind-div" sx={{ my: 0.5 }} />,
                      <ListSubheader
                        key="ind-sub"
                        sx={{ lineHeight: '24px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}
                      >
                        Individual Accounts
                      </ListSubheader>,
                      ...(personalAccounts.length > 1 ? personalAccounts : []).map((acc: any) => (
                        <MenuItem key={acc.id} value={`ACCOUNT:${acc.id}`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                            <span>💼 {acc.name}</span>
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Chip size="small" label={acc.baseCurrency} sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                              <Chip size="small" variant="outlined" label={acc.profile?.executionAdapterKey || acc.broker || 'MANUAL'} sx={{ height: 18, fontSize: '0.6rem' }} />
                            </Box>
                          </Box>
                        </MenuItem>
                      )),
                      ...(propAccounts.length > 1 ? propAccounts : []).map((acc: any) => (
                        <MenuItem key={acc.id} value={`ACCOUNT:${acc.id}`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                            <span>🏆 {acc.name}</span>
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Chip size="small" label={acc.baseCurrency} sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                              <Chip size="small" variant="outlined" label={acc.profile?.executionAdapterKey || acc.broker || 'MANUAL'} sx={{ height: 18, fontSize: '0.6rem' }} />
                            </Box>
                          </Box>
                        </MenuItem>
                      )),
                      ...(demoAccounts.length > 1 ? demoAccounts : []).map((acc: any) => (
                        <MenuItem key={acc.id} value={`ACCOUNT:${acc.id}`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                            <span>🧪 {acc.name}</span>
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Chip size="small" label={acc.baseCurrency} sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                              <Chip size="small" variant="outlined" label={acc.profile?.executionAdapterKey || acc.broker || 'MANUAL'} sx={{ height: 18, fontSize: '0.6rem' }} />
                            </Box>
                          </Box>
                        </MenuItem>
                      )),
                    ]}
                  </Select>
                </FormControl>
                {isMultiCurrency ? (
                  <Tooltip
                    title={`Scope spans multiple currencies (${currencies.join(', ')}). Totals are displayed per currency to maintain financial accuracy.`}
                    arrow
                  >
                    <Chip
                      size="small"
                      icon={<WarningAmberRoundedIcon sx={{ fontSize: '14px !important' }} />}
                      label={`Multi-Currency (${currencies.join(', ')})`}
                      color="warning"
                      variant="outlined"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.6875rem',
                        height: 26,
                      }}
                    />
                  </Tooltip>
                ) : currency && currency !== 'MULTI' ? (
                  <Chip
                    size="small"
                    label={currency}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.6875rem',
                      height: 26,
                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    }}
                  />
                ) : null}
                {isPropMode && (
                  <Chip
                    size="small"
                    label="PROP MODE"
                    color="secondary"
                    variant="filled"
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.6875rem',
                      letterSpacing: '0.05em',
                      height: 24,
                    }}
                  />
                )}
              </Box>
            </Box>

            {/* Top Bar Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Dynamic FYERS Broker Sync / Connect Button (Strictly Account-Driven) */}
              {caps.broker.isFyers && (
                isFyersConnected ? (
                  /* Connected: Show live Sync button */
                  <Tooltip title="FYERS Broker Connected. Click to sync today’s tradebook executions." arrow>
                    <Button
                      id="quick-fyers-sync-btn"
                      variant="outlined"
                      size="small"
                      onClick={handleQuickFyersSync}
                      disabled={isSyncingFyers}
                      startIcon={
                        <SyncIcon
                          sx={{
                            fontSize: 16,
                            color: 'success.main',
                            animation: isSyncingFyers ? 'spin 1s linear infinite' : 'none',
                            '@keyframes spin': {
                              '0%': { transform: 'rotate(0deg)' },
                              '100%': { transform: 'rotate(360deg)' },
                            },
                          }}
                        />
                      }
                      sx={{
                        height: 36,
                        borderRadius: 2,
                        borderColor: 'rgba(16, 185, 129, 0.4)',
                        color: isDark ? '#34d399' : '#059669',
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        textTransform: 'none',
                        px: 1.5,
                        display: { xs: 'none', sm: 'inline-flex' },
                        '&:hover': {
                          borderColor: 'rgba(16, 185, 129, 0.7)',
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                        },
                      }}
                    >
                      {isSyncingFyers ? 'Syncing...' : 'Sync FYERS'}
                    </Button>
                  </Tooltip>
                ) : (
                  /* Not Connected: Show dynamic Connect FYERS button */
                  <Tooltip
                    title={
                      isFyersConfigured
                        ? 'FYERS daily session expired. Click for 1-Click Daily Auth.'
                        : 'Connect your FYERS broker to auto-sync trades with exact executions.'
                    }
                    arrow
                  >
                    <Button
                      id="quick-fyers-connect-btn"
                      variant="outlined"
                      size="small"
                      onClick={handleQuickFyersConnect}
                      disabled={isConnectingFyers}
                      startIcon={
                        isConnectingFyers ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <LinkRoundedIcon sx={{ fontSize: 16 }} />
                        )
                      }
                      sx={{
                        height: 36,
                        borderRadius: 2,
                        borderColor: isDark ? 'rgba(245, 158, 11, 0.5)' : 'rgba(245, 158, 11, 0.4)',
                        color: isDark ? '#fbbf24' : '#d97706',
                        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.06)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        textTransform: 'none',
                        px: 1.5,
                        display: { xs: 'none', sm: 'inline-flex' },
                        '&:hover': {
                          borderColor: isDark ? '#fbbf24' : '#d97706',
                          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                        },
                      }}
                    >
                      {isConnectingFyers ? 'Connecting...' : 'Connect FYERS'}
                    </Button>
                  </Tooltip>
                )
              )}

              {/* Command Palette Trigger */}
              <Tooltip title="Quick Commands & Search (Cmd+K)" arrow>
                <Button
                  id="command-palette-trigger-btn"
                  variant="outlined"
                  size="small"
                  onClick={() => setIsCommandPaletteOpen(true)}
                  startIcon={<SearchIcon sx={{ fontSize: 18, color: muiTheme.palette.text.secondary }} />}
                  sx={{
                    height: 36,
                    borderRadius: 2,
                    borderColor: muiTheme.palette.divider,
                    color: muiTheme.palette.text.secondary,
                    textTransform: 'none',
                    px: 1.5,
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                    display: { xs: 'none', sm: 'inline-flex' },
                    alignItems: 'center',
                    gap: 1.5,
                    '&:hover': {
                      borderColor: muiTheme.palette.primary.main,
                      backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                    },
                  }}
                >
                  <span>Search or command...</span>
                  <Chip
                    label="⌘K"
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      fontFamily: `'JetBrains Mono', monospace`,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      color: muiTheme.palette.text.secondary,
                      pointerEvents: 'none',
                    }}
                  />
                </Button>
              </Tooltip>

              {/* Mobile Search Icon Button */}
              {isMobile && (
                <IconButton
                  size="small"
                  onClick={() => setIsCommandPaletteOpen(true)}
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    border: `1px solid ${muiTheme.palette.divider}`,
                    color: muiTheme.palette.text.secondary,
                  }}
                >
                  <SearchIcon sx={{ fontSize: 20 }} />
                </IconButton>
              )}

              {/* Mobile Quick Trade Button (Hidden in Archived Mode) */}
              {isMobile && !caps.isArchived && (
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={() => setIsTradeModalOpen(true)}
                  startIcon={<AddIcon />}
                  sx={{ borderRadius: 2, fontWeight: 700, fontSize: '0.75rem', py: 0.75 }}
                >
                  Trade
                </Button>
              )}

              {/* Theme Toggle Button */}
              <Tooltip
                title={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                arrow
              >
                <IconButton
                  id="theme-toggle-btn"
                  onClick={toggleTheme}
                  size="small"
                  aria-label={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    border: `1px solid ${muiTheme.palette.divider}`,
                    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.8)',
                    color: resolvedTheme === 'dark' ? '#F59E0B' : '#475569',
                    '&:hover': {
                      backgroundColor: muiTheme.palette.action.hover,
                      borderColor: muiTheme.palette.primary.main,
                    },
                  }}
                >
                  {resolvedTheme === 'dark' ? (
                    <LightModeIcon sx={{ fontSize: 19 }} />
                  ) : (
                    <DarkModeIcon sx={{ fontSize: 19 }} />
                  )}
                </IconButton>
              </Tooltip>

              {/* User Session & Sign Out Menu */}
              <Tooltip title="User Profile & Session" arrow>
                <IconButton
                  id="header-user-menu-btn"
                  onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                  size="small"
                  aria-label="User account and session"
                  sx={{
                    p: 0.5,
                    borderRadius: 2,
                    border: `1px solid ${muiTheme.palette.divider}`,
                    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.8)',
                    '&:hover': {
                      borderColor: muiTheme.palette.primary.main,
                    },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 26,
                      height: 26,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(5, 150, 105, 0.15)',
                      color: muiTheme.palette.primary.main,
                    }}
                  >
                    {user?.name?.slice(0, 2).toUpperCase() || 'TR'}
                  </Avatar>
                </IconButton>
              </Tooltip>

              <Menu
                id="header-user-menu"
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={() => setUserMenuAnchor(null)}
                slotProps={{
                  paper: {
                    sx: {
                      minWidth: 220,
                      borderRadius: 2.5,
                      mt: 1,
                      backgroundImage: 'none',
                      p: 1,
                      border: `1px solid ${muiTheme.palette.divider}`,
                    },
                  },
                }}
              >
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {user?.name || 'Trader'}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace', display: 'block' }}
                  >
                    {user?.email || 'trader@setupmint.com'}
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.75 }} />
                <MenuItem
                  component={NavLink}
                  to="/settings"
                  onClick={() => setUserMenuAnchor(null)}
                  sx={{ borderRadius: 1.5 }}
                >
                  <ListItemIcon>
                    <SettingsIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Settings & Profile" />
                </MenuItem>
                <MenuItem
                  id="header-logout-btn"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  sx={{
                    borderRadius: 1.5,
                    color: 'error.main',
                    '&:hover': {
                      backgroundColor: isDark ? 'rgba(244, 63, 94, 0.1)' : 'rgba(220, 38, 38, 0.08)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: 'error.main' }}>
                    {isLoggingOut ? <CircularProgress size={18} color="inherit" /> : <LogoutIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText primary={isLoggingOut ? 'Signing Out...' : 'Sign Out'} />
                </MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Dynamic Page Workspace */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: { xs: 2, sm: 3, md: 4 },
            pb: { xs: '84px', md: 4 },
          }}
        >
          <Outlet context={{ selectedAccountId, scope, isPropMode }} />
        </Box>

        {/* Mobile First Sticky Bottom Navigation */}
        <Box
          component="nav"
          aria-label="Mobile Navigation"
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            height: 'calc(62px + env(safe-area-inset-bottom, 0px))',
            pb: 'env(safe-area-inset-bottom, 0px)',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(16px)',
            borderTop: `1px solid ${muiTheme.palette.divider}`,
            alignItems: 'center',
            justifyContent: 'space-around',
            px: 1,
            boxShadow: isDark
              ? '0 -4px 20px rgba(0, 0, 0, 0.45)'
              : '0 -4px 20px rgba(15, 23, 42, 0.08)',
          }}
        >
          {/* 1. Overview */}
          <Box
            component={NavLink}
            to={{ pathname: '/', search: preservedSearch }}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flex: 1,
              py: 0.5,
              color: location.pathname === '/' ? muiTheme.palette.primary.main : muiTheme.palette.text.secondary,
              transition: 'all 0.15s ease',
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <LayoutDashboardIcon sx={{ fontSize: 22 }} />
            <Typography variant="caption" sx={{ fontSize: '0.6875rem', fontWeight: location.pathname === '/' ? 700 : 500, mt: 0.25 }}>
              Overview
            </Typography>
          </Box>

          {/* 2. Trades */}
          <Box
            component={NavLink}
            to={{ pathname: '/trades', search: preservedSearch }}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flex: 1,
              py: 0.5,
              color: location.pathname.startsWith('/trades') ? muiTheme.palette.primary.main : muiTheme.palette.text.secondary,
              transition: 'all 0.15s ease',
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <TableViewIcon sx={{ fontSize: 22 }} />
            <Typography variant="caption" sx={{ fontSize: '0.6875rem', fontWeight: location.pathname.startsWith('/trades') ? 700 : 500, mt: 0.25 }}>
              Trades
            </Typography>
          </Box>

          {/* 3. Floating Center Action Button (Log New Trade) */}
          {!caps.isArchived && (
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <IconButton
                aria-label="Log New Trade"
                onClick={() => {
                  prefetchTradeFormData();
                  setIsTradeModalOpen(true);
                }}
                sx={{
                  width: 48,
                  height: 48,
                  mt: -3,
                  backgroundColor: muiTheme.palette.primary.main,
                  color: '#FFFFFF',
                  boxShadow: isDark
                    ? '0 6px 18px rgba(16, 185, 129, 0.45)'
                    : '0 6px 18px rgba(5, 150, 105, 0.35)',
                  border: `3px solid ${isDark ? '#0B0F19' : '#FFFFFF'}`,
                  transition: 'transform 0.15s ease, background-color 0.15s ease',
                  '&:hover': {
                    backgroundColor: isDark ? '#059669' : '#047857',
                    transform: 'translateY(-2px)',
                  },
                  '&:active': {
                    transform: 'scale(0.92)',
                  },
                }}
              >
                <AddIcon sx={{ fontSize: 26 }} />
              </IconButton>
            </Box>
          )}

          {/* 4. Journal Calendar */}
          <Box
            component={NavLink}
            to={{ pathname: '/journal', search: preservedSearch }}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flex: 1,
              py: 0.5,
              color: location.pathname.startsWith('/journal') ? muiTheme.palette.primary.main : muiTheme.palette.text.secondary,
              transition: 'all 0.15s ease',
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <CalendarMonthIcon sx={{ fontSize: 22 }} />
            <Typography variant="caption" sx={{ fontSize: '0.6875rem', fontWeight: location.pathname.startsWith('/journal') ? 700 : 500, mt: 0.25 }}>
              Journal
            </Typography>
          </Box>

          {/* 5. More (Opens Full Drawer) */}
          <Box
            onClick={() => setMobileOpen(true)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flex: 1,
              py: 0.5,
              color: [
                '/review/weekly',
                '/analytics',
                '/strategies',
                '/risk-calculator',
                '/accounts',
                '/instruments',
                '/reports',
                '/settings',
              ].some((p) => location.pathname.startsWith(p))
                ? muiTheme.palette.primary.main
                : muiTheme.palette.text.secondary,
              transition: 'all 0.15s ease',
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <MenuIcon sx={{ fontSize: 22 }} />
            <Typography variant="caption" sx={{ fontSize: '0.6875rem', fontWeight: 500, mt: 0.25 }}>
              Menu
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Manual Trade Entry Modal */}
      <TradeFormModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        defaultAccountId={selectedAccountId !== 'ALL' ? selectedAccountId : undefined}
      />

      {/* Cmd+K Global Command Palette */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenNewTrade={() => setIsTradeModalOpen(true)}
      />

      {/* Universal Trade Drilldown Drawer */}
      <TradeDrillDrawer />
    </Box>
  );
}
