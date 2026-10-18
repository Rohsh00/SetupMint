# SetupMint — Cloud Backup and Restore Guide

SetupMint is engineered to store your trading records in your own dedicated **MongoDB Atlas** cluster and chart screenshots in your private **Cloudflare R2** bucket.

> [!IMPORTANT]
> **MongoDB Atlas Free Tier (M0) Backup Notice:**
> The MongoDB Atlas M0 Free Tier does not include automated cloud snapshots or continuous point-in-time recovery. Traders are strongly advised to run automated backups regularly using `npm run db:backup`.

---

## 1. Automated CLI Cloud Backup

Run the following command from the workspace root:

```bash
npm run db:backup
```

### What this does:
1. Connects to your configured MongoDB Atlas cluster (`MONGODB_URI`).
2. Dumps every collection (`trades`, `tradingaccounts`, `strategies`, `dailyjournals`, `instruments`, `attachments`, etc.) to clean JSON documents.
3. Downloads all private chart screenshots from your Cloudflare R2 bucket (`S3_BUCKET`) into the backup directory.
4. Generates a metadata `manifest.json` recording collection record counts and file counts.
5. Saves everything into `./backups/tradevault-backup-<TIMESTAMP>/`.

---

## 2. Automated CLI Cloud Restore

Restoring is a destructive action that replaces documents in your Atlas cluster and uploads files back into Cloudflare R2. To prevent accidental data loss, an explicit `--yes-i-am-sure` flag is required.

To restore from the most recent backup:

```bash
npm run db:restore -- --yes-i-am-sure
```

To restore from a specific backup archive:

```bash
node scripts/restore.js ./backups/tradevault-backup-2026-10-18T17-04-17-360Z --yes-i-am-sure
```

### What this does:
1. Verifies the `--yes-i-am-sure` confirmation flag.
2. Connects to your MongoDB Atlas cluster and Cloudflare R2 bucket.
3. Clears and restores collection records from JSON files into Atlas.
4. Re-uploads all chart screenshots from `uploads/` into your Cloudflare R2 bucket.
5. Authoritatively reconciles all trading account balances via `AccountService.recalculateAccountBalances()`.

---

## 3. Security & Offsite Storage Considerations
- Local backups contain your personal trading performance, trade sizes, and charts.
- The `backups/` directory is excluded from version control by `.gitignore`. Never commit backup folders to public git repositories.
- For maximum redundancy, archive the `./backups/` folder to an encrypted personal cold storage drive or encrypted private cloud drive.
