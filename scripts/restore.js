import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tradevault';
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads');
const BACKUP_DIR = path.resolve(process.cwd(), './backups');

async function restore() {
  console.log('[Restore] Starting TradeVault restore...');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.error('[Restore Error] No backups directory found at ./backups');
    process.exit(1);
  }

  // Find latest backup folder or specified argument
  let targetBackup = process.argv[2];
  if (!targetBackup) {
    const backupFolders = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('tradevault-backup-'))
      .sort()
      .reverse();

    if (backupFolders.length === 0) {
      console.error('[Restore Error] No backup archives found in ./backups');
      process.exit(1);
    }
    targetBackup = path.join(BACKUP_DIR, backupFolders[0]);
  } else {
    targetBackup = path.resolve(targetBackup);
  }

  console.log(`[Restore] Restoring from: ${targetBackup}`);

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const files = fs.readdirSync(targetBackup);
  let totalRestored = 0;

  for (const file of files) {
    if (file.endsWith('.json') && file !== 'manifest.json') {
      const colName = path.basename(file, '.json');
      const content = fs.readFileSync(path.join(targetBackup, file), 'utf-8');
      const records = JSON.parse(content);

      if (records.length > 0) {
        // Clear collection before restoring
        await db.collection(colName).deleteMany({});
        await db.collection(colName).insertMany(records);
        totalRestored += records.length;
        console.log(`[Restore] Restored ${records.length} records into ${colName}`);
      }
    }
  }

  // Restore attachments
  const backupUploads = path.join(targetBackup, 'uploads');
  if (fs.existsSync(backupUploads)) {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    const uploadFiles = fs.readdirSync(backupUploads);
    for (const f of uploadFiles) {
      fs.copyFileSync(path.join(backupUploads, f), path.join(UPLOAD_DIR, f));
    }
    console.log(`[Restore] Restored ${uploadFiles.length} private attachments into ${UPLOAD_DIR}`);
  }

  console.log(`\n======================================================`);
  console.log(`✅ TradeVault restored successfully! Total records: ${totalRestored}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

restore().catch((err) => {
  console.error('[Restore Error]', err.message);
  process.exit(1);
});
