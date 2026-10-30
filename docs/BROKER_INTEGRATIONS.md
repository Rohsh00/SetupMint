# SetupMint — Broker Integrations & FYERS

This document describes the FYERS API v3 integration, broker funds reconciliation, and the broker CSV import pipeline.

---

## 1. Architecture & Privacy Principles

SetupMint remains local-first:

1. Broker credentials and tokens are stored server-side only and encrypted at rest.
2. Tokens are never sent to the browser, embedded in trades, logged, or returned by API routes.
3. Broker data never directly overwrites authoritative journal balances.
4. Broker balances create a `PENDING_REVIEW` adjustment that the trader must confirm or reject.
5. Mobile Execution Bridge: Two-way broker executions (1-tap Market Exit, Lock True BE, Book 50%) can be dispatched directly from mobile Telegram button callbacks through encrypted user mappings. See [**`TELEGRAM_INTEGRATION.md`**](TELEGRAM_INTEGRATION.md).

The live integration is disabled unless it is explicitly configured and authorized. CSV import remains available without any broker API connection.

---

## 2. FYERS Configuration

### Environment variables

```dotenv
# Optional dev override; production should set these explicitly.
FYERS_API_BASE=https://api-t1.fyers.in/api/v3
FYERS_REDIRECT_URI=http://127.0.0.1:4000/api/v1/integrations/fyers/callback
WEB_APP_URL=http://localhost:5173
TOKEN_ENCRYPTION_KEY=<at-least-32-random-characters>
FYERS_FUNDS_DRIFT_TOLERANCE=1
FYERS_FUNDS_SYNC_ENABLED=true
```

`TOKEN_ENCRYPTION_KEY` is mandatory in production and must be at least 32 characters. It is used for AES-256-GCM encryption of FYERS app secrets, access tokens, and refresh tokens.

### User configuration

In **Settings → FYERS Broker Integration**, the trader saves:

- FYERS App ID (Client ID)
- FYERS Secret Key

The secret is encrypted before it is stored. A saved secret is never returned to the browser; the UI only shows whether one exists. Changing the App ID requires entering the secret again so credentials cannot become mismatched.

The exact callback URL registered in the FYERS dashboard is returned by `GET /api/v1/integrations/fyers/status` as `redirectUri` and displayed in Settings.

### OAuth flow

1. `GET /api/v1/integrations/fyers/login-url` (or `POST /connect`) creates a random 32-byte state nonce.
2. Only the SHA-256 hash of the state and a 10-minute expiry are stored on `BrokerIntegration`.
3. The browser is redirected to FYERS `/generate-authcode` with the configured redirect URI and state.
4. FYERS redirects to the callback with `auth_code` and `state`.
5. The backend finds the integration by state hash and expiry, exchanges the code via `/validate-authcode`, and stores encrypted tokens.
6. The state is cleared after a successful exchange. The callback then redirects to `/settings` with a status message.

FYERS access tokens expire daily at **06:30 IST**. The app stores the next expiry and requires re-authentication after that time.

Refresh tokens are stored encrypted but refresh-token exchange is not implemented. The safe fallback is the normal daily OAuth login.

---

## 3. Broker Data Model

### `BrokerIntegration`

One document per `{ userId, broker }` stores:

- `appId`, encrypted `secretKey`
- encrypted `accessToken`, encrypted `refreshToken`
- `clientId`, `linkedAccountId`
- `tokenExpiresAt`, `authCodeExpiresAt`
- hashed OAuth state and expiry
- `autoSyncEnabled`, `lastSyncAt`, `lastFundsSyncAt`, `fundsSyncError`
- bounded `syncHistory`

Mongoose `toJSON` / `toObject` transforms remove secrets, tokens, and OAuth state hashes.

### `BrokerFundsSnapshot`

Each successful funds fetch persists exact `Decimal128` values:

- `totalBalance`
- `clearBalance`
- `availableBalance`
- `realizedPnL`
- `utilizedAmount`
- raw `fundLimits[]`

Snapshots are append-only history scoped by `userId` and `accountId`.

### `TradingAccount.brokerLink`

An account may have one FYERS link:

```typescript
brokerLink?: {
  broker: 'FYERS';
  clientId: string;
  linkedAt: Date;
};
```

Only accounts whose `broker` is `FYERS` can be linked. A client ID cannot be linked to more than one account for the same user.

---

## 4. Funds Sync & Reconciliation

### Link an account

`POST /api/v1/accounts/:id/broker-link`

Requires an active FYERS session. The supplied client ID must match the connected FYERS client.

### Sync funds

`POST /api/v1/accounts/:id/sync-funds`

The backend:

1. Verifies the account link and active FYERS session.
2. Calls `GET /funds` with the encrypted access token.
3. Normalizes `fund_limit[]` rows by title:
   - `Total Balance`
   - `Clear Balance`
   - `Available Balance`
   - `Realized Profit and Loss`
   - `Utilized Amount`
4. Persists a `BrokerFundsSnapshot`.
5. Compares FYERS `Clear Balance` with the authoritative SetupMint `currentBalance`.
6. Creates at most one `PENDING_REVIEW` `ADJUSTMENT` when reconciliation is needed.

Reconciliation rules:

- Drift within `FYERS_FUNDS_DRIFT_TOLERANCE` → no suggestion.
- Any `OPEN` or `PLANNED` trade in the account → no suggestion, because the broker balance includes open-position MTM.
- An existing `PENDING_REVIEW` suggestion → no duplicate suggestion.
- Confirmed or rejected drift for the same day/balances → no repeated suggestion.
- The suggestion amount is `brokerClearBalance - setupMintCurrentBalance`.

### Review, confirm, reject

- `GET /api/v1/accounts/:id/pending-transactions`
- `POST /api/v1/accounts/:id/transactions/:txId/confirm`
- `POST /api/v1/accounts/:id/transactions/:txId/reject`

Confirming sets the transaction status to `CONFIRMED` and calls `AccountService.recalculateAccountBalances()`. Rejecting sets `REJECTED` and leaves balances unchanged.

`AccountService` remains the single source of truth:

```text
currentBalance =
  initialBalance
  + confirmed realized P&L
  + confirmed deposits
  - confirmed withdrawals
  + confirmed adjustments
```

Transactions with no `status` are treated as `CONFIRMED` for backwards compatibility.

---

## 5. Tradebook & Orderbook Sync

`POST /api/v1/integrations/fyers/sync` fetches the current-day FYERS `/tradebook` and `/orders` in parallel and normalizes executions into `INormalizedExecution`.

The sync engine:

1. Targets the account in `BrokerIntegration.linkedAccountId` when one is set, falling back to a FYERS account lookup or auto-created account.
2. Deduplicates fills by broker trade identifiers.
3. Groups raw executions into FIFO round-trip trades.
4. **Orderbook Initial Stop Loss Auto-Match:**
   - Fetches the FYERS current-day orderbook (`GET /orders`) and normalizes rows into `INormalizedOrderbookRow`.
   - Pure matching algorithm (`matchSLOrderFromOrderbook` in `@tradevault/financial-engine`):
     - Order type filter: SL-M (`type: 3`) or SL-L (`type: 4`).
     - Symbol match: canonical or clean symbol matches trade contract.
     - Opposite side check: `LONG` entry requires `SELL` stop order (`side: -1`); `SHORT` entry requires `BUY` stop order (`side: 1`).
     - Time window: Order timestamp falls within `[trade.entryTime - tolerance, trade.exitTime + tolerance]` (default tolerance: 60s).
     - Directional validity: Evaluates initial order placement on correct side of entry (`LONG` stop < entry; `SHORT` stop > entry).
     - Modifications & Trailing: Groups orders by `orderId` chronologically. Modifications of a valid initial order are retained even if trailed into profit (`TRAILED_FAVORABLY`), feeding stop-move detection.
     - Single candidate match (`HIGH` confidence): Auto-populates `risk.initialStopLoss`, sets `risk.initialStopSource = 'BROKER_ORDERBOOK'`, recalculates planned risk and `realizedRMultiple`, records `SL_AUTO_FILLED` audit log entry, and populates `stopLossMoveEvents`.
     - Ambiguous candidates (`AMBIGUOUS` confidence): Multiple candidate orders with conflicting stops are NOT auto-applied. The trade is flagged with `risk.slReviewReason = 'SL ambiguous - confirm'`, logged via `SL_MATCH_AMBIGUOUS` in audit log, and routed to the Review Queue (`SL_AMBIGUOUS`).
     - Preserves manual stops: Any pre-existing `risk.initialStopLoss` (e.g. manual entry or template) is strictly protected and never overwritten.
     - Fail-safe resilience: If the `/orders` call fails or the broker order service is unavailable, tradebook sync logs a warning and proceeds uninterrupted.
5. Preserves manually entered journal context when merging.
6. Calculates statutory charges through `@tradevault/financial-engine`.
7. Recalculates affected account balances after importing trades.
8. **Automated Post-Close Backfill Pipeline (`FyersService.backfillSingleClosedTrade`):**
   - For all closed trades retrieved during sync (newly closed, transitioned, or existing closed trades needing backfill), automatically executes:
     1. Stop-loss orderbook matching and move evaluation (`detectStopMovesForTrade`).
     2. Historical candle excursion computation for MAE, MFE, and exit efficiency (`computeExcursionForTrade`).
     3. 4H trend + 5M setup pattern recognition and strategy setup variant classification (`PatternRecognitionService.classifyTrade`).
     4. Permanent SVG multi-resolution chart snapshot attachments (`ChartGeneratorService.ensureTradeSnapshot`).

Live trade sync does not place, modify, or cancel orders.

### Stop Loss Backfill Tooling

- Endpoint: `POST /api/v1/integrations/fyers/sl-backfill` (supports `{ dryRun?: boolean, timeToleranceSeconds?: number }`).
- CLI Script: `npm run sl:backfill` (runs in dry-run mode by default; add `--yes` to apply changes). Current-day constraint applies because FYERS orderbook is reset daily at 06:30 IST rollover.

---

## 6. FYERS Ledger CSV Import

The broker PDF/CSV ledger can be imported without an API session.

- Preview: `POST /api/v1/export/import/preview?importKind=CASH_FLOWS&accountId=...`
- Commit: `POST /api/v1/export/import/commit`
- Undo: `POST /api/v1/export/import/undo`
- Batches: `GET /api/v1/export/import/batches`

Classification defaults:

| FYERS type | Meaning | Imported as |
| :--- | :--- | :--- |
| `BR` | Funds added | `DEPOSIT` |
| `BP` | Funds withdrawn | `WITHDRAWAL` |
| `JV` | Charges / journal adjustment | signed `ADJUSTMENT` |
| `SJ` | MTF / settlement journal | ignored for cash-flow totals by default |

Rules:

- Deposits and withdrawals must be positive.
- Adjustments may be negative.
- Rows with no usable date or amount are errors.
- Duplicate detection uses:

```text
sha256(accountId|FYERS_LEDGER|type|ISO date|amount|normalized description)
```

- Every commit receives a `ledger_*` batch ID and can be undone.
- Ledger imports are `BROKER_LEDGER_IMPORT` and `CONFIRMED` by default.
- Batch `totalAmount` is the net flow: deposits + adjustments - withdrawals.

Exact exported FYERS ledger headers can vary. The parser is alias-driven rather than tied to one export version.

---

## 7. Tradebook CSV Import

SetupMint supports historical tradebook CSVs from Zerodha, FYERS, Angel One, Upstox, and custom mappings.

Workflow:

1. Strip report preambles and detect the real header row.
2. Sanitize Indian number formats and Excel formula wrappers.
3. Auto-detect the broker or use a saved mapping.
4. Map CSV columns to SetupMint fields.
5. Group raw fills into FIFO round-trip trades.
6. Calculate statutory charges.
7. Commit with an import batch ID for one-click undo.

`BrokerImportMapping` is unique per `{ userId, broker, importKind }`, so tradebook and cash-ledger mappings are stored independently.

---

## 8. Security Controls

- AES-256-GCM encryption for broker secrets and tokens.
- Hashed, expiring, single-use OAuth state.
- No broker secrets in API responses or client bundles.
- Pino redaction for credentials, tokens, cookies, and auth headers.
- All account, snapshot, and transaction queries are scoped by `userId`.
- Production startup fails if `TOKEN_ENCRYPTION_KEY` is missing or weak.
- Broker API access is read-only.

---

## 9. Migration Notes

Run after backing up:

```bash
npm run accounts:backfill
npm run accounts:backfill -- --yes
```

The migration:

- Drops the legacy unique `BrokerImportMapping` index.
- Adds `importKind: 'TRADES'` to legacy mappings.
- Adds `source: 'MANUAL'` and `status: 'CONFIRMED'` to legacy transactions.
- Encrypts legacy plaintext FYERS secrets and tokens.
- Recalculates all account balances from confirmed records.

---

## 10. Angel One SmartAPI (Market-Data-Only Fallback Candle Source)

### Architectural Scope & Guarantees
Angel One SmartAPI is integrated strictly as a **read-only historical candlestick market data fallback source** for MAE/MFE excursion analytics and automated chart screenshot generation.
- **Strictly Market-Data Only:** Never used for broker linking, tradebook sync, order execution, order cancellation, positions, funds, holdings, profile fetching, or WebSocket feeds.
- **Strict Tenant Isolation:** All market data records, stored credentials, session tokens, and instrument caches are scoped strictly by `userId`. Cross-tenant queries return 401/404.
- **Fallback Chain Wiring:**
  ```text
  Cached Snapshot -> FYERS History -> Angel One SmartAPI -> Underlying Asset Fallback -> UNAVAILABLE
  ```
  If FYERS returns valid candles, Angel One is never called (short-circuit proven with test).

### Pure Logic & Normalization
1. **IST to UTC Explicit Conversion:** SmartAPI timestamps (`YYYY-MM-DD HH:mm`) are in Indian Standard Time (IST, UTC+05:30, no DST). All timestamps are converted to UTC Unix epoch seconds via `moment`.
2. **Numeric Validity & Drop Counts:** Every candle must satisfy `h >= max(o,c)`, `l <= min(o,c)`, and non-negative volume. Violations are dropped and tracked in `droppedRowsCount`.
3. **Timestamp Deduplication:** Unique, monotonically ascending timestamps are enforced; duplicate timestamps keep the first valid row.
4. **Range Caps & Lookback Rules:**
   - `ONE_MINUTE`: 30-day max provider lookback, chunked into 15-day range caps.
   - `FIVE_MINUTE`: 90-day max provider lookback, chunked into 60-day range caps.
   - `ONE_DAY`: 365-day max provider lookback, chunked into 365-day range caps.
   - Max 8,000 candles per API request.

### Resilience & Concurrency
- **Circuit Breaker:** In-memory per-user circuit breaker opens after 3 consecutive upstream failures, triggering a 60-second cooldown before a half-open probe.
- **Throttling Queue:** Single per-user queue enforcing a minimum 340ms spacing (~3 req/sec), preventing 429 rate limit errors.
- **Atomic MongoDB Daily Budget:** Daily request quotas (default 500) are consumed using atomic MongoDB `findOneAndUpdate` conditional updates matching `dailyCallDate: today` and `$inc: { dailyCallCount: 1 }`, guaranteeing zero race conditions across concurrent processes.

### Operational Runbook

#### 1. How to Connect
1. Navigate to **Settings → Angel One SmartAPI (Market Data Fallback Only)**.
2. Enter your **SmartAPI Key**, **Client Code**, and **4-digit PIN**. Click **Save Credentials**. Credentials are encrypted at rest with AES-256-GCM.
3. Click **Connect Session**.
4. In the dialog, enter a fresh **6-digit TOTP** from your authenticator app (e.g. Google Authenticator) and click **Verify & Connect**.
5. Once authenticated, the chip updates to **Connected** with token expiration set to 06:00 AM IST the next day.

#### 2. What a Failed Login Means
- **`Invalid TOTP format` (HTTP 400):** Must be exactly 6 numeric digits (`inputMode="numeric"`).
- **`Invalid credentials` (HTTP 400):** Incorrect Client Code, PIN, or API Key. Check credentials in Angel One SmartAPI developer portal.
- **`Token expired or invalid TOTP`:** The TOTP token expired or the system clock on your device is skewed. Ensure clock synchronization and generate a new code.
- **`Upstream Error / Network Timeout`:** Angel One API gateway outage or rate limiting. Check system logs for sanitized correlation details.

#### 3. How Daily Budgets Reset
- The daily call budget resets automatically at **00:00 IST (Indian Standard Time)**.
- Resetting requires zero scheduled cron jobs; the MongoDB atomic conditional operator detects when `dailyCallDate !== today` and atomically initializes `dailyCallCount = 1` for the new day.

#### 4. How to Clear / Refresh Instrument Cache
- Click the **Refresh Instrument Master** button on the Settings card.
- This streams and parses the public `OpenAPIScripMaster.json`, filters relevant NSE, BSE, NFO, and MCX scrips, and bulk-upserts them using an ordered `bulkWrite(..., { ordered: false })` into the indexed `angeloneinstruments` collection in under 2 seconds.
- To purge cached instruments entirely, click **Delete Configuration & Cache**.

#### 5. How to Diagnose `UNAVAILABLE` Reasons
When a trade's excursion badge displays `UNAVAILABLE`, hover or inspect `failureReason`:
- **`NO_SYMBOL_TOKEN`:** The tradingsymbol could not be mapped to an Angel One token. Refresh the instrument master.
- **`OUTSIDE_PROVIDER_LOOKBACK`:** The trade was closed beyond SmartAPI's lookback limits (e.g. 1m candles older than 30 days).
- **`DAILY_BUDGET_EXHAUSTED`:** You have reached your configured daily call quota (`ANGEL_ONE_DAILY_BUDGET`). Quota resets at midnight IST.
- **`NOT_CONNECTED` / `TOKEN_EXPIRED`:** The daily SmartAPI JWT token has expired (06:00 AM IST daily). Enter a fresh TOTP in Settings.
- **`CIRCUIT_OPEN`:** Angel One encountered 3 consecutive upstream failures; circuit breaker is resting for 60 seconds.
- **`EMPTY_RESULT`:** SmartAPI returned no candle bars for the requested symbol and time window (e.g. illiquid strike or holiday).

---

## 11. FYERS Live Order Execution & Safety Protocols

SetupMint supports discretionary live trade management through authenticated FYERS broker sessions:
1. **Live Trailing Stop Loss Placement & Modification (`executeBrokerStopLoss`):**
   - Automatically inspects the broker orderbook (`GET /orders`) for pending SL orders.
   - Modifies existing SL orders or places new SL-M / SL-L orders with sanitized alphanumeric order tags.
   - Preserves entry risk baseline `initialStopLoss` while updating `currentStopLoss`.
2. **Partial (50%) & Full Market Exits (`executeBrokerExit`):**
   - Emits market orders (`type: 2`) with inverse direction side.
   - Automatically scans and cancels pending open SL orders on full closure to prevent orphaned resting orders.
3. **Multi-Target Scaling Ladder Execution:**
   - Atomically executes partial scale-outs while trailing stops along pre-calculated R-multiples (+1.0R BE lock, +2.0R trail, etc.).
4. **Network & Schema Protections:**
   - Forces IPv4 DNS lookups (`family: 4`) to eliminate dual-stack IPv6 latency.
   - Cleans all order tags to alphanumeric-only (`[a-zA-Z0-9]`) complying with FYERS API v3 schema rules.

