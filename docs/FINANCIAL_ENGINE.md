# SetupMint — Financial Calculation Engine Specifications

## 1. Mathematical Formulas & Conventions

All calculations are implemented in `@tradevault/financial-engine` using decimal arithmetic (`decimal.js`) with 30-digit precision and `ROUND_HALF_UP` rounding.

### A. Linear Instrument P&L
For standard linear instruments (Equities, Index Futures, Commodities, Forex, Crypto):

$$\text{Long Gross P&L} = (\text{Exit Price} - \text{Entry Price}) \times \text{Quantity} \times \text{Contract Multiplier}$$

$$\text{Short Gross P&L} = (\text{Entry Price} - \text{Exit Price}) \times \text{Quantity} \times \text{Contract Multiplier}$$

$$\text{Total Costs} = \text{Brokerage} + \text{Exchange Fees} + \text{Regulatory Fees} + \text{Taxes (STT/GST)} + \text{Other Charges}$$

$$\text{Net P&L} = \text{Gross P&L} - \text{Total Costs} + \text{Explicit Adjustments}$$

### B. Outcome Classification
- **WIN**: $\text{Net P&L} > 0$
- **LOSS**: $\text{Net P&L} < 0$
- **BREAKEVEN**: $\text{Net P&L} = 0$
- **OPEN**: Unfilled or partially closed without exit fill

---

## 2. FIFO Matching Engine for Multi-Fill & Partial Exits
When trades are recorded in **Advanced Mode** with multiple entry fills and partial exits:
1. Entry fills and exit fills are sorted chronologically by timestamp.
2. Each exit fill matches against open entry lots in strict **First-In-First-Out (FIFO)** order.
3. Realized Gross P&L is accumulated for each matched slice.
4. Weighted Average Entry Price and Weighted Average Exit Price are computed:
   $$\text{Weighted Avg Price} = \frac{\sum (\text{Price}_i \times \text{Qty}_i)}{\sum \text{Qty}_i}$$

---

## 3. Risk Management & Position Sizing
Given:
- Account Equity $E$
- Risk Percentage $R_\%$ (or Fixed Risk Amount $B$)
- Entry Price $P_{\text{entry}}$
- Stop-Loss Price $P_{\text{stop}}$
- Contract Multiplier $M$
- Lot Size $L$

### Formulas:
$$\text{Stop Distance} = |P_{\text{entry}} - P_{\text{stop}}|$$
$$\text{Loss Per Unit} = \text{Stop Distance} \times M$$
$$\text{Raw Suggested Quantity} = \frac{\text{Risk Budget}}{\text{Loss Per Unit}}$$
$$\text{Rounded Lot Quantity} = \left\lfloor \frac{\text{Raw Suggested Quantity}}{L} \right\rfloor \times L$$
$$\text{Estimated Loss at Stop} = (\text{Rounded Lot Quantity} \times \text{Loss Per Unit}) + \text{Estimated Costs}$$
$$\text{Planned R:R} = \frac{|P_{\text{target}} - P_{\text{entry}}| \times M \times \text{Quantity}}{\text{Estimated Loss at Stop}}$$

### Realized R-Multiple:
$$\text{Realized R} = \frac{\text{Realized Net P&L}}{\text{Initial Planned Risk Budget}}$$

---

## 4. Performance Analytics Metrics

### Win Rate:
$$\text{Win Rate} = \frac{\text{Number of Winning Closed Trades}}{\text{Total Closed Trades}} \times 100$$

### Profit Factor:
$$\text{Profit Factor} = \frac{\sum \text{Positive Net Trade Results}}{\left| \sum \text{Negative Net Trade Results} \right|}$$
*(If losing trades = 0 and gains > 0, returns 999.99 instead of dividing by zero)*

### Expectancy:
$$\text{Expectancy} = \frac{\sum \text{Net P&L of Closed Trades}}{\text{Total Closed Trades}}$$

### Peak-to-Trough Drawdown:
For each trade $i$ in chronological sequence, starting from initial account equity $E_0$:
$$\text{Cumulative Equity}_i = E_0 + \sum_{j=1}^i \text{Net P&L}_j$$
$$\text{Peak Equity}_i = \max(E_0, \text{Cumulative Equity}_1, \dots, \text{Cumulative Equity}_i)$$
$$\text{Drawdown Amount}_i = \text{Peak Equity}_i - \text{Cumulative Equity}_i$$
$$\text{Drawdown Percentage}_i = \frac{\text{Drawdown Amount}_i}{\text{Peak Equity}_i} \times 100$$
$$\text{Max Drawdown} = \max(\text{Drawdown Amount}_1, \dots, \text{Drawdown Amount}_n)$$

---

## 5. Indian Statutory Charges Engine (`charges.ts`)

### Code Location:
[`packages/financial-engine/src/charges.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts)

Models realistic Indian market statutory turnover charges, broker fees, and tax schedules using Decimal.js:
- **Brokerage**: Configurable per-leg fee (default ₹20/leg = ₹40 round-trip; ₹0 for zero-brokerage brokers like Finvasia).
- **Exchange Turnover Fees**:
  - NSE Cash: 0.00297%
  - NSE Futures: 0.00173%
  - NSE Options (on premium): 0.035%
  - MCX Non-agri Commodities: 0.0021%
- **STT / CTT**:
  - NSE Cash (Intraday): 0.025% on sell turnover
  - NSE Futures: 0.02% on sell turnover
  - NSE Options: 0.10% on sell premium turnover
  - MCX Commodities (CTT): 0.01% on sell turnover
- **Stamp Duty**:
  - Cash Equities & Options: 0.003% on buy turnover
  - Futures & Commodities: 0.002% on buy turnover
- **SEBI Turnover Fee**: ₹10 per crore (0.0001% of total turnover)
- **GST**: 18% on (Brokerage + Exchange Fees + SEBI Fee)

---

## 6. Trading Session Derivation (`session.ts`)

### Code Location:
[`packages/financial-engine/src/session.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/session.ts)

Derives `TradingSession` based on execution timestamp and exchange:
- **`NSE_REGULAR`**: Indian equity & F&O market hours (09:15 - 15:30 IST)
- **`MCX_EVENING`**: MCX commodity evening session (17:00 - 23:30/23:55 IST)
- **`NEW_YORK`**: US exchange sessions (NYSE, NASDAQ, CME)
- **`LONDON`**: London exchange session (LSE)
- **`OFF_HOURS`**: Weekend trades (Saturday / Sunday) and 24/7 Crypto markets

---

## 7. Rule-Based Mistake Detection & Discipline Scoring (`mistakes.ts`)

### Code Location:
[`packages/financial-engine/src/mistakes.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/mistakes.ts)

Provides deterministic financial rule heuristics and scoring using Decimal.js:
- **`checkDailyLossBreach(closedTrades, maxDailyLoss, currency)`**:
  Evaluates total net realized P&L across closed trades for the day. If $\sum \text{Net P&L} \le -\text{maxDailyLoss}$, returns `{ breached: true, currentDailyLoss, message }`.
- **`detectMistakeSuggestions({ trades, targetTradeId, accountEquity, thresholds })`**:
  - **Revenge Trading**: Flags trades executed within `revengeTradingMinutes` of a losing trade with equal or larger size.
  - **Overtrading**: Flags trades exceeding `maxDailyTrades` on the same date or exceeding `maxOpenTrades` concurrent open positions.
  - **Size Violation**: Flags trades where planned monetary risk or `riskPercent` exceeds `maxRiskPerTradePercent`.
- **`calculateDailySessionSummary(date, trades, thresholds, accountEquity)`**:
  Derives automated daily session prefill:
  - Best trade ($\max(\text{Net P&L}) > 0$)
  - Worst trade ($\min(\text{Net P&L}) < 0$)
  - Aggregated mistake tags
  - Discipline score (1 to 5) based on rule breaches, tilt indicators, and stop discipline.

---

## 8. Edge Validation Engine (`edge.ts`)

### Code Location:
[`packages/financial-engine/src/edge.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/edge.ts)

Determines whether a strategy demonstrates a statistically credible trading edge or whether its performance could reasonably be explained by sampling randomness.

### Core Mathematical Formulations:

#### A. Trade Eligibility & Realized R-Multiple:
- Only eligible, **`CLOSED`** trades are evaluated. Open trades are excluded.
- Realized R-multiple is strictly defined as:
  $$R_i = \frac{\text{Net P&L}_i}{\text{Planned Risk Amount}_i}$$
- Missing or non-positive planned risk amounts are excluded from R calculations with recorded exclusion reasons rather than silently treated as zero.
- **Breakeven Trade Convention**: Trades with $R = 0$ or $\text{Net P&L} = 0$ are explicitly tracked as breakeven trades. They are included in total trade accounting but excluded from decisive binary parameter updates in the Beta-Binomial posterior denominator.

#### B. Bayesian Win-Rate Estimation (Beta-Binomial Model):
- **Prior**: Uniform non-informative prior $\text{Beta}(\alpha_0 = 1, \beta_0 = 1)$.
- **Posterior**:
  $$\text{Posterior} = \text{Beta}(1 + \text{wins}, 1 + \text{losses})$$
- **Posterior Mean**:
  $$\bar{\theta} = \frac{1 + \text{wins}}{2 + \text{wins} + \text{losses}}$$
- **90% Bayesian Credible Interval**: Exact quantiles computed via regularized incomplete beta inversion:
  $$[\text{quantile}(0.05, \alpha, \beta), \text{quantile}(0.95, \alpha, \beta)]$$
  Implemented using a 9-term Lanczos approximation for $\ln \Gamma(z)$ (>14 digits of precision), modified Lentz continued fraction for $I_x(a, b)$, and bracketed Newton-Raphson quantile inversion with guaranteed bisection fallback.
- **Breakeven Win Rate**: For positive average winning trade magnitude $W$ and positive average losing trade magnitude $L$:
  $$\theta_{\text{BE}} = \frac{L}{W + L}$$
- **Probability of Beating Breakeven**:
  $$P(\theta > \theta_{\text{BE}}) = 1 - I_{\theta_{\text{BE}}}(\alpha, \beta)$$

#### C. Non-Parametric Bootstrap Expectancy in R:
- Resamples realized R-multiples $10,000$ times with replacement.
- Seeded deterministically using 32-bit FNV-1a hash of strategy ID via `Mulberry32PRNG`.
- Evaluates the empirical bootstrap distribution of mean expectancy:
  $$\hat{E}_b = \frac{1}{N} \sum_{i=1}^N R_{b, i}$$
- **90% Bootstrap Interval**: Percentile method $[\hat{E}_{0.05}, \hat{E}_{0.95}]$.
- **Probability of Positive Expectancy**:
  $$P(E > 0) = \frac{1}{B} \sum_{b=1}^B \mathbf{1}(\hat{E}_b > 0)$$

#### D. Edge Verdict Classification:
The verdict model classifies trading performance into:
- **`UNPROVEN`**: Returned if:
  1. Sample size $N < 30$ (`INSUFFICIENT_SAMPLE`), or
  2. The 90% bootstrap expectancy interval touches or crosses zero ($\text{lower} \le 0 \le \text{upper}$, `EXPECTANCY_INTERVAL_CROSSES_ZERO`), or
  3. Expectancy evidence is inconclusive (`INCONCLUSIVE_EXPECTANCY`).
- **`LIKELY_EDGE`**: Returned when $N \ge 30$, the 90% expectancy interval is strictly positive ($\text{lower} > 0$), and $P(E > 0) \ge 0.90$ (`POSITIVE_EXPECTANCY_EVIDENCE`).
- **`NO_EDGE_NEGATIVE`**: Returned when $N \ge 30$, the 90% expectancy interval is strictly negative ($\text{upper} < 0$), and $P(E > 0) \le 0.10$ (`NEGATIVE_EXPECTANCY_EVIDENCE`).

---

## 9. Empirical-Bayes Shrinkage for Ranking (`templates.ts`)

### Code Location:
[`packages/financial-engine/src/templates.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/templates.ts)

Replaces simplistic $+1$ usage count ranking with empirical-Bayes shrunk expectancy to prevent rewarding lucky 1-trade setups while penalizing consistently losing templates:
$$\text{Shrunk Expectancy} = \frac{n \cdot \bar{R} + k \cdot \mu_{\text{global}}}{n + k}$$
- $n$: Number of eligible trades for the template.
- $\bar{R}$: Observed sample mean expectancy in R.
- $k$: Configurable shrinkage weight (default: $10$).
- $\mu_{\text{global}}$: Global population mean expectancy across all comparable trades (default fallback: $0.0$).
- Templates with zero trades shrink completely to the population prior ($0.0$).

---

## 10. Monte Carlo Risk Simulation & Capped Fractional Kelly (`monte-carlo.ts`)

### Code Location:
[`packages/financial-engine/src/monte-carlo.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/monte-carlo.ts)

#### A. Monte Carlo Simulation Engine:
- Simulates $10,000$ equity paths by sampling historical R-multiples with replacement via `Mulberry32PRNG`.
- Baseline peak equity is initialized to starting account equity $E_0$.
- Sizing modes:
  - `FIXED_RISK`: Constant monetary risk per trade.
  - `FIXED_PERCENT_INITIAL`: Fixed percent of initial equity $E_0$.
  - `FRACTIONAL_EQUITY`: Percent of dynamic current equity $E_t$.
- Outputs:
  - Peak-to-trough max drawdown percentiles: $P_{50}, P_{90}, P_{95}, P_{99}, \max$.
  - Threshold breach probability: $P(\text{Drawdown} \ge \text{Threshold})$.
  - Daily loss breach probability: $P(\text{Daily Loss} \ge \text{Max Daily Loss Limit})$.
  - Ruin probability: $P(E_t \le 0)$.

#### B. Capped Fractional Kelly Position Sizing:
- Evaluates unconstrained Kelly fraction for binary payoff:
  $$f^* = p - \frac{1 - p}{b}$$
  where $p = \text{win probability}$ and $b = \frac{\bar{W}}{\bar{L}} = \text{payoff ratio}$.
- Applies conservative Quarter-Kelly multiplier:
  $$\text{Recommended Risk \%} = \min\left(0.25 \times f^* \times 100, \text{maxRiskPerTradePercent}\right)$$
- **Safeguards**:
  - Strictly suppressed with reason `'EDGE_UNPROVEN'` when strategy edge verdict is `UNPROVEN`.
  - Strictly suppressed with reason `'NEGATIVE_EDGE'` when edge is `NO_EDGE_NEGATIVE`.
  - Suppressed if payoff ratio $b \le 0$ or undefined.
  - Hard-capped at user's configured `maxRiskPerTradePercent` (default $2.0\%$).

---

## 11. Continuous Tilt Score Engine (`tilt.ts`)

### Code Location:
[`packages/financial-engine/src/tilt.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/tilt.ts)

Evaluates psychological friction and impulsive trading risk prior to trade execution:
$$\text{Tilt Score} = w_1 S_{\text{streak}} + w_2 S_{\text{size}} + w_3 S_{\text{time}} + w_4 S_{\text{daily\_loss}}$$

Default normalized weights:
- $w_1 = 0.30$ (Loss Streak Score)
- $w_2 = 0.25$ (Size Escalation Score)
- $w_3 = 0.25$ (Time Compression Score)
- $w_4 = 0.20$ (Daily Loss Proximity Score)

### Component Definitions:
1. **Loss Streak Score** ($S_{\text{streak}}$): Exponential saturation on consecutive losing trades:
   $$S_{\text{streak}} = \min(100, (1 - e^{-0.45 \times \text{losses}}) \times 110)$$
2. **Size Escalation Score** ($S_{\text{size}}$): Ratio of proposed trade quantity to rolling baseline (median of past 20 trades):
   $$S_{\text{size}} = \min(100, \max(0, (\text{ratio} - 1.0) \times 70))$$
3. **Time Compression Score** ($S_{\text{time}}$): Rapid execution after prior trade exit:
   - $< 2$ min: $100$
   - $< 5$ min: $80$
   - $< 15$ min: $50$
   - $< 30$ min: $25$
   - $\ge 30$ min: $0$
4. **Daily Loss Proximity Score** ($S_{\text{daily\_loss}}$): Current cumulative day loss divided by configured maximum daily loss limit:
   $$S_{\text{daily\_loss}} = \min(100, (\text{dayLoss} / \text{dailyLimit}) \times 100)$$

### Severity Levels:
- `CALM` ($0 - 30$)
- `ELEVATED` ($31 - 60$)
- `HIGH_TILT` ($61 - 80$)
- `SEVERE_TILT` ($81 - 100$)

When score $\ge 61$, an advisory, non-blocking pre-trade warning is surfaced in `TradeFormModal`. It never blocks trade entry or auto-cancels orders.

---

## 12. Multi-Panel Performance & Reconciliation Modules

### A. Underwater & Drawdown Engine (`drawdown.ts`)
- **Functions:**
  - `calculateUnderwaterSeries(trades, initialEquity)`: Computes high-water mark, current drawdown, max drawdown, and recovery metrics.
  - `calculateDrawdownRecovery(trades, initialEquity)`: Returns `{ longestRecoveryDays, longestRecoveryTrades, isAtHighWaterMark, maxDrawdown, maxDrawdownPercent, currentDrawdown, currentDrawdownPercent }`.
- **Properties:**
  - Fully implements 30-digit precision with `decimal.js`.
  - Accurately tracks recovery duration across both completed peak-to-recovery cycles and ongoing underwater periods.

### B. Cumulative-R & Strategy Overlays (`cumulative-r.ts`)
- **Functions:**
  - `calculateCumulativeRSeries(trades)`: Computes sequential cumulative R series, filtering out trades without valid initial risk/stop loss in full accordance with `edge.ts`.
  - `calculateStrategyOverlays(trades, strategyIds)`: Generates individual cumulative-R series for up to 6 user-selected strategies, tagging each with `sampleSizeWarning: true` if closed trades $< 30$.
- **R-Coverage Metric:** Computes ratio of R-evaluable trades to total trades.

### C. Monte Carlo Expectancy Cone (`monte-carlo.ts`)
- **Function:** `calculateMonteCarloBands(trades, options)`
- **Behavior:**
  - Evaluates edge qualification ($N \ge 30$, verdict $\neq$ `NO_EDGE` / `INSUFFICIENT_DATA`).
  - Simulates 1,000 resampled paths of 50, 100, or 200 future trades using `Mulberry32PRNG`.
  - Yields deterministic per-step percentile envelopes (P5, P25, P50, P75, P95).

### D. Psychological & Risk Event Markers (`events.ts`)
- **Functions:**
  - `detectDailyLossBreaches(trades, dailyLossLimit)`: Flags calendar days where net cumulative loss exceeded user risk tolerance, collecting all trade IDs on that day.
  - `detectHighTiltDays(trades, threshold = 61)`: Flags days exhibiting high tilt ($\ge 61$), identifying trade clusters for psychological debriefing.

### E. Universal Drilldown Aggregate Reconciliation (`reconciliation.ts`)
- **Function:** `computeTradeAggregates(trades)`
- **Guarantees:**
  - Zero round-off drift between chart metrics and underlying trades.
  - Returns `{ totalCount, sumNetPnL, avgNetPnL, sumRealizedR, avgRealizedR, winCount, lossCount, breakevenCount, winRatePercent }`.




