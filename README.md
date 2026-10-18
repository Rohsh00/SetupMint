# TradeVault — Professional Discretionary Trading Journal

A local-first, privacy-focused trading journal application engineered for serious discretionary traders. Built with **React 19**, **Vite**, **Tailwind CSS**, **Fastify**, **TypeScript**, and **MongoDB**.

---

## 🌟 Key Features

- **Multi-Asset & Multi-Market Support:**
  - Indian Equities (NSE/BSE)
  - Indian Futures & Options (NIFTY, BANKNIFTY, Stock F&O)
  - MCX Commodities (Crude Oil, Natural Gas, Gold, Copper with exact lot sizes & multipliers)
  - Forex & Cryptocurrency (Perpetuals and spot)
- **Deterministic Financial Calculation Engine:**
  - Exact 30-digit decimal arithmetic via `decimal.js` (zero binary floating-point round-off errors).
  - First-In-First-Out (FIFO) multi-fill execution matching for scale-ins and partial exits.
  - Automatic transaction fee breakdowns (brokerage, STT/CTT, exchange charges, GST, stamp duty).
- **Fast Manual Trade Entry:**
  - Simple Mode (rapid entry of completed trades with live calculation preview)
  - Advanced Mode (individual entry and exit fills matched by FIFO)
  - Pre-trade risk budget calculation, planned target, and initial stop-loss
  - Technical confluences (Break of Structure, Change of Character, Fair Value Gap, Order Blocks, Liquidity Sweeps)
- **Psychology & Discipline Tracking:**
  - Emotion tracking before entry, during trade, and after exit
  - 1-to-5 discipline rating
  - Direct tracking of costly mistakes: Revenge Trading, Overtrading, Premature Exit, Moving Stop Loss, Position Size Violations
- **Visual Monthly Journal Calendar:**
  - Green / Red daily P&L heat map with trade counts and monthly totals
  - Daily reflection review form (market conditions, bias, mistakes, and plan for next session)
- **Interactive Risk Calculator:**
  - Position sizing calculator with automatic contract multiplier and lot size rounding
  - One-click **"Transfer to Trade Form"** to push calculated parameters directly into a new trade entry
- **Private Chart Screenshots:**
  - Chart uploads stored locally outside the web root (`./data/uploads`) and served through authenticated endpoints
- **Data Portability & Local Backups:**
  - Full CSV export and JSON backup
  - Interactive CSV import with automatic column mapping and duplicate detection
  - One-command local backup and restore scripts
- **Future FYERS Integration Architecture:**
  - Decoupled `BrokerAdapter` interface and `NormalizedExecution` schema ready for automated sync

---

## 🛠 Technology Stack

- **Monorepo:** npm workspaces (`apps/web`, `apps/api`, `packages/shared`, `packages/financial-engine`)
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide icons, TanStack Query, React Hook Form, Zod, Recharts
- **Backend:** Node.js LTS, Fastify v5, TypeScript, Mongoose ODM, Zod, Pino structured logging
- **Database:** MongoDB Community Server (local) or embedded persistent engine (`./data/db`)
- **Testing:** Vitest, Fastify injection integration testing

---

## 🚀 Quick Start Guide (Local MacBook Setup)

### 1. Prerequisites
- **Node.js:** v20.0.0 or higher (`node -v`)
- **npm:** v10.0.0 or higher (`npm -v`)
- **macOS:** Apple Silicon or Intel MacBook

### 2. Install Dependencies
Clone the repository and install all workspace packages:

```bash
cd "Trading Vault"
npm install
```

### 3. Seed Demo Trading Records (Optional)
Populate your local journal with realistic demo Indian stock, F&O, and MCX commodity trades:

```bash
npm run db:seed
```

**Demo Account Credentials:**
- **Email:** `trader@tradevault.local`
- **Password:** `TradeVault@123`

### 4. Start Development Server
Launch both the Fastify backend API (port 4000) and the Vite frontend (port 5173) concurrently:

```bash
npm run dev
```

Open your browser at **[http://localhost:5173](http://localhost:5173)** to start using TradeVault.

---

## 🧪 Testing

Execute comprehensive unit and integration test suites:

```bash
# Run standalone financial engine calculation tests (40 unit tests)
npm run test:engine

# Run Fastify API integration tests (79 endpoint and regression tests)
npm run test:api

# Run all test suites across the monorepo (119 tests)
npm run test
```

---

## 📦 Production Build

```bash
npm run build
```

This compiles:
1. `@tradevault/shared` TypeScript definitions
2. `@tradevault/financial-engine` decimal calculation library
3. `@tradevault/api` Fastify backend to `./apps/api/dist/`
4. `@tradevault/web` optimized production bundle to `./apps/web/dist/`

---

## 💾 Local Backups and Restoration

```bash
# Create a full local backup of database collections and screenshots
npm run db:backup

# Restore your journal from the latest local backup
npm run db:restore
```

---

## 🐳 Optional Docker Setup

If you prefer running MongoDB Community Server inside Docker, a container configuration is provided:

```bash
# Start local MongoDB bound strictly to 127.0.0.1:27017
docker compose up -d

# Start backend and frontend
npm run dev
```

---

## 📄 Licensing & Privacy

- Core application code is licensed under the **MIT License**.
- No paid subscriptions, commercial UI kits, or cloud databases are required.
- Trading data is maintained strictly on your local machine.
- For complete dependency license details, see [`docs/LICENSE_INVENTORY.md`](docs/LICENSE_INVENTORY.md).
