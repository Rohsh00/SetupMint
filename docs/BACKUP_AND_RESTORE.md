# SetupMint — Local Backup and Restore Guide

SetupMint is designed to maintain 100% of your trading records locally on your machine. Because data is private and not sent to commercial cloud databases, regular backups are recommended.

---

## 1. Automated CLI Backup

Run the following command from the workspace root:

```bash
npm run db:backup
```

### What this does:
1. Connects to your local MongoDB database.
2. Dumps every collection (`trades`, `tradingaccounts`, `strategies`, `dailyjournals`, `instruments`, etc.) to clean JSON documents.
3. Copies all private chart screenshots from `./data/uploads/` into the backup directory.
4. Generates a metadata `manifest.json`.
5. Saves everything into `./backups/tradevault-backup-<TIMESTAMP>/`.

---

## 2. Automated CLI Restore

To restore from the most recent backup:

```bash
npm run db:restore
```

To restore from a specific backup archive:

```bash
node scripts/restore.js ./backups/tradevault-backup-2026-10-16T12-00-00-000Z
```

---

## 3. Manual MongoDB Backup via Native Tools
If you have `mongodump` and `mongorestore` installed on your Mac:

```bash
# Dump
mongodump --db tradevault --out ./backups/mongodump-$(date +%F)

# Restore
mongorestore --db tradevault ./backups/mongodump-2026-10-16/tradevault
```

---

## 4. Security Considerations
- Local backups contain your personal trading performance, trade sizes, and notes.
- Do not commit the `backups/` or `data/` directories to public GitHub repositories (they are already excluded by `.gitignore`).
- For offsite backup, consider copying your `./backups/` folder to an encrypted external drive or personal encrypted cloud storage.
