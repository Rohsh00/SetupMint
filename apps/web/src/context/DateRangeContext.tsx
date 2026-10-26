import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DateRangePreset,
  DATE_RANGE_PRESETS,
  resolvePreset,
  isValidCalendarDate,
} from '@tradevault/shared';
import { formatDate } from '../lib/utils.js';

export interface DateRangeState {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  formattedRange: string;
  setPreset: (preset: DateRangePreset) => void;
  setCustomRange: (startDate?: string, endDate?: string) => void;
  resetRange: () => void;
}

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  '7D': '7 Days',
  '30D': '30 Days',
  '90D': '90 Days',
  THIS_WEEK: 'This Week',
  LAST_WEEK: 'Last Week',
  THIS_MONTH: 'This Month',
  LAST_MONTH: 'Last Month',
  THIS_QUARTER: 'This Quarter',
  YTD: 'Year to Date',
  THIS_FY: 'This FY (Apr–Mar)',
  LAST_FY: 'Last FY',
  ALL_TIME: 'All Time',
  CUSTOM: 'Custom Range',
};

const DateRangeContext = createContext<DateRangeState | undefined>(undefined);

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const rangeParam = searchParams.get('range') as DateRangePreset | null;
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const { preset, startDate, endDate } = useMemo(() => {
    // 1. If 'range' is explicitly provided in URL
    if (rangeParam && DATE_RANGE_PRESETS.some((p) => p.id === rangeParam)) {
      if (rangeParam === 'CUSTOM') {
        const validStart = fromParam && isValidCalendarDate(fromParam) ? fromParam : undefined;
        const validEnd = toParam && isValidCalendarDate(toParam) ? toParam : undefined;
        return {
          preset: 'CUSTOM' as DateRangePreset,
          startDate: validStart,
          endDate: validEnd,
        };
      } else if (rangeParam === 'ALL_TIME') {
        return {
          preset: 'ALL_TIME' as DateRangePreset,
          startDate: undefined,
          endDate: undefined,
        };
      } else {
        const resolved = resolvePreset(rangeParam);
        return {
          preset: rangeParam,
          startDate: fromParam || resolved.startDate,
          endDate: toParam || resolved.endDate,
        };
      }
    }

    // 2. If 'from' or 'to' is present without 'range'
    if (fromParam || toParam) {
      const validStart = fromParam && isValidCalendarDate(fromParam) ? fromParam : undefined;
      const validEnd = toParam && isValidCalendarDate(toParam) ? toParam : undefined;
      return {
        preset: 'CUSTOM' as DateRangePreset,
        startDate: validStart,
        endDate: validEnd,
      };
    }

    // 3. Default to ALL_TIME
    return {
      preset: 'ALL_TIME' as DateRangePreset,
      startDate: undefined,
      endDate: undefined,
    };
  }, [rangeParam, fromParam, toParam]);

  const setPreset = useCallback(
    (nextPreset: DateRangePreset) => {
      try {
        localStorage.setItem('setupmint_last_date_preset', nextPreset);
      } catch {}

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextPreset === 'ALL_TIME') {
            next.delete('range');
            next.delete('from');
            next.delete('to');
          } else if (nextPreset === 'CUSTOM') {
            next.set('range', 'CUSTOM');
          } else {
            const resolved = resolvePreset(nextPreset);
            next.set('range', nextPreset);
            if (resolved.startDate) {
              next.set('from', resolved.startDate);
            } else {
              next.delete('from');
            }
            if (resolved.endDate) {
              next.set('to', resolved.endDate);
            } else {
              next.delete('to');
            }
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setCustomRange = useCallback(
    (start?: string, end?: string) => {
      try {
        localStorage.setItem('setupmint_last_date_preset', 'CUSTOM');
      } catch {}

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('range', 'CUSTOM');
          if (start) {
            next.set('from', start);
          } else {
            next.delete('from');
          }
          if (end) {
            next.set('to', end);
          } else {
            next.delete('to');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const resetRange = useCallback(() => {
    try {
      localStorage.removeItem('setupmint_last_date_preset');
    } catch {}

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('range');
        next.delete('from');
        next.delete('to');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const formattedRange = useMemo(() => {
    if (preset === 'ALL_TIME') return 'All Time';
    if (startDate && endDate) {
      if (startDate === endDate) return formatDate(startDate);
      return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    }
    if (startDate) return `From ${formatDate(startDate)}`;
    if (endDate) return `Until ${formatDate(endDate)}`;
    return PRESET_LABELS[preset] || 'All Time';
  }, [preset, startDate, endDate]);

  const value = useMemo(
    () => ({
      preset,
      startDate,
      endDate,
      formattedRange,
      setPreset,
      setCustomRange,
      resetRange,
    }),
    [preset, startDate, endDate, formattedRange, setPreset, setCustomRange, resetRange]
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange(): DateRangeState {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error('useDateRange must be used within a DateRangeProvider');
  }
  return context;
}
