# SetupMint — Broker Integrations & FYERS

This document describes the FYERS API v3 integration, broker funds reconciliation, and the broker CSV import pipeline.

---

## 1. Architecture & Privacy Principles

SetupMint remains local-first:

1. Broker credentials and tokens are stored server-side only and encrypted at rest.
2. Tokens are never sent to the browser, embedded in trades, logged, or returned by API routes.
3. Broker data never directly overwrites authoritative journal balances.
4. Broker balances create a `PENDING_REVIEW` adjustment that the trader must confirm or reject.

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

## 5. Tradebook Sync

`POST /api/v1/integrations/fyers/sync` fetches the current-day FYERS `/tradebook` and normalizes executions into `INormalizedExecution`.

The sync engine:

1. Targets the account in `BrokerIntegration.linkedAccountId` when one is set, falling back to a FYERS account lookup or auto-created account.
2. Deduplicates fills by broker trade identifiers.
3. Groups raw executions into FIFO round-trip trades.
4. Preserves manually entered journal context when merging.
5. Calculates statutory charges through `@tradevault/financial-engine`.
6. Recalculates affected account balances after importing trades.

Live trade sync does not place, modify, or cancel orders.

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
