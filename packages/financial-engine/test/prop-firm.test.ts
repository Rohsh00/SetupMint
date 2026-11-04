import { describe, expect, it } from 'vitest';
import {
  evaluatePropFirmHealth,
  getThe5ersSummerPlanPreset,
  getThe5ersHighStakesPreset,
  getFtmoStandardPreset,
  getPropFirmPreset,
  listPropFirmPresets,
  mergeRuleSetWithOverrides,
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

  describe('Comprehensive Multi-Firm Rule Engine & Presets', () => {
    it('provides verified presets with verifiedAt and sourceUrl for all supported firms', () => {
      const presets = [
        getPropFirmPreset('THE5ERS', 'SUMMER_100K'),
        getPropFirmPreset('THE5ERS', 'HIGH_STAKES_100K'),
        getPropFirmPreset('FTMO', 'STANDARD_100K'),
        getPropFirmPreset('FUNDED_NEXT', 'STELLAR_2STEP_100K'),
        getPropFirmPreset('FUNDING_PIPS', '2STEP_100K'),
        getPropFirmPreset('APEX', '50K_EVALUATION'),
        getPropFirmPreset('TOPSTEP', '50K_COMBINE'),
      ];

      for (const preset of presets) {
        expect(preset).toBeDefined();
        expect(preset?.rulesVerifiedAt).toBeDefined();
        expect(preset?.sourceUrl).toMatch(/^https?:\/\//);
        expect(preset?.phases.length).toBeGreaterThan(0);
      }
    });

    it('enforces exact boundary case: exactly at daily loss limit (buffer = 0 is BREACHED)', () => {
      const ruleSet = getPropFirmPreset('THE5ERS', 'SUMMER_100K')!;
      // $100K starting, 3% limit -> floor is exactly $97,000
      const health = evaluatePropFirmHealth(
        { initialBalance: 100000, currentBalance: 97000 },
        [],
        { startOfDayBalance: 100000, previousDayEodBalance: 100000, previousDayEodEquity: 100000 },
        ruleSet
      );

      expect(health.dailyBufferRemaining).toBe(0);
      expect(health.dailyLossBreached).toBe(true);
      expect(health.threatLevel).toBe('BREACHED');
      expect(health.rules?.dailyLoss?.status).toBe('BREACHED');
    });

    it('evaluates Apex intraday trailing drawdown high-water mark', () => {
      const ruleSet = getPropFirmPreset('APEX', '50K_EVALUATION')!;
      // Apex: no daily loss limit, $50K size, 5% trailing drawdown ($2,500 trailing from intraday high)
      expect(ruleSet.dailyLoss).toBeUndefined();

      // Account grew from $50K to peak $53,000, then pulled back to $51,000
      const health = evaluatePropFirmHealth(
        { initialBalance: 50000, currentBalance: 51000 },
        [],
        { peakEquity: 53000 },
        ruleSet
      );

      // Floor trails behind peak: $53,000 - $2,500 = $50,500
      expect(health.maxLossFloor).toBe(50500);
      expect(health.maxLossBufferRemaining).toBe(500); // $51,000 - $50,500
      expect(health.maxLossBreached).toBe(false);
      expect(health.rules?.dailyLoss?.status).toBe('NOT_CONFIGURED');
      expect(health.rules?.maxLoss?.status).toBe('CRITICAL'); // buffer down to 20%
    });

    it('evaluates Topstep trailing EOD max loss locking at initial balance', () => {
      const ruleSet = getPropFirmPreset('TOPSTEP', '50K_COMBINE')!;
      // $50K initial balance, 4% max loss ($2,000 limit). Floor trails until $50K breakeven then locks.
      // Account peak grew to $54,000. Trail floor without lock = $52,000. But with INITIAL_BALANCE lock rule, floor locks at $50,000.
      const health = evaluatePropFirmHealth(
        { initialBalance: 50000, currentBalance: 52500 },
        [],
        { peakEquity: 54000, previousDayEodEquity: 54000 },
        ruleSet
      );

      expect(health.maxLossFloor).toBe(50000); // Locked at starting balance!
      expect(health.maxLossBufferRemaining).toBe(2500);
      expect(health.maxLossBreached).toBe(false);
    });

    it('detects consistency rule violation when single day dominates total profit', () => {
      const ruleSet = getPropFirmPreset('APEX', '50K_EVALUATION')!;
      // 30% max consistency rule on Apex
      const trades = [
        { tradeDate: '2026-10-01', calculated: { netPnL: 2500 } }, // Day 1: $2,500
        { tradeDate: '2026-10-02', calculated: { netPnL: 500 } },  // Day 2: $500
      ]; // Total profit: $3,000. Best day ($2,500) = 83.33% of total (> 30% cap)

      const health = evaluatePropFirmHealth(
        { initialBalance: 50000, currentBalance: 53000 },
        trades,
        {},
        ruleSet
      );

      expect(health.rules?.consistency?.status).toBe('BREACHED');
      expect(health.threatLevel).toBe('BREACHED');
      expect(health.status).toBe('FAILED');
    });

    it('handles consistency rule safely with zero profit (no division by zero)', () => {
      const ruleSet = getPropFirmPreset('TOPSTEP', '50K_COMBINE')!;
      const trades = [
        { tradeDate: '2026-10-01', calculated: { netPnL: -200 } },
      ];

      const health = evaluatePropFirmHealth(
        { initialBalance: 50000, currentBalance: 49800 },
        trades,
        {},
        ruleSet
      );

      expect(health.rules?.consistency?.status).toBe('SAFE');
      expect(health.rules?.consistency?.used).toBe(0);
    });

    it('detects weekend holding violation when firm bans holding over weekend', () => {
      const ruleSet = getPropFirmPreset('FTMO', 'STANDARD_100K')!;
      expect(ruleSet.holdWeekend).toBe(false);

      const trades = [
        { isWeekendHold: true, calculated: { netPnL: 100 } },
      ];

      const health = evaluatePropFirmHealth(
        { initialBalance: 100000, currentBalance: 100100 },
        trades,
        {},
        ruleSet
      );

      expect(health.rules?.holdWeekend?.status).toBe('BREACHED');
      expect(health.threatLevel).toBe('BREACHED');
      expect(health.status).toBe('FAILED');
    });

    it('detects missing stop loss violation on mandatory stop loss accounts', () => {
      const ruleSet = getPropFirmPreset('THE5ERS', 'HIGH_STAKES_100K')!;
      expect(ruleSet.mandatoryStopLoss).toBe(true);

      const trades = [
        { status: 'CLOSED', calculated: { netPnL: 200 } }, // No risk.initialStopLoss
      ];

      const health = evaluatePropFirmHealth(
        { initialBalance: 100000, currentBalance: 100200 },
        trades,
        {},
        ruleSet
      );

      expect(health.rules?.mandatoryStopLoss?.status).toBe('BREACHED');
      expect(health.threatLevel).toBe('BREACHED');
    });

    it('enforces sticky breach invariant: a previously breached account never silently recovers with new profit', () => {
      const ruleSet = getPropFirmPreset('THE5ERS', 'SUMMER_100K')!;

      // Account was previously breached, but balance is now $150,000
      const health = evaluatePropFirmHealth(
        {
          initialBalance: 100000,
          currentBalance: 150000,
          propFirm: {
            firmKey: 'THE5ERS',
            planKey: 'SUMMER_100K',
            phase: 'PHASE_1',
            status: 'FAILED',
            breachedAt: '2026-10-01T10:00:00.000Z',
            breachedRule: 'dailyLoss',
            breachReason: 'Daily loss limit breached on Oct 1',
          },
        },
        [],
        { startOfDayBalance: 150000, previousDayEodBalance: 150000, previousDayEodEquity: 150000 },
        ruleSet
      );

      expect(health.threatLevel).toBe('BREACHED');
      expect(health.status).toBe('FAILED');
      expect(health.breachedAt).toBe('2026-10-01T10:00:00.000Z');
      expect(health.breachedRule).toBe('dailyLoss');
      expect(health.canAdvancePhase).toBe(false);
    });
  });
});

