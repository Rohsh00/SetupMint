import React, { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AccountScope, AccountScopeMode } from '@tradevault/shared';
import { api } from '../lib/api.js';

const SCOPE_STORAGE_KEY = 'setupmint_account_scope';

function readStoredScopeValue(): string {
  try {
    return sessionStorage.getItem(SCOPE_STORAGE_KEY) || 'ALL';
  } catch {
    return 'ALL';
  }
}

function writeStoredScopeValue(val: string): void {
  try {
    sessionStorage.setItem(SCOPE_STORAGE_KEY, val);
  } catch {
    // ignore storage errors
  }
}

export interface AccountScopeContextValue {
  scope: AccountScope;
  scopeLabel: string;
  isPropMode: boolean;
  selectedScopeValue: string;
  setScopeValue: (val: string) => void;
  setScope: (scope: Partial<AccountScope>) => void;
  queryParams: Record<string, string>;
  selectedAccountId?: string;
  accounts: any[];
  propAccounts: any[];
  personalAccounts: any[];
  demoAccounts: any[];
  propFirms: string[];
}

const AccountScopeContext = createContext<AccountScopeContextValue | undefined>(undefined);

export function AccountScopeProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Fetch accounts to resolve names, types, and prop firm keys
  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
    staleTime: 5 * 60 * 1000,
  });

  const propAccounts = useMemo(() => {
    return accounts.filter(
      (a: any) =>
        a.accountType === 'PROP_FIRM' ||
        Boolean(a.propFirm?.firmKey) ||
        Boolean(a.propFirmConfig?.enabled)
    );
  }, [accounts]);

  const personalAccounts = useMemo(() => {
    return accounts.filter(
      (a: any) =>
        a.accountType !== 'PROP_FIRM' &&
        a.accountType !== 'DEMO' &&
        a.accountType !== 'SIMULATED' &&
        !a.propFirm?.firmKey &&
        !a.propFirmConfig?.enabled
    );
  }, [accounts]);

  const demoAccounts = useMemo(() => {
    return accounts.filter((a: any) => a.accountType === 'DEMO' || a.accountType === 'SIMULATED');
  }, [accounts]);

  const propFirms = useMemo(() => {
    const firms = new Set<string>();
    for (const a of propAccounts) {
      const firmKey = a.propFirm?.firmKey || a.propFirmConfig?.firm;
      if (firmKey) {
        firms.add(firmKey.toLowerCase());
      }
    }
    return Array.from(firms);
  }, [propAccounts]);

  // Read URL params
  const rawScope = searchParams.get('scope');
  const firmParam = searchParams.get('firm') || searchParams.get('firmKey');
  const typeParam = searchParams.get('type') || searchParams.get('accountType');
  const accountParam = searchParams.get('account') || searchParams.get('accountId');
  const hasExplicitUrlScope = Boolean(rawScope || firmParam || typeParam || accountParam);

  const { scope, scopeLabel, selectedScopeValue, isPropMode, selectedAccountId } = useMemo(() => {
    let mode: AccountScopeMode = 'ALL';
    let firmKey: string | undefined = undefined;
    let accountType: string | undefined = undefined;
    let accountId: string | undefined = undefined;

    if (hasExplicitUrlScope) {
      if (rawScope === 'PROP_FIRM' || rawScope === 'prop_firm' || (!rawScope && firmParam)) {
        mode = 'PROP_FIRM';
        if (firmParam && firmParam !== 'ALL') {
          firmKey = firmParam.toLowerCase();
        }
        if (accountParam && accountParam !== 'ALL') {
          accountId = accountParam;
        }
      } else if (rawScope === 'TYPE' || rawScope === 'type' || (!rawScope && typeParam)) {
        mode = 'TYPE';
        accountType = typeParam || 'LIVE';
      } else if (rawScope === 'ACCOUNT' || rawScope === 'account' || (accountParam && !rawScope)) {
        if (accountParam && accountParam !== 'ALL') {
          mode = 'ACCOUNT';
          accountId = accountParam;
        } else {
          mode = 'ALL';
        }
      } else {
        mode = 'ALL';
      }
    } else {
      // Fall back to sessionStorage when navigating between pages that stripped query params
      const stored = readStoredScopeValue();
      if (stored === 'PROP_FIRM:ALL') {
        mode = 'PROP_FIRM';
      } else if (stored.startsWith('PROP_FIRM:')) {
        mode = 'PROP_FIRM';
        firmKey = stored.slice('PROP_FIRM:'.length).toLowerCase();
      } else if (stored.startsWith('TYPE:')) {
        mode = 'TYPE';
        accountType = stored.slice('TYPE:'.length) || 'LIVE';
      } else if (stored.startsWith('ACCOUNT:')) {
        mode = 'ACCOUNT';
        accountId = stored.slice('ACCOUNT:'.length);
      } else {
        mode = 'ALL';
      }
    }

    // Guard against stale accountId from another user session once accounts have loaded
    if (accountId && accounts.length > 0) {
      const exists = accounts.some((a: any) => a.id === accountId || a._id === accountId);
      if (!exists) {
        accountId = undefined;
        if (mode === 'ACCOUNT') {
          mode = 'ALL';
        }
      }
    }

    const currentScope: AccountScope = {
      mode,
      firmKey,
      accountType: accountType as any,
      accountId,
    };

    // Determine if we are in Prop Mode
    const selectedAcc = accountId ? accounts.find((a: any) => a.id === accountId || a._id === accountId) : null;
    const selectedIsProp = Boolean(
      selectedAcc &&
        (selectedAcc.accountType === 'PROP_FIRM' ||
          selectedAcc.propFirm?.firmKey ||
          selectedAcc.propFirmConfig?.enabled)
    );

    const propModeActive = mode === 'PROP_FIRM' || selectedIsProp;

    // Determine the select dropdown value and human-readable label
    let scopeVal = 'ALL';
    let label = 'All Accounts';
    if (mode === 'PROP_FIRM') {
      if (accountId) {
        scopeVal = `ACCOUNT:${accountId}`;
        label = selectedAcc?.name || 'Prop Account';
      } else if (firmKey) {
        scopeVal = `PROP_FIRM:${firmKey}`;
        label = `Prop Firm (${firmKey.toUpperCase()})`;
      } else {
        scopeVal = 'PROP_FIRM:ALL';
        label = 'All Prop Firms';
      }
    } else if (mode === 'TYPE') {
      scopeVal = `TYPE:${accountType || 'LIVE'}`;
      label = accountType === 'DEMO' ? 'Demo Accounts' : 'Personal / Live Accounts';
    } else if (mode === 'ACCOUNT' && accountId) {
      scopeVal = `ACCOUNT:${accountId}`;
      label = selectedAcc?.name || 'Account';
    }

    return {
      scope: currentScope,
      scopeLabel: label,
      selectedScopeValue: scopeVal,
      isPropMode: propModeActive,
      selectedAccountId: accountId,
    };
  }, [hasExplicitUrlScope, rawScope, firmParam, typeParam, accountParam, accounts]);

  // Keep sessionStorage and URL query params synchronized across route changes
  useEffect(() => {
    writeStoredScopeValue(selectedScopeValue);

    if (!hasExplicitUrlScope && selectedScopeValue !== 'ALL') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (selectedScopeValue === 'PROP_FIRM:ALL') {
            next.set('scope', 'PROP_FIRM');
          } else if (selectedScopeValue.startsWith('PROP_FIRM:')) {
            next.set('scope', 'PROP_FIRM');
            next.set('firm', selectedScopeValue.slice('PROP_FIRM:'.length));
          } else if (selectedScopeValue.startsWith('TYPE:')) {
            next.set('scope', 'TYPE');
            next.set('type', selectedScopeValue.slice('TYPE:'.length));
          } else if (selectedScopeValue.startsWith('ACCOUNT:')) {
            next.set('scope', 'ACCOUNT');
            next.set('account', selectedScopeValue.slice('ACCOUNT:'.length));
          }
          return next;
        },
        { replace: true }
      );
    }
  }, [selectedScopeValue, hasExplicitUrlScope, location.pathname, setSearchParams]);

  const setScopeValue = useCallback(
    (val: string) => {
      writeStoredScopeValue(val);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (val === 'ALL') {
            next.delete('scope');
            next.delete('firm');
            next.delete('firmKey');
            next.delete('type');
            next.delete('account');
            next.delete('accountId');
          } else if (val === 'PROP_FIRM:ALL') {
            next.set('scope', 'PROP_FIRM');
            next.delete('firm');
            next.delete('firmKey');
            next.delete('type');
            next.delete('account');
            next.delete('accountId');
          } else if (val.startsWith('PROP_FIRM:')) {
            const firmKey = val.slice('PROP_FIRM:'.length);
            next.set('scope', 'PROP_FIRM');
            next.set('firm', firmKey);
            next.delete('type');
            next.delete('account');
            next.delete('accountId');
          } else if (val.startsWith('TYPE:')) {
            const type = val.slice('TYPE:'.length);
            next.set('scope', 'TYPE');
            next.set('type', type);
            next.delete('firm');
            next.delete('firmKey');
            next.delete('account');
            next.delete('accountId');
          } else if (val.startsWith('ACCOUNT:')) {
            const accId = val.slice('ACCOUNT:'.length);
            next.set('scope', 'ACCOUNT');
            next.set('account', accId);
            next.delete('firm');
            next.delete('firmKey');
            next.delete('type');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setScope = useCallback(
    (newScope: Partial<AccountScope>) => {
      let nextStored = 'ALL';
      if (newScope.mode === 'PROP_FIRM') {
        if (newScope.accountId) nextStored = `ACCOUNT:${newScope.accountId}`;
        else if (newScope.firmKey) nextStored = `PROP_FIRM:${newScope.firmKey.toLowerCase()}`;
        else nextStored = 'PROP_FIRM:ALL';
      } else if (newScope.mode === 'TYPE') {
        nextStored = `TYPE:${newScope.accountType || 'LIVE'}`;
      } else if (newScope.mode === 'ACCOUNT' && newScope.accountId) {
        nextStored = `ACCOUNT:${newScope.accountId}`;
      }
      writeStoredScopeValue(nextStored);

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newScope.mode === 'ALL' || !newScope.mode) {
            next.delete('scope');
            next.delete('firm');
            next.delete('firmKey');
            next.delete('type');
            next.delete('account');
            next.delete('accountId');
          } else if (newScope.mode === 'PROP_FIRM') {
            next.set('scope', 'PROP_FIRM');
            if (newScope.firmKey) next.set('firm', newScope.firmKey);
            else next.delete('firm');
            if (newScope.accountId) next.set('account', newScope.accountId);
            else next.delete('account');
            next.delete('type');
          } else if (newScope.mode === 'TYPE') {
            next.set('scope', 'TYPE');
            if (newScope.accountType) next.set('type', newScope.accountType);
            next.delete('firm');
            next.delete('account');
          } else if (newScope.mode === 'ACCOUNT') {
            next.set('scope', 'ACCOUNT');
            if (newScope.accountId) next.set('account', newScope.accountId);
            next.delete('firm');
            next.delete('type');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (scope.mode && scope.mode !== 'ALL') {
      p.scope = scope.mode;
    }
    if (scope.firmKey) {
      p.firmKey = scope.firmKey;
    }
    if (scope.accountType) {
      p.accountType = scope.accountType;
    }
    if (scope.accountId) {
      p.accountId = scope.accountId;
    }
    return p;
  }, [scope]);

  const value = useMemo(
    () => ({
      scope,
      scopeLabel,
      isPropMode,
      selectedScopeValue,
      setScopeValue,
      setScope,
      queryParams,
      selectedAccountId,
      accounts,
      propAccounts,
      personalAccounts,
      demoAccounts,
      propFirms,
    }),
    [
      scope,
      scopeLabel,
      isPropMode,
      selectedScopeValue,
      setScopeValue,
      setScope,
      queryParams,
      selectedAccountId,
      accounts,
      propAccounts,
      personalAccounts,
      demoAccounts,
      propFirms,
    ]
  );

  return <AccountScopeContext.Provider value={value}>{children}</AccountScopeContext.Provider>;
}

export function useAccountScope() {
  const ctx = useContext(AccountScopeContext);
  if (!ctx) {
    throw new Error('useAccountScope must be used within an AccountScopeProvider');
  }
  return ctx;
}
