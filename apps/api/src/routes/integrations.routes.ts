import crypto from 'crypto';
import mongoose from 'mongoose';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BrokerIntegration, MarketDataIntegration, Trade, Instrument, TradingAccount, User } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { FyersService } from '../services/fyers.service.js';
import { TelegramAlertService } from '../services/telegram-alert.service.js';
import { Mt5CommandService } from '../services/mt5-command.service.js';
import { decryptSecret, encryptSecret, hashOAuthState } from '../services/crypto.service.js';
import { excursionBackfillSchema } from '@tradevault/shared';
import { config } from '../config.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getEffectiveFyersRedirectUri(req: any): string {
  if (process.env.FYERS_REDIRECT_URI) {
    return process.env.FYERS_REDIRECT_URI;
  }
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'http';
    return `${proto}://${host}/api/v1/integrations/fyers/callback`;
  }
  return config.fyersRedirectUri;
}

function buildFrontendRedirect(req: any, searchParams: Record<string, string>): string {
  let base = config.webAppUrl.replace(/\/$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'http';
    base = `${proto}://${host}`;
  }

  const url = new URL(`${base}/settings`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export const integrationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Callback endpoint from FYERS OAuth redirect. The state is a short-lived,
  // database-backed nonce that identifies the user without exposing their ID.
  app.get('/fyers/callback', async (req: any, reply) => {
    const code =
      req.query.auth_code ||
      (req.query.code && String(req.query.code).length > 10 ? req.query.code : null);
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    req.log.info(
      {
        hasAuthCode: Boolean(req.query.auth_code),
        codeLength: code?.length,
        hasState: Boolean(state),
      },
      'FYERS OAuth callback received'
    );

    if (!code) {
      return reply.redirect(
        buildFrontendRedirect(req, {
          fyers: 'error',
          message: 'No valid auth_code received from FYERS',
        })
      );
    }

    if (!state) {
      return reply.redirect(
        buildFrontendRedirect(req, { fyers: 'error', message: 'Missing OAuth state' })
      );
    }

    try {
      const stateHash = hashOAuthState(state);
      const integration = await BrokerIntegration.findOne({
        broker: 'FYERS',
        oauthStateHash: stateHash,
        oauthStateExpiresAt: { $gt: new Date() },
      });

      if (!integration || !integration.appId || !integration.secretKey) {
        return reply.redirect(
          buildFrontendRedirect(req, {
            fyers: 'error',
            message: 'OAuth state expired or app credentials are missing',
          })
        );
      }

      const tokens = await FyersService.validateAuthCode(
        integration.appId,
        decryptSecret(integration.secretKey) as string,
        code
      );

      integration.accessToken = encryptSecret(tokens.accessToken) || undefined;
      integration.refreshToken = encryptSecret(tokens.refreshToken) || undefined;
      integration.clientId = tokens.clientId || integration.clientId || integration.appId.split('-')[0];
      integration.tokenExpiresAt = new Date(tokens.accessTokenExpiresAt);
      integration.authCodeExpiresAt = new Date(tokens.accessTokenExpiresAt);
      integration.set('oauthStateHash', undefined);
      integration.set('oauthStateExpiresAt', undefined);
      integration.status = 'CONNECTED';
      integration.set('fundsSyncError', undefined);
      await integration.save();

      try {
        await FyersService.syncTradesForUser(integration.userId.toString());
      } catch (tradeErr) {
        req.log.warn({ tradeErr }, 'Initial trade sync failed after FYERS connection');
      }

      return reply.redirect(
        buildFrontendRedirect(req, { fyers: 'connected', status: 'success' })
      );
    } catch (err: any) {
      return reply.redirect(
        buildFrontendRedirect(req, {
          fyers: 'error',
          message: err.message || 'Authentication failed',
        })
      );
    }
  });

  // Public Telegram Webhook Endpoint (Receives button clicks and two-way commands)
  app.post('/telegram/webhook', async (req, reply) => {
    // Verify Telegram Webhook Secret Token header
    const presentedSecret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = TelegramAlertService.getWebhookSecretToken();

    if (!presentedSecret || presentedSecret !== expectedSecret) {
      req.log.warn('[TelegramWebhook] Unauthorized webhook request rejected: invalid secret token');
      return reply.status(401).send({ error: 'Unauthorized webhook request' });
    }

    // Return 200 OK immediately so Telegram receives instant delivery acknowledgement
    reply.status(200).send({ ok: true });

    // Process update asynchronously in background
    setImmediate(() => {
      TelegramAlertService.processWebhookUpdate(req.body).catch((err) => {
        req.log.warn('[TelegramWebhook] Async update processing error: %s', err.message);
      });
    });
  });

  // Contract specs for MetaTrader 5 & Elefin global CFD/Forex symbols
  function getMt5ContractSpec(sym: string) {
    const upper = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (upper === 'XAUUSD' || upper === 'GOLD') {
      return {
        symbol: 'XAUUSD',
        multiplier: 100,
        lotSize: 0.01,
        displayName: 'Gold / US Dollar Spot (CFD/Forex)',
        assetClass: 'FOREX' as const,
        exchange: 'FOREX' as const,
        marketSegment: 'FOREX' as const,
        tickSize: 0.01,
      };
    }
    if (upper === 'XAGUSD' || upper === 'SILVER') {
      return {
        symbol: 'XAGUSD',
        multiplier: 5000,
        lotSize: 0.01,
        displayName: 'Silver / US Dollar Spot (CFD/Forex)',
        assetClass: 'FOREX' as const,
        exchange: 'FOREX' as const,
        marketSegment: 'FOREX' as const,
        tickSize: 0.001,
      };
    }
    if (upper.endsWith('USDT') || ['BTCUSD', 'ETHUSD', 'SOLUSD', 'DOGEUSD'].includes(upper)) {
      return {
        symbol: upper,
        multiplier: 1,
        lotSize: 0.01,
        displayName: `${upper} Crypto CFD`,
        assetClass: 'CRYPTO' as const,
        exchange: 'CRYPTO' as const,
        marketSegment: 'CRYPTO' as const,
        tickSize: 0.01,
      };
    }
    if (['NAS100', 'USTEC', 'US30', 'DJ30', 'SPX500', 'US500', 'GER40', 'DAX'].includes(upper)) {
      return {
        symbol: upper,
        multiplier: 1,
        lotSize: 0.1,
        displayName: `${upper} Index CFD`,
        assetClass: 'FUTURES' as const,
        exchange: 'FOREX' as const,
        marketSegment: 'FOREX' as const,
        tickSize: 0.1,
      };
    }
    if (['USOIL', 'WTI', 'UKOIL', 'BRENT'].includes(upper)) {
      return {
        symbol: 'USOIL',
        multiplier: 1000,
        lotSize: 0.01,
        displayName: `${upper} Crude Oil Spot CFD`,
        assetClass: 'COMMODITY' as const,
        exchange: 'FOREX' as const,
        marketSegment: 'FOREX' as const,
        tickSize: 0.01,
      };
    }
    return {
      symbol: upper,
      multiplier: 100000,
      lotSize: 0.01,
      displayName: `${upper} Forex Pair`,
      assetClass: 'FOREX' as const,
      exchange: 'FOREX' as const,
      marketSegment: 'FOREX' as const,
      tickSize: upper.includes('JPY') ? 0.001 : 0.00001,
    };
  }

  // Public MetaTrader 5 (MT5) & Elefin Webhook Endpoint
  // Supports automated real-time trade open, modify, and close syncing from MT5 Expert Advisors
  app.post('/mt5/webhook', async (req: any, reply: any) => {
    const rawToken =
      req.headers['x-api-key'] ||
      req.headers['x-webhook-token'] ||
      req.query?.token ||
      req.query?.key ||
      req.body?.token;

    // Locate target trading account
    let account: any = null;
    if (rawToken && mongoose.isValidObjectId(rawToken)) {
      account = await TradingAccount.findById(rawToken);
    }
    if (!account && (rawToken === 'elefin' || !rawToken)) {
      // Default to active Elefin account
      account = await TradingAccount.findOne({ broker: /elefin/i, status: 'ACTIVE' });
    }
    if (!account) {
      account = await TradingAccount.findOne({
        $or: [{ broker: /elefin/i }, { name: /elefin/i }],
        status: 'ACTIVE',
      });
    }

    if (!account) {
      req.log.warn('[MT5Webhook] Target trading account not found for token: %s', rawToken);
      return reply.status(404).send({ success: false, error: 'Trading account not found' });
    }

    // Process command execution acknowledgements from MT5 EA
    if (Array.isArray(req.body?.commandResults)) {
      await Mt5CommandService.processCommandResults(req.body.commandResults);
    }

    // Retrieve pending 2-way broker commands for this account
    const pendingCommands = await Mt5CommandService.getPendingCommandsForAccount(account._id);

    // Health check / ping test
    if (req.body?.action === 'PING' || req.body?.ping) {
      return reply.send({
        ok: true,
        status: 'CONNECTED',
        broker: account.broker,
        accountName: account.name,
        commands: pendingCommands,
      });
    }

    // Update account balance if provided in payload
    if (req.body?.balance !== undefined) {
      const bal = Number(req.body.balance);
      if (Number.isFinite(bal) && bal > 0) {
        account.currentBalance = mongoose.Types.Decimal128.fromString(bal.toFixed(2));
        await account.save().catch(() => {});
      }
    }

    const rawItems: any[] = Array.isArray(req.body?.positions)
      ? req.body.positions
      : Array.isArray(req.body)
      ? req.body
      : req.body?.ticket || req.body?.symbol
      ? [req.body]
      : [];

    if (rawItems.length === 0) {
      return reply.send({ ok: true, processed: 0, message: 'No positions in payload', commands: pendingCommands });
    }

    let processedCount = 0;
    const results: any[] = [];

    for (const item of rawItems) {
      const ticketStr = String(item.ticket || item.id || item.ticket_id || item.order || '').trim();
      if (!ticketStr) continue;

      const rawSym = String(item.symbol || '').toUpperCase().trim();
      const spec = getMt5ContractSpec(rawSym);
      const symbol = spec.symbol;
      const rawSide = String(item.type || item.side || '').toUpperCase().trim();
      const direction: 'LONG' | 'SHORT' =
        rawSide === 'BUY' || rawSide === '0' || rawSide === 'LONG' ? 'LONG' : 'SHORT';
      const volume = Math.abs(parseFloat(item.volume || item.lots || item.qty || 0.01) || 0.01);
      const entryPrice = Math.abs(parseFloat(item.price || item.open_price || item.entry || 0) || 0);
      const stopLoss = parseFloat(item.sl || item.stop_loss || 0) || undefined;
      const takeProfit = parseFloat(item.tp || item.take_profit || 0) || undefined;
      const closePrice = parseFloat(item.close_price || item.exit_price || 0) || undefined;
      const profit = parseFloat(item.profit || item.net_profit || item.pnl || 0) || 0;
      const commission = Math.abs(parseFloat(item.commission || item.fee || 0) || 0);
      const swap = Math.abs(parseFloat(item.swap || 0) || 0);
      const rawAction = String(item.action || '').toUpperCase();

      const isClose =
        rawAction === 'CLOSE' ||
        (closePrice !== undefined && closePrice > 0) ||
        String(item.status || '').toUpperCase() === 'CLOSED';

      const isModify = rawAction === 'MODIFY' && !isClose;

      // Locate existing trade record by ticket tag
      const ticketTag = `MT5_TICKET_${ticketStr}`;
      let trade = await Trade.findOne({
        userId: account.userId,
        accountId: account._id,
        tags: ticketTag,
      });

      if (isClose) {
        if (!trade) {
          // Untracked trade closed: create closed record
          let instrument = await Instrument.findOne({ userId: account.userId, symbol });
          if (!instrument) {
            instrument = await Instrument.create({
              userId: account.userId,
              symbol,
              displayName: spec.displayName,
              assetClass: spec.assetClass,
              exchange: spec.exchange,
              marketSegment: spec.marketSegment,
              quoteCurrency: account.baseCurrency || 'USD',
              contractMultiplier: spec.multiplier,
              lotSize: spec.lotSize,
              tickSize: spec.tickSize,
              quantityIncrement: spec.lotSize,
              pricePrecision: 2,
              isActive: true,
              source: 'AUTO',
            });
          }

          const exitPriceFinal = closePrice || entryPrice;
          const priceDiff = direction === 'LONG' ? exitPriceFinal - entryPrice : entryPrice - exitPriceFinal;
          const grossPnL = profit !== 0 ? profit : Number((priceDiff * volume * spec.multiplier).toFixed(2));
          const totalCosts = Number((commission + swap).toFixed(2));
          const netPnL = Number((grossPnL - totalCosts).toFixed(2));

          trade = await Trade.create({
            userId: account.userId,
            accountId: account._id,
            instrumentId: instrument._id,
            underlying: symbol,
            symbol,
            tradeTitle: `${symbol} ${direction} (Elefin #${ticketStr})`,
            assetClass: spec.assetClass,
            exchange: spec.exchange,
            marketSegment: spec.marketSegment,
            currency: account.baseCurrency || 'USD',
            direction,
            status: 'CLOSED',
            tradeDate: new Date(),
            entryTime: item.open_time ? new Date(item.open_time) : new Date(),
            exitTime: item.close_time ? new Date(item.close_time) : new Date(),
            tags: ['ELEFIN', 'MT5', ticketTag],
            importBatchId: `MT5_${ticketStr}`,
            executionMode: 'ADVANCED',
            simpleExecution: {
              contractMultiplier: spec.multiplier,
              entryPrice,
              exitPrice: exitPriceFinal,
              quantity: volume,
              brokerage: commission,
              taxes: 0,
              exchangeFees: 0,
              regulatoryFees: 0,
              otherFees: swap,
              explicitAdjustments: 0,
            },
            fills: [
              {
                fillId: `mt5_${ticketStr}_entry`,
                timestamp: item.open_time ? new Date(item.open_time) : new Date(),
                type: 'ENTRY',
                price: entryPrice,
                quantity: volume,
                fee: commission,
              },
              {
                fillId: `mt5_${ticketStr}_exit`,
                timestamp: item.close_time ? new Date(item.close_time) : new Date(),
                type: 'EXIT',
                price: exitPriceFinal,
                quantity: volume,
                fee: 0,
              },
            ],
            risk: {
              initialStopLoss: stopLoss,
              currentStopLoss: stopLoss,
              plannedTarget: takeProfit,
              riskRuleViolations: [],
            },
            calculated: {
              averageEntryPrice: entryPrice,
              averageExitPrice: exitPriceFinal,
              openQuantity: 0,
              closedQuantity: volume,
              totalCosts,
              grossPnL,
              netPnL,
              outcome: netPnL > 0 ? 'WIN' : netPnL < 0 ? 'LOSS' : 'BREAKEVEN',
            },
          });
        } else {
          // Existing trade closed
          const exitPriceFinal = closePrice || entryPrice;
          const entryP = trade.simpleExecution?.entryPrice || entryPrice;
          const priceDiff = direction === 'LONG' ? exitPriceFinal - entryP : entryP - exitPriceFinal;
          const grossPnL = profit !== 0 ? profit : Number((priceDiff * volume * spec.multiplier).toFixed(2));
          const totalCosts = Number((commission + swap).toFixed(2));
          const netPnL = Number((grossPnL - totalCosts).toFixed(2));

          trade.status = 'CLOSED';
          trade.exitTime = item.close_time ? new Date(item.close_time) : new Date();
          if (trade.simpleExecution) {
            trade.simpleExecution.exitPrice = exitPriceFinal;
          }
          trade.fills.push({
            fillId: `mt5_${ticketStr}_exit`,
            timestamp: trade.exitTime,
            type: 'EXIT',
            price: exitPriceFinal,
            quantity: volume,
            fee: 0,
          } as any);

          if (!trade.calculated) trade.calculated = {} as any;
          trade.calculated.averageExitPrice = exitPriceFinal;
          trade.calculated.openQuantity = 0;
          trade.calculated.closedQuantity = volume;
          trade.calculated.grossPnL = grossPnL;
          trade.calculated.netPnL = netPnL;
          trade.calculated.outcome = netPnL > 0 ? 'WIN' : netPnL < 0 ? 'LOSS' : 'BREAKEVEN';

          trade.markModified('fills');
          trade.markModified('calculated');
          trade.markModified('simpleExecution');
          await trade.save();
        }

        const userDoc = await User.findById(account.userId).lean();
        if (userDoc && trade) {
          TelegramAlertService.notifyTradeClosed(userDoc, trade, {
            netPnL: trade.calculated?.netPnL || 0,
            exitPrice: trade.calculated?.averageExitPrice || closePrice || entryPrice,
          }).catch(() => {});
        }

        results.push({ ticket: ticketStr, status: 'CLOSED', id: trade._id });
        processedCount++;
      } else if (isModify) {
        if (trade && trade.status === 'OPEN') {
          if (stopLoss && trade.risk?.currentStopLoss !== stopLoss) {
            trade.risk = trade.risk || {};
            trade.risk.currentStopLoss = stopLoss;
            trade.markModified('risk');
          }
          if (takeProfit && trade.risk?.plannedTarget !== takeProfit) {
            trade.risk = trade.risk || {};
            trade.risk.plannedTarget = takeProfit;
            trade.markModified('risk');
          }
          await trade.save();
          results.push({ ticket: ticketStr, status: 'MODIFIED', id: trade._id });
          processedCount++;
        }
      } else {
        // OPEN Position
        if (trade && trade.status === 'OPEN') {
          if (stopLoss && trade.risk?.currentStopLoss !== stopLoss) {
            trade.risk = trade.risk || {};
            trade.risk.currentStopLoss = stopLoss;
            trade.markModified('risk');
            await trade.save();
          }
          results.push({ ticket: ticketStr, status: 'ALREADY_OPEN', id: trade._id });
          processedCount++;
        } else if (!trade) {
          let instrument = await Instrument.findOne({ userId: account.userId, symbol });
          if (!instrument) {
            instrument = await Instrument.create({
              userId: account.userId,
              symbol,
              displayName: spec.displayName,
              assetClass: spec.assetClass,
              exchange: spec.exchange,
              marketSegment: spec.marketSegment,
              quoteCurrency: account.baseCurrency || 'USD',
              contractMultiplier: spec.multiplier,
              lotSize: spec.lotSize,
              tickSize: spec.tickSize,
              quantityIncrement: spec.lotSize,
              pricePrecision: 2,
              isActive: true,
              source: 'AUTO',
            });
          }

          trade = await Trade.create({
            userId: account.userId,
            accountId: account._id,
            instrumentId: instrument._id,
            underlying: symbol,
            symbol,
            tradeTitle: `${symbol} ${direction} (Elefin #${ticketStr})`,
            assetClass: spec.assetClass,
            exchange: spec.exchange,
            marketSegment: spec.marketSegment,
            currency: account.baseCurrency || 'USD',
            direction,
            status: 'OPEN',
            tradeDate: new Date(),
            entryTime: item.open_time ? new Date(item.open_time) : new Date(),
            tags: ['ELEFIN', 'MT5', ticketTag],
            importBatchId: `MT5_${ticketStr}`,
            executionMode: 'ADVANCED',
            simpleExecution: {
              contractMultiplier: spec.multiplier,
              entryPrice,
              quantity: volume,
              brokerage: commission,
              taxes: 0,
              exchangeFees: 0,
              regulatoryFees: 0,
              otherFees: swap,
              explicitAdjustments: 0,
            },
            fills: [
              {
                fillId: `mt5_${ticketStr}_entry`,
                timestamp: item.open_time ? new Date(item.open_time) : new Date(),
                type: 'ENTRY',
                price: entryPrice,
                quantity: volume,
                fee: commission,
              },
            ],
            risk: {
              initialStopLoss: stopLoss,
              currentStopLoss: stopLoss,
              plannedTarget: takeProfit,
              riskRuleViolations: [],
            },
            calculated: {
              averageEntryPrice: entryPrice,
              openQuantity: volume,
              closedQuantity: 0,
              totalCosts: Number((commission + swap).toFixed(2)),
              grossPnL: 0,
              netPnL: 0,
              outcome: 'OPEN',
            },
          });

          const userDoc = await User.findById(account.userId).lean();
          if (userDoc) {
            TelegramAlertService.notifyTradeOpened(userDoc, trade, stopLoss).catch(() => {});
          }

          results.push({ ticket: ticketStr, status: 'OPENED', id: trade._id });
          processedCount++;
        }
      }
    }

    return reply.send({
      ok: true,
      processed: processedCount,
      broker: account.broker,
      results,
      commands: pendingCommands,
    });
  });

  app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', requireAuth);

    const createLoginUrl = async (req: any, reply: any) => {
      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      if (!integration || !integration.appId || !integration.secretKey) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Save your FYERS App ID and Secret Key first.',
          },
        });
      }

      const state = crypto.randomBytes(32).toString('hex');
      integration.oauthStateHash = hashOAuthState(state);
      integration.oauthStateExpiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
      await integration.save();

      const redirectUri = getEffectiveFyersRedirectUri(req);
      const url = FyersService.generateLoginUrl(
        integration.appId,
        redirectUri,
        state
      );

      return reply.send({
        success: true,
        data: {
          url,
          expiresAt: integration.oauthStateExpiresAt.toISOString(),
        },
      });
    };

    // Get broker integration status
    protectedApp.get('/fyers/status', async (req: any, reply) => {
      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      const tokenExpiry = integration?.tokenExpiresAt || integration?.authCodeExpiresAt;
      const isTokenValid = Boolean(
        integration?.accessToken && tokenExpiry && new Date(tokenExpiry) > new Date()
      );

      return reply.send({
        success: true,
        data: {
          broker: 'FYERS',
          status: isTokenValid
            ? 'CONNECTED'
            : integration?.appId
              ? 'IDLE'
              : 'DISABLED',
          isConfigured: Boolean(integration?.appId && integration?.secretKey),
          isConnected: isTokenValid,
          appId: integration?.appId,
          clientId: integration?.clientId,
          hasSecretKey: Boolean(integration?.secretKey),
          hasRefreshToken: Boolean(integration?.refreshToken),
          autoSyncEnabled: integration?.autoSyncEnabled ?? true,
          lastSyncAt: integration?.lastSyncAt?.toISOString(),
          lastFundsSyncAt: integration?.lastFundsSyncAt?.toISOString(),
          fundsSyncError: integration?.fundsSyncError,
          tokenExpiresAt: tokenExpiry?.toISOString(),
          authCodeExpiresAt: tokenExpiry?.toISOString(),
          redirectUri: getEffectiveFyersRedirectUri(req),
          syncHistory: (integration?.syncHistory || []).slice(0, 5),
          architecture: {
            adapterVersion: 'v3-compatible (REST / Real-Time)',
            normalizedModel: 'NormalizedExecution',
            supportedSegments: ['NSE_EQ', 'NSE_FNO', 'MCX'],
            reconciliationSupport: true,
            fundsSyncEnabled: config.fyersFundsSyncEnabled,
            statusMessage: isTokenValid
              ? 'FYERS live synchronization is active. Trades will be matched via FIFO.'
              : 'FYERS credentials configured. Click Connect to authorize for the trading day.',
          },
        },
      });
    });

    // Save FYERS app credentials (App ID & Secret Key). Secrets are encrypted at rest.
    protectedApp.post('/fyers/config', async (req: any, reply) => {
      const { appId, secretKey, autoSyncEnabled } = req.body || {};
      if (!appId || typeof appId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CONFIG', message: 'App ID is required' },
        });
      }

      const existing = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      const normalizedAppId = appId.trim();
      const normalizedSecret =
        typeof secretKey === 'string' && secretKey.trim() ? secretKey.trim() : '';
      const appIdChanged = Boolean(existing?.appId && existing.appId !== normalizedAppId);

      if (appIdChanged && !normalizedSecret) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SECRET_REQUIRED',
            message: 'Enter the FYERS Secret Key again when changing the App ID.',
          },
        });
      }

      const updateData: any = {
        appId: normalizedAppId,
        fundsSyncError: undefined,
      };

      const credentialsChanged = !existing || appIdChanged || Boolean(normalizedSecret);

      if (normalizedSecret) {
        updateData.secretKey = encryptSecret(normalizedSecret);
      }
      if (typeof autoSyncEnabled === 'boolean') {
        updateData.autoSyncEnabled = autoSyncEnabled;
      }
      if (credentialsChanged) {
        updateData.status = 'IDLE';
        updateData.accessToken = null;
        updateData.refreshToken = null;
        updateData.tokenExpiresAt = null;
        updateData.authCodeExpiresAt = null;
        updateData.oauthStateHash = null;
        updateData.oauthStateExpiresAt = null;
      }

      const integration = await BrokerIntegration.findOneAndUpdate(
        { userId: req.user.id, broker: 'FYERS' },
        { $set: updateData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return reply.send({
        success: true,
        data: {
          broker: 'FYERS',
          appId: integration.appId,
          clientId: integration.clientId,
          hasSecretKey: Boolean(integration.secretKey),
          status: integration.status,
          autoSyncEnabled: integration.autoSyncEnabled,
        },
      });
    });

    // Generate a short-lived FYERS OAuth login URL
    protectedApp.post('/fyers/connect', createLoginUrl);
    protectedApp.get('/fyers/login-url', createLoginUrl);

    // Manually trigger FYERS tradebook and funds synchronization
    protectedApp.post('/fyers/sync', async (req: any, reply) => {
      try {
        const tradeResult = await FyersService.syncTradesForUser(req.user.id);
        let fundsResult: any = null;
        if (config.fyersFundsSyncEnabled) {
          try {
            fundsResult = await FyersService.syncFundsForUser(req.user.id);
          } catch (fundsErr: any) {
            req.log.warn({ fundsErr }, 'Funds sync failed during FYERS manual sync');
          }
        }

        const balanceMsg = fundsResult?.brokerBalance != null
          ? ` and live balance (₹${fundsResult.brokerBalance.toFixed(2)})`
          : '';
        const backfillMsg = tradeResult.backfilledClosedTradesCount
          ? ` (${tradeResult.backfilledClosedTradesCount} closed trade${tradeResult.backfilledClosedTradesCount > 1 ? 's' : ''} auto-backfilled with excursion & setup)`
          : '';

        return reply.send({
          success: true,
          message: `Synchronized ${tradeResult.syncedTradesCount} new trades${balanceMsg}${backfillMsg} from FYERS.`,
          data: {
            ...tradeResult,
            funds: fundsResult,
          },
        });
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SYNC_ERROR',
            message: err.message || 'Failed to synchronize with FYERS.',
          },
        });
      }
    });

    // Re-run matching for same-day trades that have no stop loss against current-day FYERS orderbook
    protectedApp.post('/fyers/sl-backfill', async (req: any, reply) => {
      try {
        const isDryRun = req.body?.dryRun !== false;
        const result = await FyersService.backfillSLFromOrderbook(req.user.id, {
          dryRun: isDryRun,
          tradeIds: req.body?.tradeIds,
        });

        return reply.send({
          success: true,
          message: `${isDryRun ? '[DRY RUN] ' : ''}Matched SL for ${result.matchedCount} trades (${result.ambiguousCount} ambiguous, ${result.skippedCount} skipped)`,
          data: result,
        });
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SL_BACKFILL_ERROR',
            message: err.message || 'Failed to backfill stop losses from FYERS orderbook.',
          },
        });
      }
    });

    // Batch process PENDING closed trades for excursion analytics
    protectedApp.post('/fyers/excursion-backfill', async (req: any, reply) => {
      const parsed = excursionBackfillSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid backfill parameters',
            details: parsed.error.format(),
          },
        });
      }

      const requestedProvider = parsed.data.provider || 'AUTO';

      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });
      const tokenExpiry = integration?.tokenExpiresAt || integration?.authCodeExpiresAt;
      const isFyersValid = Boolean(
        integration?.accessToken && tokenExpiry && new Date(tokenExpiry) > new Date()
      );

      const angelOneDoc = await MarketDataIntegration.findOne({
        userId: req.user.id,
        provider: 'ANGEL_ONE',
      });
      const isAngelOneValid = Boolean(
        angelOneDoc?.tokenExpiresAt && new Date(angelOneDoc.tokenExpiresAt) > new Date()
      );

      if (requestedProvider === 'ANGEL_ONE' && !isAngelOneValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'MARKET_DATA_NOT_CONNECTED',
            message:
              'Active Angel One market data session is required. Please connect Angel One in Settings.',
          },
        });
      }

      if (requestedProvider === 'AUTO' && !isFyersValid && !isAngelOneValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'BROKER_NOT_CONNECTED',
            message:
              'Active market data session (FYERS or Angel One) is required. Please reconnect in Settings.',
          },
        });
      }

      try {
        const result = await FyersService.batchBackfillExcursion(req.user.id, parsed.data);
        return reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'BACKFILL_FAILED',
            message: err.message || 'Excursion backfill failed',
          },
        });
      }
    });

    // Disconnect FYERS session without deleting app credentials.
    protectedApp.post('/fyers/disconnect', async (req: any, reply) => {
      await BrokerIntegration.findOneAndUpdate(
        { userId: req.user.id, broker: 'FYERS' },
        {
          $set: {
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            authCodeExpiresAt: null,
            oauthStateHash: null,
            oauthStateExpiresAt: null,
            status: 'IDLE',
            fundsSyncError: null,
          },
        }
      );

      return reply.send({
        success: true,
        message: 'FYERS session disconnected.',
      });
    });
  });
};
