# SetupMint — Routes & Pages Specification

This document details all routes and pages discovered in the **SetupMint** frontend application ([`apps/web/src/App.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/App.tsx)), grounded in the actual React components and routing tree.

---

## 1. Route Inventory Summary

| Route Path | Page Component | Access | Layout | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `LoginPage` | Public (Guest) | Minimal (No nav) | User login via email & password |
| `/register` | `RegisterPage` | Public (Guest) | Minimal (No nav) | User account registration |
| `/` | `DashboardPage` | Authenticated | `AppLayout` | Executive performance overview & equity curve |
| `/trades` | `TradesPage` | Authenticated | `AppLayout` | Master trade ledger with filtering & bulk actions |
| `/trades/:id` | `TradeDetailPage` | Authenticated | `AppLayout` | In-depth trade review, fills, and screenshot gallery |
| `/journal` | `JournalCalendarPage` | Authenticated | `AppLayout` | Monthly P&L calendar heatmap & daily reflection reviews |
| `/review/weekly` | `WeeklyReviewPage` | Authenticated | `AppLayout` | Synthesized weekly review, focus rule evaluation & setup metrics |
| `/analytics` | `AnalyticsPage` | Authenticated | `AppLayout` | Deep-dive psychology, weekday, and session analytics |
| `/strategies` | `StrategyPlaybookPage` | Authenticated | `AppLayout` | Strategy playbook creation & rule adherence evaluation |
| `/risk-calculator` | `RiskCalculatorPage` | Authenticated | `AppLayout` | Pre-trade position sizing with one-click form transfer |
| `/accounts` | `AccountsPage` | Authenticated | `AppLayout` | Multi-broker account ledgers, cash flows & reconciliation |
| `/instruments` | `InstrumentsPage` | Authenticated | `AppLayout` | Instrument specifications, lot sizes & contract multipliers |
| `/reports` | `ReportsPage` | Authenticated | `AppLayout` | CSV/JSON export and interactive CSV import with mapping |
| `/settings` | `SettingsPage` | Authenticated | `AppLayout` | User profile, theme, password change & system status |
| `*` | Catch-all redirect | Any | None | Redirects to `/` |

---

## 2. Detailed Route Specifications

### 1. `/login` — Login Page
- **Page Component:** [`LoginPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/LoginPage.tsx)
- **Purpose:** User authentication via email and password.
- **Main Components:** Card container, `SetupMintLogo`, login form, submit button with spinner, navigation link to `/register`.
- **Available Actions:** Enter credentials, submit form, toggle demo credentials prefill button, navigate to register.
- **Forms & Dialogs:** Login form (email, password).
- **Data Displayed:** Brand logo, tagline, error alert on failed authentication.
- **API Calls:** `POST /api/v1/auth/login`.
- **Database Models:** `User`, `Session`.
- **Auth & Access:** Public; redirects to `/` if user is already authenticated.
- **Status:** **IMPLEMENTED**.

---

### 2. `/register` — Register Page
- **Page Component:** [`RegisterPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/RegisterPage.tsx)
- **Purpose:** New user account creation.
- **Main Components:** Card container, `SetupMintLogo`, registration form, submit button with spinner, navigation link to `/login`.
- **Available Actions:** Enter name, email, password, select base currency (`INR`, `USD`, `EUR`, `GBP`), submit form.
- **Forms & Dialogs:** Registration form.
- **Data Displayed:** Input fields, currency selector, validation error alerts.
- **API Calls:** `POST /api/v1/auth/register`.
- **Database Models:** `User`, `Session`.
- **Auth & Access:** Public; redirects to `/` upon successful registration and cookie issuance.
- **Status:** **IMPLEMENTED**.

---

### 3. `/` — Dashboard Overview Page
- **Page Component:** [`DashboardPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/DashboardPage.tsx)
- **Purpose:** Executive high-level performance metrics, multi-panel synchronized performance view (equity, drawdown, cumulative-R, strategy overlays, Monte Carlo expectancy cone, risk event markers), daily review queue, and quick access to recent trade activity.
- **Main Components:**
  - **KPI Stat Cards (with One-Click Trade Drilldown):** Net Realized P&L, Win Rate, Profit Factor & Expectancy, Max Drawdown. Clicking any KPI card immediately launches the Universal `TradeDrillDrawer` pre-filtered to the relevant trades.
  - **Multi-Panel Performance Equity Curve ([`MultiPanelEquityCurve.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/dashboard/MultiPanelEquityCurve.tsx)):**
    - Synchronized dual-panel Recharts system via `syncId="setupmint-equity-sync"`.
    - **Panel 1: Equity / R Performance Curve:**
      - View toggle: Money Curve (₹ / $), Cumulative-R Curve, or Both synchronized.
      - R-Multiple Coverage indicator pill (`N_R / N_total`).
      - Up to 6 Per-Strategy Cumulative-R Overlays with sample-size warning badges (`< 30 trades`).
      - Forward Monte Carlo Expectancy Cone displaying P5, P25, P50, P75, and P95 percentile envelopes for 50, 100, or 200 projected trades (deterministic via Mulberry32 PRNG, edge-gated).
      - Event Markers for Daily Loss Breaches (pulsing crimson) and High-Tilt Days ($\ge 61$, amber).
      - Clicking any curve point or event marker immediately opens the underlying trade(s) in `TradeDrillDrawer`.
    - **Panel 2: Synchronized Underwater / Drawdown Curve:**
      - Real-time underwater area fill below high-water mark.
      - Metrics strip: Current Drawdown, Max Peak-to-Trough Drawdown, and Longest Recovery Duration (both in calendar days and trade count).
      - Clicking any drawdown coordinate drills into the drawdown trade.
  - **Daily Review Queue Card Widget:**
    - Active review status banner showing pending unreviewed trades and unreviewed trading days.
    - Daily Loss Breach Banner (red alert if today's net loss exceeds user's configured `maxDailyLoss`) with direct drilldown.
    - Review breakdown chips: Total Pending, Revenge Risk, Sizing Violations, High Volume.
    - Pending Trades Table: Symbol, Direction, Net P&L, Suggested Mistake tags with hover tooltips, and "Review" action button.
    - "Start Daily Review" primary action button: One-click jump to `/journal` with the unreviewed date preloaded.
  - Performance by Instrument & Performance by Strategy breakdown tables with clickable drilldown rows.
  - Quick Actions Bar: "Log New Trade", "Risk Calculator", "Daily Review".
  - Recent Trades Table with clickable rows launching the drilldown drawer.
  - Global Date Range Filter ([`DateRangeFilter.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/ui/DateRangeFilter.tsx)): 14 presets (Today, Yesterday, 7D, 30D, 90D, This Week, Last Week, This Month, Last Month, This Quarter, YTD, This FY, Last FY, All Time) plus Custom Range popover with start/end inputs, calendar picker, and inline validation. Persisted via URL query params (`?from=YYYY-MM-DD&to=YYYY-MM-DD&range=PRESET`).
- **Available Actions:** Change date range filter via presets or custom popover, select global account filter, toggle Money/R/Both equity views, toggle strategy overlays, change Monte Carlo projection steps, click any chart point or table row to drill down into trades (carrying the active date range into drilldown filters), click "Log New Trade", navigate to trade details.
- **API Calls:**
  - `GET /api/v1/dashboard/stats?accountId=...&startDate=...&endDate=...`
  - `GET /api/v1/dashboard/equity-curves?accountId=...&startDate=...&endDate=...&overlayStrategies=...&coneTrades=...`
  - `POST /api/v1/trades/drilldown` (via `useTradeDrilldown`, carrying active `startDate` & `endDate`)
  - `GET /api/v1/trades?accountId=...&limit=5&sortBy=tradeDate&sortOrder=desc`
  - `GET /api/v1/review/queue`
- **Database Models:** `Trade`, `TradingAccount`, `DailyJournal`, `User`.
- **Loading / Empty States:** Skeleton loaders for KPI cards and charts; empty state with "No trades recorded yet" button; review queue complete banner ("All trades reviewed!").
- **Auth & Access:** Authenticated (Protected by `ProtectedRoute`).
- **Status:** **IMPLEMENTED**.

---

### 4. `/trades` — Master Trades Ledger Page
- **Page Component:** [`TradesPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradesPage.tsx)
- **Purpose:** Searchable, filterable ledger of all trades with pagination, bulk operations, quick close, and full audit logs.
- **Main Components:**
  - Filter Toolbar: Search input (symbol/title/notes), Direction filter (Long/Short), Outcome filter (Win/Loss/Breakeven/Open), Asset Class filter, Status filter.
  - Master Table: Date, Symbol, Direction, Asset Class, Quantity, Entry Price, Exit Price, Net P&L, Realized R, Discipline Score, Attachments Count, Action buttons (Quick Close, View Details, Duplicate, Delete).
  - Bulk Actions Toolbar: Select all checkbox, Bulk Tagging button, Bulk Delete button.
  - Pagination Controls: Page size selector (25, 50, 100), previous/next page navigation.
  - Modals: `TradeFormModal`, `QuickCloseTradeDialog` (compact exit dialog for OPEN/PLANNED trades), `ConfirmDialog` for single delete and bulk delete, Bulk Tag dialog.
- **Available Actions:** Search, filter, paginate, sort by column, quick close position, open trade detail, open edit modal, duplicate trade, delete trade, bulk tag, bulk delete.
- **API Calls:**
  - `GET /api/v1/trades?page=...&limit=...&search=...&direction=...&outcome=...`
  - `PUT /api/v1/trades/:id` (Quick Close: exit price, exit time, optional exit fees)
  - `POST /api/v1/trades/:id/duplicate`
  - `DELETE /api/v1/trades/:id`
  - `POST /api/v1/trades/bulk-tag`
  - `POST /api/v1/trades/bulk-delete`
- **Database Models:** `Trade`, `TradingAccount`, `Attachment`.
- **Status:** **IMPLEMENTED**.

---

### 5. `/trades/:id` — Trade Detail & Audit Page
- **Page Component:** [`TradeDetailPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradeDetailPage.tsx)
- **Purpose:** In-depth post-trade analysis, execution fills inspection, technical thesis, psychological notes, chart gallery, quick close, and immutable audit trail.
- **Main Components:**
  - Trade Header: Symbol, asset class, direction, status, trade title, net P&L badge, R-multiple badge, Quick Close button (for OPEN/PLANNED positions).
  - Metrics Cards: Gross P&L, Total Costs Breakdown (brokerage, exchange, regulatory, taxes), ROI %, holding time.
  - Primary Interactive Candlestick Chart ([`TradeInteractiveChart.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/TradeInteractiveChart.tsx)):
    - TradingView Lightweight Charts v5 candlestick series, volume histogram, execution window shaded band (`AreaSeries`), stop loss trail steps (`LineSeries` with `LineType.WithSteps`).
    - Dynamic timeframe switching (`1m`, `5m`, `15m`, `30m`, `1h`, `1D`) with adaptive default (`5m` for duration <= 4h, `15m` for > 4h).
    - Horizontal price levels: SL (red), TP (green), Planned Entry (grey dashed), Weighted Average Entry, +1R/+2R/+3R target ladders, liquidity sweeps.
    - Interactive overlay controls persisted to `localStorage`, fullscreen toggle, reset zoom, dark/light theme synchronization.
    - Underlying index proxy fallback badge (`isUnderlyingFallback`) and permanent SVG fallback when broker lookback expires.
  - Tabbed Sections:
    - *Execution Tab:* Simple execution details or FIFO fills breakdown with lot match pairs.
    - *Risk & Planning Tab:* Initial stop loss, planned target, planned R:R, actual quantity vs suggested quantity.
    - *Thesis & Confluences Tab:* Pre-market bias, market structure, entry confirmation, SMC technical confluences.
    - *Psychology & Discipline Tab:* Emotions before/during/after, discipline rating (1–5), mistake tags, rules followed, lessons learned.
    - *Excursion Analytics & Execution Quality Card:* Maximum Favorable Excursion (MFE), Maximum Adverse Excursion (MAE), Exit Efficiency progress bar gauge, diagnostic flags (`GAVE_BACK_PROFIT`, `STOP_TOO_TIGHT_EVIDENCE`, `EXITED_EARLY`), post-stop reversal alerts, and interactive recompute action.
    - *Automated Execution Charts Generator Panel:* Multi-timeframe execution chart generator with multi-select timeframes ('Auto', '1m', '5m', '15m', '30m', '1h', '1D'; max 5), customizable pre-entry and post-exit candle padding controls, slot limit usage counter (12 cap), "Replace existing charts" toggle, and inline per-timeframe results breakdown.
    - *Saved Snapshots & Visual Review Gallery ([`TradeScreenshotGallery.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/trades/attachments/TradeScreenshotGallery.tsx)):* Permanent historical SVG snapshots and user uploads with lightbox inspection, clipboard paste (Ctrl+V / Cmd+V), staleness indicators with one-click regeneration, `settingsSource` attribution, and timeframe badges (`1m` through `1D`).
    - *Audit Trail:* Immutable log of creation, updates, quick closures, and balance adjustments.
- **Available Actions:** Quick close trade (via `QuickCloseTradeDialog`), edit trade (opens `TradeFormModal`), duplicate trade, delete trade, compute excursion metrics, generate multi-timeframe execution charts, regenerate stale snapshots, upload additional screenshots (drag & drop / clipboard paste), view full-resolution charts.
- **API Calls:**
  - `GET /api/v1/trades/:id`
  - `GET /api/v1/trades/:id/interactive-candles`
  - `PUT /api/v1/trades/:id` (Quick Close: exit price, exit time, optional exit fees)
  - `POST /api/v1/trades/:id/excursion/compute`
  - `POST /api/v1/trades/:id/chart/generate`
  - `POST /api/v1/attachments/trades/:id/upload`
  - `DELETE /api/v1/attachments/:attachmentId`
  - `DELETE /api/v1/trades/:id`
- **Database Models:** `Trade`, `Attachment`, `TradingAccount`, `Strategy`, `TradeCandleSnapshot`.
- **Status:** **IMPLEMENTED**.

---

### 6. `/journal` — Visual Monthly Calendar Page
- **Page Component:** [`JournalCalendarPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/JournalCalendarPage.tsx)
- **Purpose:** Monthly calendar heatmap and daily session reflection review with automated prefill and complete trade drilldown.
- **Main Components:**
  - Monthly Calendar Grid: 7-day columns (Sun–Sat) with green/red P&L badges, trade counts, and journal status indicators. Clicking any trade count or badge opens the day's trades in `TradeDrillDrawer`.
  - Month Switcher: Previous month, next month, current month title.
  - Month Summary Cards: Total Monthly P&L, Total Trades (clickable drilldown into all month trades), Win Days vs Loss Days.
  - Daily Reflection Drawer/Dialog: Opens when clicking any calendar day or navigating via `?date=YYYY-MM-DD`:
    - "Drill All in Drawer" button to inspect all day trades in `TradeDrillDrawer`.
    - Daily Loss Breach Alert Banner: Displays if daily loss exceeded user limit, with breach amount.
    - Trade Session Summary: Net P&L, Total Trades, Win Count, Loss Count.
    - Automated Session Prefill:
      - Best Trade selector (pre-selects trade with highest Net P&L $> 0$).
      - Worst Trade selector (pre-selects trade with lowest Net P&L $< 0$).
      - Aggregated Mistake Tags: Automatically aggregates mistake tags from individual session trades into interactive chips with one-click removal.
      - Rule-Based Discipline Rating: Calculated 1–5 stars with indicator of rule infractions.
    - Lists all trades taken on that day with individual P&Ls, suggested mistake chips, and one-click drawer drilldown.
    - Reflection form: Market conditions, Market bias (Bullish/Bearish/Neutral), Emotional state, Discipline rating (1–5), Best trade, Worst trade, Mistake tags, Lessons learned, Next day plan.
- **Available Actions:** Switch month, click day cell to inspect trades, prefill session reflection, select best/worst trade, add/remove mistake tags, submit daily reflection, delete daily reflection, open trades in drilldown drawer.
- **API Calls:**
  - `GET /api/v1/journal/calendar?yearMonth=YYYY-MM`
  - `GET /api/v1/journal/:date` (returns journal record and auto-calculated `prefill` session data)
  - `POST /api/v1/trades/drilldown`
  - `POST /api/v1/journal/:date`
  - `DELETE /api/v1/journal/:date`
- **Database Models:** `DailyJournal`, `Trade`, `User`.
- **Status:** **IMPLEMENTED**.

---

### 6b. `/review/weekly` — Weekly Review & Focus Rule Synthesis Page
- **Page Component:** [`WeeklyReviewPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/WeeklyReviewPage.tsx)
- **Purpose:** Synthesize an entire trading week into one cohesive report, measure adherence to last week's single focus rule, review behavioural mistake costs and setup rankings (via empirical-Bayes shrunk expectancy), and establish ONE deterministic focus rule commitment for next week.
- **Main Components (Strict Sequential Layout):**
  1. *Week Selector & Header:* Prev/Next ISO week navigation, badge (e.g. `2026-W43`), IST date boundaries (`Oct 19 – Oct 25, 2026`), `DRAFT` / `FINALIZED` status chip with freeze timestamp, Save Draft button, Finalize Week button.
  2. *KPI Strip with Deltas:* Net P&L (₹), Win Rate (%), Avg Realized R, Profit Factor / Max Drawdown with deltas vs previous week and R-multiple coverage %.
  3. *Last Week's Rule Card:* Followed / Not Followed / Unmeasured status chip, rule commitment text, automated evaluation note, and manual adherence override toggle.
  4. *Top Mistakes by ₹ Cost:* Ranked list of mistakes by quantified loss (sum of $|netPnL|$ where $netPnL < 0$), trade count, and one-click universal drilldown into trades.
  5. *Best / Worst Setups:* Setup template & strategy rankings calculated using empirical-Bayes shrunk expectancy with sample-size warning badges ($n < 30$).
  6. *Discipline & Risk Guardrails:* Average discipline score with trend direction (`IMPROVED`, `DECLINED`, `STABLE`), daily ratings strip, daily loss breach counter, high-tilt sessions ($\ge 61$), overtrading sessions, and unjournaled days.
  7. *Weekday & Session Breakdown:* Reconciled net P&L and win rate tables for weekdays and market sessions.
  8. *Next Week's Focus Rule:* Suggested rule generated by objective priority order (daily loss breach > top mistake cost > setup pause > repeat winner) or custom rule picker.
  9. *Reflection Notes:* Multi-line markdown reflection journal (up to 5,000 characters).
  10. *Finalize Week Action:* `ConfirmDialog` confirmation to freeze the mathematical snapshot permanently into an immutable historical record.
- **Drilldown Support:** Every single number, card, row, and chip is clickable and dispatches `openDrill(...)` with `kind: 'TRADES'` or `kind: 'FILTER'`.
- **API Calls:**
  - `GET /api/v1/review/weekly?week=YYYY-Www&accountId=...`
  - `POST /api/v1/review/weekly/:week`
  - `POST /api/v1/trades/drilldown` (via `useTradeDrilldown`)
- **Database Models:** `WeeklyReview`, `Trade`, `DailyJournal`, `TradeTemplate`, `Strategy`.
- **Status:** **IMPLEMENTED**.

---

### 7. `/analytics` — Quantitative Analytics & Psychology Page
- **Page Component:** [`AnalyticsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AnalyticsPage.tsx)
- **Purpose:** Advanced statistical breakdown across trading psychology, timeframes, instruments, strategies, weekdays, sessions, and candle-replay simulation — with universal trade drilldown across all metrics and charts.
- **Main Components:**
  - Sub-Navigation Tabs: Overview, Psychology & Discipline, Time & Sessions, Execution Quality (MAE/MFE), What-If Simulation.
  - Universal Drilldown Integration:
    - *Overview Tab:* P&L distribution histogram buckets (clicking any bar opens underlying trades within the exact ₹ range), drawdown curve coordinates, instrument rows, and strategy rows.
    - *Psychology Tab:* Discipline rating bars (1 to 5), emotion before entry rows, and mistake impact cards with one-click drilldown into trades flagged with that mistake.
    - *Time Tab:* Weekday performance rows and trading session rows (NSE Regular, MCX Evening, etc.).
    - *Execution Quality Tab:* Recharts Scatter Plot (`maeR` vs `mfeR`) with clickable dots; summary KPI cards for Avg MFE, Avg MAE, Exit Efficiency %, % Gave Back Profit, and % Reversal After Stop Hit.
    - *What-If Simulation Tab:* Baseline metric cards (Evaluable Trades, Actual Mean R, Actual Net P&L), distribution bars, and cell inspector drawer with "Drill Down Evaluated Trades" action.
- **API Calls:**
  - `GET /api/v1/dashboard/stats?accountId=...`
  - `GET /api/v1/analytics/psychology?accountId=...`
  - `GET /api/v1/analytics/excursion?accountId=...`
  - `POST /api/v1/trades/drilldown` (via `useTradeDrilldown`)
- **Database Models:** `Trade`, `TradingAccount`, `TradeCandleSnapshot`.
- **Status:** **IMPLEMENTED**.

---

### 8. `/strategies` — Strategy Playbooks & Trade Templates Hub
- **Page Component:** [`StrategyPlaybookPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/StrategyPlaybookPage.tsx)
- **Purpose:** Discretionary execution playbook management and rule-driven trade setup template catalog with empirical edge tracking and direct trade drilldown.
- **Main Components:**
  - **Top Tab Switcher:**
    - Tab 1: **"Execution Playbooks"** (Strategic frameworks, entry/exit rules, invalidation, checklists).
    - Tab 2: **"Trade Setup Templates"** (Market-based entry patterns, SL rules, min R:R, prefill patterns, and live trade edge metrics).
  - **Execution Playbooks Tab:**
    - Strategy Cards Grid: Name, Description, Asset Classes, Min R:R, Total Trades, Win Rate %, Net P&L, Profit Factor. Clicking "Trades ({count})" or the performance summary strip immediately opens the strategy's trades in `TradeDrillDrawer`.
    - Strategy Modal: Name, description, asset classes, timeframes, entry rules, stop-loss rules, target rules, invalidation criteria, pre-trade checklist items.
  - **Trade Setup Templates Tab:**
    - Market Category Pills: `All`, `F&O Intraday`, `Stocks & Cash`, `Forex & Gold`, `Crypto`, `Commodities (MCX)`, `Price Action / Any Market`, `Custom`.
    - Search Input & Favorite Quick Filter.
    - Template Cards Grid: Setup name, category badge, direction chip (`LONG` / `SHORT`), linked strategy playbook chip, mathematical stop-loss rule pill (`PERCENT`, `POINTS`, `PREMIUM_PERCENT`, `MANUAL`), minimum R:R target, active time window, dynamic title pattern, confluence tags, checklist items.
    - Performance Edge Banner on each card: Real-time aggregated win rate %, profit factor, net P&L, and total trades linked to the template with one-click drilldown.
    - Action Buttons: Favorite toggle star, "Apply in Form", "Clone & Customize", "Edit", "Delete" (built-ins protected as read-only).
    - Custom Template Dialog: Name, description, market group, compatible asset classes, direction, target strategy name, stop loss rule mode & value/hint, min R:R, dynamic title pattern (`{symbol}`, `{side}`), tags, confluences, checklists, time window, expiry-day-only toggle, target trading session.
- **Available Actions:**
  - Switch tabs via URL query param (`?tab=templates`).
  - Create, edit, delete execution playbooks.
  - Create, edit, clone, delete custom trade setup templates.
  - Star / unstar favorite templates.
  - View real-time aggregated edge statistics for both playbooks and templates.
- **API Calls:**
  - `GET /api/v1/strategies`, `POST /api/v1/strategies`, `GET /api/v1/strategies/:id`, `PUT /api/v1/strategies/:id`, `DELETE /api/v1/strategies/:id`
  - `GET /api/v1/templates`, `POST /api/v1/templates`, `GET /api/v1/templates/:id`, `PUT /api/v1/templates/:id`, `DELETE /api/v1/templates/:id`, `POST /api/v1/templates/:id/favorite`, `POST /api/v1/templates/:id/use`
- **Database Models:** `Strategy`, `TradeTemplate`, `Trade`.
- **Status:** **IMPLEMENTED**.


---

### 9. `/risk-calculator` — Risk & Position Sizing Calculator
- **Page Component:** [`RiskCalculatorPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/RiskCalculatorPage.tsx)
- **Purpose:** Mathematical pre-trade position sizing, lot rounding, and direct transfer into the trade entry modal.
- **Main Components:**
  - Account & Capital Parameters: Select Account, Account Equity, Risk Mode (Percentage % vs Fixed Monetary Amount ₹).
  - Instrument & Price Inputs: Symbol selector (auto-populates lot size & multiplier), Direction (Long/Short), Entry Price, Stop Loss Price, Target Price, Estimated Costs.
  - Calculated Output Cards: Planned Risk Budget, Stop Distance, Loss Per Unit, Raw Suggested Quantity, **Rounded Lot Quantity**, Estimated Monetary Loss at Stop, Estimated Reward, Reward-to-Risk Ratio.
  - Warning Banners: Zero stop distance, stop on wrong side of entry, minimum lot exceeds risk budget.
  - **"Transfer to Trade Form" Button:** Opens `TradeFormModal` with all parameters prefilled.
- **Available Actions:** Adjust parameters, observe real-time calculations, click transfer button.
- **API Calls:** Uses client-side `@tradevault/financial-engine` directly for instantaneous calculations; queries accounts and instruments for dropdowns.
- **Database Models:** `TradingAccount`, `Instrument`.
- **Status:** **IMPLEMENTED**.

---

### 10. `/accounts` — Multi-Broker Accounts Page
- **Page Component:** [`AccountsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AccountsPage.tsx)
- **Purpose:** Ledger management for multi-broker accounts, cash deposits, withdrawals, and balance reconciliation.
- **Main Components:**
  - Account Cards: Broker badge, Account Type, Initial Balance, Realized P&L, Deposits, Withdrawals, Net Adjustments, Current Balance, FYERS link status, and Status (Active/Archived).
  - Add Account Modal: Name, broker, account number, account type, initial balance.
  - Record Transaction Modal: Deposit / Withdrawal, amount, date, notes.
  - FYERS Link Modal: Link a FYERS account to the connected client.
  - Reconciliation Modal: Latest funds snapshot, drift suggestion, and confirm/reject actions.
  - Reconcile Button: Triggers server-side authoritative balance recalculation from raw trade records.
- **Available Actions:** Add account, edit account, archive/delete account, add transaction, link/unlink FYERS, sync funds, review pending adjustments, reconcile balance.
- **API Calls:**
  - `GET /api/v1/accounts`
  - `POST /api/v1/accounts`
  - `POST /api/v1/accounts/:id/transactions`
  - `POST /api/v1/accounts/:id/broker-link`
  - `DELETE /api/v1/accounts/:id/broker-link`
  - `POST /api/v1/accounts/:id/sync-funds`
  - `GET /api/v1/accounts/:id/pending-transactions`
  - `POST /api/v1/accounts/:id/transactions/:txId/confirm`
  - `POST /api/v1/accounts/:id/transactions/:txId/reject`
  - `POST /api/v1/accounts/:id/reconcile`
  - `DELETE /api/v1/accounts/:id`
- **Database Models:** `TradingAccount`, `AccountTransaction`, `BrokerFundsSnapshot`, `Trade`.
- **Status:** **IMPLEMENTED**.

---

### 11. `/instruments` — Instruments & Contract Specifications Page
- **Page Component:** [`InstrumentsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/InstrumentsPage.tsx)
- **Purpose:** Centralized contract specifications and trading statistics for ONLY instruments the user has traded or explicitly created. No global presets or unused catalogs are shown.
- **Main Components:**
  - Single Traded Instruments Table: Underlying Symbol (with "Review specs" badge if auto-created from fallback), Display Name, Asset Class, Exchange, Contract Multiplier, Lot Size, Tick Size, Trades Count, Net Realized P&L, Last Traded Date, Source (`AUTO` | `CUSTOM`), and Actions.
  - Empty State: When user has 0 instruments, informs user instruments are created automatically on first trade or can be added manually.
  - Create Custom Instrument Modal: Add new instrument with custom multiplier, lot size, tick size, and precision.
  - Edit Instrument Modal with Cascading Updates: Allows updating multiplier, lot size, etc., with "Apply to all N existing trades" checkbox (default ON when trades exist).
  - Cascade Financial Impact Confirmation: Calls `POST /instruments/:id/preview-update` to display previous vs new net P&L and net difference before authoritatively reconciling account balances.
- **Available Actions:** Search instruments, create custom instrument, edit specifications with optional trade cascade recalculation, delete unused instruments (blocked if trades exist).
- **API Calls:**
  - `GET /api/v1/instruments`
  - `POST /api/v1/instruments`
  - `POST /api/v1/instruments/:id/preview-update`
  - `PUT /api/v1/instruments/:id` (with `applyToTrades: boolean`)
  - `DELETE /api/v1/instruments/:id`
- **Database Models:** `Instrument`, `Trade`, `TradingAccount`.
- **Status:** **IMPLEMENTED**.

---

### 12. `/reports` — Reports & Data Portability Page
- **Page Component:** [`ReportsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/ReportsPage.tsx)
- **Purpose:** Data export (CSV/JSON), smart broker tradebook import, FYERS cash-ledger import, FIFO round-trip matching, automated fee calculations, saved column mappings, and reversible batch imports.
- **Main Components:**
  - Export Section: Account filter, date range filter, "Export CSV" and "Export JSON" action buttons.
  - Import Mode Toggle: Tradebook imports vs FYERS cash-ledger imports.
  - Ledger Options: Target account, net-flow preview, deposit/withdrawal/adjustment counts, duplicate and error counts.
  - Smart Import Section: File dropzone, auto-detected broker badge (`ZERODHA`, `FYERS`, `ANGEL_ONE`, `UPSTOX`, `CUSTOM`), execution mode indicator (Raw Executions / FIFO vs Completed Trades), saved custom mapping chip, broker preset switcher, "Save as default mapping" checkbox.
  - Column Mapping Grid: 10 field selectors (`tradeDate`, `symbol`, `direction`, `price`, `quantity`, `entryPrice`, `exitPrice`, `orderId`, `tradeId`, `notes`).
  - Preview Table: Top 10 parsed CSV rows.
  - Import Results Banner: Displays unique `batchId`, imported trade count, duplicate skipped count, per-row error list, and an immediate "Undo Import" button.
  - Recent Import Batches: Interactive table showing trade and ledger batches with counts, timestamps, symbols, net amounts/P&L, and an "Undo Batch" action with confirmation dialog.
- **Available Actions:** Export CSV/JSON, upload tradebook or ledger CSV, map columns, commit import, undo import batch.
- **API Calls:**
  - `GET /api/v1/export/csv`
  - `GET /api/v1/export/json`
  - `POST /api/v1/export/import/preview`
  - `POST /api/v1/export/import/commit`
  - `POST /api/v1/export/import/undo`
  - `GET /api/v1/export/import/batches`
  - `GET /api/v1/export/mappings`
  - `POST /api/v1/export/mappings`
- **Database Models:** `Trade`, `TradingAccount`, `BrokerImportMapping`.
- **Status:** **IMPLEMENTED**.

---

### 13. `/settings` — Application Settings Page
- **Page Component:** [`SettingsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/SettingsPage.tsx)
- **Purpose:** Profile management, theme customization, discipline & risk guardrails configuration, security password updates, FYERS configuration, and system diagnostic overview.
- **Main Components:**
  - Profile Card: Name, Email (read-only), Base Currency selector (`INR`, `USD`, `EUR`, `GBP`).
  - **Discipline & Risk Guardrails Card:**
    - Maximum Daily Loss limit (INR) with breach detection toggle.
    - Maximum Daily Trades cap (overtrading threshold).
    - Maximum Open Trades concurrent position limit.
    - Maximum Risk Per Trade (% of account equity).
    - Revenge Trading Cool-Off Window (minutes after a losing trade).
    - Interactive "Save Risk Settings" persistence with feedback snackbars.
  - Appearance Card: Theme toggle (Dark, Light, System).
  - Security Card: Change password form (current password, new password min 8 characters).
  - FYERS Broker Integration Card: App ID and secret inputs, dynamic callback URL, connection status, saved-secret/token-expiry/funds-sync chips, and connect/disconnect/sync actions.
  - System Diagnostic Card: Database engine status, total trades count, total accounts, total attachments, privacy mode verification.
- **Available Actions:** Save profile, update discipline & risk guardrails, switch theme, update password, save FYERS credentials, connect/disconnect FYERS, sync trades, logout.
- **API Calls:**
  - `GET /api/v1/settings/profile`
  - `PUT /api/v1/settings/profile`
  - `POST /api/v1/settings/change-password`
  - `GET /api/v1/settings/system-status`
  - `GET /api/v1/integrations/fyers/status`
  - `POST /api/v1/integrations/fyers/config`
  - `GET /api/v1/integrations/fyers/login-url`
  - `POST /api/v1/integrations/fyers/sync`
  - `POST /api/v1/integrations/fyers/disconnect`
  - `POST /api/v1/auth/logout`
- **Database Models:** `User`, `BrokerIntegration`, `Trade`, `TradingAccount`, `Attachment`.
- **Status:** **IMPLEMENTED**.

---

## 3. Global Application Shell & Command Palette

- **Component:** [`AppLayout.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/AppLayout.tsx)
- **Command Palette:** [`CommandPalette.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/components/layout/CommandPalette.tsx)
- **Shortcuts:**
  - `Cmd+K` or `Ctrl+K`: Toggle global Command Palette modal from any screen.
  - `N`: Quick-open Log New Trade modal (when no text input is focused).
  - `↑` / `↓` / `↵` / `Esc`: Keyboard-driven palette selection and execution.
- **Command Palette Actions:**
  - **Quick Actions:**
    - `Log New Trade` (`N`): Opens `TradeFormModal` with auto fees and instrument metadata.
    - `Repeat Last Trade` (`R`): Automatically queries the latest logged trade and duplicates it via `POST /api/v1/trades/:id/duplicate`, resetting timestamps to now and status to `OPEN` for instant re-entry.
    - `Jump to Today's Journal` (`J`): Navigates directly to `/journal` for daily reflections.
    - `Open Risk Calculator` (`C`): Navigates directly to `/risk-calculator`.
  - **Page Navigation:** Search and jump to any view: Overview (`/`), Trades (`/trades`), Journal (`/journal`), Analytics (`/analytics`), Strategies (`/strategies`), Risk Calculator (`/risk-calculator`), Accounts (`/accounts`), Instruments (`/instruments`), Reports (`/reports`), Settings (`/settings`).
- **Status:** **IMPLEMENTED**.

---

## 4. Global vs. Local Date Range Filter Architecture

SetupMint implements a unified, reusable `DateRangeFilter` component and `DateRangeContext` holding `{ preset, startDate, endDate }`. The active filter state is synchronized with URL search parameters (`?from=YYYY-MM-DD&to=YYYY-MM-DD&range=PRESET`) following the pattern established by `TradeDrillContext` (`?drill=...`).

### Page Scope Decisions:
1. **Global Views (URL query synced, cross-navigable):**
   - **Dashboard Overview (`/`):** KPI cards, multi-panel equity curves, daily P&L bar chart, performance by instrument, and performance by strategy. All KPI and breakdown drilldowns carry active `startDate` & `endDate` into the `FILTER` descriptor to ensure exact aggregate reconciliation.
   - **Master Trades Ledger (`/trades`):** Queries filtered by inclusive `tradeDate` range; CSV export link automatically downloads the active range.
   - **Analytics (`/analytics`):** All 5 sub-tabs (Overview Drawdown Curve, Psychology & Discipline Correlations, Time & Weekday Heatmaps, Execution Quality MAE/MFE, and What-If Simulator) inherit the active date range.
   - **Strategy Playbook & Variant Analytics (`/strategies`, `/strategies/:id/analytics`):** Playbook stats and variant breakdowns filter trades inside the range.
   - **Reports & Export (`/reports`):** CSV and JSON export links stream trades inside the active date range.
   - **Instruments (`/instruments`):** Traded volume and execution counts calculate over the active range.

2. **Local / Fixed Views (Excluded from Global Date Range):**
   - **Journal Calendar (`/journal`):** Stays strictly month-based using `?yearMonth=YYYY-MM` to maintain the monthly calendar heatmap UI paradigm.
   - **Daily Review Queue (`/review/queue`):** Stays fixed to the last 30 calendar days of unreviewed sessions to prevent old unreviewed trades from being hidden by a narrow date range.
