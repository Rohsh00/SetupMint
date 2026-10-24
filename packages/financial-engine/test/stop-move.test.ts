import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { detectStopMoves } from '../src/stop-move.js';
import { detectMistakeSuggestions } from '../src/mistakes.js';

describe('detectStopMoves Pure Engine Tests', () => {
  const baseTime = moment('2026-10-24T09:30:00.000Z');

  it('returns empty summary when no modifications are provided', () => {
    const result = detectStopMoves({
      direction: 'LONG',
      initialStopLoss: 100,
      modifications: [],
    });

    expect(result.moves).toEqual([]);
    expect(result.summary.totalMoves).toBe(0);
    expect(result.summary.widenedCount).toBe(0);
    expect(result.summary.trailedCount).toBe(0);
    expect(result.summary.hasWidenedRisk).toBe(false);
    expect(result.mistakeSuggestions).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('detects favorable trailing for a LONG position when stop loss is moved upward', () => {
    const result = detectStopMoves({
      direction: 'LONG',
      entryPrice: 105,
      initialStopLoss: 100,
      modifications: [
        { stopPrice: 104, modifiedAt: baseTime.clone().add(5, 'minutes').toDate(), orderId: 'ord-1' },
        { stopPrice: 108, modifiedAt: baseTime.clone().add(15, 'minutes').toDate(), orderId: 'ord-2' },
      ],
    });

    expect(result.moves).toHaveLength(2);
    expect(result.moves[0].moveType).toBe('TRAILED_FAVORABLY');
    expect(result.moves[0].changePoints).toBe(4);
    expect(result.moves[1].moveType).toBe('TRAILED_FAVORABLY');
    expect(result.moves[1].changePoints).toBe(4);

    expect(result.summary.totalMoves).toBe(2);
    expect(result.summary.trailedCount).toBe(2);
    expect(result.summary.widenedCount).toBe(0);
    expect(result.summary.hasWidenedRisk).toBe(false);
    expect(result.summary.initialStop).toBe(100);
    expect(result.summary.finalStop).toBe(108);
    expect(result.summary.netRiskChangePoints).toBe(-8); // negative = risk reduced

    expect(result.flags).toContain('STOP_TRAILED_FAVORABLY');
    expect(result.mistakeSuggestions).toHaveLength(0);
  });

  it('detects risk widening for a LONG position when stop loss is moved downward', () => {
    const result = detectStopMoves({
      direction: 'LONG',
      entryPrice: 105,
      initialStopLoss: 100,
      modifications: [
        { stopPrice: 95, modifiedAt: baseTime.clone().add(5, 'minutes').toDate(), orderId: 'ord-1' },
        { stopPrice: 90, modifiedAt: baseTime.clone().add(10, 'minutes').toDate(), orderId: 'ord-2' },
      ],
    });

    expect(result.moves).toHaveLength(2);
    expect(result.moves[0].moveType).toBe('WIDENED_RISK');
    expect(result.moves[0].changePoints).toBe(5);
    expect(result.moves[1].moveType).toBe('WIDENED_RISK');
    expect(result.moves[1].changePoints).toBe(5);

    expect(result.summary.totalMoves).toBe(2);
    expect(result.summary.widenedCount).toBe(2);
    expect(result.summary.trailedCount).toBe(0);
    expect(result.summary.hasWidenedRisk).toBe(true);
    expect(result.summary.netRiskChangePoints).toBe(10); // positive = risk widened

    expect(result.flags).toContain('STOP_WIDENED');
    expect(result.mistakeSuggestions).toContain('STOP_MOVED');
  });

  it('detects favorable trailing for a SHORT position when stop loss is moved downward', () => {
    const result = detectStopMoves({
      direction: 'SHORT',
      entryPrice: 200,
      initialStopLoss: 210,
      modifications: [
        { stopPrice: 205, modifiedAt: baseTime.clone().add(5, 'minutes').toDate() },
        { stopPrice: 198, modifiedAt: baseTime.clone().add(12, 'minutes').toDate() },
      ],
    });

    expect(result.moves).toHaveLength(2);
    expect(result.moves[0].moveType).toBe('TRAILED_FAVORABLY');
    expect(result.moves[1].moveType).toBe('TRAILED_FAVORABLY');
    expect(result.summary.trailedCount).toBe(2);
    expect(result.summary.widenedCount).toBe(0);
    expect(result.summary.hasWidenedRisk).toBe(false);
    expect(result.flags).toContain('STOP_TRAILED_FAVORABLY');
    expect(result.mistakeSuggestions).toHaveLength(0);
  });

  it('detects risk widening for a SHORT position when stop loss is moved upward', () => {
    const result = detectStopMoves({
      direction: 'SHORT',
      entryPrice: 200,
      initialStopLoss: 210,
      modifications: [
        { stopPrice: 220, modifiedAt: baseTime.clone().add(10, 'minutes').toDate() },
      ],
    });

    expect(result.moves).toHaveLength(1);
    expect(result.moves[0].moveType).toBe('WIDENED_RISK');
    expect(result.moves[0].changePoints).toBe(10);
    expect(result.summary.widenedCount).toBe(1);
    expect(result.summary.hasWidenedRisk).toBe(true);
    expect(result.flags).toContain('STOP_WIDENED');
    expect(result.mistakeSuggestions).toContain('STOP_MOVED');
  });

  it('sorts unordered modifications chronologically using moment', () => {
    const result = detectStopMoves({
      direction: 'LONG',
      initialStopLoss: 100,
      modifications: [
        { stopPrice: 110, modifiedAt: baseTime.clone().add(20, 'minutes').toDate() },
        { stopPrice: 105, modifiedAt: baseTime.clone().add(5, 'minutes').toDate() },
      ],
    });

    expect(result.moves[0].newStop).toBe(105);
    expect(result.moves[1].newStop).toBe(110);
    expect(result.summary.trailedCount).toBe(2);
  });

  it('detects STOP_MOVED suggestion via detectMistakeSuggestions', () => {
    const detection = detectMistakeSuggestions({
      trades: [
        {
          id: 'trade-stop-moved-1',
          symbol: 'NSE:SBIN-EQ',
          status: 'CLOSED',
          entryTime: baseTime.toDate(),
          quantity: 100,
          entryPrice: 800,
          stopMoveSummary: {
            hasWidenedRisk: true,
            widenedCount: 1,
            netRiskChangePoints: 15,
          },
        },
      ],
    });

    const stopMovedSuggestion = detection.suggestions.find((s) => s.mistakeTag === 'STOP_MOVED');
    expect(stopMovedSuggestion).toBeDefined();
    expect(stopMovedSuggestion?.rule).toBe('STOP_MOVED_WIDENED');
    expect(stopMovedSuggestion?.severity).toBe('CRITICAL');
    expect(stopMovedSuggestion?.message).toContain('widening downside risk (+15 pts)');
  });
});
