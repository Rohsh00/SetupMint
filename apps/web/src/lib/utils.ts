import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency amount with symbol and appropriate regional notation
 */
export function formatCurrency(
  amount: number | string | undefined | null,
  currency = 'INR',
  precision = 2
): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '—';
  }

  const num = Number(amount);
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  let formattedNum = '';
  if (currency.toUpperCase() === 'INR') {
    formattedNum = absNum.toLocaleString('en-IN', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    return `${isNegative ? '-' : ''}₹${formattedNum}`;
  } else if (currency.toUpperCase() === 'USD' || currency.toUpperCase() === 'USDT') {
    formattedNum = absNum.toLocaleString('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    return `${isNegative ? '-' : ''}$${formattedNum}`;
  } else if (currency.toUpperCase() === 'EUR') {
    formattedNum = absNum.toLocaleString('de-DE', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    return `${isNegative ? '-' : ''}€${formattedNum}`;
  }

  return `${isNegative ? '-' : ''}${currency} ${absNum.toFixed(precision)}`;
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
