import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { DrillDescriptor } from '@tradevault/shared';
import { api } from '../lib/api.js';

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

  const [isOpen, setIsOpen] = useState(false);
  const [descriptor, setDescriptor] = useState<DrillDescriptor | null>(null);
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);

  const prefetchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state with URL '?drill=...'
  useEffect(() => {
    const drillParam = searchParams.get('drill');
    if (drillParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(drillParam));
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
    (desc: DrillDescriptor, targetTradeId?: string) => {
      setDescriptor(desc);
      const initialActiveId = targetTradeId || (desc.kind === 'TRADE' ? desc.tradeId : null);
      setActiveTradeId(initialActiveId);
      setIsOpen(true);

      // Deep linkable URL query
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const payload = { ...desc, targetTradeId: initialActiveId };
          next.set('drill', encodeURIComponent(JSON.stringify(payload)));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
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
    (desc: DrillDescriptor) => {
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
    [queryClient]
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
