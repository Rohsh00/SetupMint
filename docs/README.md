# SetupMint Documentation Library

Welcome to the comprehensive technical and product documentation for **SetupMint — Trade. Track. Improve.** (also identified by repository package scope `@tradevault`).

This directory serves as the single source of truth for traders, software engineers, and AI coding agents working on SetupMint. Every document in this library is strictly grounded in the verified source code of the repository.

---

## 📚 Documentation Index

| Document | Purpose | Primary Audience |
| :--- | :--- | :--- |
| [**AI_CONTEXT.md**](AI_CONTEXT.md) | **Permanent AI Context**: High-density primer for new AI pairing sessions and developers. Read this first! | AI Agents & Engineers |
| [**PRODUCT_OVERVIEW.md**](PRODUCT_OVERVIEW.md) | High-level product positioning, value proposition, problem statement, and supported markets. | Product & Business |
| [**PRODUCT_FEATURES.md**](PRODUCT_FEATURES.md) | Comprehensive feature inventory across all 14 application modules, with inputs, outputs, and statuses. | Product & Engineering |
| [**APPLICATION_ARCHITECTURE.md**](APPLICATION_ARCHITECTURE.md) | System design, monorepo layout, tech stack, data flow, and architectural decisions. | System Architects |
| [**PROJECT_STRUCTURE.md**](PROJECT_STRUCTURE.md) | Annotated directory tree mapping folders and files to their architectural responsibilities. | Developers |
| [**ROUTES_AND_PAGES.md**](ROUTES_AND_PAGES.md) | Complete breakdown of all frontend pages, routing paths, modals, and actions. | Frontend Developers |
| [**USER_FLOWS.md**](USER_FLOWS.md) | Detailed walkthroughs and Mermaid sequence diagrams of core user workflows. | UX & QA |
| [**DATABASE_SCHEMA.md**](DATABASE_SCHEMA.md) | Mongoose schema definitions, field types, constraints, defaults, and Decimal128 handling. | Backend Developers |
| [**DATA_RELATIONSHIPS.md**](DATA_RELATIONSHIPS.md) | Entity relationship diagrams, cascade deletion policies, and data ownership boundaries. | Backend Developers |
| [**API_REFERENCE.md**](API_REFERENCE.md) | REST API v1 specification covering all endpoints, parameters, payloads, and response schemas. | API Consumers & QA |
| [**BUSINESS_LOGIC.md**](BUSINESS_LOGIC.md) | Domain rules governing accounts, trades, emotions, mistake tags, and trade journals. | Domain Engineers |
| [**TRADING_CALCULATIONS.md**](TRADING_CALCULATIONS.md) | Mathematical formulas and decimal implementations (P&L, FIFO lot matching, Indian charges, risk). | Quant & Financial Eng |
| [**BROKER_INTEGRATIONS.md**](BROKER_INTEGRATIONS.md) | Broker adapter architecture, FYERS integration model, normalized schema, and reconciliation. | Integrations |
| [**TELEGRAM_INTEGRATION.md**](TELEGRAM_INTEGRATION.md) | Two-way Telegram bot, mobile execution callbacks (1-tap Exit, Lock BE), and real-time risk push alerts. | Integrations & Mobile |
| [**SEED_DATA_AND_DEMO_MODE.md**](SEED_DATA_AND_DEMO_MODE.md) | The SetupMint Seed Engine: 8 demo profiles, 5 densities, PRNG determinism, and validator. | QA & Demo Ops |
| [**AUTHENTICATION_AND_SECURITY.md**](AUTHENTICATION_AND_SECURITY.md) | HttpOnly cookies, sessions, rate limiting, Helmet, ownership enforcement, and magic bytes. | Security Engineers |
| [**FILE_STORAGE_AND_ATTACHMENTS.md**](FILE_STORAGE_AND_ATTACHMENTS.md) | Cloudflare R2 private bucket storage, security, authenticated streaming, and chart categories. | Backend Developers |
| [**UI_COMPONENTS_AND_DESIGN_SYSTEM.md**](UI_COMPONENTS_AND_DESIGN_SYSTEM.md) | MUI v9 + Tailwind CSS design system, typography, dark/light mode tokens, and Recharts. | UI/UX Designers |
| [**CONFIGURATION_AND_ENVIRONMENT.md**](CONFIGURATION_AND_ENVIRONMENT.md) | Environment variables, `.env.example`, default configurations, and secrets management. | DevOps & Developers |
| [**LOCAL_SETUP_AND_DEVELOPMENT.md**](LOCAL_SETUP_AND_DEVELOPMENT.md) | Step-by-step developer guide for setup, running dev servers, seeding, and debugging. | All Developers |
| [**TESTING_AND_QUALITY_ASSURANCE.md**](TESTING_AND_QUALITY_ASSURANCE.md) | Vitest testing suites (319 verified unit and integration tests), test commands, and assertions. | QA Engineers |
| [**DEPLOYMENT_AND_OPERATIONS.md**](DEPLOYMENT_AND_OPERATIONS.md) | Production builds, Docker Compose, hosting topology, backup scripts, and data persistence. | DevOps & SREs |
| [**KNOWN_LIMITATIONS_AND_TECHNICAL_DEBT.md**](KNOWN_LIMITATIONS_AND_TECHNICAL_DEBT.md) | Verified defects, partial features, technical debt, and planned enhancements. | Engineering Leads |

---

## 🔍 Application Summary

- **Product Name:** SetupMint — Trade. Track. Improve. (PRO)
- **Codebase / Monorepo Name:** `tradevault-monorepo` (`@tradevault/api`, `@tradevault/web`, `@tradevault/financial-engine`, `@tradevault/shared`)
- **Primary Tech Stack:** Node.js LTS (>=20.0.0), Fastify v5, MongoDB / Mongoose ODM, React 19, TypeScript 5.7, Vite 6, Material UI (MUI v9), Tailwind CSS v3, Decimal.js, Vitest.
- **Data Privacy Standard:** 100% private cloud storage in the trader's dedicated MongoDB Atlas cluster and Cloudflare R2 bucket. Zero telemetry or third-party cloud trackers.
