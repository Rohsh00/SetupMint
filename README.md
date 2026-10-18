# SetupMint — Professional Discretionary Trading Journal

A cloud-native, privacy-respecting trading journal application engineered for serious discretionary traders. Built with **React 19**, **Vite**, **MUI v9 + Tailwind CSS**, **Fastify v5**, **TypeScript**, **MongoDB Atlas**, and **Cloudflare R2**.

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
- **Private Cloud Chart Screenshots:**
  - Chart uploads stored in private Cloudflare R2 object storage and served exclusively through authenticated Fastify streaming endpoints
- **Data Portability & Cloud Backups:**
  - Full CSV export and JSON backup
  - Interactive CSV import with automatic column mapping and duplicate detection
  - One-command cloud backup and restore scripts for Atlas and R2
- **Broker Integration Architecture:**
  - Decoupled `BrokerAdapter` interface and `NormalizedExecution` schema ready for automated broker synchronization

---

## 🛠 Technology Stack

- **Monorepo:** npm workspaces (`apps/web`, `apps/api`, `packages/shared`, `packages/financial-engine`)
- **Frontend:** React 19, TypeScript, Vite, Material UI (MUI v9), Tailwind CSS, TanStack Query, React Hook Form, Zod, Recharts
- **Backend:** Node.js LTS, Fastify v5, TypeScript, Mongoose ODM, Zod, Pino structured logging
- **Database:** MongoDB Atlas cloud cluster (`mongodb+srv://`)
- **Storage:** Cloudflare R2 private bucket via S3 API (`@aws-sdk/client-s3`)
- **Testing:** Vitest, Fastify injection integration testing with isolated in-memory test mocks

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js:** v20.0.0 or higher (`node -v`)
- **npm:** v10.0.0 or higher (`npm -v`)
- **Internet Access:** Required for connecting to MongoDB Atlas and Cloudflare R2
- **MongoDB Atlas Cluster:** Dedicated free (M0) or paid Atlas cluster URI
- **Cloudflare R2 Bucket:** Private R2 bucket and S3 API credentials

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Atlas and Cloudflare R2 credentials:

```bash
cp .env.example .env
```

Ensure the following variables are set in `.env`:
- `MONGODB_URI` — Your Atlas connection string (URL-encode special characters in password)
- `S3_ENDPOINT` — `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- `S3_REGION` — `auto`
- `S3_BUCKET` — `setupmint`
- `S3_ACCESS_KEY_ID` — Your R2 API Token Access Key ID
- `S3_SECRET_ACCESS_KEY` — Your R2 API Token Secret Access Key

### 3. Install Dependencies
```bash
npm install
```

### 4. Seed Demo Trading Records (Optional)
Populate your Atlas journal and R2 bucket with realistic demo Indian stock, F&O, and MCX commodity trades:

```bash
npm run db:seed
```

**Demo Account Credentials:**
- **Email:** `trader@tradevault.local`
- **Password:** `TradeVault@123`

### 5. Start Development Server
Launch both the Fastify backend API (port 4000) and the Vite frontend (port 5173) concurrently:

```bash
npm run dev
```

Open your browser at **[http://localhost:5173](http://localhost:5173)** to start using SetupMint.

---

## 🧪 Testing

Execute comprehensive unit and integration test suites:

```bash
# Run standalone financial engine calculation tests (40 unit tests)
npm run test:engine

# Run Fastify API integration tests (104 endpoint, storage, and regression tests)
npm run test:api

# Run all test suites across the monorepo (144 tests)
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

## 💾 Cloud Backups and Restoration

```bash
# Create a full backup of Atlas database collections and Cloudflare R2 screenshots
npm run db:backup

# Restore your journal from a backup archive (requires explicit confirmation)
npm run db:restore -- --yes-i-am-sure
```

---

## 📄 Licensing & Privacy

- Core application code is licensed under the **MIT License**.
- Trading data is maintained strictly within your personal MongoDB Atlas database and Cloudflare R2 bucket.
- No third-party behavioral trackers or external telemetry are present.
- For complete dependency license details, see [`docs/LICENSE_INVENTORY.md`](docs/LICENSE_INVENTORY.md).
