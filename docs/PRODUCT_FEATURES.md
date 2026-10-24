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
  - [`TradeFormModal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeFormModal.tsx)
  - [`MarketTemplateBar.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/form/MarketTemplateBar.tsx)
  - [`QuickCloseTradeDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx)
  - [`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)
  - Sub-components: `TradeQuickSection`, `TradeAdvancedFills`, `TradeCalculationBanner`, `TradeJournalDetails`, `TradeTemplateSelector`.
- **Backend APIs & Services:**
  - `GET /api/v1/trades` (supports filtering by `templateId`, sorting, pagination)
  - `POST /api/v1/trades` (persists `templateId` and increments template usage count)
  - `GET /api/v1/trades/:id`
  - `PUT /api/v1/trades/:id` (supports partial simple execution payload for quick closing)
  - `DELETE /api/v1/trades/:id` (unlinks private files from disk and recalculates account balance)
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

