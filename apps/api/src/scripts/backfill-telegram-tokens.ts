/**
 * SetupMint - Backfill script for Telegram Bot Token encryption
 *
 * Scans User collection and migrates any plaintext liveWatcherSettings.telegramBotToken
 * to AES-256-GCM encrypted format (enc:v1: envelope).
 *
 * Usage:
 *   npx tsx apps/api/src/scripts/backfill-telegram-tokens.ts         # Dry run (default)
 *   npx tsx apps/api/src/scripts/backfill-telegram-tokens.ts --yes   # Apply encryption
 */

import mongoose from 'mongoose';
import { config } from '../config.js';
import { User } from '../db/models/User.js';
import { encryptSecret, isEncryptedSecret } from '../services/crypto.service.js';

async function main() {
  const isApply = process.argv.includes('--yes');
  console.log(`\n=== SetupMint Telegram Bot Token Backfill ===`);
  console.log(`Mode: ${isApply ? 'APPLY (--yes)' : 'DRY RUN (no changes will be written)'}`);
  console.log(`Connecting to database...`);

  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB.');

  const users = await User.find({
    'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
  });

  console.log(`Found ${users.length} user(s) with configured telegramBotToken.`);

  let needEncryptionCount = 0;
  let alreadyEncryptedCount = 0;

  for (const user of users) {
    const rawToken = user.liveWatcherSettings?.telegramBotToken;
    if (!rawToken || !rawToken.trim()) continue;

    if (isEncryptedSecret(rawToken)) {
      alreadyEncryptedCount++;
      continue;
    }

    needEncryptionCount++;
    console.log(`[User ${user._id} (${user.email})] Plaintext token detected: ${rawToken.slice(0, 6)}...`);

    if (isApply) {
      const encrypted = encryptSecret(rawToken);
      if (user.liveWatcherSettings) {
        user.liveWatcherSettings.telegramBotToken = encrypted || undefined;
        await user.save();
        console.log(`  -> Successfully encrypted and saved.`);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Already encrypted: ${alreadyEncryptedCount}`);
  console.log(`  Plaintext detected: ${needEncryptionCount}`);

  if (!isApply && needEncryptionCount > 0) {
    console.log(`\nTo apply these changes, re-run with:`);
    console.log(`  npx tsx apps/api/src/scripts/backfill-telegram-tokens.ts --yes\n`);
  } else if (isApply) {
    console.log(`\nAll plaintext tokens successfully backfilled to AES-256-GCM.\n`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
