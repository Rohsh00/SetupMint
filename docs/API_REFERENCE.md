# SetupMint — REST API Specification (v1)

The SetupMint backend is exposed as a REST API powered by Fastify v5 listening by default on `http://127.0.0.1:4000`.

Interactive Swagger OpenAPI UI documentation is available at:
`http://127.0.0.1:4000/api/docs`

---

## 1. Global Conventions & Standards

### Base URL
All API v1 endpoints are prefixed with:
```text
/api/v1
```

### Standard Response Envelope
All API endpoints return responses encapsulated in a standard envelope:

**Success Response (HTTP 200 / 201):**
```json
{
  "success": true,
  "data": { ... },
  "pagination": { ... } // Optional for paginated collections
}
```

**Error Response (HTTP 4xx / 5xx):**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable description of error",
    "details": { ... } // Optional validation error details
  }
}
```

### Authentication Mechanism
Authentication is handled via stateful sessions:
- **HttpOnly Cookie:** Cookie name `tv_session` (SameSite: `Lax`). Automatically sent and parsed by browsers.
- **Authorization Header:** Supported for programmatic API clients:
  ```http
  Authorization: Bearer <session-token-hex>
  ```

---

## 2. Health & System Endpoints

### `GET /api/health`
- **Purpose:** Health check and liveness probe.
- **Auth:** Public.
- **Response:**
  ```json
  {
    "status": "ok",
    "dbState": "connected",
    "timestamp": "2026-10-18T09:30:00.000Z",
    "uptimeSeconds": 1420
  }
  ```

---

## 3. Authentication Routes (`/api/v1/auth`)

### `POST /api/v1/auth/register`
- **Purpose:** Register new user account.
- **Auth:** Public (Rate limit: 15 req/min).
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123",
    "name": "Jane Trader",
    "baseCurrency": "INR"
  }
  ```
- **Responses:**
  - `201 Created`: User created, session issued, `tv_session` cookie set.
  - `400 Bad Request`: Zod validation error (`VALIDATION_ERROR`).
  - `409 Conflict`: User already exists (`USER_EXISTS`).

### `POST /api/v1/auth/login`
- **Purpose:** User authentication.
- **Auth:** Public (Rate limit: 15 req/min).
- **Request Body:**
  ```json
  {
    "email": "trader@tradevault.local",
    "password": "TradeVault@123"
  }
  ```
- **Responses:**
  - `200 OK`: Session created, `tv_session` cookie set.
  - `401 Unauthorized`: Invalid credentials (`INVALID_CREDENTIALS`).

### `POST /api/v1/auth/logout`
- **Purpose:** Revoke current session and clear cookie.
- **Auth:** Public (safely handles missing token).
- **Responses:**
  - `200 OK`: Session deleted from database, cookie expired.

### `GET /api/v1/auth/me`
- **Purpose:** Retrieve active authenticated user profile.
- **Auth:** **Required**.
- **Responses:**
  - `200 OK`: Returns `{ user: { id, email, name, baseCurrency, theme, createdAt } }`.
  - `401 Unauthorized`: Missing or invalid session token.

### `GET /api/v1/auth/sessions`
- **Purpose:** List all active, non-expired sessions for the authenticated user across devices.
- **Auth:** **Required**.
- **Responses:**
  - `200 OK`: Returns `{ sessions: [{ id, createdAt, lastUsedAt, userAgent, ipAddress, isCurrent }] }`.
  - `401 Unauthorized`: Missing or invalid session token.

### `DELETE /api/v1/auth/sessions/:id`
- **Purpose:** Revoke a specific active session.
- **Auth:** **Required**. Validates `:id` parameter via `validateObjectIdParam('id')`.
- **Responses:**
  - `200 OK`: Returns `{ success: true, message: "Session revoked successfully" }`. If revoking current session, `tv_session` cookie is also cleared.
  - `400 Bad Request`: Invalid session ID format (`INVALID_ID`).
  - `404 Not Found`: Session not found or does not belong to authenticated user (`SESSION_NOT_FOUND`).

### `POST /api/v1/auth/logout-all`
- **Purpose:** Revoke all other active sessions for the user across all devices.
- **Auth:** **Required**.
- **Request Body (Optional):**
  ```json
  {
    "includeCurrent": false
  }
  ```
- **Responses:**
  - `200 OK`: Returns `{ success: true, message: "All other sessions revoked successfully", revokedCount: number }`.
  - `401 Unauthorized`: Missing or invalid session token.

---

## 4. Trading Accounts (`/api/v1/accounts`)

### `GET /api/v1/accounts`
- **Purpose:** List all trading accounts owned by authenticated user.
- **Auth:** **Required**.
- **Response:** Array of accounts with initial balance, realized P&L, deposits, withdrawals, adjustments, current balance, and optional FYERS `brokerLink`.

### `POST /api/v1/accounts`
- **Purpose:** Create new trading account.
- **Auth:** **Required**.
- **Request Body:**
  ```json
  {
    "name": "FYERS F&O Trading Account",
    "broker": "FYERS",
    "accountNumber": "FY-10291",
    "accountType": "FUTURES_OPTIONS",
    "baseCurrency": "INR",
    "initialBalance": 500000,
    "riskRules": {
      "maxDailyLoss": 15000,
      "maxRiskPerTradePercent": 2,
      "maxOpenTrades": 3
    },
    "notes": "Intraday index options ledger"
  }
  ```
- **Responses:** `201 Created`, `409 DUPLICATE_ACCOUNT`.

### `GET /api/v1/accounts/:id`
- **Purpose:** Get single account details with total trade count.
- **Auth:** **Required**.
- **Responses:** `200 OK`, `404 ACCOUNT_NOT_FOUND`.

### `PUT /api/v1/accounts/:id`
- **Purpose:** Update account settings or risk rules.
- **Auth:** **Required**.
- **Responses:** `200 OK`, `404 ACCOUNT_NOT_FOUND`.

### `DELETE /api/v1/accounts/:id`
- **Purpose:** Remove or archive trading account.
- **Auth:** **Required**.
- **Behavior:**
  - If `tradeCount > 0`: Sets `status: 'ARCHIVED'`. Returns `200 OK` (account archived).
  - If `tradeCount === 0`: Deletes record completely. Returns `200 OK`.

### `POST /api/v1/accounts/:id/transactions`
- **Purpose:** Record capital deposit, withdrawal, or adjustment.
- **Auth:** **Required**.
- **Request Body:**
  ```json
  {
    "type": "DEPOSIT",
    "amount": 50000,
    "currency": "INR",
    "date": "2026-10-18",
    "notes": "Fund addition from HDFC Bank"
  }
  ```
- **Behavior:** Records transaction and immediately recalculates account balances.
- **Responses:** `201 Created` with updated `balanceSummary`.

### `GET /api/v1/accounts/:id/transactions`
- **Purpose:** List cash transactions for an account.
- **Auth:** **Required**.
- **Response Fields:** `id`, `type`, `amount`, `currency`, `date`, `notes`, `source` (`MANUAL`, `BROKER_LEDGER_IMPORT`, `BROKER_SYNC`), `status` (`CONFIRMED`, `PENDING_REVIEW`, `REJECTED`), `idempotencyKey`, `importBatchId`.
- **Responses:** `200 OK` (sorted by date desc).

### `POST /api/v1/accounts/:id/broker-link`
- **Purpose:** Link a FYERS trading account to the connected FYERS client.
- **Auth:** **Required**.
- **Request Body:** `{ "clientId": "FYERS_CLIENT_ID" }`.
- **Behavior:** Requires an active FYERS session. Rejects client ID mismatch, non-FYERS accounts, and a client ID already linked to another account.
- **Responses:** `200 OK`, `400 CLIENT_ID_REQUIRED`, `400 CLIENT_ID_MISMATCH`, `409 ACCOUNT_NOT_FYERS`, `409 CLIENT_ALREADY_LINKED`, `409 BROKER_NOT_CONNECTED`.

### `DELETE /api/v1/accounts/:id/broker-link`
- **Purpose:** Remove the FYERS link from an account.
- **Auth:** **Required**.
- **Responses:** `200 OK`, `404 ACCOUNT_NOT_FOUND`.

### `POST /api/v1/accounts/:id/sync-funds`
- **Purpose:** Fetch FYERS `/funds`, persist a broker snapshot, and create a pending reconciliation adjustment when the broker `Clear Balance` drifts beyond tolerance.
- **Auth:** **Required**.
- **Response:** `{ snapshot, currentBalance, brokerBalance, drift, tolerance, suggestionCreated, skipReason, pendingTransaction }`.
- **Skip Reasons:** `WITHIN_TOLERANCE`, `OPEN_OR_PLANNED_TRADES`, `PENDING_REVIEW_EXISTS`, `ALREADY_REVIEWED_FOR_THIS_DRIFT`.
- **Responses:** `200 OK`, `409 ACCOUNT_NOT_LINKED`, `409 BROKER_NOT_CONNECTED`, `502 FUNDS_SYNC_FAILED`, `503 FUNDS_SYNC_DISABLED`.

### `GET /api/v1/accounts/:id/pending-transactions`
- **Purpose:** List `PENDING_REVIEW` transactions and the latest FYERS funds snapshot for an account.
- **Auth:** **Required**.
- **Responses:** `200 OK` with `{ transactions: [...], latestSnapshot }`.

### `POST /api/v1/accounts/:id/transactions/:txId/confirm`
- **Purpose:** Confirm a pending broker adjustment and authoritatively recalculate the account balance.
- **Auth:** **Required**.
- **Responses:** `200 OK` with `{ transaction, balanceSummary }`, `404 PENDING_TRANSACTION_NOT_FOUND`.

### `POST /api/v1/accounts/:id/transactions/:txId/reject`
- **Purpose:** Reject a pending broker adjustment without changing account balances.
- **Auth:** **Required**.
- **Responses:** `200 OK`, `404 PENDING_TRANSACTION_NOT_FOUND`.

### `POST /api/v1/accounts/:id/reconcile`
- **Purpose:** Force authoritative balance recalculation from all closed trades and confirmed cash transactions.
- **Auth:** **Required**.
- **Responses:** `200 OK` with recalculated `AccountBalanceSummary`.

---

## 5. Master Trades API (`/api/v1/trades`)

### `GET /api/v1/trades`
- **Purpose:** Searchable, paginated, and filterable trade ledger.
- **Auth:** **Required**.
- **Query Parameters:**
  - `page` (`number`, default: 1)
  - `limit` (`number`, default: 50, max: 200)
  - `search` (`string`, optional): Searches symbol, tradeTitle, notes, entryRationale.
  - `accountId` (`string`, optional)
  - `symbol` (`string`, optional)
  - `assetClass` (`string`, optional)
  - `direction` (`'LONG' | 'SHORT'`, optional)
  - `status` (`'PLANNED' | 'OPEN' | 'CLOSED' | 'CANCELLED'`, optional)
  - `outcome` (`'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN'`, optional)
  - `strategyId` (`string`, optional)
  - `templateId` (`string`, optional): Filters trades created from a specific setup template.
  - `session` (`string`, optional)
  - `startDate`, `endDate` (`YYYY-MM-DD`, optional)
  - `tags` (`string`, comma-separated, optional)
  - `sortBy` (`string`, default: `'tradeDate'`)
  - `sortOrder` (`'asc' | 'desc'`, default: `'desc'`)
- **Responses:** `200 OK` with `{ data: Trade[], pagination: { page, limit, totalCount, totalPages } }`.

### `POST /api/v1/trades`
- **Purpose:** Create new trade record.
- **Auth:** **Required**.
- **Request Body (Simple Mode Example):**
  ```json
  {
    "accountId": "67123456789abcdef0123456",
    "symbol": "NIFTY",
    "assetClass": "FUTURES",
    "exchange": "NSE",
    "marketSegment": "NSE_FNO",
    "currency": "INR",
    "direction": "LONG",
    "status": "CLOSED",
    "tradeDate": "2026-10-18",
    "entryTime": "2026-10-18T09:35:00.000Z",
    "exitTime": "2026-10-18T11:15:00.000Z",
    "session": "NSE_REGULAR",
    "tradeTitle": "Morning ORB Breakout",
    "executionMode": "SIMPLE",
    "simpleExecution": {
      "entryPrice": 24000,
      "exitPrice": 24120,
      "quantity": 50,
      "contractMultiplier": 1,
      "brokerage": 40.00,
      "exchangeFees": 20.80,
      "regulatoryFees": 2.50,
      "taxes": 38.40
    },
    "risk": {
      "plannedEntryPrice": 24000,
      "initialStopLoss": 23940,
      "plannedTarget": 24150,
      "riskBudgetAmount": 3000
    },
    "thesis": {
      "preMarketBias": "BULLISH",
      "marketStructure": "TRENDING_UP",
      "entryRationale": "Break of Structure with 5m FVG retest",
      "confluences": ["BOS", "FVG", "VWAP"]
    },
    "psychology": {
      "emotionBefore": "CALM",
      "disciplineScore": 5,
      "rulesFollowed": true,
      "checklistCompleted": true,
      "mistakes": []
    }
  }
  ```
- **Responses:** `201 Created`, `400 VALIDATION_ERROR`, `404 ACCOUNT_NOT_FOUND`.

### `GET /api/v1/trades/:id`
- **Purpose:** Retrieve complete trade details, fills, populated strategy/account, and attached screenshots.
- **Auth:** **Required**.
- **Responses:** `200 OK`, `404 TRADE_NOT_FOUND`.

### `PUT /api/v1/trades/:id`
- **Purpose:** Update trade fields, execute Quick Close for open positions, recalculate P&L via financial engine, append audit log entry, and re-balance account.
- **Auth:** **Required**.
- **Payload Schema:** `updateTradeSchema` (partial `createTradeSchema` with optional partial `simpleExecution`).
- **Quick Close Support:** Accepts partial `simpleExecution` with `{ exitPrice, brokerage?, ... }` and `status: 'CLOSED'`. The server merges with existing entry prices, computes authoritative P&L, appends `auditLog` action `CLOSED` (or `UPDATED`), and authoritatively reconciles the account balance.
- **Responses:** `200 OK` with updated trade object, `400 VALIDATION_ERROR`, `404 TRADE_NOT_FOUND`.

### `DELETE /api/v1/trades/:id`
- **Purpose:** Delete trade, remove associated disk files, delete attachments, and reconcile account balance.
- **Auth:** **Required**.
- **Responses:** `200 OK`.

### `POST /api/v1/trades/:id/duplicate`
- **Purpose:** Clone trade setup as a fresh open trade for rapid logging.
- **Auth:** **Required**.
- **Responses:** `201 Created` with new trade ID.

### `POST /api/v1/trades/bulk-tag`
- **Purpose:** Add tags to multiple trades concurrently.
- **Auth:** **Required**.
- **Request Body:** `{ "tradeIds": ["id1", "id2"], "tagsToAdd": ["EARNINGS", "HIGH_IMPACT"] }`.
- **Responses:** `200 OK`.

### `POST /api/v1/trades/bulk-classify`
- **Purpose:** Classify or re-classify setup variants across multiple trades simultaneously. Updates strategy, variantKey, variantStatus, and appends `CLASSIFIED` audit log records.
- **Auth:** **Required**.
- **Request Body:**
  ```json
  {
    "tradeIds": ["id1", "id2"],
    "strategyId": "strategyObjectId",
    "variantKey": "VAR-01",
    "variantStatus": "CLASSIFIED",
    "setupAttributes": {}
  }
  ```
- **Responses:** `200 OK` with `{ "success": true, "data": { "count": 2 } }`.

### `POST /api/v1/trades/bulk-delete`
- **Purpose:** Delete multiple trades, clean attachments from disk, and reconcile all affected accounts.
- **Auth:** **Required**.
- **Request Body:** `{ "tradeIds": ["id1", "id2"] }`.
- **Responses:** `200 OK`.

---

## 6. Dashboard & Analytics (`/api/v1/dashboard`, `/api/v1/analytics`)

### `GET /api/v1/dashboard/stats`
- **Purpose:** Aggregated performance analytics and equity curve data.
- **Auth:** **Required**.
- **Query Parameters:** `accountId`, `startDate`, `endDate`, `assetClass`, `strategyId`, `direction`, `session`.
- **Response Structure:** Returns `IDashboardStats`:
  - `netPnL`, `grossPnL`, `totalCosts`
  - `winRate`, `lossRate`, `profitFactor`, `expectancy`
  - `maxDrawdownAmount`, `maxDrawdownPercent`
  - `currentStreak`, `maxConsecutiveWins`, `maxConsecutiveLosses`
  - `equityCurve`: Array of `{ date, tradeId, symbol, netPnL, cumulativeEquity, drawdown, drawdownPercent }`
  - `dailyPnL`, `monthlyPnL`, `performanceByInstrument`, `performanceByStrategy`, `performanceByWeekday`, `performanceBySession`, `pnlDistribution`.

### `GET /api/v1/analytics/psychology`
- **Purpose:** Correlate emotional states and discipline scores with profitability.
- **Auth:** **Required**.
- **Responses:** `200 OK` with:
  - `performanceByDiscipline`: P&L and win rate grouped by 1–5 discipline score.
  - `performanceByEmotion`: P&L and win rate grouped by emotion before trade.
  - `mistakeAnalysis`: Total occurrences and cumulative financial loss per mistake flag.

---

## 7. Monthly Journal Calendar (`/api/v1/journal`)

### `GET /api/v1/journal/calendar`
- **Purpose:** Monthly calendar data with daily P&L and trade counts.
- **Auth:** **Required**.
- **Query Parameters:** `yearMonth` (format: `YYYY-MM`).
- **Response:** Array of calendar day objects (`date`, `netPnL`, `tradesCount`, `winCount`, `lossCount`, `hasJournal`, `disciplineRating`, `marketBias`).

### `GET /api/v1/journal/:date`
- **Purpose:** Retrieve daily reflection review, all trades executed on that date (`YYYY-MM-DD`), and calculated session `prefill` data (suggested best/worst trade, aggregated mistakes, suggested discipline rating, and daily loss breach status).
- **Auth:** **Required**.
- **Responses:** `200 OK` with `{ date, journal, trades, summary: { tradesCount, netPnL }, prefill }`.

### `POST /api/v1/journal/:date`
- **Purpose:** Upsert daily session reflection review.
- **Auth:** **Required**.
- **Request Body:**
  ```json
  {
    "marketConditions": "High volatility post-RBI policy announcement",
    "marketBias": "BEARISH",
    "emotionalState": "CALM",
    "disciplineRating": 4,
    "bestTradeId": "67b45...",
    "worstTradeId": "67b46...",
    "mistakes": ["CHASED_MARKET"],
    "lessonsLearned": "Wait for 15m candle close before entering against morning momentum",
    "nextDayPlan": "Focus exclusively on BankNifty key level retests"
  }
  ```
- **Responses:** `200 OK`.

### `DELETE /api/v1/journal/:date`
- **Purpose:** Delete daily review for date.
- **Auth:** **Required**.
- **Responses:** `200 OK`.

---

## 8. Risk Management Calculator (`/api/v1/risk`)

### `POST /api/v1/risk/calculate`
- **Purpose:** Deterministic position size, lot rounding, and R:R calculator.
- **Auth:** **Required**.
- **Request Body:**
  ```json
  {
    "accountEquity": 500000,
    "riskPercent": 1.5,
    "entryPrice": 24000,
    "stopLossPrice": 23940,
    "targetPrice": 24150,
    "direction": "LONG",
    "contractMultiplier": 1,
    "lotSize": 25,
    "quantityIncrement": 25,
    "estimatedCosts": 50
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "plannedRiskAmount": 7500,
      "riskPercentage": 1.5,
      "stopLossDistance": 60,
      "lossPerUnitAtStop": 60,
      "rawSuggestedQuantity": 125,
      "roundedLotQuantity": 125,
      "estimatedMonetaryLoss": 7550,
      "actualRiskPercentage": 1.51,
      "estimatedReward": 18750,
      "rewardRiskRatio": 2.48,
      "isDirectionValid": true,
      "isStopDistanceZero": false,
      "warnings": []
    }
  }
  ```

---

## 9. Chart Screenshot Attachments (`/api/v1/attachments`)

### `POST /api/v1/attachments/trades/:tradeId/upload`
- **Purpose:** Upload private chart screenshot for a trade.
- **Auth:** **Required**.
- **Content-Type:** `multipart/form-data`.
- **Form Fields:** `file` (binary), `category` (`SETUP`/`ENTRY`/`EXIT`/`REVIEW`/`OTHER`), `caption`, `timeframe`, `chartTimestamp`.
- **Validation:** Verifies MIME type and binary magic bytes (PNG, JPEG, WebP). Maximum 12 screenshots per trade.
- **Image Optimization:** Server-side lossless optimization (sharp). Stored MIME type and extension may be converted to WebP when lossless repack achieves >=10% compression without quality loss.
- **Responses:** `201 Created`, `400 INVALID_IMAGE_SIGNATURE`, `400 ATTACHMENT_LIMIT_EXCEEDED`, `404 TRADE_NOT_FOUND`.

### `GET /api/v1/attachments/trades/:tradeId`
- **Purpose:** List all attachments for a trade.
- **Auth:** **Required**.

### `GET /api/v1/attachments/:id/download` & `GET /api/v1/attachments/:id/stream`
- **Purpose:** Authenticated streaming of private chart image.
- **Auth:** **Required** (enforces tenant ownership).
- **Responses:** `200 OK` (streams binary file with inline content-disposition; `Content-Type` matches stored format, e.g. `image/webp`), `404 NOT_FOUND`.

### `PUT /api/v1/attachments/:id`
- **Purpose:** Update category, caption, or timeframe.
- **Auth:** **Required**.

### `DELETE /api/v1/attachments/:id`
- **Purpose:** Delete attachment from database and remove object from Cloudflare R2 bucket.
- **Auth:** **Required**.

---

## 10. Data Portability & Export/Import (`/api/v1/export`)

### `GET /api/v1/export/csv`
- **Purpose:** Stream CSV export of trades.
- **Auth:** **Required**.
- **Query Parameters:** `accountId`, `startDate`, `endDate`.
- **Response:** Content-Type `text/csv`, attachment filename `tradevault-export-<date>.csv`.

### `GET /api/v1/export/json`
- **Purpose:** Download full JSON backup of trade documents.
- **Auth:** **Required**.

### `POST /api/v1/export/import/preview`
- **Purpose:** Upload a broker tradebook or FYERS cash-ledger CSV, detect headers/broker format, normalize ledger rows, load saved mappings, and optionally check duplicates for an account.
- **Auth:** **Required**.
- **Content-Type:** `multipart/form-data` (`file`) or JSON `{ csvText }`.
- **Query/Body Parameters:**
  - `importKind`: `TRADES` (default) or `CASH_FLOWS`
  - `accountId`: required for ledger duplicate checks
  - `broker`: optional broker override; ledger defaults to `FYERS`
- **Trade Response:** `{ totalRows, headers, detectedBroker, availableBrokers, suggestedMapping, isRawExecutionLog, hasSavedMapping, previewRows, allRows }`.
- **Ledger Response:** `{ importKind: "CASH_FLOWS", totalRows, headers, detectedBroker, suggestedMapping, hasSavedMapping, summary: { depositCount, withdrawalCount, adjustmentCount, ignoredCount, duplicateCount, errorCount }, previewRows, allRows }`.

### `POST /api/v1/export/import/commit`
- **Purpose:** Commit trade rows, raw execution fills, or ledger rows.
- **Auth:** **Required**.
- **Trade Body:** `{ "accountId": "...", "rows": [...], "mapping": { ... }, "broker": "FYERS", "saveMapping": true }`.
- **Ledger Body:** `{ "accountId": "...", "importKind": "CASH_FLOWS", "rows": [...], "broker": "FYERS", "mapping": { ... }, "saveMapping": true }`.
- **Trade Behavior:** Groups raw executions with `calculateFIFOExecution`, calculates statutory charges, flags `importBatchId` + `['IMPORTED']`, prevents duplicates, and recalculates balances.
- **Ledger Behavior:** Classifies `BR`/`BP`/`JV`/`SJ`, writes `BROKER_LEDGER_IMPORT` + `CONFIRMED` transactions, applies SHA-256 idempotency keys, assigns a `ledger_*` batch ID, and recalculates balances only when rows were imported.
- **Response:** `{ batchId, importKind?, importedCount, duplicateCount, errorCount, errors, balanceSummary }`.

### `POST /api/v1/export/import/undo`
- **Purpose:** Undo an imported trade or ledger batch, deleting its records and reconciling affected account balances.
- **Auth:** **Required**.
- **Request Body:** `{ "batchId": "batch_..." }` or `{ "batchId": "ledger_..." }`. Omitting `batchId` selects the most recent trade or ledger batch.
- **Response:** `{ batchId, deletedCount, tradeDeletedCount, ledgerDeletedCount, affectedAccounts }`.

### `GET /api/v1/export/import/batches`
- **Purpose:** List recent trade and ledger import batches with timestamps and totals.
- **Auth:** **Required**.
- **Response:** Array with `importKind` (`TRADES`/`CASH_FLOWS`), `tradeCount`, `ledgerCount`, `accountId`, `createdAt`, `symbols`, `totalNetPnL`, and `totalAmount` (net ledger flow).

### `GET /api/v1/export/mappings`
- **Purpose:** List all saved broker column mappings for the authenticated user.
- **Auth:** **Required**.
- **Query Parameters:** `importKind` (`TRADES`/`CASH_FLOWS`, optional filter).
- **Response:** Array of `{ id, broker, importKind, name, mapping, createdAt, updatedAt }`.

### `GET /api/v1/export/mappings/:broker`
- **Purpose:** Retrieve saved column mapping for a specific broker (`ZERODHA`, `FYERS`, `ANGEL_ONE`, `UPSTOX`, `CUSTOM`).
- **Auth:** **Required**.
- **Query Parameters:** `importKind` (`TRADES`/`CASH_FLOWS`, default `TRADES`).

### `POST /api/v1/export/mappings`
- **Purpose:** Upsert a custom column mapping for a broker. Unique per `{ userId, broker, importKind }`.
- **Auth:** **Required**.
- **Request Body:** `{ "broker": "ZERODHA", "importKind": "TRADES", "name": "Zerodha Kite Mapping", "mapping": { ... } }`.
- **Response:** `{ id, broker, importKind, name, mapping }`.

---

## 11. Strategies & Instruments

### Strategies (`/api/v1/strategies`)
- `GET /api/v1/strategies` — List user's parent strategies enriched with aggregated win rate, profit factor, sample size, and bootstrap statistical edge validation.
- `POST /api/v1/strategies` — Create a custom parent strategy. Supports optional child setup variants array (`variants: [{ key, name, description, isActive, sortOrder, minRiskReward, expected, entryRules, stopLossRules, targetRules, invalidationCriteria, checklist }]`). Variant keys must be unique within the strategy.
- `GET /api/v1/strategies/:id` — Get single parent strategy detail with recent linked trades and bootstrap edge validation.
- `GET /api/v1/strategies/:id/analytics` — Compute Strategy Variant Analytics breakdown. Supports filtering by `startDate`, `endDate`, `accountId`, `symbol`, `session`, `entryModel`, `direction`, and `momentum`. Returns parent metrics, child variant performance buckets, `countsByStatus`, and mathematical invariant check (`invariantCheck.reconciled`).
- `PUT /api/v1/strategies/:id` — Update parent strategy and variants. **Referential Integrity Protection:** If an update attempts to delete a variant that is currently referenced by historical trade records, the API rejects the request with `409 Conflict` (error code: `VARIANT_IN_USE`, containing `inUseKeys`). In-use variants must be archived (`isActive: false`) instead of deleted.
- `DELETE /api/v1/strategies/:id` — Delete parent strategy.
- `POST /api/v1/strategies/pack/liquidity-retracement` — Idempotently insert institutional starter playbook with parent strategies and child setup variants into the user's database. Missing variants are merged without duplicating existing records.

### Trade Setup Templates (`/api/v1/templates`)
- `GET /api/v1/templates` — List all 25 built-in institutional templates (including 5 specialized Liquidity and Support/Resistance setups) and user custom templates merged with aggregated tenant-isolated trade performance metrics (`totalTrades`, `winTrades`, `winRate`, `netPnL`, `profitFactor`).
- `POST /api/v1/templates` — Create a custom user setup template. Requires `name`, `group` (`'FNO'|'STOCKS'|'FOREX_GOLD'|'CRYPTO'|'MCX'|'PRICE_ACTION'|'CUSTOM'`), `markets`, `slRule` (`PERCENT`, `POINTS`, `PREMIUM_PERCENT`, or `MANUAL`), `minRR`, and `titlePattern`. Real symbols or fixed prices are strictly prohibited.
- `GET /api/v1/templates/:id` — Get single template details and performance stats. Supports built-in IDs (e.g. `'fno-orb'`) or custom MongoDB ObjectIds.
- `PUT /api/v1/templates/:id` — Update custom template. Modifying built-in templates returns `400 Bad Request` with error code `BUILT_IN_READ_ONLY`.
- `DELETE /api/v1/templates/:id` — Delete custom template. Deleting built-in templates returns `400 Bad Request` with error code `BUILT_IN_READ_ONLY`.
- `POST /api/v1/templates/:id/favorite` — Toggle favorite star status on custom template.
- `POST /api/v1/templates/:id/use` — Increment `usageCount` and update `lastUsedAt`.

### Instruments (`/api/v1/instruments`)
The Instruments endpoint returns ONLY instruments the authenticated user has actually traded or explicitly created. There are no global presets or catalogs exposed in the user's instruments list. When a trade is logged for a symbol, an underlying instrument is automatically created if it does not already exist.

- `GET /api/v1/instruments` — List only instruments traded or created by the authenticated user (returns `[]` for fresh users). Each instrument is enriched via aggregation with `tradeCount`, `netPnL` (net realized profit/loss), `firstTradedAt`, `lastTradedAt`, `source` (`'AUTO'` | `'CUSTOM'`), and `needsReview` (boolean flag set to `true` when auto-created from an unknown symbol without a preset spec).
- `POST /api/v1/instruments` — Create custom instrument with `source: 'CUSTOM'`. Enforces unique `{ userId, symbol }` constraint (returns `409 Conflict` with code `DUPLICATE_INSTRUMENT` if symbol already exists for the user).
- `POST /api/v1/instruments/:id/preview-update` — Non-destructive preview calculating financial impact of proposed instrument changes (e.g. multiplier updates) across all existing trades referencing this instrument. Returns `tradesCount`, `oldTotalNetPnL`, `newTotalNetPnL`, `deltaNetPnL`, and `affectedAccountIds`.
- `PUT /api/v1/instruments/:id` — Update instrument specifications. Accepts optional `applyToTrades: boolean` (default: `false`). When `applyToTrades: true`, atomically updates all existing trades linked to this instrument in a single transaction, recalculates trade gross P&L, fees, and net P&L using `@tradevault/financial-engine`, appends audit log entries, and authoritatively reconciles affected account balances via `AccountService.recalculateAccountBalances()`. Clears `needsReview` flag. Returns `409 Conflict` if updating symbol to an existing symbol for the user.
- `DELETE /api/v1/instruments/:id` — Delete instrument. Enforces referential integrity: returns `409 Conflict` with error code `INSTRUMENT_IN_USE` if any existing trades reference this instrument. Allowed only when `tradeCount === 0`.

---

## 12. Settings & Integrations

### Settings (`/api/v1/settings`)
- `GET /api/v1/settings/profile` — Return user profile including base currency, theme, and `riskSettings`.
- `PUT /api/v1/settings/profile` — Update name, base currency, theme, and `riskSettings` (`maxDailyLoss`, `maxDailyTrades`, `maxOpenTrades`, `maxRiskPerTradePercent`, `revengeTradingMinutes`).
- `POST /api/v1/settings/change-password` — Change password (`currentPassword`, `newPassword`).
- `GET /api/v1/settings/system-status` — Return total trade count, account count, attachment count, database type, and version.

### Broker Integrations (`/api/v1/integrations`)
- `GET /api/v1/integrations/fyers/status` — Return connection status (`DISABLED`/`IDLE`), App ID, client ID, token expiry, funds sync status/error, callback `redirectUri`, and architecture capabilities. Secrets/tokens are never returned.
- `POST /api/v1/integrations/fyers/config` — Store an encrypted FYERS App ID and Secret Key. Changing the App ID requires the secret again; credential changes invalidate existing tokens.
- `POST /api/v1/integrations/fyers/connect` — Create a short-lived OAuth state and return the FYERS login URL.
- `GET /api/v1/integrations/fyers/login-url` — Legacy-compatible alias for creating an OAuth login URL.
- `GET /api/v1/integrations/fyers/callback` — Public FYERS OAuth callback. Exchanges `auth_code`, stores encrypted tokens, clears the state, and redirects to `/settings`.
- `POST /api/v1/integrations/fyers/sync` — Fetch and FIFO-import current-day FYERS executions, then recalculate balances.
- `POST /api/v1/integrations/fyers/disconnect` — Clear encrypted tokens/state while preserving app credentials.

---

## 13. Daily Review Queue & Mistake Detection (`/api/v1/review`)

### `GET /api/v1/review/queue`
- **Purpose:** Retrieve unreviewed trades missing exit, reflections, or screenshots, and unreviewed trading sessions in the last 30 days. Includes heuristic mistake suggestions (`REVENGE_TRADING`, `OVERTRADING`, `SIZE_VIOLATION`) and daily loss breach alerts.
- **Auth:** **Required**.
- **Responses:** `200 OK` with `{ queue: [...], unreviewedDays: [...], dailyLossBreach: { breached, maxDailyLoss, currentDailyLoss }, summary: { totalUnreviewedTrades, missingExitCount, missingPsychologyCount, missingScreenshotsCount, unreviewedDaysCount } }`.

### `GET /api/v1/review/prefill/:date`
- **Purpose:** Calculate automated prefill data for a daily reflection session, suggesting best trade, worst trade, aggregated mistake tags, and rule-based discipline rating (1 to 5).
- **Auth:** **Required**.
- **Path Parameters:** `date` (`YYYY-MM-DD`).
- **Responses:** `200 OK` with `{ date, suggestedBestTrade, suggestedWorstTrade, aggregatedMistakes, suggestedDisciplineRating, reasoning, dailyLossBreach, tradesCount, netPnL }`.

### `GET /api/v1/review/suggest-mistakes/:tradeId`
- **Purpose:** Analyze a specific trade in chronological execution context and return rule-based mistake suggestions.
- **Auth:** **Required**.
- **Responses:** `200 OK` with array of `{ tradeId, rule, mistakeTag, severity, message }`.

