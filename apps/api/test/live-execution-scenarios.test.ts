import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { TradingAccount, Trade, User, Mt5Command } from '../src/db/models/index.js';
import { LiveExecutionWorker } from '../src/services/live-execution-worker.service.js';
import { Mt5CommandService } from '../src/services/mt5-command.service.js';
import { ExecutionPipelineService } from '../src/services/execution-pipeline.service.js';
import { calculateTargetLadder } from '@tradevault/financial-engine';

describe('Live Auto-Execution Scenarios & Target Re-conquer Invariants', { timeout: 25000 }, () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let userBId: string;
  const createdTradeIds: mongoose.Types.ObjectId[] = [];

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register ephemeral User A
    const testEmailA = `exec_scenario_a_${Date.now()}@test.local`;
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmailA,
        password: 'Password@123',
        name: 'Auto-Exec Tester A',
        baseCurrency: 'USD',
      },
    });
    expect(regResA.statusCode).toBe(201);
    const bodyA = JSON.parse(regResA.body);
    userId = bodyA.data.user.id;
    authCookie = regResA.cookies.find((c) => c.name === 'tv_session')?.value || '';

    // Arm User A for server-side live auto-execution
    await User.findByIdAndUpdate(userId, {
      $set: {
        'liveWatcherSettings.serverSideExecutionEnabled': true,
        'liveWatcherSettings.defaultAutoExecute': true,
      },
    });

    // Create Elefin MT5 trading account for User A
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Elefin Test Execution Live',
      broker: 'Elefin',
      accountType: 'FOREX',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('500.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('500.00'),
      status: 'ACTIVE',
      profile: {
        executionAdapterKey: 'ELEFIN_MT5',
        positionModel: 'HEDGING',
      },
    });
    accountId = acc._id.toString();

    // Register ephemeral User B (for tenant isolation check)
    const testEmailB = `exec_scenario_b_${Date.now()}@test.local`;
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmailB,
        password: 'Password@123',
        name: 'Auto-Exec Tester B',
        baseCurrency: 'USD',
      },
    });
    expect(regResB.statusCode).toBe(201);
    const bodyB = JSON.parse(regResB.body);
    userBId = bodyB.data.user.id;
    userBAuthCookie = regResB.cookies.find((c) => c.name === 'tv_session')?.value || '';
  }, 40000);

  afterAll(async () => {
    // Strictly isolate cleanup to only our ephemeral test users
    if (userId) {
      await Mt5Command.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await User.deleteMany({ _id: new mongoose.Types.ObjectId(userId) });
    }
    if (userBId) {
      await Mt5Command.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await User.deleteMany({ _id: new mongoose.Types.ObjectId(userBId) });
    }
    if (app) await app.close();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    LiveExecutionWorker.resetMilestones();
    if (userId) {
      await Mt5Command.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
  });

  it('Scenario 1: Server Restart & Target Re-conquer Invariant (The exact production bug)', async () => {
    // Recreate the exact trade from production:
    // XAUUSD SHORT, entry: 3571.73, initial SL: 3574.40, initial qty: 0.04 lots
    // Risk = 2.67 pts. T1 (+1.0R) = 3569.06, T2 (+2.0R) = 3566.39
    const ticket = 9917477901;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      direction: 'SHORT',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 3571.73,
        quantity: 0.04,
      },
      risk: {
        plannedEntryPrice: 3571.73,
        initialStopLoss: 3574.40,
        currentStopLoss: 3574.40,
      },
      tags: [`MT5_TICKET_${ticket}`, 'ELEFIN'],
      customLadderRules: {
        targetMode: 'CLASSIC_THREE',
        autoExecuteEnabled: true,
        t1: { enabled: true, rMultiple: 1.0, exitRatio: 0.25, autoExecuteEnabled: true }, // exits 0.01 lot
        t2: { enabled: true, rMultiple: 2.0, exitRatio: 0.25, autoExecuteEnabled: true }, // exits 0.01 lot
        t3: { enabled: true, isFreeRunner: true, autoExecuteEnabled: true }, // 0.02 lot runner
      },
      executedLadderSteps: [],
    });
    createdTradeIds.push(trade._id);

    // Step 1: Live MT5 price reaches 3569.00 (hits T1 at +1.0R)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3569.00,
      accountId,
      symbol: 'XAUUSD',
    });

    // Run first worker cycle
    await LiveExecutionWorker.runCycle(userId);

    // Verify: T1 was executed
    const commandsAfterT1 = await Mt5Command.find({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(commandsAfterT1).toHaveLength(1);
    expect(commandsAfterT1[0].volume).toBe(0.01);

    // Verify trade document updated with executedLadderSteps in MongoDB
    const updatedTradeAfterT1 = await Trade.findById(trade._id);
    expect(updatedTradeAfterT1?.executedLadderSteps).toContain('step1');
    expect(updatedTradeAfterT1?.executedLadderSteps).toContain('T1');

    // Step 2: Simulate price moving to 3567.04 (+1.76R, past T1, not yet reaching T2 at 3566.39)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3567.04,
      accountId,
      symbol: 'XAUUSD',
    });

    // SIMULATE AWS SERVER RESTART: Wipes in-memory Set completely
    LiveExecutionWorker.resetMilestones();

    // Run worker cycle again after restart
    await LiveExecutionWorker.runCycle(userId);

    // CRITICAL INVARIANT: Zero duplicate T1 executions! Total close commands must still be 1!
    const commandsAfterRestart = await Mt5Command.find({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(commandsAfterRestart).toHaveLength(1);

    // Step 3: Simulate price pullback and re-conquer:
    // Price bounces back up to 3570.00 (pulling back below 1R)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3570.00,
      accountId,
      symbol: 'XAUUSD',
    });
    await LiveExecutionWorker.runCycle(userId);
    expect(await Mt5Command.countDocuments({ userId: new mongoose.Types.ObjectId(userId), ticket, action: 'CLOSE_POSITION' })).toBe(1);

    // Price drops back down through 3568.50 ("re-conquering" 1R)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3568.50,
      accountId,
      symbol: 'XAUUSD',
    });
    LiveExecutionWorker.resetMilestones(); // server restart during re-conquer
    await LiveExecutionWorker.runCycle(userId);

    // Still exactly 1 close command! Trend runner remains 100% protected!
    const commandsAfterReconquer = await Mt5Command.find({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(commandsAfterReconquer).toHaveLength(1);
  });

  it('Scenario 2: Multi-Target Progression to Free Runner & No Re-execution of T1 or T2', async () => {
    const ticket = 9917477902;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      direction: 'SHORT',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 3571.73,
        quantity: 0.04,
      },
      risk: {
        plannedEntryPrice: 3571.73,
        initialStopLoss: 3574.40,
        currentStopLoss: 3574.40,
      },
      tags: [`MT5_TICKET_${ticket}`, 'ELEFIN'],
      customLadderRules: {
        targetMode: 'CLASSIC_THREE',
        autoExecuteEnabled: true,
        t1: { enabled: true, rMultiple: 1.0, exitRatio: 0.25, autoExecuteEnabled: true },
        t2: { enabled: true, rMultiple: 2.0, exitRatio: 0.25, autoExecuteEnabled: true },
        t3: { enabled: true, isFreeRunner: true, autoExecuteEnabled: true },
      },
      executedLadderSteps: [],
    });
    createdTradeIds.push(trade._id);

    // 1. Hit T1 at 3569.00
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3569.00,
      accountId,
      symbol: 'XAUUSD',
    });
    await LiveExecutionWorker.runCycle(userId);

    // 2. Hit T2 at 3566.00 (+2.0R)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3566.00,
      accountId,
      symbol: 'XAUUSD',
    });
    await LiveExecutionWorker.runCycle(userId);

    // Verify both T1 and T2 executed
    const closeCmds = await Mt5Command.find({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(closeCmds).toHaveLength(2);
    expect(closeCmds[0].volume).toBe(0.01);
    expect(closeCmds[1].volume).toBe(0.01);

    // Verify executed steps in DB
    const updatedTrade = await Trade.findById(trade._id);
    expect(updatedTrade?.executedLadderSteps).toContain('step1');
    expect(updatedTrade?.executedLadderSteps).toContain('step2');

    // 3. Price runs further into trend: 3555.00 (+6.2R)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 3555.00,
      accountId,
      symbol: 'XAUUSD',
    });
    LiveExecutionWorker.resetMilestones();
    await LiveExecutionWorker.runCycle(userId);

    // Invariant: No additional close commands! The 0.02 lot runner runs free without liquidation!
    const cmdsAfterDeepRun = await Mt5Command.find({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(cmdsAfterDeepRun).toHaveLength(2);
  });

  it('Scenario 3: Fractional Lot Remainder & 0.01 Lot Runner Protection', async () => {
    // 0.02 lot trade: T1 exits 50% (0.01), leaving 0.01 lot runner
    const ticket = 9917477903;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'EURUSD',
      direction: 'LONG',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 1.0500,
        quantity: 0.02,
      },
      risk: {
        plannedEntryPrice: 1.0500,
        initialStopLoss: 1.0480,
        currentStopLoss: 1.0480,
      },
      tags: [`MT5_TICKET_${ticket}`, 'ELEFIN'],
      customLadderRules: {
        targetMode: 'T1_FREE_RUNNER',
        autoExecuteEnabled: true,
        t1: { enabled: true, rMultiple: 1.0, exitRatio: 0.50, autoExecuteEnabled: true }, // exits 0.01
        t3: { enabled: true, isFreeRunner: true, autoExecuteEnabled: true }, // 0.01 runner
      },
      executedLadderSteps: [],
    });
    createdTradeIds.push(trade._id);

    // Price reaches T1: 1.0520 (+1.0R)
    Mt5CommandService.recordPositionQuote(ticket, {
      curPrice: 1.0520,
      accountId,
      symbol: 'EURUSD',
    });
    await LiveExecutionWorker.runCycle(userId);

    // Exactly 1 close command for 0.01 lot
    const cmds = await Mt5Command.find({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].volume).toBe(0.01);

    // Verify financial engine calculation directly for remaining runner:
    const ladder = calculateTargetLadder({
      entryPrice: 1.0500,
      currentLtp: 1.0525,
      direction: 'LONG',
      quantity: 0.01,
      contractMultiplier: 100000,
      initialStopLoss: 1.0480,
      initialRiskAmount: 200,
      stopLoss: 1.0500,
      plannedTarget: 1.0560,
      tickSize: 0.00001,
      lotSize: 1,
      executedLadderSteps: ['step1', 'T1'],
      customRules: {
        targetMode: 'T1_FREE_RUNNER',
        autoExecuteEnabled: true,
        t1: { enabled: true, rMultiple: 1.0, exitRatio: 0.50, autoExecuteEnabled: true },
        t3: { enabled: true, isFreeRunner: true, autoExecuteEnabled: true },
      },
    });

    // Step 1 must be EXECUTED and non-actionable with 0 planned exit quantity
    const step1 = ladder.steps.find((s) => s.targetIndex === 1);
    expect(step1?.status).toBe('EXECUTED');
    expect(step1?.isActionable).toBe(false);
    expect(step1?.plannedExitQty).toBe(0);

    // Runner must be free runner with 0.01 lot open runner quantity, running uncapped
    const runner = ladder.steps.find((s) => s.isFreeRunner);
    expect(runner).toBeDefined();
    expect(runner?.plannedExitQty).toBe(0.01);
    expect(runner?.isActionable).toBe(false);
    expect(runner?.isFreeRunner).toBe(true);
  });

  it('Scenario 4: Trailing Stop Loss Favorable-Only Invariant', async () => {
    // SHORT trade: SL at 3574.40. Trailed SL to Break-Even (3571.73).
    // Attempting to move SL backwards to 3573.50 (worsening risk) MUST be held and blocked.
    const ticket = 9917477904;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      direction: 'SHORT',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 3571.73,
        quantity: 0.04,
      },
      risk: {
        plannedEntryPrice: 3571.73,
        initialStopLoss: 3574.40,
        currentStopLoss: 3571.73, // Already tightened to BE
      },
      tags: [`MT5_TICKET_${ticket}`, 'ELEFIN'],
    });
    createdTradeIds.push(trade._id);

    // Attempt automated SL modification that loosens risk (from 3571.73 to 3573.50 on SHORT)
    const loosenRes = await ExecutionPipelineService.execute({
      userId,
      accountId,
      tradeId: trade._id.toString(),
      action: 'MODIFY_STOP_LOSS',
      executeBroker: true,
      isAutomated: true,
      payload: {
        stopPrice: 3573.50,
      },
    });
    expect(loosenRes.brokerResult.action).toBe('HELD_RISK_PROTECTION');

    // Invariant: currentStopLoss is untouched!
    const tradeAfterLoosen = await Trade.findById(trade._id);
    expect(tradeAfterLoosen?.risk?.currentStopLoss).toBe(3571.73);

    // Favorable SL modification (from 3571.73 to 3569.00 on SHORT) MUST succeed
    const favorableRes = await ExecutionPipelineService.execute({
      userId,
      accountId,
      tradeId: trade._id.toString(),
      action: 'MODIFY_STOP_LOSS',
      executeBroker: true,
      isAutomated: true,
      payload: {
        stopPrice: 3569.00,
      },
    });
    expect(favorableRes.success).toBe(true);

    const slCmd = await Mt5Command.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      ticket,
      action: 'MODIFY_SL',
    });
    expect(slCmd).not.toBeNull();
    expect(slCmd?.stopLoss).toBe(3569.00);

    const tradeAfterFavorable = await Trade.findById(trade._id);
    expect(tradeAfterFavorable?.risk?.currentStopLoss).toBe(3569.00);
  });

  it('Scenario 5: Concurrent Claim Invariant (Multi-Tab / Cluster Race Condition)', async () => {
    const ticket = 9917477905;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 3500.00,
        quantity: 0.04,
      },
      risk: {
        plannedEntryPrice: 3500.00,
        initialStopLoss: 3490.00,
        currentStopLoss: 3490.00,
      },
      tags: [`MT5_TICKET_${ticket}`, 'ELEFIN'],
      executedLadderSteps: [],
    });
    createdTradeIds.push(trade._id);

    const claimKeys = ['step1', 'T1', 'ladder:' + trade._id.toString() + ':step1'];

    // Simulate two parallel workers/tabs attempting to claim T1 simultaneously
    const [claimA, claimB] = await Promise.all([
      Trade.findOneAndUpdate(
        { _id: trade._id, status: 'OPEN', executedLadderSteps: { $nin: claimKeys } },
        { $addToSet: { executedLadderSteps: { $each: claimKeys } } },
        { new: true }
      ),
      Trade.findOneAndUpdate(
        { _id: trade._id, status: 'OPEN', executedLadderSteps: { $nin: claimKeys } },
        { $addToSet: { executedLadderSteps: { $each: claimKeys } } },
        { new: true }
      ),
    ]);

    // Invariant: Exactly one claim succeeds, the other receives null!
    const succeededClaims = [claimA, claimB].filter(Boolean);
    const failedClaims = [claimA, claimB].filter((c) => c === null);

    expect(succeededClaims).toHaveLength(1);
    expect(failedClaims).toHaveLength(1);

    // Verify final state in DB
    const finalTrade = await Trade.findById(trade._id);
    expect(finalTrade?.executedLadderSteps).toContain('step1');
  });

  it('Scenario 6: Giveback Anti-Greed Auto-Exit Claim Protection', async () => {
    const ticket = 9917477906;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 3500.00,
        quantity: 0.02,
      },
      risk: {
        plannedEntryPrice: 3500.00,
        initialStopLoss: 3490.00,
        currentStopLoss: 3500.00,
      },
      tags: [`MT5_TICKET_${ticket}`, 'ELEFIN'],
      customLadderRules: {
        targetMode: 'T1_FREE_RUNNER',
        autoExecuteEnabled: true,
        givebackAutoExit: {
          enabled: true,
          thresholdPercent: 40,
        },
      },
      executedLadderSteps: [`giveback_auto:${ticket}`], // Already exited due to giveback
    });
    createdTradeIds.push(trade._id);

    // Attempt to claim giveback exit again
    const givebackKey = `giveback_auto:${ticket}`;
    const duplicateClaim = await Trade.findOneAndUpdate(
      {
        _id: trade._id,
        status: 'OPEN',
        executedLadderSteps: { $ne: givebackKey },
      },
      {
        $addToSet: { executedLadderSteps: givebackKey },
      },
      { new: true }
    );

    // Claim must be rejected because it was already executed
    expect(duplicateClaim).toBeNull();
  });

  it('Scenario 7: Strict Tenant Isolation: User B cannot access or execute User A trade', async () => {
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      executionMode: 'SIMPLE',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      tradeDate: new Date(),
      entryTime: new Date(),
      lotSize: 1,
      simpleExecution: {
        entryPrice: 3500.00,
        quantity: 0.02,
      },
    });
    createdTradeIds.push(trade._id);

    // User B attempting to execute broker ladder step on User A's trade
    const ladderResB = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/broker-ladder-step`,
      headers: { cookie: `tv_session=${userBAuthCookie}` },
      payload: {
        targetIndex: 1,
        quantity: 0.01,
        exitPrice: 3510.00,
      },
    });
    expect(ladderResB.statusCode).toBe(404);

    // User B attempting to modify stop loss on User A's trade
    const slResB = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/broker-stop-loss`,
      headers: { cookie: `tv_session=${userBAuthCookie}` },
      payload: {
        newStopLoss: 3505.00,
      },
    });
    expect(slResB.statusCode).toBe(404);
  });
});
