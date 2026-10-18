# SetupMint — Open Source Dependency & Licensing Inventory

All software dependencies in SetupMint are free to use without commercial UI kit fees or proprietary software lock-in.

---

## 1. Cloud Infrastructure & Service Models

> [!NOTE]
> **MongoDB Atlas & Cloudflare R2:**
> - **MongoDB Atlas:** Hosted cloud database service provided by MongoDB, Inc. SetupMint connects via standard Mongoose ODM drivers under the Apache-2.0 / MIT client library licenses. Atlas provides a permanent free M0 tier.
> - **Cloudflare R2:** S3-compatible cloud object storage service provided by Cloudflare. SetupMint interacts with R2 using the official open-source `@aws-sdk/client-s3` (Apache-2.0) library. Cloudflare R2 includes a 10GB free tier with zero egress fees.

---

## 2. Core Dependencies & License Inventory

| Package / Library | License | Usage Scope |
| :--- | :--- | :--- |
| **@aws-sdk/client-s3** | Apache-2.0 | S3-compatible client for Cloudflare R2 private object storage |
| **Fastify** | MIT | Core backend HTTP web framework |
| **React** | MIT | Frontend UI rendering library |
| **React DOM** | MIT | Web DOM bindings |
| **Vite** | MIT | Frontend compilation and dev server |
| **Material UI (MUI v9)** | MIT | Core UI component design system |
| **Tailwind CSS** | MIT | Utility-first styling system |
| **TypeScript** | Apache-2.0 | Static type system |
| **Mongoose** | MIT | MongoDB object modeling |
| **Decimal.js** | MIT | Deterministic arbitrary-precision financial decimal arithmetic |
| **Zod** | MIT | Schema validation and type inference |
| **Recharts** | MIT | Financial charting library |
| **TanStack Query** | MIT | Asynchronous state management |
| **React Router** | MIT | Client-side routing |
| **React Hook Form** | MIT | Form handling |
| **Pino & Pino-Pretty**| MIT | Structured JSON logging |
| **Bcryptjs** | MIT | Password hashing |
| **CSV-Parse / Stringify** | MIT | Data import and export |
| **Vitest** | MIT | Unit and integration testing |

---

## 3. Commercial Audit
- **Commercial UI Kits:** None. Uses open-source MUI v9 and Tailwind CSS.
- **Paid Analytics / Telemetry:** None. All charts calculate directly from your private database records.
- **Data Privacy:** Your trading setups, sizes, and charts reside exclusively in your personal MongoDB Atlas database and Cloudflare R2 bucket.
