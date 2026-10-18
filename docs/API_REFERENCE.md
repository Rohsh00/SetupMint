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
- **Purpose:** Revoke session and clear cookie.
- **Auth:** Public (safely handles missing token).
- **Responses:**
  - `200 OK`: Session deleted from database, cookie expired.

### `GET /api/v1/auth/me`
- **Purpose:** Retrieve active authenticated user profile.
- **Auth:** **Required**.
- **Responses:**
  - `200 OK`: Returns `{ user: { id, email, name, baseCurrency, theme, createdAt } }`.
  - `401 Unauthorized`: Missing or invalid session token.

---

## 4. Trading Accounts (`/api/v1/accounts`)

### `GET /api/v1/accounts`
- **Purpose:** List all trading accounts owned by authenticated user.
- **Auth:** **Required**.
- **Response:** Array of accounts with initial balance, realized P&L, deposits, withdrawals, and current balance.

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
- **Responses:** `200 OK` (sorted by date desc).

### `POST /api/v1/accounts/:id/reconcile`
- **Purpose:** Force authoritative balance recalculation from all closed trades and cash transactions.
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
- **Purpose:** Update trade fields, recalculate P&L, append audit log entry, and re-balance account.
- **Auth:** **Required**.
- **Responses:** `200 OK`, `404 TRADE_NOT_FOUND`.

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
- **Purpose:** Retrieve daily reflection review and all trades executed on a specific date (`YYYY-MM-DD`).
- **Auth:** **Required**.
- **Responses:** `200 OK`.

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
- **Responses:** `201 Created`, `400 INVALID_IMAGE_SIGNATURE`, `400 ATTACHMENT_LIMIT_EXCEEDED`, `404 TRADE_NOT_FOUND`.

### `GET /api/v1/attachments/trades/:tradeId`
- **Purpose:** List all attachments for a trade.
- **Auth:** **Required**.

### `GET /api/v1/attachments/:id/download` & `GET /api/v1/attachments/:id/stream`
- **Purpose:** Authenticated streaming of private chart image.
- **Auth:** **Required** (enforces tenant ownership).
- **Responses:** `200 OK` (streams binary file with inline content-disposition), `404 NOT_FOUND`.

### `PUT /api/v1/attachments/:id`
- **Purpose:** Update category, caption, or timeframe.
- **Auth:** **Required**.

### `DELETE /api/v1/attachments/:id`
- **Purpose:** Delete attachment from database and physically unlink file from `./data/uploads`.
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
- **Purpose:** Upload broker CSV, parse headers, and generate suggested column mappings.
- **Auth:** **Required**.
- **Content-Type:** `multipart/form-data` (`file`).
- **Response:** `{ totalRows, headers, suggestedMapping, previewRows: [5] }`.

### `POST /api/v1/export/import/commit`
- **Purpose:** Commit parsed rows to target account with duplicate detection.
- **Auth:** **Required**.
- **Request Body:** `{ "accountId": "...", "rows": [...], "mapping": { "tradeDate": "...", "symbol": "...", ... } }`.
- **Response:** `{ importedCount, duplicateCount, errors: [] }`.

---

## 11. Strategies & Instruments

### Strategies (`/api/v1/strategies`)
- `GET /api/v1/strategies` — List strategies with aggregated win rate and profit factor.
- `POST /api/v1/strategies` — Create strategy.
- `GET /api/v1/strategies/:id` — Get strategy with 50 recent trades.
- `PUT /api/v1/strategies/:id` — Update strategy.
- `DELETE /api/v1/strategies/:id` — Delete strategy.

### Instruments (`/api/v1/instruments`)
- `GET /api/v1/instruments` — List global presets combined with user-created instruments.
- `POST /api/v1/instruments` — Create custom instrument.
- `PUT /api/v1/instruments/:id` — Update custom instrument.
- `DELETE /api/v1/instruments/:id` — Delete custom instrument.

---

## 12. Settings & Integrations

### Settings (`/api/v1/settings`)
- `PUT /api/v1/settings/profile` — Update name, base currency, and theme.
- `POST /api/v1/settings/change-password` — Change password (`currentPassword`, `newPassword`).
- `GET /api/v1/settings/system-status` — Return total trade count, account count, attachment count, database type, and version.

### Broker Integrations (`/api/v1/integrations`)
- `GET /api/v1/integrations/fyers/status` — Return connection status (`DISABLED`/`IDLE`), App ID, and architecture capabilities.
- `POST /api/v1/integrations/fyers/config` — Store FYERS App ID.
