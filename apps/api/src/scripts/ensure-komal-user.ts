import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, TradingAccount } from '../db/models/index.js';
import { FOUR_STRATEGIES } from './seed-komal-strategies.js';
import { Strategy } from '../db/models/index.js';

export async function ensureKomalUser() {
  await connectDatabase();
  console.log('[EnsureKomal] Checking user komal@gmail.com...');

  let user = await User.findOne({ email: 'komal@gmail.com' });
  const passwordHash = await bcrypt.hash('komal@1998', 10);

  if (!user) {
    user = await User.create({
      email: 'komal@gmail.com',
      passwordHash,
      name: 'Komal',
      baseCurrency: 'INR',
      theme: 'dark',
      defaultAccountScope: 'ALL',
    });
    console.log(`[EnsureKomal] Created user: komal@gmail.com (id: ${user._id})`);
  } else {
    user.passwordHash = passwordHash;
    user.name = user.name || 'Komal';
    await user.save();
    console.log(`[EnsureKomal] Updated password for existing user: komal@gmail.com (id: ${user._id})`);
  }

  // Ensure primary TradingAccount exists
  let primaryAccount = await TradingAccount.findOne({ userId: user._id, isArchived: { $ne: true } });
  if (!primaryAccount) {
    primaryAccount = await TradingAccount.create({
      userId: user._id,
      name: 'Komal F&O Primary',
      accountType: 'FUTURES_OPTIONS',
      broker: 'FYERS',
      initialBalance: 500000,
      currentBalance: 500000,
      baseCurrency: 'INR',
      status: 'ACTIVE',
      profile: {
        marketRegion: 'IN',
        baseCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        feeModelKey: 'INDIA_STATUTORY',
        executionAdapterKey: 'FYERS',
        positionModel: 'NETTING_FIFO',
        sessionCalendarKey: 'NSE',
        capabilities: {
          canPlaceOrders: true,
          canModifyOrders: true,
          canCancelOrders: true,
          canTrackExcursions: true,
          canSyncFunds: true,
          canReconcileTrades: true,
          canFetchLiveQuotes: true,
          canStreamOrderbook: true,
        },
      },
    });
    console.log(`[EnsureKomal] Created primary trading account: ${primaryAccount.name} (id: ${primaryAccount._id})`);
  } else {
    console.log(`[EnsureKomal] Primary trading account already exists: ${primaryAccount.name}`);
  }

  // Ensure strategies exist
  for (const s of FOUR_STRATEGIES) {
    const existing = await Strategy.findOne({
      userId: user._id,
      $or: [
        { name: s.name },
        { name: s.name.replace('—', '-') },
        { name: s.name.replace('-', '—') },
      ],
    });
    if (!existing) {
      await Strategy.create({
        ...s,
        userId: user._id,
      });
      console.log(`[EnsureKomal] Seeded strategy: ${s.name}`);
    }
  }

  console.log('✅ User komal@gmail.com with password komal@1998 is ready!');
  await disconnectDatabase();
}

if (process.argv[1]?.includes('ensure-komal-user')) {
  ensureKomalUser().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
