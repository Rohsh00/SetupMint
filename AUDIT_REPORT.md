# SetupMint (`tradevault-monorepo`) — Quantitative Finance Calculation Audit Report

**Audit Date:** 2026-11-12  
**Scope:** Phases 1–6 across `packages/shared`, `packages/financial-engine`, `apps/api`, `apps/web`, and `docs/`.  
**Database Safety:** Zero blanket deletes executed; zero modifications to real user data (`komal@gmail.com`). All API integration verification runs against ephemeral `@test.local` accounts cleaned up per user ID.

---

## Executive Summary

A full first-principles quantitative audit of the SetupMint calculation stack uncovered **P0 money-calculation defects**, **P1 metric/timezone/threshold discrepancies**, and **P2 cross-document drift**:

- **P0 Fixes Completed:**
  - Replaced global `Decimal.set()` mutation risk with an isolated `CalcDecimal` clone (`precision: 30, rounding: CalcDecimal.ROUND_HALF_UP`) across [`decimal.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/decimal.ts#L10-L58), [`account.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/account.service.ts#L5), [`instrument.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument.service.ts#L23), and [`fyers.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/fyers.service.ts).
  - Updated statutory schedules in [`charges.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts#L1-L437) to **effective-dated regimes** (`PRE_OCT_2024`, `OCT_2024_TO_MAR_2026`, `APR_2026_ONWARD` reflecting Finance Act 2026 Futures `0.05%` / Options `0.15%` STT, `NSE/FA/73061` IPFT eff. Mar 1, 2026, MCX `0` client IPFT, `BSE_EQ`, `BSE_FNO`, `EQUITY_DELIVERY` + optional DP charge, `NSE_CURRENCY_*`, per-order equity `0.03%` cap, and `legSide` attribution).
  - Corrected MCX quote-unit multipliers (`GOLD` 100, `GOLDM` 10, `GOLDGUINEA` 1, `GOLDPETAL` 1, `SILVERM` 5, `SILVERMIC` 1, `CRUDEOILMINI` 10, `NATGASMINI` 250, `ZINCMINI`/`ALUMINI`/`LEADMINI` 1000) and Global FX CFD specs (`EURUSD`/`GBPUSD`/`USDJPY` `contractMultiplier = 100000`, `lotSize = 0.01`) in [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts#L858-L1430) and [`instrument-classifier.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument-classifier.service.ts).
  - Eliminated false FX misclassification of NSE INR currency derivatives (`USDINR`, `EURINR`, `GBPINR`, `JPYINR`) via [`getPairQuoteCurrency`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts) in [`instrument.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument.service.ts#L293) and [`TradeFormModal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeFormModal.tsx) *(note remaining pattern check in [`live-watcher.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/live-watcher.service.ts#L67-L73) documented below)*.
  - Added effective-dated index lot sizes (`INDEX_LOT_SIZE_HISTORY` + [`getEffectiveLotSize`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts#L806)) and protected closed-trade historical `lotSize`/auto-fees during instrument cascade updates in [`instrument.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument.service.ts).
  - Replaced single-pass breakeven approximation with convergent iterative solve over `FeeModelRegistry.calculate` + directional tick safety (`LONG` ceil, `SHORT` floor) in [`calculateTrueBreakevenPrice`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts#L751-L892).
  - Fixed FIFO CSV import post-fee `outcome` classification in [`export-import.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/export-import.routes.ts) and 2dp net P&L outcome rounding across [`pnl.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/pnl.ts) / [`fifo.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/fifo.ts).
  - Fixed `AccountTransaction` balance invariants: excluded `PENDING_REVIEW`/`REJECTED` everywhere, kept `TRANSFER` balance-neutral with a separate `totalTransfers` memo in [`account.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/account.service.ts#L64-L117), and adjusted cash-flow drawdown in [`dashboard.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/dashboard.routes.ts#L100-L330).

- **P1/P2 Unifications Completed:**
  - Enforced strict lot-step floor sizing (`FLOOR` / `CASH_1`, removed `NEAREST` round-up) and separated geometric `rewardRiskRatio` from `costAdjustedRewardRiskRatio` across `risk.ts` and [`RiskCalculatorPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/RiskCalculatorPage.tsx).
  - Unified alert/risk/scaling thresholds into [`RISK_AND_ALERT_THRESHOLDS`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts), exposed both currency `expectancy` and `expectancyR`, `profitFactor` (net) and `grossProfitFactor`, canonical `EdgeVerdict` (`LIKELY_EDGE | UNPROVEN | NO_EDGE_NEGATIVE`), unified What-If holdout validation (`inSampleVerdict === 'BETTER_ROBUST'` and `n_holdout >= 15`), and explicit `expectancyUnit` (`'CURRENCY'` vs `'R'`) in Empirical-Bayes summaries.
  - Added `{ timezone: 'Asia/Kolkata' }` to MongoDB `$dayOfWeek` in [`trade-query.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/trade-query.service.ts#L233), fixed DST transitions for London/NY and MCX close times in [`calendar-registry.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/registries/calendar-registry.ts#L16-L188), updated Sep-2025+ NSE/BSE expiry rules (`NIFTY` Tuesday, `BANKNIFTY` Last Tuesday monthly-only, `SENSEX` Thursday weekly, `BANKEX` Last Thursday) and 2026 holidays in [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts), and validated 52/53 ISO weeks in [`date-range.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/date-range.ts).
  - Recomputed the `USER_FLOWS.md` NIFTY 2-lot example from first principles (₹207.82 could never reproduce for futures; updated to exact Oct-2024 ₹367.20 and May-2026 ₹1,819.87 schedules) and synchronized all 8 docs in `/docs/` plus [`help-content.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/help-content.ts).

---

## Phase 1 — Instrument-Wise Audit Matrix

Values verified against NSE/BSE/MCX contract specifications, SEC Reg NMS Rule 612, CME Group specs, and MT5 standard FX CFD conventions as encoded in [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts#L806-L1545).

| Instrument | Field | Prior Code / Doc Value | Verified Current Value | Authority / Effective Basis | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **NIFTY** (NSE F&O) | `lotSize` | Static `25` / stale doc `75` | `65` (dated history: `25` Oct 2024 -> `75` -> `65` Jan 2026+) | NSE Circular `NSE/FAOP/70616` (eff. Jan 2026+); `INDEX_LOT_SIZE_HISTORY` | **Fixed** (P0) |
| **BANKNIFTY** (NSE F&O) | `lotSize` / Expiry | Static `15` / Thursday weekly | `30` (history `15` -> `35` -> `30`); Monthly Last Tuesday only | NSE F&O revision; weekly discontinued Nov 2024; Sep 2025+ Tue monthly | **Fixed** (P0) |
| **FINNIFTY** (NSE F&O) | `lotSize` | `25` | `60` (history `25`/`40` -> `65` -> `60`) | NSE F&O revision + Sep 2025+ monthly Last Tuesday | **Fixed** (P0) |
| **MIDCPNIFTY** (NSE F&O) | `lotSize` | `50` | `120` (history `50`/`75` -> `140` -> `120`) | NSE F&O revision + Sep 2025+ monthly Last Tuesday | **Fixed** (P0) |
| **NIFTYNXT50** (NSE F&O) | `lotSize`, `tickSize` | `25`, `0.05` | `25`, `0.05`, `contractMultiplier: 1` | NSE F&O spec | **Verified** |
| **SENSEX** (BSE F&O) | `lotSize`, `segment`, Expiry | `10` / NSE default | `20`, `BSE_FNO`, Weekly & Monthly Thursday | BSE Notice `20241025-17` & Sep 2025+ Thursday schedule | **Fixed** (P0) |
| **BANKEX** (BSE F&O) | `lotSize`, `segment`, Expiry | `15` / weekly | `30`, `BSE_FNO`, Monthly Last Thursday | BSE F&O revision & Sep 2025+ Last Thursday monthly | **Fixed** (P0) |
| **SENSEX50** (BSE F&O) | `lotSize`, `segment` | `60` | `60`, `BSE_FNO`, `tickSize: 0.05` | BSE F&O spec | **Verified** |
| **NSE Equity** (`RELIANCE`, `HDFCBANK`, `TATASTEEL`) | `tickSize`, Delivery charges | Static `0.05` / Intraday-only | Dynamic `getNseTickSize(price)` (`0.01` under ₹250, `0.05` ₹250–₹1000, `0.10` ₹1000+ e.g. `0.1` for RELIANCE/HDFCBANK, `0.01` for TATASTEEL); Delivery STT 0.1% + DP | `SEBI/HO/MRD/TPD-1/P/CIR/2024/58` / NSE CMTR eff. Apr 15, 2025 | **Fixed** (P0) |
| **MCX GOLD** | `contractMultiplier` | `1` in `BUSINESS_LOGIC.md` | `100` (1 kg unit quoted per 10 g -> 100 quote units) | MCX Gold 1kg spec | **Fixed** (P0) |
| **MCX GOLDM** | `contractMultiplier` | Misclassified under `GOLD` (`100`) | `10` (100 g unit quoted per 10 g -> 10 quote units) | MCX Gold Mini 100g spec | **Fixed** (P0) |
| **MCX GOLDGUINEA / GOLDPETAL** | `contractMultiplier` | Misclassified / `1` | `1` (8g per 8g quote / 1g per 1g quote) | MCX Gold Guinea & Petal specs | **Fixed** (P0) |
| **MCX SILVER / SILVERM / SILVERMIC** | `contractMultiplier` | `30` / Minis missing split | `30` (30kg/kg), `5` (5kg/kg), `1` (1kg/kg) | MCX Silver / Mini / Micro specs | **Fixed** (P0) |
| **MCX CRUDEOIL / CRUDEOILMINI** | `contractMultiplier`, `tickSize` | `100` / Mini conflated | `100` / `10`, `tickSize: 1`, `lotSize: 1` | MCX Energy specs | **Fixed** (P0) |
| **MCX NATURALGAS / NATGASMINI** | `contractMultiplier`, `tickSize` | `1250` / Mini conflated | `1250` / `250`, `tickSize: 0.1`, `lotSize: 1` | MCX Natural Gas specs | **Fixed** (P0) |
| **MCX COPPER / Base Metals & Minis** | `contractMultiplier`, `tickSize` | `COPPER: 2500`, Std `5000`, Minis unsplit | `COPPER: 2500`; `ZINC`/`ALUMINIUM`/`LEAD: 5000`; `ZINCMINI`/`ALUMINI`/`LEADMINI: 1000`; `tickSize: 0.05` | MCX Base Metal & Mini specs | **Fixed** (P0) |
| **NSE Currency (`USDINR`, `EURINR`, `GBPINR`, `JPYINR`)** | `quoteCurrency`, FX detection, `lotSize`, `tickSize` | Regex flagged `EUR`/`GBP`/`JPY` as global USD FX | `quoteCurrency: 'INR'`, `lotSize: 1000`, `contractMultiplier: 1`, `tickSize: 0.0025`, `pricePrecision: 4` | NSE CDS contract spec (`getPairQuoteCurrency`) | **Fixed** (P0) |
| **Global FX CFD (`EURUSD`, `GBPUSD`, `USDJPY`)** | `contractMultiplier`, `lotSize`, `quoteCurrency` | `lotSize: 1000` / `XAUUSD` conflicts | `contractMultiplier: 100000`, `lotSize: 0.01`, `quantityIncrement: 0.01`; `USDJPY` `quoteCurrency: 'JPY'`, `tickSize: 0.001`, prec `3` (requires explicit FX->account rate conversion) | MT5 standard FX lot (1.0 lot = 100,000 units; 0.01 micro-lot step) | **Fixed** (P0) |
| **Spot Metal CFD (`XAUUSD`, `XAGUSD`)** | `contractMultiplier`, `lotSize`, `tickSize` | `lotSize: 0.01` | `XAUUSD`: mult `100`, lot `0.01`, tick `0.01`, prec `2`; `XAGUSD`: mult `5000`, lot `0.01`, tick `0.001`, prec `3` | Standard Spot CFD specs | **Verified** |
| **Crypto Perpetuals (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`)** | `quoteCurrency`, `lotSize`, `tickSize` | `quoteCurrency: 'USDT'` | `contractMultiplier: 1`; lots `0.001` / `0.01` / `0.1`; ticks `0.1` / `0.01` / `0.01`; explicit `USDT` quote conversion required when account currency differs | Binance USDT-M Perpetual specs | **Verified** |
| **US Equities (`SPY`, `QQQ`, `AAPL`)** | `tickSize`, `pricePrecision`, `quoteCurrency` | `$0.01` | `contractMultiplier: 1`, `lotSize: 1`, `tickSize: 0.01`, `pricePrecision: 2`, `quoteCurrency: 'USD'` | SEC Reg NMS Rule 612 ($\ge \$1.00$ tick $\$0.01$) | **Verified** |
| **CME Futures (`ES`, `MES`)** | `contractMultiplier`, `tickSize`, `quoteCurrency` | `50` / `5`, `0.25` | `ES`: mult `50`, lot `1`, tick `0.25`, `USD`; `MES`: mult `5`, lot `1`, tick `0.25`, `USD` | CME Equity Index specs | **Verified** |

---

## Detailed Findings by Severity

### P0 — Critical Monetary & Ledger Defects

#### 1. Shared Global `Decimal.set()` Mutation Risk & Rounding Terminology Error
- **Location:** [`decimal.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/decimal.ts#L10-L58), [`account.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/account.service.ts#L5), [`instrument.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument.service.ts#L23), [`TRADING_CALCULATIONS.md`](file:///Users/komal/projects/Trading%20Vault/docs/TRADING_CALCULATIONS.md)
- **Expected vs Actual:** Docs described `ROUND_HALF_UP` as "banker's rounding" (`ROUND_HALF_EVEN`), while calling `Decimal.set(...)` on the global constructor allowed unrelated code to mutate precision/rounding globally.
- **Fix:** Standardized on isolated `CalcDecimal = BaseDecimal.clone({ precision: 30, rounding: BaseDecimal.ROUND_HALF_UP })` across all calculation modules and corrected docs to explicitly state `ROUND_HALF_UP` (standard arithmetic half-away-from-zero).

#### 2. Stale & Missing Indian Statutory Charge Schedules (`charges.ts`) + `USER_FLOWS.md` Example Mismatch
- **Location:** [`charges.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts#L1-L437), [`fee-registry.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/registries/fee-registry.ts#L3-L48), [`USER_FLOWS.md`](file:///Users/komal/projects/Trading%20Vault/docs/USER_FLOWS.md)
- **Expected vs Actual:** Hardcoded single-era STT/CTT/exchange rates broke historical trade replay across regulatory changes, omitted `EQUITY_DELIVERY` / `BSE_FNO` / `BSE_EQ` / `NSE_CURRENCY_*`, levied IPFT on MCX (not applicable to clients on MCX), and `USER_FLOWS.md` cited `₹207.82` fees for a 2-lot NIFTY futures round trip (`24000 -> 24120`) which could not reproduce under either 50-qty or 130-qty contracts.
- **Reproduction (Verified via `charges.js`):**
  - 2 lots NIFTY (`24000 -> 24120`, Oct 2024, 50 qty, `OCT_2024_TO_MAR_2026`): Brokerage `40.00`, Exch `41.62` + IPFT `2.41` = `44.03`, SEBI `2.41`, Stamp `24.00`, STT `241.20`, GST `15.56` -> **`totalCosts = ₹367.20`**, Net P&L `+₹5,632.80`.
  - 2 lots NIFTY (`24000 -> 24120`, May 2026, 130 qty, `APR_2026_ONWARD`, Finance Act 2026 `0.05%` Fut STT + `NSE/FA/73061` IPFT): Brokerage `40.00`, Exch `108.22` + IPFT `6.26` = `114.48`, SEBI `6.26`, Stamp `62.40`, STT `1567.80`, GST `28.93` -> **`totalCosts = ₹1,819.87`**, Net P&L `+₹13,780.13`.
- **Fix:** Implemented effective-dated schedules (`PRE_OCT_2024`, `OCT_2024_TO_MAR_2026`, `APR_2026_ONWARD`), per-order `0.03%` equity brokerage cap, single-leg `legSide` attribution, [`allocateChargesProportionally`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts#L673), and independent circular-level verification in [`calculation-golden.test.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/test/calculation-golden.test.ts#L39-L95).

#### 3. Instrument Multiplier, FX Quote Currency & NSE Currency Derivative Misclassification
- **Location:** [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts#L858-L1430), [`instrument-classifier.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument-classifier.service.ts), [`instrument.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument.service.ts#L293-L526), [`TradeFormModal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeFormModal.tsx), [`live-watcher.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/live-watcher.service.ts#L67-L73)
- **Expected vs Actual:** MCX gold/silver minis/micros and `CRUDEOILMINI`/`NATGASMINI`/base metal minis inherited full contract multipliers or docs cited `GOLD` multiplier `1`; NSE `EURINR`/`GBPINR`/`JPYINR` matched `/eur|gbp|jpy/` FX regex and skipped Indian regulatory fees or used global FX precision; `USDJPY`/`BTCUSDT` quote currencies lacked explicit conversion warnings/requirements.
- **Fix:** Split MCX mini/micro classifiers, encoded exact quote-unit multipliers, enforced [`getPairQuoteCurrency`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts) and explicit FX conversion checks (`convertCurrency`), and passed `symbol`/`exchange`/`tradeDate`/`legSide` across `trade.routes.ts`, `instrument.service.ts`, `fyers.service.ts`, `export-import.routes.ts`, and `TradeFormModal.tsx`.
- **Remaining Edge Note (Observed, Unmodified):** [`live-watcher.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/live-watcher.service.ts#L67-L123) still checks `/eur|gbp|jpy/` on `trade.symbol` when determining UI ladder default tick (`0.0001` vs `0.0025` for `*INR`), though server-side `live-watcher.ts` charge estimation uses explicit `currency`/`assetClass` checks.

#### 4. Cascade Lot-Size Overwrite of Closed Historical Trades
- **Location:** [`instrument.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/instrument.service.ts#L92-L106), [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts#L806-L810)
- **Expected vs Actual:** Updating an `Instrument`'s `lotSize` (e.g., NIFTY 25 -> 65) risked cascading new `lotSize` / auto-fees over historical `CLOSED` trades.
- **Fix:** Added date-effective `getEffectiveLotSize(symbol, asOfDate)` and isolated `applyUpdate` so `CLOSED` historical trades retain their historical `lotSize` and static net P&L unless an explicit `contractMultiplier` repair is requested.

#### 5. Account Balance Precision Drift, Pending Transactions & `TRANSFER` Type Handling
- **Location:** [`account.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/account.service.ts#L5-L117), [`pnl.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/pnl.ts), [`fifo.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/fifo.ts#L145-L220), [`export-import.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/export-import.routes.ts)
- **Expected vs Actual:** Summing IEEE-754 floats over many trades risks penny drift; `TRANSFER` enum entries on `AccountTransaction` needed explicit ledger semantics; FIFO CSV import derived `outcome` pre-fee instead of from 2dp post-fee `netPnL`.
- **Fix:** Rounded each trade P&L to 2dp via `CalcDecimal`, summed with `CalcDecimal` in [`recalculateAccountBalances`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/account.service.ts#L64-L117), strictly excluded `PENDING_REVIEW`/`REJECTED` transactions, kept non-negative `TRANSFER` neutral on balance while reporting `totalTransfers`, classified `outcome` at 2dp post-fee everywhere, and proved zero drift in a 10,000-trade property test in `calculation-golden.test.ts`.

#### 6. True-Breakeven Price Fee Circularity & Broker Ladder Hardcoded Entry Charges
- **Location:** [`charges.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts#L751-L892), [`trade.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/trade.routes.ts), [`LiveUnifiedPriceLadder.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/live/LiveUnifiedPriceLadder.tsx)
- **Expected vs Actual:** Exit-side STT/exchange/SEBI/GST depend on exit price itself; `/broker-exit` and `/broker-ladder-step` previously hardcoded `20/0/0` entry charges and omitted `regulatoryFees` in fill `taxes`, while the price ladder gated fee-buffer rendering with `> 0.05` (breaking sub-`0.05` FX ticks).
- **Fix:** Implemented iterative fee convergence + directional tick safety (`LONG` ceil, `SHORT` floor) verified to produce `netPnL >= 0` at BE and `< 0` one tick worse; computed real entry-leg statutory charges & included `regulatoryFees`; lowered ladder threshold to `> 1e-6` with 5dp FX formatting.

---

### P1 — Risk, Statistics, Timezone & Calendar Defects

#### 7. Position Sizing Round-Up, Cost Budget Mismatch & R:R Dual Definitions
- **Location:** `packages/financial-engine/src/risk.ts` ([L14-L102](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/risk.ts#L14-L102)), [`RiskCalculatorPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/RiskCalculatorPage.tsx)
- **Expected vs Actual:** UI allowed `'NEAREST'` lot rounding (potentially exceeding risk budget), had stale NIFTY fallback `25`, and mixed geometric `|T-E|/|E-S|` vs cost-adjusted R:R.
- **Fix:** Enforced strict floor sizing (`FLOOR` / `CASH_1`), deducted costs from risk budget when `includeCostsInBudget: true`, returned both geometric `rewardRiskRatio` and explicit `costAdjustedRewardRiskRatio`, anchored realized R strictly on `initialStopLoss`, and documented entry-price sensitivity vs What-If execution R.

#### 8. Alert & Scaling Ladder Threshold Conflicts
- **Location:** [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts), [`live-watcher.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/live-watcher.ts#L200-L781), [`alert-state.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/alert-state.ts#L11-L104)
- **Expected vs Actual:** `CRITICAL_REVERSAL`, Stop `CRITICAL` buffer (`<= 25%` vs `15%`), and Ladder T2 exit ratio (`50% of remaining` vs `33%` doc text) disagreed across `live-watcher`, Telegram docs, and alert tables.
- **Fix:** Consolidated canonical values in `RISK_AND_ALERT_THRESHOLDS` consumed directly by both `live-watcher.ts` and `alert-state.ts` (and surfaced to `telegram-alert.service.ts`), standardized T2 at `0.5` (`50%` of remaining rounded down to whole lots, returning 0 scale on 1-lot positions), and aligned docs.

#### 9. Cross-Metric & Verdict Enum Contradictions (`metrics.ts`, `weekly-review.ts`, `monte-carlo.ts`)
- **Location:** [`metrics.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/metrics.ts#L329-L475), [`weekly-review.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/weekly-review.ts#L291-L438), `monte-carlo.ts`
- **Fix:** Kept net `profitFactor` and currency `expectancy` while adding explicit `grossProfitFactor` and `expectancyR`; standardized `EdgeVerdict` (`'LIKELY_EDGE' | 'UNPROVEN' | 'NO_EDGE_NEGATIVE'`); unified What-If holdout validation rule (`BETTER_ROBUST` + `n_holdout >= 15`); tagged Empirical-Bayes output with explicit `expectancyUnit` (`'R'` vs `'CURRENCY'` for `k=10`); adjusted dashboard drawdown curves for mid-range cash flows and flagged multi-currency scopes via [`isCrossCurrencyWarning`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/dashboard.routes.ts#L274); documented breakeven handling in 3-outcome Kelly and deterministic PRNG seeding + MC sample counts.

#### 10. UTC `$dayOfWeek` Mismatch, DST Sessions, ISO 53-Week Years & Sep-2025+ Expiries
- **Location:** [`trade-query.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/trade-query.service.ts#L233), [`calendar-registry.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/registries/calendar-registry.ts#L16-L188), [`date-range.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/date-range.ts), [`dashboard.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/dashboard.routes.ts#L185-L219), [`constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts)
- **Fix:** Added `{ timezone: 'Asia/Kolkata' }` to MongoDB `$dayOfWeek` matching `metrics.ts` and `weekly-review.ts`; implemented IANA timezone-aware DST switches in `SessionCalendarRegistry` (covering London GMT/BST, NY EST/EDT, and MCX 23:55 vs 23:30 IST close); added `getIsoWeeksInYear` rejecting invalid `W53` (e.g., `2025-W53`) while supporting real 53-week years (`2026-W53`); updated NSE/BSE expiry weekdays & `NSE_TRADING_HOLIDAYS_BY_YEAR[2026]`.

---

### P2 — Documentation Drift Resolved

Synchronized all 8 specification documents and client help content to match the codebase and regulatory schedules:
- [`docs/TRADING_CALCULATIONS.md`](file:///Users/komal/projects/Trading%20Vault/docs/TRADING_CALCULATIONS.md)
- [`docs/GLOSSARY.md`](file:///Users/komal/projects/Trading%20Vault/docs/GLOSSARY.md)
- [`docs/BUSINESS_LOGIC.md`](file:///Users/komal/projects/Trading%20Vault/docs/BUSINESS_LOGIC.md)
- [`docs/USER_FLOWS.md`](file:///Users/komal/projects/Trading%20Vault/docs/USER_FLOWS.md)
- [`docs/DATABASE_SCHEMA.md`](file:///Users/komal/projects/Trading%20Vault/docs/DATABASE_SCHEMA.md)
- [`docs/TELEGRAM_INTEGRATION.md`](file:///Users/komal/projects/Trading%20Vault/docs/TELEGRAM_INTEGRATION.md)
- [`docs/TESTING_AND_QUALITY_ASSURANCE.md`](file:///Users/komal/projects/Trading%20Vault/docs/TESTING_AND_QUALITY_ASSURANCE.md)
- [`docs/FINANCIAL_ENGINE.md`](file:///Users/komal/projects/Trading%20Vault/docs/FINANCIAL_ENGINE.md)
- [`packages/shared/src/help-content.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/help-content.ts)

---

## Verification Suites Added

1. [`calculation-golden.test.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/test/calculation-golden.test.ts): Independent statutory reference calculator vs `calculateIndianCharges` across segments and dates, 4+ contract note golden tests, `USER_FLOWS.md` NIFTY 2-lot parity, 10,000-trade zero-drift property test, iterative breakeven recompute verification, `normalizeUnderlying` collisions, Sep-2025+ expiries & 2026 holiday shifts, 53-week ISO dates, DST sessions, MCX close shifts, and unified metric/threshold tests.
2. [`calculation-audit.test.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/test/calculation-audit.test.ts): Isolated `@test.local` integration tests verifying MongoDB IST `$dayOfWeek` parity, NSE `USDINR` classification & charges, effective-dated NIFTY lot sizes + closed-trade cascade protection, `TRANSFER`/`PENDING_REVIEW`/`REJECTED` balance invariants, `BSE_FNO` SENSEX execution, and cash-flow-safe drawdown + multi-currency warnings.

