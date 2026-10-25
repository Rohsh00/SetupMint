# SetupMint — Known Limitations & Technical Debt

This document records confirmed limitations, incomplete features, architectural boundaries, and identified technical debt in **SetupMint**.

---

## 1. Confirmed Architectural Boundaries & Scope

### 1. FYERS Integration Boundaries
- **Current Behavior:** FYERS API v3 OAuth, tradebook sync, funds sync, and balance reconciliation are implemented and require an active broker session. CSV tradebook and cash-ledger imports remain available without a session.
- **Limitation:** FYERS access tokens expire daily at 06:30 IST. Refresh-token exchange is not enabled; users must re-authenticate daily for live API access. No orders are ever placed, modified, or cancelled.
- **Reconciliation Safety:** Broker balances create `PENDING_REVIEW` adjustments only. Suggestions are paused while trades are `OPEN` or `PLANNED`, and a trader must explicitly confirm or reject each adjustment.
- **CSV Limitation:** Exact FYERS ledger export headers vary by account/export version; the alias-driven parser may need a new header alias for an unseen export format.

### 2. Multi-Currency Live Feed Omission
- **Current Behavior:** The currency conversion engine ([`currency.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/currency.ts)) enforces that cross-currency conversions (e.g. USD to INR) fail cleanly (`isAvailable: false`) unless an explicit exchange rate is passed.
- **Limitation:** There is no automatic live Forex rate feeder daemon polling central bank exchange rates.
- **Mitigation:** Most retail traders in the target audience trade within their domestic currency (`INR`). When logging Forex/Crypto trades, users operate in native account currencies.

### 3. Cloud-Only Storage & Internet Dependency
- **Current Behavior:** SetupMint requires an active internet connection to communicate with your dedicated MongoDB Atlas cluster and Cloudflare R2 bucket.
- **Limitation:** The application does not function offline without internet access. Local disk storage and embedded databases have been permanently removed.
- **Mitigation:** Zero egress fees on Cloudflare R2 and high availability across MongoDB Atlas regions ensure high uptime and performance.

### 4. No Real-Time WebSocket Order Feed
- **Current Behavior:** The frontend synchronizes state via TanStack Query refetching and mutation invalidation.
- **Limitation:** There is no WebSocket/SSE connection broadcasting live order executions. For a post-trade journal and analytics platform, REST request-response is sufficient, but live tick updates are out of scope.

### 5. What-If Candle-Replay Simulation Boundaries
- **Single-Fill Requirement:** Only trades with `SIMPLE` execution mode or `ADVANCED` mode with exactly 1 entry fill and 1 exit fill (1E1X) are eligible. Scaled entries or partial scaling exits are excluded (`EXCLUDED_MULTI_FILL`) because simulated stops/targets assume a single position lot.
- **500-Trade Scope Limit:** To maintain snappy interactive response times and prevent Node.js memory exhaustion across 49 simultaneous parameter evaluations with 10,000 bootstrap resamples, simulation scopes exceeding 500 trades return `SCOPE_TOO_LARGE`, prompting the user to narrow date or filter ranges.
- **Right-Censoring Boundary:** When a real trade exited at its original stop loss or planned target, the post-exit price trajectory is unobserved in the trade lifecycle. Simulating a looser stop or farther target cannot guess what price would have done without lookahead bias; such trades are marked `status: 'CENSORED'` and omitted from evaluable statistics for that cell.
- **250-Chunking Batch Loading:** Candle snapshots are batch-queried in 250-trade slices to avoid MongoDB cursor buffer limits and large payload overhead.

---

## 2. Verified Technical Debt & Codebase Opportunities

| Item | Location | Description | Priority |
| :--- | :--- | :--- | :--- |
| **Legacy Namespace References** | Monorepo package naming (`@tradevault/*`) | Packages are named `@tradevault/api`, `@tradevault/web`, `@tradevault/financial-engine`, and `@tradevault/shared` while user-facing branding is **SetupMint Pro**. Maintain alias `StratumLogo` -> `SetupMintLogo`. | Low |
| **E2E Automated Browser Tests** | `apps/web` | The application has 319 passing Vitest tests covering API and mathematical calculations, but lacks headless Playwright/Cypress end-to-end browser test suites. | Medium |
| **Mobile Drawer Gesture Polish** | `AppLayout.tsx` | Mobile navigation uses an off-canvas drawer; edge swipe gesture support on iOS Safari could be improved. | Low |
| **Atlas Free Tier Backup Discipline** | `scripts/backup.js` | MongoDB Atlas M0 free tier lacks automated snapshot backups. Users must run `npm run db:backup` regularly. | Medium |

---

## 3. Suspected Areas for Future Investigation

1. **Large Dataset Pagination on Calendar:** The monthly calendar aggregates all trades for the active month in a single query. For high-frequency traders with $>5,000$ trades in a single month, indexing and query projection optimization should be verified.
2. **Multi-Leg Strategy Complex P&L:** Option Greeks (Delta, Gamma, Theta, Vega) are currently logged as discretionary notes rather than real-time Black-Scholes pricing models.
