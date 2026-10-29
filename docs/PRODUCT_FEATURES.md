# SetupMint — Product Features & Module Inventory

This document provides a comprehensive, verified feature inventory of all modules in **SetupMint**, grounded strictly in the codebase implementation.

---

## 1. Authentication & Session Management

- **Status:** **IMPLEMENTED**
- **Purpose:** Secure, stateful user authentication and tenant isolation.
- **Problem Solved:** Prevents unauthorized access to sensitive financial data while allowing persistent login sessions across application refreshes.
- **Main User Interactions:** Registration, login, logout, viewing user profile in navigation bar.
- **Inputs & Outputs:**
  - *Inputs:* Email, password (min 8 chars), display name, default base currency (`INR`).
  - *Outputs:* HttpOnly session cookie (`tv_session`), user profile payload.
- **Frontend Components:** [`LoginPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/LoginPage.tsx), [`RegisterPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/RegisterPage.tsx), [`AuthContext.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/context/AuthContext.tsx), `ProtectedRoute` in [`App.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/App.tsx).
- **Backend APIs & Services:**
  - `POST /api/v1/auth/register` (rate limited to 15 req/min)
  - `POST /api/v1/auth/login` (rate limited to 15 req/min)
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- **Database Entities:** `User`, `Session` (with 30-day TTL index on `expiresAt`).
- **Business Rules & Calculations:** Passwords hashed with bcrypt (salt rounds: 10). Session token generated using 32 random bytes (`crypto.randomBytes(32).toString('hex')`).
- **Validation & Error Handling:** Validated via `registerSchema` and `loginSchema` (Zod). Returns `409 USER_EXISTS`, `401 INVALID_CREDENTIALS`, or `401 SESSION_EXPIRED`.

---

## 2. Trading Accounts & Cash Flows

- **Status:** **IMPLEMENTED**
- **Purpose:** Segregated ledger management for multiple trading accounts and brokers.
- **Problem Solved:** Allows traders to track capital across different brokers (FYERS, Zerodha, Upstox, Prop firms) and prevents account balance drift through authoritative balance recalculation.
- **Main User Interactions:**
  - View accounts with current balance, initial balance, total deposits, withdrawals, and realized P&L.
  - Create new account with broker, account type, initial balance, and risk rules.
  - Record cash deposits and withdrawals.
  - Authoritatively reconcile account balance from raw trade and cash flow records.
  - Archive or delete account.
- **Inputs & Outputs:**
  - *Inputs:* Account name, broker, account number, account type (`EQUITY`, `COMMODITY`, `FUTURES_OPTIONS`, etc.), currency, initial balance, transaction amount and date.
  - *Outputs:* Authoritative `AccountBalanceSummary` with real-time balance.
- **Frontend Components:** [`AccountsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AccountsPage.tsx), global account selector dropdown in [`AppLayout.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/AppLayout.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/accounts`
  - `POST /api/v1/accounts`
  - `GET /api/v1/accounts/:id`
  - `PUT /api/v1/accounts/:id`
  - `DELETE /api/v1/accounts/:id` (archives if trades exist; hard deletes if 0 trades)
  - `POST /api/v1/accounts/:id/transactions`
  - `GET /api/v1/accounts/:id/transactions`
  - `POST /api/v1/accounts/:id/reconcile`
  - Backend Service: [`AccountService.recalculateAccountBalances`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/account.service.ts)
- **Database Entities:** `TradingAccount`, `AccountTransaction`, `Trade`.
- **Business Rules & Calculations:**
  - $\text{Current Balance} = \text{Initial Balance} + \text{Realized P&L} + \text{Deposits} - \text{Withdrawals} + \text{Adjustments}$
  - Monetary values stored in database as `Schema.Types.Decimal128` to guarantee zero IEEE-754 drift.
  - Soft delete rule: If an account has associated trades, calling DELETE sets `status = 'ARCHIVED'` rather than cascading deletion, preventing historical data loss.

---

## 3. Trade Entry & Management

- **Status:** **IMPLEMENTED**
- **Purpose:** Rapid and comprehensive manual logging of discretionary trades.
- **Problem Solved:** Simplifies trade entry while capturing extensive pre-trade, execution, risk, and psychological metadata.
- **Main User Interactions:**
  - Switch between **Simple Mode** (single trade leg with auto-calculation) and **Advanced Mode** (FIFO multiple entry and exit fills).
  - Toggle between **Quick Mode** (express entry) and **Comprehensive Mode** (full thesis, psychology, confluences).
  - Select quick templates (e.g. Nifty Breakout, BankNifty Mean Reversion).
  - Instrument selection with instant metadata autofill: exchange, market segment, currency, contract multiplier, and lot size.
  - Dedicated **Lots** input field synchronized bidirectionally with quantity (`Quantity = Lots * LotSize`).
  - Automatic trading session derivation from entry timestamp (`NSE_REGULAR`, `MCX_EVENING`, `NEW_YORK`, `LONDON`, `OFF_HOURS`).
  - **Market-Based, Rule-Driven Trade Setup Templates:**
    - 25 built-in templates across 6 market groups (`FNO`, `STOCKS`, `FOREX_GOLD`, `CRYPTO`, `MCX`, `PRICE_ACTION`).
    - Tailored for institutional liquidity and S/R traders with 5 specialized setups: Liquidity Sweep Reversal, Equal Highs/Lows Raid, PDH/PDL Sweep Reversal, Support/Resistance Flip Retest, and Supply/Demand Zone Rejection.
    - Templates describe institutional setups for markets and **NEVER** hardcode symbols such as `NIFTY` or `BANKNIFTY`. They adapt to whichever symbol the trader selects.
    - Dynamic contextual ranking (`rankTemplates`) elevates matching templates based on asset class, trading session time window in IST, and expiry day recognition (with NSE 2026 holiday shifts).
    - Quick access bar ([`MarketTemplateBar.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/form/MarketTemplateBar.tsx)) with top 6 ranked chips and keyboard shortcuts (`1-6` to preview, `Enter` to apply).
    - Popover preview showing `"Will prefill (empty fields only)"` to guarantee non-destructive prefilling that respects `dirtyFields`.
    - Pure `decimal.js` rule resolution (`resolveTemplate`) computing stop loss (`PERCENT`, `POINTS`, `PREMIUM_PERCENT`, `MANUAL`), target from `minRR`, and rounding to instrument `tickSize`.
    - Provenance tracking tags (`"from template"`, `"from rule"`, `"auto"`) and complete "Undo template" action.
    - Dynamic stop loss and target recomputation whenever the trader updates entry price or direction.
    - Custom template creation, favoriting, and tenant-isolated performance tracking via `/api/v1/templates`.
  - **Liquidity & S/R Trade Journaling Workflow:**
    - Thesis tab: 51 technical confluences grouped into 4 distinct collapsible categories (Liquidity surfaced first, Support/Resistance, Confirmation/Structure, and Indicators/Other) with real-time text search and multi-select chip filter.
    - Psychology tab: 23 emotional states grouped by Positive, Neutral, and Negative in `<optgroup>` pickers; 29 discrete mistake tags categorized into Liquidity/Level, Execution/Timing, Risk/Discipline, and Session/Context; interactive 10-point `LIQUIDITY_RULE_CHECKLIST` with visual adherence badge ("Rules Followed: X / 10").
  - Automatic Indian statutory charges calculation (`calculateIndianCharges` in `@tradevault/financial-engine`) with live `TradeCalculationBanner` recomputation, "Auto" badge, manual fee override detection, and "Reset to auto" action.
  - Persistent preference memory: remembers last-used account, strategy, symbol, workflow mode, and execution mode.
  - Quick Close action on `/trades` and `/trades/:id` for OPEN/PLANNED trades via [`QuickCloseTradeDialog`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx): prompts for exit price, exit time, optional exit fees, auto-computes round-trip statutory charges, and live Net P&L.
  - Global Command Palette ([`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)) accessible via `Cmd+K` / `Ctrl+K` with quick actions:
    - *Log New Trade (`N`)*
    - *Apply Trade Setup Template (`T`)*
    - *Repeat Last Trade (`R`)*: Instantly clones the most recent trade via `POST /api/v1/trades/:id/duplicate`.
    - *Jump to Today's Journal (`J`)*
    - *Open Risk Calculator (`C`)*
    - *Jump to Page*: Instant filter and jump to any view.
  - Strategy-aware entry: selecting a strategy playbook pre-populates `thesis.confluences` with the strategy's checklist/entry rules, and verifies `plannedRewardRiskRatio >= strategy.minRiskReward` (displays warning banner if R:R threshold is breached).
  - Search, filter by account, symbol, asset class, direction, status, outcome, template (`templateId`), and date range.
  - Pagination and sorting.
  - Trade duplication, bulk tagging, and bulk deletion.
- **Inputs & Outputs:**
  - *Inputs:* Account ID, symbol, asset class, direction (`LONG`/`SHORT`), status (`PLANNED`/`OPEN`/`CLOSED`/`CANCELLED`), template ID (`templateId`), entry/exit prices, lots/quantity, contract multiplier, fees breakdown, confluences, emotions, mistakes.
  - *Outputs:* Persisted trade document with linked `templateId`, calculated gross/net P&L, itemized statutory charges, realized R-multiple, outcome classification.
- **Frontend Components:**
  - [`TradesPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradesPage.tsx)
  - [`TradeDetailPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradeDetailPage.tsx)
  - [`TradeInteractiveChart.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeInteractiveChart.tsx) (Primary TradingView Lightweight Charts v5 candlestick engine with live resolution switching, stop trail step lines, execution window bands, R-ladder targets, and underlying proxy fallback)
  - [`TradeScreenshotGallery.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/attachments/TradeScreenshotGallery.tsx) (Saved Snapshots gallery with permanent SVG audit trail, staleness detection, and one-click regeneration)
  - [`TradeFormModal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeFormModal.tsx)
  - [`MarketTemplateBar.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/form/MarketTemplateBar.tsx)
  - [`QuickCloseTradeDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx)
  - [`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)
  - Sub-components: `TradeQuickSection`, `TradeAdvancedFills`, `TradeCalculationBanner`, `TradeJournalDetails`, `TradeTemplateSelector`.
- **Backend APIs & Services:**
  - `GET /api/v1/trades` (supports filtering by `templateId`, sorting, pagination)
  - `POST /api/v1/trades` (persists `templateId`, triggers auto-snapshot if status is `CLOSED`, recalculates account balance)
  - `GET /api/v1/trades/:id` (returns populated trade with `formattedAttachments` including `settingsSource` and `isStale`)
  - `GET /api/v1/trades/:id/interactive-candles` (provides normalized candle data for the primary chart with underlying proxy fallback)
  - `PUT /api/v1/trades/:id` (supports partial simple execution payload for quick closing; auto-generates snapshot on close or marks snapshots stale if edited)
  - `DELETE /api/v1/trades/:id` (unlinks cloud storage objects and recalculates account balance)
  - `POST /api/v1/trades/:id/duplicate`
  - `POST /api/v1/trades/bulk-tag`
  - `POST /api/v1/trades/bulk-delete`
  - `GET /api/v1/templates` (lists built-in & custom templates with live trade performance aggregation)
  - `POST /api/v1/templates` (creates custom user template)
  - `PUT /api/v1/templates/:id` (updates custom template; protects built-ins with `BUILT_IN_READ_ONLY`)
  - `DELETE /api/v1/templates/:id` (deletes custom template)
  - `POST /api/v1/templates/:id/favorite` (toggles favorite status)
  - `POST /api/v1/templates/:id/use` (increments usage count)
- **Database Entities:** `Trade`, `TradingAccount`, `Attachment`, `Strategy`, `TradeTemplate`.
- **Business Rules & Calculations:**
  - Linear Gross P&L computed via `@tradevault/financial-engine`.
  - Advanced mode uses strict FIFO lot matching via `calculateFIFOExecution`.
  - Every trade modification appends an immutable entry to `auditLog` (actions: `CREATED`, `UPDATED`, `CLOSED`, `DUPLICATED`).
  - Closed trades automatically trigger `ChartGeneratorService.ensureTradeSnapshot`, generating permanent SVG snapshots stored in Cloudflare R2 based on user `PatternDetectionSettings` and instrument overrides, eliminating historical visual loss when broker lookback expires.
  - Modifying closed trade execution parameters marks existing snapshots with `isStale: true` until regenerated.
  - Account balances are authoritatively recomputed on every trade creation, update, closure, or deletion.
  - Template performance statistics (total trades, win rate, net P&L, profit factor) are aggregated authoritatively by tenant.

---

## 4. Multi-Fill Execution Matching (FIFO Engine)

- **Status:** **IMPLEMENTED**
- **Purpose:** Accurate P&L and cost basis calculation for scaled entries and partial exits.
- **Problem Solved:** Avoids incorrect average exit math by matching exit lots against open entry lots in strict chronological order.
- **Main User Interactions:** In Advanced Mode, user adds multiple entry lots at different times/prices and records partial exits as the trade progresses.
- **Inputs & Outputs:**
  - *Inputs:* Array of `ITradeFill` objects (`fillId`, `type: 'ENTRY'|'EXIT'`, `price`, `quantity`, `timestamp`, `fees`).
  - *Outputs:* `FIFOSummary` containing realized gross P&L, weighted average entry price, weighted average exit price, remaining open quantity, closed quantity, and individual lot match details.
- **Frontend Components:** [`TradeAdvancedFills.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/form/TradeAdvancedFills.tsx).
- **Backend Services:** [`calculateFIFOExecution`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/fifo.ts).
- **Business Rules & Calculations:**
  - Fills sorted chronologically by timestamp.
  - Each exit lot reduces the earliest open entry lot.
  - If exit quantity exceeds available open entry quantity, engine throws an explicit error (`Exit fill exceeds available open entry lots`).

---

## 5. Psychology & Discipline Tracking

- **Status:** **IMPLEMENTED**
- **Purpose:** Systematic tracking of emotional state, discipline compliance, and trading mistakes with pure rule-based detection.
- **Problem Solved:** Quantifies the monetary cost of emotional undiscipline and automatically detects rule violations (e.g. revenge trading, overtrading, size violations) without external heuristics or telemetry.
- **Main User Interactions:**
  - Rate discipline from 1 to 5 stars (with automated objective scoring baseline).
  - Configure user-level risk guardrails in Settings: `maxDailyLoss`, `maxDailyTrades`, `maxOpenTrades`, `maxRiskPerTradePercent`, `revengeTradingMinutes`.
  - View automated mistake suggestion tooltips on pending trades in Review Queue.
  - Tag emotions before entry, during trade, and after exit (`CALM`, `CONFIDENT`, `ANXIOUS`, `FEARFUL`, `GREEDY`, `FRUSTRATED`, etc.).
  - Toggle discrete mistake flags: **Revenge Trading**, **Overtrading**, **Premature Exit**, **Stop Loss Moved**, **Position Size Violation**.
  - Check checklist completion and rule adherence.
  - View psychology analytics comparing discipline scores and emotional states to net P&L.
- **Frontend Components:**
  - [`TradePsychologyTab.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/form/TradePsychologyTab.tsx)
  - [`SettingsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/SettingsPage.tsx) (Discipline & Risk Guardrails Card)
  - [`AnalyticsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AnalyticsPage.tsx) (Psychology tab)
- **Backend APIs & Services:**
  - `GET /api/v1/review/suggest-mistakes/:tradeId`
  - `GET /api/v1/analytics/psychology`
- **Database Entities:** Embedded `psychology` subdocument in `Trade`, `riskSettings` subdocument in `User`.
- **Business Rules & Calculations:**
  - `detectMistakeSuggestions` evaluates revenge trading (within $N$ minutes of a loss with $\ge$ size), overtrading (daily count or simultaneous open trades), and position sizing violations ($> \text{maxRiskPerTradePercent}$).
  - `checkDailyLossBreach` evaluates cumulative realized losses against daily risk limit.
  - Tracks total monetary loss caused by each mistake flag across closed trades.
  - Computes win rate and net P&L segmented by 1–5 discipline ratings and entry emotions.

---

## 6. Visual Monthly Journal Calendar & Daily Review Queue

- **Status:** **IMPLEMENTED**
- **Purpose:** Calendar-based view of daily trading performance with automated end-of-day session reflection reviews.
- **Problem Solved:** Fosters disciplined daily review routines and eliminates manual friction in synthesizing trade performance and mistakes.
- **Main User Interactions:**
  - Navigate months using previous/next buttons.
  - View daily green (profit) / red (loss) badges with trade counts and net P&L.
  - **Daily Review Queue Widget** on Dashboard: Shows unreviewed trades, unreviewed days, revenge/sizing/volume breakdown chips, and daily loss breach alerts.
  - One-click **"Start Daily Review"** jumps directly into session reflection.
  - **Automated Session Prefill**: Automatically pre-selects suggested best trade ($\max(\text{NetPnL}) > 0$), worst trade ($\min(\text{NetPnL}) < 0$), aggregates mistake tags into removable chips, and derives rule-based discipline rating (1–5).
  - Click any calendar day to open reflection review and view all trades taken on that date.
  - Record market conditions, market bias, discipline rating, best/worst trade links, mistakes, lessons learned, and next-day plan.
- **Inputs & Outputs:**
  - *Inputs:* Year-Month (`YYYY-MM`), daily reflection notes, ratings, biases, linked trades.
  - *Outputs:* Calendar grid data with daily aggregates, review queue status, and detailed journal entries with session prefills.
- **Frontend Components:**
  - [`JournalCalendarPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/JournalCalendarPage.tsx)
  - [`DashboardPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/DashboardPage.tsx) (Review Queue Widget)
- **Backend APIs & Services:**
  - `GET /api/v1/review/queue`
  - `GET /api/v1/review/prefill/:date`
  - `GET /api/v1/journal/calendar?yearMonth=YYYY-MM`
  - `GET /api/v1/journal/:date` (returns journal record and auto-calculated `prefill` session summary)
  - `POST /api/v1/journal/:date` (upserts review)
  - `DELETE /api/v1/journal/:date`
- **Database Entities:** `DailyJournal`, `Trade`, `User`.
- **Business Rules & Calculations:**
  - Dates stored as `YYYY-MM-DD` strings to eliminate timezone shift issues between client and server.
  - Discipline score calculated starting at 5 with penalties: -2 for daily loss breach, -1 for revenge trading, -1 for overtrading, -1 for size violation (clamped to $[1, 5]$).

---

## 6b. Synthesized Weekly Review & Focus Rule Engine

- **Status:** **IMPLEMENTED**
- **Purpose:** Automatically synthesize an entire trading week into a consolidated, immutable report with KPI deltas, quantified behavioural mistake costs, setup reliability rankings, risk guardrail events, and automated evaluation of ONE weekly focus rule.
- **Problem Solved:** Eliminates manual weekend journaling fatigue, holds traders strictly accountable to a single behavioural focus commitment, and identifies bleeding setups and leaks through empirical-Bayes shrunk expectancy.
- **Main User Interactions:**
  - Navigate ISO weeks using previous/next week controls or direct `?week=YYYY-Www` URL query param.
  - Inspect KPI strip with deltas vs the previous week (Net P&L, Win Rate %, Avg Realized R, Profit Factor, Expectancy, Max Drawdown, and R-multiple coverage %).
  - Check whether last week's focus rule was followed, review machine-evaluated target vs actual metrics, and toggle manual adherence overrides if needed.
  - Review top mistakes ranked by exact ₹ loss (sum of $|netPnL|$ where $netPnL < 0$) with one-click drilldown into the flagged trades.
  - Identify best and worst setups (setup templates and strategy playbooks) scored by empirical-Bayes shrunk expectancy ($k=10$), with warning badges when sample size $n < 30$.
  - Monitor discipline ratings across calendar weekdays, daily loss limit breaches, high-tilt sessions ($\ge 61$), overtrading sessions, and count of days without a reflection journal.
  - Analyze performance breakdown by weekday and market session.
  - Accept the deterministic, rule-based focus rule suggestion for the upcoming week (prioritized: loss breach > top mistake cost > setup pause > repeat winner) or select/customize a rule.
  - Record freeform weekly reflection markdown notes (up to 5,000 characters).
  - Save as `DRAFT` or click **"Finalize Week"** (with `ConfirmDialog`) to permanently freeze the mathematical snapshot.
  - Universal drilldown: click any KPI card, mistake row, setup card, risk event chip, or weekday/session row to open `TradeDrillDrawer` with underlying trades.
  - Dashboard integration: on Sundays or when the last ISO week is unfinalized, an alert prompt card guides the trader to finalize their review.
- **Inputs & Outputs:**
  - *Inputs:* ISO week string (`YYYY-Www`), optional `accountId`, focus rule commitment, reflection notes, manual adherence override, draft/finalized status.
  - *Outputs:* `IWeeklyReviewSnapshot` and `IWeeklyReview` with live or frozen metrics and previous focus rule evaluation.
- **Frontend Components:**
  - [`WeeklyReviewPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/WeeklyReviewPage.tsx)
  - [`DashboardPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/DashboardPage.tsx) (Weekly Review Ready prompt card)
  - Navigation in [`AppLayout.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/AppLayout.tsx) (RateReview icon & `W` hotkey)
  - Command in [`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)
- **Backend APIs & Services:**
  - `GET /api/v1/review/weekly?week=YYYY-Www&accountId=...`
  - `GET /api/v1/review/weekly/:week`
  - `POST /api/v1/review/weekly/:week`
  - `GET /api/v1/review/weekly` (list recent 12 reviews)
  - Standalone pure financial engine: [`buildWeeklyReview`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/weekly-review.ts) & [`evaluateFocusRule`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/weekly-review.ts)
- **Database Entities:** `WeeklyReview`, `Trade`, `DailyJournal`, `TradeTemplate`, `Strategy`.
- **Business Rules & Calculations:**
  - Week boundaries computed using ISO-8601 Monday-start in Indian Standard Time (IST, UTC+05:30), fully supporting 53-week years and leap years.
  - Calculations are pure, deterministic, and implemented in `@tradevault/financial-engine` using `Decimal.js` (30 digits, `ROUND_HALF_UP`) with zero floating-point error.
  - Summary metrics use `computeTradeAggregates` so totals reconcile to the exact paisa with `/dashboard/stats` and universal drilldowns.
  - Shrunk expectancy uses Empirical-Bayes shrinkage $E_{shrunk} = \frac{n}{n + k} \bar{X} + \frac{k}{n + k} \mu_{prior}$ with $k=10$ and sample-size warnings for $n < 30$.
  - Focus rule suggestions are 100% deterministic and rule-based (no external AI/telemetry).
  - Snapshot is mutable while in `DRAFT`; setting `FINALIZED` freezes the calculation permanently.

---

## 7. Interactive Risk & Position Sizing Calculator

- **Status:** **IMPLEMENTED**
- **Purpose:** Pre-trade position sizing and risk/reward modeling.
- **Problem Solved:** Prevents over-leveraging and account blow-ups by enforcing mathematical risk budgets and instrument-specific lot rounding.
- **Main User Interactions:**
  - Input account equity (or auto-pull from selected account).
  - Choose between Percentage Risk (e.g., 1%) or Fixed Monetary Risk (e.g., ₹2,000).
  - Select instrument (automatically loads contract multiplier, lot size, and tick size).
  - Enter entry price, initial stop loss, and target price.
  - View raw suggested quantity, rounded lot quantity, estimated loss at stop, and planned R:R.
  - Click **"Transfer to Trade Form"** to push calculated parameters directly into a new trade entry modal.
- **Inputs & Outputs:**
  - *Inputs:* `IRiskCalculationParams` (equity, risk %, entry, stop, target, lot size, multiplier).
  - *Outputs:* `IRiskCalculationResult` (suggested lots, monetary loss, warnings).
- **Frontend Components:** [`RiskCalculatorPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/RiskCalculatorPage.tsx).
- **Backend APIs & Services:**
  - `POST /api/v1/risk/calculate`
  - Standalone engine: [`calculateRiskAndPositionSize`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/risk.ts)
- **Business Rules & Calculations:**
  - Floors raw quantity to the nearest integer multiple of `lotSize` or `quantityIncrement`.
  - Warns if stop distance is zero or invalid for trade direction (e.g. stop above entry for a LONG trade).
  - Warns if minimum lot size exceeds intended risk budget.

---

## 8. Strategy Playbook Management

- **Status:** **IMPLEMENTED**
- **Purpose:** Creation, documentation, and quantitative evaluation of trading strategies.
- **Problem Solved:** Enables traders to verify whether their setups have statistical edge.
- **Main User Interactions:**
  - Create/edit strategy playbooks with asset classes, timeframes, entry rules, stop-loss rules, target rules, invalidation criteria, and checklists.
  - Pre-seeded with 13 comprehensive institutional strategy playbooks across F&O, MCX, and Price Action (including 6 specialized Liquidity and S/R playbooks).
  - View real-time aggregated strategy performance: total trades, win rate, net P&L, and profit factor.
  - Associate trades with strategies via dropdown in trade logging modal.
- **Frontend Components:** [`StrategyPlaybookPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/StrategyPlaybookPage.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/strategies` (aggregates closed trade stats via MongoDB `$facet`/`$group`)
  - `POST /api/v1/strategies`
  - `GET /api/v1/strategies/:id`
  - `PUT /api/v1/strategies/:id`
  - `DELETE /api/v1/strategies/:id`
- **Database Entities:** `Strategy`, `Trade`.

---

## 9. Private Chart Screenshot Attachments

- **Status:** **IMPLEMENTED**
- **Purpose:** Secure local storage and visualization of trade chart screenshots.
- **Problem Solved:** Keeps chart intellectual property private on local disk while providing rich visual trade reviews.
- **Main User Interactions:**
  - Multi-file drag and drop or direct clipboard paste (`Ctrl+V` / `Cmd+V`) up to 12 images per trade.
  - Automatic stage categorization on paste/drop (`SETUP` -> `ENTRY` -> `EXIT` -> `REVIEW`).
  - Add timeframe and captions.
  - View full-resolution lightbox gallery with zoom and category badges.
  - Delete attachments.
- **Inputs & Outputs:**
  - *Inputs:* Image files (PNG, JPEG, WebP, max 10MB).
  - *Outputs:* Persisted object in private Cloudflare R2 bucket, attachment record in MongoDB, authenticated download/stream URLs.
- **Frontend Components:**
  - [`TradeScreenshotGallery.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/attachments/TradeScreenshotGallery.tsx)
  - [`TradeAttachmentUploader.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/attachments/TradeAttachmentUploader.tsx)
  - [`ChartImageViewerDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/attachments/ChartImageViewerDialog.tsx)
- **Backend APIs & Services:**
  - `POST /api/v1/attachments/trades/:tradeId/upload`
  - `GET /api/v1/attachments/trades/:tradeId`
  - `PUT /api/v1/attachments/:id`
  - `GET /api/v1/attachments/:id/download`
  - `GET /api/v1/attachments/:id/stream`
  - `DELETE /api/v1/attachments/:id`
- **Database Entities:** `Attachment`, `Trade`.
- **Business Rules & Calculations:**
  - Validates file magic bytes (signatures) to block disguised executable files.
  - Maximum 12 attachments per trade.
  - Files unlinked from disk upon deletion.

---

## 10. Instruments & Market Specifications

- **Status:** **IMPLEMENTED**
- **Purpose:** User-owned instrument definitions with precise multipliers, lot sizes, and tick sizes — strictly limited to instruments the user has traded or created.
- **Problem Solved:** Ensures correct monetary calculations across Indian Equities, Index F&O, MCX Commodities, Forex, and Crypto without cluttering the UI with global presets, catalogs, or unused seeded instruments.
- **Main User Interactions:**
  - View user-only instruments table enriched with live trading summaries (total trade count, first & last traded timestamps, net P&L).
  - Review auto-created instruments: symbols traded for the first time automatically create an underlying instrument (`source: 'AUTO'`). Unknown instruments flag a "Review specs" badge (`needsReview: true`) for user verification.
  - One instrument per underlying: options contracts (strikes, expiries, CE/PE) map to their parent underlying instrument (`NIFTY`, `BANKNIFTY`, etc.).
  - Create custom instruments with specific contract multipliers, lot sizes, and tick sizes (`source: 'CUSTOM'`).
  - Edit instrument specifications with optional trade cascading: view real-time impact preview (`POST /preview-update` showing affected trades and financial P&L delta), confirm with cascade dialog (`applyToTrades: true`), recalculating trade metrics via `@tradevault/financial-engine` and authoritatively reconciling account balances.
  - Delete unused instruments: safe deletion blocked with 409 Conflict if trades reference the instrument.
- **Frontend Components:** [`InstrumentsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/InstrumentsPage.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/instruments` (returns only user-owned traded and custom instruments with trade summaries)
  - `POST /api/v1/instruments` (creates custom instrument)
  - `POST /api/v1/instruments/:id/preview-update` (previews financial impact on existing trades)
  - `PUT /api/v1/instruments/:id` (updates specs, cascades to trades when `applyToTrades: true`, reconciles account balances)
  - `DELETE /api/v1/instruments/:id` (validates trade references, returns 409 Conflict if in use)
- **Database Entities:** `Instrument`, `Trade`.

---

## 11. Reports, Smart Broker CSV Import & Export, and Data Portability

- **Status:** **IMPLEMENTED**
- **Purpose:** Complete data ownership, backup, historical migration, and frictionless broker tradebook import.
- **Problem Solved:** Prevents vendor lock-in, eliminates manual entry of historical broker executions, automatically aggregates raw fills into round-trip trades, computes statutory regulatory charges, and offers reversible batch imports.
- **Main User Interactions:**
  - Export filtered trades to CSV or full JSON.
  - Upload broker CSV tradebooks (Zerodha, FYERS, Angel One, Upstox, or custom).
  - Review auto-detected broker format, execution mode (FIFO fills vs completed trades), and saved column mapping.
  - Option to save customized column mappings per broker.
  - Commit import with automatic FIFO position matching and duplicate detection.
  - One-click "Undo Last Import" or historical batch undo with instant account balance recalculation.
- **Frontend Components:** [`ReportsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/ReportsPage.tsx), [`ConfirmDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/ui/ConfirmDialog.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/export/csv`
  - `GET /api/v1/export/json`
  - `POST /api/v1/export/import/preview`
  - `POST /api/v1/export/import/commit`
  - `POST /api/v1/export/import/undo`
  - `GET /api/v1/export/import/batches`
  - `GET /api/v1/export/mappings`
  - `POST /api/v1/export/mappings`
  - `AccountService.recalculateAccountBalances()`
- **Database Entities:** `Trade`, `TradingAccount`, `BrokerImportMapping`.
- **Business Rules & Calculations:**
  - Heuristic broker format detection from tradebook CSV header signatures.
  - Sequential FIFO fill matching for scale-ins and exits using `@tradevault/financial-engine`.
  - Regulatory charges computed via `IndianChargesCalculator` (exchange turnover charges, SEBI fees, stamp duty, STT/CTT, GST).
  - Duplicate check prevents importing identical executions.
  - Batch tracking via `importBatchId` enables atomic reversals.
  - Reconciles account balances authoritatively after import completion or batch undo.

---

## 12. Performance Analytics & Dashboard

- **Status:** **IMPLEMENTED**
- **Purpose:** Quantitative metrics and visual reporting.
- **Problem Solved:** Replaces subjective performance impressions with exact statistical indicators.
- **Metrics Calculated:**
  - Net Realized P&L, Gross P&L, Total Costs
  - Win Rate, Loss Rate, Profit Factor, Expectancy
  - Average Winning Trade vs Average Losing Trade
  - Peak-to-Trough Drawdown (Monetary & Percentage)
  - Current Streak, Max Consecutive Wins, Max Consecutive Losses
  - Average Holding Time in minutes
  - Rule adherence percentage
  - Cumulative equity curve
  - Performance by weekday, session, instrument, and strategy
  - P&L distribution histogram buckets
- **Frontend Components:** [`DashboardPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/DashboardPage.tsx), [`AnalyticsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AnalyticsPage.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/dashboard/stats`
  - Calculation Engine: [`calculateDashboardMetrics`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/metrics.ts)

---

## 13. FYERS Broker Integration

- **Status:** **IMPLEMENTED**
- **Purpose:** Read-only FYERS API v3 tradebook and funds synchronization with explicit user-controlled reconciliation.
- **Implemented Features:**
  - Per-user App ID/Secret configuration with AES-256-GCM encryption at rest.
  - Short-lived hashed OAuth state, daily token expiry handling, and encrypted access/refresh tokens.
  - Tradebook sync with FIFO round-trip grouping and statutory charge calculation.
  - Per-account FYERS linking and funds snapshot persistence.
  - `PENDING_REVIEW` balance adjustments when broker `Clear Balance` drifts beyond tolerance; confirm/reject workflow recalculates balances only on confirmation.
  - No order placement, modification, or cancellation.
- **CSV Alternative:** FYERS tradebook and cash-ledger imports remain available without API authorization.
- **Documentation:** See `docs/BROKER_INTEGRATIONS.md` and `docs/FYERS_INTEGRATION.md`.

---

## 14. Demo Mode & Seed Engine

- **Status:** **IMPLEMENTED**
- **Purpose:** High-fidelity simulation of realistic trading histories for product demonstration and test validation.
- **Problem Solved:** Allows users and evaluators to test all features with rich data without exposing real money or broker credentials.
- **Key Capabilities:**
  - 8 distinct trader profiles (A through H) across 5 density levels (minimal to stress).
  - Deterministic PRNG seeding (Mulberry32).
  - Generates synthetic TradingView-style SVG candlestick charts.
  - Safe demo reset script (`npm run seed:reset`) wiping only demo records.
  - Automated integrity validator (`npm run seed:validate`).
- **Frontend & CLI Components:**
  - CLI: `npm run db:seed`, `npm run seed:reset`, `npm run seed:validate`.
  - Engine: [`SetupMintSeedEngine`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/seed/seed-engine.ts).

---

## 15. Excursion Analytics & Execution Quality

- **Status:** **IMPLEMENTED**
- **Purpose:** FYERS historical candlestick-powered Maximum Favorable Excursion (MFE), Maximum Adverse Excursion (MAE), Exit Efficiency, and post-stop reversal detection.
- **Problem Solved:** Pinpoints whether stop-losses were set too tightly inside liquidity pools, trades exited prematurely before reaching full potential, or large floating gains were surrendered before closing.
- **Key Capabilities:**
  - **MFE & MAE Calculation:** Evaluates exact high/low ticks across 1-minute (and 5-minute) historical candles strictly within trade lifecycle timestamps.
  - **Exit Efficiency Rating:** Measures captured profit as a percentage of maximum favorable run.
  - **Diagnostic Badges:** Automated heuristics detect `GAVE_BACK_PROFIT`, `STOP_TOO_TIGHT_EVIDENCE`, `EXITED_EARLY`, and `HELD_INTO_REVERSAL`.
  - **Interactive Execution Quality Tab:** Recharts Scatter Plot (`maeR` vs `mfeR`) with win/loss color differentiation and hover trade inspection.
  - **Trade Detail Excursion Card:** Displays MFE, MAE, R multiples, Exit Efficiency progress bar gauge, and one-click compute/recompute button.
  - **Strategy Variant Metrics:** Variant performance buckets report Average MFE (R), Average MAE (R), and Exit Efficiency.
  - **Batch Backfill Tooling:** In-app Settings backfill trigger and CLI script (`npm run excursion:backfill`).
- **Frontend & Backend Components:**
  - Frontend: `TradeDetailPage.tsx`, `AnalyticsPage.tsx`, `StrategyVariantAnalyticsPage.tsx`, `SettingsPage.tsx`.
  - Backend: `excursion.ts` (`@tradevault/financial-engine`), `TradeCandleSnapshot` model, `/trades/:id/excursion/compute`, `/integrations/fyers/excursion-backfill`, `/analytics/excursion`.

---

## 16. Multi-Panel Performance Equity View

- **Status:** **IMPLEMENTED**
- **Purpose:** Synchronized multi-tier performance analysis integrating absolute currency curves, cumulative R-multiples, drawdown underwater profiles, strategy comparisons, forward Monte Carlo projections, and emotional/risk event markers.
- **Problem Solved:** Sizing variation and account capital changes often distort currency equity curves. This view decouples edge evaluation (in R) from capital growth (in money), while exposing historical recovery durations and future statistical dispersion cones.
- **Key Capabilities:**
  - **Synchronized Dual-Panel Layout:** Uses Recharts `syncId="setupmint-equity-sync"` to synchronize crosshair coordinates between the main equity curve and the underwater drawdown panel.
  - **Money vs R-Curve Toggle:** Switch seamlessly between Money Curve (₹/$), Cumulative-R Curve, or a synchronized dual-axis Both view.
  - **R-Coverage Indicator:** Transparently displays the percentage of trades with valid initial risk budgets included in the R calculation.
  - **Per-Strategy Overlays:** Select and overlay up to 6 distinct strategy curves simultaneously, with automated sample-size warnings (`< 30 trades`).
  - **Monte Carlo Expectancy Cone:** Projects 1,000 deterministic bootstrap simulations over 50, 100, or 200 future trades using `Mulberry32PRNG`, displaying P5, P25, P50, P75, and P95 percentile bands (strictly gated on positive edge verification).
  - **Psychological & Risk Event Markers:** Pinpoints daily loss limit breach days and high-tilt days ($\ge 61$) directly on the equity curve.
  - **Direct Trade Drilldown:** Every curve point and event marker is clickable, launching the underlying trade(s) directly in the Universal `TradeDrillDrawer`.
- **Frontend & Backend Components:**
  - Frontend: [`MultiPanelEquityCurve.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/dashboard/MultiPanelEquityCurve.tsx), [`DashboardPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/DashboardPage.tsx).
  - Backend: `GET /api/v1/dashboard/equity-curves`, `drawdown.ts`, `cumulative-r.ts`, `monte-carlo.ts`, `events.ts`.

---

## 17. Universal Trade Drill-Down System

- **Status:** **IMPLEMENTED**
- **Purpose:** Comprehensive, zero-discrepancy trade traceability across all visual surfaces in SetupMint.
- **Problem Solved:** Eliminates disconnected numbers in dashboards and reports. The user never sees a metric, chart point, table row, or distribution bar that cannot be instantly traced back to its raw trade executions.
- **Key Capabilities:**
  - **Unified Drill Descriptor Contract:** Strongly typed contract (`DrillDescriptor`: `kind: 'TRADE' | 'TRADES' | 'FILTER'`) in `@tradevault/shared` powering single-trade lookups, explicit trade sets, and dynamic filtered trade groups.
  - **Authoritative Resolver Endpoint:** `POST /api/v1/trades/drilldown` resolves any descriptor with strict user-tenant isolation, server-side pagination (capped at 200), and 30-digit Decimal aggregate reconciliation (`totalCount`, `sumNetPnL`, `avgNetPnL`, `sumRealizedR`, `avgRealizedR`, `winCount`, `lossCount`, `breakevenCount`, `winRatePercent`).
  - **Universal Drawer Component (`TradeDrillDrawer`):** Mounted globally in `AppLayout.tsx`. Features responsive design (620px right-hand drawer on desktop, bottom sheet on mobile `< 900px`), full single-trade view with attachments and action buttons, sortable multi-trade table view, and keyboard navigation (`j` / `k` for next/previous trade, `Esc` to close).
  - **URL Synchronization & Deep Linking:** Serializes active descriptors into `?drill=...` query parameters, supporting instant page reloads and shareable deep links.
  - **Ubiquitous Surface Wiring:**
    - *Dashboard:* Net P&L card, Win Rate card, Profit Factor/Expectancy card, Max Drawdown card, Daily Loss Breach alert, Performance by Instrument table, Performance by Strategy table, Daily Review Queue, and Recent Trades.
    - *Multi-Panel Equity Curve:* Equity points, drawdown points, daily loss breach markers, and high-tilt markers.
    - *Analytics:* Drawdown coordinates, P&L distribution histogram buckets, discipline score rows, emotion rows, mistake cards, weekday rows, session rows, excursion summary cards, and MAE/MFE scatter dots.
    - *What-If Simulator:* Baseline evaluable trades, mean R, net P&L, distribution bars, and simulation cell inspector.
    - *Strategy Playbooks & Analytics:* Playbook strategy cards, edge validation chips, "Trades" action button, and strategy variant closed trade counts / view trade actions.
    - *Journal Calendar:* Monthly trade execution totals, calendar day trade count badges, Daily Review dialog drawer button, and individual trade rows.
    - *Instruments:* Master instrument trade count cells and net P&L cells.
- **Frontend & Backend Components:**
  - Shared: `DrillDescriptor`, `IDrilldownAggregate`, `IDrilldownResponse` in `@tradevault/shared`.
  - Backend: [`trade-query.service.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/services/trade-query.service.ts), `POST /api/v1/trades/drilldown`, `reconciliation.ts`.
  - Frontend: [`TradeDrillContext.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/context/TradeDrillContext.tsx), [`TradeDrillDrawer.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/drilldown/TradeDrillDrawer.tsx).

---

## 18. Live Open Trade Watcher & Execution Monitor

- **Status:** **IMPLEMENTED**
- **Purpose:** Real-time floating MTM, unrealized $R$-multiple, and dynamic Stop Loss / Target proximity monitoring for open discretionary trades.
- **Problem Solved:** Open positions without live tracking induce execution anxiety, delay reaction when stops are threatened, and leave traders uncertain about exact live P&L and net charges until manual close.
- **Key Capabilities:**
  - **Live Floating MTM & Statutory Charges Calculation:**
    - Real-time Gross P&L, estimated Indian statutory regulatory charges (STT, exchange turnover fees, SEBI charges, stamp duty, GST), and floating Net P&L computed using pure 30-digit `Decimal.js` math with `Decimal.ROUND_HALF_UP`.
    - Handles both `SIMPLE` and `ADVANCED` trade execution modes, currency contracts, and tick sizes.
  - **Real-Time Unrealized $R$ Multiple:**
    - Evaluates floating Net P&L relative to the trade's initial planned risk budget (`plannedRiskAmount` or `plannedStopLoss`).
  - **Stop Loss Proximity & Threat Warning System:**
    - Real-time distance to initial Stop Loss measured in both points and ticks (`(LTP - SL) / tickSize`).
    - Dynamic threat level evaluation based on remaining risk buffer:
      - `SAFE`: $> 50\%$ buffer remaining.
      - `ATTENTION`: $\le 50\%$ buffer remaining.
      - `CRITICAL`: $\le 25\%$ buffer remaining.
      - `BREACHED`: Stop loss reached or exceeded ($\le 0$ buffer remaining).
      - `NO_STOP`: Handled gracefully when no stop loss was defined.
  - **Target Proximity & Visual Journey Progress:**
    - Real-time distance to profit target in points and ticks.
    - Clamped percentage progress bar ($0\%$ to $100\%$) tracking the price journey from entry to target.
  - **Live Broker Feeds & Simulated Tick Fallback:**
    - Multi-provider architecture fetching batch quotes from FYERS Data API v3 (`/quotes?symbols=...`) using AES-256-GCM encrypted tokens.
    - Seamless fallback to deterministic micro-fluctuation simulation (`SIMULATED` provider tag) when markets are closed or broker session is unauthenticated, ensuring smooth workflow testing.
  - **Ubiquitous Visual Surfaces:**
    - **Global Watcher Banner:** Integrated into [`DashboardPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/DashboardPage.tsx) (above KPI cards) and [`TradesPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradesPage.tsx) (above ledger filter bar) with pulsating live beacon, auto-refresh interval selector (`Off`, `1s`, `2s`, `5s`, `10s`, `30s`), dual-view mode switcher (`Cockpit Cards` vs `Compact Table View`), aggregate open trade count, total floating Net MTM, portfolio unrealized R, and expandable position cockpits.
    - **Top-Mounted Action Cockpit & Split 2-Column Layout:** Eliminates vertical scrolling by placing high-speed execution controls (`Close 100% @ LTP`, `Book 50%`, `Lock BE`, `Adjust SL`) right beneath the symbol and MTM ticker at the top of each card. Employs a responsive split card structure with vital signs on the left and tactical strategy inspector sub-tabs (`🪜 Scaling Ladder` vs `🛡️ Giveback Radar`) on the right.
    - **Ultra-Dense Multi-Position Table View:** Single-row tabular layout displaying instrument, side, entry, LTP, floating MTM, stop buffer, target progression, giveback alerts, and instant 1-click execution actions (`Book 50%`, `Close 100%`, `Lock BE`, `⚙️ Rules`). Features fixed column width and `nowrap` typography, eliminating vertical and horizontal clipping.
    - **Single-Trade Live Execution Monitor:** Mounted directly in [`TradeDetailPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradeDetailPage.tsx) for open trades, featuring large monospace LTP and Net MTM readouts, dynamic color states, risk threat chips, target progress bar, and instant manual quote refresh.
    - **Lot-Aware Indian F&O Scaling:** Resolves contract lot sizes dynamically (e.g. NIFTY=65/25/50/75, BANKNIFTY=15/30, FINNIFTY=25/40, MIDCPNIFTY=50, SENSEX=10). Guaranteed whole-lot calculations prevent invalid fractional order rejections on exchange/FYERS (e.g. 130 units = 2 lots of 65; 1 lot cannot be split).
    - **Custom Scaling Ladder & Auto-Execution Engine (`LiveCustomRulesDialog.tsx`):**
      - User-configurable R-multiples for T1, T2, T3 (e.g., +1.0R, +1.5R, +2.0R, +3.0R) and custom exit ratios (30%, 50%, 70%, or custom lots).
      - User-selectable trailing actions: **True BE with Fees Protected**, **Nominal BE**, **Custom Points**, or **Trail to Previous Step Target**.
      - User-controlled **Auto-Execution Switch**: When enabled, automatically transmits partial exits to FYERS API and modifies live trailing stop losses as price milestones are hit in real time.
    - **True Breakeven Calculation Including Fees (`charges.ts`):** 30-digit precision math calculating the exact price at which Gross P&L covers all estimated brokerage, STT/CTT, exchange turnover, GST, and SEBI charges, ensuring Net P&L = ₹0 upon stop hit.
    - **Live Profit Giveback Meter & Leak Alerts (`LiveGivebackMeter.tsx`):** Real-time gauge monitoring peak floating MTM vs current MTM, displaying ₹/R giveback, retention percentage, and threat alert levels (`SAFE`, `WATCH`, `LEAKING`, `CRITICAL_REVERSAL`).
    - **Active FYERS Live Order Execution:** 1-click True Breakeven lock, lot-aware partial exits, live trailing stop modification, and full market close with automatic pending SL orderbook cancellation.
- **Frontend & Backend Components:**
  - Shared: `ILiveQuote`, `ILiveOpenTradeMetric`, `ILiveWatcherSummary`, `StopThreatLevel`, `LiveQuoteProvider`, `GivebackThreatLevel`, `ILiveGivebackMetric`, `TargetLadderStepStatus`, `ILiveTargetLadderStep`, `ILiveTargetLadder`, `ICustomLadderRuleStep`, `ICustomLadderRules` in [`packages/shared/src/types.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/types.ts).
  - Engine: `live-watcher.ts`, `charges.ts` in [`packages/financial-engine/src/`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/).
  - Backend API: `live-watcher.service.ts`, `fyers.service.ts`, `POST /trades/:id/broker-sl`, `POST /trades/:id/broker-exit`, `POST /trades/:id/broker-ladder-step`, `GET /trades/live/watcher`, `GET /trades/:id/live`.
  - Frontend: [`LiveOpenTradeWatcher.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/live/LiveOpenTradeWatcher.tsx), [`LiveCustomRulesDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/live/LiveCustomRulesDialog.tsx), [`LiveScalingLadder.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/live/LiveScalingLadder.tsx), [`LiveGivebackMeter.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/live/LiveGivebackMeter.tsx), [`ExecuteLadderStepDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/live/ExecuteLadderStepDialog.tsx), [`QuickCloseTradeDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx).

---

### Module 17: MFE Reach Funnel & Round-Trip Loss Prevention
- **Status:** **COMPLETE & VERIFIED**
- **Problem Solved:** Traders frequently hold winning trades that reach significant profit (e.g. +1.5R to +3.0R) only to let them reverse into losses because of lack of trailing discipline or objective giveback rules.
- **Key Capabilities:**
  - **Excursion Reach Funnel:** Evaluates what proportion of trades reach $\ge +0.5R, +1.0R, +1.5R, +2.0R, +2.5R, +3.0R$ maximum favorable excursion during their lifecycle.
  - **Win Conversion Efficiency:** Calculates the percentage of trades that, having reached a given R milestone, actually close as profitable trades versus decaying into scratch or negative trades.
  - **Round-Trip Loss Quantifier:** Identifies trades that reached $\ge +1.0R$ MFE but closed at a loss ($P&L < 0$), quantifying exact total surrendered R-multiples and monetary losses in ₹.
  - **Dynamic Actionable Insights:** Surfaces specific operational recommendations (e.g. "Critical Giveback Alert: 38% of trades reaching +1.0R closed negative. Locking breakeven at +1.0R would have saved ₹42,500").
- **Frontend & Backend Components:**
  - Engine: `calculateMfeReachFunnel` in [`packages/financial-engine/src/excursion-analytics.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/excursion-analytics.ts).
  - Shared: `IMfeReachStep`, `IMfeReachFunnel` in [`packages/financial-engine/src/excursion-analytics.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/excursion-analytics.ts).
  - Frontend: Funnel breakdown and round-trip loss card mounted in [`AnalyticsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AnalyticsPage.tsx) under the Execution Quality tab.

---

### Module 18: Core Institutional Strategy Playbooks & Seeder
- **Status:** **COMPLETE & VERIFIED**
- **Problem Solved:** Traders starting on SetupMint lack structured, institutional playbooks with pre-defined rules, variant setups, and checklists.
- **Key Capabilities:**
  - **4 Institutional Playbooks:**
    1. **Intraday Index Trend Following:** EMA alignment, BOS pullback entry, trailing stop along 15m structure.
    2. **Opening Range Breakout (ORB):** First 15m session boundary break, high volume filter, tight risk budget.
    3. **Mean Reversion Fade:** Extreme standard deviation exhaustion at liquidity sweep levels (equal highs/lows).
    4. **High-Probability Expiry Scalping:** 0DTE gamma scalp targeting Open Interest walls with strict time stops.
  - **Automated Seeding CLI:** Standalone script `npx tsx apps/api/src/scripts/seed-komal-strategies.ts` creating strategies, variants, confluences, entry/exit criteria, and psychological checklists idempotently.



