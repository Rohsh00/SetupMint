import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import mongoose from 'mongoose';
import { User, TradingAccount, AccountTransaction } from '../db/models/index.js';
import { AccountService } from '../services/account.service.js';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';

interface CashFlowItem {
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  currency: string;
  date: Date;
  ref: string;
  notes: string;
  existingId?: string;
}

const ELEFIN_TRANSACTIONS: CashFlowItem[] = [
  // 1. Withdrawal 10 Nov: WDR-0B5B4A ($20.00)
  {
    type: 'WITHDRAWAL',
    amount: 20.00,
    currency: 'USD',
    date: new Date('2026-11-10T04:32:00.000Z'), // 10 Nov, 10:02 IST
    ref: 'WDR-0B5B4A',
    notes: 'Bank Transfer Withdrawal (Ref: WDR-0B5B4A)',
  },
  // 2. Deposit 12 Nov: DEP-URFYCZ ($50.51)
  {
    type: 'DEPOSIT',
    amount: 50.51,
    currency: 'USD',
    date: new Date('2026-11-12T05:40:00.000Z'), // 12 Nov, 11:10 IST
    ref: 'DEP-URFYCZ',
    notes: 'Services247 Deposit (Ref: DEP-URFYCZ)',
  },
  // 3. Withdrawal 13 Nov: WDR-379C9A ($53.00)
  {
    type: 'WITHDRAWAL',
    amount: 53.00,
    currency: 'USD',
    date: new Date('2026-11-13T18:21:00.000Z'), // 13 Nov, 23:51 IST
    ref: 'WDR-379C9A',
    notes: 'Bank Transfer Withdrawal (Ref: WDR-379C9A)',
    existingId: '6af755d32a1a06836d9b5ec7',
  },
  // 4. Withdrawal 16/17 Nov: WDR-3A5CFD ($60.00)
  {
    type: 'WITHDRAWAL',
    amount: 60.00,
    currency: 'USD',
    date: new Date('2026-11-16T18:30:00.000Z'), // 17 Nov, 00:00 IST / 16 Nov night
    ref: 'WDR-3A5CFD',
    notes: 'Bank Transfer Withdrawal (Ref: WDR-3A5CFD)',
  },
  // 5. Deposit 17 Nov: DEP-BD7ZHF ($50.00)
  {
    type: 'DEPOSIT',
    amount: 50.00,
    currency: 'USD',
    date: new Date('2026-11-17T17:54:00.000Z'), // 17 Nov, 23:24 IST
    ref: 'DEP-BD7ZHF',
    notes: 'Services247 Deposit (Ref: DEP-BD7ZHF)',
    existingId: '6afc9b8f2be40d326055558c',
  },
  // 6. Deposit 18 Nov: DEP-BK0YT5 ($50.51)
  {
    type: 'DEPOSIT',
    amount: 50.51,
    currency: 'USD',
    date: new Date('2026-11-18T06:26:00.000Z'), // 18 Nov, 11:56 IST
    ref: 'DEP-BK0YT5',
    notes: 'Services247 Deposit (Ref: DEP-BK0YT5)',
  },
  // 7. Withdrawal 20 Nov: WDR-8713AB ($100.00)
  {
    type: 'WITHDRAWAL',
    amount: 100.00,
    currency: 'USD',
    date: new Date('2026-11-20T10:29:00.000Z'), // 20 Nov, 15:59 IST
    ref: 'WDR-8713AB',
    notes: 'Bank Transfer Withdrawal (Ref: WDR-8713AB)',
  },
  // 8. Withdrawal 21 Nov: WDR-44C863 ($50.00)
  {
    type: 'WITHDRAWAL',
    amount: 50.00,
    currency: 'USD',
    date: new Date('2026-11-21T13:53:00.000Z'), // 21 Nov, 19:23 IST
    ref: 'WDR-44C863',
    notes: 'Bank Transfer Withdrawal (Ref: WDR-44C863)',
    existingId: '6b01a25d00115bd98fe5ded1',
  },
];

async function main() {
  await connectDatabase();
  console.log('[SyncElefinCashflow] Connected to database');

  const user = await User.findOne({ email: 'komal@gmail.com' });
  if (!user) throw new Error('User komal@gmail.com not found');

  const account = await TradingAccount.findOne({
    userId: user._id,
    $or: [{ name: /elefin/i }, { broker: /elefin/i }],
  });
  if (!account) throw new Error('Elefin account not found');

  console.log(`[SyncElefinCashflow] Found account: ${account.name} (ID: ${account._id})`);

  for (const item of ELEFIN_TRANSACTIONS) {
    let tx: any = null;

    // Check by idempotency key first
    tx = await AccountTransaction.findOne({
      userId: user._id,
      accountId: account._id,
      idempotencyKey: item.ref,
    });

    // Check by existing ObjectId if specified
    if (!tx && item.existingId) {
      tx = await AccountTransaction.findOne({
        _id: new mongoose.Types.ObjectId(item.existingId),
        userId: user._id,
        accountId: account._id,
      });
    }

    if (tx) {
      console.log(`[SyncElefinCashflow] Updating existing tx: ${item.ref} (${item.type} $${item.amount})`);
      tx.type = item.type;
      tx.amount = mongoose.Types.Decimal128.fromString(item.amount.toFixed(2));
      tx.currency = item.currency;
      tx.date = item.date;
      tx.notes = item.notes;
      tx.idempotencyKey = item.ref;
      tx.source = 'MANUAL';
      tx.status = 'CONFIRMED';
      await tx.save();
    } else {
      console.log(`[SyncElefinCashflow] Creating new tx: ${item.ref} (${item.type} $${item.amount})`);
      await AccountTransaction.create({
        userId: user._id,
        accountId: account._id,
        type: item.type,
        amount: mongoose.Types.Decimal128.fromString(item.amount.toFixed(2)),
        currency: item.currency,
        date: item.date,
        notes: item.notes,
        idempotencyKey: item.ref,
        source: 'MANUAL',
        status: 'CONFIRMED',
      });
    }
  }

  // Recalculate authoritative account balances
  console.log('[SyncElefinCashflow] Recalculating account balances...');
  const summary = await AccountService.recalculateAccountBalances(account._id, user._id);
  console.log('[SyncElefinCashflow] Updated Account Summary:', summary);

  const allTxs = await AccountTransaction.find({
    userId: user._id,
    accountId: account._id,
  }).sort({ date: 1 }).lean();

  console.log(`\n[SyncElefinCashflow] Total Confirmed Transactions (${allTxs.length}):`);
  for (const t of allTxs) {
    console.log(`- ${t.date.toISOString()} | ${t.type.padEnd(10)} | $${Number(t.amount.toString()).toFixed(2)} | Ref: ${t.idempotencyKey || 'none'} | Notes: ${t.notes}`);
  }

  await disconnectDatabase();
  console.log('[SyncElefinCashflow] Done!');
}

main().catch((err) => {
  console.error('[SyncElefinCashflow] Error:', err);
  process.exit(1);
});

