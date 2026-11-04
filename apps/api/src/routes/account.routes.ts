import crypto from 'crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { accountTransactionSchema, createAccountSchema } from '@tradevault/shared';
import { evaluatePropFirmHealth, listPropFirmPresets, getPropFirmPreset } from '@tradevault/financial-engine';
import {
  AccountTransaction,
  BrokerFundsSnapshot,
  BrokerIntegration,
  Instrument,
  Trade,
  TradingAccount,
} from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
import { AccountScopeService } from '../services/account-scope.service.js';
import { EconomicCalendarService } from '../services/economic-calendar.service.js';
import { PropMonteCarloService } from '../services/prop-monte-carlo.service.js';
import { FyersService } from '../services/fyers.service.js';
import { decryptSecret } from '../services/crypto.service.js';
import { validateObjectIdParam } from '../middleware/validate.js';
import { config } from '../config.js';

function hasValidFyersToken(integration: any): boolean {
  if (!integration?.accessToken) return false;
  const expiry = integration.tokenExpiresAt || integration.authCodeExpiresAt;
  return Boolean(expiry && new Date(expiry) > new Date());
}

function serializeFundsSnapshot(snapshot: any) {
  return {
    id: snapshot._id.toString(),
    accountId: snapshot.accountId.toString(),
    broker: snapshot.broker,
    clientId: snapshot.clientId,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    totalBalance: Number(snapshot.totalBalance.toString()),
    clearBalance: Number(snapshot.clearBalance.toString()),
    availableBalance: Number(snapshot.availableBalance.toString()),
    realizedPnL: Number(snapshot.realizedPnL.toString()),
    utilizedAmount: Number(snapshot.utilizedAmount.toString()),
    fundLimits: (snapshot.fundLimits || []).map((limit: any) => ({
      id: limit.id,
      title: limit.title,
      equityAmount: Number(limit.equityAmount.toString()),
      commodityAmount: Number(limit.commodityAmount.toString()),
    })),
    createdAt: snapshot.createdAt?.toISOString(),
  };
}

function serializePendingTransaction(tx: any) {
  return {
    id: tx._id.toString(),
    accountId: tx.accountId.toString(),
    type: tx.type,
    amount: Number(tx.amount.toString()),
    currency: tx.currency,
    date: tx.date.toISOString(),
    notes: tx.notes,
    source: tx.source,
    status: tx.status,
    idempotencyKey: tx.idempotencyKey,
    createdAt: tx.createdAt?.toISOString(),
    updatedAt: tx.updatedAt?.toISOString(),
  };
}

export const accountRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // List user accounts
  app.get('/', async (req, reply) => {
    const [accounts, latestSnapshots] = await Promise.all([
      TradingAccount.find({ userId: req.user!.id }).sort({ createdAt: 1 }),
      BrokerFundsSnapshot.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.user!.id) } },
        { $sort: { fetchedAt: -1 } },
        {
          $group: {
            _id: '$accountId',
            doc: { $first: '$$ROOT' },
          },
        },
      ]),
    ]);

    const snapshotMap = new Map<string, any>(
      latestSnapshots.map((item) => [item._id.toString(), item.doc])
    );

    const data = accounts.map((acc) => {
      const initial = Number(acc.initialBalance.toString());
      const pnl = Number(acc.realizedPnL.toString());
      const deposits = Number(acc.totalDeposits.toString());
      const withdrawals = Number(acc.totalWithdrawals.toString());
      const adjustments = Number(acc.totalAdjustments?.toString() || '0');
      const current = Number(acc.currentBalance?.toString() || initial);
      const snapshot = snapshotMap.get(acc._id.toString());
      const liveBalance = snapshot
        ? {
            totalBalance: Number(snapshot.totalBalance?.toString() || 0),
            clearBalance: Number(snapshot.clearBalance?.toString() || 0),
            availableBalance: Number(snapshot.availableBalance?.toString() || 0),
            realizedPnL: Number(snapshot.realizedPnL?.toString() || 0),
            utilizedAmount: Number(snapshot.utilizedAmount?.toString() || 0),
            fetchedAt: snapshot.fetchedAt?.toISOString(),
          }
        : null;

      return {
        id: acc._id.toString(),
        userId: acc.userId.toString(),
        name: acc.name,
        broker: acc.broker,
        accountNumber: acc.accountNumber,
        accountType: acc.accountType,
        baseCurrency: acc.baseCurrency,
        initialBalance: initial,
        currentBalance: current,
        realizedPnL: pnl,
        totalDeposits: deposits,
        totalWithdrawals: withdrawals,
        totalAdjustments: adjustments,
        liveBalance,
        brokerLink: acc.brokerLink,
        status: acc.status,
        riskRules: acc.riskRules,
        propFirmConfig: acc.propFirmConfig,
        propFirm: acc.propFirm?.firmKey ? acc.propFirm : undefined,
        notes: acc.notes,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
      };
    });

    return reply.send({ success: true, data });
  });

  // Get Prop Firm Presets Registry
  app.get('/prop-presets', async (req, reply) => {
    return reply.send({ success: true, data: listPropFirmPresets() });
  });

  // Get Live USD High-Impact Economic Calendar (ForexFactory / Faireconomy API with 2h cache)
  app.get('/prop-economic-calendar', async (req, reply) => {
    const calendar = await EconomicCalendarService.getCalendarOverview(new Date());
    return reply.send({ success: true, data: calendar });
  });

  // Get Prop Firm Accounts Overview for Dashboard
  app.get('/prop-overview', async (req: any, reply) => {
    const parsedScope = AccountScopeService.parseAccountScope(req.query);
    const propScope = {
      ...parsedScope,
      mode: 'PROP_FIRM' as const,
    };
    const propAccountIds = await AccountScopeService.resolveAccountScope(req.user!.id, propScope);

    const propAccounts = await TradingAccount.find({
      _id: { $in: propAccountIds },
      userId: req.user!.id,
    }).sort({ createdAt: 1 });

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const economicCalendar = await EconomicCalendarService.getCalendarOverview(now);

    const data = await Promise.all(
      propAccounts.map(async (acc) => {
        const trades = await Trade.find({
          accountId: acc._id,
          userId: req.user!.id,
        }).select('calculated tradeDate entryDate exitDate quantity lots status risk isWeekendHold isOvernightHold exitTime entryTime');

        const initialBalNum = Number(acc.initialBalance.toString());
        let profitBeforeToday = new Decimal(0);
        for (const trade of trades) {
          if (trade.status === 'CLOSED') {
            const tDate = (trade as any).exitTime || trade.tradeDate;
            if (tDate && new Date(tDate) < startOfToday) {
              profitBeforeToday = profitBeforeToday.plus(trade.calculated?.netPnL || 0);
            }
          }
        }
        const previousDayEodBalance = new Decimal(initialBalNum).plus(profitBeforeToday).toNumber();
        const currentBalNum = Number(acc.currentBalance?.toString() || initialBalNum);

        const openTrades = trades.filter((t) => t.status === 'OPEN');
        let openUnrealizedPnL = 0;
        for (const t of openTrades) {
          if ((t as any).unrealizedPnL != null) {
            openUnrealizedPnL += Number((t as any).unrealizedPnL.toString() || 0);
          }
        }

        const health = evaluatePropFirmHealth(
          {
            id: acc._id.toString(),
            initialBalance: initialBalNum,
            currentBalance: currentBalNum,
            baseCurrency: acc.baseCurrency,
            propFirm: acc.propFirm,
            propFirmConfig: acc.propFirmConfig,
          },
          trades,
          {
            previousDayEodBalance,
            previousDayEodEquity: previousDayEodBalance,
            unrealizedPnL: openUnrealizedPnL,
          },
          undefined,
          now
        );

        if (health.status === 'FAILED' && acc.propFirm?.status !== 'FAILED') {
          if (!acc.propFirm) {
            acc.propFirm = {
              firmKey: health.firmKey || 'THE5ERS',
              planKey: health.planKey || 'SUMMER_100K',
              phase: health.phase,
            };
          }
          acc.propFirm.status = 'FAILED';
          acc.propFirm.breachedAt = health.breachedAt || now.toISOString();
          acc.propFirm.breachedRule = health.breachedRule || 'riskRule';
          acc.markModified('propFirm');
          await acc.save();
        }

        const accIdStr = acc._id.toString();
        const firmKeyVal = acc.propFirm?.firmKey || acc.propFirmConfig?.firm || health.firmKey || 'THE5ERS';
        const planKeyVal = acc.propFirm?.planKey || health.planKey || 'SUMMER_100K';
        const planNameVal = acc.propFirmConfig?.planName || health.planName || planKeyVal;

        const targetProfitPercent =
          acc.propFirmConfig?.targetProfitPercent ??
          (health.phase === 'PHASE_2' ? 5 : health.phase === 'FUNDED' ? 10 : 10);
        const dailyLossLimitPercent = acc.propFirmConfig?.dailyLossLimitPercent ?? 3;
        const maxLossLimitPercent = acc.propFirmConfig?.maxLossLimitPercent ?? 10;

        const monteCarlo = PropMonteCarloService.simulateAccount({
          initialBalance: initialBalNum,
          currentEquity: health.currentEquity || currentBalNum,
          targetProfitPercent,
          dailyLossLimitPercent,
          maxLossLimitPercent,
          trades,
        });

        return {
          // Flattened fields for UI components (PropChallengePanel, AnalyticsPage)
          id: accIdStr,
          accountId: accIdStr,
          name: acc.name,
          accountName: acc.name,
          broker: acc.broker,
          currency: acc.baseCurrency,
          baseCurrency: acc.baseCurrency,
          firmKey: firmKeyVal,
          planKey: planKeyVal,
          planName: planNameVal,
          phase: health.phase,
          status: health.status,
          overallStatus: health.threatLevel,
          statusReason: health.statusReason,
          initialBalance: initialBalNum,
          balance: currentBalNum,
          currentBalance: currentBalNum,
          targetProgressPct: health.targetProgressPercent,
          dailyLossBuffer: health.dailyBufferRemaining,
          maxLossBuffer: health.maxLossBufferRemaining,
          maxLossFloor: health.maxLossFloor,
          nextResetTime: health.rules?.dailyLoss?.resetsAt ?? health.rules?.DAILY_LOSS?.resetsAt,
          minTradingDaysRemaining:
            health.rules?.minTradingDays?.remaining ?? health.rules?.MIN_TRADING_DAYS?.remaining,
          consistencyPct:
            health.rules?.consistency?.used ?? health.rules?.CONSISTENCY_RULE?.used,
          evaluationFeePaid: Number((acc.propFirm as any)?.evaluationFeePaid ?? (planKeyVal.includes('SUMMER') ? 149 : 495)),
          profitSplitPct: Number((acc.propFirm as any)?.profitSplitPct ?? 80),
          totalPayoutsReceived: Number((acc.propFirm as any)?.totalPayoutsReceived ?? 0),
          nextPayoutDate: (acc.propFirm as any)?.nextPayoutDate ?? null,
          phaseHistory: (acc.propFirm as any)?.phaseHistory ?? [],
          economicCalendar,
          monteCarlo,
          // Structured fields for API contract & tests
          account: {
            id: accIdStr,
            name: acc.name,
            broker: acc.broker,
            baseCurrency: acc.baseCurrency,
            accountType: acc.accountType,
            initialBalance: initialBalNum,
            currentBalance: currentBalNum,
            phase: health.phase,
            status: health.status,
          },
          health,
          nearestBreach: health.nearestBreach,
        };
      })
    );

    return reply.send({ success: true, data });
  });

  // Create account
  app.post('/', async (req, reply) => {
    const parseResult = createAccountSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid account details',
          details: parseResult.error.format(),
        },
      });
    }

    const {
      name,
      broker,
      accountNumber,
      accountType,
      baseCurrency,
      initialBalance,
      riskRules,
      propFirmConfig,
      propFirm,
      notes,
    } = parseResult.data as any;

    const existing = await TradingAccount.findOne({ userId: req.user!.id, name });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE_ACCOUNT', message: 'An account with this name already exists' },
      });
    }

    const decInit = mongoose.Types.Decimal128.fromString(initialBalance.toFixed(2));

    // Normalize prop firm data between modern propFirm and legacy propFirmConfig
    let resolvedPropFirm = propFirm;
    let resolvedPropFirmConfig = propFirmConfig;

    if (resolvedPropFirm && !resolvedPropFirmConfig) {
      const preset = getPropFirmPreset(resolvedPropFirm.firmKey, resolvedPropFirm.planKey);
      resolvedPropFirmConfig = {
        enabled: true,
        firm: resolvedPropFirm.firmKey,
        planName: preset?.displayName || resolvedPropFirm.planKey,
        phase: resolvedPropFirm.phase,
        initialBalance,
        targetProfitPercent: preset?.phases.find((p) => p.phase === resolvedPropFirm.phase)?.profitTargetPct ?? 10,
        dailyLossLimitPercent: preset?.dailyLoss?.limitPct ?? 3,
        dailyLossReference:
          preset?.dailyLoss?.basis === 'START_OF_DAY_BALANCE'
            ? 'STARTING_BALANCE'
            : preset?.dailyLoss?.basis === 'START_OF_DAY_EQUITY'
            ? 'STARTING_EQUITY'
            : 'MAX_BALANCE_EQUITY_EOD',
        maxLossLimitPercent: preset?.maxLoss?.limitPct ?? 10,
        maxLossType:
          preset?.maxLoss?.type === 'TRAILING_EOD'
            ? 'TRAILING_EOD'
            : preset?.maxLoss?.type === 'TRAILING_INTRADAY'
            ? 'TRAILING_INTRADAY_HIGH'
            : 'STATIC_FROM_INITIAL',
        maxLossFloor: initialBalance * (1 - (preset?.maxLoss?.limitPct ?? 10) / 100),
        minTradingDays: preset?.phases.find((p) => p.phase === resolvedPropFirm.phase)?.minTradingDays ?? 0,
        status: resolvedPropFirm.status === 'FAILED' ? 'BREACHED' : 'ACTIVE',
      };
    } else if (resolvedPropFirmConfig && !resolvedPropFirm) {
      resolvedPropFirm = {
        firmKey: resolvedPropFirmConfig.firm,
        planKey: resolvedPropFirmConfig.planName?.includes('High Stakes') ? 'HIGH_STAKES_100K' : 'SUMMER_100K',
        phase: resolvedPropFirmConfig.phase,
        startingBalance: initialBalance,
        status: resolvedPropFirmConfig.status === 'BREACHED' ? 'FAILED' : 'ACTIVE',
      };
    }

    const account = await TradingAccount.create({
      userId: req.user!.id,
      name,
      broker,
      accountNumber,
      accountType,
      baseCurrency,
      initialBalance: decInit,
      currentBalance: decInit,
      realizedPnL: mongoose.Types.Decimal128.fromString('0.00'),
      totalDeposits: mongoose.Types.Decimal128.fromString('0.00'),
      totalWithdrawals: mongoose.Types.Decimal128.fromString('0.00'),
      status: 'ACTIVE',
      riskRules,
      propFirmConfig: resolvedPropFirmConfig,
      propFirm: resolvedPropFirm,
      notes,
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: account._id.toString(),
        name: account.name,
        broker: account.broker,
        accountType: account.accountType,
        baseCurrency: account.baseCurrency,
        initialBalance,
        currentBalance: initialBalance,
        propFirmConfig: account.propFirmConfig,
        propFirm: account.propFirm,
      },
    });
  });

  // Get account details
  app.get('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const account = await TradingAccount.findOne({
      _id: req.params.id,
      userId: req.user!.id,
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const initial = Number(account.initialBalance.toString());
    const pnl = Number(account.realizedPnL.toString());
    const deposits = Number(account.totalDeposits.toString());
    const withdrawals = Number(account.totalWithdrawals.toString());
    const adjustments = Number(account.totalAdjustments?.toString() || '0');
    const current = Number(account.currentBalance?.toString() || initial);

    // Fetch trade count for this account
    const tradeCount = await Trade.countDocuments({ accountId: account._id, userId: req.user!.id });

    return reply.send({
      success: true,
      data: {
        id: account._id.toString(),
        userId: account.userId.toString(),
        name: account.name,
        broker: account.broker,
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        baseCurrency: account.baseCurrency,
        initialBalance: initial,
        currentBalance: current,
        realizedPnL: pnl,
        totalDeposits: deposits,
        totalWithdrawals: withdrawals,
        totalAdjustments: adjustments,
        brokerLink: account.brokerLink,
        status: account.status,
        riskRules: account.riskRules,
        propFirmConfig: account.propFirmConfig,
        propFirm: account.propFirm,
        notes: account.notes,
        tradeCount,
        createdAt: account.createdAt.toISOString(),
      },
    });
  });

  // Update account
  app.put('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const parseResult = createAccountSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid update', details: parseResult.error.format() },
      });
    }

    const updateData: any = { ...parseResult.data };

    // Synchronize propFirm and propFirmConfig if either is updated
    if (updateData.propFirm && !updateData.propFirmConfig) {
      const preset = getPropFirmPreset(updateData.propFirm.firmKey, updateData.propFirm.planKey);
      updateData.propFirmConfig = {
        enabled: true,
        firm: updateData.propFirm.firmKey,
        planName: preset?.displayName || updateData.propFirm.planKey,
        phase: updateData.propFirm.phase,
        initialBalance: Number(updateData.initialBalance || 100000),
        targetProfitPercent: preset?.phases.find((p) => p.phase === updateData.propFirm.phase)?.profitTargetPct ?? 10,
        dailyLossLimitPercent: preset?.dailyLoss?.limitPct ?? 3,
        dailyLossReference: 'MAX_BALANCE_EQUITY_EOD',
        maxLossLimitPercent: preset?.maxLoss?.limitPct ?? 10,
        maxLossType: 'STATIC_FROM_INITIAL',
        maxLossFloor: 90000,
        minTradingDays: preset?.phases.find((p) => p.phase === updateData.propFirm.phase)?.minTradingDays ?? 0,
        status: updateData.propFirm.status === 'FAILED' ? 'BREACHED' : 'ACTIVE',
      };
    } else if (updateData.propFirmConfig && !updateData.propFirm) {
      updateData.propFirm = {
        firmKey: updateData.propFirmConfig.firm,
        planKey: updateData.propFirmConfig.planName?.includes('High Stakes') ? 'HIGH_STAKES_100K' : 'SUMMER_100K',
        phase: updateData.propFirmConfig.phase,
        status: updateData.propFirmConfig.status === 'BREACHED' ? 'FAILED' : 'ACTIVE',
      };
    }

    const account = await TradingAccount.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { $set: updateData },
      { new: true }
    );

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    return reply.send({ success: true, data: account });
  });

  // Get Prop Firm health & distance-to-breach summary
  app.get('/:id/prop-health', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const account = await TradingAccount.findOne({
      _id: req.params.id,
      userId: req.user!.id,
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const isPropAccount = Boolean(
      account.propFirm?.firmKey ||
      account.propFirmConfig?.enabled ||
      account.accountType === 'PROP_FIRM'
    );

    if (!isPropAccount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'NOT_A_PROP_ACCOUNT',
          message: 'This account is not configured with a Prop Firm Challenge plan',
        },
      });
    }

    // Determine today date boundary in UTC (00:00:00)
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    // Fetch trades for this account
    const trades = await Trade.find({
      accountId: account._id,
      userId: req.user!.id,
    }).select('calculated tradeDate entryDate exitDate quantity lots status risk isWeekendHold isOvernightHold exitTime entryTime').sort({ exitTime: 1 });

    const initialBalNum = Number(account.initialBalance.toString());
    let profitBeforeToday = new Decimal(0);
    for (const trade of trades) {
      if (trade.status === 'CLOSED') {
        const tDate = trade.exitTime || trade.tradeDate;
        if (tDate && new Date(tDate) < startOfToday) {
          profitBeforeToday = profitBeforeToday.plus(trade.calculated?.netPnL || 0);
        }
      }
    }
    const previousDayEodBalance = new Decimal(initialBalNum).plus(profitBeforeToday).toNumber();
    const previousDayEodEquity = previousDayEodBalance;

    // Check open trades for floating unrealized P&L
    let openUnrealizedPnL = 0;
    for (const t of trades) {
      if (t.status === 'OPEN' && (t as any).unrealizedPnL != null) {
        openUnrealizedPnL += Number((t as any).unrealizedPnL.toString() || 0);
      }
    }

    const currentBalanceNum = Number(account.currentBalance?.toString() || initialBalNum);

    const health = evaluatePropFirmHealth(
      {
        id: account._id.toString(),
        initialBalance: initialBalNum,
        currentBalance: currentBalanceNum,
        baseCurrency: account.baseCurrency,
        propFirm: account.propFirm,
        propFirmConfig: account.propFirmConfig,
      },
      trades,
      {
        previousDayEodBalance,
        previousDayEodEquity,
        unrealizedPnL: openUnrealizedPnL,
      },
      undefined,
      now
    );

    // If sticky breach detected, update account
    if (health.status === 'FAILED' && account.propFirm?.status !== 'FAILED') {
      if (!account.propFirm) {
        account.propFirm = {
          firmKey: health.firmKey || 'THE5ERS',
          planKey: health.planKey || 'SUMMER_100K',
          phase: health.phase,
        };
      }
      account.propFirm.status = 'FAILED';
      account.propFirm.breachedAt = health.breachedAt || now.toISOString();
      account.propFirm.breachedRule = health.breachedRule || 'riskRule';
      account.markModified('propFirm');
      await account.save();
    }

    return reply.send({
      success: true,
      data: health,
    });
  });

  // Advance Phase (Phase 1 -> Phase 2 -> Funded)
  app.post('/:id/prop-advance-phase', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const account = await TradingAccount.findOne({
      _id: req.params.id,
      userId: req.user!.id,
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const isPropAccount = Boolean(
      account.propFirm?.firmKey ||
      account.propFirmConfig?.enabled ||
      account.accountType === 'PROP_FIRM'
    );

    if (!isPropAccount) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NOT_A_PROP_ACCOUNT', message: 'This account is not a Prop Firm Challenge account' },
      });
    }

    const initialBalNum = Number(account.initialBalance.toString());
    const currentBalNum = Number(account.currentBalance?.toString() || initialBalNum);

    const trades = await Trade.find({
      accountId: account._id,
      userId: req.user!.id,
    }).select('calculated tradeDate entryDate exitDate quantity lots status risk isWeekendHold isOvernightHold');

    const health = evaluatePropFirmHealth(
      {
        id: account._id.toString(),
        initialBalance: initialBalNum,
        currentBalance: currentBalNum,
        baseCurrency: account.baseCurrency,
        propFirm: account.propFirm,
        propFirmConfig: account.propFirmConfig,
      },
      trades,
      {
        unrealizedPnL: 0,
      }
    );

    if (!health.canAdvancePhase) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'PHASE_CRITERIA_NOT_MET',
          message: 'Cannot advance phase: profit target has not been reached or risk rules were breached.',
        },
      });
    }

    const currentPhase = account.propFirm?.phase || account.propFirmConfig?.phase || 'PHASE_1';
    const nowIso = new Date().toISOString();

    if (!account.propFirmConfig) {
      account.propFirmConfig = {
        enabled: true,
        firm: 'the5ers',
        planName: 'Summer Plan 10/5 ($149)',
        phase: (String(currentPhase) as any) || 'PHASE_1',
        initialBalance: initialBalNum,
        targetProfitPercent: 10,
        dailyLossLimitPercent: 5,
        dailyLossReference: 'STARTING_BALANCE',
        maxLossLimitPercent: 10,
        maxLossType: 'STATIC',
        minTradingDays: 3,
        newsTradingAllowed: true,
        weekendHoldingAllowed: true,
        currentPhaseStartedAt: nowIso,
        status: 'ACTIVE',
      };
    }
    if (!account.propFirm) {
      account.propFirm = {
        firmKey: account.propFirmConfig?.firm || 'the5ers',
        planKey: 'summer-plan',
        phase: currentPhase,
      };
    }

    const cfg = account.propFirmConfig;
    const pf = account.propFirm;

    if (String(currentPhase) === 'PHASE_1' || String(currentPhase) === '1') {
      if (cfg) {
        cfg.phase = 'PHASE_2';
        cfg.targetProfitPercent = 5;
        cfg.currentPhaseStartedAt = nowIso;
      }

      pf.phase = 'PHASE_2';
      pf.phaseStartedAt = nowIso;
    } else if (String(currentPhase) === 'PHASE_2' || String(currentPhase) === '2') {
      if (cfg) {
        cfg.phase = 'FUNDED';
        cfg.targetProfitPercent = 0;
        cfg.status = 'PASSED';
        cfg.currentPhaseStartedAt = nowIso;
      }

      pf.phase = 'FUNDED';
      pf.status = 'PASSED';
      pf.phaseStartedAt = nowIso;
    }

    account.markModified('propFirmConfig');
    account.markModified('propFirm');
    await account.save();

    const updatedHealth = evaluatePropFirmHealth(
      {
        id: account._id.toString(),
        initialBalance: initialBalNum,
        currentBalance: currentBalNum,
        baseCurrency: account.baseCurrency,
        propFirm: account.propFirm,
        propFirmConfig: account.propFirmConfig,
      },
      trades,
      {
        unrealizedPnL: 0,
      }
    );

    return reply.send({
      success: true,
      data: updatedHealth,
      message:
        cfg?.phase === 'FUNDED' || pf.phase === 'FUNDED'
          ? 'Congratulations! You have passed the Challenge and claimed your Funded Account!'
          : 'Successfully advanced to Phase 2!',
    });
  });

  // Delete account (or archive)
  app.delete('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const tradeCount = await Trade.countDocuments({ accountId: req.params.id, userId: req.user!.id });
    if (tradeCount > 0) {
      // Archive instead of hard delete to preserve historical integrity
      await TradingAccount.findOneAndUpdate(
        { _id: req.params.id, userId: req.user!.id },
        { $set: { status: 'ARCHIVED' } }
      );
      return reply.send({
        success: true,
        message: 'Account has existing trades; marked as ARCHIVED to preserve trading history',
      });
    }

    await TradingAccount.deleteOne({ _id: req.params.id, userId: req.user!.id });
    return reply.send({ success: true, message: 'Account deleted successfully' });
  });

  // Add transaction (deposit/withdrawal/adjustment)
  app.post('/:id/transactions', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const parseResult = accountTransactionSchema.safeParse({ ...req.body, accountId: req.params.id });
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid transaction', details: parseResult.error.format() },
      });
    }

    const { type, amount, currency, date, notes } = parseResult.data;

    const account = await TradingAccount.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const decAmount = mongoose.Types.Decimal128.fromString(amount.toFixed(2));

    const tx = await AccountTransaction.create({
      userId: req.user!.id,
      accountId: account._id,
      type,
      amount: decAmount,
      currency,
      date: new Date(date),
      notes,
    });

    // Authoritatively recalculate account balances
    const updatedSummary = await AccountService.recalculateAccountBalances(account._id, req.user!.id);

    return reply.status(201).send({ success: true, data: tx, balanceSummary: updatedSummary });
  });

  // Get transactions for account
  app.get('/:id/transactions', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const txs = await AccountTransaction.find({
      userId: req.user!.id,
      accountId: req.params.id,
    }).sort({ date: -1 });

    const data = txs.map((t) => ({
      id: t._id.toString(),
      type: t.type,
      amount: Number(t.amount.toString()),
      currency: t.currency,
      date: t.date.toISOString(),
      notes: t.notes,
      source: t.source || 'MANUAL',
      status: t.status || 'CONFIRMED',
      idempotencyKey: t.idempotencyKey,
      importBatchId: t.importBatchId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt?.toISOString(),
    }));

    return reply.send({ success: true, data });
  });

  // Link a SetupMint account to a connected FYERS client
  app.post('/:id/broker-link', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.trim() : '';
    if (!clientId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CLIENT_ID_REQUIRED', message: 'FYERS clientId is required' },
      });
    }

    const account = await TradingAccount.findOne({
      _id: req.params.id,
      userId: req.user!.id,
    });
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    if (String(account.broker || '').toUpperCase() !== 'FYERS') {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'ACCOUNT_NOT_FYERS',
          message: 'Only FYERS trading accounts can be linked to a FYERS client',
        },
      });
    }

    const integration = await BrokerIntegration.findOne({
      userId: req.user!.id,
      broker: 'FYERS',
    });
    if (!integration || !hasValidFyersToken(integration)) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'BROKER_NOT_CONNECTED',
          message: 'Connect FYERS before linking a trading account',
        },
      });
    }

    if (integration.appId && integration.clientId && integration.clientId !== clientId) {
      let matchesProfile = false;
      try {
        const accessToken = decryptSecret(integration.accessToken) as string;
        const profile = await FyersService.fetchProfile(integration.appId, accessToken);
        if (
          profile?.fy_id &&
          (profile.fy_id === clientId ||
            profile.fy_id.toUpperCase() === clientId.toUpperCase())
        ) {
          matchesProfile = true;
          integration.clientId = profile.fy_id;
          await integration.save();
        }
      } catch {
        // Ignored
      }

      if (!matchesProfile) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'CLIENT_ID_MISMATCH',
            message: `Connected FYERS client is ${integration.clientId}, not ${clientId}`,
          },
        });
      }
    }

    const alreadyLinked = await TradingAccount.findOne({
      userId: req.user!.id,
      'brokerLink.clientId': clientId,
      _id: { $ne: account._id },
    });
    if (alreadyLinked) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'CLIENT_ALREADY_LINKED',
          message: 'This FYERS client is already linked to another account',
        },
      });
    }

    account.brokerLink = {
      broker: 'FYERS',
      clientId,
      linkedAt: new Date(),
    };
    await account.save();

    integration.clientId = integration.clientId || clientId;
    integration.linkedAccountId = account._id;
    await integration.save();

    return reply.send({
      success: true,
      data: {
        id: account._id.toString(),
        brokerLink: account.brokerLink,
      },
    });
  });

  // Remove the broker link from an account
  app.delete('/:id/broker-link', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const account = await TradingAccount.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { $unset: { brokerLink: 1 } },
      { new: true }
    );
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    await BrokerIntegration.updateOne(
      { userId: req.user!.id, broker: 'FYERS', linkedAccountId: account._id },
      { $unset: { linkedAccountId: 1 } }
    );

    return reply.send({ success: true, message: 'FYERS account link removed' });
  });

  // Fetch FYERS funds, persist a snapshot, and create a pending reconciliation adjustment
  app.post('/:id/sync-funds', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    if (!config.fyersFundsSyncEnabled) {
      return reply.status(503).send({
        success: false,
        error: { code: 'FUNDS_SYNC_DISABLED', message: 'FYERS funds sync is disabled' },
      });
    }

    try {
      const result = await FyersService.syncFundsForAccount(req.params.id, req.user!.id);

      return reply.send({
        success: true,
        data: {
          snapshot: serializeFundsSnapshot(result.snapshot),
          currentBalance: result.currentBalance,
          brokerBalance: result.brokerBalance,
          drift: result.drift,
          tolerance: result.tolerance,
          suggestionCreated: result.suggestionCreated,
          skipReason: result.skipReason,
          pendingTransaction: result.pendingTransaction
            ? serializePendingTransaction(result.pendingTransaction)
            : null,
        },
      });
    } catch (err: any) {
      const isNotFound = err.message === 'Account not found';
      return reply.status(isNotFound ? 404 : 502).send({
        success: false,
        error: {
          code: isNotFound ? 'ACCOUNT_NOT_FOUND' : 'FUNDS_SYNC_FAILED',
          message: err.message || 'Failed to fetch FYERS funds',
        },
      });
    }
  });

  // List pending broker reconciliation adjustments
  app.get(
    '/:id/pending-transactions',
    { preHandler: [validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const account = await TradingAccount.findOne({
        _id: req.params.id,
        userId: req.user!.id,
      });
      if (!account) {
        return reply.status(404).send({
          success: false,
          error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
        });
      }

      const [transactions, latestSnapshot] = await Promise.all([
        AccountTransaction.find({
          userId: req.user!.id,
          accountId: account._id,
          status: 'PENDING_REVIEW',
        }).sort({ date: -1 }),
        BrokerFundsSnapshot.findOne({
          userId: req.user!.id,
          accountId: account._id,
        }).sort({ fetchedAt: -1 }),
      ]);

      return reply.send({
        success: true,
        data: {
          transactions: transactions.map(serializePendingTransaction),
          latestSnapshot: latestSnapshot
            ? serializeFundsSnapshot(latestSnapshot)
            : null,
        },
      });
    }
  );

  // Confirm a pending reconciliation adjustment and recalculate balances
  app.post(
    '/:id/transactions/:txId/confirm',
    { preHandler: [validateObjectIdParam('id'), validateObjectIdParam('txId')] },
    async (req: any, reply) => {
      const tx = await AccountTransaction.findOne({
        _id: req.params.txId,
        accountId: req.params.id,
        userId: req.user!.id,
        status: 'PENDING_REVIEW',
      });
      if (!tx) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PENDING_TRANSACTION_NOT_FOUND',
            message: 'Pending transaction not found',
          },
        });
      }

      tx.status = 'CONFIRMED';
      await tx.save();

      const balanceSummary = await AccountService.recalculateAccountBalances(
        tx.accountId,
        req.user!.id
      );

      return reply.send({
        success: true,
        data: {
          transaction: serializePendingTransaction(tx),
          balanceSummary,
        },
      });
    }
  );

  // Reject a pending reconciliation adjustment without changing balances
  app.post(
    '/:id/transactions/:txId/reject',
    { preHandler: [validateObjectIdParam('id'), validateObjectIdParam('txId')] },
    async (req: any, reply) => {
      const tx = await AccountTransaction.findOne({
        _id: req.params.txId,
        accountId: req.params.id,
        userId: req.user!.id,
        status: 'PENDING_REVIEW',
      });
      if (!tx) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PENDING_TRANSACTION_NOT_FOUND',
            message: 'Pending transaction not found',
          },
        });
      }

      tx.status = 'REJECTED';
      await tx.save();

      return reply.send({
        success: true,
        data: { transaction: serializePendingTransaction(tx) },
      });
    }
  );

  // Reconcile and recalculate account balance authoritatively from raw records
  app.post('/:id/reconcile', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const summary = await AccountService.recalculateAccountBalances(req.params.id, req.user!.id);
    if (!summary) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    return reply.send({ success: true, message: 'Account balance successfully reconciled', data: summary });
  });

  // 1-Click The5ers Hub & TradingView Trade Importer (with automatic SL & 1:2 RR calculation)
  app.post('/:id/prop-import-trades', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const account = await TradingAccount.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const rawText = String(req.body?.rawText || '').trim();
    const rrRatio = Number(req.body?.defaultRiskReward || 2) || 2;
    if (!rawText) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPTY_INPUT', message: 'Paste rows from The5ers Trader Zone or TradingView CSV' },
      });
    }

    const parseThe5ersDate = (s: string): Date | null => {
      const clean = String(s || '').trim();
      if (!clean || clean === '-') return null;
      // Match DD.MM.YY HH:mm or DD/MM/YY HH:mm
      const m = clean.match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})\s+(\d{1,2}):(\d{2})/);
      if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]) - 1;
        const yrRaw = Number(m[3]);
        const year = yrRaw < 100 ? 2000 + yrRaw : yrRaw;
        const hr = Number(m[4]);
        const min = Number(m[5]);
        return new Date(Date.UTC(year, month, day, hr, min, 0));
      }
      const d = new Date(clean);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const parseMoney = (val: string): number => {
      if (!val || val === '-') return 0;
      const cleaned = val.replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return Number.isFinite(num) ? num : 0;
    };

    const getContractSpec = (sym: string) => {
      const upper = sym.toUpperCase();
      if (upper === 'XAUUSD' || upper === 'GOLD') {
        return {
          multiplier: 100,
          lotSize: 0.01,
          displayName: 'Gold / US Dollar Spot (CFD/Forex)',
          assetClass: 'FOREX' as const,
          exchange: 'FOREX' as const,
          marketSegment: 'FOREX' as const,
        };
      }
      if (upper === 'XAGUSD' || upper === 'SILVER') {
        return {
          multiplier: 5000,
          lotSize: 0.01,
          displayName: 'Silver / US Dollar Spot (CFD/Forex)',
          assetClass: 'FOREX' as const,
          exchange: 'FOREX' as const,
          marketSegment: 'FOREX' as const,
        };
      }
      if (upper.endsWith('USDT') || upper === 'ETHUSD' || upper === 'BTCUSD' || upper === 'SOLUSD') {
        return {
          multiplier: 1,
          lotSize: 1,
          displayName: upper === 'ETHUSD' ? 'Ethereum / US Dollar' : `${upper} Crypto CFD`,
          assetClass: 'CRYPTO' as const,
          exchange: 'CRYPTO' as const,
          marketSegment: 'CRYPTO' as const,
        };
      }
      if (['NAS100', 'USTEC', 'US30', 'SPX500', 'US500', 'GER40'].includes(upper)) {
        return {
          multiplier: 1,
          lotSize: 0.1,
          displayName: `${upper} Index CFD`,
          assetClass: 'FUTURES' as const,
          exchange: 'FOREX' as const,
          marketSegment: 'FOREX' as const,
        };
      }
      return {
        multiplier: 100000,
        lotSize: 0.01,
        displayName: `${upper} Forex Pair`,
        assetClass: 'FOREX' as const,
        exchange: 'FOREX' as const,
        marketSegment: 'FOREX' as const,
      };
    };

    // Normalize multi-line vertical pastes (where each cell from The5ers Hub is on its own line)
    // into single-line trade records starting with a 6+ digit Ticket ID.
    const rawLines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !/^ID\s+Symbol/i.test(l) &&
          !/^(ID|Ticket|Symbol|Side|Type|Open Date|Close Date|Open Price|Close Price|Entry|Exit|Lots|Volume|Commission|Fee|Swap|Profit|Net P&L|PnL|Status)$/i.test(
            l
          )
      );

    const lines: string[] = [];
    for (const l of rawLines) {
      if (/^\d{6,}(?:-\d+)?(?:\s|$)/.test(l)) {
        lines.push(l);
      } else if (lines.length > 0) {
        lines[lines.length - 1] = `${lines[lines.length - 1]} ${l}`;
      }
    }

    let insertedCount = 0;
    let updatedCount = 0;
    const importedTrades: any[] = [];

    for (const line of lines) {
      // Closed trade row (has both Open Date and Close Date):
      // e.g. 560643070803 XAUUSD Buy 04.11.26 13:25 04.11.26 13:36 $4,021.78 $4,035.26 0.5 -$4.03 $0 +$669.97 Win
      const closedRowRegex =
        /^(\d{6,}(?:-\d+)?)\s+([A-Za-z0-9:._/-]+)\s+(Buy|Sell|LONG|SHORT)\s+(\d{2}[./-]\d{2}[./-]\d{2,4}\s+\d{1,2}:\d{2})\s+(\d{2}[./-]\d{2}[./-]\d{2,4}\s+\d{1,2}:\d{2})\s+(\$?[0-9,]+(?:\.[0-9]+)?)\s+(\$?[0-9,]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)\s+([+-]?\$?[0-9,]+(?:\.[0-9]+)?|-)\s+([+-]?\$?[0-9,]+(?:\.[0-9]+)?|-)(?:\s+([+-]?\$?[0-9,]+(?:\.[0-9]+)?|-))?/i;

      // Open trade row (has only Open Date, optional '-' for Close Date/Price):
      // e.g. 560643070840785 XAUUSD Sell 04.11.26 14:58 $4,047.16 0.5 -$2.02 $0
      const openRowRegex =
        /^(\d{6,}(?:-\d+)?)\s+([A-Za-z0-9:._/-]+)\s+(Buy|Sell|LONG|SHORT)\s+(\d{2}[./-]\d{2}[./-]\d{2,4}\s+\d{1,2}:\d{2})(?:\s+-)?\s+(\$?[0-9,]+(?:\.[0-9]+)?)(?:\s+-)?\s+([0-9]+(?:\.[0-9]+)?)(?:\s+([+-]?\$?[0-9,]+(?:\.[0-9]+)?|-))?(?:\s+([+-]?\$?[0-9,]+(?:\.[0-9]+)?|-))?(?:\s+([+-]?\$?[0-9,]+(?:\.[0-9]+)?|-))?/i;

      const closedMatch = line.match(closedRowRegex);
      const openMatch = !closedMatch ? line.match(openRowRegex) : null;
      if (!closedMatch && !openMatch) continue;

      const rawTicket = (closedMatch ? closedMatch[1] : openMatch![1]).trim();
      const rawSymbol = (closedMatch ? closedMatch[2] : openMatch![2]).includes(':')
        ? (closedMatch ? closedMatch[2] : openMatch![2]).split(':').pop()!
        : closedMatch
          ? closedMatch[2]
          : openMatch![2];
      const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sideRaw = (closedMatch ? closedMatch[3] : openMatch![3]).toUpperCase();
      const direction: 'LONG' | 'SHORT' = sideRaw === 'BUY' || sideRaw === 'LONG' ? 'LONG' : 'SHORT';
      const entryDate = parseThe5ersDate(closedMatch ? closedMatch[4] : openMatch![4]) || new Date();
      const exitDate = closedMatch ? parseThe5ersDate(closedMatch[5]) : null;
      const entryPrice = parseMoney(closedMatch ? closedMatch[6] : openMatch![5]);
      const exitPrice = closedMatch ? parseMoney(closedMatch[7]) : 0;
      const qty = parseFloat(closedMatch ? closedMatch[8] : openMatch![6]) || 0.1;
      const feeAbs = Math.abs(parseMoney(closedMatch ? closedMatch[9] : openMatch![7] || '0'));
      const swapFee = Math.abs(parseMoney(closedMatch ? closedMatch[10] : openMatch![8] || '0'));
      const rawNetPnlToken = closedMatch ? closedMatch[11] : openMatch![9];
      const isClosed = Boolean(closedMatch && exitDate && exitPrice > 0);
      const spec = getContractSpec(symbol);

      // Ensure instrument exists for user
      let instrument = await Instrument.findOne({ userId: req.user!.id, symbol });
      if (!instrument) {
        instrument = await Instrument.create({
          userId: req.user!.id,
          symbol,
          displayName: spec.displayName,
          assetClass: spec.assetClass,
          exchange: spec.exchange,
          marketSegment: spec.marketSegment,
          quoteCurrency: account.baseCurrency || 'USD',
          contractMultiplier: spec.multiplier,
          lotSize: spec.lotSize,
          tickSize: 0.01,
          quantityIncrement: spec.lotSize,
          pricePrecision: 2,
          isActive: true,
          source: 'AUTO',
        });
      }

      const priceDiff = isClosed
        ? direction === 'LONG'
          ? exitPrice - entryPrice
          : entryPrice - exitPrice
        : 0;
      const grossPnL = isClosed ? Number((priceDiff * qty * spec.multiplier).toFixed(2)) : 0;
      const totalCosts = Number((feeAbs + swapFee).toFixed(2));
      const parsedNetPnl =
        rawNetPnlToken !== undefined && rawNetPnlToken !== '-'
          ? parseMoney(rawNetPnlToken)
          : Number((grossPnL - totalCosts).toFixed(2));
      const netPnL = isClosed ? parsedNetPnl : Number((-totalCosts).toFixed(2));

      // Compute Stop Loss & 1:2 RR Target
      let initialStopLoss: number;
      let plannedTarget: number;
      let realizedRMultiple = 0;

      if (!isClosed) {
        const defaultRiskPts = Number((entryPrice * 0.001).toFixed(2));
        initialStopLoss = Number(
          (direction === 'LONG' ? entryPrice - defaultRiskPts : entryPrice + defaultRiskPts).toFixed(2)
        );
        plannedTarget = Number(
          (direction === 'LONG'
            ? entryPrice + defaultRiskPts * rrRatio
            : entryPrice - defaultRiskPts * rrRatio).toFixed(2)
        );
      } else if (netPnL <= 0) {
        // Loss trade: exit price was the Stop Loss hit; Target at 1:rrRatio
        initialStopLoss = exitPrice;
        const slDist = Math.max(0.01, Math.abs(exitPrice - entryPrice));
        plannedTarget = Number(
          (direction === 'LONG' ? entryPrice + slDist * rrRatio : entryPrice - slDist * rrRatio).toFixed(2)
        );
      } else {
        // Winning trade: 1:rrRatio RR -> SL distance = reward distance / rrRatio
        plannedTarget = exitPrice;
        const rewardDist = Math.max(0.02, Math.abs(exitPrice - entryPrice));
        const slDist = rewardDist / rrRatio;
        initialStopLoss = Number(
          (direction === 'LONG' ? entryPrice - slDist : entryPrice + slDist).toFixed(2)
        );
      }

      const slDistance = Math.abs(entryPrice - initialStopLoss);
      const plannedRiskAmount = Number(Math.max(1, slDistance * qty * spec.multiplier).toFixed(2));
      if (isClosed) {
        realizedRMultiple = Number((netPnL / plannedRiskAmount).toFixed(2));
      }

      const normalizedBaseTicket =
        rawTicket.length === 15 && !rawTicket.includes('-') ? rawTicket.slice(0, 12) : rawTicket;
      const ticketCandidates = Array.from(new Set([rawTicket, normalizedBaseTicket]));

      // Match by externalBrokerOrderRef or matching OPEN trade at same entryPrice & qty
      const existing = await Trade.findOne({
        userId: req.user!.id,
        accountId: account._id,
        $or: [
          { externalBrokerOrderRef: { $in: ticketCandidates } },
          {
            status: 'OPEN',
            symbol,
            direction,
            'simpleExecution.entryPrice': entryPrice,
            'simpleExecution.quantity': qty,
          },
        ],
      });

      const canonicalTicket = existing?.externalBrokerOrderRef || normalizedBaseTicket;

      const tradeDateDay = new Date(
        Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate(), 0, 0, 0)
      );
      const holdingTimeMinutes =
        isClosed && exitDate
          ? Math.max(1, Math.round((exitDate.getTime() - entryDate.getTime()) / 60000))
          : undefined;
      const outcome = !isClosed ? 'OPEN' : netPnL > 0 ? 'WIN' : netPnL < 0 ? 'LOSS' : 'BREAKEVEN';

      const tradePayload: any = {
        userId: req.user!.id,
        accountId: account._id,
        instrumentId: instrument._id,
        symbol,
        underlying: symbol,
        instrumentName: instrument.displayName,
        assetClass: spec.assetClass,
        exchange: spec.exchange,
        marketSegment: spec.marketSegment,
        currency: account.baseCurrency || 'USD',
        direction,
        status: isClosed ? 'CLOSED' : 'OPEN',
        tradeDate: tradeDateDay,
        timeZone: 'Asia/Kolkata',
        entryTime: entryDate,
        exitTime: isClosed && exitDate ? exitDate : undefined,
        session: 'LONDON',
        tradeTitle: `${symbol === 'XAUUSD' ? 'Gold' : symbol} ${direction === 'LONG' ? 'Long' : 'Short'} ${qty.toFixed(2)} Lots`,
        externalBrokerOrderRef: canonicalTicket,
        tags: ['THE5ERS', 'PROP_FIRM', 'TRADINGVIEW', symbol],
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice,
          exitPrice: isClosed ? exitPrice : undefined,
          quantity: qty,
          contractMultiplier: spec.multiplier,
          brokerage: feeAbs,
          exchangeFees: 0,
          regulatoryFees: 0,
          taxes: swapFee,
          otherFees: 0,
          explicitAdjustments: 0,
        },
        risk: {
          plannedEntryPrice: entryPrice,
          initialStopLoss,
          currentStopLoss: initialStopLoss,
          initialStopSource: 'MANUAL',
          plannedTarget,
          riskBudgetAmount: plannedRiskAmount,
          plannedRiskAmount,
          actualQuantity: qty,
          estimatedRiskAmount: plannedRiskAmount,
          plannedRewardRiskRatio: rrRatio,
          realizedRMultiple: isClosed ? realizedRMultiple : undefined,
          riskRuleViolations: [],
        },
        calculated: {
          grossPnL,
          totalCosts,
          netPnL,
          realizedRMultiple: isClosed ? realizedRMultiple : undefined,
          holdingTimeMinutes,
          outcome,
          closedQuantity: isClosed ? qty : 0,
          openQuantity: isClosed ? 0 : qty,
          averageEntryPrice: entryPrice,
          averageExitPrice: isClosed ? exitPrice : undefined,
        },
      };

      if (existing) {
        await Trade.updateOne({ _id: existing._id }, { $set: tradePayload });
        updatedCount++;
      } else {
        await Trade.create({
          ...tradePayload,
          fills: [],
          thesis: { confluences: [], customTechnicalLabels: [] },
          psychology: {
            disciplineScore: 5,
            checklistCompleted: true,
            rulesFollowed: true,
            mistakes: [],
            revengeTrading: false,
            overtrading: false,
            prematureExit: false,
            stopLossMoved: false,
            positionSizeViolation: false,
          },
          screenshotIds: [],
          auditLog: [
            {
              action: 'CREATED_PROP_FIRM_SYNC',
              timestamp: new Date(),
              changedBy: req.user!.email || 'user',
              details: { ticket: canonicalTicket, source: 'The5ers / TradingView Sync' },
            },
          ],
        });
        insertedCount++;
      }

      importedTrades.push({
        brokerTradeId: canonicalTicket,
        symbol,
        direction,
        status: isClosed ? 'CLOSED' : 'OPEN',
        entryPrice,
        exitPrice: isClosed ? exitPrice : null,
        initialStopLoss,
        plannedTarget,
        netPnL,
      });
    }

    if (importedTrades.length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'NO_VALID_ROWS',
          message:
            'Could not parse any valid trade rows. Expected format: ID Symbol Side OpenDate CloseDate EntryPrice ExitPrice Lots Fee Swap NetPnL',
        },
      });
    }

    const balanceSummary = await AccountService.recalculateAccountBalances(account._id, req.user!.id);

    return reply.send({
      success: true,
      data: {
        insertedCount,
        updatedCount,
        totalProcessed: insertedCount + updatedCount,
        trades: importedTrades,
        balanceSummary,
      },
    });
  });

  // Update Prop Firm Business Ledger (Fee Paid, Profit Split %, Total Payouts Received, Optional Phase Override)
  app.patch('/:id/prop-ledger', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const account = await TradingAccount.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const evaluationFeePaid =
      req.body?.evaluationFeePaid !== undefined
        ? Number(req.body.evaluationFeePaid)
        : Number((account.propFirm as any)?.evaluationFeePaid ?? 149);
    const profitSplitPct =
      req.body?.profitSplitPct !== undefined
        ? Number(req.body.profitSplitPct)
        : Number((account.propFirm as any)?.profitSplitPct ?? 80);
    const totalPayoutsReceived =
      req.body?.totalPayoutsReceived !== undefined
        ? Number(req.body.totalPayoutsReceived)
        : Number((account.propFirm as any)?.totalPayoutsReceived ?? 0);
    const nextPayoutDate =
      req.body?.nextPayoutDate !== undefined
        ? req.body.nextPayoutDate
        : (account.propFirm as any)?.nextPayoutDate ?? null;
    const requestedPhase = req.body?.phase as 'PHASE_1' | 'PHASE_2' | 'FUNDED' | undefined;

    account.propFirm = {
      ...(account.propFirm || { firmKey: 'THE5ERS', planKey: 'SUMMER_100K', phase: 'PHASE_1' }),
      ...(requestedPhase ? { phase: requestedPhase } : {}),
      evaluationFeePaid,
      profitSplitPct,
      totalPayoutsReceived,
      nextPayoutDate,
    } as any;

    if (requestedPhase && account.propFirmConfig) {
      account.propFirmConfig.phase = requestedPhase;
      account.propFirmConfig.targetProfitPercent =
        requestedPhase === 'PHASE_1' ? 10 : requestedPhase === 'PHASE_2' ? 5 : 0;
      account.markModified('propFirmConfig');
    }

    account.markModified('propFirm');
    await account.save();

    return reply.send({
      success: true,
      data: {
        id: account._id.toString(),
        phase: account.propFirm?.phase,
        evaluationFeePaid,
        profitSplitPct,
        totalPayoutsReceived,
        nextPayoutDate,
        netCareerRoi: Number((totalPayoutsReceived - evaluationFeePaid).toFixed(2)),
      },
    });
  });
};
