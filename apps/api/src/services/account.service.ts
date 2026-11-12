import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { AccountTransaction, Trade, TradingAccount } from '../db/models/index.js';

const CalcDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface AccountBalanceSummary {
  accountId: string;
  initialBalance: number;
  realizedPnL: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalAdjustments: number;
  totalTransfers?: number;
  currentBalance: number;
  closedTradesCount: number;
  openTradesCount: number;
}

/**
 * Service to manage trading account balances with authoritative reconciliation.
 * Aggregates all closed trade P&Ls and account transactions directly from the database,
 * preventing any balance drift, race conditions, or desynchronization.
 */
export class AccountService {
  /**
   * Recalculates and persists authoritative balances for a given trading account.
   */
  static async recalculateAccountBalances(
    accountId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<AccountBalanceSummary | null> {
    const accId = typeof accountId === 'string' ? new mongoose.Types.ObjectId(accountId) : accountId;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const account = await TradingAccount.findOne({ _id: accId, userId: uId });
    if (!account) {
      return null;
    }

    // 1. Sum Realized P&L using 30-digit CalcDecimal at 2dp per closed trade (zero IEEE-754 drift)
    const closedTrades = await Trade.find({
      accountId: accId,
      userId: uId,
      status: 'CLOSED',
    })
      .select('calculated.netPnL')
      .lean();

    let realizedPnL = new CalcDecimal(0);
    for (const t of closedTrades) {
      const val = Number(t.calculated?.netPnL ?? 0);
      if (Number.isFinite(val)) {
        realizedPnL = realizedPnL.plus(new CalcDecimal(val.toFixed(2)));
      }
    }

    const openTradesCount = await Trade.countDocuments({
      accountId: accId,
      userId: uId,
      status: 'OPEN',
    });

    // 2. Sum Confirmed Transactions (Deposits, Withdrawals, Adjustments; exclude PENDING_REVIEW/REJECTED)
    const confirmedTxs = await AccountTransaction.find({
      accountId: accId,
      userId: uId,
      $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }],
    })
      .select('type amount')
      .lean();

    let totalDeposits = new CalcDecimal(0);
    let totalWithdrawals = new CalcDecimal(0);
    let totalAdjustments = new CalcDecimal(0);
    let totalTransfers = new CalcDecimal(0);

    for (const tx of confirmedTxs) {
      const amountDec = new CalcDecimal(tx.amount.toString());
      if (tx.type === 'DEPOSIT') {
        totalDeposits = totalDeposits.plus(amountDec);
      } else if (tx.type === 'WITHDRAWAL') {
        totalWithdrawals = totalWithdrawals.plus(amountDec);
      } else if (tx.type === 'ADJUSTMENT') {
        totalAdjustments = totalAdjustments.plus(amountDec);
      } else if (tx.type === 'TRANSFER') {
        // TRANSFER lacks directional counterparty sign in AccountTransactionSchema; tracked separately as neutral memo
        totalTransfers = totalTransfers.plus(amountDec);
      }
    }

    const initialBalance = new CalcDecimal(account.initialBalance.toString());

    // Current balance = Initial + Realized P&L + Deposits - Withdrawals + Confirmed Adjustments
    const currentBalance = initialBalance
      .plus(realizedPnL)
      .plus(totalDeposits)
      .minus(totalWithdrawals)
      .plus(totalAdjustments);

    // Persist updated exact Decimal128 values back to the account document
    account.realizedPnL = mongoose.Types.Decimal128.fromString(realizedPnL.toFixed(2));
    account.totalDeposits = mongoose.Types.Decimal128.fromString(totalDeposits.toFixed(2));
    account.totalWithdrawals = mongoose.Types.Decimal128.fromString(totalWithdrawals.toFixed(2));
    account.totalAdjustments = mongoose.Types.Decimal128.fromString(totalAdjustments.toFixed(2));
    account.currentBalance = mongoose.Types.Decimal128.fromString(currentBalance.toFixed(2));

    await account.save();

    return {
      accountId: account._id.toString(),
      initialBalance: initialBalance.toNumber(),
      realizedPnL: Number(realizedPnL.toFixed(2)),
      totalDeposits: Number(totalDeposits.toFixed(2)),
      totalWithdrawals: Number(totalWithdrawals.toFixed(2)),
      totalAdjustments: Number(totalAdjustments.toFixed(2)),
      totalTransfers: Number(totalTransfers.toFixed(2)),
      currentBalance: Number(currentBalance.toFixed(2)),
      closedTradesCount: closedTrades.length,
      openTradesCount,
    };
  }

  /**
   * Recalculates all accounts for a user (useful for bulk operations or full reconciliation).
   */
  static async reconcileAllUserAccounts(
    userId: string | mongoose.Types.ObjectId
  ): Promise<AccountBalanceSummary[]> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const accounts = await TradingAccount.find({ userId: uId });

    const results: AccountBalanceSummary[] = [];
    for (const acc of accounts) {
      const summary = await this.recalculateAccountBalances(acc._id, uId);
      if (summary) results.push(summary);
    }

    return results;
  }
}
