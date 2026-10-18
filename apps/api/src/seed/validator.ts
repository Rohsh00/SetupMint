import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import {
  AccountTransaction,
  Attachment,
  DailyJournal,
  Instrument,
  Strategy,
  Trade,
  TradingAccount,
  User,
} from '../db/models/index.js';

export interface ValidationCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface ValidationReport {
  isValid: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: ValidationCheck[];
  errors: string[];
}

export class SeedValidator {
  /**
   * Authoritatively audits and validates all seeded entities and calculations.
   */
  static async validate(userEmail: string = 'trader@tradevault.local'): Promise<ValidationReport> {
    const checks: ValidationCheck[] = [];
    const errors: string[] = [];

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return {
        isValid: false,
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 1,
        checks: [{ name: 'User Exists', passed: false, details: `User ${userEmail} not found` }],
        errors: [`User ${userEmail} does not exist in database`],
      };
    }

    const userId = user._id;

    // Check 1: User Profile & Preferences
    const hasBaseCurrency = user.baseCurrency === 'INR';
    checks.push({
      name: 'User Currency & Theme',
      passed: hasBaseCurrency,
      details: `Base currency: ${user.baseCurrency}, Theme: ${user.theme}`,
    });
    if (!hasBaseCurrency) errors.push('Demo user baseCurrency must be INR');

    // Check 2: Trading Accounts count
    const accounts = await TradingAccount.find({ userId });
    checks.push({
      name: 'Trading Accounts Seeded',
      passed: accounts.length > 0,
      details: `Found ${accounts.length} trading accounts`,
    });
    if (accounts.length === 0) errors.push('No trading accounts found for user');

    // Check 3: Instruments directory
    const instruments = await Instrument.find({ userId });
    checks.push({
      name: 'Instruments Seeded',
      passed: instruments.length >= 10,
      details: `Found ${instruments.length} instruments (Equities, F&O, MCX Commodities)`,
    });
    if (instruments.length < 10) errors.push('Instrument catalogue is incomplete');

    // Check 4: Strategies playbooks
    const strategies = await Strategy.find({ userId });
    checks.push({
      name: 'Strategies Seeded',
      passed: strategies.length >= 5,
      details: `Found ${strategies.length} codified strategy playbooks`,
    });
    if (strategies.length < 5) errors.push('Strategy playbooks incomplete');

    // Check 5: Trades count & status distribution
    const trades = await Trade.find({ userId });
    const closedTrades = trades.filter((t) => t.status === 'CLOSED');
    const openTrades = trades.filter((t) => t.status === 'OPEN');
    checks.push({
      name: 'Trades Volume & Status Distribution',
      passed: trades.length > 0 && closedTrades.length > 0,
      details: `Total: ${trades.length} (Closed: ${closedTrades.length}, Open: ${openTrades.length})`,
    });
    if (trades.length === 0) errors.push('No trades found for user');

    // Check 6: Mathematical P&L reconciliation
    let mathReconciled = true;
    let mathFailedReason = '';
    for (const tr of closedTrades) {
      const calc = tr.calculated;
      const expectedNet = Number((calc.grossPnL - calc.totalCosts).toFixed(2));
      const actualNet = Number(calc.netPnL.toFixed(2));
      if (Math.abs(expectedNet - actualNet) > 0.05) {
        mathReconciled = false;
        mathFailedReason = `Trade ${tr._id}: Expected Net P&L ${expectedNet} != Actual ${actualNet}`;
        break;
      }
    }
    checks.push({
      name: 'Trade Net P&L Mathematical Reconciliation',
      passed: mathReconciled,
      details: mathReconciled
        ? 'All closed trades reconcile: Net P&L = Gross P&L - Total Costs'
        : mathFailedReason,
    });
    if (!mathReconciled) errors.push(mathFailedReason);

    // Check 7: Account Balance Reconciliation
    let accountsReconciled = true;
    let accountMismatchReason = '';
    for (const acc of accounts) {
      const initial = new Decimal(acc.initialBalance.toString());
      const realized = new Decimal(acc.realizedPnL.toString());
      const deposits = new Decimal(acc.totalDeposits.toString());
      const withdrawals = new Decimal(acc.totalWithdrawals.toString());
      const current = new Decimal(acc.currentBalance.toString());

      // Fetch adjustments from transactions
      const adjTxs = await AccountTransaction.find({ accountId: acc._id, type: 'ADJUSTMENT' });
      let adjSum = new Decimal(0);
      for (const a of adjTxs) adjSum = adjSum.plus(new Decimal(a.amount.toString()));

      const expectedCurrent = initial.plus(realized).plus(deposits).minus(withdrawals).plus(adjSum);
      if (!expectedCurrent.equals(current)) {
        accountsReconciled = false;
        accountMismatchReason = `Account ${acc.name}: Expected ${expectedCurrent.toFixed(2)} != Current ${current.toFixed(2)}`;
        break;
      }
    }
    checks.push({
      name: 'Account Balance Authoritative Reconciliation',
      passed: accountsReconciled,
      details: accountsReconciled
        ? 'All accounts reconcile: Current = Initial + Realized P&L + Deposits - Withdrawals + Adjustments'
        : accountMismatchReason,
    });
    if (!accountsReconciled) errors.push(accountMismatchReason);

    // Check 8: Daily Journal linking
    const journals = await DailyJournal.find({ userId });
    let journalsValid = journals.length > 0;
    let journalReason = `Found ${journals.length} daily journals`;
    for (const j of journals) {
      if (j.bestTradeId) {
        const found = await Trade.findOne({ _id: j.bestTradeId, userId });
        if (!found) {
          journalsValid = false;
          journalReason = `Journal for ${j.date} points to non-existent trade ${j.bestTradeId}`;
          break;
        }
      }
    }
    checks.push({
      name: 'Trading Calendar Daily Journal Foreign Keys',
      passed: journalsValid,
      details: journalReason,
    });
    if (!journalsValid) errors.push(journalReason);

    // Check 9: Attachments / Screenshots
    const attachments = await Attachment.find({ userId });
    checks.push({
      name: 'Chart Screenshots & Attachments',
      passed: attachments.length > 0,
      details: `Found ${attachments.length} SVG chart attachments linked to demo trades`,
    });

    const passedChecks = checks.filter((c) => c.passed).length;
    const failedChecks = checks.filter((c) => !c.passed).length;

    return {
      isValid: failedChecks === 0,
      totalChecks: checks.length,
      passedChecks,
      failedChecks,
      checks,
      errors,
    };
  }
}
