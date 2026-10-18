# SetupMint — Local Setup & Developer Guide

This guide provides practical instructions for setting up, developing, testing, and troubleshooting **SetupMint** on your local machine (macOS, Linux, or Windows).

---

## 1. System Prerequisites

Before running SetupMint, verify that your environment meets the engine requirements:
- **Node.js:** `v20.0.0` or higher (`node -v`)
- **npm:** `v10.0.0` or higher (`npm -v`)
- **Git:** Installed and configured
- **Operating System:** macOS (Apple Silicon or Intel), Linux (Ubuntu/Debian/Fedora), or Windows (WSL2 recommended)
- **Optional:** Docker Desktop (if you prefer running MongoDB in a container)

---

## 2. Quick Setup (Under 2 Minutes)

### Step 1: Clone and Install Monorepo Dependencies
Navigate to the project root and install all dependencies across all workspaces:

```bash
cd "Trading Vault"
npm install
```

### Step 2: Environment Configuration
Copy the template configuration file:

```bash
cp .env.example .env
```
*(The default settings in `.env.example` work out-of-the-box for local development.)*

### Step 3: Populate Demo Trading Records (Optional but Recommended)
Populate your local journal with realistic demo Indian stock, F&O, and MCX commodity trades:

```bash
npm run db:seed
```

**Demo Account Credentials:**
- **Email:** `trader@tradevault.local`
- **Password:** `TradeVault@123`

### Step 4: Start Development Servers
Launch both the Fastify API server (port 4000) and the Vite frontend (port 5173) concurrently:

```bash
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser to begin using SetupMint.
API documentation is available at **[http://localhost:4000/api/docs](http://localhost:4000/api/docs)**.

---

## 3. Database Options: Embedded vs. Docker

SetupMint supports two database modes:

### Option A: Zero-Config Embedded Database (Default)
You do **not** need to install or run MongoDB manually.
If no external MongoDB daemon is detected on port 27017, the application automatically launches an embedded MongoDB engine (`mongodb-memory-server`) with local persistence enabled in `./apps/api/data/db`. Your data is permanently preserved across server restarts.

### Option B: Docker Containerized MongoDB (Optional)
If you prefer running a dedicated MongoDB 7.0 container:

```bash
# Start MongoDB container bound to 127.0.0.1:27017
docker compose up -d

# Check container status
docker compose ps
```

---

## 4. Primary Monorepo Scripts Reference

All commands are executed from the repository root:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs Fastify backend and Vite frontend concurrently with live reloading. |
| `npm run build` | Compiles `@tradevault/shared`, `@tradevault/financial-engine`, backend API, and frontend bundle. |
| `npm run test` | Executes all Vitest test suites (financial engine unit tests + API integration tests). |
| `npm run test:engine` | Runs standalone mathematical unit tests for `@tradevault/financial-engine` (33 tests). |
| `npm run test:api` | Runs Fastify API integration, regression, and attachment test suites (69 tests). |
| `npm run typecheck` | Validates TypeScript types across all 4 packages (`shared`, `financial-engine`, `api`, `web`). |
| `npm run db:seed` | Populates database with default active-trader demo profile. |
| `npm run seed:reset` | Wipes only demo user records (`trader@tradevault.local`), preserving real users. |
| `npm run seed:validate`| Executes 10 automated assertion checks validating demo data integrity. |
| `npm run db:backup` | Dumps database collections to JSON and copies chart images to `./backups/`. |
| `npm run db:restore` | Restores database collections and chart images from the latest local backup. |
| `npm run db:reconcile` | Recalculates and persists authoritative balances across all accounts. |

---

## 5. Seeding Specific Trader Profiles

To test specific market scenarios, supply arguments to `npm run db:seed`:

```bash
# Profile A: Beginner Trader (35 trades, simple executions)
npm run db:seed -- --profile=beginner --density=minimal

# Profile C: Options Specialist (500+ trades, NIFTY/BANKNIFTY CE/PE)
npm run db:seed -- --profile=options-specialist --density=rich

# Profile D: MCX Commodity Trader (Crude Oil, Natural Gas, Gold)
npm run db:seed -- --profile=commodity-trader --density=standard

# Profile F: Psychology & Discipline (FOMO, revenge trading, mistake flags)
npm run db:seed -- --profile=psychology --density=standard

# Profile H: Edge Cases & Boundaries (Breakeven streaks, zero loss days)
npm run db:seed -- --profile=edge-cases --density=minimal
```

---

## 6. Troubleshooting Common Issues

### 1. Port 4000 or 5173 Already in Use
If another process holds port 4000:
```bash
# Find process on port 4000
lsof -i :4000
# Terminate process
kill -9 <PID>
```

### 2. Lock File in Embedded Database (`mongod.lock`)
If the server crashed abruptly and an embedded instance left a lock file:
```bash
# Remove stale lock file
rm -f ./apps/api/data/db/mongod.lock
```

### 3. Session Cookies Not Saved
Verify that your browser allows cookies on `localhost`. Ensure `CORS_ORIGIN` in `.env` matches your browser URL (`http://localhost:5173`).
