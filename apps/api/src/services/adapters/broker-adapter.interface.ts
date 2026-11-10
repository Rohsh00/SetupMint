import mongoose from 'mongoose';
import { ExecutionAdapterKey, ITradingAccountCapabilities } from '@tradevault/shared';

export interface AdapterExecutionResult {
  success: boolean;
  orderId?: string;
  ticket?: number;
  message: string;
  executedPrice?: number;
  executedQuantity?: number;
  rawResponse?: any;
}

export interface ModifySlParams {
  userId: string | mongoose.Types.ObjectId;
  account: any;
  trade: any;
  newStopLoss: number;
  takeProfit?: number;
  triggerPrice?: number;
  idempotencyKey?: string;
}

export interface ExitPositionParams {
  userId: string | mongoose.Types.ObjectId;
  account: any;
  trade: any;
  exitPrice?: number;
  quantity?: number;
  exitReason?: string;
  idempotencyKey?: string;
}

export interface PlaceOrderParams {
  userId: string | mongoose.Types.ObjectId;
  account: any;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  idempotencyKey?: string;
}

export interface IBrokerAdapter {
  readonly key: ExecutionAdapterKey;
  readonly name: string;
  readonly capabilities: ITradingAccountCapabilities;

  modifyStopLoss(params: ModifySlParams): Promise<AdapterExecutionResult>;
  exitPosition(params: ExitPositionParams): Promise<AdapterExecutionResult>;
  placeOrder(params: PlaceOrderParams): Promise<AdapterExecutionResult>;
  syncFunds?(userId: string | mongoose.Types.ObjectId, accountId: string | mongoose.Types.ObjectId): Promise<any>;
  syncPositions?(userId: string | mongoose.Types.ObjectId, accountId: string | mongoose.Types.ObjectId): Promise<any>;
}

