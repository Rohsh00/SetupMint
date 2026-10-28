# SetupMint — Testing & Quality Assurance Specification

This document details the test framework, test suite organization, assertion coverage, and regression scenarios in **SetupMint**.

---

## 1. Testing Framework & Tooling

SetupMint uses **Vitest v3** (`vitest 3.0.6`) across the monorepo:
- **Test Framework:** Vitest native TypeScript test runner.
- **API Injection Testing:** Fastify native `app.inject()` testing enabling rapid in-process HTTP integration tests without network port collisions.
- **Database Isolation:** Vitest spins up an ephemeral in-memory MongoDB replica set (`mongodb-memory-server`), initializes model indexes, and connects through `MONGODB_URI` before tests run. This supports transactions without ever touching the configured Atlas database.

---

## 2. Test Suite Inventory (668 Passing Tests)

The repository contains **668 fully automated tests** spanning scheduled encrypted off-site backups, retention rotation, anomaly detection, BSON EJSON round-tripping, custom date range filters & Indian FY presets, weekly reviews and focus rule synthesis, parent strategy / child setup variant analytics, mathematical calculations, regulatory fee structures, session derivations, excursion analytics (MAE/MFE/Exit Efficiency), multi-panel equity curves, underwater drawdown recovery durations, cumulative R-multiples, deterministic Monte Carlo expectancy cones, risk and tilt event markers, universal drilldown resolvers, aggregate reconciliation, mistake detection rules, discipline scoring, market setup template resolution, dynamic ranking, multi-timeframe candle execution charts, permanent auto-chart snapshots, staleness tracking, NSE 2026 holiday/expiry shifts, REST endpoints, quick close mutations, smart CSV imports with FIFO grouping, review queues, batch undo, cloud file uploads, server-side lossless image optimization, persistent sliding sessions, SHA-256 token hashing, device management, seed generation, and regression scenarios.

### A. Financial Engine Unit Tests (319 Tests)
Located in [`packages/financial-engine/test/`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/test/):

| Test File | Tests | Critical Assertions Covered |
| :--- | :--- | :--- |
| `weekly-review.test.ts` | 17 tests | Deterministic snapshot generation, reconciliation with `computeTradeAggregates`, empty week zeroing, profit factor 999.99 on zero loss, top mistake ranking by quantified loss, setup ranking via Empirical-Bayes shrunk expectancy ($k=10$), sample size warnings ($n < 30$), rule-based focus suggestion priority order, focus rule evaluation (`followed: true/false/null`), R-multiple coverage with missing stops, and zero floating-point drift on fractional fees. |
| `date-range.test.ts` | 28 tests | Preset resolution (`TODAY`, `YESTERDAY`, `7D`, `30D`, `90D`, `THIS_WEEK`, `LAST_WEEK`, `THIS_MONTH`, `LAST_MONTH`, `THIS_QUARTER`, `YTD`, `THIS_FY`, `LAST_FY`, `ALL_TIME`), ISO-8601 week conversion (`isoWeekToRange`, `dateToIsoWeek`, `getAdjacentIsoWeek`), year boundary handling (2026-W53 to 2027-W01), leap year February 29 handling, inclusive IST (+05:30) date boundaries, invalid date rejection, and Zod range validations. |
| `drawdown.test.ts` | 14 tests | Underwater series generation, high-water mark tracking, peak-to-trough max drawdown, current drawdown, longest recovery duration in calendar days and trade count, ongoing drawdown edge cases, and 30-digit Decimal.js precision. |
| `cumulative-r.test.ts` | 11 tests | Sequential cumulative R series calculation, exclusion of trades with undefined/invalid initial risk budgets matching `edge.ts`, R-multiple sample coverage percentage, per-strategy cumulative-R overlays (up to 6), and sample size warning threshold (< 30 trades). |
| `monte-carlo.test.ts` | 12 tests | Bootstrap resampling with replacement, deterministic Mulberry32 PRNG reproducibility, edge qualification gating ($N \ge 30$, verdict $\neq$ `NO_EDGE`/`INSUFFICIENT_DATA`), and per-step percentile envelope extraction (P5, P25, P50, P75, P95) across 50, 100, and 200 trade steps. |
| `events.test.ts` | 10 tests | Detection of daily loss limit breaches, grouping trades by calendar day, calculation of net daily loss vs configured budget, and detection of high-tilt days ($\ge 61$) with trade clustering. |
| `reconciliation.test.ts` | 8 tests | Authoritative trade aggregate calculation (`sumNetPnL`, `avgNetPnL`, `sumRealizedR`, `avgRealizedR`, win/loss/breakeven counts, `winRatePercent`) using 30-digit Decimal arithmetic, empty trade sets, all-win/all-loss distributions, and zero floating-point drift. |
| `snapshot-resolver.test.ts` | 13 tests | Underlying symbol normalization (`normalizeUnderlying`) stripping broker prefixes, cash equity suffixes (`-EQ`, `.NS`, `.BO`), and derivatives (`CE`/`PE`/`FUT`); timeframe normalization (`normalizeChartResolution`) with unsupported warning mappings; multi-timeframe snapshot resolution (`resolveSnapshotTimeframes`) prioritizing LTF, matching instrument overrides case-insensitively, defaulting to user settings, deduplicating HTF==LTF, and adaptive duration fallback; R-multiple target ladders (`calculateRLadderLevels`) with pure Decimal.js precision and inverted risk validation. |
| `chart-helpers.test.ts` | 15 tests | Pure candle aggregation (`aggregateCandles`) anchored to IST session opens (`09:15` NSE / `09:00` MCX), 1m->5m->15m equivalence, volume conservation, malformed row dropping, window selection (`selectChartWindow`) with candle-based padding, proportional scaling on > 1,500 candles, window truncation, and trading calendar fetch range estimation (`estimateFetchRange`). |
| `pnl.test.ts` | 7 tests | Long gross P&L, Short gross P&L, fee deduction, open trade outcome, negative quantity error handling, contract multipliers. |
| `fifo.test.ts` | 5 tests | Sequential lot dequeuing, partial exits, multi-fill weighted average price, excess exit quantity exception handling. |
| `risk.test.ts` | 6 tests | Position size formula, lot rounding down to lot size step, stop distance validation, planned R:R, realized R-multiple. |
| `metrics.test.ts` | 2 tests | Comprehensive dashboard metrics: win rate, profit factor (including zero-loss 999.99 handling), peak-to-trough drawdowns, consecutive win/loss streaks. |
| `currency.test.ts` | 3 tests | Identical currency pass-through, explicit conversion rates, rejection of silent 1:1 conversions when rate is missing. |
| `charges.test.ts` | 6 tests | Indian statutory charges across segments (NSE_EQ, NSE_FNO futures, NSE_FNO options, MCX commodities), flat brokerage (₹20/leg, ₹0 Finvasia, custom), STT/CTT, SEBI, GST, stamp duty. |
| `session.test.ts` | 5 tests | Automatic session derivation: NSE market hours (09:15-15:30 IST), MCX evening session, foreign exchanges (New York / London), weekends & Crypto off-hours. |
| `stop-move.test.ts` | 7 tests | Trailing vs risk-widening stop modifications, point and amount deltas, and automated `STOP_MOVED` mistake tagging. |
| `mistakes.test.ts` | 15 tests | Pure Decimal.js detection for revenge trading (time window + loss + position size), overtrading daily threshold & concurrent open positions, position sizing violations against equity, daily loss breach evaluation, daily session summary prefill, rule-based discipline rating (1 to 5), excursion-evidence rules (`STOP_TOO_TIGHT`, `PREMATURE_EXIT`, `BREAKEVEN_TOO_EARLY`), and advisory liquidity/level checks. |
| `templates.test.ts` | 34 tests | Pure Decimal.js rule resolution (PERCENT, POINTS, PREMIUM_PERCENT, MANUAL), target calculation from minRR, instrument tick size rounding, dynamic ranking by market/session/expiry, NSE 2026 Tuesday holiday shifts to Monday, universal asset class coverage, 25 built-in templates validation, and liquidity template resolution. |
| `edge.test.ts` | 26 tests | Statistical edge validation: Bayesian win rate, bootstrap expectancy intervals, minimum sample size verdicts. |
| `monte-carlo-risk.test.ts` | 12 tests | Monte Carlo equity path simulation and drawdown distributions. |
| `tilt.test.ts` | 8 tests | Tilt / emotional state detection heuristics. |
| `variant-analytics.test.ts` | 9 tests | Per-variant performance buckets, UNCLASSIFIED / NOT_APPLICABLE / ORPHANED system buckets, profit factor states, R-multiple coverage, sample size warnings, parent-vs-bucket invariant reconciliation, and dynamic `suggestTradeVariant` scoring. |
| `excursion.test.ts` | 18 tests | Pure Decimal.js 30-digit precision calculation of MAE/MFE points, amounts, R multiples, candle lifecycle overlap filtering, Exit Efficiency, stop hit & post-stop reversal detection, time-to-MFE/MAE, and diagnostic flags (`GAVE_BACK_PROFIT`, `STOP_TOO_TIGHT_EVIDENCE`, `EXITED_EARLY`). |

### B. Backend API & Integration Tests (349 Tests)
Located in [`apps/api/test/`](file:///Users/komal/projects/Trading%20Vault/apps/api/test/):

| Test File | Tests | Critical Assertions Covered |
| :--- | :--- | :--- |
| `backup-pipeline.test.ts` | 30 tests | Pure retention logic (10 cases: 30 daily, 12 monthly, leap years, month boundaries, unparseable keys ignored, min 3 kept); AES-256-GCM authenticated encryption/decryption round trips, tampered ciphertext rejection, tampered header rejection, wrong key failure, unique salt/IV per file, large streaming; manifest SHA-256 hash & record count verification; anomaly detection thresholds (under limit, over limit, drop to zero, first-ever backup); BSON EJSON Decimal128, ObjectId, and Date round-trip with zero balance drift; lockfile concurrency protection & stale lock reclamation; config validation (backup bucket !== live bucket, key length >= 32); S3 client mocking for incremental sync & verify-after-upload; status.json generation on OK, FAILED, and SUSPICIOUS paths. |
| `weekly-review.test.ts` | 10 tests | Authentication enforcement (401 without auth), 400 rejection on malformed week parameter, parity between live weekly snapshot and `/dashboard/stats` / `/trades/drilldown` aggregates for the same date range, multi-tenant isolation (foreign user trades/reviews never leak, 404), upsert idempotency (`{ userId: 1, week: 1, accountId: 1 }` unique index), `FINALIZED` snapshot immutability when subsequent trades are created, previous week focus rule evaluation, and IST boundary trade assignment (Sunday 23:59 IST belongs to that week, Monday 00:00 IST to the next). |
| `date-range-api.test.ts` | 10 tests | Validation error rejection (`400 VALIDATION_ERROR`) on invalid calendar dates and `startDate > endDate`; inclusive IST session boundaries across `GET /api/v1/trades`, `GET /api/v1/dashboard/stats`, `GET /api/v1/dashboard/equity-curves`, `GET /api/v1/analytics/psychology`, `GET /api/v1/analytics/excursion`, `GET /api/v1/export/json`, `GET /api/v1/strategies`, and `GET /api/v1/instruments`; mid-history starting equity calculation accounting for prior closed trades; strict multi-tenant isolation; and mathematical parity between `/trades`, `/dashboard/stats`, and `POST /trades/drilldown` aggregate net P&L and win rate. |
| `drilldown-and-equity-curves.test.ts` | 10 tests | Authentication enforcement, `kind: TRADE` single-lookup, `kind: TRADES` array lookup, `kind: FILTER` with numerical ranges (`netPnLMin`/`netPnLMax`, `mfeR`/`maeR`), `kind: FILTER` with temporal/categorical conditions (`weekday`, `session`, `emotion`, `mistakes`), strict multi-tenant isolation, limit clamping (capped at 200), and aggregate reconciliation consistency. |
| `auto-chart-snapshot.test.ts` | 6 tests | Automated snapshot lifecycle: skipping OPEN trades, creating permanent AUTO_CHART snapshots on CLOSED trades using settings & overrides, deduplicating existing snapshots (`SKIPPED_EXISTS`), marking snapshots stale (`isStale: true`) on closed trade edits, 12-screenshot cap enforcement with net-zero slot accounting, and strict multi-tenant isolation. |
| `trade-chart.test.ts` | 13 tests | Automated execution chart API: default 45/45 padding, custom asymmetric padding, validation rejections (negative, > 200, non-integer, duplicates, > 5 resolutions, unknown keys), legacy single-attachment backwards compatibility, multi-resolution results array (`200 OK`), `SKIPPED_EXISTS` without force, `REPLACED` with force, Cloudflare R2 cleanup, 12-screenshot cap enforcement with net-zero replacements, and excursion calculation invariance. |
| `chart-generator.test.ts` | 5 tests | Server-side dark-mode SVG rendering, bullish/bearish color coding, execution markers, header labels, excursion HUD integration. |
| `api.test.ts` | 29 tests | Registration, login, duplicate email rejection, session cookie issuance, account CRUD, trade creation with live P&L, Quick Close partial execution with CLOSED audit log, broker column mapping persistence, broker format auto-detection (Zerodha), FIFO raw execution grouping with statutory charges, duplicate trade prevention, batch undo with account balance reconciliation, profile risk settings retrieval & update (`GET`/`PUT /api/v1/settings/profile`), review queue endpoint (`GET /api/v1/review/queue`), trade mistake suggestions (`GET /api/v1/review/suggest-mistakes/:tradeId`), journal reflection prefill endpoint (`GET /api/v1/review/prefill/:date`), accurate 12-hour AM/PM broker timestamp preservation, and validation of new liquidity emotions, confluences, and mistake tags on trades, journals, and psychology analytics. |
| `session-auth.test.ts` | 12 tests | Persistent cookie issuance with explicit `Max-Age` (90 days) and `Expires`, SHA-256 hashed token storage (`tokenHash`), raw token exclusion from database, lazy sliding renewal on requests with < 50% idle lifetime remaining, avoidance of database writes on requests with > 50% remaining, idle session expiration enforcement, absolute lifetime cap (365 days) enforcement even if idle is active, seamless legacy plaintext token lookup and automatic upgrade to `tokenHash`, safe device session listing without token/hash leaks, single session revocation (`DELETE /api/v1/auth/sessions/:id`) with 404 on foreign sessions, `POST /api/v1/auth/logout-all` with current session preservation, password change revocation of other sessions, and production startup fail-fast on weak/missing `SESSION_SECRET`. |
| `optimize-image.test.ts` | 7 tests | Pixel-identical raw RGBA decoding proof of losslessness, Display P3 / sRGB ICC profile retention, 10% savings threshold enforcement, fail-safe corrupted buffer pass-through, JPEG to WebP transcoding, WebP lossless repack, SVG pass-through. |
| `attachment.test.ts` | 13 tests | Multipart upload, binary magic-bytes signature verification (PNG/JPEG/WebP), rejection of disguised binary files, server-side lossless optimization, matching stored WebP/PNG extension and stream Content-Type, 12-image cap enforcement, authenticated streaming, cloud storage cleanup upon deletion. |
| `template.test.ts` | 12 tests | Authentication enforcement, 25 built-in templates listing with stats, custom template creation & uniqueness, update, built-in protection (`BUILT_IN_READ_ONLY`), strict tenant isolation between users, trade linking to `templateId`, trade query filtering by `templateId`, favorite toggling, usage incrementation. |
| `strategy-variants.test.ts` | 8 tests | Custom parent strategy with arbitrary child variants (no static keys), tenant isolation, trade logging with `strategyId` + `setup.variantKey` and `CLASSIFIED` audit entry, `409 VARIANT_IN_USE` deletion protection, archiving via `isActive: false`, bulk classification, `GET /strategies/:id/analytics` buckets and invariant check, idempotent starter pack insertion. |
| `instrument.test.ts` | 18 tests | User-owned instruments, on-demand creation, preview/apply-to-trades cascades, `INSTRUMENT_IN_USE` protection. |
| `seed-engine.test.ts` | 8 tests | Deterministic seeding via Mulberry32 PRNG, 15 strategy playbooks, idempotency verification, account balance consistency, seed validation engine including Check 11 Excursion Invariants. |
| `connection.test.ts` | 8 tests | Cloud-only Atlas URI validation, masking credentials in logs, rejection of local/memory addresses, fail-fast behavior. |
| `storage.test.ts` | 13 tests | Cloudflare R2 bucket connection, signed uploads, streaming download, key formatting, object deletion. |
| `broker-sync.test.ts` | 11 tests | FYERS OAuth state, encrypted token persistence, account linking, funds snapshot persistence, drift tolerance, open-trade pause, pending adjustment creation, confirm/reject balance effects, and tenant isolation. |
| `account-backfill.test.ts` | 2 tests | Dry-run vs live migration coverage for legacy mapping indexes, transaction `source`/`status`, plaintext broker-secret encryption, and authoritative account recalculation. |
| `ledger-import.test.ts` | 5 tests | FYERS ledger classification, signed adjustments, duplicate idempotency, net-flow batch totals, account balance recalculation, and ledger batch undo. |
| `fyers-symbol.test.ts` | 7 tests | Pure helper mapping trade parameters to FYERS symbol formats across equities, indices, weekly options, monthly options, futures, and MCX commodities. |
| `excursion.test.ts` | 6 tests | Excursion analytics integration: 409 BROKER_NOT_CONNECTED, 400 TRADE_NOT_CLOSED, compute excursion & TradeCandleSnapshot caching, tenant isolation, backfill batching, excursion analytics scatter points. |
| `angel-one-market-data.test.ts` | 16 tests | Angel One SmartAPI candle integration, instrument scrip cache, lookback handling, daily rate-limit budget, and circuit breaker. |
| `angel-one-pure.test.ts` | 16 tests | Pure token parsing, response normalization, and error translation for Angel One market data. |
| `stop-move.test.ts` | 21 tests | API endpoints for stop move detection, trailing calculations, and risk-expansion analytics. |
| `regression.test.ts` | 38 tests | Exhaustive QA test matrix covering boundary scenarios: breakeven outcomes, soft delete account archival, bulk tagging, bulk deletion with multi-account reconciliation, CSV import duplicate prevention. |

---

## 3. Running Test Commands

```bash
# 1. Run all test suites across the monorepo (431 tests)
npm run test

# 2. Run only financial engine mathematical unit tests (178 tests)
npm run test:engine

# 3. Run only backend API, attachment, session, broker, ledger, and regression tests (253 tests)
#    Tip: if the in-memory replica set reports a port conflict, run sequentially:
#    npx vitest run --no-file-parallelism   (inside apps/api)
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

1. **Frontend Component Unit/Integration Testing:** `apps/web` currently does not have a Vitest + React Testing Library runner configured in its workspace scripts; frontend component logic (`DateRangeFilter.tsx`, `DateRangeContext.tsx`, etc.) is validated via TypeScript compiler typechecking (`tsc -b`), full integration coverage at the API boundary, and interactive browser verification. Configuring a dedicated Vitest environment with `@testing-library/react` and `jsdom` for `apps/web` is recommended.
2. **End-to-End (E2E) Browser Testing:** Currently, frontend components are tested via manual testing and backend integration tests. Implementing Playwright or Cypress E2E flows is recommended for automated browser regression testing.
3. **Visual Regression Testing:** Adding screenshot comparison tests for the Recharts equity curve and dark/light mode renders.
4. **High-Concurrency Stress Testing:** Load testing Fastify's rate limiter under 10,000 req/sec conditions using `autocannon`.
