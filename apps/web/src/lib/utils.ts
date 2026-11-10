import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { formatMoney } from '@tradevault/financial-engine';

export function formatCurrency(
  amount: number | string | undefined | null,
  currency = 'USD',
  precision = 2
): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '—';
  }
  const curr = currency === 'MULTI' ? 'USD' : currency;
  return formatMoney(amount, curr, { precision });
}

export function getCurrencySymbol(currency = 'USD'): string {
  try {
    const curr = currency === 'MULTI' ? 'USD' : currency;
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency')?.value;
    return sym || curr;
  } catch {
    return currency;
  }
}

/**
 * Format price or numeric value to at most `maxDecimals` decimal places without floating-point noise
 * (e.g. 128.53333333333333 -> "128.53", 135 -> "135", 3908.7 -> "3908.7")
 */
export function formatPrice(
  val: number | string | undefined | null,
  maxDecimals = 2
): string {
  if (val === undefined || val === null || val === '' || isNaN(Number(val))) {
    return '—';
  }
  const num = Number(val);
  return String(Number(num.toFixed(maxDecimals)));
}

/**
 * Format date string (e.g. "2026-10-16" -> "16 Oct 2026")
 */
export function formatDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);

  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format date and time (e.g. "16 Oct 2026, 09:30")
 */
export function formatDateTime(dateStr: string | Date | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);

  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format R-multiple (e.g. 2.45 -> "+2.5R", -1 -> "-1.0R")
 */
export function formatR(r: number | undefined | null): string {
  if (r === undefined || r === null) return '—';
  const num = Number(r);
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}R`;
}

/**
 * Format percentage (e.g. 64.5 -> "64.5%")
 */
export function formatPercent(val: number | undefined | null): string {
  if (val === undefined || val === null) return '0.0%';
  return `${Number(val).toFixed(1)}%`;
}

/**
 * Converts a Date, ISO string, or timestamp into local HTML5 datetime-local string (YYYY-MM-DDTHH:mm).
 * Preserves the user's local timezone (e.g. IST) without UTC shifting or losing AM/PM.
 */
export function toLocalIsoDateTime(input?: string | Date | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) {
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input)) {
      return input.slice(0, 16);
    }
    return '';
  }
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Returns current local time in YYYY-MM-DDTHH:mm format for datetime-local inputs.
 */
export function currentLocalIsoDateTime(): string {
  return toLocalIsoDateTime(new Date());
}

/**
 * Converts an HTML5 datetime-local input string (YYYY-MM-DDTHH:mm) or any date string
 * into a standard ISO 8601 UTC string for backend storage.
 */
export function fromLocalIsoDateTime(input?: string | Date | null): string | undefined {
  if (!input) return undefined;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? undefined : input.toISOString();
  }
  const trimmed = String(input).trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return undefined;
}
