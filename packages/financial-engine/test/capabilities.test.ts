import { describe, it, expect } from 'vitest';
import {
  resolveAccountUiCapabilities,
  getCurrencySymbol,
  ensureAccountProfile,
} from '../src/capabilities.js';

describe('Account Capability Resolver (resolveAccountUiCapabilities)', () => {
  // Test Data Fixtures for each Matrix Row

  const fyersIndiaLiveAccount = {
    id: 'acc-fyers-1',
    name: 'FYERS Equity & Derivatives',
    broker: 'FYERS',
    accountType: 'FUTURES_OPTIONS',
    baseCurrency: 'INR',
    status: 'ACTIVE',
    brokerLink: {
      broker: 'FYERS',
      clientId: 'FY12345',
      linkedAt: new Date(),
    },
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
    id: 'acc-zerodha-1',
    name: 'Zerodha Kite Equity',
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

  const angelOneAccount = {
    id: 'acc-angel-1',
    name: 'Angel One Cash & F&O',
    broker: 'ANGEL_ONE',
    accountType: 'FUTURES_OPTIONS',
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

  const mcxCommodityAccount = {
    id: 'acc-mcx-1',
    name: 'MCX Commodities Crude & Gold',
    broker: 'ZERODHA',
    accountType: 'COMMODITY',
    baseCurrency: 'INR',
    status: 'ACTIVE',
    profile: {
      marketRegion: 'IN' as const,
      baseCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      feeModelKey: 'INDIA_STATUTORY' as const,
      executionAdapterKey: 'MANUAL' as const,
      positionModel: 'NETTING_FIFO' as const,
      sessionCalendarKey: 'MCX' as const,
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
    id: 'acc-elefin-1',
    name: 'Elefin Forex MT5 Live',
    broker: 'ELEFIN_MT5',
    accountType: 'FOREX',
    baseCurrency: 'USD',
    status: 'ACTIVE',
    profile: {
      marketRegion: 'GLOBAL' as const,
      baseCurrency: 'USD',
      timezone: 'UTC',
      feeModelKey: 'FOREX_COMMISSION' as const,
      executionAdapterKey: 'ELEFIN_MT5' as const,
      positionModel: 'HEDGING' as const,
      sessionCalendarKey: 'FOREX_24_5' as const,
      capabilities: {
        canPlaceOrders: true,
        canModifyStopLoss: true,
        canExitPositions: true,
        canScaleLadder: true,
        canAutoExecute: true,
        canSyncFunds: false,
        canFetchHistory: false,
        canStreamQuotes: true,
      },
    },
  };

  const cryptoAccount = {
    id: 'acc-crypto-1',
    name: 'Binance Futures Crypto',
    broker: 'BINANCE',
    accountType: 'CRYPTO',
    baseCurrency: 'USD',
    status: 'ACTIVE',
    profile: {
      marketRegion: 'GLOBAL' as const,
      baseCurrency: 'USD',
      timezone: 'UTC',
      feeModelKey: 'FOREX_COMMISSION' as const,
      executionAdapterKey: 'MANUAL' as const,
      positionModel: 'NETTING_FIFO' as const,
      sessionCalendarKey: 'CRYPTO_24_7' as const,
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

  const makePropAccount = (id: string, firmKey: string, broker = 'PROP_BRIDGE') => ({
    id,
    name: `${firmKey} 100K Challenge`,
    broker,
    accountType: 'PROP_FIRM',
    baseCurrency: 'USD',
    status: 'ACTIVE',
    propFirm: {
      firmKey,
      planKey: '100K_EVAL',
      phase: 'PHASE_1',
      startingBalance: 100000,
      status: 'ACTIVE',
    },
    profile: {
      marketRegion: 'GLOBAL' as const,
      baseCurrency: 'USD',
      timezone: 'UTC',
      feeModelKey: 'FOREX_COMMISSION' as const,
      executionAdapterKey: 'PROP_SIM' as const,
      positionModel: 'HEDGING' as const,
      sessionCalendarKey: 'FOREX_24_5' as const,
      capabilities: {
        canPlaceOrders: false,
        canModifyStopLoss: false,
        canExitPositions: false,
        canScaleLadder: false,
        canAutoExecute: false,
        canSyncFunds: false,
        canFetchHistory: false,
        canStreamQuotes: true,
      },
    },
  });

  const demoAccount = {
    id: 'acc-demo-1',
    name: 'Paper Trading Demo',
    broker: 'MANUAL',
    accountType: 'DEMO',
    baseCurrency: 'USD',
    status: 'ACTIVE',
    profile: {
      marketRegion: 'GLOBAL' as const,
      baseCurrency: 'USD',
      timezone: 'UTC',
      feeModelKey: 'FOREX_COMMISSION' as const,
      executionAdapterKey: 'MANUAL' as const,
      positionModel: 'NETTING_FIFO' as const,
      sessionCalendarKey: 'FOREX_24_5' as const,
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
    id: 'acc-archived-1',
    name: 'Old FYERS Account (Archived)',
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

  // 1. FYERS India Live
  it('Matrix Row 1: FYERS India Live Account', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: fyersIndiaLiveAccount.id },
      [fyersIndiaLiveAccount]
    );

    expect(caps.isDemo).toBe(false);
    expect(caps.isArchived).toBe(false);
    expect(caps.currency.code).toBe('INR');
    expect(caps.currency.symbol).toBe('₹');

    // Broker
    expect(caps.broker.adapter).toBe('FYERS');
    expect(caps.broker.isFyers).toBe(true);
    expect(caps.broker.isConnected).toBe(true);
    expect(caps.broker.canSyncTrades).toBe(true);
    expect(caps.broker.canSyncFunds).toBe(true);
    expect(caps.broker.canExecuteLive).toBe(true);
    expect(caps.broker.canLinkAccount).toBe(false); // already linked
    expect(caps.broker.needsDailyLogin).toBe(true);

    // CSV & Market Data
    expect(caps.csvImport.tradebook).toBe(true);
    expect(caps.csvImport.cashLedger).toBe(true);
    expect(caps.csvImport.brokerPresets).toContain('FYERS');
    expect(caps.marketData.fyersHistory).toBe(true);
    expect(caps.marketData.angelOneFallback).toBe(true);

    // Fees & Position
    expect(caps.fees.model).toBe('INDIA_STATUTORY');
    expect(caps.fees.showStatutoryBreakdown).toBe(true);
    expect(caps.fees.showCommissionSwap).toBe(false);
    expect(caps.position.model).toBe('NETTING_FIFO');
    expect(caps.position.isNetting).toBe(true);
    expect(caps.position.isHedging).toBe(false);

    // Instruments & Sessions
    expect(caps.instruments.showLots).toBe(true);
    expect(caps.instruments.showOptionsFields).toBe(true);
    expect(caps.sessions.calendarKey).toBe('NSE');
    expect(caps.sessions.allowedSessions).toContain('NSE_REGULAR');

    // Live tactical & Prop
    expect(caps.live.watcher).toBe(true);
    expect(caps.live.scalingLadder).toBe(true);
    expect(caps.live.giveback).toBe(true);
    expect(caps.live.telegramExecution).toBe(true);
    expect(caps.live.killSwitch).toBe(true);
    expect(caps.prop.isProp).toBe(false);
    expect(caps.prop.showChallengePanel).toBe(false);
  });

  // 2. Zerodha Manual
  it('Matrix Row 2: Zerodha Manual Account', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: zerodhaManualAccount.id },
      [zerodhaManualAccount]
    );

    expect(caps.broker.adapter).toBe('MANUAL');
    expect(caps.broker.isFyers).toBe(false);
    expect(caps.broker.isConnected).toBe(false);
    expect(caps.broker.canSyncTrades).toBe(false);
    expect(caps.broker.canSyncFunds).toBe(false);
    expect(caps.broker.canExecuteLive).toBe(false);
    expect(caps.broker.canLinkAccount).toBe(false);
    expect(caps.broker.needsDailyLogin).toBe(false);

    // Manual CSV import only
    expect(caps.csvImport.tradebook).toBe(true);
    expect(caps.csvImport.cashLedger).toBe(true);
    expect(caps.csvImport.brokerPresets).toContain('ZERODHA');

    // Indian market data fallback allowed for candles
    expect(caps.marketData.fyersHistory).toBe(true);
    expect(caps.marketData.angelOneFallback).toBe(true);

    // Live broker execution UI hidden
    expect(caps.live.watcher).toBe(false);
    expect(caps.live.scalingLadder).toBe(false);
    expect(caps.live.telegramExecution).toBe(false);
    expect(caps.live.killSwitch).toBe(false);

    // Prop panel hidden
    expect(caps.prop.isProp).toBe(false);
    expect(caps.prop.showChallengePanel).toBe(false);
  });

  // 3. Angel One Account
  it('Matrix Row 3: Angel One Manual Account', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: angelOneAccount.id },
      [angelOneAccount]
    );

    expect(caps.broker.isFyers).toBe(false);
    expect(caps.broker.canExecuteLive).toBe(false);
    expect(caps.csvImport.brokerPresets).toContain('ANGEL_ONE');
    expect(caps.marketData.angelOneFallback).toBe(true);
  });

  // 4. MCX Commodity Account
  it('Matrix Row 4: MCX Commodity Account', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: mcxCommodityAccount.id },
      [mcxCommodityAccount]
    );

    expect(caps.sessions.calendarKey).toBe('MCX');
    expect(caps.sessions.allowedSessions).toContain('MCX_EVENING');
    expect(caps.instruments.showLots).toBe(true);
    expect(caps.instruments.showMultiplier).toBe(true);
    expect(caps.instruments.showOptionsFields).toBe(false);
    expect(caps.fees.showStatutoryBreakdown).toBe(true);
  });

  // 5. Forex Hedging Account (ELEFIN MT5)
  it('Matrix Row 5: Forex Hedging Account (ELEFIN MT5)', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: forexHedgingAccount.id },
      [forexHedgingAccount]
    );

    expect(caps.currency.code).toBe('USD');
    expect(caps.currency.symbol).toBe('$');
    expect(caps.position.model).toBe('HEDGING');
    expect(caps.position.isNetting).toBe(false);
    expect(caps.position.isHedging).toBe(true);

    // Fees: Commission & swap shown, Indian statutory hidden
    expect(caps.fees.model).toBe('FOREX_COMMISSION');
    expect(caps.fees.showStatutoryBreakdown).toBe(false);
    expect(caps.fees.showCommissionSwap).toBe(true);

    // Sessions: 24/5
    expect(caps.sessions.calendarKey).toBe('FOREX_24_5');
    expect(caps.sessions.allowedSessions).toEqual(['ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS']);

    // Live MT5 execution
    expect(caps.broker.adapter).toBe('ELEFIN_MT5');
    expect(caps.broker.canExecuteLive).toBe(true);
    expect(caps.broker.canSyncFunds).toBe(false);
    expect(caps.broker.isFyers).toBe(false);
  });

  // 6. Crypto Account
  it('Matrix Row 6: Crypto Account', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: cryptoAccount.id },
      [cryptoAccount]
    );

    expect(caps.sessions.calendarKey).toBe('CRYPTO_24_7');
    expect(caps.sessions.allowedSessions).toEqual(['OFF_HOURS']);
    expect(caps.fees.showStatutoryBreakdown).toBe(false);
  });

  // 7. Prop Firm Accounts (Each firm)
  const propFirms = ['THE5ERS', 'FTMO', 'FUNDEDNEXT', 'FUNDING_PIPS', 'APEX', 'TOPSTEP'];
  propFirms.forEach((firm) => {
    it(`Matrix Row 7: Prop Firm Account (${firm})`, () => {
      const propAcc = makePropAccount(`acc-prop-${firm}`, firm);
      const caps = resolveAccountUiCapabilities(
        { mode: 'ACCOUNT', accountId: propAcc.id },
        [propAcc]
      );

      expect(caps.prop.isProp).toBe(true);
      expect(caps.prop.firmKey).toBe(firm);
      expect(caps.prop.showChallengePanel).toBe(true);
      expect(caps.prop.showRuleAdvisories).toBe(true);

      // Statutory charges and Indian presets hidden
      expect(caps.fees.showStatutoryBreakdown).toBe(false);
      expect(caps.fees.showCommissionSwap).toBe(true);
      expect(caps.broker.isFyers).toBe(false);
      expect(caps.broker.canExecuteLive).toBe(false);
    });
  });

  // 8. Demo Account
  it('Matrix Row 8: Demo Account hides real broker calls', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: demoAccount.id },
      [demoAccount]
    );

    expect(caps.isDemo).toBe(true);
    expect(caps.broker.canExecuteLive).toBe(false);
    expect(caps.broker.canSyncFunds).toBe(false);
    expect(caps.broker.canLinkAccount).toBe(false);
    expect(caps.live.telegramExecution).toBe(false);
    expect(caps.live.killSwitch).toBe(false);
  });

  // 9. Archived Account (Read-only mode)
  it('Matrix Row 9: Archived Account is strictly read-only', () => {
    const caps = resolveAccountUiCapabilities(
      { mode: 'ACCOUNT', accountId: archivedAccount.id },
      [archivedAccount]
    );

    expect(caps.isArchived).toBe(true);
    expect(caps.broker.canExecuteLive).toBe(false);
    expect(caps.broker.canSyncTrades).toBe(false);
    expect(caps.broker.canSyncFunds).toBe(false);
    expect(caps.broker.canLinkAccount).toBe(false);
    expect(caps.csvImport.tradebook).toBe(false);
    expect(caps.csvImport.cashLedger).toBe(false);
    expect(caps.live.watcher).toBe(false);
    expect(caps.live.scalingLadder).toBe(false);
    expect(caps.live.telegramExecution).toBe(false);
    expect(caps.live.killSwitch).toBe(false);
  });

  // 10. Mixed Currency Scope (Invariant #9)
  it('Matrix Row 10: Mixed Currency Scope returns MULTI and zero cross-currency summing', () => {
    const allAccounts = [fyersIndiaLiveAccount, forexHedgingAccount];
    const caps = resolveAccountUiCapabilities(
      { mode: 'ALL' },
      allAccounts
    );

    expect(caps.isMultiAccount).toBe(true);
    expect(caps.multiAccountScope.mixedCurrency).toBe(true);
    expect(caps.currency.code).toBe('MULTI');
    expect(caps.currency.symbol).toBe('');
    expect(caps.currency.isSingleCurrency).toBe(false);
    expect(caps.currency.isMultiCurrency).toBe(true);
    expect(caps.currency.availableCurrencies).toContain('INR');
    expect(caps.currency.availableCurrencies).toContain('USD');

    // Conservative intersection: broker execution disallowed across multi-account
    expect(caps.broker.canExecuteLive).toBe(false);
    expect(caps.broker.canLinkAccount).toBe(false);
    expect(caps.fees.showStatutoryBreakdown).toBe(false); // only 1 is statutory
    expect(caps.fees.showCommissionSwap).toBe(false); // only 1 is commission
  });

  // 11. Mixed Broker Scope
  it('Matrix Row 11: Mixed Broker Scope (FYERS + Zerodha)', () => {
    const allAccounts = [fyersIndiaLiveAccount, zerodhaManualAccount];
    const caps = resolveAccountUiCapabilities(
      { mode: 'ALL' },
      allAccounts
    );

    expect(caps.isMultiAccount).toBe(true);
    expect(caps.currency.code).toBe('INR'); // Both INR
    expect(caps.currency.symbol).toBe('₹');
    expect(caps.multiAccountScope.mixedCurrency).toBe(false);
    expect(caps.multiAccountScope.mixedBrokers).toBe(true);

    // Conservative intersection: FYERS live execution disallowed
    expect(caps.broker.isFyers).toBe(false); // Not all are FYERS
    expect(caps.broker.canExecuteLive).toBe(false);
    expect(caps.broker.canSyncTrades).toBe(false);

    // Presets include both
    expect(caps.csvImport.brokerPresets).toContain('FYERS');
    expect(caps.csvImport.brokerPresets).toContain('ZERODHA');
    expect(caps.csvImport.brokerPresets).toContain('CUSTOM');
  });

  // 12. Helper getCurrencySymbol
  it('Helper getCurrencySymbol returns correct narrow symbols', () => {
    expect(getCurrencySymbol('INR')).toBe('₹');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('GBP')).toBe('£');
    expect(getCurrencySymbol('MULTI')).toBe('');
  });
});

