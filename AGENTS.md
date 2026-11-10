# Antigravity & AI Agent Instructions — SetupMint

Welcome, AI Agent.

Before inspecting or writing code in this repository, you **MUST** read the permanent context document:
👉 [**`docs/AI_CONTEXT.md`**](docs/AI_CONTEXT.md)

It contains:
- Complete product identity, tech stack, and directory mappings.
- All 15 application REST route groups, 14 MongoDB database models, and endpoints.
- Single source-of-truth account-driven architecture (`TradingAccount.profile`, `resolveAccountContext`, unified `AccountContext`).
- Exact financial calculation specifications in `@tradevault/financial-engine` with 30-digit Decimal.js precision and zero cross-currency aggregation.
- Strict rules of engagement regarding financial accuracy, tenant isolation, local-first privacy, and testing requirements.

> [!CAUTION]
> **PERMANENT INVIOLABLE RULE — NEVER DELETE REAL USER ACCOUNTS OR DATA:**
> The primary database contains real live accounts and data (including `komal@gmail.com`, 3 real accounts: FYERS, The5ers, Elefin, plus real trade history and journals).
> 1. **ZERO GLOBAL WIPES:** NEVER call `User.deleteMany({})`, `TradingAccount.deleteMany({})`, or blanket collection drops anywhere in tests, seeders, or scripts.
> 2. **STRICT TEST ISOLATION:** All integration tests MUST isolate and delete ONLY their own ephemeral test users (e.g. matching `@test.local`, `@setupmint.internal`, or specific generated ObjectIds).
> 3. **DEMO-ONLY RESETS:** Scripts like `npm run seed:reset` only target `trader@tradevault.local`. Real user data must NEVER be touched, overwritten, or cleared.

### Quick Reference Commands:
- `npm run dev` — Start Fastify backend (4000) and Vite frontend (5173).
- `npm run test` — Run all unit and integration tests (425 financial engine + API test suites).
- `npm run test:engine` — Run all 425 financial engine unit tests across 36 test suites.
- `npm run typecheck` — Typecheck all workspaces.
- `npm run build` — Build production bundles across all workspaces.
- `npm run db:seed` — Populate realistic demo trading records.
- `npm run seed:reset` — Safely reset demo data without touching real user data.

For comprehensive architectural and domain documentation, refer to the [**`docs/`**](docs/README.md) directory.
