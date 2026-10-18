import React, { createContext, useContext, useEffect, useState } from 'react';
import { IRiskSettings } from '@tradevault/shared';
import { api } from '../lib/api.js';

export interface User {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
  theme?: string;
  riskSettings?: IRiskSettings;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: any) => Promise<void>;
  register: (details: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      const data = await api.auth.me();
      setUser(data.user);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  async function login(credentials: any) {
    const data = await api.auth.login(credentials);
    setUser(data.user);
  }

  async function register(details: any) {
    const data = await api.auth.register(details);
    setUser(data.user);
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
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
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
