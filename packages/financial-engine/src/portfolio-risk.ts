/**
 * SetupMint — Portfolio-Level Correlated Exposure & Risk Engine
 * Measures cross-position delta sensitivity, conflicting directional bets, and aggregate theta bleed
 */

export type DirectionalBias =
  | 'STRONGLY_BULLISH'
  | 'BULLISH'
  | 'NEUTRAL_HEDGED'
  | 'BEARISH'
  | 'STRONGLY_BEARISH';

export interface IPortfolioPositionSummary {
  tradeId: string;
  symbol: string;
  underlying: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  contractMultiplier: number;
  floatingNetPnL: number;
  unrealizedR: number | null;
  cashDeltaSensitivity?: number; // ₹ P&L change per 1 point underlying move
  thetaHourlyDecay?: number;     // ₹ decay per hour
  isOption?: boolean;
  optionType?: 'CALL' | 'PUT';
}

export interface IPortfolioRiskResult {
  totalOpenPositions: number;
  netDirectionalDelta: number;     // Combined ₹ sensitivity per 1% index move
  netDirectionalBias: DirectionalBias;
  totalThetaBurnPerHour: number;   // Combined ₹ decay per hour across option holdings
  totalDailyThetaBurn: number;     // Combined ₹ decay per day
  conflictingPositionsWarning: boolean;
  conflictingDetails: string[];
  underlyingExposure: Record<string, {
    count: number;
    netLots: number;
    directionalBias: 'LONG' | 'SHORT' | 'MIXED';
    floatingPnL: number;
  }>;
}

/**
 * Correlated Indian Index cluster mapping (e.g. NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY have > 0.85 correlation)
 */
const INDEX_CORRELATION_CLUSTER = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

export function calculatePortfolioRisk(
  positions: IPortfolioPositionSummary[]
): IPortfolioRiskResult {
  if (positions.length === 0) {
    return {
      totalOpenPositions: 0,
      netDirectionalDelta: 0,
      netDirectionalBias: 'NEUTRAL_HEDGED',
      totalThetaBurnPerHour: 0,
      totalDailyThetaBurn: 0,
      conflictingPositionsWarning: false,
      conflictingDetails: [],
      underlyingExposure: {},
    };
  }

  let totalThetaBurnPerHour = 0;
  let netDeltaPoints = 0;
  const underlyingExposure: Record<
    string,
    { count: number; netLots: number; directionalBias: 'LONG' | 'SHORT' | 'MIXED'; floatingPnL: number }
  > = {};

  const indexBets: Array<{
    symbol: string;
    underlying: string;
    effectiveDirection: 'BULLISH' | 'BEARISH';
  }> = [];

  for (const pos of positions) {
    const und = (pos.underlying || pos.symbol || 'OTHER').toUpperCase();

    // Determine effective market direction (Long Call = Bullish, Long Put = Bearish, Short Call = Bearish, Short Put = Bullish)
    let effectiveDirection: 'BULLISH' | 'BEARISH';
    if (pos.isOption && pos.optionType) {
      if (pos.direction === 'LONG') {
        effectiveDirection = pos.optionType === 'CALL' ? 'BULLISH' : 'BEARISH';
      } else {
        effectiveDirection = pos.optionType === 'CALL' ? 'BEARISH' : 'BULLISH';
      }
    } else {
      effectiveDirection = pos.direction === 'LONG' ? 'BULLISH' : 'BEARISH';
    }

    if (INDEX_CORRELATION_CLUSTER.some((idx) => und.includes(idx))) {
      indexBets.push({ symbol: pos.symbol, underlying: und, effectiveDirection });
    }

    // Accumulate cash delta
    const delta = pos.cashDeltaSensitivity ?? (effectiveDirection === 'BULLISH' ? pos.quantity : -pos.quantity);
    netDeltaPoints += delta;

    // Accumulate theta
    if (pos.thetaHourlyDecay) {
      totalThetaBurnPerHour += Math.abs(pos.thetaHourlyDecay);
    }

    // Group by underlying
    if (!underlyingExposure[und]) {
      underlyingExposure[und] = {
        count: 0,
        netLots: 0,
        directionalBias: effectiveDirection === 'BULLISH' ? 'LONG' : 'SHORT',
        floatingPnL: 0,
      };
    }

    underlyingExposure[und].count += 1;
    underlyingExposure[und].netLots += effectiveDirection === 'BULLISH' ? pos.quantity : -pos.quantity;
    underlyingExposure[und].floatingPnL += pos.floatingNetPnL;
  }

  // Refine underlying directional bias
  for (const und of Object.keys(underlyingExposure)) {
    const item = underlyingExposure[und];
    if (item.netLots === 0 && item.count > 1) {
      item.directionalBias = 'MIXED';
    } else if (item.netLots > 0) {
      item.directionalBias = 'LONG';
    } else {
      item.directionalBias = 'SHORT';
    }
  }

  // Check for conflicting correlated bets
  const hasBullishIndex = indexBets.some((b) => b.effectiveDirection === 'BULLISH');
  const hasBearishIndex = indexBets.some((b) => b.effectiveDirection === 'BEARISH');
  const conflictingDetails: string[] = [];

  let conflictingPositionsWarning = false;
  if (hasBullishIndex && hasBearishIndex) {
    conflictingPositionsWarning = true;
    const bullishSymbols = indexBets.filter((b) => b.effectiveDirection === 'BULLISH').map((b) => b.symbol).join(', ');
    const bearishSymbols = indexBets.filter((b) => b.effectiveDirection === 'BEARISH').map((b) => b.symbol).join(', ');
    conflictingDetails.push(
      `Conflicting correlated index exposure: Bullish (${bullishSymbols}) vs Bearish (${bearishSymbols}). Paying double brokerage/statutory fees with canceled directional delta.`
    );
  }

  // Directional Bias
  let netDirectionalBias: DirectionalBias = 'NEUTRAL_HEDGED';
  if (netDeltaPoints >= 500) {
    netDirectionalBias = 'STRONGLY_BULLISH';
  } else if (netDeltaPoints >= 25) {
    netDirectionalBias = 'BULLISH';
  } else if (netDeltaPoints <= -500) {
    netDirectionalBias = 'STRONGLY_BEARISH';
  } else if (netDeltaPoints <= -25) {
    netDirectionalBias = 'BEARISH';
  } else {
    netDirectionalBias = 'NEUTRAL_HEDGED';
  }

  return {
    totalOpenPositions: positions.length,
    netDirectionalDelta: Number(netDeltaPoints.toFixed(2)),
    netDirectionalBias,
    totalThetaBurnPerHour: Number(totalThetaBurnPerHour.toFixed(2)),
    totalDailyThetaBurn: Number((totalThetaBurnPerHour * 6.25).toFixed(2)),
    conflictingPositionsWarning,
    conflictingDetails,
    underlyingExposure,
  };
}
