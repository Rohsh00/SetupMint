import { describe, it, expect } from 'vitest';
import { generatePostTradeReviewSummary } from '../src/live-watcher.js';

describe('Post-Trade Review & Feedback Loop Engine Tests', () => {
  it('calculates Grade A+ and 85% MFE capture efficiency for elite harvest', () => {
    const summary = generatePostTradeReviewSummary({
      netPnL: 8500,
      grossPnL: 8650,
      peakMfePnl: 10000,
      peakMfeR: 2.5,
      realizedR: 2.1,
    });

    expect(summary.mfeCaptureEfficiency).toBe(85.0);
    expect(summary.surrenderedGivebackPnl).toBe(1500.0);
    expect(summary.surrenderedGivebackPercent).toBe(15.0);
    expect(summary.executionGrade).toBe('A+');
    expect(summary.gradeReason).toContain('Captured ≥75% of peak MFE move');
    expect(summary.suggestedMistakes).toHaveLength(0);
  });

  it('suggests GAVE_BACK_PROFIT when surrendered >50% from peak move', () => {
    const summary = generatePostTradeReviewSummary({
      netPnL: 2000,
      grossPnL: 2200,
      peakMfePnl: 8000,
      peakMfeR: 2.0,
      realizedR: 0.5,
    });

    expect(summary.mfeCaptureEfficiency).toBe(25.0);
    expect(summary.surrenderedGivebackPnl).toBe(6000.0);
    expect(summary.surrenderedGivebackPercent).toBe(75.0);
    expect(summary.executionGrade).toBe('B');
    expect(summary.suggestedMistakes.some((m) => m.id === 'GAVE_BACK_PROFIT')).toBe(true);
  });

  it('assigns Grade D and suggests WIDENED_STOP_LOSS when stop was moved during trade', () => {
    const summary = generatePostTradeReviewSummary({
      netPnL: -3000,
      grossPnL: -2900,
      realizedR: -1.5,
      stopLossMoved: true,
    });

    expect(summary.executionGrade).toBe('D');
    expect(summary.gradeReason).toContain('Rule broken: Stop loss moved');
    expect(summary.suggestedMistakes.some((m) => m.id === 'WIDENED_STOP_LOSS')).toBe(true);
  });

  it('assigns Grade B+ for clean planned risk loss (realizedR >= -1.0R)', () => {
    const summary = generatePostTradeReviewSummary({
      netPnL: -2000,
      grossPnL: -1950,
      realizedR: -1.0,
      stopLossMoved: false,
    });

    expect(summary.executionGrade).toBe('B+');
    expect(summary.gradeReason).toContain('Respected initial 1R stop loss budget');
  });

  it('extracts and sorts in-trade emotional pulse checkpoints from auditLog', () => {
    const auditLog = [
      {
        action: 'LIVE_PULSE_CHECK',
        timestamp: '2026-10-31T09:30:00.000Z',
        details: { emotion: 'CALM', notes: 'Entered clean breakout', currentLtp: 100, unrealizedR: 0.2 },
      },
      {
        action: 'OTHER_ACTION',
        timestamp: '2026-10-31T09:45:00.000Z',
      },
      {
        action: 'LIVE_PULSE_CHECK',
        timestamp: '2026-10-31T10:15:00.000Z',
        details: { emotion: 'FOMO', notes: 'Almost doubled position', currentLtp: 110, unrealizedR: 1.8 },
      },
      {
        action: 'LIVE_PULSE_CHECK',
        timestamp: '2026-10-31T10:45:00.000Z',
        details: { emotion: 'ANXIOUS', notes: 'Reversing fast', currentLtp: 104, unrealizedR: 0.7 },
      },
    ];

    const summary = generatePostTradeReviewSummary({
      netPnL: 1500,
      grossPnL: 1600,
      peakMfePnl: 4000,
      peakMfeR: 1.8,
      auditLog,
    });

    expect(summary.pulseCheckIns).toHaveLength(3);
    expect(summary.pulseCheckIns[0].emotion).toBe('CALM');
    expect(summary.pulseCheckIns[1].emotion).toBe('FOMO');
    expect(summary.pulseCheckIns[2].emotion).toBe('ANXIOUS');
    expect(summary.lastPulseEmotion).toBe('ANXIOUS');
  });

  it('suggests IMPULSIVE_EXIT when closed in under 3 minutes at a loss', () => {
    const summary = generatePostTradeReviewSummary({
      netPnL: -500,
      grossPnL: -450,
      realizedR: -0.3,
      durationMinutes: 1.5,
    });

    expect(summary.suggestedMistakes.some((m) => m.id === 'IMPULSIVE_EXIT')).toBe(true);
  });
});

