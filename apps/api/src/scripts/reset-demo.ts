import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import {
  AccountTransaction,
  Attachment,
  BrokerIntegration,
  DailyJournal,
  Instrument,
  Strategy,
  Trade,
  TradeCandleSnapshot,
  TradingAccount,
  User,
} from '../db/models/index.js';

import { getStorage } from '../storage/index.js';

export async function resetDemoData() {
  console.log('[ResetDemo] Connecting to database...');
  await connectDatabase();

  const email = 'trader@tradevault.local';
  console.log(`[ResetDemo] Isolating and deleting data for demo user: ${email}...`);

  const demoUser = await User.findOne({ email });
  if (!demoUser) {
    console.log(`[ResetDemo] No demo user (${email}) found. Nothing to reset.`);
    await disconnectDatabase();
    return;
  }

  const userId = demoUser._id;

  // Clean up chart screenshot objects from Cloudflare R2
  const demoAttachments = await Attachment.find({ userId });
  if (demoAttachments.length > 0) {
    try {
      const storage = getStorage();
      for (const att of demoAttachments) {
        try {
          await storage.delete(att.storedFilename);
        } catch {
          // ignore individual deletion errors
        }
      }
    } catch (storageErr: any) {
      console.warn(`[ResetDemo] Cloud storage cleanup warning: ${storageErr.message}`);
    }
  }

  const tRes = await Trade.deleteMany({ userId });
  await TradeCandleSnapshot.deleteMany({ userId });
  const aRes = await TradingAccount.deleteMany({ userId });
  const txRes = await AccountTransaction.deleteMany({ userId });
  const jRes = await DailyJournal.deleteMany({ userId });
  const attRes = await Attachment.deleteMany({ userId });
  const iRes = await Instrument.deleteMany({ userId });
  const sRes = await Strategy.deleteMany({ userId });
  const bRes = await BrokerIntegration.deleteMany({ userId });

  console.log('\n======================================================');
  console.log('✅ Demo Dataset Reset Successfully!');
  console.log(`Trades Removed: ${tRes.deletedCount}`);
  console.log(`Accounts Removed: ${aRes.deletedCount}`);
  console.log(`Transactions Removed: ${txRes.deletedCount}`);
  console.log(`Daily Journals Removed: ${jRes.deletedCount}`);
  console.log(`Attachments Removed: ${attRes.deletedCount}`);
  console.log(`Instruments Removed: ${iRes.deletedCount}`);
  console.log(`Strategies Removed: ${sRes.deletedCount}`);
  console.log(`Broker Integrations Removed: ${bRes.deletedCount}`);
  console.log('Real registered users and credentials were NOT affected.');
  console.log('======================================================\n');

  await disconnectDatabase();
}

if (process.argv[1]?.includes('reset-demo.ts') || process.argv[1]?.includes('reset-demo.js')) {
  resetDemoData().catch((err) => {
    console.error('Reset error:', err);
    process.exit(1);
  });
}
