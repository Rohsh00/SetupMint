# SetupMint — Scheduled, Encrypted, Verified Off-Site Backups & Disaster Recovery Runbook

SetupMint is engineered to store all structured trading records in your dedicated **MongoDB Atlas** cluster and chart screenshots in your private **Cloudflare R2** object storage bucket.

> [!IMPORTANT]
> **Atlas Free Tier (M0) Snapshot Limitation:**
> MongoDB Atlas M0 clusters do not provide continuous cloud snapshots or point-in-time recovery. The automated nightly backup pipeline (`npm run backup:scheduled`) provides encrypted, verified, off-site secondary backups with retention management and anomaly detection.

> [!CAUTION]
> **Critical Key Loss Warning (`BACKUP_ENCRYPTION_KEY`):**
> All off-site backup archives are encrypted using AES-256-GCM with keys derived via `scrypt` from `BACKUP_ENCRYPTION_KEY`.
> **If you lose this key, your encrypted backups CANNOT be decrypted or recovered by anyone.**
> Save your `BACKUP_ENCRYPTION_KEY` immediately in a secure password manager (e.g. 1Password, Bitwarden).

---

## 1. Architectural Highlights

1. **All 19 Canonical MongoDB Collections Covered:**
   `accounttransactions`, `angeloneinstruments`, `attachments`, `auditlogs`, `brokerfundssnapshots`, `brokerimportmappings`, `brokerintegrations`, `commoditymasters`, `dailyjournals`, `holidaycalendars`, `instruments`, `marketdataintegrations`, `strategies`, `tradecandlesnapshots`, `trades`, `tradetemplates`, `tradingaccounts`, `users`, `weeklyreviews`.
   *(Note: `sessions` is explicitly excluded from off-site backups as transient auth secrets).*
2. **Lossless Extended JSON (EJSON):**
   Serialized with BSON Extended JSON (`{ relaxed: false }`) guaranteeing exact mathematical round-tripping for `Decimal128` balances, `Date` objects, and `ObjectId` types with zero floating-point drift.
3. **Incremental Cloudflare R2 Screenshot Sync:**
   Screenshots are immutable UUID keys. Backup runs track copied keys in `state.json`. New keys are transferred via fast server-side S3 `CopyObjectCommand` when both buckets share the same Cloudflare R2 account, without downloading files to local disk.
4. **POSIX ustar `.tar.gz` Packaging & AES-256-GCM Encryption:**
   Packaged into a `.tar.gz` stream using pure Node.js built-ins (`crypto`, `zlib`, `stream`, `fs`). Encrypted with authenticated AES-256-GCM, unique 32-byte salt, 12-byte IV, and 16-byte auth tag per archive.
5. **Secondary Off-Site Storage:**
   Uploaded to an isolated backup bucket (`setupmint-backups`) with separate API token credentials. Live and backup buckets MUST differ.
6. **Strict Anomaly Detection:**
   Before packaging, document counts are compared against the prior backup manifest. If trades, attachments, account transactions, or trading accounts drop by $> 10\%$ (or drop to 0 from $>0$), the run is flagged `SUSPICIOUS`, uploaded to `suspicious/` prefix, halts retention pruning, and exits with a non-zero code.
7. **Retention Rotation Policy:**
   Keeps the latest 30 daily backups (`daily/`) and 12 monthly backups (`monthly/` captured on the 1st of every month). Guarantees at least 3 backups are preserved regardless of retention settings.
8. **In-Memory Restore Verification (`npm run backup:restore-test`):**
   Proves disaster recovery readiness by downloading the latest backup, decrypting it, spinning up an ephemeral in-memory MongoDB replica set (`mongodb-memory-server`), restoring documents, and running `AccountService.recalculateAccountBalances` to mathematically verify zero balance drift.

---

## 2. Command Reference

All commands run from the monorepo root:

| Command | Action |
| :--- | :--- |
| `npm run backup:scheduled` | **Unattended nightly backup pipeline**: acquires lockfile, dumps database, syncs screenshots, evaluates anomaly checks, tars, encrypts, uploads to off-site bucket, verifies upload checksums, applies retention, and mirrors status. |
| `npm run backup:scheduled -- --dry-run` | Executes the entire pipeline in simulation mode: logs all operations without modifying off-site S3 storage or deleting any files. |
| `npm run backup:verify -- latest` | Downloads and verifies the latest off-site backup: verifies AES-256-GCM auth tag, unpacks archive, checks SHA-256 hashes against `manifest.json`, and validates EJSON syntax without writing to any database. |
| `npm run backup:restore-test` | Restores the latest off-site backup into a throwaway in-memory MongoDB replica set, runs account balance recalculation, and asserts zero balance drift. Never touches Atlas or live R2. |
| `npm run db:backup` | Manual immediate dump into local `./backups/` directory (supports `--dry-run`). |
| `npm run db:restore -- <target> --yes-i-am-sure` | Restores from a local directory or encrypted `.enc` file into MongoDB Atlas with `--target-prefix` database safety validation. |
| `npm run db:reconcile` | Authoritatively audits and reconciles all trading account balances on MongoDB Atlas. |
| `npm run backup:schedule:install` | Installs and loads the macOS `launchd` user LaunchAgent (`com.setupmint.backup.plist`) to execute nightly backups automatically. |
| `npm run backup:schedule:uninstall` | Unloads and removes the macOS `launchd` user LaunchAgent. |

---

## 3. Automated Scheduling Setup

### A. macOS LaunchAgent (Primary)
SetupMint includes automated LaunchAgent installer scripts that configure an unattended job running nightly at **02:30 AM local time**:

1. **Install and load the agent:**
   ```bash
   npm run backup:schedule:install
   ```
2. **Verify active status:**
   ```bash
   launchctl list | grep setupmint
   # Expected output: - 0 com.setupmint.backup
   ```
3. **Logs location:**
   Standard output and errors are logged with rotating timestamps to:
   ```text
   backups/logs/backup.log
   ```
4. **Sleep catch-up behavior:**
   If your Mac is asleep at 02:30 AM, macOS triggers the job upon wake. Additionally, `backup-scheduled.js` records `lastSuccessAt` in `backups/status.json`.

5. **Uninstall:**
   ```bash
   npm run backup:schedule:uninstall
   ```

### B. Linux `cron` Alternative
Add the following line to `crontab -e`:
```cron
30 2 * * * cd /path/to/SetupMint && /usr/bin/node scripts/backup-scheduled.js >> backups/logs/backup.log 2>&1
```

### C. Linux `systemd` Timer Alternative
Create `/etc/systemd/system/setupmint-backup.service`:
```ini
[Unit]
Description=SetupMint Nightly Encrypted Backup

[Service]
Type=oneshot
WorkingDirectory=/path/to/SetupMint
ExecStart=/usr/bin/node scripts/backup-scheduled.js
User=youruser
EnvironmentFile=/path/to/SetupMint/.env
```

Create `/etc/systemd/system/setupmint-backup.timer`:
```ini
[Unit]
Description=Run SetupMint Nightly Encrypted Backup at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now setupmint-backup.timer`.

### D. GitHub Actions Workflow (Optional & Secondary)
A template workflow exists at [`.github/workflows/backup.yml`](file:///Users/komal/projects/Trading%20Vault/.github/workflows/backup.yml).
> [!WARNING]
> GitHub Actions runners have dynamic egress IP ranges. Using GitHub Actions requires allowlisting `0.0.0.0/0` in MongoDB Atlas Network Access. For local desktop users, macOS `launchd` is strongly recommended over GitHub Actions.

---

## 4. Disaster Recovery & Restoration Step-by-Step

In the event of accidental data corruption or complete hardware replacement, follow these steps to restore your data:

### Step 1: Prepare Environment
Clone the repository, install dependencies, and configure `.env`:
```bash
npm ci
npm run build
cp .env.example .env
```
Ensure `.env` contains:
- `MONGODB_URI` (pointing to your target Atlas database)
- `S3_*` credentials (pointing to your live Cloudflare R2 bucket)
- `BACKUP_ENCRYPTION_KEY` (your saved 32+ character passphrase)
- `BACKUP_S3_*` credentials (pointing to your secondary off-site backup bucket)

### Step 2: Download or Locate Backup Archive
You can list and download the latest backup from your off-site bucket:
```bash
# Verify the archive integrity first without touching your database:
npm run backup:verify -- latest
```

### Step 3: Run In-Memory Verification Drill
Before applying any changes to your live Atlas cluster, execute the disposable in-memory restore test:
```bash
npm run backup:restore-test
```
This test spins up an isolated `mongodb-memory-server` replica set, populates all documents, recalculates account balances, and confirms zero Decimal128 balance drift.

### Step 4: Execute Live Restore
Run the restore script with the encrypted archive:
```bash
npm run db:restore -- ./backups/setupmint-backup-<timestamp>.tar.gz.enc --yes-i-am-sure
```

**Target Database Safety Protection:**
The restore script inspects the target database name from `MONGODB_URI`. If you specify `--target-prefix tradevault`, it will refuse to restore into a mismatched database name (preventing accidental production overwrites). To bypass this check intentionally, append `--force-db`.

### Step 5: Post-Restore Reconciliation Audit
Confirm ledger balances match all closed trades and cash transactions:
```bash
npm run db:reconcile
```

---

## 5. Disaster Recovery Drill Checklist

Perform this drill quarterly to guarantee business continuity:

- [ ] **Drill 1: Key Availability** — Retrieve `BACKUP_ENCRYPTION_KEY` from password manager.
- [ ] **Drill 2: Off-Site Archive Verification** — Run `npm run backup:verify -- latest`. Confirm all 19 collections pass SHA-256 checks.
- [ ] **Drill 3: In-Memory Restore Test** — Run `npm run backup:restore-test`. Confirm zero balance drift.
- [ ] **Drill 4: Diagnostic Visibility** — Check `GET /api/v1/settings/system-status` in the UI to confirm the diagnostic card displays a green `OK` status with recent timestamp.
- [ ] **Drill 5: R2 Bucket Permissions** — Confirm secondary backup bucket has object write/read permissions and is distinct from the primary screenshot bucket.
