# SetupMint — Permanent AI & Developer Context

> **CRITICAL DIRECTIVE FOR ALL AI CODING AGENTS (Antigravity, Gemini, Claude, Cursor):**
> Read this document first before undertaking any modification, refactoring, feature addition, or debugging task on this codebase. It provides the ground truth regarding application architecture, domain rules, calculation engines, and development protocols.

---

## 1. Product Identity & Purpose

- **Product Name:** **SetupMint — Trade. Track. Improve.** (PRO)
- **Codebase / Monorepo Name:** `tradevault-monorepo` (`@tradevault/api`, `@tradevault/web`, `@tradevault/financial-engine`, `@tradevault/shared`)
- **Product Vision:** A cloud-native, privacy-respecting trading journal and quantitative performance analytics platform engineered primarily for serious Indian retail traders (Equities, F&O, MCX Commodities) and global discretionary traders.
- **Privacy Standard:** 100% private cloud storage in the trader's dedicated MongoDB Atlas cluster and Cloudflare R2 bucket. No commercial UI kit subscriptions, telemetry, or third-party behavioral trackers. Data is stored strictly in the trader's personal cloud infrastructure.

---

## 2. Target Users & Supported Workflows

- **Target Traders:** Indian Index F&O traders (NIFTY, BANKNIFTY, FINNIFTY), MCX Commodity traders (Crude Oil, Natural Gas, Gold, Copper), Price Action / Smart Money Concepts (SMC) traders, and multi-broker account operators (FYERS, Zerodha, Angel One, Upstox, ICICI Direct).
- **Core Workflows:**
  1. Express & Comprehensive Manual Trade Logging (Simple Mode & Advanced FIFO Multi-Fill Mode).
  2. Pre-Trade Risk Calculator with one-click parameter transfer into the trade form.
  3. Visual Monthly Journal Calendar with green/red P&L heatmaps and daily reflection reviews.
  4. Psychology & Discipline Tracking (quantifying monetary losses from revenge trading, overtrading, moving stop losses, and position sizing violations).
  5. Quantitative Strategy Playbooks measuring real statistical win rates and profit factors.
  6. Data Portability: CSV/JSON export and interactive CSV import with auto-column mapping.

---

## 3. Confirmed Technology Stack

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`), Node.js LTS (`>=20.0.0`), npm (`>=10.0.0`).
- **Backend API (`apps/api`):** Fastify v5, TypeScript 5.7, Mongoose ODM v8, `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/multipart`, Pino structured logger.
- **Frontend SPA (`apps/web`):** React 19, TypeScript, Vite 6, Material UI (MUI v9), Emotion, Tailwind CSS v3, TanStack React Query v5, React Hook Form v7, Zod v3, Recharts v2.
- **Financial Calculation Engine (`packages/financial-engine`):** Pure mathematical library using **`decimal.js`** with **30-digit precision** (`ROUND_HALF_UP`). Zero floating-point round-off errors.
- **Shared Package (`packages/shared`):** Shared TypeScript types, Zod schemas, market constants, instrument presets.
- **Persistence:** MongoDB Atlas dedicated cloud cluster (`mongodb+srv://`). Strictly cloud-only with zero local/in-memory fallbacks.
- **Private Attachment Storage:** Cloudflare R2 private bucket via S3 API (`@aws-sdk/client-s3`), streamed through authenticated endpoints.
- **Testing:** Vitest v3 with isolated in-memory test storage and database mocks.

---

## 4. Key Directory & Source Locations

```text
Trading Vault/
├── apps/
│   ├── api/src/
│   │   ├── config.ts              # Env config & upload dir verification
│   │   ├── server.ts              # Fastify app factory (buildApp)
│   │   ├── db/connection.ts       # Multi-stage MongoDB connection manager
│   │   ├── db/models/             # Mongoose models (User, Trade, TradingAccount, etc.)
│   │   ├── routes/                # 15 REST API routes (/auth, /trades, /templates, /review, etc.)
│   │   ├── services/              # account.service.ts (authoritative balance reconciliation)
│   │   ├── seed/                  # SetupMint Seed Engine (8 profiles, PRNG, validator)
│   │   └── scripts/               # seed.ts, reset-demo.ts, validate-seed.ts
│   └── web/src/
│       ├── App.tsx                # React Router routing tree (13 routes)
│       ├── context/               # AuthContext, ThemeContext, ToastContext
│       ├── lib/api.ts             # Fetch API client with ApiError handling
│       ├── components/brand/      # SetupMintLogo.tsx, StratumLogo.tsx
│       ├── components/layout/     # AppLayout.tsx (navigation drawer & account switcher)
│       ├── components/trades/     # TradeFormModal.tsx, TradeAdvancedFills.tsx, etc.
│       └── pages/                 # 13 routed page components
├── packages/
│   ├── financial-engine/src/      # pnl.ts, fifo.ts, risk.ts, metrics.ts, currency.ts, charges.ts, session.ts, templates.ts, excursion.ts
│   └── shared/src/                # types.ts, schemas.ts, constants.ts
├── scripts/                       # backup.js, restore.js, reconcile.js
└── docs/                          # Comprehensive markdown documentation library
```

---

## 5. Primary Application Routes

- `/login` & `/register` — Authentication pages
- `/` — Performance Overview & Equity Curve (`DashboardPage`)
- `/trades` — Master Trade Ledger with filtering & bulk actions (`TradesPage`)
- `/trades/:id` — In-Depth Trade Review & Chart Gallery (`TradeDetailPage`)
- `/journal` — Monthly P&L Calendar Heatmap & Daily Reflection (`JournalCalendarPage`)
- `/analytics` — Psychology, Session Analytics & Execution Quality MAE/MFE (`AnalyticsPage`)
- `/strategies` — Strategy Playbooks & Statistical Scores (`StrategyPlaybookPage`)
- `/strategies/:id/analytics` — Strategy Setup Variant Analytics & Performance Buckets (`StrategyVariantAnalyticsPage`)
- `/risk-calculator` — Position Sizing with Form Transfer (`RiskCalculatorPage`)
- `/accounts` — Multi-Broker Accounts & Cash Flows (`AccountsPage`)
- `/instruments` — User-Owned Market Specifications & Traded Summaries (`InstrumentsPage`)
- `/reports` — CSV/JSON Export & Interactive Broker Import (`ReportsPage`)
- `/settings` — User Profile, Password, FYERS Configuration & Excursion Backfill (`SettingsPage`)

---

## 6. Database Entities & Consistency Invariants

### Entities:
- `User`, `Session` (TTL 30d), `TradingAccount` (Decimal128), `AccountTransaction`, `Trade` (with `setup` variant metadata, `calculated.excursion`, and `auditLog`), `Instrument`, `Strategy` (with `variants` array), `TradeTemplate`, `DailyJournal`, `Attachment`, `BrokerIntegration`, `BrokerImportMapping`, `BrokerFundsSnapshot`, `TradeCandleSnapshot`, `MarketDataIntegration` (Angel One SmartAPI fallback), `AngelOneInstrument` (Scrip master token resolution), `AuditLog`.

### Invariants:
1. **Tenant Isolation:** Every document includes `userId: ObjectId`. All queries must filter by `{ userId: req.user.id }`.
2. **Authoritative Account Balance Invariant:**
   $$\text{Current Balance} = \text{Initial Balance} + \sum \text{Closed Trades Net P&L} + \sum \text{Deposits} - \sum \text{Withdrawals} + \sum \text{Adjustments}$$
   *Never modify account balances via client-side calculations. Always trigger `AccountService.recalculateAccountBalances(accountId, userId)`.*
3. **Parent Strategy & Child Variant Integrity:**
   - Strategies support arbitrary, full custom child setup variants (`variants: IStrategyVariant[]`).
   - Setup matching attributes (`expected`) are 100% optional and custom — zero static restrictions or locked concepts.
   - Child variants referenced by historical trades can only be archived (`isActive: false`), never deleted. Deletion attempts return `409 Conflict` (`VARIANT_IN_USE`).
   - Setup variant classification modifications are recorded in the trade's `auditLog` with action `CLASSIFIED`.
   - Starter/predefined parent strategies and variants are populated into the database via demo seed.
4. **Instrument Ownership & One-Underlying Invariant:**
   - The instruments collection contains **only** instruments the user has traded or custom created (`source: 'AUTO' | 'CUSTOM'`).
   - One instrument per underlying: option strikes, expiries, and call/put flags belong to `Trade` (`underlying`, `optionType`, `strikePrice`, `expiryDate`), pointing to a single root `Instrument` (`NIFTY`, `BANKNIFTY`, `CRUDEOIL`).
   - Editing an instrument can cascade to trades (`applyToTrades: true`), recalculating trade metrics and reconciling account balances in a single transaction.
   - Deleting an instrument referenced by trades returns `409 Conflict`.
5. **Soft-Delete Archival:** Deleting an account with existing trades sets `status = 'ARCHIVED'` to protect historical trade records.
6. **Physical Storage Cleanup:** Deleting a trade or attachment physically removes the object from Cloudflare R2 via `storage.delete()`.
7. **Market Data Fallback Chain:** Historical candles evaluate in order: `Cached Snapshot -> FYERS -> Angel One SmartAPI -> Underlying Fallback -> UNAVAILABLE`. SmartAPI is strictly market-data-only; zero trading methods or order manipulation.

---

## 7. Financial Calculations Standard

All monetary calculations reside in `@tradevault/financial-engine`:
- **Linear Gross P&L:**
  - $\text{Long Gross} = (P_{\text{exit}} - P_{\text{entry}}) \times Q \times M$
  - $\text{Short Gross} = (P_{\text{entry}} - P_{\text{exit}}) \times Q \times M$
- **Net P&L:** $\text{Gross P&L} - \text{Total Costs} + \text{Adjustments}$
- **FIFO Matching Queue:** Exit fills match earliest open entry lots chronologically. Excess exits throw an error.
- **Indian Statutory Charges:** Modeled in `IndianChargesCalculator` (`@tradevault/financial-engine`) (flat ₹20 leg brokerage, STT/CTT rates, SEBI turnover fees, stamp duty, 18% GST).
- **Position Sizing:** Raw quantity is **floored** to the nearest integer multiple of `lotSize`. Never round up.
- **Profit Factor Zero-Loss Edge Case:** Returns `999.99` if losses are zero and gains are positive.
- **Currency Conversion:** Requires explicit rate; never assumes a silent 1:1 fallback.
- **Variant Performance Analytics:** Calculates exact bucket metrics, win rates, expectancy, profit factor states (`NORMAL`, `NO_LOSSES`, `NO_TRADES`), sample size warnings, and mathematical invariant reconciliation across all parent and child variants.

---

## 8. Demo Mode & Seed Engine

- **Demo Identity:** Demo user is `trader@tradevault.local` (Password: `TradeVault@123`).
- **8 Profiles:** `beginner`, `active-trader` (default), `options-specialist`, `commodity-trader`, `multi-broker`, `psychology`, `analytics`, `edge-cases`.
- **Determinism:** Seeded via Mulberry32 PRNG. Supplying the same `--seed=<n>` produces identical data.
- **On-Demand Instruments:** Instruments are created on-the-fly via `InstrumentService.ensureForTrade` only for traded underlyings (0 unused instruments).
- **Safe Reset:** `npm run seed:reset` wipes only records matching `trader@tradevault.local`. Real registered users are never touched.

---

## 9. Local Development & Operational Commands

```bash
# Start dev servers (Fastify on 4000, Vite on 5173)
npm run dev

# Run all test suites across the monorepo (410 verified tests)
npm run test

# Run financial engine unit tests (163 tests)
npm run test:engine

# Backfill and normalize instruments for existing trades
npm run instruments:backfill

# Run API integration and regression tests (218 tests)
npm run test:api

# Typecheck all packages
npm run typecheck

# Seed default active-trader demo data
npm run db:seed

# Safely reset demo data
npm run seed:reset

# Validate seed data integrity
npm run seed:validate

# Backup local database and chart screenshots
npm run db:backup

# Restore local database and chart screenshots
npm run db:restore

# Reconcile all account balances
npm run db:reconcile
```

---

## 10. Permanent Rules of Engagement for AI Agents

1. **Inspect Existing Code First:** Always read relevant source files using `view_file` or `grep_search` before modifying code. Never guess function signatures, schemas, or routes.
2. **Reuse Established Patterns:**
   - Use `request<T>()` from [`apps/web/src/lib/api.ts`](file:///Users/komal/projects/Trading%20Vault/apps/web/src/lib/api.ts) for frontend API calls.
   - Use `@tradevault/financial-engine` for all financial math; never implement ad-hoc floating-point calculations in components.
   - Use shared Zod schemas from `@tradevault/shared` for validation.
3. **Preserve Financial Integrity:**
   - Always invoke `AccountService.recalculateAccountBalances()` after any trade creation, update, deletion, or CSV import.
   - Never use IEEE-754 floating point arithmetic for monetary balances; use `decimal.js` or `Decimal128`.
4. **Preserve Cloud-Only Architecture & Privacy:**
   - Chart screenshots are stored exclusively in Cloudflare R2 via `@tradevault/api` storage provider and streamed through authenticated endpoints. Never reintroduce local disk storage or fallbacks.
   - Database persistence runs exclusively against MongoDB Atlas. Fail-fast on startup with clear diagnostic errors if credentials or network are unreachable. Never reintroduce embedded or in-memory MongoDB fallbacks in production.
   - Do not add telemetry or external analytics beacons.
5. **Protect Secrets & Broker Credentials:**
   - Never commit API keys, FYERS app secrets, or session secrets.
   - Never place real broker orders in tests or seed scripts.
6. **Maintain Documentation Consistency:**
   - Whenever you add a new route, database model, or calculation parameter, update the relevant file in `docs/` and summarize the change.
7. **Verify Before Reporting Completion:**
   - Run `npm run typecheck` and `npm run test` after making meaningful code edits.
   - Report actual verified test output honestly. Never state a task is complete without running verification.

---

## 11. Links to Detailed Documentation

- [**PRODUCT_OVERVIEW.md**](PRODUCT_OVERVIEW.md) — Product vision, problems solved, target traders.
- [**PRODUCT_FEATURES.md**](PRODUCT_FEATURES.md) — Exhaustive module inventory with inputs, outputs, and statuses.
- [**APPLICATION_ARCHITECTURE.md**](APPLICATION_ARCHITECTURE.md) — Monorepo design, Fastify plugins, and MongoDB fallback hierarchy.
- [**PROJECT_STRUCTURE.md**](PROJECT_STRUCTURE.md) — Complete annotated directory tree.
- [**ROUTES_AND_PAGES.md**](ROUTES_AND_PAGES.md) — Specifications for all 13 application routes.
- [**USER_FLOWS.md**](USER_FLOWS.md) — Step-by-step user workflows and Mermaid diagrams.
- [**DATABASE_SCHEMA.md**](DATABASE_SCHEMA.md) — MongoDB schemas, field definitions, and indexes.
- [**DATA_RELATIONSHIPS.md**](DATA_RELATIONSHIPS.md) — Entity-relationship diagrams and referential integrity rules.
- [**API_REFERENCE.md**](API_REFERENCE.md) — REST API v1 endpoints reference.
- [**BUSINESS_LOGIC.md**](BUSINESS_LOGIC.md) — Trade lifecycles, mistake flags, and reconciliation rules.
- [**TRADING_CALCULATIONS.md**](TRADING_CALCULATIONS.md) — Exact mathematical formulas and Decimal.js implementations.
- [**BROKER_INTEGRATIONS.md**](BROKER_INTEGRATIONS.md) — FYERS API v3 adapter architecture and reconciliation.
- [**SEED_DATA_AND_DEMO_MODE.md**](SEED_DATA_AND_DEMO_MODE.md) — 8 seed profiles, PRNG, and validation engine.
- [**AUTHENTICATION_AND_SECURITY.md**](AUTHENTICATION_AND_SECURITY.md) — Cookie sessions, bcrypt, and magic bytes upload protection.
- [**FILE_STORAGE_AND_ATTACHMENTS.md**](FILE_STORAGE_AND_ATTACHMENTS.md) — Private disk storage and streaming.
- [**UI_COMPONENTS_AND_DESIGN_SYSTEM.md**](UI_COMPONENTS_AND_DESIGN_SYSTEM.md) — MUI v9 and Tailwind design system.
- [**CONFIGURATION_AND_ENVIRONMENT.md**](CONFIGURATION_AND_ENVIRONMENT.md) — Safe environment variable references.
- [**LOCAL_SETUP_AND_DEVELOPMENT.md**](LOCAL_SETUP_AND_DEVELOPMENT.md) — Developer setup instructions.
- [**TESTING_AND_QUALITY_ASSURANCE.md**](TESTING_AND_QUALITY_ASSURANCE.md) — Vitest test suites and assertion coverage.
- [**DEPLOYMENT_AND_OPERATIONS.md**](DEPLOYMENT_AND_OPERATIONS.md) — Production builds and backup procedures.
- [**KNOWN_LIMITATIONS_AND_TECHNICAL_DEBT.md**](KNOWN_LIMITATIONS_AND_TECHNICAL_DEBT.md) — Known boundaries and technical debt.
