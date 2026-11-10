import { ExecutionAdapterKey } from '@tradevault/shared';
import { IBrokerAdapter } from './broker-adapter.interface.js';
import { FyersAdapter } from './fyers.adapter.js';
import { ElefinMt5Adapter } from './elefin-mt5.adapter.js';
import { PropSimAdapter } from './prop-sim.adapter.js';
import { ManualAdapter } from './manual.adapter.js';

const adapters: Record<ExecutionAdapterKey, IBrokerAdapter> = {
  FYERS: new FyersAdapter(),
  ELEFIN_MT5: new ElefinMt5Adapter(),
  PROP_SIM: new PropSimAdapter(),
  MANUAL: new ManualAdapter(),
};

export class AdapterFactory {
  static getAdapter(account: any): IBrokerAdapter {
    if (!account) return adapters.MANUAL;

    const profileAdapterKey = account.profile?.executionAdapterKey;
    if (profileAdapterKey && adapters[profileAdapterKey as ExecutionAdapterKey]) {
      return adapters[profileAdapterKey as ExecutionAdapterKey];
    }

    const broker = String(account.broker || '').toUpperCase();
    if (broker === 'FYERS') return adapters.FYERS;
    if (/ELEFIN|MT5/i.test(broker) || /ELEFIN|MT5/i.test(String(account.name || ''))) return adapters.ELEFIN_MT5;
    if (account.accountType === 'PROP_FIRM' || account.propFirm?.firmKey || account.propFirmConfig?.enabled) {
      return adapters.PROP_SIM;
    }

    return adapters.MANUAL;
  }

  static getByKey(key: ExecutionAdapterKey | string): IBrokerAdapter {
    const norm = (key || 'MANUAL').toUpperCase().trim() as ExecutionAdapterKey;
    return adapters[norm] || adapters.MANUAL;
  }
}

