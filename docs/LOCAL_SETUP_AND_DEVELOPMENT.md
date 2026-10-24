# SetupMint — Local Setup & Developer Guide

This guide provides practical instructions for setting up, developing, testing, and operating **SetupMint** in its cloud-only architecture (MongoDB Atlas + Cloudflare R2).

---

## 1. System Prerequisites

Before running SetupMint, verify that your environment meets the engine requirements:
- **Node.js:** `v20.0.0` or higher (`node -v`)
- **npm:** `v10.0.0` or higher (`npm -v`)
- **Git:** Installed and configured
- **Internet Access:** Persistent connection required to communicate with MongoDB Atlas and Cloudflare R2.
- **MongoDB Atlas Cluster:** A free (M0) or paid MongoDB Atlas cluster with your local public IP whitelisted in Atlas Network Access.
- **Cloudflare R2 Bucket:** A private bucket (`setupmint`) with S3 API tokens (Access Key ID & Secret Access Key).

---

## 2. Quick Setup

### Step 1: Clone and Install Monorepo Dependencies
Navigate to the project root and install all workspace dependencies:

```bash
cd "Trading Vault"
npm install
```

### Step 2: Environment Configuration
Copy the template configuration file:

```bash
cp .env.example .env
```

Open `.env` and fill in your cloud credentials:
- `MONGODB_URI` — Atlas connection URI (e.g. `mongodb+srv://<USER>:<PASSWORD>@<CLUSTER>.mongodb.net/tradevault?retryWrites=true&w=majority`)
- `S3_ENDPOINT` — Cloudflare R2 endpoint (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)
- `S3_BUCKET` — `setupmint`
- `S3_ACCESS_KEY_ID` — Your R2 API Token Access Key ID
- `S3_SECRET_ACCESS_KEY` — Your R2 API Token Secret Access Key

### Step 3: Populate Demo Trading Records (Optional)
Populate your Atlas database and R2 bucket with realistic demo Indian stock, F&O, and MCX commodity trades:

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

## 3. Cloud-Only Architecture (Zero Fallbacks)

SetupMint operates in a **strictly cloud-native mode**:
- **Database:** MongoDB Atlas is the sole database target. All legacy fallbacks (local mongod, embedded WiredTiger, `current_uri.txt`, process inspection) have been removed.
- **Storage:** Cloudflare R2 is the sole attachment storage target. All uploads are validated via in-memory magic-byte inspection before being saved directly to R2.
- **Fail-Fast Startup:** If Atlas or R2 is unreachable or misconfigured, the server logs only the target host/bucket (never passwords) and terminates immediately with a non-zero exit code.

---

## 4. Primary Monorepo Scripts Reference

All commands are executed from the repository root:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs Fastify backend and Vite frontend concurrently with live reloading. |
| `npm run build` | Compiles `@tradevault/shared`, `@tradevault/financial-engine`, backend API, and frontend bundle. |
| `npm run test` | Executes all Vitest test suites (319 tests: 135 financial engine + 184 API). |
| `npm run test:engine` | Runs standalone mathematical unit tests for `@tradevault/financial-engine` (135 tests). |
| `npm run test:api` | Runs Fastify API integration, regression, storage, strategy-variant, and attachment test suites (184 tests). |
| `npm run typecheck` | Validates TypeScript types across all 4 packages (`shared`, `financial-engine`, `api`, `web`). |
| `npm run migrate:cloud` | Runs one-time migration of local data to Atlas and R2 (`--dry-run` default). |
| `npm run db:seed` | Populates Atlas and R2 with default active-trader demo profile. |
| `npm run seed:reset` | Wipes demo user records (`trader@tradevault.local`) from Atlas and removes demo R2 objects. |
| `npm run seed:validate`| Executes automated assertion checks validating demo data integrity. |
| `npm run db:backup` | Dumps Atlas collections to JSON and downloads R2 screenshots to `./backups/`. |
| `npm run db:restore` | Restores Atlas collections and uploads screenshots to R2 (requires `--yes-i-am-sure`). |
| `npm run db:reconcile` | Authoritatively recalculates and persists ledger balances on Atlas. |
| `npm run accounts:backfill` | Dry-runs the account/broker migration; add `-- --yes` to drop the legacy mapping index, backfill fields, encrypt plaintext broker secrets, and recalculate balances. |

---

## 5. Troubleshooting Common Issues

### 1. Atlas Connection Failure / IP Whitelist Error
If the server reports:
```text
Could not connect to any servers in your MongoDB Atlas cluster...
```
- Open MongoDB Atlas Dashboard -> **Security** -> **Network Access**.
- Add your current IP address (or `0.0.0.0/0` for universal development access).
- Ensure your database password does not contain unencoded special characters (e.g. encode `@` as `%40`).

### 2. Cloudflare R2 Configuration Error
If the server reports:
```text
Cloudflare R2 (S3) configuration missing: [S3_ENDPOINT, S3_BUCKET, ...]
```
- Check that your `.env` contains `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- Verify your R2 API Token has **Object Read & Write** permissions.

### 3. Port 4000 or 5173 Already in Use
If another process holds port 4000:
```bash
lsof -i :4000
kill -9 <PID>
```

### 4. Session Cookies Not Saved
Verify that your browser allows cookies on `localhost`. Ensure `CORS_ORIGIN` in `.env` matches your browser URL (`http://localhost:5173`).
