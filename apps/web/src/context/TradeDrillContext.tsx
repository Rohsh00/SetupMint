import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { DrillDescriptor } from '@tradevault/shared';
import { api } from '../lib/api.js';
import { useAccountScope } from './AccountScopeContext.js';

interface TradeDrillContextValue {
  isOpen: boolean;
  descriptor: DrillDescriptor | null;
  activeTradeId: string | null;
  openDrill: (descriptor: DrillDescriptor, targetTradeId?: string) => void;
  closeDrill: () => void;
  setActiveTradeId: (id: string | null) => void;
  prefetchDrill: (descriptor: DrillDescriptor) => void;
}

const TradeDrillContext = createContext<TradeDrillContextValue | undefined>(undefined);

export function TradeDrillProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { queryParams } = useAccountScope();

  const [isOpen, setIsOpen] = useState(false);
  const [descriptor, setDescriptor] = useState<DrillDescriptor | null>(null);
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);

  const prefetchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stampScopeOnDescriptor = useCallback(
    (desc: DrillDescriptor): DrillDescriptor => {
      if (desc.kind !== 'FILTER') return desc;
      const existingFilter = (desc.filter || {}) as Record<string, any>;
      const hasExplicitScope =
        existingFilter.scope !== undefined ||
        existingFilter.mode !== undefined ||
        existingFilter.accountId !== undefined;
      if (hasExplicitScope) return desc;
      return {
        ...desc,
        filter: {
          ...queryParams,
          ...existingFilter,
        },
      };
    },
    [queryParams]
  );

  // Sync state with URL '?drill=...'
  useEffect(() => {
    const drillParam = searchParams.get('drill');
    if (drillParam) {
      try {
        let raw = drillParam;
        if (raw.startsWith('%')) {
          try {
            raw = decodeURIComponent(raw);
          } catch {}
        }
        const decoded = JSON.parse(raw);
        if (decoded && decoded.kind) {
          setDescriptor(decoded);
          if (decoded.targetTradeId) {
            setActiveTradeId(decoded.targetTradeId);
          } else if (decoded.kind === 'TRADE') {
            setActiveTradeId(decoded.tradeId);
          } else {
            setActiveTradeId(null);
          }
          setIsOpen(true);
        }
      } catch (err) {
        console.warn('Failed to parse drill URL parameter:', err);
      }
    } else {
      setIsOpen(false);
      setDescriptor(null);
      setActiveTradeId(null);
    }
  }, [searchParams]);

  const openDrill = useCallback(
    (rawDesc: DrillDescriptor, targetTradeId?: string) => {
      const desc = stampScopeOnDescriptor(rawDesc);
      setDescriptor(desc);
      const initialActiveId = targetTradeId || (desc.kind === 'TRADE' ? desc.tradeId : null);
      setActiveTradeId(initialActiveId);
      setIsOpen(true);

      // Deep linkable URL query
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const payload = { ...desc, targetTradeId: initialActiveId };
          next.set('drill', JSON.stringify(payload));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, stampScopeOnDescriptor]
  );

  const closeDrill = useCallback(() => {
    setIsOpen(false);
    setDescriptor(null);
    setActiveTradeId(null);

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('drill');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const prefetchDrill = useCallback(
    (rawDesc: DrillDescriptor) => {
      const desc = stampScopeOnDescriptor(rawDesc);
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }
      prefetchTimerRef.current = setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: ['drilldown', desc],
          queryFn: () => api.trades.drilldown({ descriptor: desc }),
          staleTime: 60 * 1000,
        });
      }, 150);
    },
    [queryClient, stampScopeOnDescriptor]
  );

  return (
    <TradeDrillContext.Provider
      value={{
        isOpen,
        descriptor,
        activeTradeId,
        openDrill,
        closeDrill,
        setActiveTradeId,
        prefetchDrill,
      }}
    >
      {children}
    </TradeDrillContext.Provider>
  );
}

export function useTradeDrilldown() {
  const ctx = useContext(TradeDrillContext);
  if (!ctx) {
    throw new Error('useTradeDrilldown must be used within a TradeDrillProvider');
  }
  return ctx;
}
