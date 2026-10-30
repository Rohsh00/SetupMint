# SetupMint — Configuration & Environment Variables Specification

This document details all configuration options, environment variables, default values, and operational settings used across **SetupMint** in its cloud-only architecture.

---

## 1. Environment Configuration Template (`.env.example`)

The baseline template is located at [`.env.example`](file:///Users/komal/projects/Trading%20Vault/.env.example):

```dotenv
# ==========================================
# SetupMint Environment Configuration (Cloud-Only)
# ==========================================

# Server Settings
PORT=4000
HOST=127.0.0.1
NODE_ENV=development

# Database Settings (MongoDB Atlas — Required)
MONGODB_URI=mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER>.mongodb.net/tradevault?retryWrites=true&w=majority

# Cloudflare R2 / S3 Object Storage (Required)
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=setupmint
S3_ACCESS_KEY_ID=<YOUR_R2_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<YOUR_R2_SECRET_ACCESS_KEY>
S3_PREFIX=journal-charts

# Multipart Upload Limits
MAX_FILE_SIZE_MB=10

# Session & Security Settings
SESSION_SECRET=<your-32-character-session-secret>
TOKEN_ENCRYPTION_KEY=<your-32-character-broker-token-encryption-key>
COOKIE_DOMAIN=
CORS_ORIGIN=http://localhost:5173
WEB_APP_URL=http://localhost:5173

# Persistent Session Lifetimes (Sliding & Absolute)
SESSION_IDLE_DAYS=90
SESSION_ABSOLUTE_DAYS=365
SESSION_RENEW_THRESHOLD=0.5

# Default User Currency
DEFAULT_BASE_CURRENCY=INR

# Optional FYERS Integration
# App ID and Secret Key are configured per-user in Settings and encrypted at rest.
FYERS_API_BASE=https://api-t1.fyers.in/api/v3
FYERS_REDIRECT_URI=http://127.0.0.1:4000/api/v1/integrations/fyers/callback
FYERS_FUNDS_DRIFT_TOLERANCE=1
FYERS_FUNDS_SYNC_ENABLED=true

# Optional Angel One SmartAPI Integration (Market Data Historical Candles Fallback Only)
# API Key, Client Code, and PIN are configured per-user in Settings and encrypted at rest (AES-256-GCM).
ANGEL_ONE_API_BASE=https://apiconnect.angelone.in
ANGEL_ONE_DAILY_BUDGET=500
ANGEL_ONE_INSTRUMENT_MASTER_URL=https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json

# ==========================================
# Scheduled Off-Site Backup Pipeline
# ==========================================
BACKUP_ENCRYPTION_KEY=<your-32-character-backup-encryption-key>
BACKUP_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
BACKUP_S3_REGION=auto
BACKUP_S3_BUCKET=setupmint-backups
BACKUP_S3_ACCESS_KEY_ID=<YOUR_BACKUP_R2_ACCESS_KEY_ID>
BACKUP_S3_SECRET_ACCESS_KEY=<YOUR_BACKUP_R2_SECRET_ACCESS_KEY>
BACKUP_S3_PREFIX=setupmint-backups
BACKUP_RETAIN_DAILY=30
BACKUP_RETAIN_MONTHLY=12
BACKUP_MAX_DROP_PERCENT=10

# Optional Failure Alerts (disabled when unset)
BACKUP_ALERT_TELEGRAM_BOT_TOKEN=
BACKUP_ALERT_TELEGRAM_CHAT_ID=
```

---

## 2. Environment Variables Reference

| Variable Name | Required | Default in Code | Purpose | Security Guidance |
| :--- | :--- | :--- | :--- | :--- |
| `MONGODB_URI` | **Yes** | None (Throws if missing) | MongoDB Atlas connection string (`mongodb+srv://`). Local MongoDB is rejected. | Remember to URL-encode special characters in password (e.g. `@` -> `%40`). Never commit credentials to git. |
| `S3_ENDPOINT` | **Yes** | None (Throws if missing) | Cloudflare R2 S3-compatible endpoint (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`). | Must be private. Never enable public development URLs on the bucket. |
| `S3_REGION` | No | `'auto'` | S3 region identifier for Cloudflare R2. | Default is `auto`. |
| `S3_BUCKET` | **Yes** | None (Throws if missing) | Name of the private Cloudflare R2 bucket (`setupmint`). | Ensure bucket access permissions are restricted. |
| `S3_ACCESS_KEY_ID` | **Yes** | None (Throws if missing) | Cloudflare R2 API token Access Key ID. | Stored exclusively in untracked `.env`. |
| `S3_SECRET_ACCESS_KEY` | **Yes** | None (Throws if missing) | Cloudflare R2 API token Secret Access Key. | Stored exclusively in untracked `.env`. Never logged or output. |
| `S3_PREFIX` | No | `''` | Optional prefix / directory within the bucket (e.g. `journal-charts`). | Trailing and leading slashes are automatically sanitized. |
| `MAX_FILE_SIZE_MB` | No | `10` | Maximum allowable file size per uploaded screenshot. | Enforced by `@fastify/multipart` buffer limit. |
| `PORT` | No | `4000` | Port on which the Fastify backend API listens. | Bind to local port. |
| `HOST` | No | `'127.0.0.1'` | Network interface binding. | Set to `127.0.0.1` for local privacy. Avoid `0.0.0.0` unless running behind a reverse proxy. |
| `NODE_ENV` | No | `'development'` | Runtime environment (`development`, `production`, `test`). | In production, pretty-logging is disabled and secure cookie flags are enforced. |
| `SESSION_SECRET` | Conditionally in Prod | Dev fallback outside prod | Secret key used for signing cookies. | **Fail-fast in production:** If `NODE_ENV=production`, must be set, cannot be default, and must be >= 32 characters or startup aborts immediately. |
| `TOKEN_ENCRYPTION_KEY` | Conditionally in Prod | Dev fallback outside prod | AES-256-GCM key material for encrypting FYERS secrets and tokens. | **Fail-fast in production:** If `NODE_ENV=production`, must be set, cannot be default, and must be >= 32 characters. Rotating it requires re-entering broker credentials. |
| `WEB_APP_URL` | No | `http://localhost:5173` | Frontend origin used for OAuth callback redirects. | Set to the public frontend URL in production. |
| `FYERS_API_BASE` | No | `https://api-t1.fyers.in/api/v3` | FYERS API base URL. | Keep the official endpoint unless testing against a sanctioned sandbox. |
| `FYERS_REDIRECT_URI` | No | `http://127.0.0.1:4000/api/v1/integrations/fyers/callback` | OAuth callback URL registered in the FYERS dashboard. | Must exactly match the FYERS dashboard setting. |
| `FYERS_FUNDS_DRIFT_TOLERANCE` | No | `1` | Allowed ₹ drift before a reconciliation suggestion. | Must be a non-negative number. |
| `FYERS_FUNDS_SYNC_ENABLED` | No | `true` | Enables/disables FYERS funds sync. | Set `false` to disable funds sync without deleting credentials. |
| `ANGEL_ONE_API_BASE` | No | `https://apiconnect.angelone.in` | SmartAPI endpoint base URL for market data historical candles. | Fixed allowlisted base URL. No user-supplied URLs permitted. |
| `ANGEL_ONE_DAILY_BUDGET` | No | `500` | Default daily historical candle API call quota per user. | Validated in `validateConfig()` (bounded between 1 and 5,000 calls). |
| `ANGEL_ONE_INSTRUMENT_MASTER_URL` | No | `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json` | Public Angel One Scrip Master JSON download URL. | Fixed allowlisted URL. |
| `COOKIE_DOMAIN` | No | `''` (omitted on localhost) | Domain scope for session cookies. | **Crucial:** Omit or leave empty for `localhost` / `127.0.0.1` because modern browsers reject `Domain=localhost`. Set to `.yourdomain.com` in production. |
| `SESSION_IDLE_DAYS` | No | `90` | Sliding session lifetime in days. | Session expiry extends when active and idle remaining < 50%. |
| `SESSION_ABSOLUTE_DAYS` | No | `365` | Hard upper limit on session age in days from creation. | Forces re-authentication after 1 year regardless of activity. |
| `SESSION_RENEW_THRESHOLD` | No | `0.5` | Fractional remaining idle lifetime threshold that triggers sliding renewal. | Prevents DB write overhead on every request; renews when < 50% idle time remains. |
| `CORS_ORIGIN` | No | `'http://localhost:5173'` | Allowed origin for Cross-Origin Resource Sharing. | Restrict strictly to the frontend web origin. |
| `DEFAULT_BASE_CURRENCY` | No | `'INR'` | Baseline currency used for new registrations. | Standard currency code (e.g. `INR`, `USD`). |
| `BACKUP_ENCRYPTION_KEY` | For Backups | None (>= 32 chars required) | AES-256-GCM encryption key material for scheduled off-site backups. | Store in password manager. If lost, encrypted backups cannot be recovered. |
| `BACKUP_S3_ENDPOINT` | For Backups | None (Throws if missing) | Secondary off-site Cloudflare R2 / S3 endpoint. | Must point to secondary backup account/endpoint. |
| `BACKUP_S3_BUCKET` | For Backups | None (Throws if missing) | Secondary off-site backup bucket (`setupmint-backups`). | **Strict isolation:** Must be different from primary live `S3_BUCKET`. |
| `BACKUP_S3_ACCESS_KEY_ID` | For Backups | None (Throws if missing) | API token access key ID for secondary backup bucket. | Dedicated token scoped to backup bucket. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | For Backups | None (Throws if missing) | API token secret access key for secondary backup bucket. | Never logged or printed. |
| `BACKUP_S3_REGION` | No | `'auto'` | Region for secondary off-site backup S3 bucket. | Default is `auto`. |
| `BACKUP_S3_PREFIX` | No | `'setupmint-backups'` | Key prefix in off-site bucket. | Default is `setupmint-backups`. |
| `BACKUP_RETAIN_DAILY` | No | `30` | Number of daily backup archives preserved before rotation. | Minimum of 3 always kept. |
| `BACKUP_RETAIN_MONTHLY` | No | `12` | Number of 1st-of-month backup archives preserved. | Preserves yearly historical checkpoints. |
| `BACKUP_MAX_DROP_PERCENT` | No | `10` | Percentage drop in records triggering `SUSPICIOUS` status. | Prevents corrupted/emptied runs from rotating good backups. |
| `BACKUP_ALERT_TELEGRAM_BOT_TOKEN` | No | None (Disabled) | Optional Telegram bot token for failure alerts. | Only sends status on `FAILED` or `SUSPICIOUS`. |
| `BACKUP_ALERT_TELEGRAM_CHAT_ID` | No | None (Disabled) | Optional Telegram chat ID receiving failure alerts. | Never transmits raw trading data. |
| `TELEGRAM_DEFAULT_BOT_TOKEN` | No | None (Disabled) | Optional system-level fallback bot token for unlinked `/start` onboard replies. | Primary bot tokens are configured per-user in UI Settings. |

---

## 3. Configuration & Startup Fail-Fast Guarantees

1. **Production Session Secret Validation:**
   `apps/api/src/config.ts` exports `validateConfig()` executed on startup in `buildApp()`. When `NODE_ENV === 'production'`, the server verifies `SESSION_SECRET` is set, is not the development fallback string, and contains at least 32 characters. Missing or weak secrets trigger an immediate exit (`process.exit(1)`).
2. **Broker Token Encryption Validation:**
   In production, `validateConfig()` also requires `TOKEN_ENCRYPTION_KEY` to be set, non-default, and at least 32 characters. It also validates that `FYERS_FUNDS_DRIFT_TOLERANCE` is non-negative.
3. **MongoDB Atlas Enforced:**
   `apps/api/src/db/connection.ts` validates that `MONGODB_URI` starts with `mongodb+srv://` or contains `.mongodb.net`. If missing or invalid, the server throws immediately. On network connection failure, only the host is logged and the process terminates non-zero.
4. **Cloudflare R2 Enforced:**
   `apps/api/src/storage/index.ts` verifies that `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are all present. If any is missing, it throws immediately. At server startup, `S3Storage.healthCheck()` tests read/write access to Cloudflare R2.
5. **No Local Disk Fallbacks:**
   `UPLOAD_DIR` and disk directory creation have been permanently removed. All uploads stream directly to and from Cloudflare R2 through authenticated proxy endpoints.
6. **Secondary Off-Site Backup Bucket Isolation:**
   When backup configuration is present, `validateConfig()` asserts that `BACKUP_S3_BUCKET !== S3_BUCKET` on the same endpoint, preventing accidental overwrite of live screenshots. `BACKUP_ENCRYPTION_KEY` is validated to contain at least 32 characters.

