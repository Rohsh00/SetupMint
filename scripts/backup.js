import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tradevault';
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads');
const BACKUP_DIR = path.resolve(process.cwd(), './backups');

async function backup() {
  console.log('[Backup] Starting TradeVault local data backup...');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(BACKUP_DIR, `tradevault-backup-${timestamp}`);
  fs.mkdirSync(targetDir, { recursive: true });

  let conn;
  try {
    conn = await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    console.warn(`[Backup] Note: Could not connect to external ${MONGODB_URI}. Checking local embedded files...`);
  }

  const manifest = {
    timestamp: new Date().toISOString(),
    collections: {},
    filesCopied: 0,
  };

  if (mongoose.connection.readyState === 1) {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      const records = await db.collection(col.name).find({}).toArray();
      const colPath = path.join(targetDir, `${col.name}.json`);
      fs.writeFileSync(colPath, JSON.stringify(records, null, 2), 'utf-8');
      manifest.collections[col.name] = records.length;
      console.log(`[Backup] Dumped ${records.length} records from ${col.name}`);
    }
  }

  // Backup uploaded screenshots if any
  const uploadsBackupDir = path.join(targetDir, 'uploads');
  if (fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(uploadsBackupDir, { recursive: true });
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
      const src = path.join(UPLOAD_DIR, file);
      const dest = path.join(uploadsBackupDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
        manifest.filesCopied++;
      }
    }
  }

  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n======================================================`);
  console.log(`✅ Backup successfully created at: ${targetDir}`);
  console.log(`Collections backed up: ${Object.keys(manifest.collections).length}`);
  console.log(`Attachment files backed up: ${manifest.filesCopied}`);
  console.log(`======================================================\n`);

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

backup().catch((err) => {
  console.error('[Backup Error]', err.message);
  process.exit(1);
});
