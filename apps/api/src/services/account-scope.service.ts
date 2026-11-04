import mongoose from 'mongoose';
import { AccountScope, AccountScopeMode, IRiskSettings } from '@tradevault/shared';
import { getPropFirmPreset, mergeRuleSetWithOverrides } from '@tradevault/financial-engine';
import { TradingAccount } from '../db/models/TradingAccount.js';

export interface ScopedRiskContext {
  isPropScope: boolean;
  currency: string;
  currencySymbol: string;
  riskSettings: IRiskSettings & { maxDailyLoss: number };
}

export class AccountScopeService {
  /**
   * Determines whether an account document represents a Prop Firm account.
   */
  static isPropAccount(acc: any): boolean {
    if (!acc) return false;
    return (
      acc.accountType === 'PROP_FIRM' ||
      Boolean(acc.propFirm?.firmKey && String(acc.propFirm.firmKey).trim() !== '') ||
      acc.propFirmConfig?.enabled === true
    );
  }

  /**
   * Resolves the canonical uppercase firm key (e.g. 'THE5ERS', 'FTMO') for a prop account,
   * avoiding Mongoose's default `propFirmConfig.firm = 'THE5ERS'` when `propFirm.firmKey` or `broker` is set.
   */
  static getEffectivePropFirmKey(acc: any): string | null {
    if (!this.isPropAccount(acc)) return null;

    if (acc.propFirm?.firmKey && String(acc.propFirm.firmKey).trim()) {
      return String(acc.propFirm.firmKey).trim().toUpperCase();
    }
    if (acc.propFirmConfig?.enabled && acc.propFirmConfig?.firm) {
      return String(acc.propFirmConfig.firm).trim().toUpperCase();
    }
    if (
      acc.broker &&
      !['FYERS', 'ZERODHA', 'UPSTOX', 'ANGELONE', 'ICICI', 'KOTAK', 'BINANCE', 'OTHER'].includes(
        String(acc.broker).trim().toUpperCase()
      )
    ) {
      return String(acc.broker).trim().toUpperCase();
    }
    if (acc.propFirmConfig?.firm) {
      return String(acc.propFirmConfig.firm).trim().toUpperCase();
    }
    return 'CUSTOM';
  }

  /**
   * Computes the daily loss limit (in account currency) for a single prop firm account.
   */
  static getPropAccountDailyLossLimit(acc: any): number {
    if (typeof acc.riskRules?.maxDailyLoss === 'number' && acc.riskRules.maxDailyLoss > 0) {
      return acc.riskRules.maxDailyLoss;
    }
    const startBal = Number(
      acc.propFirm?.startingBalance ||
        acc.propFirmConfig?.initialBalance ||
        acc.initialBalance ||
        100000
    );
    const firmKey = acc.propFirm?.firmKey || acc.propFirmConfig?.firm || 'the5ers';
    const planKey = acc.propFirm?.planKey || acc.propFirmConfig?.planName;
    const preset = getPropFirmPreset(firmKey, planKey);
    const ruleSet = preset
      ? mergeRuleSetWithOverrides(preset, acc.propFirm?.ruleSetOverrides)
      : (acc.propFirm?.ruleSetOverrides as any);

    const dailyLossPct =
      ruleSet?.dailyLoss?.limitPct ??
      acc.propFirmConfig?.dailyLossLimitPercent ??
      5;

    return Number(((startBal * Number(dailyLossPct)) / 100).toFixed(2));
  }

  /**
   * Resolves scope-appropriate risk settings and currency so that personal INR riskSettings
   * never leak into Prop Firm scope (and vice versa).
   */
  static async resolveScopedRiskSettings(
    userId: string | mongoose.Types.ObjectId,
    accountIds: mongoose.Types.ObjectId[],
    scope: Partial<AccountScope> | undefined,
    userRiskSettings?: Partial<IRiskSettings> | null
  ): Promise<ScopedRiskContext> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const accounts =
      accountIds.length > 0
        ? await TradingAccount.find({ _id: { $in: accountIds }, userId: uId }).lean()
        : [];

    const allResolvedAreProp =
      scope?.mode === 'PROP_FIRM' ||
      (accounts.length > 0 && accounts.every((a) => this.isPropAccount(a)));

    if (allResolvedAreProp) {
      const currency = (accounts[0]?.baseCurrency || 'USD').toUpperCase();
      const currencySymbol = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
      const propDailyLimit =
        accounts.length > 0
          ? accounts.reduce((sum, a) => sum + this.getPropAccountDailyLossLimit(a), 0)
          : 5000;
      const maxRiskPct =
        accounts[0]?.riskRules?.maxRiskPerTradePercent ??
        userRiskSettings?.maxRiskPerTradePercent ??
        1;
      const maxDailyTrades =
        accounts[0]?.riskRules?.maxOpenTrades ??
        userRiskSettings?.maxDailyTrades ??
        10;

      return {
        isPropScope: true,
        currency,
        currencySymbol,
        riskSettings: {
          maxRiskPerTradePercent: maxRiskPct,
          maxDailyLoss: propDailyLimit,
          maxDailyTrades,
          maxOpenTrades: accounts[0]?.riskRules?.maxOpenTrades ?? userRiskSettings?.maxOpenTrades ?? 5,
          revengeTradingMinutes: userRiskSettings?.revengeTradingMinutes ?? 15,
        },
      };
    }

    const currency = (accounts[0]?.baseCurrency || 'INR').toUpperCase();
    const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₹';

    return {
      isPropScope: false,
      currency,
      currencySymbol,
      riskSettings: {
        maxRiskPerTradePercent: userRiskSettings?.maxRiskPerTradePercent ?? 2,
        maxDailyLoss: userRiskSettings?.maxDailyLoss ?? 5000,
        maxDailyTrades: userRiskSettings?.maxDailyTrades ?? 5,
        maxOpenTrades: userRiskSettings?.maxOpenTrades ?? 3,
        revengeTradingMinutes: userRiskSettings?.revengeTradingMinutes ?? 15,
      },
    };
  }

  /**
   * Resolves an AccountScope to an array of validated Mongoose ObjectIds.
   *
   * Invariants:
   * 1. Always strictly filters by userId (tenant isolation).
   * 2. Excludes archived accounts unless explicitly requested via includeArchived: true.
   * 3. Never trusts client-supplied account IDs without ownership verification.
   * 4. Returns [] safely if no accounts match or ownership check fails.
   */
  static async resolveAccountScope(
    userId: string | mongoose.Types.ObjectId,
    scope?: Partial<AccountScope> | null
  ): Promise<mongoose.Types.ObjectId[]> {
    const userOid =
      typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const baseQuery: mongoose.FilterQuery<any> = {
      userId: userOid,
    };

    if (!scope?.includeArchived) {
      baseQuery.status = { $ne: 'ARCHIVED' };
    }

    // If an explicit accountId is supplied, it must be a valid ObjectId
    if (scope?.accountId) {
      if (!mongoose.Types.ObjectId.isValid(scope.accountId)) {
        return [];
      }
      baseQuery._id = new mongoose.Types.ObjectId(scope.accountId);
    } else if (scope?.mode === 'ACCOUNT') {
      // Mode is ACCOUNT but no accountId was provided
      return [];
    }

    const mode: AccountScopeMode = scope?.mode || 'ALL';

    // 2. Prop Firm scope
    if (mode === 'PROP_FIRM') {
      const propConditions: any[] = [
        { accountType: 'PROP_FIRM' },
        { 'propFirm.firmKey': { $exists: true, $nin: [null, ''] } },
        { 'propFirmConfig.enabled': true },
      ];
      baseQuery.$or = propConditions;

      const accounts = await TradingAccount.find(baseQuery).select(
        '_id accountType broker propFirm propFirmConfig'
      );

      if (scope?.firmKey && scope.firmKey.trim().toUpperCase() !== 'ALL') {
        const targetFirm = scope.firmKey.trim().toUpperCase();
        return accounts
          .filter((a) => {
            const effFirm = this.getEffectivePropFirmKey(a);
            const brokerFirm = a.broker ? String(a.broker).trim().toUpperCase() : '';
            return effFirm === targetFirm || brokerFirm === targetFirm;
          })
          .map((a) => a._id as mongoose.Types.ObjectId);
      }

      return accounts.map((a) => a._id as mongoose.Types.ObjectId);
    }

    // 3. Account Type scope
    if (mode === 'TYPE' && scope?.accountType) {
      const upperType = String(scope.accountType).toUpperCase();
      if (upperType === 'LIVE' || upperType === 'PERSONAL') {
        baseQuery.accountType = { $nin: ['PROP_FIRM', 'DEMO'] };
        baseQuery.$and = [
          {
            $or: [
              { 'propFirm.firmKey': { $exists: false } },
              { 'propFirm.firmKey': { $in: [null, ''] } },
            ],
          },
          { 'propFirmConfig.enabled': { $ne: true } },
        ];
      } else {
        baseQuery.accountType = upperType;
      }
      const accounts = await TradingAccount.find(baseQuery).select('_id');
      return accounts.map((a) => a._id as mongoose.Types.ObjectId);
    }

    // 4. Default: All active accounts owned by the user
    const accounts = await TradingAccount.find(baseQuery).select('_id');
    return accounts.map((a) => a._id as mongoose.Types.ObjectId);
  }

  /**
   * Helper to parse and normalize AccountScope from request query parameters or request body.
   */
  static parseAccountScope(input: any = {}): AccountScope {
    const rawMode = input.scope || input.mode;
    let mode: AccountScopeMode = 'ALL';

    if (rawMode === 'PROP_FIRM' || rawMode === 'prop_firm') {
      mode = 'PROP_FIRM';
    } else if (rawMode === 'TYPE' || rawMode === 'type') {
      mode = 'TYPE';
    } else if (rawMode === 'ACCOUNT' || rawMode === 'account' || (input.accountId && !rawMode)) {
      mode = 'ACCOUNT';
    } else {
      mode = 'ALL';
    }

    const firmKey = input.firmKey || input.firm;
    const accountId = input.accountId || input.account;
    const accountType = input.accountType || input.type;
    const includeArchived =
      input.includeArchived === true || input.includeArchived === 'true';

    return {
      mode,
      accountId: accountId ? String(accountId).trim() : undefined,
      accountType,
      firmKey: firmKey ? String(firmKey).trim() : undefined,
      includeArchived,
    };
  }
}
