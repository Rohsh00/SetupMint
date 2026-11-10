import { useCallback, useMemo } from 'react';
import { useAccount } from '../context/AccountContext.js';
import { formatMoney } from '@tradevault/financial-engine';

export function useMoney() {
  const { currency: activeCurrency, isMultiCurrency, currencies } = useAccount();

  const format = useCallback(
    (
      amount: number | string | undefined | null,
      currencyOverride?: string,
      precision = 2
    ): string => {
      if (amount === undefined || amount === null || isNaN(Number(amount))) {
        return '—';
      }
      const num = Number(amount);
      const curr = currencyOverride || (activeCurrency === 'MULTI' ? 'USD' : activeCurrency) || 'USD';
      return formatMoney(num, curr, { precision });
    },
    [activeCurrency]
  );

  const formatWithSign = useCallback(
    (
      amount: number | string | undefined | null,
      currencyOverride?: string,
      precision = 2
    ): string => {
      if (amount === undefined || amount === null || isNaN(Number(amount))) {
        return '—';
      }
      const num = Number(amount);
      const sign = num > 0 ? '+' : '';
      return `${sign}${format(amount, currencyOverride, precision)}`;
    },
    [format]
  );

  return useMemo(
    () => ({
      format,
      formatWithSign,
      currency: activeCurrency,
      isMultiCurrency,
      currencies,
    }),
    [format, formatWithSign, activeCurrency, isMultiCurrency, currencies]
  );
}
