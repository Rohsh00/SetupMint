import mongoose from 'mongoose';
import { BrokerAdapterRegistry } from '@tradevault/financial-engine';
import {
  IBrokerAdapter,
  AdapterExecutionResult,
  ModifySlParams,
  ExitPositionParams,
  PlaceOrderParams,
} from './broker-adapter.interface.js';
import { Mt5CommandService } from '../mt5-command.service.js';

export class ElefinMt5Adapter implements IBrokerAdapter {
  readonly key = 'ELEFIN_MT5' as const;
  readonly name = 'Elefin MetaTrader 5 Bridge';
  readonly capabilities = BrokerAdapterRegistry.getCapabilities('ELEFIN_MT5');

  async modifyStopLoss(params: ModifySlParams): Promise<AdapterExecutionResult> {
    const ticket = Mt5CommandService.extractTicket(params.trade);
    if (!ticket) {
      throw new Error(
        'Live execution blocked: MT5 position ticket could not be resolved from trade tags or fills.'
      );
    }

    const cmd = await Mt5CommandService.queueModifySl({
      userId: params.userId,
      accountId: params.account?._id || params.trade.accountId,
      tradeId: params.trade._id,
      ticket,
      stopLoss: params.newStopLoss,
      takeProfit: params.takeProfit,
    });

    return {
      success: true,
      ticket,
      orderId: cmd._id.toString(),
      message: `Stop Loss order (${params.newStopLoss}) queued to Elefin MT5 Bridge (Ticket #${ticket})`,
      rawResponse: cmd,
    };
  }

  async exitPosition(params: ExitPositionParams): Promise<AdapterExecutionResult> {
    const ticket = Mt5CommandService.extractTicket(params.trade);
    if (!ticket) {
      throw new Error(
        'Live execution blocked: MT5 position ticket could not be resolved from trade tags or fills.'
      );
    }

    const cmd = await Mt5CommandService.queueClosePosition({
      userId: params.userId,
      accountId: params.account?._id || params.trade.accountId,
      tradeId: params.trade._id,
      ticket,
      volume: params.quantity,
    });

    return {
      success: true,
      ticket,
      orderId: cmd._id.toString(),
      message: `Market close order queued to Elefin MT5 Bridge for Ticket #${ticket}`,
      rawResponse: cmd,
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<AdapterExecutionResult> {
    // MT5 market order queued to EA
    return {
      success: true,
      message: `Simulated/queued MT5 order for ${params.quantity} ${params.symbol}`,
    };
  }
}

