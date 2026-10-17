import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Shield,
  Layers,
  Database,
  CheckCircle2,
  Moon,
  Sun,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { api } from '../lib/api.js';

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { theme, toggleTheme, setTheme } = useTheme();

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency || 'INR');
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // FYERS Integration state
  const [fyersAppId, setFyersAppId] = useState('');
  const [fyersSuccess, setFyersSuccess] = useState(false);

  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.settings.systemStatus(),
  });

  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
  });

  React.useEffect(() => {
    if (fyersStatus?.appId) {
      setFyersAppId(fyersStatus.appId);
    }
  }, [fyersStatus]);

  const profileMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile(payload),
    onSuccess: () => {
      refreshUser();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: any) => api.settings.changePassword(payload),
    onSuccess: () => {
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordMsg(null), 3000);
    },
    onError: (err: any) => {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to update password' });
    },
  });

  const fyersMutation = useMutation({
    mutationFn: (appId: string) => api.integrations.fyersConfig({ appId }),
    onSuccess: () => {
      setFyersSuccess(true);
      setTimeout(() => setFyersSuccess(false), 3000);
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate({ name, baseCurrency });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Settings & Local Security
        </h1>
        <p className="text-xs text-muted-foreground">
          Trader profile preferences, appearance theme, security credentials, and future broker integration layer
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <User className="h-4 w-4 text-emerald-400" /> Trader Profile & Preferences
          </h3>

          <form onSubmit={handleProfileSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Email Address (Read-only)</label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full h-9 rounded-lg border border-border bg-accent/40 px-3 text-sm font-mono text-muted-foreground cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Default Base Currency</label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
              >
                <option value="INR">Indian Rupee (INR ₹)</option>
                <option value="USD">US Dollar (USD $)</option>
                <option value="EUR">Euro (EUR €)</option>
                <option value="GBP">British Pound (GBP £)</option>
                <option value="AED">UAE Dirham (AED)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-muted-foreground">Theme Mode</span>
              <div className="flex items-center rounded-lg border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold ${
                    theme === 'dark' ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold ${
                    theme === 'light' ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </button>
              </div>
            </div>

            {profileSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Profile updated successfully
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
              >
                Save Preferences
              </button>
            </div>
          </form>
        </div>

        {/* Password Security Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Lock className="h-4 w-4 text-emerald-400" /> Security & Passwords
          </h3>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-muted-foreground mb-1 font-medium">New Password (Min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {passwordMsg && (
              <div
                className={`text-xs ${
                  passwordMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {passwordMsg.text}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/80 border border-border"
              >
                Change Password
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* System Status & Local Privacy Panel */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border pb-3">
          <Database className="h-4 w-4 text-emerald-400" /> Local Storage & Zero-Telemetry Privacy
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <span className="text-[10px] text-muted-foreground font-sans block">Database Engine</span>
            <span className="font-bold text-foreground">MongoDB Community (Local)</span>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <span className="text-[10px] text-muted-foreground font-sans block">Private Data Privacy</span>
            <span className="font-bold text-emerald-400">100% Local / MacBook Only</span>
          </div>
          <div className="rounded-lg border border-border bg-accent/20 p-3">
            <span className="text-[10px] text-muted-foreground font-sans block">Total Stored Records</span>
            <span className="font-bold text-foreground">
              {systemStatus?.tradeCount || 0} Trades • {systemStatus?.attachmentCount || 0} Screenshots
            </span>
          </div>
        </div>
      </div>

      {/* Future FYERS Integration Architecture Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-400" /> Future FYERS Broker Integration
            </h3>
            <p className="text-xs text-muted-foreground">
              Clean broker adapter abstraction ready for automated execution synchronization
            </p>
          </div>
          <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            Status: {fyersStatus?.status || 'DISABLED'}
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground leading-relaxed">
            TradeVault is architected with a decoupled <strong>BrokerAdapter</strong> interface and <strong>NormalizedExecution</strong> schema. In future releases, FYERS API orders and fills will synchronize without altering your manual trade journal core.
          </p>

          <div className="rounded-lg border border-border bg-accent/10 p-3 font-mono text-[11px] space-y-1">
            <div>Adapter Version: <strong>v3-compatible (REST / WebSocket)</strong></div>
            <div>Normalized Execution Schema: <strong>INormalizedExecution</strong></div>
            <div>Duplicate Reconciliation Engine: <strong>IdempotencyKey & Manual Review Ready</strong></div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="text"
              value={fyersAppId}
              onChange={(e) => setFyersAppId(e.target.value)}
              placeholder="FYERS App ID (e.g. XC12345-100)"
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-xs font-mono"
            />
            <button
              onClick={() => fyersMutation.mutate(fyersAppId)}
              disabled={fyersMutation.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
            >
              Save Configuration
            </button>
          </div>
          {fyersSuccess && (
            <span className="text-xs text-emerald-400 block">Configuration saved in integration layer</span>
          )}
        </div>
      </div>
    </div>
  );
}
