import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { AccountTransaction, Trade, TradingAccount } from '../db/models/index.js';

export interface AccountBalanceSummary {
  accountId: string;
  initialBalance: number;
  realizedPnL: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalAdjustments: number;
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

    // 1. Aggregate Realized P&L from all closed trades for this account
    const tradeStats = await Trade.aggregate([
      {
        $match: {
          accountId: accId,
          userId: uId,
          status: 'CLOSED',
        },
      },
      {
        $group: {
          _id: null,
          totalNetPnL: { $sum: '$calculated.netPnL' },
          closedTradesCount: { $sum: 1 },
        },
      },
    ]);

    const openTradesCount = await Trade.countDocuments({
      accountId: accId,
      userId: uId,
      status: 'OPEN',
    });

    // 2. Aggregate Transactions (Deposits, Withdrawals, Adjustments)
    const transactionStats = await AccountTransaction.aggregate([
      {
        $match: {
          accountId: accId,
          userId: uId,
        },
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    let totalDeposits = new Decimal(0);
    let totalWithdrawals = new Decimal(0);
    let totalAdjustments = new Decimal(0);

    for (const stat of transactionStats) {
      const amountDec = new Decimal(stat.totalAmount.toString());
      if (stat._id === 'DEPOSIT') {
        totalDeposits = totalDeposits.plus(amountDec);
      } else if (stat._id === 'WITHDRAWAL') {
        totalWithdrawals = totalWithdrawals.plus(amountDec);
      } else if (stat._id === 'ADJUSTMENT') {
        totalAdjustments = totalAdjustments.plus(amountDec);
      }
    }

    const rawNetPnL = tradeStats.length > 0 ? tradeStats[0].totalNetPnL : 0;
    const realizedPnL = new Decimal(rawNetPnL ?? 0);
    const initialBalance = new Decimal(account.initialBalance.toString());

    // Current balance = Initial + Realized P&L + Deposits - Withdrawals + Adjustments
    const currentBalance = initialBalance
      .plus(realizedPnL)
      .plus(totalDeposits)
      .minus(totalWithdrawals)
      .plus(totalAdjustments);

    // Persist updated exact Decimal128 values back to the account document
    account.realizedPnL = mongoose.Types.Decimal128.fromString(realizedPnL.toFixed(2));
    account.totalDeposits = mongoose.Types.Decimal128.fromString(totalDeposits.toFixed(2));
    account.totalWithdrawals = mongoose.Types.Decimal128.fromString(totalWithdrawals.toFixed(2));
    account.currentBalance = mongoose.Types.Decimal128.fromString(currentBalance.toFixed(2));

    await account.save();

    return {
      accountId: account._id.toString(),
      initialBalance: initialBalance.toNumber(),
      realizedPnL: Number(realizedPnL.toFixed(2)),
      totalDeposits: Number(totalDeposits.toFixed(2)),
      totalWithdrawals: Number(totalWithdrawals.toFixed(2)),
      totalAdjustments: Number(totalAdjustments.toFixed(2)),
      currentBalance: Number(currentBalance.toFixed(2)),
      closedTradesCount: tradeStats.length > 0 ? tradeStats[0].closedTradesCount : 0,
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
