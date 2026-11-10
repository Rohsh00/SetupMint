import {
  AccountScope,
  AccountScopeMode,
  AccountType,
  ExecutionAdapterKey,
  FeeModelKey,
  IAccountUiCapabilities,
  ITradingAccountProfile,
  MarketRegion,
  PositionModel,
  SessionCalendarKey,
  TradingSession,
} from '@tradevault/shared';
import { BrokerAdapterRegistry } from './registries/adapter-registry.js';

/**
 * Returns canonical currency symbol for ISO-4217 currency code.
 * Uses Intl.NumberFormat narrowSymbol without hardcoding constants outside registries.
 */
export function getCurrencySymbol(currency = 'USD'): string {
  if (!currency || currency === 'MULTI') return '';
  const curr = currency.toUpperCase().trim();
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency')?.value;
    return sym || curr;
  } catch {
    if (curr === 'INR') return '₹';
    if (curr === 'USD') return '$';
    if (curr === 'EUR') return '€';
    if (curr === 'GBP') return '£';
    if (curr === 'JPY') return '¥';
    return curr;
  }
}

/**
 * Helper to safely extract effective prop firm key
 */
export function getEffectivePropFirmKey(acc: any): string | undefined {
  if (!acc) return undefined;
  if (acc.propFirm?.firmKey && String(acc.propFirm.firmKey).trim()) {
    return String(acc.propFirm.firmKey).trim().toUpperCase();
  }
  if (acc.propFirmConfig?.enabled && acc.propFirmConfig?.firm) {
    return String(acc.propFirmConfig.firm).trim().toUpperCase();
  }
  if (acc.accountType === 'PROP_FIRM') {
    if (acc.broker && !['FYERS', 'ZERODHA', 'UPSTOX', 'ANGELONE', 'ANGEL_ONE', 'ICICI', 'MANUAL'].includes(String(acc.broker).toUpperCase())) {
      return String(acc.broker).trim().toUpperCase();
    }
    return 'CUSTOM';
  }
  return undefined;
}

/**
 * Derives a standard ITradingAccountProfile if one is missing on the account object.
 */
export function ensureAccountProfile(acc: any): ITradingAccountProfile {
  if (acc?.profile && acc.profile.executionAdapterKey && acc.profile.baseCurrency) {
    return acc.profile;
  }

  const brokerStr = String(acc?.broker || '').toUpperCase().trim();
  const accType = String(acc?.accountType || '').toUpperCase().trim();
  const isProp =
    accType === 'PROP_FIRM' ||
    Boolean(acc?.propFirm?.firmKey && String(acc.propFirm.firmKey).trim() !== '') ||
    acc?.propFirmConfig?.enabled === true;

  const isElefin = /ELEFIN|MT5/i.test(brokerStr) || /ELEFIN|MT5/i.test(String(acc?.name || ''));
  const isFyers = brokerStr === 'FYERS' || (acc?.brokerLink && acc.brokerLink.broker === 'FYERS');

  if (isProp) {
    const baseCurrency = String(acc?.baseCurrency || 'USD').toUpperCase().trim();
    const timezone = acc?.propFirm?.ruleSetOverrides?.dailyLoss?.resetTimezone || 'UTC';
    return {
      marketRegion: 'GLOBAL',
      baseCurrency,
      timezone,
      feeModelKey: 'FOREX_COMMISSION',
      executionAdapterKey: 'PROP_SIM',
      positionModel: 'HEDGING',
      sessionCalendarKey: 'FOREX_24_5',
      riskRules: {
        maxDailyLoss: acc?.riskRules?.maxDailyLoss,
        maxRiskPerTradePercent: acc?.riskRules?.maxRiskPerTradePercent ?? 1,
        maxOpenTrades: acc?.riskRules?.maxOpenTrades ?? 5,
        lotCap: acc?.propFirm?.ruleSetOverrides?.lotCap,
        requireStopLoss: true,
      },
      capabilities: BrokerAdapterRegistry.getCapabilities('PROP_SIM'),
    };
  }

  if (isElefin) {
    const baseCurrency = String(acc?.baseCurrency || 'USD').toUpperCase().trim();
    return {
      marketRegion: 'GLOBAL',
      baseCurrency,
      timezone: 'UTC',
      feeModelKey: 'FOREX_COMMISSION',
      executionAdapterKey: 'ELEFIN_MT5',
      positionModel: 'HEDGING',
      sessionCalendarKey: 'FOREX_24_5',
      riskRules: {
        maxDailyLoss: acc?.riskRules?.maxDailyLoss,
        maxRiskPerTradePercent: acc?.riskRules?.maxRiskPerTradePercent,
        maxOpenTrades: acc?.riskRules?.maxOpenTrades,
      },
      capabilities: BrokerAdapterRegistry.getCapabilities('ELEFIN_MT5'),
    };
  }

  if (isFyers || ['EQUITY', 'COMMODITY', 'FUTURES_OPTIONS'].includes(accType) || acc?.baseCurrency === 'INR') {
    const baseCurrency = String(acc?.baseCurrency || 'INR').toUpperCase().trim();
    return {
      marketRegion: 'IN',
      baseCurrency,
      timezone: 'Asia/Kolkata',
      feeModelKey: 'INDIA_STATUTORY',
      executionAdapterKey: isFyers ? 'FYERS' : 'MANUAL',
      positionModel: 'NETTING_FIFO',
      sessionCalendarKey: accType === 'COMMODITY' ? 'MCX' : 'NSE',
      riskRules: {
        maxDailyLoss: acc?.riskRules?.maxDailyLoss,
        maxRiskPerTradePercent: acc?.riskRules?.maxRiskPerTradePercent,
        maxOpenTrades: acc?.riskRules?.maxOpenTrades,
      },
      capabilities: BrokerAdapterRegistry.getCapabilities(isFyers ? 'FYERS' : 'MANUAL'),
    };
  }

  const baseCurrency = String(acc?.baseCurrency || 'USD').toUpperCase().trim();
  const isIndian = baseCurrency === 'INR';
  return {
    marketRegion: isIndian ? 'IN' : 'GLOBAL',
    baseCurrency,
    timezone: isIndian ? 'Asia/Kolkata' : 'UTC',
    feeModelKey: isIndian ? 'INDIA_STATUTORY' : 'FOREX_COMMISSION',
    executionAdapterKey: 'MANUAL',
    positionModel: 'NETTING_FIFO',
    sessionCalendarKey: isIndian ? 'NSE' : 'FOREX_24_5',
    riskRules: {
      maxDailyLoss: acc?.riskRules?.maxDailyLoss,
      maxRiskPerTradePercent: acc?.riskRules?.maxRiskPerTradePercent,
      maxOpenTrades: acc?.riskRules?.maxOpenTrades,
    },
    capabilities: BrokerAdapterRegistry.getCapabilities('MANUAL'),
  };
}

/**
 * Returns the default empty capability set when no accounts exist.
 */
function createEmptyCapabilities(): IAccountUiCapabilities {
  return {
    isDemo: false,
    isArchived: false,
    isMultiAccount: false,
    activeAccountCount: 0,
    currency: {
      code: 'USD',
      symbol: '$',
      isSingleCurrency: true,
      isMultiCurrency: false,
      availableCurrencies: ['USD'],
    },
    broker: {
      adapter: 'MANUAL',
      isFyers: false,
      isConnected: false,
      canSyncTrades: false,
      canSyncFunds: false,
      canExecuteLive: false,
      canLinkAccount: false,
      needsDailyLogin: false,
    },
    csvImport: {
      tradebook: false,
      cashLedger: false,
      brokerPresets: ['CUSTOM'],
    },
    marketData: {
      fyersHistory: false,
      angelOneFallback: false,
      canStreamQuotes: false,
    },
    fees: {
      model: 'NONE',
      showStatutoryBreakdown: false,
      showCommissionSwap: false,
    },
    instruments: {
      showLots: false,
      showMultiplier: false,
      showOptionsFields: false,
      showStrikeExpiry: false,
    },
    position: {
      model: 'NETTING_FIFO',
      isNetting: true,
      isHedging: false,
    },
    sessions: {
      calendarKey: 'NSE',
      allowedSessions: ['NSE_REGULAR', 'OFF_HOURS'],
    },
    live: {
      watcher: false,
      scalingLadder: false,
      giveback: false,
      telegramExecution: false,
      killSwitch: false,
    },
    prop: {
      isProp: false,
      showChallengePanel: false,
      showRuleAdvisories: false,
    },
    multiAccountScope: {
      mixedCurrency: false,
      mixedBrokers: false,
      byCurrency: [],
    },
  };
}

/**
 * Derives allowed trading session codes for a session calendar key.
 */
function getAllowedSessions(calendarKey: SessionCalendarKey | string): TradingSession[] {
  switch (calendarKey) {
    case 'MCX':
      return ['MCX_EVENING', 'OFF_HOURS'];
    case 'FOREX_24_5':
      return ['ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'];
    case 'CRYPTO_24_7':
      return ['OFF_HOURS'];
    case 'NSE':
    default:
      return ['NSE_REGULAR', 'OFF_HOURS'];
  }
}

/**
 * Derives CSV broker preset identifier from broker string.
 */
function resolveBrokerPreset(brokerStr: string): string {
  const b = brokerStr.toUpperCase().trim();
  if (b === 'FYERS') return 'FYERS';
  if (b === 'ZERODHA') return 'ZERODHA';
  if (b.includes('ANGEL')) return 'ANGEL_ONE';
  if (b === 'UPSTOX') return 'UPSTOX';
  if (b === 'ICICI') return 'ICICI';
  if (b.includes('MT5') || b.includes('METATRADER')) return 'MT5';
  if (b.includes('BINANCE') || b.includes('CRYPTO')) return 'CRYPTO';
  return 'CUSTOM';
}

/**
 * SINGLE SOURCE OF TRUTH: Pure UI Capability Resolver.
 *
 * Resolves the complete IAccountUiCapabilities object from TradingAccount.profile,
 * accountType, brokerLink, and propFirm.
 * Never relies on user settings, local storage, or hardcoded defaults.
 */
export function resolveAccountUiCapabilities(
  scope?: Partial<AccountScope> | string | null,
  accounts?: any[] | null
): IAccountUiCapabilities {
  const allAccounts = Array.isArray(accounts) ? accounts : [];
  if (allAccounts.length === 0) {
    return createEmptyCapabilities();
  }

  // Parse scope input
  let mode: AccountScopeMode = 'ALL';
  let accountId: string | undefined = undefined;
  let accountType: string | undefined = undefined;
  let firmKey: string | undefined = undefined;

  if (typeof scope === 'string') {
    const s = scope.trim();
    if (s === 'ALL') {
      mode = 'ALL';
    } else if (s === 'PROP_FIRM:ALL' || s === 'PROP_FIRM') {
      mode = 'PROP_FIRM';
    } else if (s.startsWith('PROP_FIRM:')) {
      mode = 'PROP_FIRM';
      firmKey = s.slice('PROP_FIRM:'.length).toLowerCase();
    } else if (s === 'LIVE' || s === 'PERSONAL' || s === 'TYPE:LIVE') {
      mode = 'TYPE';
      accountType = 'LIVE';
    } else if (s.startsWith('TYPE:')) {
      mode = 'TYPE';
      accountType = s.slice('TYPE:'.length);
    } else if (s.startsWith('ACCOUNT:')) {
      mode = 'ACCOUNT';
      accountId = s.slice('ACCOUNT:'.length);
    } else {
      mode = 'ALL';
    }
  } else if (scope && typeof scope === 'object') {
    mode = scope.mode || 'ALL';
    accountId = scope.accountId;
    accountType = scope.accountType;
    firmKey = scope.firmKey;
  }

  // Filter accounts according to scope
  let scopedAccounts: any[] = [];
  const isPropPredicate = (a: any) =>
    a.accountType === 'PROP_FIRM' ||
    a.accountType === 'PROP_EVALUATION' ||
    a.accountType === 'PROP_FUNDED' ||
    Boolean(a.propFirm?.firmKey && String(a.propFirm.firmKey).trim() !== '') ||
    Boolean(a.propFirm?.firmName && String(a.propFirm.firmName).trim() !== '') ||
    Boolean(a.propFirmConfig?.enabled);

  if (mode === 'ACCOUNT' && accountId) {
    const targetId = String(accountId);
    scopedAccounts = allAccounts.filter((a) => String(a.id || a._id) === targetId);
    if (scopedAccounts.length === 0) {
      scopedAccounts = allAccounts;
    }
  } else if (mode === 'PROP_FIRM') {
    const propAccs = allAccounts.filter(isPropPredicate);
    if (firmKey && firmKey !== 'ALL') {
      const fk = firmKey.toLowerCase();
      scopedAccounts = propAccs.filter((a) => {
        const candidate = (a.propFirm?.firmKey || a.broker || a.propFirmConfig?.firm || '').toLowerCase();
        return candidate === fk;
      });
      if (scopedAccounts.length === 0) {
        scopedAccounts = propAccs;
      }
    } else if (accountId) {
      scopedAccounts = propAccs.filter((a) => String(a.id || a._id) === String(accountId));
      if (scopedAccounts.length === 0) {
        scopedAccounts = propAccs;
      }
    } else {
      scopedAccounts = propAccs;
    }
    if (scopedAccounts.length === 0) {
      scopedAccounts = allAccounts;
    }
  } else if (mode === 'TYPE') {
    if (String(accountType).toUpperCase() === 'DEMO') {
      scopedAccounts = allAccounts.filter((a) => a.accountType === 'DEMO' || a.accountType === 'SIMULATED');
    } else {
      scopedAccounts = allAccounts.filter(
        (a) =>
          a.accountType !== 'PROP_FIRM' &&
          a.accountType !== 'DEMO' &&
          a.accountType !== 'SIMULATED' &&
          !a.propFirm?.firmKey &&
          !a.propFirmConfig?.enabled
      );
    }
    if (scopedAccounts.length === 0) {
      scopedAccounts = allAccounts;
    }
  } else {
    scopedAccounts = allAccounts;
  }

  if (scopedAccounts.length === 0) {
    scopedAccounts = allAccounts;
  }

  // Map each scoped account to its individual capabilities
  interface EvaluatedAccountItem {
    account: any;
    profile: ITradingAccountProfile;
    isDemo: boolean;
    isArchived: boolean;
    isProp: boolean;
    firmKey?: string;
    brokerPreset: string;
    capabilities: IAccountUiCapabilities;
  }

  const evaluatedItems: EvaluatedAccountItem[] = scopedAccounts.map((acc) => {
    const profile = ensureAccountProfile(acc);
    const brokerStr = String(acc.broker || '').toUpperCase().trim();
    const accType = String(acc.accountType || '').toUpperCase().trim();
    const isProp =
      accType === 'PROP_FIRM' ||
      accType === 'PROP_EVALUATION' ||
      accType === 'PROP_FUNDED' ||
      Boolean(acc.propFirm?.firmKey && String(acc.propFirm.firmKey).trim() !== '') ||
      Boolean(acc.propFirm?.firmName && String(acc.propFirm.firmName).trim() !== '') ||
      Boolean(acc.propFirmConfig?.enabled);

    const isArchived = acc.status === 'ARCHIVED';
    const isDemo = accType === 'DEMO' || accType === 'SIMULATED';
    const isFyers = profile.executionAdapterKey === 'FYERS' || brokerStr === 'FYERS';
    const isConnected = isFyers ? Boolean(acc.brokerLink?.clientId) : profile.executionAdapterKey !== 'MANUAL';

    const canSyncTrades = !isArchived && isFyers && Boolean(profile.capabilities?.canFetchHistory);
    const canSyncFunds = !isArchived && isFyers && Boolean(profile.capabilities?.canSyncFunds);
    const canExecuteLive = !isArchived && !isDemo && Boolean(profile.capabilities?.canPlaceOrders || profile.capabilities?.canExitPositions);
    const canLinkAccount = isFyers && !acc.brokerLink?.clientId && !isArchived;
    const needsDailyLogin = isFyers && !isArchived;

    const brokerPreset = resolveBrokerPreset(acc.broker || '');
    const isIndianMarket = profile.marketRegion === 'IN';
    const fyersHistory = isIndianMarket || isFyers;
    const angelOneFallback = isIndianMarket;

    const showStatutoryBreakdown = (profile.feeModelKey === 'INDIA_STATUTORY' || isIndianMarket) && !isProp;
    const showCommissionSwap = profile.feeModelKey === 'FOREX_COMMISSION' || profile.marketRegion === 'GLOBAL' || isProp;

    const showOptionsFields =
      (isIndianMarket || accType === 'FUTURES_OPTIONS' || accType === 'EQUITY') &&
      !isProp &&
      accType !== 'COMMODITY';

    const showLots =
      accType === 'COMMODITY' ||
      accType === 'FUTURES_OPTIONS' ||
      profile.sessionCalendarKey === 'MCX' ||
      isProp ||
      accType === 'FOREX';

    const showMultiplier =
      accType === 'COMMODITY' ||
      accType === 'FUTURES_OPTIONS' ||
      profile.sessionCalendarKey === 'MCX' ||
      (isIndianMarket && accType !== 'EQUITY');

    const allowedSessions = getAllowedSessions(profile.sessionCalendarKey);

    const watcher = !isArchived && Boolean(profile.capabilities?.canStreamQuotes || isFyers);
    const scalingLadder = !isArchived && Boolean(profile.capabilities?.canScaleLadder) && isFyers;
    const giveback = !isArchived && watcher;
    const telegramExecution = !isArchived && canExecuteLive;
    const killSwitch = !isArchived && canExecuteLive;

    const itemCaps: IAccountUiCapabilities = {
      isDemo,
      isArchived,
      isMultiAccount: false,
      activeAccountCount: 1,
      currency: {
        code: profile.baseCurrency,
        symbol: getCurrencySymbol(profile.baseCurrency),
        isSingleCurrency: true,
        isMultiCurrency: false,
        availableCurrencies: [profile.baseCurrency],
      },
      broker: {
        adapter: profile.executionAdapterKey,
        isFyers,
        isConnected,
        canSyncTrades,
        canSyncFunds,
        canExecuteLive,
        canLinkAccount,
        needsDailyLogin,
      },
      csvImport: {
        tradebook: !isArchived,
        cashLedger: !isArchived && (isIndianMarket || !isProp),
        brokerPresets: Array.from(new Set([brokerPreset, 'CUSTOM'])),
      },
      marketData: {
        fyersHistory,
        angelOneFallback,
        canStreamQuotes: Boolean(profile.capabilities?.canStreamQuotes),
      },
      fees: {
        model: profile.feeModelKey,
        showStatutoryBreakdown,
        showCommissionSwap,
      },
      instruments: {
        showLots,
        showMultiplier,
        showOptionsFields,
        showStrikeExpiry: showOptionsFields,
      },
      position: {
        model: profile.positionModel,
        isNetting: profile.positionModel === 'NETTING_FIFO',
        isHedging: profile.positionModel === 'HEDGING',
      },
      sessions: {
        calendarKey: profile.sessionCalendarKey,
        allowedSessions,
      },
      live: {
        watcher,
        scalingLadder,
        giveback,
        telegramExecution,
        killSwitch,
      },
      prop: {
        isProp,
        firmKey: getEffectivePropFirmKey(acc),
        showChallengePanel: isProp,
        showRuleAdvisories: isProp,
      },
      multiAccountScope: {
        mixedCurrency: false,
        mixedBrokers: false,
        byCurrency: [profile.baseCurrency],
      },
    };

    return {
      account: acc,
      profile,
      isDemo,
      isArchived,
      isProp,
      firmKey: getEffectivePropFirmKey(acc),
      brokerPreset,
      capabilities: itemCaps,
    };
  });

  // SINGLE ACCOUNT SCOPE
  if (evaluatedItems.length === 1) {
    return evaluatedItems[0].capabilities;
  }

  // MULTI-ACCOUNT SCOPE (Conservative Intersection)
  const currencySet = new Set<string>();
  const brokerPresetSet = new Set<string>(['CUSTOM']);
  const adapterSet = new Set<string>();
  const brokerKeySet = new Set<string>();

  for (const item of evaluatedItems) {
    currencySet.add(item.profile.baseCurrency);
    brokerPresetSet.add(item.brokerPreset);
    adapterSet.add(item.profile.executionAdapterKey);
    const b = String(item.account?.broker || item.profile.executionAdapterKey || '').toUpperCase().trim();
    if (b) brokerKeySet.add(b);
  }

  const availableCurrencies = Array.from(currencySet);
  const mixedCurrency = availableCurrencies.length > 1;
  const mixedBrokers = brokerKeySet.size > 1 || brokerPresetSet.size > 2;

  const allArchived = evaluatedItems.every((i) => i.isArchived);
  const allDemo = evaluatedItems.every((i) => i.isDemo);
  const allProp = mode === 'PROP_FIRM' || evaluatedItems.every((i) => i.isProp);

  const allFyers = evaluatedItems.every((i) => i.capabilities.broker.isFyers);
  const allConnected = evaluatedItems.every((i) => i.capabilities.broker.isConnected);
  const allCanSyncTrades = evaluatedItems.every((i) => i.capabilities.broker.canSyncTrades);
  const allCanSyncFunds = evaluatedItems.every((i) => i.capabilities.broker.canSyncFunds);
  const allNeedsDailyLogin = evaluatedItems.every((i) => i.capabilities.broker.needsDailyLogin);

  const allStatutory = evaluatedItems.every((i) => i.capabilities.fees.showStatutoryBreakdown);
  const allCommission = evaluatedItems.every((i) => i.capabilities.fees.showCommissionSwap);
  const allLots = evaluatedItems.every((i) => i.capabilities.instruments.showLots);
  const allMultiplier = evaluatedItems.every((i) => i.capabilities.instruments.showMultiplier);
  const allOptions = evaluatedItems.every((i) => i.capabilities.instruments.showOptionsFields);
  const allNetting = evaluatedItems.every((i) => i.capabilities.position.isNetting);
  const allHedging = evaluatedItems.every((i) => i.capabilities.position.isHedging);

  const allFyersHistory = evaluatedItems.every((i) => i.capabilities.marketData.fyersHistory);
  const allAngelFallback = evaluatedItems.every((i) => i.capabilities.marketData.angelOneFallback);
  const allStreamQuotes = evaluatedItems.every((i) => i.capabilities.marketData.canStreamQuotes);
  const allWatcher = evaluatedItems.every((i) => i.capabilities.live.watcher);
  const allCashLedger = evaluatedItems.every((i) => i.capabilities.csvImport.cashLedger);

  // Common fee model & session calendar if all agree
  const firstItem = evaluatedItems[0];
  const commonFeeModel = evaluatedItems.every((i) => i.profile.feeModelKey === firstItem.profile.feeModelKey)
    ? firstItem.profile.feeModelKey
    : 'CUSTOM';

  const commonPositionModel: PositionModel = allHedging
    ? 'HEDGING'
    : allNetting
    ? 'NETTING_FIFO'
    : 'NETTING_FIFO';

  const commonCalendarKey: SessionCalendarKey = evaluatedItems.every(
    (i) => i.profile.sessionCalendarKey === firstItem.profile.sessionCalendarKey
  )
    ? firstItem.profile.sessionCalendarKey
    : 'NSE';

  // Allowed sessions: intersection across all accounts
  let commonSessions: TradingSession[] = firstItem.capabilities.sessions.allowedSessions;
  for (let idx = 1; idx < evaluatedItems.length; idx++) {
    const sSet = new Set(evaluatedItems[idx].capabilities.sessions.allowedSessions);
    commonSessions = commonSessions.filter((s) => sSet.has(s));
  }
  if (commonSessions.length === 0) {
    commonSessions = ['OFF_HOURS'];
  }

  const commonFirmKey =
    allProp && evaluatedItems.every((i) => i.firmKey === firstItem.firmKey)
      ? firstItem.firmKey
      : undefined;

  return {
    isDemo: allDemo,
    isArchived: allArchived,
    isMultiAccount: true,
    activeAccountCount: evaluatedItems.length,
    currency: {
      code: mixedCurrency ? 'MULTI' : availableCurrencies[0],
      symbol: mixedCurrency ? '' : getCurrencySymbol(availableCurrencies[0]),
      isSingleCurrency: !mixedCurrency,
      isMultiCurrency: mixedCurrency,
      availableCurrencies,
    },
    broker: {
      adapter: adapterSet.size === 1 ? Array.from(adapterSet)[0] : 'MANUAL',
      isFyers: allFyers,
      isConnected: allConnected,
      canSyncTrades: allCanSyncTrades,
      canSyncFunds: allCanSyncFunds,
      canExecuteLive: false, // Disallow simultaneous live executions across multiple accounts
      canLinkAccount: false, // Multi-account scope cannot link to one broker ID
      needsDailyLogin: allNeedsDailyLogin,
    },
    csvImport: {
      tradebook: !allArchived,
      cashLedger: allCashLedger,
      brokerPresets: Array.from(brokerPresetSet),
    },
    marketData: {
      fyersHistory: allFyersHistory,
      angelOneFallback: allAngelFallback,
      canStreamQuotes: allStreamQuotes,
    },
    fees: {
      model: commonFeeModel,
      showStatutoryBreakdown: allStatutory,
      showCommissionSwap: allCommission,
    },
    instruments: {
      showLots: allLots,
      showMultiplier: allMultiplier,
      showOptionsFields: allOptions,
      showStrikeExpiry: allOptions,
    },
    position: {
      model: commonPositionModel,
      isNetting: allNetting,
      isHedging: allHedging,
    },
    sessions: {
      calendarKey: commonCalendarKey,
      allowedSessions: commonSessions,
    },
    live: {
      watcher: allWatcher,
      scalingLadder: false, // Multi-account ladder disabled
      giveback: false,
      telegramExecution: false,
      killSwitch: false,
    },
    prop: {
      isProp: allProp,
      firmKey: commonFirmKey,
      showChallengePanel: allProp,
      showRuleAdvisories: allProp,
    },
    multiAccountScope: {
      mixedCurrency,
      mixedBrokers,
      byCurrency: availableCurrencies,
    },
  };
}
