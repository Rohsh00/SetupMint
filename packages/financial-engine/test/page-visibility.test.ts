import { describe, it, expect } from 'vitest';
import { resolveAccountUiCapabilities } from '../src/capabilities.js';
import type { IAccountUiCapabilities } from '@tradevault/shared';

/**
 * Pure Page Action & Element Visibility Resolver
 * Mirrors the exact conditional rendering logic across the web app pages.
 */
export function resolvePageElementVisibility(caps: IAccountUiCapabilities) {
  return {
    header: {
      showFyersSyncButton: caps.broker.isFyers && caps.broker.canSyncTrades,
      showLogTradeButton: !caps.isArchived,
      showLiveExecutionHotkeys: caps.broker.canExecuteLive,
    },
    dashboard: {
      showPropChallengePanel: caps.prop.showChallengePanel,
      showLiveOpenTradeWatcher: caps.live.watcher,
      showLiveMarketChart: !caps.prop.isProp && (caps.marketData.fyersHistory || caps.marketData.angelOneFallback),
      showDailyDrawdownAdvisory: caps.prop.showRuleAdvisories,
    },
    trades: {
      showLogTradeButton: !caps.isArchived,
      showBulkActions: !caps.isArchived,
      showLiveWatcher: caps.live.watcher,
      showQuickCloseLiveBrokerOption: caps.broker.canExecuteLive,
    },
    tradeForm: {
      showLots: caps.instruments.showLots,
      showMultiplier: caps.instruments.showMultiplier,
      showOptionsFields: caps.instruments.showOptionsFields,
      showFifoAdvancedFills: caps.position.isNetting,
      showStatutoryTaxBreakdown: caps.fees.showStatutoryBreakdown,
      showForexCommissionSwap: caps.fees.showCommissionSwap,
      showNseSessionsOnly: caps.sessions.allowedSessions.includes('NSE_PRE') && !caps.sessions.allowedSessions.includes('LONDON_OPEN'),
    },
    liveWatcher: {
      showScalperHotkeys: caps.broker.canExecuteLive,
      showScalingLadder: caps.live.scalingLadder,
      showPersonalRiskGuardrail: !caps.prop.isProp,
    },
    accounts: {
      showFyersFundsCard: caps.broker.canSyncFunds,
      showCashFlowActions: !caps.isArchived,
      showContextualLinkFyers: caps.broker.isFyers && !caps.broker.isConnected,
    },
    reports: {
      showCashLedgerImport: caps.csvImport.cashLedger,
      allowedBrokerPresets: caps.csvImport.brokerPresets,
    },
    analytics: {
      showExecutionQualityTab: caps.marketData.fyersHistory || caps.marketData.angelOneFallback,
      showStopsTargetsWhatIfTab: caps.marketData.fyersHistory || caps.marketData.angelOneFallback,
    },
    settings: {
      showFyersCard: caps.broker.isFyers,
      showLiveExecutionWebhook: caps.broker.canExecuteLive,
    },
  };
}

describe('Page Element Visibility Matrix by Account Type', () => {
  // Test accounts
  const fyersIndiaLiveAccount = {
    id: 'acc-fyers',
    name: 'FYERS Live',
    broker: 'FYERS',
    accountType: 'FUTURES_OPTIONS',
    baseCurrency: 'INR',
    status: 'ACTIVE',
    brokerLink: { broker: 'FYERS', clientId: 'FY123', linkedAt: new Date() },
    profile: {
      marketRegion: 'IN' as const,
      baseCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      feeModelKey: 'INDIA_STATUTORY' as const,
      executionAdapterKey: 'FYERS' as const,
      positionModel: 'NETTING_FIFO' as const,
      sessionCalendarKey: 'NSE' as const,
      capabilities: {
        canPlaceOrders: true,
        canModifyStopLoss: true,
        canExitPositions: true,
        canScaleLadder: true,
        canAutoExecute: true,
        canSyncFunds: true,
        canFetchHistory: true,
        canStreamQuotes: true,
      },
    },
  };

  const zerodhaManualAccount = {
    id: 'acc-zerodha',
    name: 'Zerodha Manual',
    broker: 'ZERODHA',
    accountType: 'EQUITY',
    baseCurrency: 'INR',
    status: 'ACTIVE',
    profile: {
      marketRegion: 'IN' as const,
      baseCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      feeModelKey: 'INDIA_STATUTORY' as const,
      executionAdapterKey: 'MANUAL' as const,
      positionModel: 'NETTING_FIFO' as const,
      sessionCalendarKey: 'NSE' as const,
      capabilities: {
        canPlaceOrders: false,
        canModifyStopLoss: false,
        canExitPositions: false,
        canScaleLadder: false,
        canAutoExecute: false,
        canSyncFunds: false,
        canFetchHistory: false,
        canStreamQuotes: false,
      },
    },
  };

  const the5ersPropAccount = {
    id: 'acc-5ers',
    name: 'The5ers Bootcamp',
    broker: 'THE5ERS',
    accountType: 'PROP_EVALUATION',
    baseCurrency: 'USD',
    status: 'ACTIVE',
    propFirm: { firmName: 'THE5ERS', challengeType: 'BOOTCAMP', currentPhase: 1, startingBalance: 100000 },
    profile: {
      marketRegion: 'GLOBAL' as const,
      baseCurrency: 'USD',
      timezone: 'UTC',
      feeModelKey: 'PROP_SIMULATED' as const,
      executionAdapterKey: 'MANUAL' as const,
      positionModel: 'HEDGING' as const,
      sessionCalendarKey: 'GLOBAL_24X5' as const,
      capabilities: {
        canPlaceOrders: false,
        canModifyStopLoss: false,
        canExitPositions: false,
        canScaleLadder: false,
        canAutoExecute: false,
        canSyncFunds: false,
        canFetchHistory: false,
        canStreamQuotes: false,
      },
    },
  };

  const forexHedgingAccount = {
    id: 'acc-elefin',
    name: 'Elefin Forex MT5',
    broker: 'ELEFIN_MT5',
    accountType: 'FOREX',
    baseCurrency: 'USD',
    status: 'ACTIVE',
    profile: {
      marketRegion: 'GLOBAL' as const,
      baseCurrency: 'USD',
      timezone: 'Europe/London',
      feeModelKey: 'COMMISSION_SWAP' as const,
      executionAdapterKey: 'MANUAL' as const,
      positionModel: 'HEDGING' as const,
      sessionCalendarKey: 'GLOBAL_24X5' as const,
      capabilities: {
        canPlaceOrders: false,
        canModifyStopLoss: false,
        canExitPositions: false,
        canScaleLadder: false,
        canAutoExecute: false,
        canSyncFunds: false,
        canFetchHistory: false,
        canStreamQuotes: false,
      },
    },
  };

  const archivedAccount = {
    id: 'acc-archived',
    name: 'Old FYERS Account',
    broker: 'FYERS',
    accountType: 'EQUITY',
    baseCurrency: 'INR',
    status: 'ARCHIVED',
    profile: {
      marketRegion: 'IN' as const,
      baseCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      feeModelKey: 'INDIA_STATUTORY' as const,
      executionAdapterKey: 'FYERS' as const,
      positionModel: 'NETTING_FIFO' as const,
      sessionCalendarKey: 'NSE' as const,
      capabilities: {
        canPlaceOrders: true,
        canModifyStopLoss: true,
        canExitPositions: true,
        canScaleLadder: true,
        canAutoExecute: true,
        canSyncFunds: true,
        canFetchHistory: true,
        canStreamQuotes: true,
      },
    },
  };

  it('1. FYERS India Live Account: enables live execution, Indian statutory fees, NSE sessions, hides prop panel', () => {
    const caps = resolveAccountUiCapabilities({ mode: 'ACCOUNT', accountId: 'acc-fyers' }, [fyersIndiaLiveAccount]);
    const ui = resolvePageElementVisibility(caps);

    // Header & live execution
    expect(ui.header.showFyersSyncButton).toBe(true);
    expect(ui.header.showLiveExecutionHotkeys).toBe(true);
    expect(ui.dashboard.showLiveOpenTradeWatcher).toBe(true);
    expect(ui.dashboard.showPropChallengePanel).toBe(false);
    expect(ui.dashboard.showLiveMarketChart).toBe(true);

    // Trade form
    expect(ui.tradeForm.showLots).toBe(true);
    expect(ui.tradeForm.showMultiplier).toBe(true);
    expect(ui.tradeForm.showOptionsFields).toBe(true);
    expect(ui.tradeForm.showFifoAdvancedFills).toBe(true);
    expect(ui.tradeForm.showStatutoryTaxBreakdown).toBe(true);
    expect(ui.tradeForm.showForexCommissionSwap).toBe(false);

    // Quick close
    expect(ui.trades.showQuickCloseLiveBrokerOption).toBe(true);

    // Accounts page
    expect(ui.accounts.showFyersFundsCard).toBe(true);
  });

  it('2. Zerodha Manual Equity Account: hides FYERS execution/sync, shows Indian statutory charges and CSV import', () => {
    const caps = resolveAccountUiCapabilities({ mode: 'ACCOUNT', accountId: 'acc-zerodha' }, [zerodhaManualAccount]);
    const ui = resolvePageElementVisibility(caps);

    expect(ui.header.showFyersSyncButton).toBe(false);
    expect(ui.header.showLiveExecutionHotkeys).toBe(false);
    expect(ui.dashboard.showLiveOpenTradeWatcher).toBe(false);
    expect(ui.dashboard.showPropChallengePanel).toBe(false);
    expect(ui.trades.showQuickCloseLiveBrokerOption).toBe(false);

    // Trade form
    expect(ui.tradeForm.showLots).toBe(false);
    expect(ui.tradeForm.showMultiplier).toBe(false);
    expect(ui.tradeForm.showStatutoryTaxBreakdown).toBe(true);
    expect(ui.tradeForm.showForexCommissionSwap).toBe(false);
    expect(ui.tradeForm.showFifoAdvancedFills).toBe(true);

    // Accounts page
    expect(ui.accounts.showFyersFundsCard).toBe(false);
    expect(ui.reports.allowedBrokerPresets).toContain('ZERODHA');
    expect(ui.reports.allowedBrokerPresets).not.toContain('FYERS');
  });

  it('3. The5ers Prop Account: displays challenge panel, rule advisories, hides Indian fees and broker execution', () => {
    const caps = resolveAccountUiCapabilities({ mode: 'ACCOUNT', accountId: 'acc-5ers' }, [the5ersPropAccount]);
    const ui = resolvePageElementVisibility(caps);

    // Prop specific
    expect(ui.dashboard.showPropChallengePanel).toBe(true);
    expect(ui.dashboard.showDailyDrawdownAdvisory).toBe(true);
    expect(ui.liveWatcher.showPersonalRiskGuardrail).toBe(false);

    // Hides live execution and statutory charges
    expect(ui.header.showFyersSyncButton).toBe(false);
    expect(ui.header.showLiveExecutionHotkeys).toBe(false);
    expect(ui.tradeForm.showStatutoryTaxBreakdown).toBe(false);
    expect(ui.tradeForm.showForexCommissionSwap).toBe(true);
    expect(ui.tradeForm.showFifoAdvancedFills).toBe(false); // Hedging model
    expect(ui.accounts.showFyersFundsCard).toBe(false);
  });

  it('4. Forex Hedging MT5 Account: displays Commission/Swap fees, ticket-based hedging, hides FIFO and NSE', () => {
    const caps = resolveAccountUiCapabilities({ mode: 'ACCOUNT', accountId: 'acc-elefin' }, [forexHedgingAccount]);
    const ui = resolvePageElementVisibility(caps);

    expect(ui.dashboard.showPropChallengePanel).toBe(false);
    expect(ui.tradeForm.showStatutoryTaxBreakdown).toBe(false);
    expect(ui.tradeForm.showForexCommissionSwap).toBe(true);
    expect(ui.tradeForm.showFifoAdvancedFills).toBe(false); // Hedging!
    expect(ui.tradeForm.showNseSessionsOnly).toBe(false);
    expect(ui.reports.allowedBrokerPresets).toContain('MT5');
    expect(ui.reports.allowedBrokerPresets).not.toContain('ZERODHA');
  });

  it('5. Archived Account: strictly read-only, hides trade creation, bulk actions, and cash flows', () => {
    const caps = resolveAccountUiCapabilities({ mode: 'ACCOUNT', accountId: 'acc-archived' }, [archivedAccount]);
    const ui = resolvePageElementVisibility(caps);

    expect(ui.header.showLogTradeButton).toBe(false);
    expect(ui.trades.showLogTradeButton).toBe(false);
    expect(ui.trades.showBulkActions).toBe(false);
    expect(ui.accounts.showCashFlowActions).toBe(false);
  });

  it('6. Mixed-Currency Scope (ALL): intersection mode, multi-currency indication', () => {
    const caps = resolveAccountUiCapabilities({ mode: 'ALL' }, [
      fyersIndiaLiveAccount,
      the5ersPropAccount,
      forexHedgingAccount,
    ]);
    const ui = resolvePageElementVisibility(caps);

    expect(caps.currency.code).toBe('MULTI');
    expect(caps.multiAccountScope.mixedCurrency).toBe(true);
    expect(caps.multiAccountScope.mixedBrokers).toBe(true);

    // Intersection: any execution must be false because The5ers & Elefin are manual
    expect(ui.header.showFyersSyncButton).toBe(false);
    expect(ui.header.showLiveExecutionHotkeys).toBe(false);
    expect(ui.trades.showQuickCloseLiveBrokerOption).toBe(false);

    // Prop panel is not universal
    expect(ui.dashboard.showPropChallengePanel).toBe(false);
    expect(ui.tradeForm.showStatutoryTaxBreakdown).toBe(false);
  });
});
