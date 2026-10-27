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

### `POST /api/v1/trades/:id/auto-classify`
- **Purpose:** Automatically evaluate 4H higher-timeframe trend and 5M lower-timeframe candle market structure around entry time, detect pattern/liquidity sweep (`EQL`, `W-SWEEP`, `W-UNSWEPT`, `EQH`, `M-SWEEP`, `M-UNSWEPT`), match to the trader's active strategy and child variant, update `trade.setup`, `thesis`, and record an `AUTO_CLASSIFIED` audit log.
- **Auth:** **Required** (enforces tenant isolation).
- **Responses:** `200 OK` with `{ "success": true, "data": IAutoClassifyResult }`.

### `POST /api/v1/trades/auto-classify-batch`
- **Purpose:** Batch execute automated 4H trend + 5M setup pattern recognition and variant classification across multiple trades.
- **Auth:** **Required**.
- **Request Body:** `{ "tradeIds": ["id1", "id2"] }`.
- **Responses:** `200 OK` with `{ "success": true, "data": { "total": 2, "classified": 2, "failed": 0, "results": [] } }`.

### `POST /api/v1/trades/bulk-delete`
- **Purpose:** Delete multiple trades, clean attachments from disk, and reconcile all affected accounts.
- **Auth:** **Required**.
- **Request Body:** `{ "tradeIds": ["id1", "id2"] }`.
- **Responses:** `200 OK`.

### `POST /api/v1/trades/:id/excursion/compute`
- **Purpose:** Fetch historical 1m/5m FYERS candles for the trade lifecycle ($T_{\text{entry}}$ to $T_{\text{exit}}$), compute MAE/MFE points, amounts, R-multiples, and Exit Efficiency, detect post-stop reversals, cache the candle snapshot, and persist `calculated.excursion` to the trade.
- **Auth:** **Required** (enforces tenant isolation).
- **Responses:**
  - `200 OK`: Returns `{ "success": true, "data": ITradeExcursion }`.
  - `400 TRADE_NOT_CLOSED`: If trade status is not `'CLOSED'`.
  - `404 TRADE_NOT_FOUND`: If trade does not exist or belongs to another user.
  - `409 BROKER_NOT_CONNECTED`: If FYERS broker is not connected for the user.

### `POST /api/v1/trades/:id/chart/generate`
- **Purpose:** Server-side automated generation of TradingView-grade dark-mode SVG candlestick execution charts with user-selected multi-timeframes ('1', '5', '15', '30', '60', 'D') and configurable pre-entry and post-exit candle padding (0..200, default 45 each). Persisted to Cloudflare R2 and attached to the trade as `AUTO_CHART`.
- **Auth:** **Required** (enforces tenant isolation).
- **Request Body:**
  ```json
  {
    "force": false,
    "resolutions": ["1", "5", "15"],
    "paddingBefore": 45,
    "paddingAfter": 45,
    "provider": "AUTO"
  }
  ```
  - `force` *(optional boolean, default `false`)*: If `true`, replaces existing charts of matching timeframes (cleaning up older R2 storage objects and `screenshotIds`).
  - `resolutions` *(optional array of strings `['1','5','15','30','60','D']`, 1..5 items, unique)*: Specific timeframes to generate. If omitted, triggers legacy auto-pick (`trade <= 4h -> '1', else '5'`).
  - `paddingBefore` *(optional integer `0..200`, default `45`)*: Number of timeframe candles to display before trade entry.
  - `paddingAfter` *(optional integer `0..200`, default `45`)*: Number of timeframe candles to display after trade exit.
- **Responses:**
  - `200 OK` *(when `resolutions` is provided)*: Multi-item execution envelope:
    ```json
    {
      "success": true,
      "data": {
        "results": [
          {
            "resolution": "5",
            "timeframe": "5m",
            "status": "CREATED",
            "attachment": { "id": "...", "category": "AUTO_CHART", "downloadUrl": "..." },
            "requestedBefore": 45,
            "requestedAfter": 45,
            "appliedBefore": 45,
            "appliedAfter": 45,
            "truncated": false,
            "warnings": []
          }
        ]
      }
    }
    ```
    - Status values: `'CREATED'`, `'REPLACED'`, `'SKIPPED_EXISTS'`, `'FAILED'`.
    - Warning codes: `'PADDING_REDUCED_LOOKBACK'`, `'PADDING_REDUCED_DATA'`, `'WINDOW_TRUNCATED'`, `'UNDERLYING_FALLBACK'`.
    - Failure error codes: `'OUTSIDE_PROVIDER_LOOKBACK'`, `'EMPTY_RESULT'`, `'DAILY_BUDGET_EXHAUSTED'`, `'NOT_CONNECTED'`, `'TOKEN_EXPIRED'`, `'CIRCUIT_OPEN'`, `'NO_SYMBOL_TOKEN'`, `'ATTACHMENT_LIMIT_EXCEEDED'`, `'CHART_GENERATION_FAILED'`.
  - `201 Created` *(legacy path when `resolutions` is omitted)*: Returns `{ "success": true, "data": IAttachment }` for backwards compatibility with single-chart consumers.
  - `400 VALIDATION_ERROR`: If parameters are invalid (e.g. padding < 0 or > 200, non-integer, duplicate resolutions, > 5 resolutions, or unknown fields).
  - `400 TRADE_NOT_CLOSED`: If trade status is not `'CLOSED'`.
  - `404 TRADE_NOT_FOUND`: If trade does not exist or belongs to another user.
  - `500 CHART_GENERATION_FAILED`: If legacy generation fails.

### `POST /api/v1/trades/:id/stop-moves/detect`
- **Purpose:** Detect trailing vs risk-widening stop-loss modifications from the connected FYERS orderbook or manual order sequence, calculate point deltas, persist `stopLossMoveEvents` and `calculated.stopMoveSummary`, and automatically flag `STOP_MOVED` mistake tag if risk was widened.
- **Auth:** **Required** (enforces tenant isolation).
- **Request Body:**
  ```json
  {
    "manualModifications": [
      {
        "stopPrice": 2800.50,
        "modifiedAt": "2026-10-25T09:45:00.000Z",
        "orderId": "12345678",
        "orderType": 3,
        "reason": "Trailed to break-even"
      }
    ]
  }
  ```
- **Responses:**
  - `200 OK`: Returns `{ "success": true, "data": { "stopLossMoveEvents": [...], "stopMoveSummary": {...}, "mistakeSuggestions": ["STOP_MOVED"], "flags": [...] } }`.
  - `400 VALIDATION_ERROR`: If manual modifications payload contains negative prices or invalid timestamps.
  - `404 TRADE_NOT_FOUND`: If trade does not exist or belongs to another user.
  - `500 STOP_MOVE_DETECTION_FAILED`: If detection fails.

### `GET /api/v1/trades/:id/stop-moves`
- **Purpose:** Retrieve recorded stop-loss modifications, timeline history, and net risk expansion summary for a trade.
- **Auth:** **Required** (enforces tenant isolation).
- **Responses:**
  - `200 OK`: Returns `{ "success": true, "data": { "stopLossMoveEvents": [...], "stopMoveSummary": {...} } }`.
  - `404 TRADE_NOT_FOUND`: If trade does not exist or belongs to another user.

### `GET /api/v1/trades/:id/interactive-candles`
- **Purpose:** Retrieve historical candlestick data and trade execution levels formatted for TradingView Lightweight Charts canvas.
- **Auth:** **Required** (enforces tenant isolation).
- **Query Parameters:**
  - `resolution`: Candlestick timeframe (`'1' | '3' | '5' | '15' | '30' | '60' | '240' | 'D'`). Default: `'5'`.
  - `from`: Start timestamp or ISO date string (optional).
  - `to`: End timestamp or ISO date string (optional).
  - `preloadBefore`: Number of candles before entry to preload. Default: `150`.
  - `preloadAfter`: Number of candles after exit to preload. Default: `50`.
  - `force`: Force re-fetch from market data provider. Default: `false`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "trade": {
          "id": "string",
          "symbol": "string",
          "direction": "LONG | SHORT",
          "entryPrice": 24500,
          "exitPrice": 24650,
          "entryTime": "2026-10-23T04:00:00.000Z",
          "exitTime": "2026-10-23T04:45:00.000Z",
          "stopLoss": 24450,
          "takeProfit": 24700,
          "pnl": 7463,
          "realizedRMultiple": 3.0,
          "strategyName": "SWEEP TO FILL",
          "setup": { "variantKey": "W-SWEEP" }
        },
        "candles": [
          { "time": 1792728000, "open": 24480, "high": 24495, "low": 24470, "close": 24488, "volume": 12000 }
        ],
        "resolution": "5",
        "provider": "FYERS",
        "isUnderlyingFallback": false,
        "symbol": "NSE:NIFTY50-INDEX",
        "firstTime": 1792728000,
        "lastTime": 1792737000
      }
    }
    ```
  - `404 TRADE_NOT_FOUND`: If trade does not exist or belongs to another user.
  - `404 NO_CANDLE_DATA`: If neither provider nor cached snapshots contain candle data for this trade.

### `POST /api/v1/trades/drilldown`
- **Purpose:** Universal trade drill-down resolver endpoint. Accepts a `DrillDescriptor` (`kind: 'TRADE' | 'TRADES' | 'FILTER'`) and returns matching trade documents with strict tenant isolation, server-side pagination, and Decimal.js aggregate reconciliation.
- **Auth:** **Required** (enforces tenant isolation).
- **Date Range Consistency:** When `filter.startDate` and/or `filter.endDate` (`YYYY-MM-DD`) are supplied in a `FILTER` descriptor, queries filter strictly on the indexed session date `tradeDate` using inclusive UTC boundaries computed from IST (+05:30) via `buildDateRangeClause`. This guarantees exact 1-to-1 parity between trades list queries, dashboard KPI metrics, and drilldown aggregates.
- **Request Body:**
  ```json
  {
    "descriptor": {
      "kind": "FILTER",
      "label": "Losses > ₹2,000",
      "filter": {
        "netPnLMax": -2000,
        "startDate": "2026-01-01",
        "endDate": "2026-10-26"
      }
    },
    "page": 1,
    "limit": 50,
    "sortBy": "tradeDate",
    "sortOrder": "desc"
  }
  ```
  *(Note: `limit` is clamped to a maximum of 200 per page).*
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "descriptor": { ... },
        "trades": [ ... ],
        "totalCount": 14,
        "page": 1,
        "limit": 50,
        "totalPages": 1,
        "aggregates": {
          "totalCount": 14,
          "sumNetPnL": -42150.5,
          "avgNetPnL": -3010.75,
          "sumRealizedR": -12.4,
          "avgRealizedR": -0.88,
          "winCount": 0,
          "lossCount": 14,
          "breakevenCount": 0,
          "winRatePercent": 0
        }
      }
    }
    ```
  - `400 BAD_REQUEST`: Invalid descriptor payload or Zod schema validation error.

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

### `GET /api/v1/dashboard/equity-curves`
- **Purpose:** Multi-panel performance equity view data powering synchronized Money curve, Drawdown/Underwater curve, Cumulative-R curve, Per-Strategy overlays, Monte Carlo expectancy cone, and event markers.
- **Auth:** **Required** (enforces tenant isolation).
- **Query Parameters:**
  - `accountId` (optional): Filter trades by trading account ID.
  - `startDate` (optional): ISO 8601 start timestamp.
  - `endDate` (optional): ISO 8601 end timestamp.
  - `overlayStrategies` (optional): Comma-separated list of strategy IDs (up to 6) to compute individual cumulative-R performance curves for.
  - `coneTrades` (optional): Projected trade count for Monte Carlo simulation (`50`, `100`, or `200`). Default: `100`.
- **Responses:**
  - `200 OK`: Returns `IEquityCurvesResponse`:
    - `moneyCurve`: Array of `{ tradeId, symbol, date, netPnL, cumulativeEquity, drawdown, drawdownPercent, highWaterMark, tradeIndex }`
    - `rCurve`: Array of `{ tradeId, symbol, date, realizedR, cumulativeR, tradeIndex }`
    - `underwater`: `{ currentDrawdown, currentDrawdownPercent, maxDrawdown, maxDrawdownPercent, longestRecoveryDays, longestRecoveryTrades, isAtHighWaterMark }`
    - `rCoverage`: `{ totalTrades, rMultipleTrades, coveragePercent }`
    - `strategyOverlays`: Array of `{ strategyId, strategyName, curve, totalTrades, finalR, sampleSizeWarning }`
    - `monteCarloCone`: `{ isEligible, sampleSize, edgeVerdict, avgR, winRate, simulationsCount, stepsCount, bands: { step, p5, p25, p50, p75, p95 }[] }`
    - `eventMarkers`: `{ dailyLossBreaches: { date, netLoss, dailyLossLimit, tradeIds }[], highTiltDays: { date, tiltScore, tradeIds }[] }`

### `GET /api/v1/analytics/psychology`
- **Purpose:** Correlate emotional states and discipline scores with profitability.
- **Auth:** **Required**.
- **Query Parameters:** `accountId` (optional), `startDate` (optional `YYYY-MM-DD`), `endDate` (optional `YYYY-MM-DD`). Inclusive session date filtering via `tradeDate`.
- **Responses:** `200 OK` with:
  - `performanceByDiscipline`: P&L and win rate grouped by 1–5 discipline score.
  - `performanceByEmotion`: P&L and win rate grouped by emotion before trade.
  - `mistakeAnalysis`: Total occurrences and cumulative financial loss per mistake flag.

### `GET /api/v1/analytics/excursion`
- **Purpose:** Retrieve aggregate execution quality KPIs and MAE vs MFE scatter points for closed trades with computed excursion metrics.
- **Auth:** **Required**.
- **Query Parameters:** `accountId`, `strategyId`, `variantKey`, `startDate`, `endDate`, `session`.
- **Responses:** `200 OK` with:
  - `summary`: `{ totalEvaluated, avgMaeR, avgMfeR, avgExitEfficiency, gaveBackProfitPercent, reversalAfterStopPercent }`
  - `scatterPoints`: Array of `{ tradeId, symbol, maeR, mfeR, netPnL, outcome, exitEfficiency, tradeDate }`

### `POST /api/v1/analytics/what-if`
- **Purpose:** Execute statistically honest, candle-replay Stop/Target parameter matrix simulation against cached trade snapshots.
- **Auth:** **Required**.
- **Request Body:**
  ```json
  {
    "filters": {
      "accountId": "string (optional)",
      "strategyId": "string (optional)",
      "variantKey": "string (optional)",
      "symbol": "string (optional)",
      "session": "string (optional)",
      "direction": "LONG | SHORT (optional)",
      "assetClass": "string (optional)",
      "marketSegment": "string (optional)",
      "startDate": "YYYY-MM-DD (optional)",
      "endDate": "YYYY-MM-DD (optional)"
    },
    "stopRGrid": [null, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
    "targetRGrid": [null, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0],
    "fillModel": "GAP_AWARE | AT_LEVEL (default: GAP_AWARE)",
    "slippageTicks": 0,
    "resolutionPolicy": "FINEST_AVAILABLE | ONE_MINUTE_ONLY (default: FINEST_AVAILABLE)",
    "excludeManagedStopTrades": true,
    "holdoutFraction": 0.3
  }
  ```
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "meta": { "filters": {}, "fillModel": "GAP_AWARE", "holdoutFraction": 0.3 },
        "scope": {
          "tradesInScope": 75,
          "nEligible": 48,
          "exclusions": { "EXCLUDED_MULTI_FILL": 12, "EXCLUDED_NO_STOP": 8, "EXCLUDED_NO_CANDLES": 7 }
        },
        "calibration": {
          "testedCount": 18,
          "matchingStopCount": 17,
          "agreement": 0.9444,
          "calibrationWarning": false
        },
        "baseline": {
          "nEligible": 48,
          "meanR_actual": 0.42,
          "totalNet_actual": 12450.00,
          "winRate_actual": 54.17,
          "profitFactor_actual": 1.82
        },
        "cells": [
          {
            "stopR": 1.0,
            "targetR": 2.0,
            "all": { "nEval": 48, "meanR_pess": 0.58, "meanR_opt": 0.65, "winRate_pess": 56.25 },
            "inSample": { "nEval": 34, "meanR_pess": 0.60 },
            "holdout": { "nEval": 14, "meanR_pess": 0.54 },
            "verdict": "BETTER_ROBUST",
            "holdsOutOfSample": true,
            "bootstrapIntervalPess": [0.08, 0.28],
            "bootstrapIntervalOpt": [0.14, 0.35]
          }
        ],
        "drillDescriptors": { "ambiguous": [], "censored": [], "exclusions": {} },
        "winnersMaeDistribution": [{ "rangeLabel": "0.0 - 0.5R", "count": 22, "pct": 45.8 }],
        "allTradesMfeDistribution": [{ "rangeLabel": "1.0 - 2.0R", "count": 18, "pct": 37.5 }]
      }
    }
    ```
  - `400 Bad Request`: `VALIDATION_ERROR` or `SCOPE_TOO_LARGE` (if closed trades matching filter exceed 500).

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
- **Purpose:** Download full JSON backup of trade documents with optional date range and account filtering.
- **Auth:** **Required**.
- **Query Parameters:** `accountId` (optional), `startDate` (optional `YYYY-MM-DD`), `endDate` (optional `YYYY-MM-DD`). Inclusive session date filtering via `tradeDate`.
- **Response:** Content-Type `application/json`, attachment filename `tradevault-export-<date>.json`.

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
- `GET /api/v1/settings/profile` — Return user profile including base currency, theme, `riskSettings`, and `patternDetectionSettings` (`defaultHtf`, `defaultLtf`, `autoDetectOnImport`, `autoDetectMistakes`, `instrumentOverrides`).
- `PUT /api/v1/settings/profile` — Update name, base currency, theme, `riskSettings` (`maxDailyLoss`, `maxDailyTrades`, `maxOpenTrades`, `maxRiskPerTradePercent`, `revengeTradingMinutes`), and `patternDetectionSettings` (`defaultHtf`, `defaultLtf`, `autoDetectOnImport`, `autoDetectMistakes`, `instrumentOverrides: [{ symbol, htf, ltf, preferredStrategyId?, preferredStrategyName? }]`).
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
- `POST /api/v1/integrations/fyers/excursion-backfill` — Batch process excursion calculations for closed trades missing excursion metrics using rate-limited FYERS historical candles. Accepts `{ startDate, endDate, limit, provider }`. Returns `{ processed, computed, failed, remaining, fyersFilled, angelOneFilled }`.
- `POST /api/v1/integrations/fyers/sl-backfill` — Backfill initial stop losses from the current-day FYERS orderbook for trades lacking stops. Accepts `{ dryRun?: boolean, timeToleranceSeconds?: number }`. Supports safe dry-run inspection, calculates realized R-multiples, and records audit log entries without overwriting manual stops.

### Market Data Fallback Integrations (`/api/v1/integrations/market-data`)
Historical candle market-data-only fallback source for MAE/MFE excursion analytics and automatic chart screenshot generation. Strictly read-only market data; zero trading, order placement, or fund management endpoints.
- `GET /api/v1/integrations/market-data/angel-one/status` — Return sanitized connection status, clientCode, connected boolean, token expiry, atomic `dailyCallsUsed`, `dailyBudget`, and instrument cache timestamp. Credentials and tokens are never returned.
- `POST /api/v1/integrations/market-data/angel-one/config` — Save or update AES-256-GCM encrypted credentials (`apiKey`, `clientCode`, `pin`). Invalidator on key/code change.
- `POST /api/v1/integrations/market-data/angel-one/connect` — Authenticate session using dynamic 6-digit TOTP (`totp`). Rate limited to 15 req/min. TOTP is never stored or logged. Returns updated integration status.
- `POST /api/v1/integrations/market-data/angel-one/disconnect` — Clear active session tokens and terminate upstream SmartAPI session.
- `DELETE /api/v1/integrations/market-data/angel-one` — Purge credentials, tokens, and user-cached instrument records completely.
- `POST /api/v1/integrations/market-data/angel-one/refresh-instruments` — Download and bulk upsert SmartAPI Scrip Master (`OpenAPIScripMaster.json`) into indexed MongoDB collection for fast O(1) symbol token resolution.

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

