# SetupMint — FYERS API v3 Integration

SetupMint supports optional, read-only FYERS API v3 synchronization plus FYERS ledger CSV import. Broker access is never required for the core journal, and live trading is never performed.

For the full configuration, reconciliation, and security model, see [`BROKER_INTEGRATIONS.md`](BROKER_INTEGRATIONS.md).

---

## 1. Supported FYERS APIs

| API | Purpose |
| :--- | :--- |
| `GET /generate-authcode` | Daily OAuth consent |
| `POST /validate-authcode` | Exchange `auth_code` for access/refresh tokens |
| `GET /tradebook` | Fetch current-day executions for FIFO import |
| `GET /orders` | Fetch current-day orderbook for automatic initial Stop Loss matching |
| `GET /funds` | Fetch fund limits for balance reconciliation |
| `GET /data/history` | Fetch historical 1m & 5m candlestick data for excursion analytics |

The base URL is configured with `FYERS_API_BASE` and defaults to `https://api-t1.fyers.in/api/v3`. Data history calls use `https://api-t1.fyers.in/data`.

---

## 2. Authentication

1. The trader saves the FYERS App ID and Secret Key in Settings.
2. The secret is encrypted with AES-256-GCM before storage.
3. SetupMint creates a random OAuth `state` and stores only its SHA-256 hash plus a 10-minute expiry.
4. FYERS redirects back with `auth_code` and `state`.
5. The backend exchanges the code with `/validate-authcode`.
6. The access token is encrypted and stored with its expiry.
7. The token is never returned to the browser or embedded in trade records.

FYERS access tokens expire daily at **06:30 IST**. SetupMint stores the next expiry and prompts for re-authentication after it passes. Refresh tokens are stored encrypted, but refresh-token exchange is not enabled; daily OAuth remains the supported path.

---

## 3. Tradebook & Orderbook Sync

`POST /api/v1/integrations/fyers/sync` fetches `/tradebook` and `/orders` in parallel and maps executions into `INormalizedExecution`.

The pipeline:

1. Verifies the encrypted access token and session freshness.
2. Normalizes FYERS symbols, exchanges, segments, and execution timestamps.
3. Deduplicates by broker trade/order identifiers.
4. Groups fills into FIFO round-trip trades.
5. **Initial Stop Loss Order Matching:**
   - Fetches current-day orderbook rows from FYERS `/orders` (cleared daily at 06:30 IST rollover).
   - Filters candidate orders: `type: 3` (SL-M) or `type: 4` (SL-L), matching symbol, opposite side (`LONG` -> `SELL`, `SHORT` -> `BUY`), order timestamp in execution window `[entry - tolerance, exit + tolerance]`.
   - Validates initial directional placement (`LONG` stop < entry; `SHORT` stop > entry).
   - Preserves subsequent modification rows of the matched order (even when trailed above entry into profit for a LONG trade) to feed `detectStopMoves`.
   - When exactly one matching SL order group is resolved:
     - Sets `risk.initialStopLoss` to the initial stop price.
     - Sets `risk.initialStopSource = 'BROKER_ORDERBOOK'`.
     - Recalculates planned monetary risk and `realizedRMultiple`.
     - Records `SL_AUTO_FILLED` audit log entry.
     - Detects and records any stop-loss trailing move events (`stopLossMoveEvents`).
   - When multiple conflicting candidate SL orders exist (`AMBIGUOUS`):
     - Does NOT auto-apply stop loss to avoid incorrect assumptions.
     - Sets `risk.slReviewReason = 'SL ambiguous - confirm'` and records candidates in `risk.slReviewCandidates`.
     - Records `SL_MATCH_AMBIGUOUS` audit log entry.
     - Surfaces trade in Daily Review Queue under `SL_AMBIGUOUS`.
   - Never overwrites manually defined initial stop losses (`initialStopSource === 'MANUAL'`).
   - If `/orders` fails, logs warning and proceeds with tradebook sync uninterrupted.
6. Preserves existing journal notes, emotions, and attachments when merging.
7. Calculates statutory charges.
8. Recalculates account balances.

### Stop Loss Backfill Tooling
- API Route: `POST /api/v1/integrations/fyers/sl-backfill` (supports `{ dryRun?: boolean, timeToleranceSeconds?: number }`).
- CLI Script: `npm run sl:backfill` (runs in dry-run mode by default; add `--yes` to apply changes). Note: FYERS orderbook is current-day only.

---

## 4. Funds Sync

Funds sync is account-specific:

1. Link a FYERS trading account to the connected FYERS client.
2. Call `POST /api/v1/accounts/:id/sync-funds`.
3. SetupMint stores a `BrokerFundsSnapshot`.
4. If the broker `Clear Balance` differs from the authoritative SetupMint balance beyond tolerance, a `PENDING_REVIEW` adjustment is created.

Open or planned trades pause reconciliation suggestions. Broker balances never directly overwrite the journal ledger.

See [`BROKER_INTEGRATIONS.md`](BROKER_INTEGRATIONS.md#4-funds-sync--reconciliation) for the complete drift rules and confirm/reject workflow.

---

## 5. Ledger CSV Import

The FYERS funds ledger can be imported from `/reports` without an active API session.

Default classification:

| FYERS type | Imported as |
| :--- | :--- |
| `BR` | `DEPOSIT` |
| `BP` | `WITHDRAWAL` |
| `JV` | signed `ADJUSTMENT` |
| `SJ` | ignored by default |

Imports are idempotent, batched, and reversible. Deposits/withdrawals must be positive; adjustments may be negative.

---

## 6. Excursion Analytics Sync

SetupMint queries FYERS historical market data to calculate Maximum Favorable Excursion (MFE), Maximum Adverse Excursion (MAE), Exit Efficiency, and stop-loss reversal evidence.

1. **Symbol Formatting:** `formatFyersSymbol` maps internal trade contracts into FYERS v3 symbol formats:
   - Equities: `NSE:SBIN-EQ`, `BSE:RELIANCE-A`
   - Weekly Options: `{EX}:{UNDERLYING}{YY}{M}{DD}{STRIKE}{OPT}` where month `M` is 1-9 for Jan-Sep and O, N, D for Oct, Nov, Dec.
   - Monthly Options: `{EX}:{UNDERLYING}{YY}{MMM}{STRIKE}{OPT}`
   - Futures: `{EX}:{UNDERLYING}{YY}{MMM}FUT`
2. **Adaptive Resolution & Multi-Timeframe Grouping:**
   - Trades with duration $\le 4\text{ hours}$ default to 1-minute candles (`resolution: '1'`); longer trades default to 5-minute candles (`resolution: '5'`).
   - For chart generation, timeframes are grouped by base resolution (`'1'` -> 1m; `'5'`, `'15'`, `'30'`, `'60'` -> 5m; `'D'` -> Daily). Intermediate timeframes are derived via pure `aggregateCandles` anchored to IST session opens (`09:15` NSE / `09:00` MCX).
3. **Fetch Range Estimation & Snapshot Caching:**
   - Pre-entry and post-exit padding ranges are calculated with trading calendar buffers via `estimateFetchRange`.
   - Base fetches use the union range of all requested target timeframes sharing that base.
   - Candlestick responses are stored in `TradeCandleSnapshot` (`{ userId, tradeId, resolution }`) with `coverageFrom` and `coverageTo` timestamps. A cached snapshot is reused only if it covers the entire required range; otherwise, the wider range is re-fetched and merged. Legacy snapshots without explicit coverage dates are backfilled from their first to last candle timestamps.
4. **Excursion Calculation Invariance:** Excursion metrics (MAE, MFE, Exit Efficiency) always filter strictly to the trade entry-to-exit overlap on the finest available candles. Widening cached candle snapshots for chart padding never alters stored excursion metrics or P&L.
5. **Rate Limiting & Backoff:** Historical candle fetchers enforce strict broker pacing (220ms delay per request for FYERS, 340ms for Angel One) with exponential backoff on HTTP 429.
6. **Auto-Triggering:** FYERS sync automatically computes excursion metrics for newly closed trades synced during the session.

---

## 7. Operational Notes

- Run `npm run accounts:backfill` before enabling the new ledger/broker fields on an existing database.
- Run `npm run excursion:backfill` (or `--live`) to compute excursion metrics across closed trades.
- `FYERS_FUNDS_DRIFT_TOLERANCE` defaults to ₹1.
- `FYERS_FUNDS_SYNC_ENABLED=false` disables funds sync without removing credentials.
- Never place broker secrets in frontend code, CSV files, screenshots, or committed `.env` files.
