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
  - Automatic Indian statutory charges calculation (`calculateIndianCharges` in `@tradevault/financial-engine`) with live `TradeCalculationBanner` recomputation, "Auto" badge, manual fee override detection, and "Reset to auto" action.
  - Persistent preference memory: remembers last-used account, strategy, symbol, workflow mode, and execution mode.
  - Quick Close action on `/trades` and `/trades/:id` for OPEN/PLANNED trades via [`QuickCloseTradeDialog`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx): prompts for exit price, exit time, optional exit fees, auto-computes round-trip statutory charges, and live Net P&L.
  - Global Command Palette ([`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)) accessible via `Cmd+K` / `Ctrl+K` with quick actions:
    - *Log New Trade (`N`)*
    - *Repeat Last Trade (`R`)*: Instantly clones the most recent trade via `POST /api/v1/trades/:id/duplicate`.
    - *Jump to Today's Journal (`J`)*
    - *Open Risk Calculator (`C`)*
    - *Jump to Page*: Instant filter and jump to any view.
  - Strategy-aware entry: selecting a strategy playbook pre-populates `thesis.confluences` with the strategy's checklist/entry rules, and verifies `plannedRewardRiskRatio >= strategy.minRiskReward` (displays warning banner if R:R threshold is breached).
  - Search, filter by account, symbol, asset class, direction, status, outcome, and date range.
  - Pagination and sorting.
  - Trade duplication, bulk tagging, and bulk deletion.
- **Inputs & Outputs:**
  - *Inputs:* Account ID, symbol, asset class, direction (`LONG`/`SHORT`), status (`PLANNED`/`OPEN`/`CLOSED`/`CANCELLED`), entry/exit prices, lots/quantity, contract multiplier, fees breakdown, confluences, emotions, mistakes.
  - *Outputs:* Persisted trade document, calculated gross/net P&L, itemized statutory charges, realized R-multiple, outcome classification.
- **Frontend Components:**
  - [`TradesPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradesPage.tsx)
  - [`TradeDetailPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradeDetailPage.tsx)
  - [`TradeFormModal.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeFormModal.tsx)
  - [`QuickCloseTradeDialog.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/QuickCloseTradeDialog.tsx)
  - [`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)
  - Sub-components: `TradeQuickSection`, `TradeAdvancedFills`, `TradeCalculationBanner`, `TradeJournalDetails`, `TradeTemplateSelector`.
- **Backend APIs & Services:**
  - `GET /api/v1/trades` (supports filtering, sorting, pagination)
  - `POST /api/v1/trades`
  - `GET /api/v1/trades/:id`
  - `PUT /api/v1/trades/:id` (supports partial simple execution payload for quick closing)
  - `DELETE /api/v1/trades/:id` (unlinks private files from disk and recalculates account balance)
  - `POST /api/v1/trades/:id/duplicate`
  - `POST /api/v1/trades/bulk-tag`
  - `POST /api/v1/trades/bulk-delete`
- **Database Entities:** `Trade`, `TradingAccount`, `Attachment`, `Strategy`.
- **Business Rules & Calculations:**
  - Linear Gross P&L computed via `@tradevault/financial-engine`.
  - Advanced mode uses strict FIFO lot matching via `calculateFIFOExecution`.
  - Every trade modification appends an immutable entry to `auditLog` (actions: `CREATED`, `UPDATED`, `CLOSED`, `DUPLICATED`).
  - Account balances are authoritatively recomputed on every trade creation, update, closure, or deletion.

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
- **Purpose:** Systematic tracking of emotional state, discipline compliance, and trading mistakes.
- **Problem Solved:** Quantifies the monetary cost of emotional undiscipline (e.g., revenge trading, moving stop losses).
- **Main User Interactions:**
  - Rate discipline from 1 to 5.
  - Tag emotions before entry, during trade, and after exit (`CALM`, `CONFIDENT`, `ANXIOUS`, `FEARFUL`, `GREEDY`, `FRUSTRATED`, etc.).
  - Toggle discrete mistake flags: **Revenge Trading**, **Overtrading**, **Premature Exit**, **Stop Loss Moved**, **Position Size Violation**.
  - Check checklist completion and rule adherence.
  - View psychology analytics comparing discipline scores and emotional states to net P&L.
- **Frontend Components:**
  - [`TradePsychologyTab.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/form/TradePsychologyTab.tsx)
  - [`AnalyticsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AnalyticsPage.tsx) (Psychology tab)
- **Backend APIs & Services:**
  - `GET /api/v1/analytics/psychology`
- **Database Entities:** Embedded `psychology` subdocument in `Trade`.
- **Business Rules & Calculations:**
  - Tracks total monetary loss caused by each mistake flag across closed trades.
  - Computes win rate and net P&L segmented by 1–5 discipline ratings and entry emotions.

---

## 6. Visual Monthly Journal Calendar

- **Status:** **IMPLEMENTED**
- **Purpose:** Calendar-based view of daily trading performance with daily reflection logging.
- **Problem Solved:** Fosters daily review routines and provides instant visual heatmaps of profitable vs. losing trading sessions.
- **Main User Interactions:**
  - Navigate months using previous/next buttons.
  - View daily green (profit) / red (loss) badges with trade counts and net P&L.
  - Click any day to open the day's reflection review and view all trades taken on that date.
  - Record market conditions, market bias, discipline rating, best/worst trade links, mistakes, and next-day plan.
- **Inputs & Outputs:**
  - *Inputs:* Year-Month (`YYYY-MM`), daily reflection notes, ratings, biases.
  - *Outputs:* Calendar grid data with daily aggregates and detailed journal entries.
- **Frontend Components:** [`JournalCalendarPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/JournalCalendarPage.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/journal/calendar?yearMonth=YYYY-MM`
  - `GET /api/v1/journal/:date`
  - `POST /api/v1/journal/:date` (upserts review)
  - `DELETE /api/v1/journal/:date`
- **Database Entities:** `DailyJournal`, `Trade`.
- **Business Rules & Calculations:** Dates stored as `YYYY-MM-DD` strings to eliminate timezone shift issues between client and server.

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
  - *Outputs:* Persisted file on disk (`./data/uploads/<uuid>.<ext>`), attachment record in MongoDB, authenticated download/stream URLs.
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

## 10. Instrument Catalog & Market Specifications

- **Status:** **IMPLEMENTED**
- **Purpose:** Multi-market instrument definitions with precise multipliers, lot sizes, and tick sizes.
- **Problem Solved:** Ensures correct monetary calculations across Indian Equities, Index F&O, MCX Commodities, Forex, and Crypto.
- **Main User Interactions:**
  - Browse global preset instruments (NIFTY, BANKNIFTY, FINNIFTY, RELIANCE, HDFCBANK, CRUDEOIL, NATURALGAS, GOLD, COPPER, EURUSD, BTCUSDT).
  - Create custom instruments with specific contract multipliers and tick sizes.
  - Edit or delete custom instruments.
- **Frontend Components:** [`InstrumentsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/InstrumentsPage.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/instruments` (merges system presets with user custom records)
  - `POST /api/v1/instruments`
  - `PUT /api/v1/instruments/:id`
  - `DELETE /api/v1/instruments/:id`
- **Database Entities:** `Instrument`.

---

## 11. Reports, CSV Import & Export, and Data Portability

- **Status:** **IMPLEMENTED**
- **Purpose:** Complete data ownership, backup, and historical migration.
- **Problem Solved:** Prevents vendor lock-in and allows importing past trade history from broker CSV exports.
- **Main User Interactions:**
  - Export filtered trades to CSV or full JSON.
  - Upload broker CSV, preview detected rows, and map columns interactively.
  - Commit import with automatic duplicate detection.
- **Frontend Components:** [`ReportsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/ReportsPage.tsx).
- **Backend APIs & Services:**
  - `GET /api/v1/export/csv`
  - `GET /api/v1/export/json`
  - `POST /api/v1/export/import/preview`
  - `POST /api/v1/export/import/commit`
- **Database Entities:** `Trade`, `TradingAccount`.
- **Business Rules & Calculations:**
  - Automatically maps common column headers (Date, TradeDate, Symbol, Ticker, BuySell, Price, Qty, Fees).
  - Duplicate check prevents importing identical executions.
  - Reconciles account balances authoritatively after import completion.

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

## 13. FYERS Broker Integration Architecture

- **Status:** **PARTIALLY IMPLEMENTED (Architecturally Modeled & Isolated)**
- **Purpose:** Normalized broker execution schema and reconciliation layer for automated sync.
- **Existing Implementation:**
  - Decoupled `IBrokerAdapter` interface and `INormalizedExecution` schema in `@tradevault/shared`.
  - Database collection `BrokerIntegration` storing connection status and sync history.
  - Config endpoints `GET /api/v1/integrations/fyers/status` and `POST /api/v1/integrations/fyers/config`.
  - Realistic FYERS brokerage calculation (flat ₹20/order) in `IndianChargesCalculator`.
  - Comprehensive documentation in `docs/FYERS_INTEGRATION.md`.
- **Status of Live Sync:** **DISABLED BY DESIGN** in release 1.0 to preserve complete local offline privacy and protect users from third-party broker API volatility.
- **Intended Future Behavior:** Automated daily pull of order books and trade books via FYERS API v3 with interactive reconciliation screen.

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
