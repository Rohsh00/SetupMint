# SetupMint — Testing & Quality Assurance Specification

This document details the test framework, test suite organization, assertion coverage, and regression scenarios in **SetupMint**.

---

## 1. Testing Framework & Tooling

SetupMint uses **Vitest v3** (`vitest 3.0.6`) across the monorepo:
- **Test Framework:** Vitest native TypeScript test runner.
- **API Injection Testing:** Fastify native `app.inject()` testing enabling rapid in-process HTTP integration tests without network port collisions.
- **Database Isolation:** Vitest spins up dedicated, ephemeral in-memory MongoDB instances (`mongodb-memory-server` with `tradevault-test`), guaranteeing complete test isolation without polluting development databases.

---

## 2. Test Suite Inventory (196 Passing Tests)

The repository contains **196 fully automated tests** spanning mathematical calculations, regulatory fee structures, session derivations, mistake detection rules, discipline scoring, market setup template resolution, dynamic ranking, NSE 2026 holiday/expiry shifts, REST endpoints, quick close mutations, smart CSV imports with FIFO grouping, review queues, batch undo, cloud file uploads, server-side lossless image optimization, seed generation, and regression scenarios.

### A. Financial Engine Unit Tests (70 Tests)
Located in [`packages/financial-engine/test/`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/test/):

| Test File | Tests | Critical Assertions Covered |
| :--- | :--- | :--- |
| `pnl.test.ts` | 7 tests | Long gross P&L, Short gross P&L, fee deduction, open trade outcome, negative quantity error handling, contract multipliers. |
| `fifo.test.ts` | 5 tests | Sequential lot dequeuing, partial exits, multi-fill weighted average price, excess exit quantity exception handling. |
| `risk.test.ts` | 5 tests | Position size formula, lot rounding down to lot size step, stop distance validation, planned R:R, realized R-multiple. |
| `metrics.test.ts` | 2 tests | Comprehensive dashboard metrics: win rate, profit factor (including zero-loss 999.99 handling), peak-to-trough drawdowns, consecutive win/loss streaks. |
| `currency.test.ts` | 3 tests | Identical currency pass-through, explicit conversion rates, rejection of silent 1:1 conversions when rate is missing. |
| `charges.test.ts` | 6 tests | Indian statutory charges across segments (NSE_EQ, NSE_FNO futures, NSE_FNO options, MCX commodities), flat brokerage (₹20/leg, ₹0 Finvasia, custom), STT/CTT, SEBI, GST, stamp duty. |
| `session.test.ts` | 5 tests | Automatic session derivation: NSE market hours (09:15-15:30 IST), MCX evening session, foreign exchanges (New York / London), weekends & Crypto off-hours. |
| `mistakes.test.ts` | 7 tests | Pure Decimal.js detection for revenge trading (time window + loss + position size), overtrading daily threshold & concurrent open positions, position sizing violations against equity, daily loss breach evaluation, daily session summary prefill, and rule-based discipline rating (1 to 5). |
| `templates.test.ts` | 30 tests | Pure Decimal.js rule resolution (PERCENT, POINTS, PREMIUM_PERCENT, MANUAL), target calculation from minRR, instrument tick size rounding, dynamic ranking by market/session/expiry, NSE 2026 Tuesday holiday shifts to Monday (Dussehra 2026-10-20 to 2026-10-19, Guru Nanak Jayanti 2026-11-24 to 2026-11-23), Nifty-only weekly vs Bank Nifty/FinNifty/stock monthly expiry constraints. |

### B. Backend API & Integration Tests (126 Tests)
Located in [`apps/api/test/`](file:///Users/komal/projects/Trading%20Vault/apps/api/test/):

| Test File | Tests | Critical Assertions Covered |
| :--- | :--- | :--- |
| `api.test.ts` | 27 tests | Registration, login, duplicate email rejection, session cookie issuance, account CRUD, trade creation with live P&L, Quick Close partial execution with CLOSED audit log, broker column mapping persistence, broker format auto-detection (Zerodha), FIFO raw execution grouping with statutory charges, duplicate trade prevention, batch undo with account balance reconciliation, profile risk settings retrieval & update (`GET`/`PUT /api/v1/settings/profile`), review queue endpoint (`GET /api/v1/review/queue`), trade mistake suggestions (`GET /api/v1/review/suggest-mistakes/:tradeId`), and journal reflection prefill endpoint (`GET /api/v1/review/prefill/:date`). |
| `optimize-image.test.ts` | 7 tests | Pixel-identical raw RGBA decoding proof of losslessness, Display P3 / sRGB ICC profile retention, 10% savings threshold enforcement, fail-safe corrupted buffer pass-through, JPEG to WebP transcoding, WebP lossless repack, SVG pass-through. |
| `attachment.test.ts` | 13 tests | Multipart upload, binary magic-bytes signature verification (PNG/JPEG/WebP), rejection of disguised binary files, server-side lossless optimization, matching stored WebP/PNG extension and stream Content-Type, 12-image cap enforcement, authenticated streaming, cloud storage cleanup upon deletion. |
| `template.test.ts` | 12 tests | Authentication enforcement, 20 built-in templates listing with stats, custom template creation & uniqueness, update, built-in protection (`BUILT_IN_READ_ONLY`), strict tenant isolation between users, trade linking to `templateId`, trade query filtering by `templateId`, favorite toggling, usage incrementation. |
| `seed-engine.test.ts` | 8 tests | Deterministic seeding via Mulberry32 PRNG, idempotency verification (reseeding cleanly replaces previous demo data), account balance consistency, seed validation engine. |
| `connection.test.ts` | 8 tests | Cloud-only Atlas URI validation, masking credentials in logs, rejection of local/memory addresses, fail-fast behavior. |
| `storage.test.ts` | 13 tests | Cloudflare R2 bucket connection, signed uploads, streaming download, key formatting, object deletion. |
| `regression.test.ts` | 38 tests | Exhaustive QA test matrix covering boundary scenarios: breakeven outcomes, soft delete account archival, bulk tagging, bulk deletion with multi-account reconciliation, CSV import duplicate prevention. |

---

## 3. Running Test Commands

```bash
# 1. Run all test suites across the monorepo (196 tests)
npm run test

# 2. Run only financial engine mathematical unit tests (70 tests)
npm run test:engine

# 3. Run only backend API, attachment, and regression tests (126 tests)
npm run test:api

# 4. Run tests with live watch mode (in package directory)
npm run test:watch -w packages/financial-engine
```

---

## 4. Key Verified Regression Scenarios

1. **Floating-Point Arithmetic Stability:** Verifies that fractional fee breakdowns and fractional lot sizes do not accumulate binary floating-point round-off errors.
2. **Authoritative Ledger Reconciliation:** Asserts that deleting a trade immediately decrements the account's cumulative realized P&L and updates the account balance without drift.
3. **Data Loss Prevention on Account Deletion:** Asserts that calling `DELETE /api/v1/accounts/:id` on an account with associated trades sets `status: 'ARCHIVED'` rather than cascading deletion.
4. **Magic-Bytes Security Guard:** Verifies that an arbitrary text file renamed to `.png` is rejected with `400 INVALID_IMAGE_SIGNATURE`.
5. **CSV Import Idempotency:** Asserts that re-importing the same broker CSV skips already imported executions rather than double-counting P&L.
6. **Demo Mode Isolation:** Asserts that running `npm run seed:reset` deletes only demo user records (`trader@tradevault.local`) and leaves real user accounts untouched.

---

## 5. Coverage Gaps & Recommended QA Enhancements

1. **End-to-End (E2E) Browser Testing:** Currently, frontend components are tested via manual testing and backend integration tests. Implementing Playwright or Cypress E2E flows is recommended for automated browser regression testing.
2. **Visual Regression Testing:** Adding screenshot comparison tests for the Recharts equity curve and dark/light mode renders.
3. **High-Concurrency Stress Testing:** Load testing Fastify's rate limiter under 10,000 req/sec conditions using `autocannon`.
