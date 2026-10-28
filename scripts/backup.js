import fs from 'fs';
import path from 'path';
import { getBackupConfig } from './lib/backup-config.js';
import { executeDatabaseDump } from './lib/dump-core.js';

async function backup() {
  console.log('\n======================================================');
  console.log('📦 SetupMint Cloud Backup Tool (Atlas + Cloudflare R2)');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('🔍 [DRY-RUN MODE] Calculating record counts and manifest without modifying disk or cloud storage.\n');
  }

  const config = getBackupConfig({ requireBackupBucket: false, requireEncryptionKey: false });

  const backupDir = path.resolve(config.repoRoot, './backups');
  const cacheDir = path.resolve(backupDir, '.cache/uploads');
  const stateFilePath = path.resolve(backupDir, '.cache/state.json');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(backupDir, `tradevault-backup-${timestamp}`);

  // Find previous backup's manifest if available
  let previousManifest = null;
  if (fs.existsSync(backupDir)) {
    const prevFolders = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('tradevault-backup-'))
      .sort()
      .reverse();

    if (prevFolders.length > 0) {
      const prevManifestPath = path.join(backupDir, prevFolders[0], 'manifest.json');
      if (fs.existsSync(prevManifestPath)) {
        try {
          previousManifest = JSON.parse(fs.readFileSync(prevManifestPath, 'utf-8'));
        } catch {
          // Ignored
        }
      }
    }
  }

  const manifest = await executeDatabaseDump({
    targetDir,
    mongoUri: config.mongoUri,
    liveS3Config: config.liveS3,
    backupS3Config: config.backupS3.bucket ? config.backupS3 : null,
    previousManifest,
    dryRun,
    cacheDir,
    stateFilePath,
  });

  console.log(`\n======================================================`);
  if (dryRun) {
    console.log(`✅ [Dry-Run Complete] Cloud backup inspection verified.`);
  } else {
    console.log(`✅ Cloud backup successfully created at: ${targetDir}`);
  }
  console.log(`Collections backed up: ${Object.keys(manifest.collections).length}`);
  console.log(`Total database documents: ${Object.values(manifest.collections).reduce((a, b) => a + b, 0)}`);
  console.log(`Screenshot attachments: ${manifest.screenshotCount} (${(manifest.screenshotTotalBytes / 1024).toFixed(1)} KB)`);
  console.log(`Note: Broker credentials remain securely AES-256-GCM encrypted as stored.`);
  console.log(`TOKEN_ENCRYPTION_KEY is NOT included in backup archives.`);
  console.log(`======================================================\n`);
}

backup().catch((err) => {
  console.error('[Backup Error]', err.message);
  process.exit(1);
});
