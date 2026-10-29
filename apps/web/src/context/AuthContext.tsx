import React, { createContext, useContext, useEffect, useState } from 'react';
import { IRiskSettings, IPatternDetectionSettings, ILiveWatcherSettings } from '@tradevault/shared';
import { api, ApiError } from '../lib/api.js';

export interface User {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
  theme?: string;
  riskSettings?: IRiskSettings;
  patternDetectionSettings?: IPatternDetectionSettings;
  liveWatcherSettings?: ILiveWatcherSettings;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOffline: boolean;
  login: (credentials: any) => Promise<void>;
  register: (details: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  async function refreshUser() {
    try {
      const data = await api.auth.me();
      setUser(data.user);
      setIsOffline(false);
    } catch (err: any) {
      if (err instanceof ApiError) {
        // Clear authenticated user state ONLY on explicit 401 UNAUTHORIZED or SESSION_EXPIRED
        if (err.status === 401 || err.code === 'UNAUTHORIZED' || err.code === 'SESSION_EXPIRED') {
          setUser(null);
          return;
        }

        // Network error, server boot delay, or client offline: keep user state and flag offline
        if (err.code === 'NETWORK_ERROR' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          setIsOffline(true);
          return;
        }
      }

      // For 5xx, timeouts, or 429 rate limits: maintain cached session without kicking user to /login
      console.warn('Session verification encountered a temporary non-auth error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();

    // Re-validate session with auth.me() on window focus (once per 5 minutes)
    // This allows active tab returns to refresh sliding sessions and reflect cookie renewal
    let lastChecked = Date.now();
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastChecked >= 5 * 60 * 1000) {
        lastChecked = now;
        refreshUser();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  async function login(credentials: any) {
    const data = await api.auth.login(credentials);
    setUser(data.user);
    setIsOffline(false);
  }

  async function register(details: any) {
    const data = await api.auth.register(details);
    setUser(data.user);
    setIsOffline(false);
  }

  async function logout() {
    try {
      await api.auth.logout();
    } catch (err) {
      console.warn('Backend logout request error, clearing local authenticated state:', err);
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, isOffline, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
