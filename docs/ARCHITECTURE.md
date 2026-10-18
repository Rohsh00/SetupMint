# SetupMint — System Architecture Document

## 1. Overview & Vision
SetupMint (monorepo name: `tradevault-monorepo`) is a local-first, privacy-respecting trading journal built for serious discretionary traders. It provides deterministic financial metrics, risk management, psychological discipline tracking, and multi-asset capabilities (Indian Stocks & Indices, F&O, MCX Commodities, Forex, and Crypto).

---

## 2. Monorepo Organization
The repository is managed as an npm workspace monorepo:

```
tradevault/
  apps/
    api/                     # Fastify v5 REST API with Mongoose ODM
    web/                     # React 19 + Vite + Tailwind CSS frontend
  packages/
    shared/                  # TypeScript types, constants, presets, and Zod validation schemas
    financial-engine/        # Standalone, 100% deterministic decimal calculation engine
  scripts/                   # Backup and restore utilities
  docs/                      # Architecture, calculations, licensing, and integration documentation
  data/                      # Private disk storage for local database and screenshot attachments
  docker-compose.yml         # Optional local MongoDB container setup
  .env.example               # Secure local environment defaults
  package.json               # Root monorepo configuration
  README.md                  # Comprehensive user and developer manual
```

---

## 3. High-Level System Architecture

```mermaid
graph TD
    Client["Browser UI (React 19 / Vite / Tailwind)"] -->|REST API & HttpOnly Cookie| API["Fastify API Server (Port 4000)"]
    API -->|Deterministic Calculations| FE["@tradevault/financial-engine (Decimal.js)"]
    API -->|Shared Types & Zod Validation| Shared["@tradevault/shared"]
    API -->|Mongoose ODM| DB[("MongoDB Local / Embedded Persistence")]
    API -->|Private Local Streaming| Storage[("Private Attachment Storage ./data/uploads")]
    API -.->|Future Broker Sync Disabled| Fyers["Future FYERS Adapter Layer"]
```

---

## 4. Key Architectural Decisions

### A. Local-First & Zero Recurring Cost
- The application binds to localhost by default (`127.0.0.1`).
- No commercial UI kits, paid cloud databases, or third-party tracking services are included.
- Private screenshot attachments are stored in `./data/uploads` and served strictly through authenticated endpoints.

### B. Standalone Financial Engine
- Monetary numbers and R-multiples are calculated using `decimal.js` with 30-digit precision to avoid IEEE-754 floating-point inaccuracies.
- No React or DOM dependencies in the calculation engine; fully covered by independent Vitest test suites.

### C. Resilient MongoDB Persistence
- Connects to local MongoDB Community Server (`mongodb://127.0.0.1:27017/tradevault`) by default.
- If a standalone MongoDB daemon is not running, the application seamlessly spins up an embedded instance storing data persistently in `./data/db`.
- Docker Compose is also provided for containerized workflows.

### D. Security & Ownership
- Session tokens are stored in HttpOnly, SameSite cookies.
- Passwords hashed using bcrypt.
- Every API endpoint enforces user ownership; users can never access or modify records belonging to another account.
