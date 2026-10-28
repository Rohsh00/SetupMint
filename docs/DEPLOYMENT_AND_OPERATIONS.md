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
> Because MongoDB Atlas M0 (Free Tier) does not provide continuous automated cloud snapshots, SetupMint features an automated, unattended nightly backup pipeline (`npm run backup:scheduled`) encrypting data with AES-256-GCM and uploading to a dedicated secondary off-site bucket.

### A. Nightly Scheduled Backup Pipeline
```bash
# Automated entry point run via macOS launchd (02:30 AM local) or cron:
npm run backup:scheduled

# Simulate execution without uploading or modifying off-site bucket:
npm run backup:scheduled -- --dry-run
```
- Dumps all 19 canonical MongoDB collections using Extended JSON (EJSON) to prevent Decimal128 drift.
- Incrementally syncs private Cloudflare R2 screenshots via server-side S3 CopyObject.
- Detects data drop anomalies (>10% drop flags `SUSPICIOUS`, uploads under `suspicious/`, and halts retention).
- Packages archive with pure Node POSIX ustar `.tar.gz` and encrypts with AES-256-GCM (`BACKUP_ENCRYPTION_KEY`).
- Uploads to secondary off-site bucket (`setupmint-backups/daily/` and 1st of month `monthly/`).
- Verifies upload checksums and applies retention (keeps 30 daily + 12 monthly, minimum 3 preserved).
- Writes local `backups/status.json` and mirrors to off-site bucket `status/latest.json`.

### B. Verification & Disposable In-Memory Restore Test
```bash
# Verify AES-256-GCM auth tag and manifest SHA-256 hashes without touching any DB:
npm run backup:verify -- latest

# Disposable in-memory disaster recovery drill:
npm run backup:restore-test
```

### C. Restoring from Backup
```bash
# Restore latest or specific encrypted archive (requires confirmation flag):
npm run db:restore -- ./backups/setupmint-backup-<timestamp>.tar.gz.enc --yes-i-am-sure

# Optional database name safety check:
npm run db:restore -- ./backups/setupmint-backup-<timestamp>.tar.gz.enc --yes-i-am-sure --target-prefix tradevault
```

### D. Post-Restore Integrity Audit
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
