# SetupMint — Mathematical & Financial Calculations Engine

This document provides the definitive mathematical specifications, exact algorithmic implementations, rounding rules, and edge-case handling implemented in `@tradevault/financial-engine` (`packages/financial-engine/src/charges.ts`).

---

## 1. Mathematical Arithmetic Precision Standard

SetupMint executes **all monetary arithmetic using Decimal.js** configured with **30 digits of precision** and banker's rounding (`ROUND_HALF_UP`):

```typescript
// packages/financial-engine/src/pnl.ts, packages/financial-engine/src/charges.ts
import Decimal from 'decimal.js';
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });
```

This completely eliminates IEEE-754 binary floating-point round-off inaccuracies (such as `0.1 + 0.2 = 0.30000000000000004`) from trade calculations and ledger balances.

---

## 2. Linear Realized Gross & Net P&L

### Code Location:
[`packages/financial-engine/src/pnl.ts:39-100`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/pnl.ts#L39-L100)

### Mathematical Formulas:

#### Gross Realized P&L:
$$\text{Long Gross P&L} = (P_{\text{exit}} - P_{\text{entry}}) \times Q \times M$$

$$\text{Short Gross P&L} = (P_{\text{entry}} - P_{\text{exit}}) \times Q \times M$$

Where:
- $P_{\text{entry}}$: Entry execution price
- $P_{\text{exit}}$: Exit execution price
- $Q$: Executed trade quantity ($Q \ge 0$)
- $M$: Contract multiplier (default: $1$)

#### Total Transaction Costs:
$$\text{Total Costs} = \text{Brokerage} + \text{Exchange Fees} + \text{Regulatory Fees} + \text{Taxes} + \text{Other Fees}$$

#### Net Realized P&L:
$$\text{Net P&L} = \text{Gross P&L} - \text{Total Costs} + \text{Explicit Adjustments}$$

### Edge Cases & Handling:
- **Quantity $< 0$:** Throws an explicit error: `"Quantity cannot be negative"`.
- **Exit Price is `null` or `undefined` (Open Trade):**
  - $\text{Gross P&L} = 0.00$
  - $\text{Net P&L} = 0.00 - \text{Total Costs} + \text{Adjustments}$
  - `outcome = 'OPEN'`, `isClosed = false`.
- **Rounding:** Formatted to 2 decimal places (`toFixed(2)`) for final presentation.

---

## 3. FIFO Multi-Fill Matching Engine (Scale-Ins & Partial Exits)

### Code Location:
[`packages/financial-engine/src/fifo.ts:29-159`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/fifo.ts#L29-L159)

When trading in **Advanced Mode**, trades may have multiple entry orders and partial exit fills. SetupMint matches fills in strict **First-In-First-Out (FIFO)** order.

### Algorithm:
1. Sort all fills chronologically:
   $$\text{timestamp}(f_1) \le \text{timestamp}(f_2) \le \dots \le \text{timestamp}(f_n)$$
2. Accumulate incoming `ENTRY` fills into an open lots FIFO queue:
   $$\text{Queue} \leftarrow [\text{Lot}_1(P_1, Q_1), \text{Lot}_2(P_2, Q_2), \dots]$$
3. For each `EXIT` fill with price $P_{\text{exit}}$ and quantity $Q_{\text{exit}}$:
   - While $Q_{\text{exit}} > 0$ and queue is not empty:
     - Match against head lot: $Q_{\text{match}} = \min(Q_{\text{exit}}, Q_{\text{lot}})$
     - Calculate slice Gross P&L:
       $$\text{Slice Gross} = \begin{cases} (P_{\text{exit}} - P_{\text{lot}}) \times Q_{\text{match}} \times M & \text{if LONG} \\ (P_{\text{lot}} - P_{\text{exit}}) \times Q_{\text{match}} \times M & \text{if SHORT} \end{cases}$$
     - Realized Gross P&L $\leftarrow$ Realized Gross P&L $+$ Slice Gross
     - Deduct matched quantity from both $Q_{\text{exit}}$ and $Q_{\text{lot}}$. If lot quantity reaches 0, dequeue it.
   - If $Q_{\text{exit}} > 0$ after queue is exhausted, throw error: `"Exit fill exceeds available open entry lots"`.

#### Weighted Average Entry Price:
$$\bar{P}_{\text{entry}} = \frac{\sum (P_i \times Q_i)}{\sum Q_i} \quad \text{for all } \text{ENTRY fills}$$

#### Weighted Average Exit Price:
$$\bar{P}_{\text{exit}} = \frac{\sum (P_j \times Q_j)}{\sum Q_j} \quad \text{for all } \text{EXIT fills}$$

---

## 4. Indian Statutory Charges & Fee Structure

### Code Location:
[`packages/financial-engine/src/charges.ts:42-154`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts#L42-L154)

SetupMint models exact Indian market statutory charges using Decimal.js based on official SEBI, exchange, and broker fee schedules:

### Formulas:
$$\text{Buy Turnover} = P_{\text{entry}} \times Q \times M$$
$$\text{Sell Turnover} = P_{\text{exit}} \times Q \times M$$
$$\text{Total Turnover} = \text{Buy Turnover} + \text{Sell Turnover}$$

| Fee Component | Market Segment | Rate Formula |
| :--- | :--- | :--- |
| **Brokerage** | FYERS / Zerodha / Angel One | Flat ₹20 per executed leg = **₹40.00 round-trip** (customizable per-broker flat fee, e.g. ₹0 for Finvasia) |
| **Exchange Turnover Fee** | NSE Cash Equities | $0.00297\%$ of Total Turnover ($\text{Turnover} \times 0.0000297$) |
| | NSE Index/Stock Futures | $0.00173\%$ of Total Turnover ($\text{Turnover} \times 0.0000173$) |
| | NSE Options (on Premium) | $0.035\%$ of Premium Turnover ($\text{Turnover} \times 0.00035$) |
| | MCX Non-Agri Commodities | $0.0021\%$ of Total Turnover ($\text{Turnover} \times 0.000021$) |
| **STT / CTT** | NSE Cash Intraday | $0.025\%$ on Sell Turnover ($\text{Sell Turnover} \times 0.00025$) |
| | NSE Futures | $0.02\%$ on Sell Turnover ($\text{Sell Turnover} \times 0.0002$) |
| | NSE Options | $0.10\%$ on Sell Premium Turnover ($\text{Sell Turnover} \times 0.001$) |
| | MCX Commodities (CTT) | $0.01\%$ on Sell Turnover ($\text{Sell Turnover} \times 0.0001$) |
| **Stamp Duty** | Cash Equities | $0.003\%$ on Buy Turnover ($\text{Buy Turnover} \times 0.00003$) |
| | Futures & Commodities | $0.002\%$ on Buy Turnover ($\text{Buy Turnover} \times 0.00002$) |
| | Options | $0.003\%$ on Buy Premium Turnover ($\text{Buy Turnover} \times 0.00003$) |
| **SEBI Turnover Fee** | All Segments | ₹10 per crore = $0.0001\%$ ($\text{Total Turnover} \times 0.000001$) |
| **GST** | All Segments | **$18\%$** on $(\text{Brokerage} + \text{Exchange Turnover Fee} + \text{SEBI Fee})$ |

---

## 5. Pre-Trade Risk & Position Sizing

### Code Location:
[`packages/financial-engine/src/risk.ts:11-149`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/risk.ts#L11-L149)

### Formulas:
$$\text{Stop Distance} = |P_{\text{entry}} - P_{\text{stop}}|$$
$$\text{Loss Per Unit At Stop} = \text{Stop Distance} \times M$$

#### Planned Risk Budget ($B$):
$$B = \begin{cases} \text{Fixed Risk Amount} & \text{if Fixed Mode} \\ \text{Account Equity} \times \left(\frac{R_\%}{100}\right) & \text{if Percentage Mode} \end{cases}$$

#### Raw Suggested Quantity:
$$Q_{\text{raw}} = \frac{B}{\text{Loss Per Unit At Stop}}$$

#### Rounded Lot Quantity:
$$Q_{\text{rounded}} = \left\lfloor \frac{Q_{\text{raw}}}{\text{Lot Step}} \right\rfloor \times \text{Lot Step}$$
*(Where $\text{Lot Step} = \text{quantityIncrement} \text{ or } \text{lotSize}$)*

#### Estimated Monetary Loss at Stop:
$$\text{Loss}_{\text{stop}} = (Q_{\text{rounded}} \times \text{Loss Per Unit At Stop}) + \text{Estimated Costs}$$

#### Planned Reward-to-Risk Ratio:
$$\text{Planned R:R} = \frac{|P_{\text{target}} - P_{\text{entry}}| \times M \times Q_{\text{rounded}}}{\text{Loss}_{\text{stop}}}$$

#### Realized R-Multiple:
$$\text{Realized R} = \frac{\text{Realized Net P&L}}{\text{Initial Planned Risk Budget}}$$
*(If Planned Risk Budget $\le 0$ or undefined, returns `undefined`)*

---

## 6. Performance Analytics & Metrics

### Code Location:
[`packages/financial-engine/src/metrics.ts:26-430`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/metrics.ts#L26-L430)

All performance metrics are calculated over **closed trades** ($N_{\text{closed}}$):

### 1. Win Rate & Loss Rate
$$\text{Win Rate \%} = \frac{N_{\text{win}}}{N_{\text{closed}}} \times 100 \quad \text{where } \text{Net P&L} > 0$$
$$\text{Loss Rate \%} = \frac{N_{\text{loss}}}{N_{\text{closed}}} \times 100 \quad \text{where } \text{Net P&L} < 0$$

### 2. Profit Factor
$$\text{Profit Factor} = \frac{\sum_{i=1}^{N_{\text{win}}} \text{Net P&L}_i}{\sum_{j=1}^{N_{\text{loss}}} |\text{Net P&L}_j|}$$

**Zero Loss Edge Case:** If $\sum |\text{Losses}| == 0$ and $\sum \text{Gains} > 0$, SetupMint returns **`999.99`** instead of dividing by zero or outputting `Infinity`. If both gains and losses are zero, it returns `0.00`.

### 3. Expectancy
$$\text{Expectancy} = \frac{\sum_{i=1}^{N_{\text{closed}}} \text{Net P&L}_i}{N_{\text{closed}}}$$

### 4. Peak-to-Trough Drawdown & Equity Curve
Given starting equity $E_0$ and chronological trades $1 \dots n$:
$$\text{Cumulative Equity}_i = E_0 + \sum_{k=1}^i \text{Net P&L}_k$$
$$\text{Peak Equity}_i = \max(E_0, \text{Cumulative Equity}_1, \dots, \text{Cumulative Equity}_i)$$
$$\text{Drawdown Amount}_i = \text{Peak Equity}_i - \text{Cumulative Equity}_i$$
$$\text{Drawdown Percentage}_i = \begin{cases} \frac{\text{Drawdown Amount}_i}{\text{Peak Equity}_i} \times 100 & \text{if } \text{Peak Equity}_i > 0 \\ 0 & \text{otherwise} \end{cases}$$
$$\text{Max Drawdown Amount} = \max(\text{Drawdown Amount}_1, \dots, \text{Drawdown Amount}_n)$$
$$\text{Max Drawdown Percentage} = \max(\text{Drawdown Percentage}_1, \dots, \text{Drawdown Percentage}_n)$$

### 5. Streaks (Consecutive Wins & Losses)
- Iterates chronologically through closed trades.
- Tracks temporary winning streak $\text{streak}_{\text{win}}$ and losing streak $\text{streak}_{\text{loss}}$.
- `maxConsecutiveWins` stores highest recorded win streak.
- `maxConsecutiveLosses` stores highest recorded loss streak.
- `currentStreak` is signed: positive for active win streak (e.g. `+4`), negative for active loss streak (e.g. `-3`).

---

## 7. Currency Conversion Engine

### Code Location:
[`packages/financial-engine/src/currency.ts:25-65`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/currency.ts#L25-L65)

- If `fromCurrency === toCurrency`: returns original amount with `exchangeRate: 1`, `isAvailable: true`.
- If currencies differ and explicit exchange rate is missing or $\le 0$: returns `isAvailable: false`.
- **Architectural Policy:** SetupMint **never assumes a 1:1 conversion** between different currencies silently.

---

## 8. Reporting Boundaries & Financial Year

- SetupMint formats all calendar dates as ISO strings (`YYYY-MM-DD`).
- In Indian financial markets, the official Financial Year (FY) spans **April 1 through March 31**.
- When filtering dates for annual performance audits (e.g., FY 2024–25), the start date boundary is `2024-04-01` and the end date boundary is `2025-03-31`.

---

## 9. Mistake Detection, Daily Loss Breach & Discipline Scoring

### Code Location:
[`packages/financial-engine/src/mistakes.ts:24-190`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/mistakes.ts#L24-L190)

All behavioral detection and session synthesis operate deterministically using Decimal.js without external heuristics or telemetry:

### 1. Revenge Trading Detection
A trade $T_{\text{target}}$ is flagged as potential `revenge_trading` if:
1. An earlier closed trade $T_{\text{prior}}$ exists on the same account within a lookback window $\Delta t \le \text{revengeTradingMinutes}$ (default 30 minutes) prior to $T_{\text{target}}$ entry:
   $$0 < \text{entryTime}(T_{\text{target}}) - \text{exitTime}(T_{\text{prior}}) \le \Delta t_{\text{window}}$$
2. The prior trade was a realized loss:
   $$\text{Net P&L}(T_{\text{prior}}) < 0$$
3. The target trade position size is greater than or equal to the prior trade:
   $$Q(T_{\text{target}}) \ge Q(T_{\text{prior}})$$

### 2. Overtrading Detection
A trade $T_{\text{target}}$ is flagged as potential `overtrading` if either condition holds:
- **Daily Volume Cap:** Total trades executed on the calendar day of $T_{\text{target}}$ exceeds the user's configured daily trade limit:
  $$N_{\text{trades}}(\text{date}) > \text{maxDailyTrades}$$
- **Simultaneous Open Positions:** The number of concurrently active (open) positions at the time of entry exceeds the maximum open position limit:
  $$N_{\text{open\_at\_entry}} > \text{maxOpenTrades}$$

### 3. Sizing Violation Detection
A trade $T_{\text{target}}$ is flagged as `position_sizing` violation if:
- Account equity $E > 0$ and the planned risk percentage exceeds the user's risk guardrail $\text{maxRiskPerTradePercent}$:
  $$\text{Risk \%} = \frac{\text{Planned Risk Amount}}{E} \times 100 > \text{maxRiskPerTradePercent}$$

### 4. Daily Loss Breach Detection
Computes cumulative net realized loss across all closed trades for a given calendar day:
$$\text{Net Loss}_{\text{day}} = -\sum_{i=1}^{N_{\text{closed}}} \min(0, \text{Net P&L}_i) - \sum_{i=1}^{N_{\text{closed}}} \max(0, \text{Net P&L}_i) = -\sum_{i=1}^{N_{\text{closed}}} \text{Net P&L}_i$$
If $\sum \text{Net P&L}_i \le -\text{maxDailyLoss}$, the day is flagged with `isBreached: true` along with breach amount:
$$\text{Breach Amount} = \max(0, |\sum \text{Net P&L}_i| - \text{maxDailyLoss})$$

### 5. Rule-Based Discipline Rating
Daily journal discipline ratings (1 to 5 stars) are computed automatically based on objective rule violations:
- Start at baseline: **5 / 5**
- Subtract **2 points** if Daily Loss limit is breached.
- Subtract **1 point** if revenge trading was detected.
- Subtract **1 point** if daily trade limit was exceeded (overtrading).
- Subtract **1 point** if position sizing violation occurred.
- Clamp score between **1** and **5**:
  $$\text{Discipline Score} = \max(1, \min(5, 5 - \text{Penalties}))$$

---

## 10. Edge Validation Engine (`edge.ts`)

### Code Location:
[`packages/financial-engine/src/edge.ts:1-614`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/edge.ts#L1-L614)

### Numerical Foundations:
1. **Lanczos Log-Gamma Approximation**:
   Computes $\ln \Gamma(z)$ for $z > 0$ with 9 coefficients yielding $> 14$ decimal digits of precision:
   $$\Gamma(z+1) = \sqrt{2\pi} \left(z + g + \frac{1}{2}\right)^{z+1/2} e^{-(z+g+1/2)} A_g(z)$$
   With reflection formula $\Gamma(z)\Gamma(1-z) = \frac{\pi}{\sin(\pi z)}$ for $z < 0.5$.
2. **Regularized Incomplete Beta Function $I_x(a, b)$**:
   Evaluates Beta CDF via modified Lentz continued fraction expansion:
   $$I_x(a, b) = \frac{x^a (1-x)^b}{a \, B(a, b)} \cdot \cfrac{1}{1 + \cfrac{d_1}{1 + \cfrac{d_2}{1 + \dots}}}$$
   With symmetry transformation $I_x(a, b) = 1 - I_{1-x}(b, a)$ when $x > \frac{a+1}{a+b+2}$ to guarantee rapid numerical convergence ($< 200$ iterations).
3. **Beta Quantile Inversion**:
   Solves $I_x(a, b) = p$ using bracketed Newton-Raphson iterations with derivative $f(x) = \frac{x^{a-1} (1-x)^{b-1}}{B(a, b)}$ and guaranteed bisection safeguarding.

### Bayesian Win-Rate Estimation:
- **Prior**: Non-informative uniform $\text{Beta}(1, 1)$.
- **Posterior**: $\text{Beta}(1 + N_{\text{win}}, 1 + N_{\text{loss}})$.
- **Breakeven Trade Treatment**: Breakeven trades ($R = 0$ or $\text{Net P&L} = 0$) are tracked explicitly and excluded from decisive binary parameter updates.
- **Estimated Breakeven Win Rate**: $\theta_{\text{BE}} = \frac{\bar{L}}{\bar{W} + \bar{L}}$ where $\bar{W}$ is average win P&L and $\bar{L}$ is average loss magnitude.

### Non-Parametric Bootstrap Expectancy in R:
- Resamples $N$ realized R-multiples $10,000$ times with replacement.
- Deterministic 32-bit FNV-1a seeded Mulberry32 PRNG.
- Returns observed expectancy $\bar{R}$, 90% percentile bootstrap interval $[E_{0.05}, E_{0.95}]$, and $P(E > 0)$.

### Edge Verdict Rules:
- **`UNPROVEN`**: If $N < 30$, or interval crosses zero ($E_{0.05} \le 0 \le E_{0.95}$), or evidence is inconclusive.
- **`LIKELY_EDGE`**: If $N \ge 30$, $E_{0.05} > 0$, and $P(E > 0) \ge 0.90$.
- **`NO_EDGE_NEGATIVE`**: If $N \ge 30$, $E_{0.95} < 0$, and $P(E > 0) \le 0.10$.

---

## 11. Empirical-Bayes Shrinkage for Ranking (`templates.ts`)

### Code Location:
[`packages/financial-engine/src/templates.ts:31-150`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/templates.ts#L31-L150)

$$\text{Shrunk Expectancy} = \frac{n \cdot \bar{R} + k \cdot \mu_{\text{global}}}{n + k}$$
- $n$: Template sample size.
- $\bar{R}$: Observed template mean expectancy in R.
- $k$: Shrinkage strength (default: 10).
- $\mu_{\text{global}}$: Compatible population prior mean (default: 0.0).

---

## 12. Monte Carlo Risk Simulation & Capped Fractional Kelly (`monte-carlo.ts`)

### Code Location:
[`packages/financial-engine/src/monte-carlo.ts:1-409`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/monte-carlo.ts#L1-L409)

- Simulates $10,000$ equity paths by bootstrap sampling historical R-multiples.
- Baseline peak equity is initialized to $E_0$.
- Computes drawdown percentiles ($P_{50}, P_{90}, P_{95}, P_{99}, \max$), ruin probability, threshold breach probability, and daily loss breach probability.
- **Quarter-Kelly Formula**:
  $$f^* = p - \frac{1 - p}{b}, \quad \text{Quarter-Kelly} = \min(0.25 \times f^* \times 100, \text{maxRiskPerTradePercent})$$
  Suppressed when edge is `UNPROVEN` or `NO_EDGE_NEGATIVE`.

---

## 13. Continuous Tilt Scoring Engine (`tilt.ts`)

### Code Location:
[`packages/financial-engine/src/tilt.ts:1-220`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/tilt.ts#L1-L220)

$$\text{Tilt Score} = 0.30 S_{\text{streak}} + 0.25 S_{\text{size}} + 0.25 S_{\text{time}} + 0.20 S_{\text{daily\_loss}}$$
- All components normalized to $[0, 100]$.
- Categorized as `CALM` ($0-30$), `ELEVATED` ($31-60$), `HIGH_TILT` ($61-80$), `SEVERE_TILT` ($81-100$).
- Advisory and non-blocking in `TradeFormModal`.

---

## 14. Excursion Analytics & Execution Quality (`excursion.ts`)

### Code Location:
[`packages/financial-engine/src/excursion.ts:1-260`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/excursion.ts)

Excursion analytics evaluate the quality of trade execution and trade management by measuring the maximum adverse price move (heat endured) and maximum favorable price move (potential unrealized peak) using FYERS 1-minute historical candlestick data strictly within the trade's active lifecycle ($T_{\text{entry}}$ to $T_{\text{exit}}$). All calculations use `Decimal.js` with 30 digits of precision and banker's rounding (`ROUND_HALF_UP`), with `moment` powering strict time handling.

### Mathematical Formulas:

#### Maximum Favorable Excursion (MFE) Points:
$$\text{Long MFE Points} = \max(0, \max_{i}(H_i) - P_{\text{entry}})$$

$$\text{Short MFE Points} = \max(0, P_{\text{entry}} - \min_{i}(L_i))$$

#### Maximum Adverse Excursion (MAE) Points:
$$\text{Long MAE Points} = \max(0, P_{\text{entry}} - \min_{i}(L_i))$$

$$\text{Short MAE Points} = \max(0, \max_{i}(H_i) - P_{\text{entry}})$$

Where $H_i, L_i$ represent the high and low of the $i$-th candlestick whose timestamp range overlaps $[T_{\text{entry}}, T_{\text{exit}}]$.

#### Monetary Excursions:
$$\text{MFE Amount} = \text{MFE Points} \times Q \times M$$

$$\text{MAE Amount} = \text{MAE Points} \times Q \times M$$

#### Risk-Normalized Excursions (R-Multiple):
$$\text{MFE (R)} = \frac{\text{MFE Points}}{\text{Stop Distance Points}} \quad \text{or} \quad \frac{\text{MFE Amount}}{\text{Planned Risk Amount}}$$

$$\text{MAE (R)} = \frac{\text{MAE Points}}{\text{Stop Distance Points}} \quad \text{or} \quad \frac{\text{MAE Amount}}{\text{Planned Risk Amount}}$$

#### Exit Efficiency:
Measures what portion of the trade's maximum unrealized profit was captured at exit. Scratch trades with zero favorable movement return `null` (N/A) to prevent artificially flattering performance at 100%:

$$\text{Exit Efficiency} = \begin{cases} 
\text{null (N/A)} & \text{if } \text{MFE Points} = 0 \text{ and } P_{\text{exit}} = P_{\text{entry}} \\
0.0 & \text{if } \text{MFE Points} = 0 \text{ and } P_{\text{exit}} \ne P_{\text{entry}} \\
0.0 & \text{if } \text{Realized Favorable Points} \le 0 \\
\min\left(1.0, \max\left(0.0, \frac{\text{Realized Favorable Points}}{\text{MFE Points}}\right)\right) & \text{if } \text{MFE Points} > 0
\end{cases}$$

Where $\text{Realized Favorable Points} = (P_{\text{exit}} - P_{\text{entry}})$ for LONG, and $(P_{\text{entry}} - P_{\text{exit}})$ for SHORT.

#### Stop Efficiency:
Quantifies how effectively the initial stop loss absorbed adverse excursion without excessive buffer:

$$\text{Stop Efficiency} = \begin{cases}
\max\left(0.0, 1.0 - \frac{\text{MAE Points}}{\text{Stop Distance Points}}\right) & \text{if } \text{Stop Distance} > 0 \\
\text{null (N/A)} & \text{otherwise}
\end{cases}$$

#### R Left on the Table:
Measures the uncaptured peak favorable potential surrendered to the market:

$$\text{R Left on Table} = \max(0, \text{MFE (R)} - \text{Realized (R)})$$

#### Entry Quality Score (Early Follow-Through):
Measures early order flow alignment and immediate follow-through across the first $N$ candles (default 5 candles):

$$\text{Entry Quality Score} = \begin{cases}
\frac{\text{Early MFE Points}}{\text{Early MFE Points} + \text{Early MAE Points}} & \text{if } (\text{Early MFE} + \text{Early MAE}) > 0 \\
0.5 & \text{otherwise (balanced/flat)}
\end{cases}$$

#### Excursion Ordering (`timeOrdering`):
Determines whether adverse heat preceded favorable expansion:
- `HEAT_FIRST`: Peak adverse excursion occurred prior to peak favorable excursion ($t_{\text{MAE}} < t_{\text{MFE}}$).
- `RUN_FIRST`: Position ran in favor immediately before experiencing adverse pullback ($t_{\text{MFE}} < t_{\text{MAE}}$).
- `SIMULTANEOUS`: Both occurred within the same candle window.

#### Stop Hit & Precise Reversal Detection:
- **Stop Hit:** Evaluates whether any candle's adverse extreme penetrated the initial stop loss level:
  - Long: $L_i \le P_{\text{stop}}$
  - Short: $H_i \ge P_{\text{stop}}$
- **Reversed After Stop Hit (`reversedAfterStopHit`):** Detected if after stop penetration, market price reversed back into profit target territory ($+1.0\text{R}$) without breaching beyond a structural buffer ($0.75\text{R}$ beyond stop) within a 30-candle lookahead window.

#### Diagnostic Excursion Flags:
- **`GAVE_BACK_PROFIT`:** Trade achieved substantial favorable run ($\text{MFE} \ge 1.0\text{R}$ or $\ge 1\%$ of entry price) but surrendered $> 50\%$ of peak profit before closing. (Exempts planned runners or trades with active trailing stops).
- **`STOP_TOO_TIGHT_EVIDENCE`:** Initial stop was triggered, but subsequent market action reversed into target territory ($+1.0\text{R}$) without structural invalidation beyond the buffer.
- **`EXITED_EARLY`:** Trade exited with $< 50\%$ exit efficiency despite achieving $> 1.5\text{R}$ MFE.
- **`HELD_INTO_REVERSAL`:** Trade experienced deep adverse run ($\text{MAE} > 1.2\text{R}$) without disciplined stop execution.
- **`ENTRY_OUTSIDE_CANDLE`:** Fill price fell outside the entry candle high/low range, signaling execution slippage or bad provider fills.
- **`EXIT_OUTSIDE_CANDLE`:** Fill price fell outside the exit candle high/low range.
- **`LOW_RESOLUTION`:** Historical lookback exceeded 1-minute window, falling back to 5-minute resolution candles.

---

## 15. Stop-Loss Modification & Trail Tracking (`stop-move.ts`)

### Code Location:
[`packages/financial-engine/src/stop-move.ts:1-205`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/stop-move.ts)

Stop-move tracking monitors modifications to stop-loss orders throughout the trade lifecycle to verify trade management discipline. It differentiates between disciplined favorable trailing (moving stop closer to price or into profit) and undisciplined risk widening (moving stop further away to avoid being stopped out).

All calculations are evaluated with `Decimal.js` (30 digits of precision) and chronological order sorting via `moment`.

### Mathematical Definitions:

Given a sequence of stop modifications $S_1, S_2, \dots, S_n$ with timestamps $T_1 \le T_2 \le \dots \le T_n$, starting from initial stop $S_0$:

#### Long Position:
$$\text{Move Type}_k = \begin{cases}
\text{TRAILED\_FAVORABLY} & \text{if } S_k > S_{k-1} \\
\text{WIDENED\_RISK} & \text{if } S_k < S_{k-1} \\
\text{UNCHANGED} & \text{if } S_k = S_{k-1}
\end{cases}$$

$$\Delta \text{Points}_k = |S_k - S_{k-1}|$$

$$\Delta \text{Percent}_k = \frac{\Delta \text{Points}_k}{S_{k-1}} \times 100$$

$$\text{Net Risk Change Points} = S_0 - S_n$$

- A **positive** net risk change means the stop was moved downward below the initial level, increasing capital at risk.
- A **negative** net risk change means the stop was trailed upward above the initial level, locking in profit or reducing risk.

#### Short Position:
$$\text{Move Type}_k = \begin{cases}
\text{TRAILED\_FAVORABLY} & \text{if } S_k < S_{k-1} \\
\text{WIDENED\_RISK} & \text{if } S_k > S_{k-1} \\
\text{UNCHANGED} & \text{if } S_k = S_{k-1}
\end{cases}$$

$$\Delta \text{Points}_k = |S_k - S_{k-1}|$$

$$\Delta \text{Percent}_k = \frac{\Delta \text{Points}_k}{S_{k-1}} \times 100$$

$$\text{Net Risk Change Points} = S_n - S_0$$

- A **positive** net risk change means the stop was moved upward above the initial level, increasing upside capital risk.
- A **negative** net risk change means the stop was trailed downward below the initial level, locking in profit or reducing risk.

#### Discipline Violation Trigger (`STOP_MOVED`):
$$\text{hasWidenedRisk} = \text{widenedCount} > 0$$

When $\text{hasWidenedRisk} = \text{true}$:
1. The trade receives the `STOP_MOVED` mistake suggestion with `CRITICAL` severity in `detectMistakeSuggestions()`.
2. The trade document automatically updates `trade.psychology.stopLossMoved = true`.
3. If not already tagged, `'STOP_MOVED'` is appended to `trade.psychology.mistakes`.
4. A system audit log entry (`action: 'STOP_MOVED_DETECTED'`) is recorded with the net point expansion.

---

## 11. What-If Stop/Target Candle-Replay Simulator

### 11.1 Purpose and Statistically Honest Design Principles
The Stop/Target "What-If" simulator answers: *"If I had systematically applied a stop at $S$ and/or a target at $T$ on top of what I actually did, what would my results have been?"*

Unlike naive simulators that rely on stored `maeR` or `mfeR` (which destroys path information and assumes perfect execution), TradeVault uses a **true candle-replay engine** executing against cached 1-minute (or 5-minute) OHLCV candles.

#### Mandatory Design Principles:
1. **Zero Hindsight / Lookahead:** The simulation strictly operates on intraday candles within the observed trade lifecycle window $[e, x]$. Candles prior to entry or following actual exit are never replayed.
2. **Deterministic Pessimistic & Optimistic Brackets:** Because bar-level OHLC does not preserve tick ordering, any ambiguous candle (touching both stop and target) is evaluated under both a conservative **Pessimistic** policy (Stop hit first; trade-through required for target) and an **Optimistic** policy (Target hit first; touch accepted).
3. **Apples-to-Apples Baseline:** Every cell's baseline metrics are calculated strictly on that cell's evaluable subset ($N_{eval}$). Trades excluded or censored for a cell are also excluded from that cell's comparison baseline.
4. **Gap-Aware Fill Mechanics:** If a candle opens beyond a stop level (adverse gap), the fill price is set to the opening price minus adverse slippage ticks, accurately reproducing real-world market stop execution.
5. **Multiple Comparisons Mitigation:** Scanning 49 cells inflates false-positive discovery. A cell is only awarded the **BETTER_ROBUST** verdict if its Pessimistic lower bootstrap bound exceeds 0, $n_{eval} \ge 30$, and its performance confirms out-of-sample in the 30% chronological holdout.

---

### 11.2 Trade Eligibility & Exclusion Rules
To participate in candle-replay simulation, a trade must satisfy:
1. `status === 'CLOSED'`.
2. **Single-Fill Execution:** Either `executionMode === 'SIMPLE'` or `executionMode === 'ADVANCED'` with exactly 1 entry fill and 1 exit fill (1E1X). Multi-fill scaled executions are excluded under `EXCLUDED_MULTI_FILL`.
3. **Valid Initial Stop:** Must have `risk.initialStopLoss > 0` on the correct side of entry (`LONG`: stop < entry; `SHORT`: stop > entry) and positive unit risk. Otherwise excluded under `EXCLUDED_NO_STOP`.
4. **Cached Snapshot:** Must have cached `TradeCandleSnapshot` overlapping $[entryTime, exitTime]$ in resolution `'1'` or `'5'`. Otherwise excluded under `EXCLUDED_NO_CANDLES`.
5. **No Synthetic Proxies:** Snapshots flagged `isUnderlyingFallback === true` are rejected under `EXCLUDED_UNDERLYING_FALLBACK` when options demand true contract candles.
6. **Managed Stops:** If `excludeManagedStopTrades === true`, any trade with recorded trailing or widening stop moves is excluded under `EXCLUDED_MANAGED_STOP`.

---

### 11.3 Mathematical Formulas & Execution Logic

#### 1. Price Level Calculation:
$$\text{Unit Risk} = |\text{Entry Price} - \text{Initial Stop Loss}|$$

$$\text{LONG Stop Level} = \text{roundToTick}(\text{Entry} - \text{stopR} \times \text{Unit Risk}, \text{tickSize})$$
$$\text{LONG Target Level} = \text{roundToTick}(\text{Entry} + \text{targetR} \times \text{Unit Risk}, \text{tickSize})$$

$$\text{SHORT Stop Level} = \text{roundToTick}(\text{Entry} + \text{stopR} \times \text{Unit Risk}, \text{tickSize})$$
$$\text{SHORT Target Level} = \text{roundToTick}(\text{Entry} - \text{targetR} \times \text{Unit Risk}, \text{tickSize})$$

#### 2. Gap-Aware Adverse Fills & Slippage:
On any candle $i > e$:
$$\text{Stop Fill (LONG)} = \min(\text{Stop Level}, \text{Open}_i) - (\text{slippageTicks} \times \text{tickSize})$$
$$\text{Stop Fill (SHORT)} = \max(\text{Stop Level}, \text{Open}_i) + (\text{slippageTicks} \times \text{tickSize})$$
$$\text{Target Fill (LONG)} = \max(\text{Target Level}, \text{Open}_i)$$
$$\text{Target Fill (SHORT)} = \min(\text{Target Level}, \text{Open}_i)$$

#### 3. Right-Censoring Detection:
If neither simulated level is breached through candle $x$, we inspect the actual exit reason:
- If actual trade exited at or beyond the original stop, and the simulated cell tests a looser stop ($\text{stopR} > 1.0$ or $\text{stopR} = \text{null}$), the trade is **RIGHT-CENSORED**.
- If actual trade exited at planned target, and the simulated cell tests a farther target ($\text{targetR} > \text{plannedTargetR}$), the trade is **RIGHT-CENSORED**.
- Censored trades are marked `status: 'CENSORED'` and excluded from $N_{eval}$.

#### 4. Precomputation & First-Passage Optimization:
For each eligible trade, first-passage indices are precomputed across all unique stop and target price levels:
$$\text{Precomputation Time} = O((S + T) \times C)$$
$$\text{Cell Evaluation Time} = O(1)$$
For a 7×7 grid (49 cells), this reduces candle iterations from $49 \times C$ to $(7 + 7) \times C = 14 \times C$, providing a 3.5× computational acceleration.

#### 5. Paired Differences & 10,000 Bootstrap Confidence Intervals:
For every evaluable trade $i \in [1, N_{eval}]$:
$$d_i = R_{sim, i} - R_{actual, i}$$
$$\bar{d} = \frac{1}{N_{eval}} \sum_{i=1}^{N_{eval}} d_i$$

A deterministic PRNG (`Mulberry32PRNG`) seeded by `hash(scopeKey, stopR, targetR, policy)` resamples 10,000 bootstrap means. The 5th and 95th percentiles yield the empirical 90% confidence interval $[\text{ciLow}, \text{ciHigh}]$.

#### 6. Statistical Verdicts:
- **BETTER_ROBUST:** Pessimistic lower bound $> 0$ and $N_{eval} \ge 30$.
- **WORSE_ROBUST:** Optimistic upper bound $< 0$ and $N_{eval} \ge 30$.
- **INCONCLUSIVE:** Confidence interval spans zero or $N_{eval} < 30$.

#### 7. Chronological Out-of-Sample Holdout Split:
The oldest 70% of eligible trades form the In-Sample set; the newest 30% form the Holdout set. A rule **holdsOutOfSample** only if:
$$\text{verdict}_{InSample} == \text{BETTER\_ROBUST} \quad \text{and} \quad \bar{d}_{Holdout} > 0 \quad \text{and} \quad n_{Holdout} \ge 10$$

#### 8. Identity Calibration Gate:
Trades that exited at the original stop are replayed with $\text{stopR} = 1.0$ and no target. The match rate must equal or exceed $\text{CALIBRATION\_MIN\_AGREEMENT}$ (90%):
$$\text{Agreement} = \frac{\text{Matching Stop Hits}}{\text{Tested Real Stop Outs}} \ge 0.90$$
If below 90%, `calibrationWarning: true` is emitted, warning that candle timestamp alignment or data continuity requires review.

---

## 12. Multi-Panel Performance Equity Curves & Universal Drilldown Metrics

### 12.1 High-Water Mark, Drawdown, and Recovery Duration
**Code Location:** [`packages/financial-engine/src/drawdown.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/drawdown.ts)

Equity curves maintain full 30-digit Decimal.js precision for drawdown tracking across chronological trade executions:

#### 1. High-Water Mark and Drawdown Curves:
$$H_0 = E_0, \quad H_i = \max(H_{i-1}, E_i)$$
$$\text{DD}_i = H_i - E_i \quad (\text{Drawdown in base currency})$$
$$\text{DD\%}_i = \begin{cases} \frac{\text{DD}_i}{H_i} \times 100 & \text{if } H_i > 0 \\ 0 & \text{otherwise} \end{cases}$$

#### 2. Recovery Duration (Longest Underwater Period):
A drawdown episode begins when equity drops below the peak $H_{peak}$ and ends when equity reaches or exceeds $H_{peak}$.
- **Recovery Duration in Trades:**
  $$T_{trades} = i_{recovered} - i_{peak}$$
- **Recovery Duration in Calendar Days:**
  $$T_{days} = \left\lfloor \frac{t_{recovered} - t_{peak}}{86,400,000} \right\rfloor$$
- **Ongoing Drawdown Handling:** If the final trade remains underwater (current equity $< H_{max}$), the ongoing period from peak to the latest trade is measured and compared against completed episodes to ensure the true maximum recovery duration is reported.

---

### 12.2 Cumulative-R Curves & Exclusions
**Code Location:** [`packages/financial-engine/src/cumulative-r.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/cumulative-r.ts)

To evaluate strategy edge independent of varying position size or monetary sizing distortions:
$$R_i = \text{realizedRMultiple}_i$$
$$CR_k = \sum_{i=1}^k R_i$$

#### Filtering and Exclusions:
Trades lacking a valid initial stop loss or unit risk produce `realizedRMultiple = null`. These trades are excluded from the R-curve to prevent artificial skew, matching the exclusion standard of [`packages/financial-engine/src/edge.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/edge.ts).
$$\text{R-Coverage \%} = \frac{N_{\text{valid } R}}{N_{\text{total}}} \times 100$$
When coverage is below 100%, an informational indicator informs the trader of the exact sample coverage.

---

### 12.3 Monte Carlo Expectancy Cone
**Code Location:** [`packages/financial-engine/src/monte-carlo.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/monte-carlo.ts)

Projects statistical forward dispersion cones over $S \in \{50, 100, 200\}$ future trades based on historical realized R-multiples:

#### 1. Eligibility Gate:
- Historical sample size $N \ge 30$.
- Edge verdict from `evaluateEdge()` must not be `'NO_EDGE'` or `'INSUFFICIENT_DATA'`. If ineligible, the cone is omitted with an informative status.

#### 2. Resampling & Mulberry32 PRNG:
Generates $M = 1,000$ simulation runs using a deterministic 32-bit PRNG (`Mulberry32`) seeded from historical sample attributes:
$$Y_{m, s} = \sum_{j=1}^s R^*_{m, j} \quad \text{where } R^*_{m, j} \sim \text{Uniform}(\{R_1, \dots, R_N\})$$

#### 3. Per-Step Percentile Bands:
At each forward trade step $s \in [1, S]$, the 1,000 simulated values are sorted to extract exact percentiles:
- **P95:** 95th percentile (optimistic trajectory)
- **P75:** 75th percentile (upper quartile)
- **P50:** 50th percentile (median expectancy path)
- **P25:** 25th percentile (lower quartile)
- **P5:** 5th percentile (pessimistic adverse variance boundary)

---

### 12.4 Aggregate Reconciliation Engine
**Code Location:** [`packages/financial-engine/src/reconciliation.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/reconciliation.ts)

Used by the Universal Drill-Down System (`POST /api/v1/trades/drilldown`) to guarantee zero floating-point discrepancies between chart aggregate figures and underlying trade rows:

$$\text{sumNetPnL} = \sum_{i=1}^N \text{netPnL}_i$$
$$\text{avgNetPnL} = \frac{\text{sumNetPnL}}{N}$$
$$\text{sumRealizedR} = \sum_{j=1}^{N_R} R_j$$
$$\text{avgRealizedR} = \frac{\text{sumRealizedR}}{N_R}$$
$$\text{winRatePercent} = \frac{N_{win}}{N} \times 100$$
All calculations use 30-digit Decimal arithmetic, ensuring complete mathematical consistency between drilldown summary cards and individual trade rows.

---

### 12.5 Opening Equity & High-Water Mark for Mid-History Date Ranges
**Code Location:** [`apps/api/src/routes/dashboard.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/dashboard.routes.ts)

When a trader filters by a date range whose start date $t_{\text{start}}$ begins mid-history (e.g. 7D, 30D, or a custom slice), initializing starting equity from zero or from the raw account opening balance $B_0$ causes severe mathematical distortions:
- The equity curve would appear artificially depressed or detached from the trader's actual portfolio value.
- Peak equity would be falsified, distorting subsequent peak-to-trough drawdown percentages.

#### Mid-History Opening Equity Formula:
SetupMint computes the exact opening equity $E_{\text{opening}}$ at $t_{\text{start}}$ by summing initial balance plus all closed trade net realized P&L and net cash flows settled strictly prior to $t_{\text{start}}$:

$$E_{\text{opening}} = B_0 + \sum_{\substack{k \in \text{Trades} \\ \text{tradeDate}_k < \text{startUtc}}} \text{netPnL}_k + \sum_{\substack{j \in \text{Deposits} \\ \text{date}_j < \text{startUtc}}} A_j - \sum_{\substack{m \in \text{Withdrawals} \\ \text{date}_m < \text{startUtc}}} A_m + \sum_{\substack{p \in \text{Adjustments} \\ \text{date}_p < \text{startUtc}}} A_p$$

Where:
- $B_0$: Account initial opening balance (`initialBalance`).
- $\text{startUtc}$: The inclusive IST session opening boundary (`YYYY-MM-DD 00:00:00.000 IST`, converted to UTC: previous calendar day at `18:30:00.000Z`).
- All calculations are performed with 30-digit `Decimal.js` precision.

#### Cumulative Curve in Range:
Within the filtered date range $[t_{\text{start}}, t_{\text{end}}]$, each chronological trade $i \in [1, N]$ updates portfolio equity:
$$E_i = E_{\text{opening}} + \sum_{r=1}^i \text{netPnL}_r$$
The high-water mark begins at $H_0 = E_{\text{opening}}$ and tracks peak equity:
$$H_i = \max(H_{i-1}, E_i)$$
$$\text{Drawdown}_i = H_i - E_i$$

---

## 13. Date Range Normalization & Indian Financial Year Calculations

### Code Location:
[`packages/shared/src/date-range.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/date-range.ts)

### 13.1 Inclusive IST Session Date Normalization
Indian financial markets operate under Indian Standard Time ($\text{IST} = \text{UTC} + 05:30$). In order to avoid date-shifting anomalies across UTC servers and browsers, all date range boundaries are normalized from string format (`YYYY-MM-DD`) into inclusive UTC timestamps anchored to the IST trading session:

$$\text{startUtc}(YYYY\text{-}MM\text{-}DD) = \text{Date.UTC}(YYYY, MM-1, DD, 0, 0, 0, 0) - (5.5 \times 3,600,000) \text{ ms}$$
$$\text{endUtc}(YYYY\text{-}MM\text{-}DD) = \text{Date.UTC}(YYYY, MM-1, DD, 23, 59, 59, 999) - (5.5 \times 3,600,000) \text{ ms}$$

- A trade executed at `09:15:00 IST` on the start date falls strictly within $[\text{startUtc}, \text{endUtc}]$.
- A trade executed at `23:59:59 IST` (e.g., MCX commodity session) on the end date is inclusive.
- A trade executed at `00:00:00 IST` the next calendar day is excluded.

### 13.2 Indian Financial Year (FY) Presets
The Indian fiscal calendar runs from **April 1** to **March 31**. For any given reference timestamp with year $Y$ and month $M \in [1, 12]$:

$$\text{FY Start Year} = \begin{cases} Y & \text{if } M \ge 4 \text{ (April through December)} \\ Y - 1 & \text{if } M < 4 \text{ (January through March)} \end{cases}$$
$$\text{FY End Year} = \text{FY Start Year} + 1$$

#### Preset Resolutions:
- **`THIS_FY`:**
  - $\text{startDate} = (\text{FY Start Year})\text{-04-01}$
  - $\text{endDate} = \min((\text{FY End Year})\text{-03-31}, \text{today})$
  *(Clipped to today so active reports do not span future dates).*
- **`LAST_FY`:**
  - $\text{startDate} = (\text{FY Start Year} - 1)\text{-04-01}$
  - $\text{endDate} = (\text{FY Start Year})\text{-03-31}$
- **`THIS_QUARTER`:** Indian market quarter boundaries:
  - Q1: April 1 – June 30
  - Q2: July 1 – September 30
  - Q3: October 1 – December 31
  - Q4: January 1 – March 31
  *(Clipped to today if current quarter).*
- **`THIS_WEEK`:** Monday of the current week to today (ISO-8601 standard week start).
- **`LAST_WEEK`:** Monday to Sunday of the preceding week.
- **`THIS_MONTH`:** 1st calendar day of current month to today.
- **`LAST_MONTH`:** 1st to last calendar day of preceding month (accounting for leap years).

---

## 14. Weekly Review Aggregation & Focus Rule Engine

### Code Location:
[`packages/financial-engine/src/weekly-review.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/weekly-review.ts)

### 14.1 ISO-8601 Week Boundaries in Indian Standard Time (IST)
Weeks are defined per ISO-8601 (Monday start, Sunday end) anchored to IST ($\text{UTC}+05:30$):
$$\text{isoWeekToRange}(YYYY\text{-W}ww) \implies \{\text{startDate: } YYYY\text{-}MM\text{-}DD \text{ (Monday)}, \text{endDate: } YYYY\text{-}MM\text{-}DD \text{ (Sunday)}\}$$
- Supports year boundary transitions (e.g. `2026-W53` ends on Sunday 2027-01-03, while `2027-W01` begins on Monday 2027-01-04).
- Fully supports leap years (e.g. `2024-W09` containing 2024-02-29).
- Database queries use `buildDateRangeClause(startDate, endDate)` returning inclusive IST timestamps $[\text{startUtc}, \text{endUtc}]$.

### 14.2 Summary Metrics & Authoritative Reconciliation
The week's trade summary is computed by passing all closed trades in the week through `computeTradeAggregates`:
$$\text{Net P&L} = \sum_{t \in \text{Trades}} t.\text{netPnL}$$
$$\text{Gross P&L} = \sum_{t \in \text{Trades}} t.\text{grossPnL}$$
$$\text{Total Costs} = \sum_{t \in \text{Trades}} t.\text{totalCosts}$$
$$\text{Win Rate} = \frac{n_{\text{win}}}{n_{\text{closed}}} \times 100$$
$$\text{Profit Factor} = \begin{cases} 999.99 & \text{if } |\sum \text{Losses}| = 0 \text{ and } \sum \text{Wins} > 0 \\ 0.00 & \text{if } \sum \text{Wins} = 0 \\ \frac{\sum \text{Gross Wins}}{|\sum \text{Gross Losses}|} & \text{otherwise} \end{cases}$$
$$\text{Expectancy} = \frac{\text{Net P&L}}{n_{\text{closed}}}$$
$$\text{Avg Realized R} = \begin{cases} \frac{\sum R}{n_{R}} & \text{if } n_{R} > 0 \\ 0.00 & \text{otherwise} \end{cases}$$
$$\text{R Coverage \%} = \frac{n_{R}}{n_{\text{closed}}} \times 100$$
Using `computeTradeAggregates` guarantees that every paisa and percentage matches `/dashboard/stats` and `/trades/drilldown` for the same date range down to 30 digits of Decimal.js precision.

### 14.3 Setup Ranking via Empirical-Bayes Shrunk Expectancy
To prevent ranking setups with tiny sample sizes (e.g., 1 trade with ₹10,000 profit) ahead of consistently proven setups with 50 trades, SetupMint applies an Empirical-Bayes shrinkage estimator ($k = 10$):
$$E_{\text{shrunk}} = \frac{n}{n + k} \bar{X} + \frac{k}{n + k} \mu_{\text{prior}}$$
Where:
- $n$: Number of closed trades executed with the template/strategy.
- $\bar{X}$: Sample mean Net P&L per trade ($\frac{\text{Net P&L}}{n}$).
- $\mu_{\text{prior}}$: Baseline population mean expectancy across all closed trades for the week ($\frac{\text{Week Net P&L}}{n_{\text{week}}}$).
- $k = 10$: Shrinkage strength parameter.
- When $n < 30$, a `sampleSizeWarning: true` flag is attached to remind the trader that the sample size is preliminary.

### 14.4 Quantified Behavioural Mistake Costs
For each tagged mistake (e.g., `REVENGE_TRADING`, `STOP_MOVED`, `OVERTRADING`), the engine calculates:
$$\text{Total Loss}(\text{tag}) = \sum_{t \in \text{Trades with tag, } t.\text{netPnL} < 0} |t.\text{netPnL}|$$
Mistakes are ranked in descending order of total ₹ loss. The engine surfaces `topMistake` (highest eroded capital) and the top 3 mistakes, each with an array of trade IDs for universal drilldown inspection.

### 14.5 Objective Focus Rule Suggestion Priority
Focus rule generation is **strictly rule-based and deterministic (zero AI/LLM hallucinations)**. The engine evaluates conditions in strict priority order:
1. **Daily Loss Breach:** If `riskEvents.dailyLossBreaches.length > 0`:
   - Code: `'MAX_DAILY_LOSS'`
   - Text: `"Stop trading for the day after hitting max daily loss"`
   - Metric: `{"type": "DAILY_LOSS_BREACH", "target": 0}`
2. **Quantified Mistake Leak:** If `mistakes.topMistake && mistakes.topMistake.totalLoss > 0`:
   - Mapped from static table keyed by mistake tag (e.g. `REVENGE_TRADING` $\implies$ `"Wait at least 30 minutes and step away from charts after a losing trade"`).
   - Code: `'MISTAKE_' + tag`
   - Metric: `{"type": "MISTAKE_COUNT", "tag": tag, "target": 0}`
3. **Bleeding Setup:** If `worstTemplate` has $n \ge 10$ and $E_{\text{shrunk}} < 0$:
   - Code: `'PAUSE_TEMPLATE'`
   - Text: `"Pause <template.name> until reviewed"`
   - Metric: `{"type": "PAUSE_SETUP", "name": template.name, "target": 0}`
4. **Repeat Success:** Otherwise:
   - Code: `'REPEAT_SUCCESS'`
   - Text: `"Repeat what worked: <bestTemplate.name>"`
   - Metric: `{"type": "SETUP_DISCIPLINE", "name": bestTemplate.name}`

### 14.6 Automated Focus Rule Adherence Evaluation
In the subsequent week, `evaluateFocusRule(prevFocusRule, thisWeekTrades)` checks adherence:
- **`MISTAKE_COUNT`:** Counts occurrences of the target mistake tag in the new week's trades. If `actual === 0`, `followed: true`; else `followed: false`.
- **`DAILY_LOSS_BREACH`:** Measures if any calendar day's loss exceeded `maxDailyLoss`.
- **`CUSTOM` / Unmeasurable:** Returns `followed: null` and allows the user to manually toggle adherence override via the UI.

---

## 15. Multi-Target Scaling Ladder Engine

### Code Location:
[`packages/financial-engine/src/live-watcher.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/live-watcher.ts) (`calculateTargetLadder`)

### 15.1 Initial Risk Points Determination
The unit of initial risk in points ($\Delta P_{\text{risk}}$) is derived using pure Decimal.js:
$$\Delta P_{\text{risk}} = \begin{cases} |P_{\text{entry}} - P_{\text{stopLoss}}| & \text{if stopLoss is defined} \\ \frac{\text{initialRiskAmount}}{Q \times M} & \text{if initialRiskAmount is defined} \\ 0 & \text{otherwise} \end{cases}$$

If $\Delta P_{\text{risk}} = 0$ or $Q \le 0$, the scaling ladder is safely omitted (`undefined`).

### 15.2 Ladder Step Matrix & Quantity Splitting
The engine configures a 3-tier scaling ladder:
1. **Target 1 (T1: +1.0R):**
   $$P_{T1} = \begin{cases} P_{\text{entry}} + \Delta P_{\text{risk}} & \text{if LONG} \\ P_{\text{entry}} - \Delta P_{\text{risk}} & \text{if SHORT} \end{cases}$$
   - **Planned Exit Ratio:** $50\%$ ($\text{exitQty} = \lfloor Q \times 0.5 \rfloor$ or at least 1 lot).
   - **Suggested Trailing Stop:** Breakeven lock ($P_{\text{entry}}$).
2. **Target 2 (T2: +2.0R):**
   $$P_{T2} = \begin{cases} P_{\text{entry}} + 2 \times \Delta P_{\text{risk}} & \text{if LONG} \\ P_{\text{entry}} - 2 \times \Delta P_{\text{risk}} & \text{if SHORT} \end{cases}$$
   - **Planned Exit Ratio:** $33\%$ of remaining position ($\text{exitQty} = \max(1, \lfloor (Q - Q_{T1}) \times 0.5 \rfloor)$).
   - **Suggested Trailing Stop:** Trail to $+1.0R$ price level ($P_{T1}$).
3. **Target 3 / Runner (T3: +3.0R or Planned Target):**
   $$P_{T3} = \begin{cases} P_{\text{plannedTarget}} & \text{if plannedTarget is defined} \\ P_{\text{entry}} \pm 3 \times \Delta P_{\text{risk}} & \text{otherwise} \end{cases}$$
   - **Planned Exit Ratio:** $100\%$ of runner position ($Q_{\text{runner}} = Q - Q_{T1} - Q_{T2}$).
   - **Suggested Trailing Stop:** Trail behind recent swing structure or $+2.0R$ price ($P_{T2}$).

### 15.3 Step Status & Progress Percentage
For each step $i \in \{1, 2, 3\}$, real-time distance and progress are calculated:
$$\text{Distance Points} = \begin{cases} P_{Ti} - \text{LTP} & \text{if LONG} \\ \text{LTP} - P_{Ti} & \text{if SHORT} \end{cases}$$
$$\text{Progress \%} = \min\left(100, \max\left(0, \frac{\text{Favorable Run Points}}{\text{Step Target Points}} \times 100\right)\right)$$
$$\text{Status} = \begin{cases} \text{'MET'} & \text{if favorable price reached or exceeded } P_{Ti} \\ \text{'IN\_PROGRESS'} & \text{if Progress \%} > 0 \\ \text{'PENDING'} & \text{otherwise} \end{cases}$$
Actionable flag `isActionable = true` is raised when the step is `MET`, enabling 1-click execution.

---

## 16. Live Profit Giveback Meter & Threat Radar

### Code Location:
[`packages/financial-engine/src/live-watcher.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/live-watcher.ts) (`calculateLiveGiveback`)

### 16.1 Peak Floating MTM Tracking
Monitors the peak favorable profit observed while the trade has been open:
$$\text{Peak Floating Net P&L} = \max(\text{Current Net MTM}, \text{Previous Peak MFE Net MTM})$$
$$\text{Peak Unrealized R} = \max(\text{Current Unrealized R}, \text{Previous Peak Unrealized R})$$
$$\text{Peak LTP} = \begin{cases} \max(\text{Current LTP}, \text{Previous Peak LTP}) & \text{if LONG} \\ \min(\text{Current LTP}, \text{Previous Peak LTP}) & \text{if SHORT} \end{cases}$$

### 16.2 Giveback & Retention Math
$$\text{Giveback Amount (₹)} = \max(0, \text{Peak Floating Net P&L} - \text{Current Net MTM})$$
$$\text{Giveback \%} = \begin{cases} \min\left(100, \max\left(0, \frac{\text{Giveback Amount}}{\text{Peak Floating Net P&L}} \times 100\right)\right) & \text{if Peak Floating Net P&L} > 0 \\ 0 & \text{otherwise} \end{cases}$$
$$\text{Retention \%} = 100\% - \text{Giveback \%}$$

### 16.3 Threat Level State Machine
The engine classifies the live threat state to warn traders before open profits evaporate:
- **`CRITICAL_REVERSAL`:** Reached $\text{Peak } R \ge 1.0$ but current unrealized $R \le 0.2$. Immediate capital protection alert.
- **`LEAKING`:** Reached $\text{Peak } R \ge 1.0$ and $\text{Giveback \%} \ge 35\%$. Actionable profit booking warning.
- **`WATCH`:** Reached $\text{Peak } R \ge 0.8$ and $\text{Giveback \%} \ge 20\%$. Normal pullback monitoring.
- **`SAFE`:** All other conditions.

---

## 17. MFE Reach Funnel & Round-Trip Loss Quantifier

### Code Location:
[`packages/financial-engine/src/excursion-analytics.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/excursion-analytics.ts) (`calculateExcursionAggregates`)

### 17.1 Milestone Reach & Conversion Rates
For each threshold $R_{\text{thresh}} \in \{0.5, 1.0, 1.5, 2.0, 2.5, 3.0\}$:
$$\text{Reached Trades} = \{t \in \text{Trades} \mid \text{MFE } R_t \ge R_{\text{thresh}}\}$$
$$\text{Reach \%} = \frac{|\text{Reached Trades}|}{N_{\text{total evaluated}}} \times 100$$
$$\text{Win Conversion \%} = \begin{cases} \frac{|\{t \in \text{Reached Trades} \mid t.\text{netPnL} > 0\}|}{|\text{Reached Trades}|} \times 100 & \text{if } |\text{Reached Trades}| > 0 \\ 0 & \text{otherwise} \end{cases}$$

### 17.2 Round-Trip Loss Prevention Metrics
Evaluates trades that achieved $\text{MFE } R \ge 1.0$ but ultimately closed as losses ($t.\text{netPnL} < 0$):
$$\text{Round-Trip Loss Rate \%} = \frac{|\text{Round-Trip Losses}|}{|\text{Trades Reaching } \ge +1.0R|} \times 100$$
$$\text{Total Surrendered } R = \sum_{t \in \text{Round-Trip Losses}} \max(0, \text{MFE } R_t - \text{Realized } R_t)$$
$$\text{Total Surrendered Amount (₹)} = \sum_{t \in \text{Round-Trip Losses}} \max(0, \text{MFE Amount}_t - t.\text{netPnL})$$

---

## 18. Stop-Loss Modification & Initial Risk Budget Anchoring

### Code Location:
[`apps/api/src/routes/trade.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/trade.routes.ts), [`apps/api/src/services/live-watcher.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/live-watcher.service.ts)

### 18.1 Invariant: Initial Stop Loss Anchoring
When a trader trails their stop loss (via 1-click breakeven lock, scaling ladder execution, or broker SL adjustment):
1. `risk.initialStopLoss` is **strictly preserved** as the original stop loss established at entry.
2. `risk.currentStopLoss` is updated to the newly adjusted stop price.
3. `risk.plannedRiskAmount` remains fixed at $|P_{\text{entry}} - P_{\text{initialStopLoss}}| \times Q \times M$.
4. **Denominator Invariance:** Realized and unrealized R-multiples are always divided by the initial risk budget:
   $$R = \frac{\text{Net Realized or Floating P&L}}{\text{Initial Risk Budget (₹)}}$$
   *Trailing a stop loss to breakeven or into profit does NOT shrink the risk denominator to zero or artificially inflate R-multiples to infinity.*
5. A favorable trail event is appended to `trade.stopLossMoveEvents` with `moveType: 'TRAILED_FAVORABLY'` and recorded in `trade.auditLog`.





