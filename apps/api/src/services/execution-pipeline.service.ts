import mongoose from 'mongoose';
import {
  BrokerAdapterRegistry,
  evaluatePropPreTradeGuard,
  evaluateSlippageRisk,
  evaluateSpreadSurge,
  evaluateOpeningBellGuard,
} from '@tradevault/financial-engine';
import { TradingAccount } from '../db/models/TradingAccount.js';
import { Trade } from '../db/models/Trade.js';
import { User } from '../db/models/User.js';
import { AdapterFactory } from './adapters/adapter-factory.js';
import { IdempotencyService } from './idempotency.service.js';
import { AccountService } from './account.service.js';
import { AccountScopeService } from './account-scope.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';

export interface ExecutionPipelineRequest {
  userId: string | mongoose.Types.ObjectId;
  accountId: string | mongoose.Types.ObjectId;
  tradeId?: string | mongoose.Types.ObjectId;
  action: 'MODIFY_STOP_LOSS' | 'EXIT_POSITION' | 'PLACE_ORDER';
  executeBroker: boolean;
  isAutomated?: boolean;
  manualOverrideConfirmed?: boolean;
  idempotencyKey?: string;
  dataHealth?: {
    isSimulated?: boolean;
    isStale?: boolean;
    quoteAgeMs?: number;
    provider?: string;
  };
  institutionalRules?: {
    executionAlgorithm?: 'PEGGED_CHASE' | 'TWAP_SLICING' | 'INSTANT_MARKET';
    maxSlippagePercent?: number;
    maxSlippagePoints?: number;
    spreadSurgeProtectionEnabled?: boolean;
    spreadSurgeMultiplier?: number;
    antiLoopProtectionEnabled?: boolean;
    openingBellFreezeEnabled?: boolean;
    openingBellFreezeMinutes?: number;
    currentLtp?: number;
    targetPrice?: number;
    currentSpread?: number;
    baselineSpread?: number;
  };
  payload: {
    stopPrice?: number;
    exitPrice?: number;
    quantity?: number;
    symbol?: string;
    direction?: 'LONG' | 'SHORT';
    takeProfit?: number;
    exitReason?: string;
    reason?: string;
    priceDistanceToSL?: number;
    plannedRiskAmount?: number;
    contractMultiplier?: number;
    lotCap?: number;
  };
}

export interface ExecutionPipelineResponse {
  success: boolean;
  executedOnBroker: boolean;
  orderId?: string;
  ticket?: number;
  action: string;
  message: string;
  trade?: any;
  account?: any;
  auditEntry?: any;
  brokerResult?: any;
}

export class ExecutionPipelineService {
  private static recentExecutions = new Map<string, number[]>();

  /**
   * Universal Single Execution Pipeline for UI, Telegram, Trailing, Ladder, Panic, and Auto-Worker.
   */
  static async execute(req: ExecutionPipelineRequest): Promise<ExecutionPipelineResponse> {
    const userOid = typeof req.userId === 'string' ? new mongoose.Types.ObjectId(req.userId) : req.userId;
    const accountOid = typeof req.accountId === 'string' ? new mongoose.Types.ObjectId(req.accountId) : req.accountId;

    // 1. Resolve Account & Enforce Ownership
    const account = await TradingAccount.findOne({
      _id: accountOid,
      userId: userOid,
    });
    if (!account) {
      throw new Error('Account not found or access denied (ownership verification failed).');
    }

    if (account.status === 'ARCHIVED') {
      throw new Error('Cannot execute trades on an ARCHIVED account.');
    }

    // Resolve Trade if specified
    let trade: any = null;
    if (req.tradeId) {
      const tradeOid = typeof req.tradeId === 'string' ? new mongoose.Types.ObjectId(req.tradeId) : req.tradeId;
      trade = await Trade.findOne({ _id: tradeOid, userId: userOid });
      if (!trade) {
        throw new Error('Trade not found or access denied (ownership verification failed).');
      }
    }

    // 2. Resolve Adapter & Enforce Capabilities
    const adapter = AdapterFactory.getAdapter(account);
    const capabilities = account.profile?.capabilities || adapter.capabilities;

    if (req.executeBroker) {
      const capAction =
        req.action === 'MODIFY_STOP_LOSS'
          ? 'MODIFY_STOP_LOSS'
          : req.action === 'EXIT_POSITION'
          ? 'EXIT_POSITION'
          : 'PLACE_ORDER';

      const capCheck = BrokerAdapterRegistry.checkCapability(capAction, capabilities, adapter.name);
      if (!capCheck.allowed) {
        throw new Error(`Broker execution prohibited: ${capCheck.reason}`);
      }
    }

    // 3. Data-Health Guard
    if (req.executeBroker && req.dataHealth) {
      if (req.dataHealth.isSimulated || req.dataHealth.provider === 'SIMULATED') {
        throw new Error('Live broker execution rejected: SIMULATED quotes cannot drive real broker orders.');
      }
      if (req.dataHealth.isStale || (req.dataHealth.quoteAgeMs && req.dataHealth.quoteAgeMs > 60000)) {
        throw new Error('Live broker execution rejected: Market quote is stale or expired (>60s).');
      }
    }

    // 3.5 Institutional Microstructure & Anti-Loop Safeguards
    if (req.isAutomated && req.institutionalRules) {
      const inst = req.institutionalRules;
      const userKey = userOid.toString();

      // Anti-Loop Rate Limiting Guard (protects against broker API ban and rapid firing loops)
      if (inst.antiLoopProtectionEnabled !== false) {
        const now = Date.now();
        const recent = (ExecutionPipelineService.recentExecutions.get(userKey) || []).filter((t) => now - t < 5000);
        if (recent.length >= 3) {
          throw new Error('Automated execution held by anti-loop protection: order rate limit exceeded (>3 orders / 5s).');
        }
        recent.push(now);
        ExecutionPipelineService.recentExecutions.set(userKey, recent);
      }

      // Opening Bell Volatility Freeze Guard
      if (inst.openingBellFreezeEnabled) {
        const bell = evaluateOpeningBellGuard({
          freezeMinutes: inst.openingBellFreezeMinutes ?? 5,
        });
        if (!bell.isSafe) {
          throw new Error(`Automated execution held: ${bell.reason}`);
        }
      }

      // Spread Surge Protection Guard
      if (inst.spreadSurgeProtectionEnabled !== false && inst.currentSpread && inst.baselineSpread) {
        const surge = evaluateSpreadSurge({
          currentSpread: inst.currentSpread,
          baselineSpread: inst.baselineSpread,
          surgeMultiplier: inst.spreadSurgeMultiplier ?? 2.0,
        });
        if (!surge.isSafe) {
          throw new Error(`Automated execution held: ${surge.reason}`);
        }
      }

      // Adverse Slippage Cap Guard on Exits
      if (req.action === 'EXIT_POSITION' && inst.targetPrice && inst.currentLtp) {
        const tradeDir = req.payload.direction || trade?.direction || 'LONG';
        const slip = evaluateSlippageRisk({
          triggerPrice: inst.targetPrice,
          currentLtp: inst.currentLtp,
          direction: tradeDir,
          maxSlippagePercent: inst.maxSlippagePercent ?? 0.05,
          maxSlippagePoints: inst.maxSlippagePoints ?? 2,
        });
        if (!slip.isAcceptable) {
          throw new Error(`Automated execution held: ${slip.reason}`);
        }
      }
    }

    // 4. Prop Rule Pre-Trade Guard
    const isProp = AccountScopeService.isPropAccount(account);
    if (isProp) {
      const dailyBuffer = AccountScopeService.getPropAccountDailyLossLimit(account);
      const plannedRisk = req.payload.plannedRiskAmount ?? (
        req.payload.priceDistanceToSL && req.payload.quantity
          ? req.payload.priceDistanceToSL * req.payload.quantity * (req.payload.contractMultiplier || 1)
          : undefined
      );

      const hasSl = Boolean(
        req.payload.stopPrice || (trade && (trade.risk?.currentStopLoss || trade.risk?.initialStopLoss))
      );

      const propGuardResult = evaluatePropPreTradeGuard({
        accountBalance: Number(account.currentBalance || account.initialBalance || 100000),
        accountDailyLossRemaining: dailyBuffer,
        accountMaxLossRemaining: dailyBuffer * 2,
        plannedRiskAmount: plannedRisk,
        quantity: req.payload.quantity || (trade?.calculated?.openQuantity ?? 1),
        contractMultiplier: req.payload.contractMultiplier || 1,
        priceDistanceToSL: req.payload.priceDistanceToSL,
        hasStopLoss: hasSl,
        isAutomated: req.isAutomated,
        currency: account.baseCurrency || 'USD',
        rules: {
          prohibitNewsTrading: account.profile?.riskRules?.prohibitNewsTrading,
          prohibitWeekendHolding: account.profile?.riskRules?.prohibitWeekendHolding,
          requireStopLoss: account.profile?.riskRules?.requireStopLoss ?? true,
          lotCap: account.profile?.riskRules?.lotCap,
        },
      });

      if (propGuardResult.hasBlockingViolations) {
        const reasons = propGuardResult.violations.map((v) => v.message).join(' | ');
        if (req.isAutomated) {
          throw new Error(`Automation blocked by Prop Rule Pre-Trade Guard: ${reasons}`);
        }
        if (!req.manualOverrideConfirmed) {
          throw new Error(`Prop Rule Pre-Trade Guard Alert: ${reasons}. Explicit confirmation required.`);
        }
      }
    }

    // 5. Idempotency Lock
    const idKey = req.idempotencyKey || `exec_${req.tradeId || accountOid}_${Date.now()}`;
    const compositeKey = IdempotencyService.makeKey(userOid.toString(), req.action, idKey);
    let lockAcquired = false;

    try {
      const lock = IdempotencyService.acquireLock(compositeKey);
      if (lock.cachedResult) {
        return lock.cachedResult as ExecutionPipelineResponse;
      }
      lockAcquired = lock.isLocked;
    } catch (err: any) {
      throw new Error(`Concurrent execution lock: ${err.message}`);
    }

    try {
      let brokerResult: any = { executedOnBroker: false, action: 'JOURNAL_ONLY' };

      // 6. Broker Adapter Call
      if (req.executeBroker) {
        if (req.action === 'MODIFY_STOP_LOSS') {
          if (!req.payload.stopPrice) throw new Error('Stop price is required for stop loss modification');
          brokerResult = await adapter.modifyStopLoss({
            userId: userOid,
            account,
            trade,
            newStopLoss: req.payload.stopPrice,
            takeProfit: req.payload.takeProfit,
          });
        } else if (req.action === 'EXIT_POSITION') {
          brokerResult = await adapter.exitPosition({
            userId: userOid,
            account,
            trade,
            exitPrice: req.payload.exitPrice,
            quantity: req.payload.quantity,
            exitReason: req.payload.exitReason,
          });
        } else if (req.action === 'PLACE_ORDER') {
          if (!req.payload.symbol || !req.payload.direction || !req.payload.quantity) {
            throw new Error('Symbol, direction, and quantity are required for order entry');
          }
          brokerResult = await adapter.placeOrder({
            userId: userOid,
            account,
            symbol: req.payload.symbol,
            direction: req.payload.direction,
            quantity: req.payload.quantity,
            price: req.payload.exitPrice,
            stopLoss: req.payload.stopPrice,
            takeProfit: req.payload.takeProfit,
          });
        }
      }

      // 7. Journal & Audit Trail
      const auditEntry: any = {
        action: req.action,
        timestamp: new Date(),
        details: {
          executeBroker: req.executeBroker,
          adapter: adapter.key,
          isAutomated: req.isAutomated,
          manualOverrideConfirmed: req.manualOverrideConfirmed,
          payload: req.payload,
          brokerResult,
        },
      };

      if (trade) {
        if (req.action === 'MODIFY_STOP_LOSS' && req.payload.stopPrice) {
          if (!trade.risk) trade.risk = {};
          if (!trade.risk.initialStopLoss) {
            trade.risk.initialStopLoss = req.payload.stopPrice;
          }
          trade.risk.currentStopLoss = req.payload.stopPrice;
        }

        if (!Array.isArray(trade.auditLog)) trade.auditLog = [];
        trade.auditLog.push(auditEntry);
        await trade.save();
      }

      // 7.5 Real-time Telegram Auto-Execution Alert Dispatch
      if (req.isAutomated) {
        User.findById(userOid)
          .then((u) => {
            if (u) {
              return TelegramAlertService.sendAutoExecutionAlert(u, {
                symbol: trade?.symbol || 'POSITION',
                direction: trade?.direction || 'LONG',
                action: req.action,
                fillPrice: brokerResult.executedPrice ?? req.payload.exitPrice ?? req.payload.stopPrice,
                quantity: req.payload.quantity ?? trade?.calculated?.openQuantity,
                stopPrice: req.payload.stopPrice,
                reason: req.payload.exitReason || req.payload.reason,
                accountName: account?.name,
              });
            }
          })
          .catch((err) => console.warn('[ExecutionPipeline] Failed to send auto alert to Telegram:', err.message));
      }

      // 8. Reconcile Account Balances
      await AccountService.recalculateAccountBalances(accountOid, userOid);

      const response: ExecutionPipelineResponse = {
        success: true,
        executedOnBroker: req.executeBroker,
        orderId: brokerResult.orderId,
        ticket: brokerResult.ticket,
        action: req.action,
        message: brokerResult.message || `Operation ${req.action} completed successfully`,
        trade,
        account,
        auditEntry,
        brokerResult,
      };

      if (lockAcquired) {
        IdempotencyService.resolve(compositeKey, response);
      }

      return response;
    } catch (err: any) {
      if (lockAcquired) {
        IdempotencyService.reject(compositeKey, err);
      }
      throw err;
    }
  }
}
