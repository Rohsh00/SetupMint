import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import {
  AccountTransaction,
  Attachment,
  AuditLog,
  BrokerIntegration,
  DailyJournal,
  Instrument,
  Session,
  Strategy,
  Trade,
  TradingAccount,
  User,
} from '../db/models/index.js';

export async function cleanDatabase() {
  console.log('[Clean] Connecting to database...');
  await connectDatabase();

  console.log('[Clean] Wiping all records to a clean empty state...');
  await User.deleteMany({});
  await Session.deleteMany({});
  await TradingAccount.deleteMany({});
  await AccountTransaction.deleteMany({});
  await Instrument.deleteMany({});
  await Strategy.deleteMany({});
  await Trade.deleteMany({});
  await DailyJournal.deleteMany({});
  await Attachment.deleteMany({});
  await AuditLog.deleteMany({});
  await BrokerIntegration.deleteMany({});

  console.log('✅ Clean database ready!');
  await disconnectDatabase();
}

if (process.argv[1]?.includes('clean.ts') || process.argv[1]?.includes('clean.js')) {
  cleanDatabase().catch((err) => {
    console.error('Clean error:', err);
    process.exit(1);
  });
}
