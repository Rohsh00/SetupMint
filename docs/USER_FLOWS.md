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
    Modal->>Modal: Loads default account & remembered preferences
    User->>Modal: Selects Symbol (e.g. NIFTY), Direction (LONG)
    User->>Modal: Inputs Entry Price (24,000), Exit Price (24,120), Quantity (50)
    Modal->>FE: calculateSimpleExecutionPnL(direction, simpleExecution)
    FE-->>Modal: Returns live Gross P&L (+₹6,000), Fees (₹112.50), Net P&L (+₹5,887.50)
    Modal->>Modal: Updates TradeCalculationBanner with live profit preview
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
        Note over User,DB: Import Workflow
        User->>Page: Uploads broker CSV file (e.g. FYERS or Zerodha tradebook)
        Page->>API: POST /api/v1/export/import/preview (Multipart file)
        API->>API: Parses CSV headers and suggests column mapping
        API-->>Page: Returns { headers, suggestedMapping, previewRows: [5] }
        Page->>User: Displays preview table with mapping dropdowns
        User->>Page: Verifies mappings (Symbol -> Scrip, Date -> Trade Date, Price -> Avg Price)
        User->>Page: Selects Target Account -> Clicks "Commit Import"
        Page->>API: POST /api/v1/export/import/commit { accountId, rows, mapping }
        API->>DB: Loops rows, checks duplicates, inserts valid Trade records
        API->>AccSvc: AccountService.recalculateAccountBalances(accountId, userId)
        API-->>Page: Returns { importedCount: 42, duplicateCount: 2, errors: [] }
        Page->>User: Displays success alert and refreshes global trade queries
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
