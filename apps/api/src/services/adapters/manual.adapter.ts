import { BrokerAdapterRegistry } from '@tradevault/financial-engine';
import {
  IBrokerAdapter,
  AdapterExecutionResult,
  ModifySlParams,
  ExitPositionParams,
  PlaceOrderParams,
} from './broker-adapter.interface.js';

export class ManualAdapter implements IBrokerAdapter {
  readonly key = 'MANUAL' as const;
  readonly name = 'Manual Trade Journal';
  readonly capabilities = BrokerAdapterRegistry.getCapabilities('MANUAL');

  async modifyStopLoss(params: ModifySlParams): Promise<AdapterExecutionResult> {
    throw new Error('Manual accounts do not connect to a broker for automated Stop Loss modification.');
  }

  async exitPosition(params: ExitPositionParams): Promise<AdapterExecutionResult> {
    throw new Error('Manual accounts do not connect to a broker for automated position exits.');
  }

  async placeOrder(params: PlaceOrderParams): Promise<AdapterExecutionResult> {
    throw new Error('Manual accounts do not support live order placement.');
  }
}

