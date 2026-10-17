import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  TableProperties,
  Calendar,
  LineChart,
  BookOpen,
  Calculator,
  Wallet,
  Coins,
  FileSpreadsheet,
  Settings,
  Plus,
  Moon,
  Sun,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { api } from '../../lib/api.js';
import { TradeFormModal } from '../trades/TradeFormModal.js';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');

  // Fetch user accounts for global account switcher
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
  });

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/trades', label: 'Trades', icon: TableProperties },
    { to: '/journal', label: 'Journal Calendar', icon: Calendar },
    { to: '/analytics', label: 'Analytics', icon: LineChart },
    { to: '/strategies', label: 'Strategy Playbook', icon: BookOpen },
    { to: '/risk-calculator', label: 'Risk Calculator', icon: Calculator },
    { to: '/accounts', label: 'Accounts', icon: Wallet },
    { to: '/instruments', label: 'Instruments', icon: Coins },
    { to: '/reports', label: 'Reports & Exports', icon: FileSpreadsheet },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card/60 backdrop-blur-md transition-all duration-200 select-none ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-sm">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                  TradeVault
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                    PRO
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">Discretionary Journal</span>
              </div>
            </div>
          )}

          {sidebarCollapsed && (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <Shield className="h-5 w-5" />
            </div>
          )}

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Quick action button */}
        <div className="p-3">
          <button
            onClick={() => setIsTradeModalOpen(true)}
            className={`w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-950/20 transition-all ${
              sidebarCollapsed ? 'h-10 px-0' : 'h-10 px-4'
            }`}
            title="Log New Trade"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            {!sidebarCollapsed && <span className="text-sm">Log New Trade</span>}
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 space-y-1 px-2 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-emerald-400' : 'text-muted-foreground group-hover:text-foreground'}`} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold text-xs border border-border">
                  {user?.name?.slice(0, 2).toUpperCase() || 'TR'}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-xs font-semibold truncate text-foreground">{user?.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate font-mono">{user?.email}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => logout()}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/40 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-accent"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Global Account Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Account:</span>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Accounts (Consolidated)</option>
                {accounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.broker} - {acc.baseCurrency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Add Trade in top bar for tablet/mobile */}
            <button
              onClick={() => setIsTradeModalOpen(true)}
              className="md:hidden flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Trade</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet context={{ selectedAccountId }} />
        </main>
      </div>

      {/* Manual Trade Entry Modal */}
      <TradeFormModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        defaultAccountId={selectedAccountId !== 'ALL' ? selectedAccountId : undefined}
      />
    </div>
  );
}
