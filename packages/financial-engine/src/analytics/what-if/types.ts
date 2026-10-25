import Decimal from 'decimal.js';
import {
  WhatIfFillModel,
  WhatIfResolutionPolicy,
  WhatIfPolicy,
  WhatIfExclusionReason,
  WhatIfVerdict,
  WhatIfCellStatus,
  WhatIfOutcome,
  WhatIfCostModel,
  ITradeCandle,
  IWhatIfCellStats,
  IWhatIfCellResult,
  IWhatIfCalibration,
  IWhatIfBaseline,
  IWhatIfExcursionDistributionBucket,
  AssetClass,
  MarketSegment,
} from '@tradevault/shared';

export interface IWhatIfTradeInput {
  _id?: any;
  id?: string;
  userId?: any;
  status: string;
  direction: 'LONG' | 'SHORT';
  executionMode?: string;
  entryTime: Date | string | number;
  exitTime?: Date | string | number | null;
  assetClass: AssetClass;
  marketSegment?: MarketSegment;
  symbol: string;
  simpleExecution?: {
    entryPrice?: number;
    exitPrice?: number;
    quantity?: number;
    contractMultiplier?: number;
    brokerage?: number;
    exchangeFees?: number;
    regulatoryFees?: number;
    taxes?: number;
    otherFees?: number;
    explicitAdjustments?: number;
  };
  calculated?: {
    averageEntryPrice?: number;
    averageExitPrice?: number;
    closedQuantity?: number;
    netPnL?: number;
    grossPnL?: number;
    totalCosts?: number;
    realizedRMultiple?: number;
    stopMoveSummary?: {
      totalMoves?: number;
      widenedCount?: number;
      trailedCount?: number;
    };
  };
  risk?: {
    initialStopLoss?: number;
    plannedTarget?: number;
    riskBudgetAmount?: number;
  };
  fills?: Array<{
    type: 'ENTRY' | 'EXIT';
    price: number;
    quantity: number;
    timestamp?: Date | string | number;
  }>;
  stopLossMoveEvents?: Array<any>;
  psychology?: {
    stopLossMoved?: boolean;
  };
  accountBroker?: string;
  brokerFlatFeePerLeg?: number;
}

export interface IWhatIfSnapshotInput {
  tradeId: any;
  resolution: string;
  candles: ITradeCandle[];
  isUnderlyingFallback?: boolean;
  coverageFrom?: Date | string;
  coverageTo?: Date | string;
}

export interface IWhatIfEligibleTrade {
  tradeId: string;
  direction: 'LONG' | 'SHORT';
  entryTimeMs: number;
  exitTimeMs: number;
  entryPrice: Decimal;
  actualExitPrice: Decimal;
  quantity: Decimal;
  contractMultiplier: Decimal;
  initialStopLoss: Decimal;
  unitRisk: Decimal;
  rUnitAmount: Decimal;
  plannedTarget: Decimal | null;
  actualTotalCosts: Decimal;
  actualNetPnL: Decimal;
  actualR: Decimal;
  assetClass: AssetClass;
  marketSegment?: MarketSegment;
  symbol: string;
  broker?: string;
  brokerFlatFeePerLeg?: Decimal;
  resolution: string;
  candles: ITradeCandle[];
  entryIndex: number;
  exitIndex: number;
  tickSize: Decimal;
}

export interface IWhatIfReplayResult {
  outcome: WhatIfOutcome;
  fillPrice: Decimal;
  candleIndex: number;
  viaPartialCandle: boolean;
  gapFill: boolean;
}

export interface IWhatIfTradeCellSimulation {
  tradeId: string;
  status: WhatIfCellStatus;
  pess: {
    outcome: WhatIfOutcome;
    fillPrice: Decimal;
    grossPnL: Decimal;
    costs: Decimal;
    netPnL: Decimal;
    r: Decimal;
    viaPartialCandle: boolean;
  };
  opt: {
    outcome: WhatIfOutcome;
    fillPrice: Decimal;
    grossPnL: Decimal;
    costs: Decimal;
    netPnL: Decimal;
    r: Decimal;
    viaPartialCandle: boolean;
  };
  actualSameSubset: {
    netPnL: Decimal;
    r: Decimal;
  };
  ambiguous: boolean;
  costModel: WhatIfCostModel;
  censoredReason?: string;
}

export interface IWhatIfEngineOptions {
  stopRGrid: (number | null)[];
  targetRGrid: (number | null)[];
  fillModel: WhatIfFillModel;
  slippageTicks: number;
  resolutionPolicy: WhatIfResolutionPolicy;
  excludeManagedStopTrades: boolean;
  holdoutFraction: number;
}
