import { BrokerAdapterRegistry } from '@tradevault/financial-engine';
import {
  IBrokerAdapter,
  AdapterExecutionResult,
  ModifySlParams,
  ExitPositionParams,
  PlaceOrderParams,
} from './broker-adapter.interface.js';

export class PropSimAdapter implements IBrokerAdapter {
  readonly key = 'PROP_SIM' as const;
  readonly name = 'Prop Firm Challenge Simulator';
  readonly capabilities = BrokerAdapterRegistry.getCapabilities('PROP_SIM');

  async modifyStopLoss(params: ModifySlParams): Promise<AdapterExecutionResult> {
    return {
      success: true,
      message: `Challenge paper stop loss simulated at ${params.newStopLoss}`,
    };
  }

  async exitPosition(params: ExitPositionParams): Promise<AdapterExecutionResult> {
    return {
      success: true,
      message: `Challenge paper position exit simulated`,
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<AdapterExecutionResult> {
    return {
      success: true,
      message: `Challenge paper order simulated for ${params.quantity} ${params.symbol}`,
    };
  }
}

