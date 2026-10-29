# TradeVault Complete Financial & Trading Glossary

> Authoritative, auto-generated documentation of all 42 domain concepts, metrics,
> simulation rules, and execution formulas used across TradeVault.
> Generated directly from `@tradevault/shared/help-content`.

---

## Table of Contents
- [1. What-If Stop/Target Simulation](#1-what-if-stop-target-simulation)
  - [What-If Historical Overlay](#what-if-historical-overlay)
  - [Pessimistic vs. Optimistic Policies](#pessimistic-vs-optimistic-policies)
  - [Ambiguous Trades](#ambiguous-trades)
  - [Right-Censored Trades](#right-censored-trades)
  - [Evaluable Trade Count (nEval)](#evaluable-trade-count-neval-)
  - [Out-of-Sample Holdout Verification](#out-of-sample-holdout-verification)
  - [Robust Statistical Verdict](#robust-statistical-verdict)
  - [Data-Quality Calibration Check](#data-quality-calibration-check)
  - [Fill Model (Gap-Aware vs. At-Level)](#fill-model-gap-aware-vs-at-level-)
  - [Slippage Ticks](#slippage-ticks)
  - [R (Stop-Distance Basis)](#r-stop-distance-basis-)
  - [Exclude Moved-Stop Trades](#exclude-moved-stop-trades)
  - [Simulation Exclusion Reasons](#simulation-exclusion-reasons)
  - [Multiple Comparisons Caution](#multiple-comparisons-caution)
- [2. Trading Metrics & Statistical Performance](#2-trading-metrics-statistical-performance)
  - [R-Multiple](#r-multiple)
  - [Planned Reward-to-Risk (R:R)](#planned-reward-to-risk-r-r-)
  - [Mathematical Expectancy (in R)](#mathematical-expectancy-in-r-)
  - [Profit Factor](#profit-factor)
  - [Win Rate & Credible Interval](#win-rate-credible-interval)
  - [Maximum Drawdown](#maximum-drawdown)
  - [Maximum Adverse Excursion (MAE)](#maximum-adverse-excursion-mae-)
  - [Maximum Favorable Excursion (MFE)](#maximum-favorable-excursion-mfe-)
  - [Exit Efficiency](#exit-efficiency)
  - [Excursion Analytical Flags](#excursion-analytical-flags)
  - [Gave Back Profit Rate](#gave-back-profit-rate)
  - [Post-Stop Reversals (Stop Too Tight)](#post-stop-reversals-stop-too-tight-)
  - [Sample Size Reliability](#sample-size-reliability)
- [3. Trade Execution, Lifecycle & Fees](#3-trade-execution-lifecycle-fees)
  - [Statutory Charges (Auto vs. Manual)](#statutory-charges-auto-vs-manual-)
  - [Execution Chart Candle Padding](#execution-chart-candle-padding)
  - [Stop-Loss Modification Audit](#stop-loss-modification-audit)
  - [Lots vs. Quantity (Shares/Units)](#lots-vs-quantity-shares-units-)
  - [Contract Multiplier](#contract-multiplier)
  - [Instrument Tick Size](#instrument-tick-size)
  - [Trading Session Codes](#trading-session-codes)
  - [FIFO Execution Matching](#fifo-execution-matching)
- [4. Accounts, Ledger & Balance Reconciliation](#4-accounts-ledger-balance-reconciliation)
  - [Authoritative Account Balance Formula](#authoritative-account-balance-formula)
  - [Reconcile Account Balance](#reconcile-account-balance)
  - [Broker Balance Drift Tolerance](#broker-balance-drift-tolerance)
  - [Pending Broker Adjustment](#pending-broker-adjustment)
  - [Archiving vs. Deleting Accounts](#archiving-vs-deleting-accounts)
- [5. Broker & CSV Import Mechanics](#5-broker-csv-import-mechanics)
  - [Undo CSV Import Batch](#undo-csv-import-batch)
  - [Column Mapping Presets](#column-mapping-presets)
- [6. Security, Provider Circuit Breakers & Risk Settings](#6-security-provider-circuit-breakers-risk-settings)
  - [Daily FYERS Token Expiry (06:30 IST)](#daily-fyers-token-expiry-06-30-ist-)
  - [Angel One SmartAPI Market Data Fallback](#angel-one-smartapi-market-data-fallback)
  - [Portfolio Risk Guardrails](#portfolio-risk-guardrails)
- [7. Instruments & Tick Specifications](#7-instruments-tick-specifications)
  - [Traded-Only Instrument Invariant](#traded-only-instrument-invariant)
  - [Cascade Specs to Historical Trades](#cascade-specs-to-historical-trades)
- [8. Playbook Strategy Edge Verification](#8-playbook-strategy-edge-verification)
  - [Statistical Edge Verdict](#statistical-edge-verdict)
  - [Parent/Child Invariant Check](#parent-child-invariant-check)
- [9. Psychology & Discipline Review](#9-psychology-discipline-review)
  - [Discipline Score & Penalties](#discipline-score-penalties)
- [10. Dashboard & Review Queue](#10-dashboard-review-queue)
  - [Trade Review Queue Criteria](#trade-review-queue-criteria)
- [Other Concepts](#other-concepts)
  - [MAE vs. MFE Scatter Matrix](#mae-vs-mfe-scatter-matrix)

---

## 1. What-If Stop/Target Simulation

### What-If Historical Overlay
*Registry Key:* `analytics.whatIf.overlay`

**Summary:** Tests hypothetical stops and targets on top of your actual trade duration using cached intraday candles.

**Detailed Explanation:** This is an overlay on what actually happened between your entry and exit. It tests whether an additional stop or target level would have hit first. It never extends holding time past your real exit.

> [!WARNING]
> **Caveat:** Not a predictive forecast. Assumes market liquidity was available at your simulated levels and does not model how you might have reacted differently.

**See Also:** `analytics.whatIf.policies`, `analytics.whatIf.censored`, `analytics.whatIf.multipleComparisons`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#11-overlay-semantics](docs/TRADING_CALCULATIONS.md#11-overlay-semantics)

---

### Pessimistic vs. Optimistic Policies
*Registry Key:* `analytics.whatIf.policies`

**Summary:** Accounts for unknown price order within candles. Pessimistic assumes worst sequence; Optimistic assumes best.

**Detailed Explanation:** Intraday candles only show High and Low, not the order prices occurred. If both stop and target fall inside the same candle, Pessimistic triggers the stop first while Optimistic triggers the target first.

```text
Formula: Outcome Range = [Pessimistic R, Optimistic R]
```

> [!WARNING]
> **Caveat:** When ambiguous trades exist, true performance lies within this range. If ambiguous trades count is zero, both policies yield identical results.

**See Also:** `analytics.whatIf.ambiguous`, `analytics.whatIf.overlay`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#18-resolution-of-order](docs/TRADING_CALCULATIONS.md#18-resolution-of-order)

---

### Ambiguous Trades
*Registry Key:* `analytics.whatIf.ambiguous`

**Summary:** Trades where candle data alone cannot determine whether your stop or target was touched first.

**Detailed Explanation:** Occurs when both hypothetical levels are reached inside the same candle bar, or during partial entry/exit candles where price action occurred before entry or after exit.

> **Example:** In a 5-minute candle with low 98 and high 104, a stop at 98.5 and target at 103.5 were both touched, but candle data cannot prove which hit first.

> [!WARNING]
> **Caveat:** A cell with zero ambiguous trades has exact execution order at candle resolution.

**See Also:** `analytics.whatIf.policies`, `analytics.whatIf.evaluable`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#18-resolution-of-order](docs/TRADING_CALCULATIONS.md#18-resolution-of-order)

---

### Right-Censored Trades
*Registry Key:* `analytics.whatIf.censored`

**Summary:** Trades excluded from a cell because their real exit stopped the test before a looser level could be observed.

**Detailed Explanation:** If your real trade exited at your initial stop loss, testing a looser stop (e.g. 1.5R) requires prices after your actual exit. Because we do not observe post-exit prices, the trade is censored to avoid survivorship bias.

> [!WARNING]
> **Caveat:** Censored trades are excluded from that specific cell to keep statistics honest. Evaluated count (nEval) varies by cell.

**See Also:** `analytics.whatIf.evaluable`, `analytics.whatIf.rUnitBasis`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#110-right-censoring](docs/TRADING_CALCULATIONS.md#110-right-censoring)

---

### Evaluable Trade Count (nEval)
*Registry Key:* `analytics.whatIf.evaluable`

**Summary:** Number of trades that could be conclusively simulated for this stop and target grid cell.

**Detailed Explanation:** Equals eligible trades minus right-censored trades for that specific cell. Statistics like win rate and mean R are calculated strictly on these evaluable trades.

```text
Formula: nEval = nEligible - nCensored
```

> [!WARNING]
> **Caveat:** Cells with nEval < 30 are statistically fragile and shown with muted opacity.

**See Also:** `analytics.whatIf.censored`, `analytics.whatIf.verdicts`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#110-right-censoring](docs/TRADING_CALCULATIONS.md#110-right-censoring)

---

### Out-of-Sample Holdout Verification
*Registry Key:* `analytics.whatIf.holdout`

**Summary:** Chronologically splits trades into In-Sample (first 70%) and Holdout (last 30%) to prevent curve-fitting.

**Detailed Explanation:** A rule that works well on historical trades often fails in live markets. To guard against this, we test the same stop/target level on the recent holdout window.

> [!WARNING]
> **Caveat:** A cell holds out-of-sample only if the holdout verdict agrees in direction with in-sample and has at least 15 evaluable trades.

**See Also:** `analytics.whatIf.verdicts`, `analytics.whatIf.multipleComparisons`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#111-holdout-validation](docs/TRADING_CALCULATIONS.md#111-holdout-validation)

---

### Robust Statistical Verdict
*Registry Key:* `analytics.whatIf.verdicts`

**Summary:** Labels whether a stop/target grid cell meaningfully improves performance over your actual trading baseline.

**Detailed Explanation:** Uses 10,000 paired bootstrap resamples (90% confidence interval of paired differences d = R_sim - R_actual). BETTER_ROBUST requires pessimistic lower bound > 0 and nEval >= 30. WORSE_ROBUST requires optimistic upper bound < 0.

> [!WARNING]
> **Caveat:** INCONCLUSIVE means the data does not conclusively prove whether this rule helps or hurts, or sample size is below 30.

**See Also:** `analytics.whatIf.holdout`, `analytics.whatIf.evaluable`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#19-paired-difference-and-verdict](docs/TRADING_CALCULATIONS.md#19-paired-difference-and-verdict)

---

### Data-Quality Calibration Check
*Registry Key:* `analytics.whatIf.calibration`

**Summary:** Validates that replaying your actual initial stop reproduces your real stop hits with high fidelity.

**Detailed Explanation:** Replays trades that exited at or beyond their initial stop with stopR=1.0 and no target. Agreement measures the share of trades matching the real stop hit.

> [!WARNING]
> **Caveat:** If agreement falls below 90%, a warning banner is shown, indicating candle timestamp alignment or snapshot gaps.

**See Also:** `analytics.whatIf.overlay`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#112-calibration-gate](docs/TRADING_CALCULATIONS.md#112-calibration-gate)

---

### Fill Model (Gap-Aware vs. At-Level)
*Registry Key:* `analytics.whatIf.fillModel`

**Summary:** Determines whether prices that gap past your stop or target fill at the opening price or the level price.

**Detailed Explanation:** In GAP_AWARE mode, if a candle opens beyond your stop, your exit fills at that worse open price, replicating market orders. In AT_LEVEL mode, fills are assumed at the exact level price.

> [!WARNING]
> **Caveat:** Gap-aware is the realistic default for market stops in fast-moving or overnight sessions.

**See Also:** `analytics.whatIf.slippage`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#17-gap-aware-fills](docs/TRADING_CALCULATIONS.md#17-gap-aware-fills)

---

### Slippage Ticks
*Registry Key:* `analytics.whatIf.slippage`

**Summary:** Adverse price ticks added to stop executions to simulate order book friction and execution delay.

**Detailed Explanation:** For LONG trades, stop fill price decreases by slippage * tickSize. For SHORT trades, stop fill price increases. Target limit orders do not receive adverse slippage.

> **Example:** For NIFTY with tick size 0.05, 2 ticks of slippage adds ₹0.10 adverse price penalty on stop execution.

**See Also:** `analytics.whatIf.fillModel`, `trade.form.tickSize`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#17-gap-aware-fills](docs/TRADING_CALCULATIONS.md#17-gap-aware-fills)

---

### R (Stop-Distance Basis)
*Registry Key:* `analytics.whatIf.rUnitBasis`

**Summary:** The standard R unit used across What-If, defined as initial stop distance in price points times quantity.

**Detailed Explanation:** Unit risk equals |entryPrice - initialStopLoss|. One R equals unitRisk * quantity * multiplier. This isolates price geometry from portfolio cash budget sizing.

```text
Formula: 1 R = |Entry - Initial Stop| * Quantity * Multiplier
```

> [!WARNING]
> **Caveat:** May differ from stored realizedRMultiple if your account cash risk budget differed from stop distance at entry.

**See Also:** `metric.rMultiple`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#12-r-unit-basis](docs/TRADING_CALCULATIONS.md#12-r-unit-basis)

---

### Exclude Moved-Stop Trades
*Registry Key:* `analytics.whatIf.excludeManagedStops`

**Summary:** Excludes trades where you manually trailed or widened your stop loss during the trade.

**Detailed Explanation:** When a stop was moved during trade management, the real trade followed a dynamic path that a static overlay cannot replicate. Excluding them keeps the simulation clean.

> [!WARNING]
> **Caveat:** Enabled by default. Disabling this includes managed trades but may overestimate rule impact.

**See Also:** `trade.stopMoves.audit`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#14-eligibility](docs/TRADING_CALCULATIONS.md#14-eligibility)

---

### Simulation Exclusion Reasons
*Registry Key:* `analytics.whatIf.exclusions`

**Summary:** Why certain closed trades cannot be accurately evaluated by the candle-replay engine.

**Detailed Explanation:** Exclusions: MULTI_FILL (scale-ins or partial exits), NO_STOP (no valid initial stop loss entered), NO_CANDLES (no cached snapshot), UNDERLYING_FALLBACK (options using spot proxy), MANAGED_STOP (stop was modified).

> [!WARNING]
> **Caveat:** Check the data-quality card to see which trades were excluded and how to include more trades.

**See Also:** `analytics.whatIf.evaluable`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#14-eligibility](docs/TRADING_CALCULATIONS.md#14-eligibility)

---

### Multiple Comparisons Caution
*Registry Key:* `analytics.whatIf.multipleComparisons`

**Summary:** Testing many stop and target combinations increases the chance of finding high returns purely by luck.

**Detailed Explanation:** When testing a grid of 50+ combinations, a few cells will appear profitable by chance alone. Prefer broad clusters of positive cells that hold out-of-sample over an isolated peak.

> [!WARNING]
> **Caveat:** Do not pick an isolated high cell. Seek stable plateaus.

**See Also:** `analytics.whatIf.holdout`, `analytics.whatIf.verdicts`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#113-multiple-comparisons](docs/TRADING_CALCULATIONS.md#113-multiple-comparisons)

---

## 2. Trading Metrics & Statistical Performance

### R-Multiple
*Registry Key:* `metric.rMultiple`

**Summary:** Net profit or loss expressed as a multiple of initial risk taken.

**Detailed Explanation:** Normalizes trades across different instruments, position sizes, and account balances by measuring return relative to initial risk.

```text
Formula: R-Multiple = Net P&L / Initial Risk Amount
```

> **Example:** Risking ₹1,000 to make ₹2,500 net profit produces an R-multiple of +2.50R.

> [!WARNING]
> **Caveat:** Requires a valid stop loss and planned risk amount at entry.

**See Also:** `analytics.whatIf.rUnitBasis`, `metric.expectancy`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#r-multiple](docs/TRADING_CALCULATIONS.md#r-multiple)

---

### Planned Reward-to-Risk (R:R)
*Registry Key:* `metric.plannedRR`

**Summary:** The ratio of planned target distance to initial stop loss distance at trade entry.

**Detailed Explanation:** Calculated before trade entry to ensure setups meet minimum strategy criteria before executing.

```text
Formula: Planned R:R = |Target - Entry| / |Entry - Stop Loss|
```

> **Example:** Buying at ₹100 with stop at ₹95 (5 pts risk) and target at ₹115 (15 pts reward) gives a 3.00 R:R.

> [!WARNING]
> **Caveat:** Measures planned intent, not actual realized outcome.

**See Also:** `metric.rMultiple`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#reward-to-risk](docs/TRADING_CALCULATIONS.md#reward-to-risk)

---

### Mathematical Expectancy (in R)
*Registry Key:* `metric.expectancy`

**Summary:** The average amount of R you expect to win or lose on every trade over a large sample.

**Detailed Explanation:** Combines win rate, average win size, and average loss size into a single expected value per trade.

```text
Formula: Expectancy = (Win Rate * Avg Win R) - (Loss Rate * Avg Loss R)
```

> **Example:** With 50% win rate, 2R average win, and 1R average loss, Expectancy = (0.50 * 2) - (0.50 * 1) = +0.50R.

> [!WARNING]
> **Caveat:** Unreliable with small samples. Requires at least 30 closed trades for statistical validity.

**See Also:** `metric.profitFactor`, `metric.winRateCredible`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#expectancy](docs/TRADING_CALCULATIONS.md#expectancy)

---

### Profit Factor
*Registry Key:* `metric.profitFactor`

**Summary:** Gross winning profits divided by absolute gross losing amounts.

**Detailed Explanation:** Measures strategy efficiency. A profit factor above 1.50 represents a solid edge; above 2.00 is exceptional.

```text
Formula: Profit Factor = Gross Profits / Gross Losses
```

> **Example:** ₹1,50,000 in gross wins divided by ₹75,000 in gross losses yields a Profit Factor of 2.00.

> [!WARNING]
> **Caveat:** If there are zero losses in the scope, Profit Factor is capped at 999.99 by convention to avoid division by zero.

**See Also:** `metric.expectancy`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#profit-factor](docs/TRADING_CALCULATIONS.md#profit-factor)

---

### Win Rate & Credible Interval
*Registry Key:* `metric.winRateCredible`

**Summary:** Percentage of winning trades alongside Bayesian credible bounds based on sample size.

**Detailed Explanation:** Raw win rate can be deceptive on small samples (e.g. 4 wins out of 5 trades is 80%, but carries wide uncertainty). The credible interval reveals the true statistical range.

```text
Formula: Win Rate % = (Winning Trades / Total Closed Trades) * 100
```

> **Example:** 45 wins out of 75 closed trades yields a 60.0% win rate.

> [!WARNING]
> **Caveat:** Sample size directly narrows the interval. Do not judge strategies on fewer than 30 trades.

**See Also:** `metric.sampleReliability`, `strategy.edgeVerdict`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#win-rate-intervals](docs/TRADING_CALCULATIONS.md#win-rate-intervals)

---

### Maximum Drawdown
*Registry Key:* `metric.drawdown`

**Summary:** The largest peak-to-trough decline in portfolio equity before a new peak is reached.

**Detailed Explanation:** Measures capital vulnerability and emotional stress. Displayed both in base currency (₹) and percentage of peak equity.

```text
Formula: Drawdown % = (Peak Equity - Trough Equity) / Peak Equity * 100
```

> [!WARNING]
> **Caveat:** Drawdown is path-dependent and may worsen before recovering.

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#drawdown](docs/TRADING_CALCULATIONS.md#drawdown)

---

### Maximum Adverse Excursion (MAE)
*Registry Key:* `metric.mae`

**Summary:** The deepest unrealized loss or adverse price dip experienced while the trade was open.

**Detailed Explanation:** Shows how close price came to hitting your stop loss. Consistently low MAE on winners indicates precise entries; high MAE suggests entering too early.

```text
Formula: MAE (LONG) = Entry Price - Lowest Low; MAE (SHORT) = Highest High - Entry Price
```

> **Example:** Buying at ₹500, dipping to ₹492 before rising to target ₹520 has an MAE of 8 points.

**See Also:** `metric.mfe`, `metric.exitEfficiency`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#mae-mfe](docs/TRADING_CALCULATIONS.md#mae-mfe)

---

### Maximum Favorable Excursion (MFE)
*Registry Key:* `metric.mfe`

**Summary:** The peak unrealized profit or maximum favorable price reach before the trade exited.

**Detailed Explanation:** Shows the maximum potential the trade offered. Comparing realized exit price against MFE highlights whether you captured the move or left money on the table.

```text
Formula: MFE (LONG) = Highest High - Entry Price; MFE (SHORT) = Entry Price - Lowest Low
```

> **Example:** Shorting at ₹200, dropping to ₹180 before exiting has an MFE of 20 points.

**See Also:** `metric.mae`, `metric.exitEfficiency`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#mae-mfe](docs/TRADING_CALCULATIONS.md#mae-mfe)

---

### Exit Efficiency
*Registry Key:* `metric.exitEfficiency`

**Summary:** Percentage of the maximum favorable price move (MFE) captured at your actual exit.

**Detailed Explanation:** Measures how well you timed your exit relative to the best available price during the trade.

```text
Formula: Exit Efficiency = (Exit Price - Entry Price) / (Peak MFE Price - Entry Price) * 100
```

> **Example:** Capturing 30 points of profit on a trade whose peak favorable move reached 40 points gives 75% efficiency.

> [!WARNING]
> **Caveat:** Trades with zero MFE (no favorable move) return N/A (not applicable), avoiding artificial 100% inflation on flat trades. Trades with favorable runs ending in losses return 0%.

**See Also:** `metric.mfe`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#exit-efficiency](docs/TRADING_CALCULATIONS.md#exit-efficiency)

---

### Excursion Analytical Flags
*Registry Key:* `metric.excursionFlags`

**Summary:** Automated behavioural tags identifying execution patterns from candle excursion data.

**Detailed Explanation:** Flags: GAVE_BACK_PROFIT (hit >=1.0R MFE but surrendered >50% peak gain), EXITED_EARLY (closed before full move while price ran >2x realized), STOP_TOO_TIGHT_EVIDENCE (stopped out before price reversed to +1R target territory without deep breach).

**See Also:** `metric.mae`, `metric.mfe`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#excursion-flags](docs/TRADING_CALCULATIONS.md#excursion-flags)

---

### Gave Back Profit Rate
*Registry Key:* `metric.gaveBackProfit`

**Summary:** Percentage of evaluated trades that achieved significant favorable excursion (>=1.0R peak run) but surrendered >50% of profits before closing.

**Detailed Explanation:** Highlights premature profit giveback and trailing stop inefficiencies. Planned runners and trailing stops that exit according to rule are excluded from false penalties.

```text
Formula: Gave Back Profit % = (Count of Trades with GAVE_BACK_PROFIT Flag / Total Evaluated Trades) * 100
```

> **Example:** A trade reaching +2.5R peak unrealized gain that reverses and closes at +0.2R triggers the gave-back profit metric.

**See Also:** `metric.mfe`, `metric.exitEfficiency`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#mae-mfe](docs/TRADING_CALCULATIONS.md#mae-mfe)

---

### Post-Stop Reversals (Stop Too Tight)
*Registry Key:* `metric.postStopReversals`

**Summary:** Percentage of stopped-out trades where market price reversed and subsequently reached original profit targets.

**Detailed Explanation:** Pinpoints stop-hunting or placing stop losses inside standard market noise / volatility bands. If high (>20%), consider widening stops to structural swing levels or ATR multiples.

```text
Formula: Reversal After Stop % = (Count of Stopped Trades Reversing to Target / Total Trades with Stops) * 100
```

> **Example:** Buying NIFTY at 22,000 with SL at 21,980. Price dips to 21,975, stops you out, then rallies to 22,100.

**See Also:** `metric.mae`, `analytics.whatIf.calibration`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#mae-mfe](docs/TRADING_CALCULATIONS.md#mae-mfe)

---

### Sample Size Reliability
*Registry Key:* `metric.sampleReliability`

**Summary:** Statistical confidence indicator based on the number of completed trades.

**Detailed Explanation:** Samples below 10 trades are labeled INSUFFICIENT; between 10 and 29 are LOW; and 30+ are statistically RELIABLE.

> [!WARNING]
> **Caveat:** Never adjust strategy rules based on fewer than 30 trade samples.

**See Also:** `strategy.edgeVerdict`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#sample-size-rules](docs/TRADING_CALCULATIONS.md#sample-size-rules)

---

## 3. Trade Execution, Lifecycle & Fees

### Statutory Charges (Auto vs. Manual)
*Registry Key:* `trade.fees.autoManual`

**Summary:** Indicates whether brokerage, STT/CTT, exchange turnover, SEBI, and GST were calculated automatically.

**Detailed Explanation:** AUTO fees use official SEBI/Exchange rate formulas for your asset class and broker flat rate (default ₹20/leg). MANUAL mode preserves user-entered or contract note charges.

> [!WARNING]
> **Caveat:** Click "Reset to auto" to recalculate exact statutory charges from the regulatory schedule.

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#statutory-charges](docs/TRADING_CALCULATIONS.md#statutory-charges)

---

### Execution Chart Candle Padding
*Registry Key:* `trade.chartGen.padding`

**Summary:** Number of historical candles displayed before trade entry and after trade exit (default 45, max 200).

**Detailed Explanation:** Allows visual inspection of pre-entry market structure and post-exit follow-through across up to 5 concurrent timeframes.

> [!WARNING]
> **Caveat:** Large padding values on older trades may be clamped if broker history limits are reached.

**Documentation Reference:** [docs/FILE_STORAGE_AND_ATTACHMENTS.md#automated-chart-generation](docs/FILE_STORAGE_AND_ATTACHMENTS.md#automated-chart-generation)

---

### Stop-Loss Modification Audit
*Registry Key:* `trade.stopMoves.audit`

**Summary:** Tracks whether manual stop-loss adjustments reduced risk (trailed) or increased risk (widened).

**Detailed Explanation:** Trailing stops favorably locks in profit or lowers risk. Widening stops violates discipline by increasing potential loss beyond the initial plan.

> [!WARNING]
> **Caveat:** Widening risk penalizes your trade discipline score.

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#stop-loss-moves](docs/TRADING_CALCULATIONS.md#stop-loss-moves)

---

### Lots vs. Quantity (Shares/Units)
*Registry Key:* `trade.form.lotVsQty`

**Summary:** Quantity is the total number of traded shares or units, which equals lots multiplied by market lot size.

**Detailed Explanation:** For Indian F&O contracts, entering lot count automatically computes total quantity based on the instrument specification.

> **Example:** For NIFTY (lot size 25), 2 lots = 50 total quantity.

**See Also:** `trade.form.multiplier`

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#instruments](docs/DATABASE_SCHEMA.md#instruments)

---

### Contract Multiplier
*Registry Key:* `trade.form.multiplier`

**Summary:** Point value multiplier applied to price differences when calculating gross derivative P&L.

**Detailed Explanation:** For standard equities and futures this is 1.0. For select commodity or currency contracts, it scales tick values.

```text
Formula: Gross P&L = (Exit Price - Entry Price) * Quantity * Multiplier
```

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#gross-pnl](docs/TRADING_CALCULATIONS.md#gross-pnl)

---

### Instrument Tick Size
*Registry Key:* `trade.form.tickSize`

**Summary:** The minimum allowable price fluctuation for orders on the exchange.

**Detailed Explanation:** For NSE equities and index derivatives, standard tick size is ₹0.05. Stops, targets, and simulated executions round to this increment.

**See Also:** `analytics.whatIf.slippage`

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#instruments](docs/DATABASE_SCHEMA.md#instruments)

---

### Trading Session Codes
*Registry Key:* `trade.form.sessionCodes`

**Summary:** Classifies trade timing into market market segments: NSE_REGULAR, MCX_EVENING, or OFF_HOURS.

**Detailed Explanation:** NSE_REGULAR covers 09:15 to 15:30 IST. MCX_EVENING covers commodity trading up to 23:30/23:55 IST. Enables session-based edge breakdown.

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#trading-sessions](docs/TRADING_CALCULATIONS.md#trading-sessions)

---

### FIFO Execution Matching
*Registry Key:* `trade.form.fifo`

**Summary:** Matches multiple buy and sell fills on a First-In-First-Out basis to compute realized P&L.

**Detailed Explanation:** When scaling into positions or exiting in parts, earlier entries are matched against earlier exits to compute tax-accurate cost basis and net profit.

> [!WARNING]
> **Caveat:** Exiting more quantity than entered triggers an excess-exit validation error.

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#fifo-execution](docs/TRADING_CALCULATIONS.md#fifo-execution)

---

## 4. Accounts, Ledger & Balance Reconciliation

### Authoritative Account Balance Formula
*Registry Key:* `account.balanceFormula`

**Summary:** Current balance is computed from initial capital, closed trade net profits, deposits, withdrawals, and adjustments.

**Detailed Explanation:** Direct manual edits to account balances are disabled to preserve double-entry audit integrity. Balance is always recomputed from underlying records.

```text
Formula: Current = Initial Balance + Sum(Closed Trade Net P&L) + Deposits - Withdrawals + Adjustments
```

> **Example:** Starting with ₹1,00,000, adding ₹25,000 net profits and withdrawing ₹10,000 results in ₹1,15,000 current balance.

> [!WARNING]
> **Caveat:** Direct manual balance edits are prohibited; record explicit transactions or adjustments instead.

**See Also:** `account.reconcile`, `account.pendingAdjustment`

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#account-balance-invariants](docs/DATABASE_SCHEMA.md#account-balance-invariants)

---

### Reconcile Account Balance
*Registry Key:* `account.reconcile`

**Summary:** Recalculates the ledger balance directly from all closed trades, cash transfers, and adjustments.

**Detailed Explanation:** Ensures account balance exactly equals the mathematical sum of its parts. Safe to run at any time.

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#account-balance-invariants](docs/DATABASE_SCHEMA.md#account-balance-invariants)

---

### Broker Balance Drift Tolerance
*Registry Key:* `account.driftTolerance`

**Summary:** Discrepancy threshold between your journal balance and broker live cash balance that triggers an adjustment.

**Detailed Explanation:** Minor intraday drift often arises from unbilled taxes or pending settlements. Drifts exceeding ₹1.00 suggest a review adjustment.

**See Also:** `account.pendingAdjustment`

**Documentation Reference:** [docs/FYERS_INTEGRATION.md#funds-synchronization](docs/FYERS_INTEGRATION.md#funds-synchronization)

---

### Pending Broker Adjustment
*Registry Key:* `account.pendingAdjustment`

**Summary:** Suggested adjustment to synchronize journal cash with verified broker funds.

**Detailed Explanation:** Confirming logs an audit-tracked cash adjustment to align balances. Rejecting dismisses the suggestion without altering account ledger history.

**See Also:** `account.driftTolerance`, `account.balanceFormula`

**Documentation Reference:** [docs/FYERS_INTEGRATION.md#funds-synchronization](docs/FYERS_INTEGRATION.md#funds-synchronization)

---

### Archiving vs. Deleting Accounts
*Registry Key:* `account.archiveVsDelete`

**Summary:** Accounts with historical trade records are archived rather than deleted to protect trading history.

**Detailed Explanation:** Deleting an account with trades archives it (status: ARCHIVED). This hides it from daily dropdowns while preserving tax, analytics, and P&L history.

> [!WARNING]
> **Caveat:** Only accounts with zero linked trades can be permanently deleted.

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#trading-accounts](docs/DATABASE_SCHEMA.md#trading-accounts)

---

## 5. Broker & CSV Import Mechanics

### Undo CSV Import Batch
*Registry Key:* `import.undoBatch`

**Summary:** Atomically rolls back an entire CSV tradebook import batch and deletes imported records.

**Detailed Explanation:** Removes all trades created in that import session and recalculates account balances in a single transaction. Previews exact count before deletion.

> [!WARNING]
> **Caveat:** Irreversible action. Any edits made to imported trades since import will be removed.

**Documentation Reference:** [docs/API_REFERENCE.md#import-undo](docs/API_REFERENCE.md#import-undo)

---

### Column Mapping Presets
*Registry Key:* `import.columnMapping`

**Summary:** Remembers which CSV header corresponds to symbol, price, quantity, date, and order type.

**Detailed Explanation:** SetupMint auto-detects Zerodha, FYERS, Angel One, and Upstox formats. Custom spreadsheets can save mapping presets for one-click future imports.

**Documentation Reference:** [docs/API_REFERENCE.md#csv-import](docs/API_REFERENCE.md#csv-import)

---

## 6. Security, Provider Circuit Breakers & Risk Settings

### Daily FYERS Token Expiry (06:30 IST)
*Registry Key:* `settings.fyersExpiry`

**Summary:** Indian broker security mandates that API access tokens expire daily at 06:30 AM IST.

**Detailed Explanation:** Log in once each morning via Settings or the top navigation bar to refresh your session for automated tradebook sync and live market data.

**Documentation Reference:** [docs/FYERS_INTEGRATION.md#daily-session-lifecycle](docs/FYERS_INTEGRATION.md#daily-session-lifecycle)

---

### Angel One SmartAPI Market Data Fallback
*Registry Key:* `settings.angelOneFallback`

**Summary:** Secondary historical candle provider used when FYERS history is unavailable or unauthenticated.

**Detailed Explanation:** SmartAPI is strictly market-data-only; zero trading capabilities or order execution permissions are used. Governed by a daily API request budget.

**Documentation Reference:** [docs/AI_CONTEXT.md#market-data-fallback-chain](docs/AI_CONTEXT.md#market-data-fallback-chain)

---

### Portfolio Risk Guardrails
*Registry Key:* `settings.riskGuardrails`

**Summary:** Automated warnings and alerts when daily loss or per-trade risk limits are approached.

**Detailed Explanation:** Guardrails notify you when a single trade exceeds your max capital risk percentage or when cumulative daily losses breach your threshold.

> [!WARNING]
> **Caveat:** Advisory guidance designed to curb emotional overtrading; does not lock broker order placement.

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#trading-accounts](docs/DATABASE_SCHEMA.md#trading-accounts)

---

## 7. Instruments & Tick Specifications

### Traded-Only Instrument Invariant
*Registry Key:* `instrument.tradedOnly`

**Summary:** The instruments list contains only symbols and underlyings you have personally traded or custom-created.

**Detailed Explanation:** SetupMint does not clutter your workspace with global catalogs. Traded underlyings are auto-created on-demand when logging trades.

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#instruments](docs/DATABASE_SCHEMA.md#instruments)

---

### Cascade Specs to Historical Trades
*Registry Key:* `instrument.cascadeSpecs`

**Summary:** Updates lot size, tick size, or multiplier on existing closed trades for this instrument.

**Detailed Explanation:** When enabled, modifying instrument specifications recalculates gross P&L, fees, and account balance reconciliation across all linked trades in one transaction.

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#instruments](docs/DATABASE_SCHEMA.md#instruments)

---

## 8. Playbook Strategy Edge Verification

### Statistical Edge Verdict
*Registry Key:* `strategy.edgeVerdict`

**Summary:** Validates whether a strategy exhibits a statistically proven edge over random chance.

**Detailed Explanation:** Verdict: LIKELY_EDGE (90% bootstrap confidence interval / 5th percentile lower bound of win rate > 50% and positive expectancy), NO_EDGE_NEGATIVE (statistically unprofitable), or UNPROVEN (insufficient trades).

> [!WARNING]
> **Caveat:** Requires at least 30 closed trades before a strategy can be confirmed as having an edge.

**See Also:** `metric.expectancy`, `metric.sampleReliability`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#statistical-edge-validation](docs/TRADING_CALCULATIONS.md#statistical-edge-validation)

---

### Parent/Child Invariant Check
*Registry Key:* `strategy.invariantCheck`

**Summary:** Validates that performance metrics across child setup variants sum exactly to parent strategy metrics.

**Detailed Explanation:** Guarantees that trade counts, win rates, and net P&L across all variants mathematically reconcile with the parent playbook without orphaned trades.

**Documentation Reference:** [docs/DATABASE_SCHEMA.md#parent-strategy-variants](docs/DATABASE_SCHEMA.md#parent-strategy-variants)

---

## 9. Psychology & Discipline Review

### Discipline Score & Penalties
*Registry Key:* `journal.disciplineScore`

**Summary:** Daily rating starting at 100%, penalized by behavioural mistakes like chasing or moving stop loss.

**Detailed Explanation:** Reinforces process over outcome. A winning day with poor discipline receives a low score, highlighting rule violations.

```text
Formula: Score = 100 - Sum(Mistake Penalties)
```

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#discipline-scoring](docs/TRADING_CALCULATIONS.md#discipline-scoring)

---

## 10. Dashboard & Review Queue

### Trade Review Queue Criteria
*Registry Key:* `dashboard.reviewQueue`

**Summary:** Highlights closed trades requiring post-trade journaling, mistake tagging, or chart attachment.

**Detailed Explanation:** Trades appear here if they are unreviewed, lack mistake reflection tags on losses, or have missing execution chart screenshots.

**Documentation Reference:** [docs/ROUTES_AND_PAGES.md#dashboard](docs/ROUTES_AND_PAGES.md#dashboard)

---

## Other Concepts

### MAE vs. MFE Scatter Matrix
*Registry Key:* `analytics.excursion.scatter`

**Summary:** 2D mapping of trade drawdown (X-axis) against trade peak profit potential (Y-axis).

**Detailed Explanation:** Top-Left Quadrant: Clean winners with low drawdown (<0.5R) and large runs. Top-Right: Rollercoaster trades that took high heat before winning. Bottom-Right: Heavy losers with zero favorable traction.

**See Also:** `metric.mae`, `metric.mfe`, `metric.exitEfficiency`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#mae-mfe](docs/TRADING_CALCULATIONS.md#mae-mfe)

---

## 11. Live Trade Management & Execution

### Multi-Target Scaling Ladder
*Registry Key:* `live.targetLadder`

**Summary:** 3-tier profit-taking structure that systematically scales out of a position at pre-calculated R-multiple targets while progressively trailing the stop loss.

**Detailed Explanation:** Target 1 (+1.0R): Exit 50% of position and lock stop to breakeven. Target 2 (+2.0R): Exit 33% of remaining and trail stop to +1.0R. Target 3 / Runner (+3.0R or planned target): Exit 100% of remaining runner position. Each step displays real-time distance, progress percentage, and an actionable execution badge that triggers FYERS broker orders when clicked.

**See Also:** `metric.unrealizedR`, `risk.currentStopLoss`, `risk.initialStopLoss`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#15-multi-target-scaling-ladder-engine](docs/TRADING_CALCULATIONS.md#15-multi-target-scaling-ladder-engine)

---

### Profit Giveback Meter & Threat Radar
*Registry Key:* `live.giveback`

**Summary:** Real-time gauge comparing current floating MTM against the trade's peak MFE to detect profit surrendering and trigger retention alerts.

**Detailed Explanation:** Tracks peak floating net P&L, peak unrealized R, and peak LTP throughout the trade's lifecycle. Calculates the giveback amount (₹), giveback percentage (%), and retention percentage (%). Classifies threat state as `SAFE`, `WATCH` (≥0.8R peak, ≥20% giveback), `LEAKING` (≥1.0R peak, ≥35% giveback), or `CRITICAL_REVERSAL` (≥1.0R peak, current R ≤0.2). Alert messages are surfaced directly in the Live Watcher banner.

**See Also:** `live.targetLadder`, `metric.mfe`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#16-live-profit-giveback-meter--threat-radar](docs/TRADING_CALCULATIONS.md#16-live-profit-giveback-meter--threat-radar)

---

### MFE Reach Funnel
*Registry Key:* `analytics.excursion.mfeReachFunnel`

**Summary:** Funnel analysis evaluating what proportion of trades reached specific R-multiple milestones and whether they converted into profits or surrendered into losses.

**Detailed Explanation:** Evaluates progression across 6 thresholds (+0.5R, +1.0R, +1.5R, +2.0R, +2.5R, +3.0R). For each threshold, calculates the reach count, reach percentage, win conversion rate, and loss count. Identifies "round-trip losses" — trades that reached ≥+1.0R MFE but closed at a loss — quantifying the total surrendered R and ₹ that disciplined profit protection would have saved.

**See Also:** `metric.mfe`, `metric.exitEfficiency`, `live.giveback`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#17-mfe-reach-funnel--round-trip-loss-quantifier](docs/TRADING_CALCULATIONS.md#17-mfe-reach-funnel--round-trip-loss-quantifier)

---

### Initial Stop Loss Anchoring
*Registry Key:* `risk.initialStopLossAnchoring`

**Summary:** Invariant ensuring that the original stop loss at entry is permanently preserved for accurate 1R risk budget calculations, even after trailing or moving the stop.

**Detailed Explanation:** When a trader adjusts their stop loss (via 1-click breakeven lock, scaling ladder step, or manual broker SL modification), `risk.currentStopLoss` updates to the new price while `risk.initialStopLoss` remains anchored at the entry-time stop. The risk budget denominator for all R-multiple calculations always uses the initial risk amount (|Entry − InitialSL| × Qty × Multiplier), preventing artificially inflated R-multiples when trailing to breakeven or profit.

**See Also:** `risk.plannedRiskAmount`, `metric.realizedRMultiple`, `live.targetLadder`

**Documentation Reference:** [docs/TRADING_CALCULATIONS.md#18-stop-loss-modification--initial-risk-budget-anchoring](docs/TRADING_CALCULATIONS.md#18-stop-loss-modification--initial-risk-budget-anchoring)

---

### Live Broker Order Execution (FYERS)
*Registry Key:* `broker.liveExecution`

**Summary:** Real-time order placement, modification, and cancellation on the FYERS trading platform directly from SetupMint's Live Watcher interface.

**Detailed Explanation:** Three execution endpoints: (1) `POST /trades/:id/broker-sl` — modifies or places SL orders on FYERS with automatic pending order detection. (2) `POST /trades/:id/broker-exit` — submits partial or full market exits with automatic orphaned SL cancellation on full close. (3) `POST /trades/:id/broker-ladder-step` — atomic scaling ladder step combining partial exit + stop trail in a single action. All order tags are sanitized to alphanumeric characters for FYERS API v3 compliance, and IPv4 DNS resolution is enforced.

**See Also:** `live.targetLadder`, `live.giveback`, `risk.currentStopLoss`

**Documentation Reference:** [docs/FYERS_INTEGRATION.md#8-live-broker-order-execution](docs/FYERS_INTEGRATION.md#8-live-broker-order-execution)

---
