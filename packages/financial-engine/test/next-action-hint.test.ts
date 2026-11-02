import { describe, it, expect } from 'vitest';
import {
  selectNextActionHint,
  ILiveOpenTradeMetric,
} from '../src/live-watcher.js';

describe('Deterministic Next-Action Hint Selection (selectNextActionHint)', () => {
  const createBaseMetric = (overrides?: Partial<ILiveOpenTradeMetric>): ILiveOpenTradeMetric => ({
    tradeId: 't-123',
    symbol: 'NIFTY26OCT25000CE',
    direction: 'LONG',
    quantity: 50,
    entryPrice: 100,
    currentLtp: 105,
    priceDeltaPoints: 5,
    priceDeltaPercent: 5,
    floatingGrossPnL: 250,
    estimatedCharges: 30,
    floatingNetPnL: 220,
    initialRiskAmount: 500,
    unrealizedR: 0.44,
    stopLoss: 90,
    target: 120,
    distanceToStopPoints: 15,
    distanceToStopTicks: 300,
    distanceToStopPercent: 14.28,
    stopThreatLevel: 'SAFE',
    distanceToTargetPoints: 15,
    distanceToTargetTicks: 300,
    targetProgressPercent: 25,
    tickSize: 0.05,
    provider: 'FYERS',
    asOf: new Date(),
    giveback: {
      peakFloatingNetPnL: 220,
      peakUnrealizedR: 0.44,
      peakLtp: 105,
      givebackAmount: 0,
      givebackPercent: 0,
      retentionPercent: 100,
      threatLevel: 'SAFE',
    },
    ...overrides,
  });

  it('Priority 1: returns STOP_BREACHED when stop loss is breached, regardless of other conditions', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'BREACHED',
      distanceToStopPoints: -2,
      giveback: {
        peakFloatingNetPnL: 1000,
        peakUnrealizedR: 2.0,
        peakLtp: 140,
        givebackAmount: 1200,
        givebackPercent: 120,
        retentionPercent: 0,
        threatLevel: 'CRITICAL_REVERSAL',
      },
      targetLadder: {
        initialRiskPoints: 10,
        initialRiskAmount: 500,
        activeStepIndex: 1,
        steps: [
          {
            targetIndex: 1,
            name: 'T1 (+1.0R)',
            targetR: 1.0,
            targetPrice: 110,
            plannedExitRatio: 0.5,
            plannedExitQty: 25,
            suggestedStopLoss: 100,
            suggestedStopLabel: 'Move to BE',
            distancePoints: 0,
            distancePercent: 0,
            progressPercent: 100,
            status: 'MET',
            isActionable: true,
          },
        ],
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).not.toBeNull();
    expect(hint?.type).toBe('STOP_BREACHED');
    expect(hint?.priority).toBe(1);
    expect(hint?.severity).toBe('error');
    expect(hint?.dialogType).toBe('CLOSE_ALL');
    expect(hint?.dialogPayload?.suggestedExitRatio).toBe(1.0);
    expect(hint?.actionText).toBe('Market Exit 100%');
  });

  it('Priority 2: returns STOP_CRITICAL when stop threat is critical over giveback and ladder steps', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'CRITICAL',
      distanceToStopPoints: 1.2,
      giveback: {
        peakFloatingNetPnL: 600,
        peakUnrealizedR: 1.2,
        peakLtp: 112,
        givebackAmount: 550,
        givebackPercent: 91.6,
        retentionPercent: 8.4,
        threatLevel: 'CRITICAL_REVERSAL',
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).not.toBeNull();
    expect(hint?.type).toBe('STOP_CRITICAL');
    expect(hint?.priority).toBe(2);
    expect(hint?.severity).toBe('error');
    expect(hint?.dialogType).toBe('CLOSE_ALL');
    expect(hint?.dialogPayload?.suggestedExitRatio).toBe(1.0);
  });

  it('Priority 3: returns CRITICAL_REVERSAL when giveback drops severely from >= 1R peak', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'SAFE',
      distanceToStopPoints: 12,
      unrealizedR: 0.15,
      giveback: {
        peakFloatingNetPnL: 800,
        peakUnrealizedR: 1.6,
        peakLtp: 116,
        givebackAmount: 720,
        givebackPercent: 90,
        retentionPercent: 10,
        threatLevel: 'CRITICAL_REVERSAL',
      },
      targetLadder: {
        initialRiskPoints: 10,
        initialRiskAmount: 500,
        activeStepIndex: 1,
        steps: [
          {
            targetIndex: 1,
            name: 'T1 (+1.0R)',
            targetR: 1.0,
            targetPrice: 110,
            plannedExitRatio: 0.5,
            plannedExitQty: 25,
            suggestedStopLoss: 100,
            suggestedStopLabel: 'Move to BE',
            distancePoints: 0,
            distancePercent: 0,
            progressPercent: 100,
            status: 'MET',
            isActionable: true,
          },
        ],
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).not.toBeNull();
    expect(hint?.type).toBe('CRITICAL_REVERSAL');
    expect(hint?.priority).toBe(3);
    expect(hint?.severity).toBe('error');
    expect(hint?.dialogType).toBe('CLOSE_ALL');
    expect(hint?.actionText).toBe('Flatten Trade Now');
  });

  it('Priority 4: returns LADDER_STEP_MET when a target step is met and no higher threat exists', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'SAFE',
      unrealizedR: 1.05,
      giveback: {
        peakFloatingNetPnL: 520,
        peakUnrealizedR: 1.05,
        peakLtp: 110.5,
        givebackAmount: 0,
        givebackPercent: 0,
        retentionPercent: 100,
        threatLevel: 'SAFE',
      },
      targetLadder: {
        initialRiskPoints: 10,
        initialRiskAmount: 500,
        activeStepIndex: 1,
        steps: [
          {
            targetIndex: 1,
            name: 'T1 (+1.0R)',
            targetR: 1.0,
            targetPrice: 110,
            plannedExitRatio: 0.5,
            plannedExitQty: 25,
            suggestedStopLoss: 100.5,
            suggestedStopLabel: 'Lock True BE (₹100.50)',
            distancePoints: 0,
            distancePercent: 0,
            progressPercent: 100,
            status: 'MET',
            isActionable: true,
          },
        ],
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).not.toBeNull();
    expect(hint?.type).toBe('LADDER_STEP_MET');
    expect(hint?.priority).toBe(4);
    expect(hint?.severity).toBe('warning');
    expect(hint?.dialogType).toBe('PARTIAL_LADDER');
    expect(hint?.dialogPayload?.ladderStep).toBe('t1');
    expect(hint?.dialogPayload?.suggestedExitRatio).toBe(0.5);
    expect(hint?.dialogPayload?.suggestedNewStopLoss).toBe(100.5);
    expect(hint?.actionText).toContain('Execute T1 (+1.0R) (50%)');
  });

  it('Priority 5: returns PROFIT_LEAKING when giveback threat is LEAKING', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'SAFE',
      unrealizedR: 0.65,
      giveback: {
        peakFloatingNetPnL: 900,
        peakUnrealizedR: 1.8,
        peakLtp: 118,
        givebackAmount: 360,
        givebackPercent: 40,
        retentionPercent: 60,
        threatLevel: 'LEAKING',
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).not.toBeNull();
    expect(hint?.type).toBe('PROFIT_LEAKING');
    expect(hint?.priority).toBe(5);
    expect(hint?.severity).toBe('warning');
    expect(hint?.dialogType).toBe('CLOSE_ALL');
    expect(hint?.dialogPayload?.suggestedExitRatio).toBe(0.5);
    expect(hint?.actionText).toBe('Book 50% Partial');
  });

  it('Priority 6: returns TRADE_STAGNANT when stagnation flag is set and no higher threats exist', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'SAFE',
      giveback: {
        peakFloatingNetPnL: 100,
        peakUnrealizedR: 0.2,
        peakLtp: 102,
        givebackAmount: 0,
        givebackPercent: 0,
        retentionPercent: 100,
        threatLevel: 'SAFE',
      },
      stagnation: {
        minutesOpen: 45,
        minutesSincePeakMfe: 38,
        pnlVelocityPerMinute: 0.1,
        rVelocityPerMinute: 0.001,
        isStagnant: true,
        stagnationThreat: 'CRITICAL_THETA_DECAY',
        holdingEfficiencyScore: 22,
        timeStopSuggested: true,
        message: 'No momentum for 38 mins with severe theta bleed',
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).not.toBeNull();
    expect(hint?.type).toBe('TRADE_STAGNANT');
    expect(hint?.priority).toBe(6);
    expect(hint?.severity).toBe('info');
    expect(hint?.dialogType).toBe('CLOSE_ALL');
    expect(hint?.actionText).toBe('Review Time Exit');
  });

  it('returns null when position is SAFE and progressing normally', () => {
    const metric = createBaseMetric({
      stopThreatLevel: 'SAFE',
      unrealizedR: 0.45,
      giveback: {
        peakFloatingNetPnL: 225,
        peakUnrealizedR: 0.45,
        peakLtp: 104.5,
        givebackAmount: 0,
        givebackPercent: 0,
        retentionPercent: 100,
        threatLevel: 'SAFE',
      },
      targetLadder: {
        initialRiskPoints: 10,
        initialRiskAmount: 500,
        activeStepIndex: 1,
        steps: [
          {
            targetIndex: 1,
            name: 'T1 (+1.0R)',
            targetR: 1.0,
            targetPrice: 110,
            plannedExitRatio: 0.5,
            plannedExitQty: 25,
            suggestedStopLoss: 100,
            suggestedStopLabel: 'Move to BE',
            distancePoints: 5.5,
            distancePercent: 5,
            progressPercent: 45,
            status: 'IN_PROGRESS',
            isActionable: false,
          },
        ],
      },
    });

    const hint = selectNextActionHint(metric);
    expect(hint).toBeNull();
  });
});

