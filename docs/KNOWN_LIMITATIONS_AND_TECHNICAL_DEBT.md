# SetupMint — Known Limitations & Technical Debt

This document records confirmed limitations, incomplete features, architectural boundaries, and identified technical debt in **SetupMint**.

---

## 1. Confirmed Architectural Boundaries & Scope

### 1. Live Automated Broker Polling is Disabled by Design
- **Current Behavior:** The FYERS integration is architecturally modeled with `IBrokerAdapter`, `INormalizedExecution`, and database tracking, but live OAuth automated sync is intentionally disabled in release 1.0.
- **Rationale:** To protect trader privacy, eliminate external cloud dependencies, and avoid dealing with mandatory daily 24-hour token invalidation mandated by Indian market regulations.
- **Status:** Broker executions can currently be imported via the high-fidelity CSV Import engine (`/reports`). Automated live polling is planned for future releases.

### 2. Multi-Currency Live Feed Omission
- **Current Behavior:** The currency conversion engine ([`currency.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/currency.ts)) enforces that cross-currency conversions (e.g. USD to INR) fail cleanly (`isAvailable: false`) unless an explicit exchange rate is passed.
- **Limitation:** There is no automatic live Forex rate feeder daemon polling central bank exchange rates.
- **Mitigation:** Most retail traders in the target audience trade within their domestic currency (`INR`). When logging Forex/Crypto trades, users operate in native account currencies.

### 3. Local Storage vs. Cloud Storage (Cloudinary)
- **Current Behavior:** Chart screenshots are stored exclusively on local disk (`./data/uploads`).
- **Limitation:** There is no built-in sync to commercial cloud image hosts (e.g. Cloudinary or AWS S3).
- **Mitigation:** Single-command local backup (`npm run db:backup`) bundles all image files alongside the database.

### 4. No Real-Time WebSocket Order Feed
- **Current Behavior:** The frontend synchronizes state via TanStack Query refetching and mutation invalidation.
- **Limitation:** There is no WebSocket/SSE connection broadcasting live order executions. For a post-trade journal and analytics platform, REST request-response is sufficient, but live tick updates are out of scope.

---

## 2. Verified Technical Debt & Codebase Opportunities

| Item | Location | Description | Priority |
| :--- | :--- | :--- | :--- |
| **Legacy Namespace References** | Monorepo package naming (`@tradevault/*`) | Packages are named `@tradevault/api`, `@tradevault/web`, `@tradevault/financial-engine`, and `@tradevault/shared` while user-facing branding is **SetupMint Pro**. Maintain alias `StratumLogo` -> `SetupMintLogo`. | Low |
| **E2E Automated Browser Tests** | `apps/web` | The application has 101 passing Vitest tests covering API and mathematical calculations, but lacks headless Playwright/Cypress end-to-end browser test suites. | Medium |
| **Mobile Drawer Gesture Polish** | `AppLayout.tsx` | Mobile navigation uses an off-canvas drawer; edge swipe gesture support on iOS Safari could be improved. | Low |
| **Database Lock Recovery Automation** | `connection.ts` | If an abrupt system crash leaves `mongod.lock` with non-zero bytes, manual removal of the lock file may be required. | Low |

---

## 3. Suspected Areas for Future Investigation

1. **Large Dataset Pagination on Calendar:** The monthly calendar aggregates all trades for the active month in a single query. For high-frequency traders with $>5,000$ trades in a single month, indexing and query projection optimization should be verified.
2. **Multi-Leg Strategy Complex P&L:** Option Greeks (Delta, Gamma, Theta, Vega) are currently logged as discretionary notes rather than real-time Black-Scholes pricing models.
