import mongoose from 'mongoose';
import { ITradeCandle, CandleUnavailableReason, CandleProviderName } from '@tradevault/shared';

export interface CandleFetchParams {
  trade: any;
  resolution: string;
  from: Date;
  to: Date;
  userId: string | mongoose.Types.ObjectId;
  isUnderlyingFallback?: boolean;
}

export type CandleProviderResult =
  | {
      ok: true;
      candles: ITradeCandle[];
      resolution: string;
      provider: CandleProviderName;
      isUnderlyingFallback: boolean;
      symbol: string;
      droppedRowsCount: number;
    }
  | {
      ok: false;
      reason: CandleUnavailableReason;
      message: string;
    };

export interface ICandleProvider {
  readonly name: 'FYERS' | 'ANGEL_ONE';
  supports(trade: any, userId: string | mongoose.Types.ObjectId): Promise<boolean>;
  getCandles(params: CandleFetchParams): Promise<CandleProviderResult>;
}
