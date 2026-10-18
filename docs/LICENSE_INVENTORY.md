# SetupMint — Open Source Dependency & Licensing Inventory

All software dependencies in SetupMint are free to use locally without recurring software subscriptions or commercial fees.

---

## 1. Important Licensing Distinction (SSPL vs OSI Open Source)

> [!NOTE]
> **MongoDB Community Server Licensing:**
> MongoDB Community Server is licensed under the **Server Side Public License (SSPL v1)**. The SSPL is **not** an OSI-approved open-source license. It allows free local execution, private self-hosting, and development on your MacBook without cost, provided you do not offer MongoDB as a commercial cloud service to third parties. SetupMint does not misrepresent SSPL as OSI-approved open source.

---

## 2. Core Dependencies & License Inventory

| Package / Library | License | Usage Scope |
| :--- | :--- | :--- |
| **Fastify** | MIT | Core backend HTTP web framework |
| **React** | MIT | Frontend UI rendering library |
| **React DOM** | MIT | Web DOM bindings |
| **Vite** | MIT | Frontend compilation and dev server |
| **Tailwind CSS** | MIT | Utility-first styling system |
| **TypeScript** | Apache-2.0 | Static type system |
| **Mongoose** | MIT | MongoDB object modeling |
| **Decimal.js** | MIT | Deterministic arbitrary-precision financial decimal arithmetic |
| **Zod** | MIT | Schema validation and type inference |
| **Recharts** | MIT | Financial charting library |
| **TanStack Query** | MIT | Asynchronous state management |
| **React Router** | MIT | Client-side routing |
| **React Hook Form** | MIT | Form handling |
| **Lucide Icons** | ISC | Vector icon collection |
| **Pino & Pino-Pretty**| MIT | Structured JSON logging |
| **Bcryptjs** | MIT | Password hashing |
| **CSV-Parse / Stringify** | MIT | Data import and export |
| **Vitest** | MIT | Unit and integration testing |

---

## 3. Commercial Subscription Audit
- **Commercial UI Kits:** None. Sourced custom Tailwind CSS components.
- **Paid Cloud Services:** None. Runs 100% locally on macOS.
- **Paid Analytics / Telemetry:** None. All charts calculate directly from local MongoDB records.
- **Paid APIs:** None required for core trade logging and journal functionality.
