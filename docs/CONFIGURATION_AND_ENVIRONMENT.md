# SetupMint — Configuration & Environment Variables Specification

This document details all configuration options, environment variables, default values, and operational settings used across **SetupMint**.

---

## 1. Environment Configuration Template (`.env.example`)

The baseline template is located at [`.env.example`](file:///Users/komal/projects/Trading%20Vault/.env.example):

```dotenv
# ==========================================
# SetupMint Environment Configuration
# ==========================================

# Server Settings
PORT=4000
HOST=127.0.0.1
NODE_ENV=development

# Database Settings
# Local MongoDB connection URI. Defaults to localhost.
MONGODB_URI=mongodb://127.0.0.1:27017/tradevault

# Session & Security
# Change this secret key in production! (Must be at least 32 characters)
SESSION_SECRET=<your-32-character-session-secret-encryption-key>
COOKIE_DOMAIN=localhost
CORS_ORIGIN=http://localhost:5173

# File Upload Settings
# Private directory where screenshot charts and attachments are kept locally
UPLOAD_DIR=./data/uploads
MAX_FILE_SIZE_MB=10

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
| `PORT` | No | `4000` | Port on which the Fastify backend API listens. | Bind to local port. |
| `HOST` | No | `'127.0.0.1'` | Network interface binding. | Set to `127.0.0.1` for local privacy. Avoid `0.0.0.0` unless running behind a reverse proxy. |
| `NODE_ENV` | No | `'development'` | Runtime environment (`development`, `production`, `test`). | In production, pretty-logging is disabled and secure cookie flags are enforced. |
| `MONGODB_URI` | No | `'mongodb://127.0.0.1:27017/tradevault'` | MongoDB connection string. | Use credentials if connecting to an external production MongoDB instance. |
| `SESSION_SECRET` | No | Fallback dev string | Secret key used for signing cookies. | **Must be changed in production** to a random string of at least 32 characters. |
| `COOKIE_DOMAIN` | No | `'localhost'` | Domain scope for session cookies. | Set to domain name in production deployments. |
| `CORS_ORIGIN` | No | `'http://localhost:5173'` | Allowed origin for Cross-Origin Resource Sharing. | Restrict strictly to the frontend web origin. |
| `UPLOAD_DIR` | No | `'./data/uploads'` | Path on disk where private chart attachments are stored. | Ensure this directory is excluded from git and backed up regularly. |
| `MAX_FILE_SIZE_MB` | No | `10` | Maximum allowable file size per uploaded screenshot. | Enforced by `@fastify/multipart`. |
| `DEFAULT_BASE_CURRENCY` | No | `'INR'` | Baseline currency used for new registrations. | Standard currency code (e.g. `INR`, `USD`). |

---

## 3. Configuration Module Loading Logic

The backend loads configuration in [`apps/api/src/config.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/config.ts):
1. Loads `.env` from workspace root via `path.resolve(process.cwd(), '.env')`.
2. Fallbacks are automatically provided for every variable, allowing the application to boot cleanly in local development without requiring manual `.env` file creation.
3. Automatically ensures the private `UPLOAD_DIR` directory exists on disk during server initialization:
   ```typescript
   if (!fs.existsSync(config.uploadDir)) {
     fs.mkdirSync(config.uploadDir, { recursive: true });
   }
   ```
