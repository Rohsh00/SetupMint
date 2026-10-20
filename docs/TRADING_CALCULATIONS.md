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

