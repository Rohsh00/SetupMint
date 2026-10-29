/**
 * SetupMint — Quantitative Options Greeks & Volatility Engine
 * Pure mathematical Black-Scholes implementation for Indian Index & Equity Derivatives (NIFTY, BANKNIFTY, MCX)
 */

export type OptionType = 'CALL' | 'PUT';
export type MoneynessState = 'DEEP_ITM' | 'ITM' | 'ATM' | 'OTM' | 'DEEP_OTM';

export interface IBlackScholesInput {
  underlyingPrice: number;     // Spot or Future price (S)
  strikePrice: number;         // Strike price (K)
  timeToExpiryYears: number;   // T in years (e.g. 2 days = 2 / 365)
  riskFreeRate?: number;       // r (default 0.07 for RBI 91-day T-bill repo rate)
  volatility?: number;         // sigma annual volatility (e.g. 0.15 for 15% IV)
  optionType: OptionType;
  marketPrice?: number;        // Option LTP to solve for Implied Volatility if volatility omitted
}

export interface IOptionsGreeksResult {
  price: number;
  delta: number;
  gamma: number;
  thetaAnnual: number;
  thetaDaily: number;          // ₹ decay per calendar day per unit
  thetaHourly: number;         // ₹ decay per market trading hour (6.25 hrs/day) per unit
  vega: number;                // Sensitivity per 1% IV change per unit
  impliedVolatility: number;   // Solved or passed IV (annualized)
  moneyness: MoneynessState;
  moneynessRatio: number;      // S / K for CALL, K / S for PUT
  distanceToStrikePoints: number;
  distanceToStrikePercent: number;
}

export interface IPositionGreeksParam {
  underlyingPrice: number;
  strikePrice: number;
  optionType: OptionType;
  expiryDate: Date | string;
  optionLtp: number;
  quantity: number;
  contractMultiplier?: number;
  now?: Date | string;
  riskFreeRate?: number;
  overrideIV?: number;
}

export interface IPositionGreeksSummary {
  unitGreeks: IOptionsGreeksResult;
  positionDelta: number;       // Delta * quantity * multiplier (net contracts)
  cashDeltaSensitivity: number; // ₹ P&L change per 1 point underlying move
  positionThetaDaily: number;  // Total ₹ position time decay per day
  positionThetaHourly: number; // Total ₹ position time decay per hour
  positionVega: number;        // Total ₹ sensitivity per 1% IV change
  moneyness: MoneynessState;
  timeToExpiryHours: number;
  timeToExpiryDays: number;
  isNearExpiry: boolean;       // < 6 hours (expiry day afternoon threat)
  ivCrushWarning: boolean;     // High extrinsic value at threat of rapid collapse
}

/**
 * Standard Normal Cumulative Distribution Function Phi(x)
 * High-precision Abramowitz & Stegun polynomial approximation (error < 7.5e-8)
 */
export function normalCdf(x: number): number {
  if (isNaN(x)) return 0.5;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard Normal Probability Density Function phi(x)
 */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculates Black-Scholes analytical option greeks
 */
export function calculateBlackScholesGreeks(input: IBlackScholesInput): IOptionsGreeksResult {
  const {
    underlyingPrice: S,
    strikePrice: K,
    timeToExpiryYears: rawT,
    riskFreeRate = 0.07,
    optionType,
  } = input;

  // Minimum floor for time to prevent division by zero at expiry
  const T = Math.max(rawT, 0.0001); // ~50 minutes floor for numerical stability
  const sigma = Math.max(input.volatility ?? 0.15, 0.01);

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (riskFreeRate + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nPdfD1 = normalPdf(d1);
  const expRT = Math.exp(-riskFreeRate * T);

  let theoreticalPrice: number;
  let delta: number;
  let thetaAnnual: number;

  if (optionType === 'CALL') {
    theoreticalPrice = S * nd1 - K * expRT * nd2;
    delta = nd1;
    thetaAnnual = -(S * sigma * nPdfD1) / (2 * sqrtT) - riskFreeRate * K * expRT * nd2;
  } else {
    const nMinusD1 = normalCdf(-d1);
    const nMinusD2 = normalCdf(-d2);
    theoreticalPrice = K * expRT * nMinusD2 - S * nMinusD1;
    delta = nd1 - 1; // Negative delta for puts
    thetaAnnual = -(S * sigma * nPdfD1) / (2 * sqrtT) + riskFreeRate * K * expRT * nMinusD2;
  }

  // Gamma and Vega are identical for Calls and Puts
  const gamma = nPdfD1 / (S * sigma * sqrtT);
  const vega = (S * sqrtT * nPdfD1) / 100; // 1% change

  const thetaDaily = thetaAnnual / 365;
  const thetaHourly = thetaDaily / 6.25; // Indian Market 09:15 to 15:30 = 6.25 trading hours

  // Moneyness classification
  const moneynessRatio = optionType === 'CALL' ? S / K : K / S;
  let moneyness: MoneynessState = 'ATM';
  if (moneynessRatio >= 1.035) {
    moneyness = 'DEEP_ITM';
  } else if (moneynessRatio >= 1.008) {
    moneyness = 'ITM';
  } else if (moneynessRatio <= 0.965) {
    moneyness = 'DEEP_OTM';
  } else if (moneynessRatio <= 0.992) {
    moneyness = 'OTM';
  } else {
    moneyness = 'ATM';
  }

  const distanceToStrikePoints = optionType === 'CALL' ? K - S : S - K;
  const distanceToStrikePercent = Number(((distanceToStrikePoints / S) * 100).toFixed(2));

  return {
    price: Number(theoreticalPrice.toFixed(2)),
    delta: Number(delta.toFixed(4)),
    gamma: Number(gamma.toFixed(6)),
    thetaAnnual: Number(thetaAnnual.toFixed(2)),
    thetaDaily: Number(thetaDaily.toFixed(2)),
    thetaHourly: Number(thetaHourly.toFixed(2)),
    vega: Number(vega.toFixed(4)),
    impliedVolatility: Number((sigma * 100).toFixed(2)),
    moneyness,
    moneynessRatio: Number(moneynessRatio.toFixed(4)),
    distanceToStrikePoints: Number(distanceToStrikePoints.toFixed(2)),
    distanceToStrikePercent,
  };
}

/**
 * Rapid Implied Volatility Solver via Newton-Raphson
 */
export function solveImpliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  optionType: OptionType,
  r = 0.07
): number {
  if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return 0.15;

  // Intrinsic lower bound
  const intrinsic = optionType === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
  if (marketPrice <= intrinsic) return 0.08;

  let sigma = 0.25; // Initial guess 25% IV
  const maxIterations = 20;
  const epsilon = 1e-4;

  for (let i = 0; i < maxIterations; i++) {
    const res = calculateBlackScholesGreeks({
      underlyingPrice: S,
      strikePrice: K,
      timeToExpiryYears: T,
      riskFreeRate: r,
      volatility: sigma,
      optionType,
    });

    const diff = res.price - marketPrice;
    if (Math.abs(diff) < epsilon) {
      return sigma;
    }

    const vega = res.vega * 100; // raw vega
    if (Math.abs(vega) < 1e-6) break;

    sigma = sigma - diff / vega;
    if (sigma <= 0.01) sigma = 0.01;
    if (sigma >= 3.0) sigma = 3.0; // Cap at 300%
  }

  return Math.min(Math.max(sigma, 0.05), 2.5);
}

/**
 * Calculates complete Position Greeks and Risk Sensitivities for a live open trade
 */
export function calculatePositionGreeks(params: IPositionGreeksParam): IPositionGreeksSummary {
  const {
    underlyingPrice: S,
    strikePrice: K,
    optionType,
    expiryDate,
    optionLtp,
    quantity,
    contractMultiplier = 1,
    now = new Date(),
    riskFreeRate = 0.07,
    overrideIV,
  } = params;

  const nowMs = new Date(now).getTime();
  const expiry = new Date(expiryDate);
  // Default expiry time to 15:30 IST if not explicitly specified
  const expiryMs = expiry.getHours() === 0 ? expiry.setHours(15, 30, 0, 0) : expiry.getTime();
  const diffMs = Math.max(0, expiryMs - nowMs);

  const hoursRemaining = diffMs / (1000 * 60 * 60);
  const daysRemaining = hoursRemaining / 24;
  const timeToExpiryYears = Math.max(daysRemaining / 365, 0.0001);

  // Derive or use provided IV
  const iv = overrideIV
    ? overrideIV / 100
    : solveImpliedVolatility(optionLtp, S, K, timeToExpiryYears, optionType, riskFreeRate);

  const unitGreeks = calculateBlackScholesGreeks({
    underlyingPrice: S,
    strikePrice: K,
    timeToExpiryYears,
    riskFreeRate,
    volatility: iv,
    optionType,
  });

  const totalEffectiveQuantity = quantity * contractMultiplier;
  const positionDelta = Number((unitGreeks.delta * totalEffectiveQuantity).toFixed(2));
  const cashDeltaSensitivity = Number((unitGreeks.delta * totalEffectiveQuantity).toFixed(2));
  const positionThetaDaily = Number((unitGreeks.thetaDaily * totalEffectiveQuantity).toFixed(2));
  const positionThetaHourly = Number((unitGreeks.thetaHourly * totalEffectiveQuantity).toFixed(2));
  const positionVega = Number((unitGreeks.vega * totalEffectiveQuantity).toFixed(2));

  const isNearExpiry = hoursRemaining <= 6;
  const extrinsicValue = Math.max(
    0,
    optionLtp - (optionType === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S))
  );
  const ivCrushWarning = isNearExpiry && extrinsicValue > optionLtp * 0.4;

  return {
    unitGreeks,
    positionDelta,
    cashDeltaSensitivity,
    positionThetaDaily,
    positionThetaHourly,
    positionVega,
    moneyness: unitGreeks.moneyness,
    timeToExpiryHours: Number(hoursRemaining.toFixed(1)),
    timeToExpiryDays: Number(daysRemaining.toFixed(2)),
    isNearExpiry,
    ivCrushWarning,
  };
}

