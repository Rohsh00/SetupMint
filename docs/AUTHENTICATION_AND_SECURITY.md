# SetupMint — Authentication & Security Specification

This document details the security architecture, authentication mechanisms, data ownership enforcement, input sanitization, and threat mitigation measures implemented in **SetupMint**.

---

## 1. Authentication Architecture

SetupMint implements **stateful session-based authentication** using cryptographic random tokens and HttpOnly cookies:

```mermaid
graph TD
    Client["Browser Client"] -->|1. Credentials (email, password)| LoginEndpoint["POST /api/v1/auth/login"]
    LoginEndpoint --> HashCheck{"bcrypt.compare(password, passwordHash)"}
    HashCheck -->|Mismatch| Reject["401 INVALID_CREDENTIALS"]
    HashCheck -->|Match| GenToken["crypto.randomBytes(32).toString('hex')"]
    GenToken --> SaveSession["Session.create({ userId, token, expiresAt: +30d })"]
    SaveSession --> SetCookie["Set-Cookie: tv_session=<token>\nHttpOnly, SameSite=Lax, Path=/"]
    SetCookie --> Client
```

### Security Properties of the Session System:
1. **HttpOnly Cookie (`tv_session`):** Prevents client-side JavaScript (e.g. from XSS vulnerabilities) from accessing or stealing authentication tokens.
2. **SameSite=Lax:** Protects against Cross-Site Request Forgery (CSRF) on cross-origin requests.
3. **Automatic TTL Expiration:** Sessions expire automatically after 30 days via a MongoDB native Time-To-Live (TTL) index (`{ expiresAt: 1 }, { expires: '30d' }`).
4. **Dual Auth Transport:** In addition to cookies, the server supports the standard `Authorization: Bearer <token>` header to accommodate external script automation.
5. **Password Hashing:** Passwords are never stored in plaintext. They are hashed using **bcryptjs** with a cost factor of 10 rounds before insertion.

---

## 2. Authorization & Tenant Isolation

SetupMint enforces **strict tenant data ownership**:
- **Ownership Invariant:** Every user-created record (`TradingAccount`, `Trade`, `DailyJournal`, `Strategy`, `Attachment`, `AccountTransaction`) includes a required `userId: ObjectId` foreign key.
- **Middleware Guard (`requireAuth`):** Validates the session token, verifies that the session is unexpired, loads the user record into `req.user`, and rejects unauthorized requests with `401 UNAUTHORIZED`.
- **Query Scoping:** Every database read, update, and delete operation includes `{ userId: req.user.id }` in the MongoDB query filter:
  ```typescript
  // Example from trade.routes.ts:
  const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.id });
  ```
  If a user attempts to access an ID that exists but belongs to another trader, the server returns `404 NOT_FOUND` rather than leaking information about other users' data.

---

## 3. Rate Limiting & Brute-Force Mitigation

Configured via `@fastify/rate-limit` in [`apps/api/src/server.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/server.ts#L59-L63):

1. **Global Rate Limit:** 1,200 requests per minute per IP address to mitigate Denial of Service (DoS) attacks.
2. **Strict Auth Endpoint Rate Limits:**
   - `POST /api/v1/auth/register`: Limited to **15 requests per minute**.
   - `POST /api/v1/auth/login`: Limited to **15 requests per minute**.
   Mitigates credential stuffing and brute-force password cracking attacks.

---

## 4. Input Validation & Injection Defense

1. **Shared Zod Schemas:** All request payloads are validated at runtime using strict Zod schemas (`registerSchema`, `createTradeSchema`, `createAccountSchema`, etc.). Unexpected or malicious fields are rejected with `400 VALIDATION_ERROR`.
2. **Parameter Sanitization:** Route parameters representing ObjectIds (e.g., `:id`, `:tradeId`) are validated through [`validateObjectIdParam`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/middleware/validate.ts) using `mongoose.Types.ObjectId.isValid()`, preventing malformed queries from causing unhandled exceptions.
3. **NoSQL Injection Prevention:** Mongoose schema compilation and explicit type casting protect against MongoDB operator injection attacks (e.g. `{ $ne: null }`).

---

## 5. File Upload Security & Magic-Bytes Verification

Chart screenshot uploads are guarded against malicious file execution in [`apps/api/src/routes/attachment.routes.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/routes/attachment.routes.ts):

1. **Magic-Bytes File Signature Verification:** The server reads the initial 12 bytes of uploaded files to verify true file format headers:
   - **PNG:** `89 50 4E 47 0D 0A 1A 0A`
   - **JPEG:** `FF D8 FF`
   - **WebP:** `RIFF....WEBP`
   *If the binary signature does not match the image header, the file is immediately unlinked from disk and rejected with `400 INVALID_IMAGE_SIGNATURE`.*
2. **Server-Generated Filenames:** Uploaded files are renamed using `crypto.randomUUID() + ext`. The original client-provided filename is stored solely as a display string in the database and is never used in filesystem paths, eliminating **path traversal** vulnerabilities (`../../`).
3. **Isolated Upload Directory:** Attachments are stored in `./data/uploads` outside the web root and are never served directly as static files. They are streamed strictly through authenticated endpoints (`/api/v1/attachments/:id/download`).
4. **Per-Trade Attachment Cap:** A hard limit of **12 attachments per trade** is enforced to prevent disk-exhaustion attacks.

---

## 6. Secrets Management & Log Redaction

1. **Environment Variables:** All secrets (`SESSION_SECRET`, `MONGODB_URI`, broker keys) are supplied via environment variables (`.env`).
2. **Pino Structured Log Redaction:** In [`apps/api/src/server.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/server.ts#L30), the logger automatically redacts sensitive headers and fields:
   ```typescript
   redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password', 'req.body.token']
   ```
3. **Sanitized Error Responses:** The Fastify central error handler catches unhandled exceptions and returns a generic message (`"An unexpected internal error occurred. Your trading data is secure."`), preventing stack traces or database connection strings from leaking to the client in production.
