import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import { accountTransactionSchema, createAccountSchema } from '@tradevault/shared';
import { AccountTransaction, Trade, TradingAccount } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../services/account.service.js';
import { validateObjectIdParam } from '../middleware/validate.js';

export const accountRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // List user accounts
  app.get('/', async (req, reply) => {
    const accounts = await TradingAccount.find({ userId: req.user!.id }).sort({ createdAt: 1 });

    const data = accounts.map((acc) => {
      const initial = Number(acc.initialBalance.toString());
      const pnl = Number(acc.realizedPnL.toString());
      const deposits = Number(acc.totalDeposits.toString());
      const withdrawals = Number(acc.totalWithdrawals.toString());
      const current = initial + pnl + deposits - withdrawals;

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
    const current = Number(account.currentBalance?.toString() || (initial + pnl + deposits - withdrawals).toFixed(2));

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
      createdAt: t.createdAt.toISOString(),
    }));

    return reply.send({ success: true, data });
  });

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
