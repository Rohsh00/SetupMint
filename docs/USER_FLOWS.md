# SetupMint — User Workflows & Sequences

This document provides detailed, end-to-end traces of the primary user workflows in **SetupMint**, illustrating the exact sequence from UI interaction through frontend state, REST API calls, backend validation, business logic, and database persistence.

---

## 1. Authentication & Onboarding Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant UI as React UI (LoginPage / RegisterPage)
    participant AuthCtx as AuthContext
    participant API as Fastify Auth API (/api/v1/auth)
    participant DB as MongoDB (User / Session)

    User->>UI: Navigates to http://localhost:5173
    UI->>AuthCtx: Checks session via api.auth.me()
    AuthCtx->>API: GET /api/v1/auth/me (Cookie: tv_session)
    alt No Active Session
        API-->>UI: 401 Unauthorized
        UI->>User: Displays LoginPage
        User->>UI: Enters Email & Password -> Clicks "Sign In"
        UI->>API: POST /api/v1/auth/login { email, password }
        API->>DB: User.findOne({ email })
        API->>API: bcrypt.compare(password, user.passwordHash)
        API->>DB: Session.create({ userId, token, expiresAt: +30d })
        API-->>UI: 200 OK + Set-Cookie: tv_session (HttpOnly, SameSite)
        UI->>AuthCtx: Sets currentUser
        UI->>User: Redirects to / (DashboardPage)
    else Active Session Exists
        API->>DB: Session.findOne({ token, expiresAt > now })
        API-->>UI: 200 OK { user: { id, email, name, baseCurrency } }
        UI->>User: Renders AppLayout & Dashboard
    end
```

---

## 2. Express Manual Trade Logging Workflow (Simple Mode)

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant Modal as TradeFormModal
    participant FE as @tradevault/financial-engine
    participant API as Fastify Trade API (/api/v1/trades)
    participant AccSvc as AccountService
    participant DB as MongoDB (Trade / TradingAccount)

    User->>Modal: Clicks "Log New Trade" (or + New Trade in Top Bar)
    Modal->>Modal: Loads remembered preferences (Account, Strategy, Symbol, Mode)
    User->>Modal: Selects Instrument (e.g. NIFTY)
    Modal->>Modal: Autofills exchange (NSE), segment (NSE_FNO), multiplier (1), lotSize (25)
    User->>Modal: Enters Lots (2) -> Auto-converts Quantity to 50
    User->>Modal: Sets Entry Timestamp -> Auto-derives session (NSE_REGULAR)
    User->>Modal: Inputs Entry Price (24,000), Exit Price (24,120)
    Modal->>FE: calculateIndianCharges({ assetClass, prices, qty, broker })
    FE-->>Modal: Auto-populates itemized Brokerage (₹40), Exchange, SEBI, STT, GST
    Modal->>FE: calculateSimpleExecutionPnL(direction, simpleExecution)
    FE-->>Modal: Returns live Gross P&L (+₹6,000), Fees (₹207.82), Net P&L (+₹5,792.18)
    Modal->>Modal: Updates TradeCalculationBanner with live profit & AUTO fees badge
    User->>Modal: Selects Discipline Score (5/5), Emotion (CALM), Strategy Playbook
    User->>Modal: Clicks "Save Trade Entry"
    Modal->>API: POST /api/v1/trades { accountId, symbol, executionMode: 'SIMPLE', ... }
    API->>API: Zod validation (createTradeSchema)
    API->>DB: TradingAccount.findOne({ _id: accountId, userId })
    API->>FE: Recomputes authoritative trade calculation server-side
    API->>DB: Trade.create({ ...body, calculated, auditLog: [{ action: 'CREATED' }] })
    API->>AccSvc: AccountService.recalculateAccountBalances(accountId, userId)
    AccSvc->>DB: Aggregates all closed trades & transactions
    AccSvc->>DB: Updates TradingAccount (realizedPnL, currentBalance)
    API-->>Modal: 201 Created { id, symbol, netPnL, outcome: 'WIN' }
    Modal->>User: Displays success toast & closes modal
```

---

## 3. Advanced Multi-Fill Trade Logging Workflow (FIFO Matching)

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant Modal as TradeFormModal (Advanced Mode)
    participant FIFO as FIFO Engine (calculateFIFOExecution)
    participant API as Fastify Trade API
    participant DB as MongoDB (Trade / TradingAccount)

    User->>Modal: Switches to "Advanced Multi-Fill Mode"
    User->>Modal: Adds Entry Fill 1: Price 24,000, Qty 25 (09:30 AM)
    User->>Modal: Adds Entry Fill 2: Price 23,980, Qty 25 (10:15 AM)
    User->>Modal: Adds Exit Fill 1: Price 24,060, Qty 25 (11:00 AM)
    Modal->>FIFO: calculateFIFOExecution('LONG', fills, multiplier)
    FIFO->>FIFO: Matches Exit Fill 1 against Entry Fill 1 (FIFO order)
    FIFO-->>Modal: Returns: Closed Qty: 25, Open Qty: 25, Realized Net P&L: +₹1,460.50
    User->>Modal: Adds Exit Fill 2: Price 24,110, Qty 25 (01:30 PM)
    Modal->>FIFO: calculateFIFOExecution('LONG', fills, multiplier)
    FIFO->>FIFO: Matches Exit Fill 2 against Entry Fill 2
    FIFO-->>Modal: Returns: Fully Closed, Total Realized Gross/Net, Weighted Avg Entry/Exit
    User->>Modal: Submits trade
    Modal->>API: POST /api/v1/trades { executionMode: 'ADVANCED', fills: [...] }
    API->>DB: Trade.create(...) & recalculates account balance
    API-->>Modal: 201 Created
```

---

## 4. Private Chart Screenshot Upload Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant UI as TradeDetailPage / TradeFormModal
    participant API as Attachment API (/api/v1/attachments)
    participant Disk as Local Disk (./data/uploads)
    participant DB as MongoDB (Attachment / Trade)

    User->>UI: Drags & drops chart image (PNG/JPEG/WebP)
    User->>UI: Selects Category ("ENTRY"), Timeframe ("5m"), Caption ("BOS confirmation")
    UI->>API: POST /api/v1/attachments/trades/:tradeId/upload (Multipart FormData)
    API->>API: Validates session & trade ownership
    API->>API: Checks max 12 screenshots limit per trade
    API->>API: Verifies file magic bytes (e.g. 89 50 4E 47 for PNG)
    alt Invalid Magic Bytes
        API-->>UI: 400 INVALID_IMAGE_SIGNATURE
    else Valid Image
        API->>API: Generates secure UUID filename: <uuid>.<ext>
        API->>Disk: Streams file to ./data/uploads/<uuid>.<ext>
        API->>DB: Attachment.create({ tradeId, storedFilename, category, ... })
        API->>DB: Trade.updateOne({ $push: { screenshotIds: attachment._id } })
        API-->>UI: 201 Created { id, downloadUrl: '/api/v1/attachments/:id/download' }
        UI->>User: Displays thumbnail in screenshot gallery with "ENTRY" badge
    end
```

---

## 5. Pre-Trade Risk Calculator & Form Transfer Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant Calc as RiskCalculatorPage
    participant Engine as @tradevault/financial-engine
    participant Modal as TradeFormModal

    User->>Calc: Opens /risk-calculator
    Calc->>Calc: Auto-selects active account equity (e.g. ₹5,00,000)
    User->>Calc: Sets Risk Mode to 1.5% (Risk Budget: ₹7,500)
    User->>Calc: Selects Symbol "BANKNIFTY" (Lot Size: 15, Multiplier: 1)
    User->>Calc: Inputs Entry Price (51,200), Stop Loss (51,040), Target (51,600)
    Calc->>Engine: calculateRiskAndPositionSize(params)
    Engine->>Engine: Stop distance = 160 pts, Loss per unit = ₹160
    Engine->>Engine: Raw suggested qty = 46.875 units
    Engine->>Engine: Rounded lot qty = floor(46.875 / 15) * 15 = 45 units (3 lots)
    Engine->>Engine: Estimated loss at stop = 45 * ₹160 = ₹7,200
    Engine->>Engine: Planned R:R = (400 pts / 160 pts) = 2.50 R
    Engine-->>Calc: Returns IRiskCalculationResult
    Calc->>User: Displays exact recommended lots (3 lots / 45 qty) and risk parameters
    User->>Calc: Clicks "Transfer to Trade Form"
    Calc->>Modal: Launches TradeFormModal with prefilled symbol, entry, stop, target, qty
    Modal->>User: Modal opens ready for execution entry
```

---

## 6. Daily Journal & Reflection Calendar Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant Page as JournalCalendarPage
    participant API as Fastify Journal API (/api/v1/journal)
    participant DB as MongoDB (DailyJournal / Trade)

    User->>Page: Navigates to /journal
    Page->>API: GET /api/v1/journal/calendar?yearMonth=2026-10
    API->>DB: Trade.find({ tradeDate: startOfMonth..endOfMonth })
    API->>DB: DailyJournal.find({ date: /^2026-10/ })
    API-->>Page: Returns calendar grid with daily net P&L and journal status
    Page->>User: Renders green/red monthly heatmap
    User->>Page: Clicks a specific date cell (e.g. 2026-10-18)
    Page->>API: GET /api/v1/journal/2026-10-18
    API-->>Page: Returns all trades taken on that day + existing journal entry
    Page->>User: Opens reflection drawer with day's trades listed
    User->>Page: Inputs Market Bias ("BEARISH"), Discipline Rating (4/5), Notes
    User->>Page: Clicks "Save Reflection"
    Page->>API: POST /api/v1/journal/2026-10-18 { marketBias, disciplineRating, ... }
    API->>DB: DailyJournal.findOneAndUpdate({ userId, date }, { upsert: true })
    API-->>Page: 200 OK
    Page->>User: Displays success toast and updates calendar icon indicator
```

---

## 7. CSV Export & Interactive CSV Import Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader
    participant Page as ReportsPage
    participant API as Export/Import API (/api/v1/export)
    participant DB as MongoDB (Trade / TradingAccount)
    participant AccSvc as AccountService

    rect rgb(240, 248, 255)
        Note over User,DB: Export Workflow
        User->>Page: Selects Account & Date Range -> Clicks "Download CSV"
        Page->>API: GET /api/v1/export/csv?accountId=...
        API->>DB: Trade.find({ userId, accountId })
        API->>API: Generates CSV stream with exact column headers
        API-->>User: Downloads tradevault-export-<date>.csv
    end

    rect rgb(255, 250, 240)
        Note over User,DB: Smart Broker Import & FIFO Grouping Workflow
        User->>Page: Uploads broker CSV tradebook (Zerodha, FYERS, Angel One, Upstox)
        Page->>API: POST /api/v1/export/import/preview (Multipart file)
        API->>DB: Checks BrokerImportMapping for saved custom mapping
        API->>API: Heuristically detects broker format & suggests column mapping
        API-->>Page: Returns { detectedBroker, suggestedMapping, isRawExecutionLog, previewRows, allRows }
        Page->>User: Displays detected broker badge, mapping selectors, and FIFO indicator
        User->>Page: Adjusts mappings & checks "Save as default mapping for Broker"
        User->>Page: Selects Target Account -> Clicks "Commit Import"
        Page->>API: POST /api/v1/export/import/commit { accountId, rows, mapping, broker, saveMapping }
        API->>DB: If saveMapping: upserts BrokerImportMapping (userId + broker)
        API->>API: Groups raw fills by symbol & matches round-trips via calculateFIFOExecution()
        API->>API: Computes statutory charges via IndianChargesCalculator (Decimal.js)
        API->>DB: Inserts Trade records with importBatchId, tags: ['IMPORTED'], ADVANCED mode
        API->>AccSvc: AccountService.recalculateAccountBalances(accountId, userId)
        API-->>Page: Returns { batchId, importedCount, duplicateCount, errorCount, errors }
        Page->>User: Displays success banner with "Undo Import" action and per-row error report
    end

    rect rgb(255, 240, 245)
        Note over User,DB: Undo Import Batch Workflow
        User->>Page: Clicks "Undo Import" (or "Undo Batch" in Recent Batches table)
        Page->>API: POST /api/v1/export/import/undo { batchId }
        API->>DB: Trade.find({ userId, importBatchId }) -> Identifies affected accounts
        API->>DB: Trade.deleteMany({ userId, importBatchId })
        API->>AccSvc: AccountService.recalculateAccountBalances(accountId, userId)
        API-->>Page: Returns { batchId, deletedCount, affectedAccounts }
        Page->>User: Confirms reversal and restores original account balances
    end
```

---

## 8. Local Backup, Restore & Reconcile Workflows

### A. Backup Flow (`npm run db:backup`)
1. User executes `npm run db:backup` in terminal.
2. Script [`scripts/backup.js`](file:///Users/komal/projects/Trading%20Vault/scripts/backup.js) establishes connection to local MongoDB.
3. Iterates across all database collections (`users`, `tradingaccounts`, `trades`, `instruments`, `strategies`, `dailyjournals`, `attachments`, `brokerintegrations`, `auditlogs`).
4. Serializes each collection to formatted JSON in `./backups/tradevault-backup-<timestamp>/`.
5. Copies all private chart screenshot files from `./data/uploads/` to `./backups/.../uploads/`.
6. Generates `manifest.json` recording timestamp, record counts, and file counts.

### B. Restore Flow (`npm run db:restore`)
1. User executes `npm run db:restore [optional-backup-path]`.
2. Script [`scripts/restore.js`](file:///Users/komal/projects/Trading%20Vault/scripts/restore.js) identifies the latest backup directory in `./backups/`.
3. Connects to MongoDB, cleans existing collections, and repopulates collections from JSON files.
4. Restores screenshot attachments into `./data/uploads/`.
5. Disconnects cleanly.

### C. Reconciliation Flow (`npm run db:reconcile`)
1. User executes `npm run db:reconcile` (or triggers via UI "Reconcile Balance" button).
2. Connects to database and iterates over every trading account.
3. Re-aggregates all closed trade net P&Ls and account transactions (deposits, withdrawals, adjustments).
4. Persists the exact calculated balance back to `TradingAccount.currentBalance` and `realizedPnL`.

---

## 9. Fast Entry, Quick Close & Command Palette Workflows

### A. Quick Close Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Trader as Trader
    participant Page as TradesPage / TradeDetailPage
    participant Dialog as QuickCloseTradeDialog
    participant Engine as @tradevault/financial-engine
    participant API as Fastify Trade API (/api/v1/trades/:id)
    participant AccSvc as AccountService
    participant DB as MongoDB (Trade / TradingAccount)

    Trader->>Page: Clicks "Quick Close" on OPEN/PLANNED trade
    Page->>Dialog: Opens with trade context (symbol, entryPrice, qty, broker)
    Trader->>Dialog: Inputs exit price (e.g., 2,560)
    Dialog->>Engine: IndianChargesCalculator.calculate(assetClass, segment, entryPrice, exitPrice, qty, mult, broker)
    Engine-->>Dialog: Returns ChargesBreakdown (brokerage, exchange, regulatory, taxes, totalCosts)
    Dialog->>Dialog: Computes live Gross P&L, Total Costs, and Net Realized P&L
    Trader->>Dialog: Clicks "Close Position"
    Dialog->>API: PUT /api/v1/trades/:id { status: 'CLOSED', exitTime, simpleExecution: { exitPrice, brokerage, ... } }
    API->>API: updateTradeSchema validates partial execution payload
    API->>DB: Merges existing entry price & quantity with new exit price
    API->>Engine: computeTradeCalculations() computes authoritative Net P&L & outcome
    API->>DB: Trade.findOneAndUpdate() + appends auditLog { action: 'CLOSED', details: { exitPrice, newNetPnL } }
    API->>AccSvc: AccountService.recalculateAccountBalances(accountId, userId)
    AccSvc->>DB: Re-aggregates authoritative balance
    API-->>Dialog: 200 OK { success: true, data: updatedTrade }
    Dialog->>Page: Invalidates queries & displays success toast
```

### B. Command Palette & Quick Re-Entry Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Trader as Trader
    participant Palette as CommandPalette (Cmd+K)
    participant API as Fastify API
    participant Router as React Router

    Trader->>Palette: Hits Cmd+K (or clicks Search in TopBar)
    Palette->>Trader: Displays glassmorphic command search dialog
    alt Action: Repeat Last Trade
        Trader->>Palette: Selects "Repeat Last Trade" (R)
        Palette->>API: GET /api/v1/trades?limit=1&sortBy=createdAt&sortOrder=desc
        API-->>Palette: Returns latest trade setup
        Palette->>API: POST /api/v1/trades/:id/duplicate
        API-->>Palette: 201 Created { id: newTradeId, symbol }
        Palette->>Router: Navigates to /trades/:newTradeId
    else Action: Jump to Today's Journal
        Trader->>Palette: Selects "Jump to Today's Journal" (J)
        Palette->>Router: Navigates to /journal
    else Action: Open Risk Calculator
        Trader->>Palette: Selects "Open Risk & Position Size Calculator" (C)
        Palette->>Router: Navigates to /risk-calculator
    end
```

---

## 10. Daily Review Queue & End-of-Day Journal Reflection Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Trader as Trader
    participant Dash as DashboardPage (/dashboard)
    participant Queue as Review Queue Card Widget
    participant Cal as JournalCalendarPage (/journal)
    participant Engine as @tradevault/financial-engine
    participant RevAPI as Fastify Review API (/api/v1/review)
    participant JourAPI as Fastify Journal API (/api/v1/journal)
    participant DB as MongoDB (Trade / DailyJournal / User)

    Trader->>Dash: Opens Dashboard Overview
    Dash->>RevAPI: GET /api/v1/review/queue
    RevAPI->>DB: User.findById(userId) (reads riskSettings)
    RevAPI->>DB: Trade.find({ userId, isDeleted: false })
    RevAPI->>DB: DailyJournal.find({ userId })
    RevAPI->>Engine: detectMistakeSuggestions() & checkDailyLossBreach()
    RevAPI-->>Queue: 200 OK { pendingTrades, unreviewedDays, totalPending, dailyLossBreach }
    Queue->>Trader: Displays Daily Review Card with pending trades, tags & breach banner
    Trader->>Queue: Clicks "Start Daily Review" (or "Review" on specific trade)
    Queue->>Cal: Navigates to /journal?date=YYYY-MM-DD
    Cal->>JourAPI: GET /api/v1/journal/:date
    JourAPI->>DB: Trade.find({ userId, tradeDate })
    JourAPI->>Engine: calculateDailySessionSummary(date, trades, riskSettings, accountEquity)
    Engine-->>JourAPI: Computes bestTrade, worstTrade, aggregatedMistakeTags, disciplineRating
    JourAPI-->>Cal: 200 OK { journal, prefill: { totalTrades, netPnL, bestTrade, worstTrade, disciplineRating, mistakeTags } }
    Cal->>Trader: Opens Reflection Drawer pre-populated with session stats & mistake chips
    Trader->>Cal: Adds market bias, lessons learned, adjusts discipline rating -> Clicks "Save Reflection"
    Cal->>JourAPI: POST /api/v1/journal/:date { marketBias, emotionalState, disciplineRating, bestTrade, worstTrade, mistakes, lessonsLearned }
    JourAPI->>DB: DailyJournal.findOneAndUpdate({ userId, date }, ..., { upsert: true })
    JourAPI-->>Cal: 200 OK { success: true, data: journal }
    Cal->>Trader: Updates calendar day cell status to "Reviewed" (green badge)
```
