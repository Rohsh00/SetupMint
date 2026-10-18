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
- **Purpose:** Executive high-level performance metrics, equity curve chart, and quick access to recent trade activity.
- **Main Components:**
  - KPI Stat Cards: Net Realized P&L, Win Rate, Profit Factor, Expectancy, Max Drawdown, Total Costs, Current Streak, Rule Adherence.
  - Interactive Recharts Equity Curve Area Chart with cumulative equity and peak drawdown tracking.
  - Quick Actions Bar: "Log New Trade", "Risk Calculator", "Daily Review".
  - Recent Trades Table with symbol, direction, P&L badge, and outcome.
  - Date Range Quick Filters (7D, 30D, 90D, YTD, All Time).
- **Available Actions:** Change date range filter, select global account filter, click "Log New Trade" (opens `TradeFormModal`), navigate to trade details.
- **API Calls:**
  - `GET /api/v1/dashboard/stats?accountId=...&startDate=...`
  - `GET /api/v1/trades?accountId=...&limit=5&sortBy=tradeDate&sortOrder=desc`
- **Database Models:** `Trade`, `TradingAccount`.
- **Loading / Empty States:** Skeleton loaders for KPI cards and charts; empty state with "No trades recorded yet" button.
- **Auth & Access:** Authenticated (Protected by `ProtectedRoute`).
- **Status:** **IMPLEMENTED**.

---

### 4. `/trades` — Master Trades Ledger Page
- **Page Component:** [`TradesPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradesPage.tsx)
- **Purpose:** Searchable, filterable ledger of all trades with pagination, bulk operations, and full audit logs.
- **Main Components:**
  - Filter Toolbar: Search input (symbol/title/notes), Direction filter (Long/Short), Outcome filter (Win/Loss/Breakeven/Open), Asset Class filter, Status filter.
  - Master Table: Date, Symbol, Direction, Asset Class, Quantity, Entry Price, Exit Price, Net P&L, Realized R, Discipline Score, Attachments Count, Action buttons (View, Duplicate, Delete).
  - Bulk Actions Toolbar: Select all checkbox, Bulk Tagging button, Bulk Delete button.
  - Pagination Controls: Page size selector (25, 50, 100), previous/next page navigation.
  - Modals: `TradeFormModal`, `ConfirmDialog` for single delete and bulk delete, Bulk Tag dialog.
- **Available Actions:** Search, filter, paginate, sort by column, open trade detail, open edit modal, duplicate trade, delete trade, bulk tag, bulk delete.
- **API Calls:**
  - `GET /api/v1/trades?page=...&limit=...&search=...&direction=...&outcome=...`
  - `POST /api/v1/trades/:id/duplicate`
  - `DELETE /api/v1/trades/:id`
  - `POST /api/v1/trades/bulk-tag`
  - `POST /api/v1/trades/bulk-delete`
- **Database Models:** `Trade`, `TradingAccount`, `Attachment`.
- **Status:** **IMPLEMENTED**.

---

### 5. `/trades/:id` — Trade Detail & Audit Page
- **Page Component:** [`TradeDetailPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/TradeDetailPage.tsx)
- **Purpose:** In-depth post-trade analysis, execution fills inspection, technical thesis, psychological notes, chart gallery, and immutable audit trail.
- **Main Components:**
  - Trade Header: Symbol, asset class, direction, status, trade title, net P&L badge, R-multiple badge.
  - Metrics Cards: Gross P&L, Total Costs Breakdown (brokerage, exchange, regulatory, taxes), ROI %, holding time.
  - Tabbed Sections:
    - *Execution Tab:* Simple execution details or FIFO fills breakdown with lot match pairs.
    - *Risk & Planning Tab:* Initial stop loss, planned target, planned R:R, actual quantity vs suggested quantity.
    - *Thesis & Confluences Tab:* Pre-market bias, market structure, entry confirmation, SMC technical confluences.
    - *Psychology & Discipline Tab:* Emotions before/during/after, discipline rating (1–5), mistake tags, rules followed, lessons learned.
    - *Screenshots Gallery:* Uploaded chart screenshots categorized by trade stage with lightbox inspection.
    - *Audit Trail:* Immutable log of creation, updates, and balance adjustments.
- **Available Actions:** Edit trade (opens `TradeFormModal`), duplicate trade, delete trade, upload additional screenshots, view full-resolution charts.
- **API Calls:**
  - `GET /api/v1/trades/:id`
  - `POST /api/v1/attachments/trades/:id/upload`
  - `DELETE /api/v1/attachments/:attachmentId`
  - `DELETE /api/v1/trades/:id`
- **Database Models:** `Trade`, `Attachment`, `TradingAccount`, `Strategy`.
- **Status:** **IMPLEMENTED**.

---

### 6. `/journal` — Visual Monthly Calendar Page
- **Page Component:** [`JournalCalendarPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/JournalCalendarPage.tsx)
- **Purpose:** Monthly calendar heatmap and daily session reflection review.
- **Main Components:**
  - Monthly Calendar Grid: 7-day columns (Sun–Sat) with green/red P&L badges, trade counts, and journal status indicators.
  - Month Switcher: Previous month, next month, current month title.
  - Month Summary Cards: Total Monthly P&L, Total Trades, Win Days vs Loss Days.
  - Daily Reflection Drawer/Dialog: Opens when clicking any calendar day:
    - Lists all trades taken on that day with individual P&Ls.
    - Reflection form: Market conditions, Market bias (Bullish/Bearish/Neutral), Emotional state, Discipline rating (1–5), Lessons learned, Next day plan.
- **Available Actions:** Switch month, click day cell to inspect trades, submit daily reflection, delete daily reflection.
- **API Calls:**
  - `GET /api/v1/journal/calendar?yearMonth=YYYY-MM`
  - `GET /api/v1/journal/:date`
  - `POST /api/v1/journal/:date`
  - `DELETE /api/v1/journal/:date`
- **Database Models:** `DailyJournal`, `Trade`.
- **Status:** **IMPLEMENTED**.

---

### 7. `/analytics` — Quantitative Analytics & Psychology Page
- **Page Component:** [`AnalyticsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/AnalyticsPage.tsx)
- **Purpose:** Advanced statistical breakdown across trading psychology, timeframes, instruments, strategies, weekdays, and sessions.
- **Main Components:**
  - Sub-Navigation Tabs: Overview, Psychology & Discipline, Time & Sessions.
  - Charts & Visualizations:
    - *Psychology Tab:* Bar chart comparing Discipline Rating (1 to 5) vs Net P&L; Mistake impact cards showing total monetary loss per mistake; Emotion before entry vs win rate.
    - *Time Tab:* Weekday P&L and win rate bar charts; Session performance (NSE Regular vs MCX Evening vs London/NY); Holding time distribution.
    - *Overview Tab:* P&L distribution histogram buckets (losses vs gains); Instrument performance table; Strategy ranking table.
- **API Calls:**
  - `GET /api/v1/dashboard/stats?accountId=...`
  - `GET /api/v1/analytics/psychology?accountId=...`
- **Database Models:** `Trade`, `TradingAccount`.
- **Status:** **IMPLEMENTED**.

---

### 8. `/strategies` — Strategy Playbook Page
- **Page Component:** [`StrategyPlaybookPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/StrategyPlaybookPage.tsx)
- **Purpose:** Creation, documentation, and statistical tracking of strategy playbooks.
- **Main Components:**
  - Strategy Grid: Cards for each playbook displaying Name, Description, Asset Classes, Min R:R, Total Trades, Win Rate %, Net P&L, Profit Factor.
  - Strategy Modal: Name, description, asset classes, timeframes, entry rules, stop-loss rules, target rules, invalidation criteria, pre-trade checklist items.
- **Available Actions:** Create strategy, edit strategy, delete strategy, view linked trades.
- **API Calls:**
  - `GET /api/v1/strategies`
  - `POST /api/v1/strategies`
  - `GET /api/v1/strategies/:id`
  - `PUT /api/v1/strategies/:id`
  - `DELETE /api/v1/strategies/:id`
- **Database Models:** `Strategy`, `Trade`.
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
  - Account Cards: Broker badge, Account Type, Initial Balance, Realized P&L, Deposits, Withdrawals, Current Balance, Status (Active/Archived).
  - Add Account Modal: Name, broker, account number, account type, initial balance.
  - Record Transaction Modal: Deposit / Withdrawal, amount, date, notes.
  - Reconcile Button: Triggers server-side authoritative balance recalculation from raw trade records.
- **Available Actions:** Add account, edit account, archive/delete account, add transaction, reconcile balance.
- **API Calls:**
  - `GET /api/v1/accounts`
  - `POST /api/v1/accounts`
  - `POST /api/v1/accounts/:id/transactions`
  - `POST /api/v1/accounts/:id/reconcile`
  - `DELETE /api/v1/accounts/:id`
- **Database Models:** `TradingAccount`, `AccountTransaction`, `Trade`.
- **Status:** **IMPLEMENTED**.

---

### 11. `/instruments` — Instrument Catalog Page
- **Page Component:** [`InstrumentsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/InstrumentsPage.tsx)
- **Purpose:** Specifications catalog of trading instruments, multipliers, and lot sizes.
- **Main Components:**
  - Instruments Table: Symbol, Display Name, Asset Class, Exchange, Segment, Contract Multiplier, Lot Size, Tick Size, Quantity Increment.
  - System Preset vs Custom Badges.
  - Add Custom Instrument Modal.
- **Available Actions:** Browse instruments, search, create custom instrument, edit custom instrument, delete custom instrument.
- **API Calls:**
  - `GET /api/v1/instruments`
  - `POST /api/v1/instruments`
  - `PUT /api/v1/instruments/:id`
  - `DELETE /api/v1/instruments/:id`
- **Database Models:** `Instrument`.
- **Status:** **IMPLEMENTED**.

---

### 12. `/reports` — Reports & Data Portability Page
- **Page Component:** [`ReportsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/ReportsPage.tsx)
- **Purpose:** Data export (CSV/JSON), interactive broker CSV import with column mapping, and backup verification.
- **Main Components:**
  - Export Section: Account filter, date range filter, "Download CSV" and "Download JSON" buttons.
  - Import Section: File dropzone, account selector, CSV parsing preview, interactive column mapping dropdowns, "Commit Import" button with progress spinner.
  - Import Results Summary: Count of imported trades, skipped duplicates, and validation errors.
- **Available Actions:** Download exports, upload CSV, map columns, execute import.
- **API Calls:**
  - `GET /api/v1/export/csv`
  - `GET /api/v1/export/json`
  - `POST /api/v1/export/import/preview`
  - `POST /api/v1/export/import/commit`
- **Database Models:** `Trade`, `TradingAccount`.
- **Status:** **IMPLEMENTED**.

---

### 13. `/settings` — Application Settings Page
- **Page Component:** [`SettingsPage.tsx`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/pages/SettingsPage.tsx)
- **Purpose:** Profile management, theme customization, security password updates, FYERS configuration, and system diagnostic overview.
- **Main Components:**
  - Profile Card: Name, Email (read-only), Base Currency selector (`INR`, `USD`, `EUR`, `GBP`).
  - Appearance Card: Theme toggle (Dark, Light, System).
  - Security Card: Change password form (current password, new password min 8 characters).
  - FYERS Broker Integration Card: App ID input, connection status (`DISABLED`/`IDLE`), link to documentation.
  - System Diagnostic Card: Database engine status, total trades count, total accounts, total attachments, privacy mode verification.
- **Available Actions:** Save profile, switch theme, update password, save FYERS app ID, logout.
- **API Calls:**
  - `PUT /api/v1/settings/profile`
  - `POST /api/v1/settings/change-password`
  - `GET /api/v1/settings/system-status`
  - `GET /api/v1/integrations/fyers/status`
  - `POST /api/v1/integrations/fyers/config`
  - `POST /api/v1/auth/logout`
- **Database Models:** `User`, `BrokerIntegration`, `Trade`, `TradingAccount`, `Attachment`.
- **Status:** **IMPLEMENTED**.
