# SetupMint — Authentication & Security Specification

This document details the security architecture, authentication mechanisms, data ownership enforcement, input sanitization, and threat mitigation measures implemented in **SetupMint**.

---

## 1. Authentication Architecture & Persistent Sessions

SetupMint implements **production-grade stateful session-based authentication** with cryptographic token hashing, sliding session renewal, hard absolute lifetime caps, and secure HttpOnly cookies:

```mermaid
graph TD
    Client["Browser Client"] -->|1. Credentials (email, password)| LoginEndpoint["POST /api/v1/auth/login"]
    LoginEndpoint --> HashCheck{"bcrypt.compare(password, passwordHash)"}
    HashCheck -->|Mismatch| Reject["401 INVALID_CREDENTIALS"]
    HashCheck -->|Match| GenToken["Raw Token: crypto.randomBytes(32).toString('hex')"]
    GenToken --> HashToken["SHA-256 Hash: crypto.createHash('sha256').update(raw).digest('hex')"]
    HashToken --> SaveSession["Session.create({\n  userId,\n  tokenHash,\n  expiresAt: now + 90d (idle),\n  absoluteExpiresAt: now + 365d (hard cap),\n  lastUsedAt: now\n})"]
    SaveSession --> SetCookie["Set-Cookie: tv_session=<rawToken>\nHttpOnly, SameSite=Lax, Path=/\nmaxAge=7776000 (90d), expires=<Date>\nSecure (in production)"]
    SetCookie --> Client
```

### 1.1 Sliding Session Renewal (`requireAuth`)
- **Sliding Idle Window:** Configurable via `SESSION_IDLE_DAYS` (default: **90 days**).
- **Absolute Lifetime Cap:** Configurable via `SESSION_ABSOLUTE_DAYS` (default: **365 days**). Regardless of sliding activity, sessions cannot exceed 365 days from creation.
- **Lazy Renewal Threshold:** Configurable via `SESSION_RENEW_THRESHOLD` (default: **0.5 / 50%**).
  - To prevent continuous database write overhead on every single HTTP request, the session's `expiresAt` is only extended when the remaining idle lifetime drops below 50% of `SESSION_IDLE_DAYS`.
  - When threshold is crossed, `expiresAt = Math.min(now + 90 days, absoluteExpiresAt)`, `lastUsedAt = now`, and a fresh `Set-Cookie` header is issued to the client with the updated `maxAge` and `expires`.
- **Exact MongoDB TTL Deletion:** The Session model uses `{ expiresAt: 1 }, { expireAfterSeconds: 0 }` so MongoDB background threads purge expired sessions cleanly at `expiresAt`.

### 1.2 Hashed Token Storage (`tokenHash`)
- **Zero Raw Tokens in DB:** The database stores only the SHA-256 hex digest (`tokenHash`) of the 64-character random hex token. The raw token exists exclusively on the client in the `tv_session` HttpOnly cookie or the `Authorization: Bearer` header.
- **Lookup Process:** Incoming requests compute `crypto.createHash('sha256').update(rawToken).digest('hex')` and look up `{ tokenHash }`.
- **Seamless Migration (Option A):** If a session is not found by `tokenHash`, the authentication layer falls back to querying the legacy plaintext `{ token }` field. On first access, it generates the `tokenHash`, populates `absoluteExpiresAt`, unsets the plaintext `token`, and saves the document.

### 1.3 Cookie Security Configuration
- **Cookie Name:** `tv_session`
- **HttpOnly:** `true` (prevents JavaScript access and XSS token extraction).
- **SameSite:** `Lax` (protects against CSRF on third-party cross-origin requests).
- **Path:** `/` (available across all API routes).
- **Secure:** `true` when `NODE_ENV === 'production'` (HTTPS only).
- **Explicit Lifetime:** Both `maxAge` (in seconds) and `expires` (absolute GMT Date) are sent on login, registration, and renewal so browsers persist the cookie across browser restarts rather than treating it as a transient session cookie.
- **Cookie Domain:** In production, `COOKIE_DOMAIN` can specify the parent domain (e.g. `.setupmint.com`). For development (`localhost` / 127.0.0.1), the `Domain` attribute is explicitly omitted because browsers reject cookies with `Domain=localhost`.

### 1.4 Production Startup Fail-Fast (`SESSION_SECRET`)
To prevent session tampering, server restarts invalidating signed sessions, or insecure deployments, Fastify validates configuration on startup:
- In `NODE_ENV === 'production'`, `SESSION_SECRET` **must** be explicitly provided, must not be the fallback default, and must be at least 32 characters in length. If any check fails, the server throws an error and exits immediately (`process.exit(1)`).

---

## 2. Authorization & Tenant Isolation

SetupMint enforces **strict tenant data ownership**:
- **Ownership Invariant:** Every user-created record (`TradingAccount`, `Trade`, `DailyJournal`, `Strategy`, `Attachment`, `AccountTransaction`, `Session`) includes a required `userId: ObjectId` foreign key.
- **Middleware Guard (`requireAuth`):** Validates the session token, verifies that `now < expiresAt` and `now < absoluteExpiresAt`, loads the user record into `req.user`, attaches `req.sessionId`, and rejects unauthorized requests with `401 UNAUTHORIZED` or `SESSION_EXPIRED`.
- **Query Scoping:** Every database read, update, and delete operation includes `{ userId: req.user.id }` in the MongoDB query filter:
  ```typescript
  // Example from trade.routes.ts:
  const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
  ```
  If a user attempts to access an ID that exists but belongs to another trader, the server returns `404 NOT_FOUND` rather than leaking information about other users' data.

---

## 3. Device & Session Management Endpoints

All session management routes are authenticated and tenant-isolated:

1. **`GET /api/v1/auth/sessions`:**
   - Lists all active, non-expired sessions for the authenticated user.
   - Returns: `id`, `createdAt`, `lastUsedAt`, `userAgent`, `ipAddress`, and `isCurrent` (boolean indicating if it matches the current request's session).
   - **Privacy & Security:** Never returns `token` or `tokenHash`.
2. **`DELETE /api/v1/auth/sessions/:id`:**
   - Revokes a specific session device.
   - Validates `:id` via `validateObjectIdParam('id')`.
   - Returns `404 NOT_FOUND` if the session does not exist or belongs to another user.
3. **`POST /api/v1/auth/logout-all`:**
   - Revokes all active sessions for the user except the current active session (pass `{ includeCurrent: true }` to revoke all including current).
4. **Password Change Revocation (`POST /api/v1/settings/change-password`):**
   - Automatically revokes all *other* active sessions for the user (`_id: { $ne: req.sessionId }`), requiring re-authentication on other devices while keeping the current device logged in.

---

## 4. Rate Limiting & Brute-Force Mitigation

Configured via `@fastify/rate-limit` in [`apps/api/src/server.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/server.ts#L59-L63):

1. **Global Rate Limit:** 1,200 requests per minute per IP address to mitigate Denial of Service (DoS) attacks.
2. **Strict Auth Endpoint Rate Limits:**
   - `POST /api/v1/auth/register`: Limited to **15 requests per minute**.
   - `POST /api/v1/auth/login`: Limited to **15 requests per minute**.
   Mitigates credential stuffing and brute-force password cracking attacks.

---

## 5. Input Validation & Injection Defense

1. **Shared Zod Schemas:** All request payloads are validated at runtime using strict Zod schemas (`registerSchema`, `createTradeSchema`, `createAccountSchema`, etc.). Unexpected or malicious fields are rejected with `400 VALIDATION_ERROR`.
2. **Parameter Sanitization:** Route parameters representing ObjectIds (e.g., `:id`, `:tradeId`) are validated through [`validateObjectIdParam`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/middleware/validate.ts) using `mongoose.Types.ObjectId.isValid()`, preventing malformed queries from causing unhandled exceptions.
3. **NoSQL Injection Prevention:** Mongoose schema compilation and explicit type casting protect against MongoDB operator injection attacks (e.g. `{ $ne: null }`).

---

## 6. File Upload Security & Magic-Bytes Verification

Chart screenshot uploads are guarded against malicious file execution in [`apps/api/src/routes/attachment.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/attachment.routes.ts):

1. **Magic-Bytes File Signature Verification:** The server reads the initial 12 bytes of uploaded files to verify true file format headers:
   - **PNG:** `89 50 4E 47 0D 0A 1A 0A`
   - **JPEG:** `FF D8 FF`
   - **WebP:** `RIFF....WEBP`
   *If the binary signature does not match the image header, the file is immediately unlinked from disk and rejected with `400 INVALID_IMAGE_SIGNATURE`.*
2. **Server-Generated Filenames:** Uploaded files are renamed using `crypto.randomUUID() + ext`. The original client-provided filename is stored solely as a display string in the database and is never used in filesystem paths, eliminating **path traversal** vulnerabilities (`../../`).
3. **Cloud Object Storage (Cloudflare R2 / S3):** Screenshots are uploaded to object storage and never served directly as arbitrary executable files.
4. **Per-Trade Attachment Cap:** A hard limit of **12 attachments per trade** is enforced to prevent resource-exhaustion attacks.

---

## 7. Secrets Management & Log Redaction

1. **Environment Variables:** All secrets (`SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `MONGODB_URI`, R2 storage keys) are supplied via environment variables (`.env`). Production startup fails if the session or broker-encryption keys are missing, default, or shorter than 32 characters.
2. **Broker Secret Encryption:** FYERS app secrets, access tokens, and refresh tokens are encrypted at rest with AES-256-GCM using a key derived from `TOKEN_ENCRYPTION_KEY`. Encrypted values use an `enc:v1:iv:tag:ciphertext` envelope. `BrokerIntegration` serialization strips secrets/tokens, and OAuth state values are stored only as SHA-256 hashes with a 10-minute expiry.
3. **Pino Structured Log Redaction:** In [`apps/api/src/server.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/server.ts), sensitive tokens, credentials, and headers are redacted automatically, including `req.headers.cookie`, `req.headers.authorization`, `req.body.password`, `req.body.secretKey`, `req.body.appId`, `accessToken`, `refreshToken`, `req.query.auth_code`, and `req.query.code`.
4. **Sanitized Error Responses:** The Fastify central error handler catches unhandled exceptions and returns a generic message (`"An unexpected internal error occurred. Your trading data is secure."`), preventing stack traces or database connection strings from leaking to the client in production.
