# SetupMint — Project Structure & Directory Map

This document provides an annotated directory tree of the **SetupMint** repository, explaining the role of each directory and citing the exact locations of routes, components, APIs, models, calculations, scripts, and tests.

---

## 1. Top-Level Monorepo Tree

```text
Trading Vault/
├── apps/
│   ├── api/                       # Fastify v5 REST API server & database layer
│   └── web/                       # React 19 + Vite 6 + Tailwind CSS + MUI frontend
├── packages/
│   ├── financial-engine/          # Standalone 30-digit decimal financial calculation engine
│   └── shared/                    # Shared TypeScript types, Zod validation schemas, constants
├── scripts/                       # Database backup, restore, and reconciliation scripts
├── docs/                          # Comprehensive technical and product documentation
├── docker-compose.yml             # Optional Docker configuration for MongoDB
├── package.json                   # Root monorepo workspace configuration
├── package-lock.json              # Monorepo lockfile
├── .env.example                   # Baseline environment variables template
└── README.md                      # Quick start guide & setup instructions
```

---

## 2. Directory Breakdown by Layer

### A. Root Configuration & Scripts
- [`package.json`](file:///Users/komal/projects/Trading%20Vault/package.json): Monorepo workspace configuration defining npm workspaces (`apps/*`, `packages/*`), development scripts (`dev`, `build`, `test`, `db:seed`, `db:backup`, `db:restore`, `db:reconcile`), and shared dev dependencies (`concurrently`, `typescript`).
- [`docker-compose.yml`](file:///Users/komal/projects/Trading%20Vault/docker-compose.yml): Runs local MongoDB 7.0 container bound strictly to `127.0.0.1:27017` with volume mapped to `./data/mongo-docker`.
- [`.env.example`](file:///Users/komal/projects/Trading%20Vault/.env.example): Template for local environment variables (`PORT`, `HOST`, `MONGODB_URI`, `SESSION_SECRET`, `UPLOAD_DIR`, etc.).
- [`scripts/backup.js`](file:///Users/komal/projects/Trading%20Vault/scripts/backup.js): CLI backup script dumping all database collections to JSON and copying private chart uploads to `./backups/tradevault-backup-<timestamp>`.
- [`scripts/restore.js`](file:///Users/komal/projects/Trading%20Vault/scripts/restore.js): CLI restoration script restoring database collections and private chart attachments from the latest or specified local backup archive.
- [`scripts/reconcile.js`](file:///Users/komal/projects/Trading%20Vault/scripts/reconcile.js): CLI reconciliation script recalculating realized P&L, transaction totals, and current balances across all accounts.

---

### B. Shared Library (`packages/shared`)
Contains code and type definitions shared across backend and frontend:
- [`packages/shared/src/types.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/types.ts): All domain TypeScript interfaces and union types (`AssetClass`, `MarketSegment`, `Direction`, `TradeStatus`, `TradeOutcome`, `ExecutionMode`, `Emotion`, `MistakeTag`, `Confluence`, `ITrade`, `ITradingAccount`, `IStrategy`, `IInstrument`, `IDailyJournal`, `IDashboardStats`, `INormalizedExecution`).
- [`packages/shared/src/schemas.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/schemas.ts): Shared runtime Zod schemas for validation (`loginSchema`, `registerSchema`, `createAccountSchema`, `createTradeSchema`, `tradeFilterQuerySchema`, `dailyJournalSchema`, `riskCalculatorQuerySchema`).
- [`packages/shared/src/constants.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/constants.ts): Domain constants and catalogs (`ASSET_CLASSES`, `MARKET_SEGMENTS`, `EMOTIONS`, `MISTAKE_TAGS`, `CONFLUENCES`, `TRADING_SESSIONS`, `PRESET_INSTRUMENTS`, `CHART_ATTACHMENT_CATEGORIES`, `CHART_TIMEFRAMES`).
- [`packages/shared/src/index.ts`](file:///Users/komal/projects/Trading%20Vault/packages/shared/src/index.ts): Barrel export.

---

### C. Financial Engine (`packages/financial-engine`)
Pure, deterministic mathematical calculation library:
- [`packages/financial-engine/src/pnl.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/pnl.ts): Linear P&L calculations (`calculateLinearPnL`, `calculateSimpleExecutionPnL`) for long and short positions with exact decimal arithmetic.
- [`packages/financial-engine/src/fifo.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/fifo.ts): First-In-First-Out (FIFO) matching queue for multi-fill executions and partial exits (`calculateFIFOExecution`).
- [`packages/financial-engine/src/risk.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/risk.ts): Position sizing, risk budget calculations, lot rounding, planned R:R, and realized R-multiples (`calculateRiskAndPositionSize`, `calculateRealizedRMultiple`).
- [`packages/financial-engine/src/metrics.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/metrics.ts): Aggregated quantitative metrics (`calculateDashboardMetrics`) generating win rate, profit factor, expectancy, drawdowns, streaks, and equity curves.
- [`packages/financial-engine/src/currency.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/currency.ts): Deterministic currency conversion rejecting silent 1:1 fallbacks (`convertCurrency`).
- [`packages/financial-engine/src/charges.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/charges.ts): Indian statutory regulatory charges calculator (`calculateIndianCharges`, `IndianChargesCalculator`) covering flat brokerage, exchange fees, STT/CTT, stamp duty, SEBI fees, and 18% GST with Decimal.js.
- [`packages/financial-engine/src/session.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/session.ts): Automatic trading session derivation (`deriveSessionFromTime`) from execution timestamp and exchange.
- [`packages/financial-engine/src/mistakes.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/mistakes.ts): Rule-based mistake detection (`detectMistakeSuggestions`, `checkDailyLossBreach`, `calculateDailySessionSummary`) evaluating revenge trading, overtrading, sizing violations, daily loss limits, and discipline rating scoring.
- [`packages/financial-engine/src/templates.ts`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/src/templates.ts): Dynamic template resolution (`resolveTemplate`), context-aware ranking (`rankTemplates`), tick rounding (`roundToTick`), and NSE 2026 expiry date calculation (`isNiftyWeeklyExpiry`, `isNseMonthlyExpiry`, `isExpiryDay`).
- [`packages/financial-engine/test/`](file:///Users/komal/projects/Trading%20Vault/packages/financial-engine/test/): Comprehensive Vitest test suite (70 unit tests across `pnl.test.ts`, `fifo.test.ts`, `risk.test.ts`, `metrics.test.ts`, `currency.test.ts`, `charges.test.ts`, `session.test.ts`, `mistakes.test.ts`, and `templates.test.ts` (30 tests)).

---

### D. Backend API Server (`apps/api`)
Fastify REST API server and database layer:
```text
apps/api/
├── src/
│   ├── config.ts                  # Configuration loader from environment variables
│   ├── server.ts                  # Fastify application factory (buildApp) and server bootstrap
│   ├── storage/                   # Cloudflare R2 object storage provider (IStorageProvider, S3Storage)
│   ├── db/
│   │   ├── connection.ts          # MongoDB Atlas connection manager with fail-fast validation
│   │   └── models/                # Mongoose ODM schemas & models
│   │       ├── User.ts            # User identity, password hash, base currency, theme, riskSettings
│   │       ├── Session.ts         # User sessions with 30-day TTL expiration index
│   │       ├── TradingAccount.ts  # Trading accounts with exact Decimal128 balance fields
│   │       ├── AccountTransaction.ts # Deposits, withdrawals, and cash flow adjustments
│   │       ├── Trade.ts           # Central trade document (fills, risk, thesis, psychology, auditLog)
│   │       ├── Instrument.ts      # Multi-asset instrument catalog with contract multipliers
│   │       ├── Strategy.ts        # Strategy playbooks with rules and checklists
│   │       ├── DailyJournal.ts    # Daily reflection reviews and market bias ratings
│   │       ├── Attachment.ts      # Screenshot attachment records in Cloudflare R2
│   │       ├── BrokerIntegration.ts # FYERS connection status and sync history
│   │       ├── BrokerImportMapping.ts # Saved per-broker CSV column mapping configurations
│   │       ├── BrokerFundsSnapshot.ts # Immutable FYERS fund-limit balance snapshots
│   │       ├── AuditLog.ts        # Immutable system audit trail entries
│   │       ├── TradeTemplate.ts   # Rule-driven trade setup templates with dynamic SL/target
│   │       └── index.ts           # Models barrel export
│   ├── middleware/
│   │   ├── auth.ts                # Session cookie validation (requireAuth, createSession, clearSession)
│   │   └── validate.ts            # Param validation middlewares (validateObjectIdParam, validateDateParam)
│   ├── routes/                    # REST API route handlers
│   │   ├── auth.routes.ts         # /api/v1/auth (register, login, logout, me)
│   │   ├── account.routes.ts      # /api/v1/accounts (CRUD, transactions, reconcile)
│   │   ├── instrument.routes.ts   # /api/v1/instruments (presets + custom CRUD)
│   │   ├── strategy.routes.ts     # /api/v1/strategies (CRUD + trade stat aggregation)
│   │   ├── trade.routes.ts        # /api/v1/trades (CRUD, duplicate, bulk-tag, bulk-delete)
│   │   ├── dashboard.routes.ts    # /api/v1/dashboard/stats (overview stats & equity curve)
│   │   ├── journal.routes.ts      # /api/v1/journal (calendar heatmap & daily reviews)
│   │   ├── review.routes.ts       # /api/v1/review (queue, session prefill, mistake suggestions)
│   │   ├── analytics.routes.ts    # /api/v1/analytics/psychology (emotions & mistake costs)
│   │   ├── risk.routes.ts         # /api/v1/risk/calculate (sizing & lot rounding)
│   │   ├── template.routes.ts     # /api/v1/templates (CRUD, favorites, usage, edge stats)
│   │   ├── attachment.routes.ts   # /api/v1/attachments (upload, stream, delete)
│   │   ├── export-import.routes.ts# /api/v1/export (CSV/JSON export, CSV preview & commit)
│   │   ├── settings.routes.ts     # /api/v1/settings (profile, password, system-status)
│   │   └── integrations.routes.ts # /api/v1/integrations (FYERS config & status)
│   ├── services/
│   │   ├── account.service.ts     # Authoritative account balance reconciliation service
│   │   ├── crypto.service.ts      # AES-256-GCM encryption for broker secrets and tokens
│   │   └── fyers.service.ts       # FYERS API v3 OAuth, tradebook sync, and funds sync service
│   ├── seed/                      # SetupMint Heavy Seed Data Engine
│   │   ├── charges-calculator.ts  # Indian statutory charges calculator (re-exports from @tradevault/financial-engine)
│   │   ├── chart-generator.ts     # Generates synthetic TradingView-style SVG candlestick charts
│   │   ├── date-generator.ts      # IST market calendar date generator (skipping weekends/holidays)
│   │   ├── instrument-catalog.ts  # Realistic Indian trading scrips & strike price ranges
│   │   ├── playbooks.ts           # Realistic strategy templates (SMC, Breakout, F&O Scalping)
│   │   ├── prng.ts                # Deterministic Mulberry32 Pseudo-Random Number Generator
│   │   ├── profiles.ts            # 8 seed profiles (A through H) with target win rates & densities
│   │   ├── seed-engine.ts         # Core seed generation engine
│   │   ├── types.ts               # Seed engine configuration types
│   │   └── validator.ts           # Rigorous data integrity assertion validator
│   └── scripts/                   # CLI maintenance scripts
│       ├── seed.ts                # CLI entry point for seeding (npm run db:seed)
│       ├── reset-demo.ts          # Safe reset script for demo user data (npm run seed:reset)
│       ├── validate-seed.ts       # CLI validator script (npm run seed:validate)
│       ├── backfill-account-transactions.ts # Account and broker data backfill script
│       └── clean.ts               # Clean script
└── test/                          # Vitest API and Seed Engine integration test suites (184 tests across 14 suites)
    ├── account-backfill.test.ts   # Account and broker data backfill migration tests
    ├── api.test.ts                # Fastify endpoint integration tests
    ├── attachment.test.ts         # Attachment upload, magic bytes, and stream tests
    ├── broker-sync.test.ts        # FYERS OAuth, funds snapshot, and reconciliation tests
    ├── connection.test.ts         # Cloud-only Atlas URI validation tests
    ├── ledger-import.test.ts      # Cash ledger import, classification, and undo tests
    ├── optimize-image.test.ts     # Server-side lossless image optimization tests
    ├── regression.test.ts         # Comprehensive 38-case QA regression test suite
    ├── seed-engine.test.ts        # Seed engine determinism, idempotency, and integrity tests
    ├── session-auth.test.ts       # Sliding session, token hashing, and TTL tests
    ├── storage.test.ts            # Cloudflare R2 object storage provider tests
    ├── strategy-variants.test.ts  # Strategy setup variant CRUD and analytics tests
    ├── template.test.ts           # Template CRUD, tenant isolation, and edge stat tests
    └── setup.ts                   # Vitest setup with in-memory replica set and index bootstrap
```

---

### E. Frontend Application (`apps/web`)
React 19 + TypeScript + Vite + Tailwind CSS + Material UI:
```text
apps/web/
├── public/                        # Static web assets
├── src/
│   ├── main.tsx                   # React root mount and QueryClient configuration
│   ├── App.tsx                    # React Router definitions (public & protected routes)
│   ├── index.css                  # Tailwind CSS and global style definitions
│   ├── context/                   # React Context Providers
│   │   ├── AuthContext.tsx        # Authentication state (user, loading, login, logout)
│   │   ├── ThemeContext.tsx       # Dark / Light / System theme state & MUI sync
│   │   └── ToastContext.tsx       # Custom animated toast notification system
│   ├── lib/
│   │   ├── api.ts                 # Strongly typed fetch client with ApiError handling
│   │   └── utils.ts               # Formatting helpers (formatCurrency, formatPercent, formatR)
│   ├── theme/
│   │   └── theme.ts               # MUI v9 custom theme generator (colors, typography, components)
│   ├── components/
│   │   ├── brand/                 # SetupMint Pro branding
│   │   │   ├── SetupMintLogo.tsx  # Vector SVG logo & wordmark
│   │   │   └── StratumLogo.tsx    # Re-export alias for backward compatibility
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx      # Sidebar navigation, top bar, global account selector
│   │   │   └── CommandPalette.tsx # Global Cmd/Ctrl+K shortcut command palette
│   │   ├── ui/                    # Reusable UI primitives
│   │   │   ├── ConfirmDialog.tsx  # Confirmation modal for dangerous actions
│   │   │   └── Modal.tsx          # Accessible modal dialog container
│   │   └── trades/                # Trade form and execution components
│   │       ├── TradeFormModal.tsx # Master modal (Quick vs Comprehensive, Simple vs Advanced)
│   │       ├── QuickCloseTradeDialog.tsx # Fast exit modal with live P&L and auto-charges
│   │       ├── tradeTemplates.ts  # Predefined trade setup templates
│   │       ├── form/
│   │       │   ├── MarketTemplateBar.tsx      # Ranked quick setup chips bar (1-6 shortcuts, preview)
│   │       │   ├── TradeCalculationBanner.tsx # Live gross/net P&L & fees banner
│   │       │   ├── TradeTemplateSelector.tsx  # Modal catalog for setup templates (/api/v1/templates)
│   │       │   ├── TradeQuickSection.tsx      # Express entry inputs & template bar integration
│   │       │   ├── TradeAdvancedFills.tsx     # Chronological FIFO fill entries
│   │       │   ├── TradeJournalDetails.tsx    # Thesis, confluences, psychology tabs
│   │       │   ├── TradeIdentityTab.tsx       # Account, symbol, instrument details
│   │       │   ├── TradeExecutionTab.tsx      # Entry/exit prices, fees, multiplier
│   │       │   ├── TradeRiskTab.tsx           # Initial stop, target, risk budget
│   │       │   ├── TradeThesisTab.tsx         # Bias, structure, confluences
│   │       │   └── TradePsychologyTab.tsx     # Emotions, discipline score, mistake flags
│   │       └── attachments/       # Chart attachments
│   │           ├── TradeAttachmentUploader.tsx# File staging & multipart upload uploader
│   │           ├── TradeScreenshotGallery.tsx # Lightbox thumbnail gallery
│   │           └── ChartImageViewerDialog.tsx # Full-resolution screenshot lightbox
│   └── pages/                     # Routed page components
│       ├── LoginPage.tsx          # /login (User login)
│       ├── RegisterPage.tsx       # /register (User registration)
│       ├── DashboardPage.tsx      # / (Performance overview, KPI cards, equity curve)
│       ├── TradesPage.tsx         # /trades (Trade ledger table, filters, bulk actions)
│       ├── TradeDetailPage.tsx    # /trades/:id (Deep-dive trade inspection & charts)
│       ├── JournalCalendarPage.tsx# /journal (Monthly green/red calendar & reflections)
│       ├── AnalyticsPage.tsx      # /analytics (Psychology, weekday, session analytics)
│       ├── StrategyPlaybookPage.tsx # /strategies (Dual tabs: Execution Playbooks & Trade Templates)
│       ├── StrategyVariantAnalyticsPage.tsx # /strategies/:id/analytics (Setup variant buckets & performance)
│       ├── RiskCalculatorPage.tsx # /risk-calculator (Position sizing & trade transfer)
│       ├── AccountsPage.tsx       # /accounts (Multi-broker ledger & cash flows)
│       ├── InstrumentsPage.tsx    # /instruments (Contract specifications & scrips)
│       ├── ReportsPage.tsx        # /reports (CSV/JSON export, CSV import mapping)
│       └── SettingsPage.tsx       # /settings (Profile, password, system status)
```
