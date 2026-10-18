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

# Session & Security
SESSION_SECRET=<your-32-character-session-secret-encryption-key>
COOKIE_DOMAIN=localhost
CORS_ORIGIN=http://localhost:5173

# Default User Currency
DEFAULT_BASE_CURRENCY=INR

# Optional Broker Integrations (Future Live Sync)
FYERS_APP_ID=<your-fyers-app-id>
FYERS_SECRET_KEY=<your-fyers-app-secret-key>
FYERS_REDIRECT_URI=http://127.0.0.1:4000/api/v1/integrations/fyers/callback
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
| `SESSION_SECRET` | No | Dev fallback string | Secret key used for signing cookies. | Must be changed in production to a random string of at least 32 characters. |
| `COOKIE_DOMAIN` | No | `'localhost'` | Domain scope for session cookies. | Set to domain name in production deployments. |
| `CORS_ORIGIN` | No | `'http://localhost:5173'` | Allowed origin for Cross-Origin Resource Sharing. | Restrict strictly to the frontend web origin. |
| `DEFAULT_BASE_CURRENCY` | No | `'INR'` | Baseline currency used for new registrations. | Standard currency code (e.g. `INR`, `USD`). |

---

## 3. Configuration & Startup Fail-Fast Guarantees

1. **MongoDB Atlas Enforced:**
   `apps/api/src/db/connection.ts` validates that `MONGODB_URI` starts with `mongodb+srv://` or contains `.mongodb.net`. If missing or invalid, the server throws immediately. On network connection failure, only the host is logged and the process terminates non-zero.
2. **Cloudflare R2 Enforced:**
   `apps/api/src/storage/index.ts` verifies that `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are all present. If any is missing, it throws immediately. At server startup, `S3Storage.healthCheck()` tests read/write access to Cloudflare R2.
3. **No Local Disk Fallbacks:**
   `UPLOAD_DIR` and disk directory creation have been permanently removed. All uploads stream directly to and from Cloudflare R2 through authenticated proxy endpoints.
