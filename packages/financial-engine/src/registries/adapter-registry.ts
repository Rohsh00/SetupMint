import { ExecutionAdapterKey, ITradingAccountCapabilities } from '@tradevault/shared';

export type ExecutionAction =
  | 'PLACE_ORDER'
  | 'MODIFY_STOP_LOSS'
  | 'EXIT_POSITION'
  | 'SCALE_LADDER'
  | 'AUTO_EXECUTE'
  | 'SYNC_FUNDS'
  | 'FETCH_HISTORY'
  | 'STREAM_QUOTES';

const ADAPTER_CAPABILITIES: Record<ExecutionAdapterKey, ITradingAccountCapabilities> = {
  FYERS: {
    canPlaceOrders: true,
    canModifyStopLoss: true,
    canExitPositions: true,
    canScaleLadder: true,
    canAutoExecute: true,
    canSyncFunds: true,
    canFetchHistory: true,
    canStreamQuotes: true,
  },
  ELEFIN_MT5: {
    canPlaceOrders: true,
    canModifyStopLoss: true,
    canExitPositions: true,
    canScaleLadder: true,
    canAutoExecute: true,
    canSyncFunds: false,
    canFetchHistory: false,
    canStreamQuotes: true,
  },
  PROP_SIM: {
    canPlaceOrders: false,
    canModifyStopLoss: false,
    canExitPositions: false,
    canScaleLadder: false,
    canAutoExecute: false,
    canSyncFunds: false,
    canFetchHistory: false,
    canStreamQuotes: true,
  },
  MANUAL: {
    canPlaceOrders: false,
    canModifyStopLoss: false,
    canExitPositions: false,
    canScaleLadder: false,
    canAutoExecute: false,
    canSyncFunds: false,
    canFetchHistory: false,
    canStreamQuotes: false,
  },
};

export class BrokerAdapterRegistry {
  static getCapabilities(key: ExecutionAdapterKey | string): ITradingAccountCapabilities {
    const norm = (key || 'MANUAL').toUpperCase().trim() as ExecutionAdapterKey;
    return ADAPTER_CAPABILITIES[norm] || ADAPTER_CAPABILITIES.MANUAL;
  }

  static checkCapability(
    action: ExecutionAction,
    capabilities: ITradingAccountCapabilities,
    adapterName = 'Current Broker Adapter'
  ): { allowed: boolean; reason?: string } {
    switch (action) {
      case 'PLACE_ORDER':
        if (!capabilities.canPlaceOrders) {
          return { allowed: false, reason: `${adapterName} does not support live order entry.` };
        }
        break;
      case 'MODIFY_STOP_LOSS':
        if (!capabilities.canModifyStopLoss) {
          return { allowed: false, reason: `${adapterName} does not support live broker SL modification.` };
        }
        break;
      case 'EXIT_POSITION':
        if (!capabilities.canExitPositions) {
          return { allowed: false, reason: `${adapterName} does not support live position exit.` };
        }
        break;
      case 'SCALE_LADDER':
        if (!capabilities.canScaleLadder) {
          return { allowed: false, reason: `${adapterName} does not support multi-step scaling ladder execution.` };
        }
        break;
      case 'AUTO_EXECUTE':
        if (!capabilities.canAutoExecute) {
          return { allowed: false, reason: `${adapterName} does not support background auto-execution.` };
        }
        break;
      case 'SYNC_FUNDS':
        if (!capabilities.canSyncFunds) {
          return { allowed: false, reason: `${adapterName} does not support automated fund/balance synchronization.` };
        }
        break;
      case 'FETCH_HISTORY':
        if (!capabilities.canFetchHistory) {
          return { allowed: false, reason: `${adapterName} does not support automated tradebook history import.` };
        }
        break;
      case 'STREAM_QUOTES':
        if (!capabilities.canStreamQuotes) {
          return { allowed: false, reason: `${adapterName} does not provide real-time quote streaming.` };
        }
        break;
    }
    return { allowed: true };
  }
}

