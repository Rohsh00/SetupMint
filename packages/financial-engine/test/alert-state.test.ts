import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  evaluateAlert,
  buildAlertContext,
  AlertStateSnapshot,
  DEFAULT_ALERT_POLICIES,
} from '../src/alert-state.js';

describe('Alert State Machine & Hysteresis Decision Engine', () => {
  const baseTime = new Date('2026-10-30T10:00:00Z');

  it('triggers SEND_NEW (FIRST) on initial breach', () => {
    const decision = evaluateAlert(null, {
      type: 'STOP_THREAT',
      severity: 2, // CRITICAL
      metricValue: new Decimal('0.20'), // <= 0.25 (CRITICAL)
      now: baseTime,
    });

    expect(decision.action).toBe('SEND_NEW');
    if (decision.action === 'SEND_NEW') {
      expect(decision.reason).toBe('FIRST');
      expect(decision.enterCount).toBe(1);
      expect(decision.isRepeat).toBe(false);
      expect(decision.audible).toBe(true);
    }
  });

  it('flapping inside the hysteresis band sends zero new alerts (EDIT_SILENT / SKIP)', () => {
    // Initial state: in CRITICAL at 0.20
    const snapshot: AlertStateSnapshot = {
      state: 'ACTIVE',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      pingCount: 0,
    };

    // Buffer rises to 0.35 (above 0.25 enter, but below 0.40 clear) -> Flapping in hysteresis band!
    // At t + 5s (less than 10s minEditInterval) -> SKIP (EDIT_THROTTLED)
    const t5s = new Date(baseTime.getTime() + 5000);
    const d1 = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.35'),
      now: t5s,
    });
    expect(d1.action).toBe('SKIP');

    // At t + 15s (greater than 10s minEditInterval) -> EDIT_SILENT
    const t15s = new Date(baseTime.getTime() + 15000);
    const d2 = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.35'),
      now: t15s,
    });
    expect(d2.action).toBe('EDIT_SILENT');
    if (d2.action === 'EDIT_SILENT') {
      expect(d2.audible).toBe(false);
    }
  });

  it('clears alert when metric passes clear threshold', () => {
    const snapshot: AlertStateSnapshot = {
      state: 'ACTIVE',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      pingCount: 0,
    };

    // Buffer rises to 0.45 (> 0.40 clear threshold)
    const d = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 0,
      metricValue: new Decimal('0.45'),
      now: new Date(baseTime.getTime() + 20000),
    });

    expect(d.action).toBe('CLEAR');
  });

  it('suppresses re-entry during re-arm cooldown window (minRearmMs)', () => {
    const clearedAt = new Date(baseTime.getTime() + 30000);
    const snapshot: AlertStateSnapshot = {
      state: 'CLEARED',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      clearedAt,
      pingCount: 0,
    };

    // 1 minute after clear (minRearmMs is 3 minutes) -> Price dips back to 0.20
    const t1mAfterClear = new Date(clearedAt.getTime() + 60000);
    const d = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.20'),
      now: t1mAfterClear,
    });

    expect(d.action).toBe('SKIP');
    if (d.action === 'SKIP') {
      expect(d.reason).toContain('REARM_COOLDOWN');
    }
  });

  it('allows re-entry after minRearmMs with isRepeat=true and enterCount=2', () => {
    const clearedAt = new Date(baseTime.getTime() + 30000);
    const snapshot: AlertStateSnapshot = {
      state: 'CLEARED',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      clearedAt,
      pingCount: 0,
    };

    // 3.5 minutes after clear (exceeds minRearmMs of 180s) -> Price re-breaches into CRITICAL
    const t3_5mAfterClear = new Date(clearedAt.getTime() + 210000);
    const d = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.22'),
      now: t3_5mAfterClear,
    });

    expect(d.action).toBe('SEND_NEW');
    if (d.action === 'SEND_NEW') {
      expect(d.reason).toBe('REENTRY');
      expect(d.isRepeat).toBe(true);
      expect(d.enterCount).toBe(2);
      expect(d.audible).toBe(true);
    }
  });

  it('escalates severity with audible SEND_NEW; de-escalation produces EDIT_SILENT', () => {
    // Start in WARNING (severity 1)
    const snapshot: AlertStateSnapshot = {
      state: 'ACTIVE',
      severity: 1,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      pingCount: 0,
    };

    // Escalates to CRITICAL (severity 2)
    const dEscalate = evaluateAlert(snapshot, {
      type: 'GIVEBACK',
      severity: 2,
      metricValue: new Decimal('55'),
      now: new Date(baseTime.getTime() + 15000),
    });

    expect(dEscalate.action).toBe('SEND_NEW');
    if (dEscalate.action === 'SEND_NEW') {
      expect(dEscalate.reason).toBe('ESCALATION');
      expect(dEscalate.audible).toBe(true);
      expect(dEscalate.severity).toBe(2);
    }

    // Now snapshot is severity 2. De-escalation back to severity 1
    const snapshotSev2: AlertStateSnapshot = {
      ...snapshot,
      severity: 2,
      lastSentAt: new Date(baseTime.getTime() + 15000),
    };

    const dDeescalate = evaluateAlert(snapshotSev2, {
      type: 'GIVEBACK',
      severity: 1,
      metricValue: new Decimal('38'),
      now: new Date(baseTime.getTime() + 30000),
    });

    expect(dDeescalate.action).toBe('EDIT_SILENT');
    if (dDeescalate.action === 'EDIT_SILENT') {
      expect(dDeescalate.audible).toBe(false);
    }
  });

  it('snooze suppresses identical or lower severity, broken only by escalation', () => {
    const snoozedUntil = new Date(baseTime.getTime() + 600000); // 10m snooze
    const snapshot: AlertStateSnapshot = {
      state: 'SNOOZED',
      severity: 2, // CRITICAL
      snoozedSeverity: 2,
      snoozedUntil,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      pingCount: 0,
    };

    // While snoozed, another CRITICAL tick (severity 2) arrives -> SKIP
    const dSnoozed = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.15'),
      now: new Date(baseTime.getTime() + 60000),
    });
    expect(dSnoozed.action).toBe('SKIP');
    if (dSnoozed.action === 'SKIP') {
      expect(dSnoozed.reason).toBe('SNOOZED');
    }

    // Escalates to BREACHED (severity 3) -> Breaks snooze!
    const dBreak = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 3,
      metricValue: new Decimal('0'),
      now: new Date(baseTime.getTime() + 120000),
    });
    expect(dBreak.action).toBe('SEND_NEW');
    if (dBreak.action === 'SEND_NEW') {
      expect(dBreak.reason).toBe('ESCALATION');
      expect(dBreak.audible).toBe(true);
      expect(dBreak.severity).toBe(3);
    }
  });

  it('re-ping schedule triggers at 2m and 5m for unacknowledged CRITICAL up to maxRepings', () => {
    const snapshot0: AlertStateSnapshot = {
      state: 'ACTIVE',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      pingCount: 0,
    };

    // At 1 minute -> Not yet 2 minutes
    const d1 = evaluateAlert(snapshot0, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.20'),
      now: new Date(baseTime.getTime() + 60000),
    });
    expect(d1.action).not.toBe('SEND_NEW');

    // At 2 minutes (120,000 ms) -> 1st Re-ping
    const dReping1 = evaluateAlert(snapshot0, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.20'),
      now: new Date(baseTime.getTime() + 120000),
    });
    expect(dReping1.action).toBe('SEND_NEW');
    if (dReping1.action === 'SEND_NEW') {
      expect(dReping1.reason).toBe('REPING');
    }

    // After 3 re-pings (pingCount = 3), maxRepings (3) reached -> stops repinging
    const snapshot3: AlertStateSnapshot = {
      state: 'ACTIVE',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: new Date(baseTime.getTime() + 720000),
      pingCount: 3,
    };

    const dMax = evaluateAlert(snapshot3, {
      type: 'STOP_THREAT',
      severity: 2,
      metricValue: new Decimal('0.20'),
      now: new Date(baseTime.getTime() + 1200000),
    });
    expect(dMax.action).not.toBe('SEND_NEW');
  });

  it('trade closed gives RESOLVE', () => {
    const snapshot: AlertStateSnapshot = {
      state: 'ACTIVE',
      severity: 2,
      enterCount: 1,
      firstAt: baseTime,
      lastSentAt: baseTime,
      pingCount: 0,
    };

    const d = evaluateAlert(snapshot, {
      type: 'STOP_THREAT',
      severity: 0,
      metricValue: new Decimal('0'),
      now: new Date(baseTime.getTime() + 10000),
      isClosed: true,
    });

    expect(d.action).toBe('RESOLVE');
  });

  describe('buildAlertContext', () => {
    it('computes exact If-SL loss including Indian statutory charges without float drift for LONG', () => {
      const ctx = buildAlertContext({
        direction: 'LONG',
        quantity: 50,
        entryPrice: 24500,
        currentLtp: 24450,
        stopLoss: 24400,
        assetClass: 'EQUITY',
        unrealizedR: -0.5,
        peakUnrealizedR: 1.2,
        minutesInTrade: 15,
        priceDeltaPoints60s: -2.5,
        enterCount: 2,
        currentDailyLoss: 5000,
        maxDailyLoss: 15000,
        totalOpenRiskAcrossTrades: 8500,
      });

      expect(ctx.ltpStr).toBe('₹24450.00');
      expect(ctx.stopStr).toBe('₹24400.00');
      expect(ctx.ptsToStopStr).toBe('50.0 pts');
      expect(ctx.retestNotice).toBe('↩️ 2nd test');
      expect(ctx.dayLossUsageStr).toBe('₹5,000 / ₹15,000 (33%)');
      expect(ctx.totalOpenRiskStr).toBe('₹8,500');

      // Gross loss at SL = 50 * (24400 - 24500) = -5000
      // With Indian statutory charges, ifSlLossAmount must be < -5000 (more negative due to fees)
      expect(ctx.ifSlLossAmount.lessThan(-5000)).toBe(true);

      // Exiting now at 24450 saves money vs taking the full stop at 24400
      expect(ctx.exitNowSavesAmount.greaterThan(2000)).toBe(true);
    });

    it('computes exact If-SL loss and savings for SHORT trades', () => {
      const ctx = buildAlertContext({
        direction: 'SHORT',
        quantity: 50,
        entryPrice: 24500,
        currentLtp: 24550,
        stopLoss: 24600,
        assetClass: 'EQUITY',
        unrealizedR: -0.5,
      });

      expect(ctx.ltpStr).toBe('₹24550.00');
      expect(ctx.stopStr).toBe('₹24600.00');
      expect(ctx.ptsToStopStr).toBe('50.0 pts');
      // For short: stop is higher than entry. Gross loss at SL = 50 * (24500 - 24600) = -5000
      expect(ctx.ifSlLossAmount.lessThan(-5000)).toBe(true);
    });
  });
});

