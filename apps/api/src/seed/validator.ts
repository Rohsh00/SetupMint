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

    // Check 3: Instruments & Referential Integrity
    const instruments = await Instrument.find({ userId });
    const tradesForCheck = await Trade.find({ userId });
    const instrumentIdSet = new Set(instruments.map((i) => i._id.toString()));
    const unreferencedTrades = tradesForCheck.filter(
      (t) => !t.instrumentId || !instrumentIdSet.has(t.instrumentId.toString())
    );
    const referencedInstrumentIds = new Set(tradesForCheck.map((t) => t.instrumentId?.toString()));
    const unusedInstruments = instruments.filter((i) => !referencedInstrumentIds.has(i._id.toString()));
    const instrumentsValid = instruments.length > 0 && unreferencedTrades.length === 0 && unusedInstruments.length === 0;
    checks.push({
      name: 'Instruments Traded & Referential Integrity',
      passed: instrumentsValid,
      details: `Found ${instruments.length} traded instruments; all ${tradesForCheck.length} trades point to user instruments (${unreferencedTrades.length} orphaned, ${unusedInstruments.length} unused)`,
    });
    if (!instrumentsValid) {
      if (instruments.length === 0) errors.push('No instruments found for user');
      if (unreferencedTrades.length > 0) {
        errors.push(`Trades fail referential integrity: ${unreferencedTrades.length} trades have invalid instrument reference`);
      }
      if (unusedInstruments.length > 0) {
        errors.push(`Unused instruments found: ${unusedInstruments.length} instruments exist without any trades`);
      }
    }

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

    // Check 10: Parent Strategy & Child Setup Variants
    const strategiesWithVariants = await Strategy.find({ userId, 'variants.0': { $exists: true } });
    const classifiedTrades = await Trade.find({ userId, 'setup.variantKey': { $exists: true } });
    let variantsValid = strategiesWithVariants.length >= 2 && classifiedTrades.length > 0;
    let variantCheckDetails = `Found ${strategiesWithVariants.length} strategies with child variants and ${classifiedTrades.length} classified trades`;

    if (variantsValid) {
      for (const ct of classifiedTrades) {
        const parent = strategiesWithVariants.find((s) => s._id.toString() === ct.strategyId?.toString());
        if (!parent) {
          variantsValid = false;
          variantCheckDetails = `Classified trade ${ct._id} references unknown strategyId ${ct.strategyId}`;
          break;
        }
        const hasVariant = (parent.variants || []).some((v: any) => v.key === ct.setup?.variantKey);
        if (!hasVariant) {
          variantsValid = false;
          variantCheckDetails = `Classified trade ${ct._id} has variantKey "${ct.setup?.variantKey}" not found in parent strategy "${parent.name}"`;
          break;
        }
      }
    }

    checks.push({
      name: 'Parent Strategy & Setup Variants Integrity',
      passed: variantsValid,
      details: variantCheckDetails,
    });
    if (!variantsValid) errors.push(variantCheckDetails);

    // Check 11: Excursion Invariants & Consistency
    const tradesWithExcursion = trades.filter((t) => t.calculated?.excursion?.status === 'COMPUTED');
    let excursionValid = true;
    let excursionReason = `Found ${tradesWithExcursion.length} trades with computed excursion metrics`;
    for (const t of tradesWithExcursion) {
      const exc = t.calculated!.excursion!;
      if (exc.mfePoints !== undefined && exc.mfePoints < 0) {
        excursionValid = false;
        excursionReason = `Trade ${t._id} has negative mfePoints: ${exc.mfePoints}`;
        break;
      }
      if (exc.maePoints !== undefined && exc.maePoints < 0) {
        excursionValid = false;
        excursionReason = `Trade ${t._id} has negative maePoints: ${exc.maePoints}`;
        break;
      }
      if (exc.exitEfficiency !== undefined && (exc.exitEfficiency < 0 || exc.exitEfficiency > 1.0001)) {
        excursionValid = false;
        excursionReason = `Trade ${t._id} has invalid exitEfficiency: ${exc.exitEfficiency}`;
        break;
      }
      if (exc.maeR !== undefined && exc.maeR < 0) {
        excursionValid = false;
        excursionReason = `Trade ${t._id} has negative maeR: ${exc.maeR}`;
        break;
      }
      if (exc.mfeR !== undefined && exc.mfeR < 0) {
        excursionValid = false;
        excursionReason = `Trade ${t._id} has negative mfeR: ${exc.mfeR}`;
        break;
      }
    }
    checks.push({
      name: 'Trade Excursion Invariants & Consistency',
      passed: excursionValid,
      details: excursionReason,
    });
    if (!excursionValid) errors.push(excursionReason);

    // Check 12: Stop-Loss Move Events & Discipline Invariants
    const tradesWithStopMoves = trades.filter(
      (t) => (t.stopLossMoveEvents && t.stopLossMoveEvents.length > 0) || t.calculated?.stopMoveSummary
    );
    let stopMovesValid = true;
    let stopMovesReason = `Found ${tradesWithStopMoves.length} trades with stop-loss move tracking data`;

    for (const t of tradesWithStopMoves) {
      const summary = t.calculated?.stopMoveSummary;
      const events = t.stopLossMoveEvents || [];

      if (summary) {
        if (summary.totalMoves !== summary.widenedCount + summary.trailedCount) {
          stopMovesValid = false;
          stopMovesReason = `Trade ${t._id} stopMoveSummary move count mismatch: totalMoves (${summary.totalMoves}) != widened (${summary.widenedCount}) + trailed (${summary.trailedCount})`;
          break;
        }

        if (summary.hasWidenedRisk && (!t.psychology?.stopLossMoved || !t.psychology?.mistakes?.includes('STOP_MOVED'))) {
          stopMovesValid = false;
          stopMovesReason = `Trade ${t._id} has widened stop risk but missing psychology.stopLossMoved or STOP_MOVED mistake tag`;
          break;
        }
      }

      for (const ev of events) {
        if (ev.previousStop <= 0 || ev.newStop <= 0) {
          stopMovesValid = false;
          stopMovesReason = `Trade ${t._id} has non-positive stop values: prev=${ev.previousStop}, new=${ev.newStop}`;
          break;
        }
        if (ev.changePoints < 0) {
          stopMovesValid = false;
          stopMovesReason = `Trade ${t._id} has negative changePoints: ${ev.changePoints}`;
          break;
        }
        if (!['TRAILED_FAVORABLY', 'WIDENED_RISK', 'UNCHANGED'].includes(ev.moveType)) {
          stopMovesValid = false;
          stopMovesReason = `Trade ${t._id} has invalid moveType: ${ev.moveType}`;
          break;
        }
      }
      if (!stopMovesValid) break;
    }

    checks.push({
      name: 'Stop-Loss Move Events & Discipline Invariants',
      passed: stopMovesValid,
      details: stopMovesReason,
    });
    if (!stopMovesValid) errors.push(stopMovesReason);

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
