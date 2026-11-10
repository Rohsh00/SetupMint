import { useMemo, useCallback } from 'react';
import { useAccount } from '../context/AccountContext.js';
import { ITradingAccountCapabilities } from '@tradevault/shared';

export type CapabilityAction =
  | 'canPlaceOrders'
  | 'canModifyStopLoss'
  | 'canExitPositions'
  | 'canScaleLadder'
  | 'canAutoExecute'
  | 'canSyncFunds'
  | 'canFetchHistory'
  | 'canStreamQuotes';

export interface CapabilityCheck {
  allowed: boolean;
  reason?: string;
}

export function useCapabilities() {
  const { capabilities, activeAccount, profile } = useAccount();

  const getReason = useCallback(
    (action: CapabilityAction): string => {
      const broker = activeAccount?.broker || 'Manual';
      switch (action) {
        case 'canPlaceOrders':
          return `${broker} does not support live broker order execution from SetupMint.`;
        case 'canModifyStopLoss':
          return `${broker} does not support remote Stop Loss modification.`;
        case 'canExitPositions':
          return `${broker} does not support live position liquidation.`;
        case 'canScaleLadder':
          return `${broker} does not support multi-step scaling ladder automation.`;
        case 'canAutoExecute':
          return `${broker} account is not enabled for automated server-side execution.`;
        case 'canSyncFunds':
          return `Funds snapshot sync is only available for connected FYERS accounts.`;
        case 'canFetchHistory':
          return `Historical broker tradebook import is not supported by ${broker}.`;
        case 'canStreamQuotes':
          return `Live tick quote streaming is not configured for ${broker}.`;
        default:
          return 'Action is not supported by the active account adapter.';
      }
    },
    [activeAccount]
  );

  const can = useCallback(
    (action: CapabilityAction): boolean => {
      return Boolean(capabilities?.[action]);
    },
    [capabilities]
  );

  const assert = useCallback(
    (action: CapabilityAction): CapabilityCheck => {
      const allowed = Boolean(capabilities?.[action]);
      return {
        allowed,
        reason: allowed ? undefined : getReason(action),
      };
    },
    [capabilities, getReason]
  );

  return useMemo(
    () => ({
      capabilities,
      can,
      assert,
      getReason,
      adapterKey: profile?.executionAdapterKey || 'MANUAL',
      isHedging: profile?.positionModel === 'HEDGING',
      positionModel: profile?.positionModel || 'NETTING_FIFO',
      feeModelKey: profile?.feeModelKey || 'NONE',
    }),
    [capabilities, can, assert, getReason, profile]
  );
}

