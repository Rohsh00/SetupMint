import crypto from 'crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { accountTransactionSchema, createAccountSchema } from '@tradevault/shared';
import {
  AccountTransaction,
  BrokerFundsSnapshot,
  BrokerIntegration,
  Trade,
  TradingAccount,
} from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
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
        notes: acc.notes,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
      };
    });

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

    const { name, broker, accountNumber, accountType, baseCurrency, initialBalance, riskRules, notes } =
      parseResult.data;

    const existing = await TradingAccount.findOne({ userId: req.user!.id, name });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE_ACCOUNT', message: 'An account with this name already exists' },
      });
    }

    const decInit = mongoose.Types.Decimal128.fromString(initialBalance.toFixed(2));

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

    const account = await TradingAccount.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { $set: parseResult.data },
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
};
