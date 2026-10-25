import { describe, it, expect } from 'vitest';
import {
  HELP_CONTENT,
  HelpKey,
  CALIBRATION_MIN_AGREEMENT,
  HOLDOUT_FRACTION,
  MAX_CHART_PADDING_CANDLES,
  MAX_CHART_TIMEFRAMES_PER_REQUEST,
  MIN_RELIABLE_SAMPLE,
  MIN_HOLDOUT_SAMPLE,
} from '@tradevault/shared';

describe('Help Content Registry Integrity & Drift Tests', () => {
  const allKeys = Object.keys(HELP_CONTENT) as HelpKey[];

  it('1. contains all 42 help registry keys with valid titles and summaries', () => {
    expect(allKeys.length).toBeGreaterThanOrEqual(42);

    for (const key of allKeys) {
      const entry = HELP_CONTENT[key];
      expect(entry, `Entry for key ${key} should exist`).toBeDefined();
      expect(entry.title.trim().length, `Key ${key} should have title`).toBeGreaterThan(0);
      expect(entry.summary.trim().length, `Key ${key} should have summary`).toBeGreaterThan(0);
    }
  });

  it('2. adheres to length limits (summary <= 200 chars, details <= 500 chars)', () => {
    for (const key of allKeys) {
      const entry = HELP_CONTENT[key];
      expect(
        entry.summary.length,
        `Summary for ${key} exceeds 200 chars (${entry.summary.length}): "${entry.summary}"`
      ).toBeLessThanOrEqual(200);

      if (entry.details) {
        expect(
          entry.details.length,
          `Details for ${key} exceeds 500 chars (${entry.details.length})`
        ).toBeLessThanOrEqual(500);
      }
    }
  });

  it('3. ensures all seeAlso references point to existing keys in HELP_CONTENT', () => {
    for (const key of allKeys) {
      const entry = HELP_CONTENT[key];
      if (entry.seeAlso) {
        for (const targetKey of entry.seeAlso) {
          expect(
            HELP_CONTENT[targetKey],
            `seeAlso reference "${targetKey}" in entry "${key}" must exist in HELP_CONTENT`
          ).toBeDefined();
        }
      }
    }
  });

  it('4. constants drift verification (strings accurately match shared constants)', () => {
    // 1. Holdout fraction
    const holdoutEntry = HELP_CONTENT['analytics.whatIf.holdout'];
    expect(holdoutEntry).toBeDefined();
    const expectedHoldoutPct = `${Math.round(HOLDOUT_FRACTION * 100)}%`;
    expect(holdoutEntry.summary).toContain(expectedHoldoutPct);

    // 2. Calibration minimum agreement
    const calibrationEntry = HELP_CONTENT['analytics.whatIf.calibration'];
    expect(calibrationEntry).toBeDefined();
    const expectedCalibrationPct = `${Math.round(CALIBRATION_MIN_AGREEMENT * 100)}%`;
    expect(calibrationEntry.caveats).toContain(expectedCalibrationPct);

    // 3. Minimum reliable sample
    const sampleEntry = HELP_CONTENT['metric.sampleReliability'];
    expect(sampleEntry).toBeDefined();
    expect(sampleEntry.details).toContain(String(MIN_RELIABLE_SAMPLE));

    // 4. Max chart padding candles
    const paddingEntry = HELP_CONTENT['trade.chartGen.padding'];
    expect(paddingEntry).toBeDefined();
    expect(paddingEntry.summary).toContain(String(MAX_CHART_PADDING_CANDLES));
  });

  it('5. provides formulas and examples for mathematical and financial concepts', () => {
    const mathKeys: HelpKey[] = [
      'metric.rMultiple',
      'metric.plannedRR',
      'metric.expectancy',
      'metric.profitFactor',
      'metric.winRateCredible',
      'metric.mae',
      'metric.mfe',
      'account.balanceFormula',
    ];

    for (const key of mathKeys) {
      const entry = HELP_CONTENT[key];
      expect(entry.formula, `Key ${key} must have formula defined`).toBeDefined();
      expect(entry.example, `Key ${key} must have concrete example defined`).toBeDefined();
    }
  });
});
