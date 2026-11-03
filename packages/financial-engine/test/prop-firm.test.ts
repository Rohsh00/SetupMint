import { describe, expect, it } from 'vitest';
import {
  evaluatePropFirmHealth,
  getThe5ersSummerPlanPreset,
  getThe5ersHighStakesPreset,
  getFtmoStandardPreset,
} from '../src/prop-firm.js';

describe('The5ers Prop Firm Summer Plan ($149) Financial Engine', () => {
  it('generates correct preset specifications for The5ers Summer Plan ($149)', () => {
    const presetP1 = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    expect(presetP1.firm).toBe('THE5ERS');
    expect(presetP1.planName).toBe('Summer Plan 10/5 ($149)');
    expect(presetP1.phase).toBe('PHASE_1');
    expect(presetP1.initialBalance).toBe(100000);
    expect(presetP1.targetProfitPercent).toBe(10); // 10% on Phase 1
    expect(presetP1.dailyLossLimitPercent).toBe(3); // 3% Daily Loss
    expect(presetP1.dailyLossReference).toBe('MAX_BALANCE_EQUITY_EOD');
    expect(presetP1.maxLossLimitPercent).toBe(10); // 10% Static Max Loss
    expect(presetP1.maxLossFloor).toBe(90000); // Fixed $90,000 floor on $100K
    expect(presetP1.minTradingDays).toBe(0);

    const presetP2 = getThe5ersSummerPlanPreset(100000, 'PHASE_2');
    expect(presetP2.targetProfitPercent).toBe(5); // 5% on Phase 2
  });

  it('evaluates healthy fresh account on Day 1 ($100K balance, 0 open trades)', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 100000,
      unrealizedPnL: 0,
    });

    expect(health.currentEquity).toBe(100000);
    expect(health.dailyLossReference).toBe(100000);
    expect(health.dailyLossLimitAmount).toBe(3000); // 3% of $100K
    expect(health.dailyLossFloor).toBe(97000);
    expect(health.dailyBufferRemaining).toBe(3000);
    expect(health.dailyBufferPercent).toBe(100);
    expect(health.dailyLossBreached).toBe(false);

    expect(health.maxLossFloor).toBe(90000); // Fixed $90,000
    expect(health.maxLossBufferRemaining).toBe(10000);
    expect(health.maxLossBufferPercent).toBe(100);
    expect(health.maxLossBreached).toBe(false);

    expect(health.targetProfitAmount).toBe(10000);
    expect(health.targetEquity).toBe(110000);
    expect(health.profitMadeInPhase).toBe(0);
    expect(health.targetRemaining).toBe(10000);
    expect(health.targetProgressPercent).toBe(0);
    expect(health.targetReached).toBe(false);
    expect(health.threatLevel).toBe('SAFE');
    expect(health.canAdvancePhase).toBe(false);
  });

  it('tracks profit progress accurately ($104,200 equity)', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 103000,
      unrealizedPnL: 1200, // Open trade floating profit
      previousDayEodBalance: 100000,
      previousDayEodEquity: 100000,
    });

    expect(health.currentEquity).toBe(104200);
    expect(health.profitMadeInPhase).toBe(4200);
    expect(health.targetRemaining).toBe(5800);
    expect(health.targetProgressPercent).toBe(42);
    expect(health.threatLevel).toBe('SAFE');
    expect(health.targetReached).toBe(false);
  });

  it('applies The5ers EOD Higher-of-Balance-or-Equity Rule for Daily Loss', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    // Yesterday closed with Balance = $102,000, but Peak EOD Equity = $103,500
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 102500,
      unrealizedPnL: 0,
      previousDayEodBalance: 102000,
      previousDayEodEquity: 103500, // Higher!
    });

    expect(health.dailyLossReference).toBe(103500);
    expect(health.dailyLossLimitAmount).toBe(3105); // 3% of $103,500
    expect(health.dailyLossFloor).toBe(100395);
    expect(health.dailyBufferRemaining).toBe(2105); // $102,500 - $100,395
    expect(health.threatLevel).toBe('SAFE');
  });

  it('detects CRITICAL warning when floating loss drains over 75% of daily buffer', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    // Balance $100,000, but floating open trade is down -$2,400. Equity = $97,600
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 100000,
      unrealizedPnL: -2400,
      previousDayEodBalance: 100000,
      previousDayEodEquity: 100000,
    });

    expect(health.currentEquity).toBe(97600);
    expect(health.dailyBufferRemaining).toBe(600); // Only $600 left of $3,000 buffer (20%)
    expect(health.dailyBufferPercent).toBe(20);
    expect(health.threatLevel).toBe('CRITICAL');
    expect(health.dailyLossBreached).toBe(false);
    expect(health.statusReason).toContain('CRITICAL RISK');
  });

  it('detects BREACHED when daily loss limit is exceeded by floating trade', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    // Balance $100,000, but floating open trade is down -$3,050. Equity = $96,950
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 100000,
      unrealizedPnL: -3050,
      previousDayEodBalance: 100000,
      previousDayEodEquity: 100000,
    });

    expect(health.currentEquity).toBe(96950);
    expect(health.dailyBufferRemaining).toBe(-50);
    expect(health.dailyLossBreached).toBe(true);
    expect(health.threatLevel).toBe('BREACHED');
    expect(health.canAdvancePhase).toBe(false);
    expect(health.statusReason).toContain('BREACHED: Daily loss limit breached');
  });

  it('detects BREACHED when static max loss floor ($90,000) is breached', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    // Multiple losing days; equity drops to $89,800
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 90500,
      unrealizedPnL: -700,
      previousDayEodBalance: 91000,
      previousDayEodEquity: 91000,
    });

    expect(health.currentEquity).toBe(89800);
    expect(health.maxLossFloor).toBe(90000);
    expect(health.maxLossBufferRemaining).toBe(-200);
    expect(health.maxLossBreached).toBe(true);
    expect(health.threatLevel).toBe('BREACHED');
  });

  it('detects Phase 1 completion and enables phase advancement ($110,200 equity)', () => {
    const config = getThe5ersSummerPlanPreset(100000, 'PHASE_1');
    const health = evaluatePropFirmHealth({
      config,
      currentBalance: 110200,
      unrealizedPnL: 0,
      previousDayEodBalance: 108000,
      previousDayEodEquity: 108000,
    });

    expect(health.targetReached).toBe(true);
    expect(health.canAdvancePhase).toBe(true);
    expect(health.targetProgressPercent).toBe(100);
    expect(health.profitMadeInPhase).toBe(10200);
    expect(health.statusReason).toContain('TARGET REACHED');
    expect(health.statusReason).toContain('Phase 2');
  });

  it('supports other prop firm presets (High Stakes and FTMO)', () => {
    const highStakes = getThe5ersHighStakesPreset(100000, 'PHASE_1');
    expect(highStakes.dailyLossLimitPercent).toBe(5);
    expect(highStakes.targetProfitPercent).toBe(8);

    const ftmo = getFtmoStandardPreset(100000, 'PHASE_1');
    expect(ftmo.firm).toBe('FTMO');
    expect(ftmo.dailyLossReference).toBe('STARTING_BALANCE');
  });
});

