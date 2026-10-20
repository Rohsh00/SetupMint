# Antigravity & AI Agent Instructions — SetupMint

Welcome, AI Agent.

Before inspecting or writing code in this repository, you **MUST** read the permanent context document:
👉 [**`docs/AI_CONTEXT.md`**](docs/AI_CONTEXT.md)

It contains:
- Complete product identity, tech stack, and directory mappings.
- All 15 application REST route groups, 13 MongoDB database models, and endpoints.
- Exact financial calculation specifications in `@tradevault/financial-engine`.
- Strict rules of engagement regarding financial accuracy, tenant isolation, local-first privacy, and testing requirements.

### Quick Reference Commands:
- `npm run dev` — Start Fastify backend (4000) and Vite frontend (5173).
- `npm run test` — Run all 197 unit and integration tests.
- `npm run typecheck` — Typecheck all workspaces.
- `npm run db:seed` — Populate realistic demo trading records.
- `npm run seed:reset` — Safely reset demo data without touching real user data.

For comprehensive architectural and domain documentation, refer to the [**`docs/`**](docs/README.md) directory.
