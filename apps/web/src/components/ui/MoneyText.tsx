import React from 'react';
import { useMoney } from '../../hooks/useMoney.js';
import { cn } from '../../lib/utils.js';

export interface MoneyTextProps {
  amount: number | string | undefined | null;
  currency?: string;
  colorize?: boolean;
  showSign?: boolean;
  precision?: number;
  className?: string;
}

export const MoneyText: React.FC<MoneyTextProps> = ({
  amount,
  currency,
  colorize = false,
  showSign = false,
  precision = 2,
  className,
}) => {
  const { format, formatWithSign } = useMoney();

  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }

  const num = Number(amount);
  const text = showSign ? formatWithSign(num, currency, precision) : format(num, currency, precision);

  let colorClass = '';
  if (colorize) {
    if (num > 0) {
      colorClass = 'text-emerald-500 font-medium';
    } else if (num < 0) {
      colorClass = 'text-rose-500 font-medium';
    } else {
      colorClass = 'text-muted-foreground';
    }
  }

  return <span className={cn(colorClass, className)}>{text}</span>;
};

