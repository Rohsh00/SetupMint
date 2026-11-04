import mongoose from 'mongoose';
import { AccountScope, AccountScopeMode } from '@tradevault/shared';
import { TradingAccount } from '../db/models/TradingAccount.js';

export class AccountScopeService {
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

      if (scope?.firmKey && scope.firmKey !== 'ALL') {
        const firmRegex = new RegExp(`^${scope.firmKey.trim()}$`, 'i');
        baseQuery.$and = [
          { $or: propConditions },
          {
            $or: [
              { 'propFirm.firmKey': firmRegex },
              { 'propFirmConfig.firm': firmRegex },
              { broker: firmRegex },
            ],
          },
        ];
      } else {
        baseQuery.$or = propConditions;
      }

      const accounts = await TradingAccount.find(baseQuery).select('_id');
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
