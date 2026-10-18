# SetupMint — Deployment & Operations Guide

This document describes the production build pipeline, hosting requirements, cloud persistence architecture, backup operations, and operational limits for **SetupMint**.

---

## 1. Production Build Pipeline

The complete application is compiled using the root build script:

```bash
npm run build
```

This sequentially compiles all workspaces in strict dependency order:
1. **`packages/shared`:** Runs `tsc` to generate TypeScript type declarations and JavaScript modules in `packages/shared/dist/`.
2. **`packages/financial-engine`:** Runs `tsc` to compile the decimal arithmetic library to `packages/financial-engine/dist/`.
3. **`apps/api`:** Runs `tsc` to compile Fastify controllers, models, and services to `apps/api/dist/server.js`.
4. **`apps/web`:** Runs `tsc -b && vite build` to generate an optimized, minified production single-page application (SPA) in `apps/web/dist/`.

---

## 2. Deployment Topology

SetupMint is architected for cloud-native persistence with zero local fallbacks:

```mermaid
graph TD
    subgraph Client["Browser Client (Desktop / Mobile)"]
        Browser["Trader Browser"]
    end

    subgraph Hosting["Application Hosting (Local or Cloud VPS)"]
        WebStatic["apps/web/dist/ (Static Web Server / Nginx / Caddy)"]
        FastifyAPI["Fastify API Server (Port 4000)"]
    end

    subgraph CloudServices["Dedicated Cloud Services"]
        Atlas[("MongoDB Atlas Cloud Cluster\n(mongodb+srv://)")]
        R2[("Cloudflare R2 Object Storage\n(Private S3 Bucket)")]
    end

    Browser -->|HTTPS / Port 443| WebStatic
    Browser -->|/api/* Requests + HttpOnly Cookie| FastifyAPI
    FastifyAPI -->|Mongoose ODM v8| Atlas
    FastifyAPI -->|@aws-sdk/client-s3| R2
```

---

## 3. Production Runtime Execution

To run the compiled production backend:

```bash
# In apps/api directory
cd apps/api
NODE_ENV=production node dist/server.js
```

Or using PM2 for process management:
```bash
pm2 start apps/api/dist/server.js --name "setupmint-api"
```

The frontend production bundle in `apps/web/dist/` can be served via Nginx, Caddy, or Cloudflare Pages:

**Sample Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name setupmint.yourdomain.com;

    # Serve static frontend
    location / {
        root /var/www/setupmint/apps/web/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API requests
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 4. Backup & Disaster Recovery Runbook

> [!IMPORTANT]
> Because MongoDB Atlas M0 (Free Tier) does not provide continuous automated backups, running `npm run db:backup` regularly is critical.

### A. Performing an Immediate Backup
```bash
npm run db:backup
```
- Creates `./backups/tradevault-backup-<timestamp>/`.
- Dumps JSON records for all database collections from MongoDB Atlas.
- Downloads all private screenshot attachments from Cloudflare R2.
- Writes `manifest.json` validating collection record counts and file counts.

### B. Restoring from Backup
```bash
# Restore latest backup (requires explicit confirmation flag)
npm run db:restore -- --yes-i-am-sure

# Or restore specific archive folder
node scripts/restore.js ./backups/tradevault-backup-2026-10-18T17-04-17-360Z --yes-i-am-sure
```

### C. Post-Restore Integrity Audit
After any restoration, run reconciliation to ensure all account balances are mathematically aligned:
```bash
npm run db:reconcile
```

---

## 5. Operational Limits & Resource Sizing

- **Memory:** Node.js API process requires ~150MB RAM at baseline; ~300MB under peak load.
- **CPU:** Calculation engine processes 5,000 trades in <100ms.
- **Cloud Database (MongoDB Atlas):** Atlas Free (M0) provides 512MB storage, accommodating ~100,000 trades.
- **Object Storage (Cloudflare R2):** Cloudflare R2 includes 10GB free monthly storage with zero egress fees. Screenshots are served through Fastify authenticated streams.
