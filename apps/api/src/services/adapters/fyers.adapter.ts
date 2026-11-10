import mongoose from 'mongoose';
import { BrokerAdapterRegistry } from '@tradevault/financial-engine';
import {
  IBrokerAdapter,
  AdapterExecutionResult,
  ModifySlParams,
  ExitPositionParams,
  PlaceOrderParams,
} from './broker-adapter.interface.js';
import { FyersService } from '../fyers.service.js';
import { BrokerIntegration } from '../../db/models/BrokerIntegration.js';

export class FyersAdapter implements IBrokerAdapter {
  readonly key = 'FYERS' as const;
  readonly name = 'FYERS API v3 Adapter';
  readonly capabilities = BrokerAdapterRegistry.getCapabilities('FYERS');

  private async assertIntegration(userId: string | mongoose.Types.ObjectId) {
    const integration = await BrokerIntegration.findOne({
      userId,
      broker: 'FYERS',
      status: 'CONNECTED',
    });
    const isExpired = Boolean(
      integration?.tokenExpiresAt && new Date(integration.tokenExpiresAt) <= new Date()
    );
    if (!integration || !integration.accessToken || !integration.appId || isExpired) {
      throw new Error(
        isExpired
          ? 'Live broker execution blocked: FYERS access token has expired. Please re-authenticate in Settings.'
          : 'Live broker execution blocked: FYERS broker is not connected or missing credentials.'
      );
    }
    return integration as typeof integration & { appId: string; accessToken: string };
  }

  async modifyStopLoss(params: ModifySlParams): Promise<AdapterExecutionResult> {
    await this.assertIntegration(params.userId);
    const result = await FyersService.executeBrokerStopLoss(
      params.userId,
      params.trade._id.toString(),
      params.newStopLoss
    );
    return {
      success: true,
      orderId: result.orderId,
      message: result.message || `Stop loss adjusted to ${params.newStopLoss} on FYERS`,
      rawResponse: result,
    };
  }

  async exitPosition(params: ExitPositionParams): Promise<AdapterExecutionResult> {
    await this.assertIntegration(params.userId);
    const qty = params.quantity || params.trade.calculated?.openQuantity || params.trade.simpleExecution?.quantity || 1;
    const res = await FyersService.executeBrokerExit(params.userId, params.trade._id.toString(), {
      exitQty: qty,
      isFullClose: params.quantity ? false : true,
    });

    return {
      success: res.executedOnBroker,
      orderId: res.orderId,
      message: res.message,
      rawResponse: res,
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<AdapterExecutionResult> {
    const integration = await this.assertIntegration(params.userId);
    const side = params.direction === 'LONG' ? 1 : -1;
    const res = await FyersService.placeOrder(
      integration.appId,
      integration.accessToken,
      {
        symbol: params.symbol,
        qty: params.quantity,
        type: params.orderType === 'LIMIT' ? 1 : 2,
        side,
        productType: 'INTRADAY',
        limitPrice: params.price || 0,
        stopPrice: params.stopLoss || 0,
        validity: 'DAY',
        offlineOrder: false,
      }
    );

    return {
      success: true,
      orderId: res.id,
      message: `Order submitted to FYERS: ${params.direction} ${params.quantity} ${params.symbol}`,
      rawResponse: res,
    };
  }

  async syncFunds(userId: string | mongoose.Types.ObjectId, accountId: string | mongoose.Types.ObjectId) {
    return FyersService.syncFundsForAccount(accountId, userId);
  }

  async syncPositions(userId: string | mongoose.Types.ObjectId, accountId: string | mongoose.Types.ObjectId) {
    const integration = await this.assertIntegration(userId);
    return FyersService.fetchOrderbook(integration.appId, integration.accessToken);
  }
}
