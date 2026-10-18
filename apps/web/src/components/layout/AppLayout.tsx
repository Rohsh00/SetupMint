import React, { useState } from 'react';
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
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
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
import LightModeIcon from '@mui/icons-material/LightModeRounded';
import DarkModeIcon from '@mui/icons-material/DarkModeRounded';
import MenuIcon from '@mui/icons-material/MenuRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import LogoutIcon from '@mui/icons-material/LogoutRounded';

import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { api } from '../../lib/api.js';
import { TradeFormModal } from '../trades/TradeFormModal.js';
import { StratumLogo } from '../brand/StratumLogo.js';

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
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
      setUserMenuAnchor(null);
    }
  };

  // Fetch user accounts for global account switcher
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
  });

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboardIcon },
    { to: '/trades', label: 'Trades', icon: TableViewIcon },
    { to: '/journal', label: 'Journal Calendar', icon: CalendarMonthIcon },
    { to: '/analytics', label: 'Analytics', icon: ShowChartIcon },
    { to: '/strategies', label: 'Strategy Playbook', icon: MenuBookIcon },
    { to: '/risk-calculator', label: 'Risk Calculator', icon: CalculateIcon },
    { to: '/accounts', label: 'Accounts', icon: AccountBalanceWalletIcon },
    { to: '/instruments', label: 'Instruments', icon: CurrencyExchangeIcon },
    { to: '/reports', label: 'Reports & Exports', icon: AssessmentIcon },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const currentDrawerWidth = sidebarCollapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH;

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
        <StratumLogo
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

      {/* Log Trade CTA */}
      <Box sx={{ p: sidebarCollapsed ? 1 : 2 }}>
        <Button
          fullWidth
          variant="contained"
          color="primary"
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
                to={item.to}
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
                {user?.email || 'trader@stratum'}
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
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    sx={{
                      height: 36,
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      backgroundColor: isDark ? 'rgba(17, 24, 39, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      borderRadius: 2,
                    }}
                  >
                    <MenuItem value="ALL">
                      <em>All Accounts (Consolidated)</em>
                    </MenuItem>
                    {accounts.map((acc: any) => (
                      <MenuItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.broker} • {acc.baseCurrency})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Top Bar Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Mobile Quick Trade Button */}
              {isMobile && (
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
                    {user?.email || 'trader@stratum'}
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
          }}
        >
          <Outlet context={{ selectedAccountId }} />
        </Box>
      </Box>

      {/* Manual Trade Entry Modal */}
      <TradeFormModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        defaultAccountId={selectedAccountId !== 'ALL' ? selectedAccountId : undefined}
      />
    </Box>
  );
}
