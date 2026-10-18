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
For each trade $i$ in chronological sequence:
$$\text{Cumulative Equity}_i = \text{Initial Balance} + \sum_{j=1}^i \text{Net P&L}_j$$
$$\text{Peak Equity}_i = \max(\text{Cumulative Equity}_1, \dots, \text{Cumulative Equity}_i)$$
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


