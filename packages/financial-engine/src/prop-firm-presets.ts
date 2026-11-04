import { IPropFirmRuleSet } from '@tradevault/shared';

export const PROP_FIRM_PRESETS: IPropFirmRuleSet[] = [
  // --- THE5ERS ---
  {
    firmKey: 'THE5ERS',
    planKey: 'SUMMER_100K',
    displayName: 'The5ers Summer Plan 10/5 ($149)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Evaluation Step 1 (10% Target)',
        profitTargetPct: 10,
        minTradingDays: 0,
      },
      {
        phase: 'PHASE_2',
        name: 'Evaluation Step 2 (5% Target)',
        profitTargetPct: 5,
        minTradingDays: 0,
      },
      {
        phase: 'FUNDED',
        name: 'Funded Master',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 3,
      basis: 'HIGHER_OF_BALANCE_EQUITY',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 10,
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: true,
    newsTradingRestriction: false,
    mandatoryStopLoss: false,
    profitSplit: 100,
    payoutRules: {
      minDays: 14,
      minProfit: 0,
      firstPayoutDays: 14,
    },
    rulesVerifiedAt: '2025-01-10',
    sourceUrl: 'https://the5ers.com',
  },
  {
    firmKey: 'THE5ERS',
    planKey: 'HIGH_STAKES_100K',
    displayName: 'The5ers High Stakes 8/5 ($100K)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Step 1 (8% Target)',
        profitTargetPct: 8,
        minTradingDays: 3,
      },
      {
        phase: 'PHASE_2',
        name: 'Step 2 (5% Target)',
        profitTargetPct: 5,
        minTradingDays: 3,
      },
      {
        phase: 'FUNDED',
        name: 'Funded Trader',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 5,
      basis: 'HIGHER_OF_BALANCE_EQUITY',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'TRAILING_EOD',
      limitPct: 10,
      floorLockRule: 'BREAKEVEN',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: true,
    newsTradingRestriction: false,
    mandatoryStopLoss: true,
    profitSplit: 80,
    payoutRules: {
      minDays: 14,
      minProfit: 0,
      firstPayoutDays: 14,
    },
    rulesVerifiedAt: '2025-01-10',
    sourceUrl: 'https://the5ers.com/high-stakes/',
  },
  {
    firmKey: 'THE5ERS',
    planKey: 'HYPER_GROWTH_10K',
    displayName: 'The5ers Hyper Growth ($10K)',
    currency: 'USD',
    accountSize: 10000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Evaluation (10% Target)',
        profitTargetPct: 10,
        minTradingDays: 0,
      },
      {
        phase: 'FUNDED',
        name: 'Funded Trader',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 3,
      basis: 'HIGHER_OF_BALANCE_EQUITY',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 6,
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: true,
    newsTradingRestriction: false,
    mandatoryStopLoss: true,
    profitSplit: 100,
    rulesVerifiedAt: '2025-01-10',
    sourceUrl: 'https://the5ers.com/hyper-growth/',
  },
  {
    firmKey: 'THE5ERS',
    planKey: 'BOOTCAMP_100K',
    displayName: 'The5ers Bootcamp ($100K)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Challenge 1 (6% Target)',
        profitTargetPct: 6,
        minTradingDays: 0,
      },
      {
        phase: 'PHASE_2',
        name: 'Challenge 2 (6% Target)',
        profitTargetPct: 6,
        minTradingDays: 0,
      },
      {
        phase: 'FUNDED',
        name: 'Funded Stage',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 3,
      basis: 'START_OF_DAY_BALANCE',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 5,
      floorLockRule: 'INITIAL_BALANCE',
    },
    holdOvernight: true,
    holdWeekend: true,
    mandatoryStopLoss: true,
    profitSplit: 85,
    rulesVerifiedAt: '2025-01-10',
    sourceUrl: 'https://the5ers.com/bootcamp/',
  },

  // --- FTMO ---
  {
    firmKey: 'FTMO',
    planKey: 'STANDARD_100K',
    displayName: 'FTMO Challenge ($100K Normal)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'FTMO Challenge (10% Target)',
        profitTargetPct: 10,
        minTradingDays: 4,
      },
      {
        phase: 'PHASE_2',
        name: 'Verification (5% Target)',
        profitTargetPct: 5,
        minTradingDays: 4,
      },
      {
        phase: 'FUNDED',
        name: 'FTMO Trader',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 5,
      basis: 'START_OF_DAY_BALANCE',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 10,
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: false,
    newsTradingRestriction: true,
    newsWindowMinutes: 2,
    mandatoryStopLoss: false,
    profitSplit: 80,
    rulesVerifiedAt: '2025-01-15',
    sourceUrl: 'https://ftmo.com/en/trading-objectives/',
  },
  {
    firmKey: 'FTMO',
    planKey: 'AGGRESSIVE_100K',
    displayName: 'FTMO Challenge ($100K Aggressive)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'FTMO Challenge Aggressive (20% Target)',
        profitTargetPct: 20,
        minTradingDays: 4,
      },
      {
        phase: 'PHASE_2',
        name: 'Verification Aggressive (10% Target)',
        profitTargetPct: 10,
        minTradingDays: 4,
      },
      {
        phase: 'FUNDED',
        name: 'FTMO Trader Aggressive',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 10,
      basis: 'START_OF_DAY_BALANCE',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 20,
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: false,
    newsTradingRestriction: true,
    newsWindowMinutes: 2,
    mandatoryStopLoss: false,
    profitSplit: 80,
    rulesVerifiedAt: '2025-01-15',
    sourceUrl: 'https://ftmo.com/en/trading-objectives/',
  },

  // --- FUNDEDNEXT ---
  {
    firmKey: 'FUNDED_NEXT',
    planKey: 'STELLAR_2STEP_100K',
    displayName: 'FundedNext Stellar 2-Step ($100K)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Phase 1 (8% Target)',
        profitTargetPct: 8,
        minTradingDays: 5,
      },
      {
        phase: 'PHASE_2',
        name: 'Phase 2 (5% Target)',
        profitTargetPct: 5,
        minTradingDays: 5,
      },
      {
        phase: 'FUNDED',
        name: 'Funded Trader',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 5,
      basis: 'START_OF_DAY_BALANCE',
      resetTimezone: 'UTC',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 10,
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: true,
    newsTradingRestriction: false,
    mandatoryStopLoss: false,
    profitSplit: 80,
    rulesVerifiedAt: '2025-01-15',
    sourceUrl: 'https://fundednext.com/models/stellar-challenge',
  },

  // --- FUNDING PIPS ---
  {
    firmKey: 'FUNDING_PIPS',
    planKey: '2STEP_100K',
    displayName: 'Funding Pips 2-Step ($100K)',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Student (8% Target)',
        profitTargetPct: 8,
        minTradingDays: 0,
      },
      {
        phase: 'PHASE_2',
        name: 'Practitioner (5% Target)',
        profitTargetPct: 5,
        minTradingDays: 0,
      },
      {
        phase: 'FUNDED',
        name: 'Master Trader',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 5,
      basis: 'HIGHER_OF_BALANCE_EQUITY',
      resetTimezone: 'Europe/Prague',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 10,
      floorLockRule: 'INITIAL_BALANCE',
    },
    holdOvernight: true,
    holdWeekend: false,
    newsTradingRestriction: false,
    mandatoryStopLoss: false,
    profitSplit: 80,
    rulesVerifiedAt: '2025-01-15',
    sourceUrl: 'https://fundingpips.com',
  },

  // --- APEX TRADER FUNDING ---
  {
    firmKey: 'APEX',
    planKey: '50K_EVALUATION',
    displayName: 'Apex Trader Funding 50K Full Evaluation',
    currency: 'USD',
    accountSize: 50000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Evaluation ($3K Target)',
        profitTargetPct: 6,
        minTradingDays: 1,
      },
      {
        phase: 'FUNDED',
        name: 'PA Funded',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: undefined, // Apex evaluations have no daily loss limit!
    maxLoss: {
      type: 'TRAILING_INTRADAY',
      limitPct: 5, // $2,500 trailing drawdown on $50K
      floorLockRule: 'TRAILS_ALWAYS',
    },
    consistencyRule: {
      type: 'BEST_DAY_PCT_OF_TOTAL',
      maxPct: 30,
    },
    holdOvernight: false,
    holdWeekend: false,
    maxLotsOrContracts: 10,
    mandatoryStopLoss: false,
    profitSplit: 90,
    rulesVerifiedAt: '2025-01-20',
    sourceUrl: 'https://apextraderfunding.com',
  },

  // --- TOPSTEP ---
  {
    firmKey: 'TOPSTEP',
    planKey: '50K_COMBINE',
    displayName: 'Topstep Trading Combine ($50K)',
    currency: 'USD',
    accountSize: 50000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Trading Combine ($3K Target)',
        profitTargetPct: 6,
        minTradingDays: 2,
      },
      {
        phase: 'FUNDED',
        name: 'Express Funded',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 2, // $1,000 daily loss on $50K
      basis: 'START_OF_DAY_BALANCE',
      resetTimezone: 'America/Chicago',
      resetTime: '17:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'TRAILING_EOD',
      limitPct: 4, // $2,000 trailing max loss
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'BEST_DAY_PCT_OF_TOTAL',
      maxPct: 50,
    },
    holdOvernight: false,
    holdWeekend: false,
    maxLotsOrContracts: 5,
    mandatoryStopLoss: false,
    profitSplit: 90,
    rulesVerifiedAt: '2025-01-20',
    sourceUrl: 'https://topstep.com',
  },

  // --- CUSTOM ---
  {
    firmKey: 'CUSTOM',
    planKey: 'CUSTOM_PLAN',
    displayName: 'Custom Prop Firm Rules',
    currency: 'USD',
    accountSize: 100000,
    phases: [
      {
        phase: 'PHASE_1',
        name: 'Phase 1',
        profitTargetPct: 10,
        minTradingDays: 0,
      },
      {
        phase: 'PHASE_2',
        name: 'Phase 2',
        profitTargetPct: 5,
        minTradingDays: 0,
      },
      {
        phase: 'FUNDED',
        name: 'Funded',
        profitTargetPct: 0,
        minTradingDays: 0,
      },
    ],
    dailyLoss: {
      limitPct: 5,
      basis: 'START_OF_DAY_BALANCE',
      resetTimezone: 'UTC',
      resetTime: '00:00',
      includesFloating: true,
    },
    maxLoss: {
      type: 'STATIC',
      limitPct: 10,
      floorLockRule: 'INITIAL_BALANCE',
    },
    consistencyRule: {
      type: 'NONE',
    },
    holdOvernight: true,
    holdWeekend: true,
    newsTradingRestriction: false,
    mandatoryStopLoss: false,
    profitSplit: 80,
    rulesVerifiedAt: '2025-01-01',
    sourceUrl: 'https://setupmint.local',
  },
];

/**
 * Find preset by firmKey and optional planKey.
 * If planKey is omitted or not found, defaults to first plan for that firm.
 */
export function getPropFirmPreset(
  firmKey: string,
  planKey?: string
): IPropFirmRuleSet | undefined {
  const normFirm = (firmKey || '').trim().toUpperCase();
  const normPlan = (planKey || '').trim().toUpperCase();

  if (normPlan) {
    const match = PROP_FIRM_PRESETS.find(
      (p) =>
        p.firmKey.toUpperCase() === normFirm &&
        p.planKey.toUpperCase() === normPlan
    );
    if (match) return JSON.parse(JSON.stringify(match));
  }

  // Fallback to first plan for this firm
  const firstForFirm = PROP_FIRM_PRESETS.find(
    (p) => p.firmKey.toUpperCase() === normFirm
  );
  if (firstForFirm) return JSON.parse(JSON.stringify(firstForFirm));

  // Fallback to custom
  const custom = PROP_FIRM_PRESETS.find((p) => p.firmKey === 'CUSTOM');
  return custom ? JSON.parse(JSON.stringify(custom)) : undefined;
}

/**
 * List all available presets.
 */
export function listPropFirmPresets(): IPropFirmRuleSet[] {
  return JSON.parse(JSON.stringify(PROP_FIRM_PRESETS));
}

/**
 * Deep merge a base rule set with per-account custom overrides.
 */
export function mergeRuleSetWithOverrides(
  baseRuleSet: IPropFirmRuleSet,
  overrides?: Record<string, any>
): IPropFirmRuleSet {
  if (!overrides || Object.keys(overrides).length === 0) {
    return JSON.parse(JSON.stringify(baseRuleSet));
  }

  const merged = JSON.parse(JSON.stringify(baseRuleSet));

  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined) continue;

    if (key === 'phases' && Array.isArray(val) && val.length > 0) {
      merged.phases = val;
    } else if (
      key === 'dailyLoss' &&
      typeof val === 'object' &&
      val !== null
    ) {
      merged.dailyLoss = { ...(merged.dailyLoss || {}), ...val };
    } else if (key === 'maxLoss' && typeof val === 'object' && val !== null) {
      merged.maxLoss = { ...(merged.maxLoss || {}), ...val };
    } else if (
      key === 'consistencyRule' &&
      typeof val === 'object' &&
      val !== null
    ) {
      merged.consistencyRule = { ...(merged.consistencyRule || {}), ...val };
    } else if (
      key === 'payoutRules' &&
      typeof val === 'object' &&
      val !== null
    ) {
      merged.payoutRules = { ...(merged.payoutRules || {}), ...val };
    } else {
      (merged as any)[key] = val;
    }
  }

  return merged;
}

