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
import { sanitizeTradeFills } from '@tradevault/financial-engine';
import { InstrumentService } from '../services/instrument.service.js';
import { AccountService } from '../services/account.service.js';
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

  function computeMt5LiveExcursion(params: {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    initialStopLoss?: number;
    volume: number;
    contractMultiplier: number;
    mfePrice?: number;
    maePrice?: number;
    peakProfit?: number;
    maxDrawdown?: number;
    netPnL: number;
    openTime: Date;
    closeTime: Date;
  }): any {
    const {
      direction,
      entryPrice,
      exitPrice,
      initialStopLoss,
      volume,
      contractMultiplier,
      mfePrice,
      maePrice,
      peakProfit,
      maxDrawdown,
      netPnL,
      openTime,
      closeTime,
    } = params;

    const mult = contractMultiplier || 1;
    const qty = volume || 0.01;
    const valuePerPoint = qty * mult;

    let mfePoints = 0;
    let maePoints = 0;

    if (direction === 'LONG') {
      if (typeof mfePrice === 'number' && mfePrice > 0) {
        mfePoints = Math.max(0, mfePrice - entryPrice);
      } else if (typeof peakProfit === 'number' && valuePerPoint > 0) {
        mfePoints = Math.max(0, peakProfit / valuePerPoint);
      } else {
        mfePoints = Math.max(0, exitPrice - entryPrice);
      }

      if (typeof maePrice === 'number' && maePrice > 0) {
        maePoints = Math.max(0, entryPrice - maePrice);
      } else if (typeof maxDrawdown === 'number' && valuePerPoint > 0) {
        maePoints = Math.max(0, Math.abs(Math.min(0, maxDrawdown)) / valuePerPoint);
      } else {
        maePoints = Math.max(0, entryPrice - exitPrice);
      }
    } else {
      // SHORT
      if (typeof mfePrice === 'number' && mfePrice > 0) {
        mfePoints = Math.max(0, entryPrice - mfePrice);
      } else if (typeof peakProfit === 'number' && valuePerPoint > 0) {
        mfePoints = Math.max(0, peakProfit / valuePerPoint);
      } else {
        mfePoints = Math.max(0, entryPrice - exitPrice);
      }

      if (typeof maePrice === 'number' && maePrice > 0) {
        maePoints = Math.max(0, maePrice - entryPrice);
      } else if (typeof maxDrawdown === 'number' && valuePerPoint > 0) {
        maePoints = Math.max(0, Math.abs(Math.min(0, maxDrawdown)) / valuePerPoint);
      } else {
        maePoints = Math.max(0, exitPrice - entryPrice);
      }
    }

    // Ensure MFE is at least the gain if exit is profitable
    const realizedPts = direction === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
    if (realizedPts > 0 && mfePoints < realizedPts) {
      mfePoints = realizedPts;
    }
    // Ensure MAE is at least the adverse loss if exit is negative
    if (realizedPts < 0 && maePoints < Math.abs(realizedPts)) {
      maePoints = Math.abs(realizedPts);
    }

    const mfeAmount = Number((mfePoints * valuePerPoint).toFixed(2));
    const maeAmount = Number((maePoints * valuePerPoint).toFixed(2));

    const stopDist = initialStopLoss && initialStopLoss > 0 ? Math.abs(entryPrice - initialStopLoss) : 0;
    const mfeR = stopDist > 0 ? Number((mfePoints / stopDist).toFixed(2)) : undefined;
    const maeR = stopDist > 0 ? Number((maePoints / stopDist).toFixed(2)) : undefined;

    const exitEfficiency = mfePoints > 0 ? Number(Math.min(1, Math.max(0, realizedPts / mfePoints)).toFixed(4)) : null;
    const stopHit = stopDist > 0 && maePoints >= (stopDist - 0.05);

    const excursionFlags: string[] = [];
    if (mfeR !== undefined && mfeR >= 1.0 && netPnL < 0) {
      excursionFlags.push('GAVE_BACK_PROFIT');
    }
    if (mfeR !== undefined && mfeR >= 2.0 && exitEfficiency !== null && exitEfficiency < 0.3) {
      excursionFlags.push('RUNNER_LEFT_ON_TABLE');
    }

    const durationMs = Math.max(60000, closeTime.getTime() - openTime.getTime());
    const holdingMins = Math.max(1, Math.round(durationMs / 60000));

    return {
      status: 'COMPUTED',
      computedAt: new Date(),
      source: 'MT5_LIVE',
      provider: 'MT5_LIVE',
      isUnderlyingFallback: false,
      resolution: '1',
      isLowResolution: false,
      excursionVersion: 2,
      thresholdVersion: 'v2',
      maePoints: Number(maePoints.toFixed(2)),
      mfePoints: Number(mfePoints.toFixed(2)),
      maeAmount,
      mfeAmount,
      maeR,
      mfeR,
      exitEfficiency,
      stopEfficiency: 1,
      entryQualityScore: maePoints === 0 ? 100 : Math.max(0, Math.round((1 - maePoints / (stopDist || 1)) * 100)),
      maeBeforeMfe: false,
      timeOrdering: 'SIMULTANEOUS',
      stopHit,
      reversedAfterStopHit: false,
      timeToMfeMinutes: Math.round(holdingMins * 0.6),
      timeToMaeMinutes: Math.round(holdingMins * 0.4),
      candleCount: Math.max(1, holdingMins),
      excursionFlags,
      warnings: [],
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
        $or: [
          { broker: /elefin/i },
          { name: /elefin/i },
          { broker: /mt5/i },
          { name: /mt5/i },
          { 'profile.executionAdapterKey': 'ELEFIN_MT5' },
        ],
        status: 'ACTIVE',
      });
    }

    if (!account) {
      req.log.warn('[MT5Webhook] Target trading account not found for token: %s', rawToken);
      return reply.status(404).send({ success: false, error: 'Trading account not found' });
    }

    // Record heartbeat for MT5 Bridge EA connection status
    Mt5CommandService.recordHeartbeat(account._id);

    // Record incoming real-time market quotes from MT5 EA
    if (Array.isArray(req.body?.quotes)) {
      for (const q of req.body.quotes) {
        if (q && q.symbol) {
          Mt5CommandService.recordQuote(account._id, {
            symbol: q.symbol,
            bid: Number(q.bid) || 0,
            ask: Number(q.ask) || 0,
            ltp: Number(q.ltp) || Number(q.bid) || Number(q.ask) || 0,
            timestamp: q.time ? new Date(q.time) : new Date(),
          });
        }
      }
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

    // Reconcile open MT5 trades if the EA provides an authoritative positions snapshot
    if (Array.isArray(req.body?.positions)) {
      const activeTicketSet = new Set(
        rawItems
          .map((item) => String(item.ticket || item.id || item.ticket_id || item.order || '').trim())
          .filter(Boolean)
      );

      const orphanedOpenTrades = await Trade.find({
        userId: account.userId,
        accountId: account._id,
        status: 'OPEN',
        tags: 'MT5',
      });

      for (const openTrade of orphanedOpenTrades) {
        const ticketTag = (openTrade.tags || []).find((t: string) => t.startsWith('MT5_TICKET_'));
        const tradeTicket = ticketTag ? ticketTag.replace('MT5_TICKET_', '').trim() : '';

        if (tradeTicket && !activeTicketSet.has(tradeTicket)) {
          // This trade was closed on MT5! Reconcile and close it cleanly
          const exitPrice = openTrade.calculated?.liveMfeSummary?.peakLtp || openTrade.simpleExecution?.entryPrice || 0;
          openTrade.status = 'CLOSED';
          openTrade.exitTime = new Date();
          openTrade.executionMode = 'SIMPLE';
          if (openTrade.simpleExecution && (!openTrade.simpleExecution.exitPrice || openTrade.simpleExecution.exitPrice === 0)) {
            openTrade.simpleExecution.exitPrice = exitPrice;
          }
          if (Array.isArray(openTrade.fills) && openTrade.fills.length > 0) {
            const hasExit = openTrade.fills.some((f: any) => String(f.type || '').toUpperCase() === 'EXIT');
            if (!hasExit) {
              const totalEntry = openTrade.fills
                .filter((f: any) => String(f.type || '').toUpperCase() === 'ENTRY')
                .reduce((sum: number, f: any) => sum + (Number(f.quantity) || 0), 0);
              openTrade.fills.push({
                fillId: `mt5_${tradeTicket}_exit_auto`,
                timestamp: openTrade.exitTime,
                type: 'EXIT',
                price: exitPrice,
                quantity: totalEntry || openTrade.simpleExecution?.quantity || 0.01,
                fee: 0,
              } as any);
              openTrade.markModified('fills');
            }
          }
          openTrade.calculated = InstrumentService.computeTradeCalculations({
            ...openTrade.toObject(),
            broker: account.broker,
            positionModel: 'HEDGING',
          });
          if (openTrade.calculated?.excursion?.status === 'PENDING') {
            const peakPnl = openTrade.calculated?.liveMfeSummary?.peakFloatingNetPnL || 0;
            const livePts = openTrade.calculated?.liveMfeSummary?.peakLtp
              ? Math.abs(openTrade.calculated.liveMfeSummary.peakLtp - (openTrade.simpleExecution?.entryPrice || 0))
              : 0;
            openTrade.calculated.excursion = {
              status: 'COMPUTED',
              computedAt: new Date(),
              source: 'MT5_LIVE',
              provider: 'MT5_LIVE',
              isUnderlyingFallback: false,
              resolution: '1',
              isLowResolution: false,
              excursionVersion: 2,
              thresholdVersion: 'v2',
              mfePoints: livePts,
              maePoints: 0,
              mfeAmount: peakPnl,
              maeAmount: 0,
              mfeR: 0,
              maeR: 0,
              exitEfficiency: 1,
              stopEfficiency: 1,
              entryQualityScore: 1,
              maeBeforeMfe: false,
              timeOrdering: 'SIMULTANEOUS',
              stopHit: false,
              reversedAfterStopHit: false,
              candleCount: 1,
              excursionFlags: [],
              warnings: [],
            };
          }
          openTrade.markModified('calculated');
          openTrade.markModified('simpleExecution');
          await openTrade.save();
        }
      }
    }

    if (rawItems.length === 0) {
      return reply.send({ ok: true, processed: 0, message: 'No positions in payload', commands: pendingCommands });
    }

    let processedCount = 0;
    const results: any[] = [];

    for (const item of rawItems) {
      const ticketStr = String(item.ticket || item.id || item.ticket_id || item.order || '').trim();
      const dealIdStr = String(item.deal_id || item.deal_ticket || item.dealTicket || '').trim();
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

      const curPrice = parseFloat(item.cur_price ?? item.current_price ?? item.price_current ?? 0) || 0;
      const bid = parseFloat(item.bid ?? 0) || 0;
      const ask = parseFloat(item.ask ?? 0) || 0;

      if (ticketStr && curPrice > 0) {
        Mt5CommandService.recordPositionQuote(ticketStr, {
          curPrice,
          bid,
          ask,
          profit,
          symbol,
          accountId: account._id,
          timestamp: item.open_time ? new Date(item.open_time) : new Date(),
        });
      }

      if (symbol && (curPrice > 0 || bid > 0)) {
        Mt5CommandService.recordQuote(account._id, {
          symbol,
          bid: bid || curPrice,
          ask: ask || curPrice,
          ltp: curPrice || bid || ask,
          timestamp: new Date(),
        });
      }

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
        const exitPriceFinal = closePrice || entryPrice;
        const targetExitFillId = dealIdStr ? `mt5_deal_${dealIdStr}` : `mt5_${ticketStr}_exit`;

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

          const priceDiff = direction === 'LONG' ? exitPriceFinal - entryPrice : entryPrice - exitPriceFinal;
          const grossPnL = profit !== 0 ? profit : Number((priceDiff * volume * spec.multiplier).toFixed(2));
          const totalCosts = Number((commission + swap).toFixed(2));
          const netPnL = Number((grossPnL - totalCosts).toFixed(2));

          const rawMfePrice = item.mfe_price !== undefined ? parseFloat(item.mfe_price) : undefined;
          const rawMaePrice = item.mae_price !== undefined ? parseFloat(item.mae_price) : undefined;
          const rawPeakProfit = item.peak_profit !== undefined ? parseFloat(item.peak_profit) : (item.mfe_pnl !== undefined ? parseFloat(item.mfe_pnl) : undefined);
          const rawMaxDrawdown = item.max_drawdown !== undefined ? parseFloat(item.max_drawdown) : (item.mae_pnl !== undefined ? parseFloat(item.mae_pnl) : undefined);

          const openDate = item.open_time ? new Date(item.open_time) : new Date();
          const closeDate = item.close_time ? new Date(item.close_time) : new Date();

          const mt5Excursion = computeMt5LiveExcursion({
            direction,
            entryPrice,
            exitPrice: exitPriceFinal,
            initialStopLoss: stopLoss,
            volume,
            contractMultiplier: spec.multiplier,
            mfePrice: Number.isFinite(rawMfePrice) ? rawMfePrice : undefined,
            maePrice: Number.isFinite(rawMaePrice) ? rawMaePrice : undefined,
            peakProfit: Number.isFinite(rawPeakProfit) ? rawPeakProfit : undefined,
            maxDrawdown: Number.isFinite(rawMaxDrawdown) ? rawMaxDrawdown : undefined,
            netPnL,
            openTime: openDate,
            closeTime: closeDate,
          });

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
            entryTime: openDate,
            exitTime: closeDate,
            tags: ['ELEFIN', 'MT5', ticketTag],
            importBatchId: `MT5_${ticketStr}`,
            executionMode: 'SIMPLE',
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
                timestamp: openDate,
                type: 'ENTRY',
                price: entryPrice,
                quantity: volume,
                fee: commission,
              },
              {
                fillId: targetExitFillId,
                timestamp: closeDate,
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
              excursion: mt5Excursion,
            },
          });
        } else {
          // Existing trade closed
          // 1. Sanitize any existing fills in case the trade already has duplicates from earlier syncs
          const currentFills = Array.isArray(trade.fills) ? trade.fills : [];
          const sanitizedCurrent = sanitizeTradeFills(currentFills);
          if (sanitizedCurrent.hasChanges) {
            trade.fills = sanitizedCurrent.fills as any;
            trade.markModified('fills');
          }

          // 2. Check if this specific exit fill was already recorded
          const alreadyHasThisFill = (trade.fills || []).some(
            (f: any) =>
              f.fillId === targetExitFillId ||
              (dealIdStr && f.fillId === `mt5_${ticketStr}_exit_${dealIdStr}`) ||
              (!dealIdStr && f.fillId === `mt5_${ticketStr}_exit`)
          );

          const totalEntryQty = (trade.fills || [])
            .filter((f: any) => f.type === 'ENTRY')
            .reduce((sum: number, f: any) => sum + (Number(f.quantity) || 0), 0);
          const totalExitQty = (trade.fills || [])
            .filter((f: any) => f.type === 'EXIT')
            .reduce((sum: number, f: any) => sum + (Number(f.quantity) || 0), 0);

          const remainingOpenQty = Math.max(0, totalEntryQty - totalExitQty);

          const isDuplicate =
            alreadyHasThisFill ||
            (trade.status === 'CLOSED' && totalExitQty >= totalEntryQty) ||
            remainingOpenQty <= 0;

          if (isDuplicate) {
            // Already closed or duplicate exit webhook: do NOT push duplicate fills
            trade.status = 'CLOSED';
            trade.executionMode = 'SIMPLE';
            if (item.close_time) trade.exitTime = new Date(item.close_time);
            if (trade.simpleExecution && exitPriceFinal > 0) {
              trade.simpleExecution.exitPrice = exitPriceFinal;
              if (commission > 0) trade.simpleExecution.brokerage = commission;
              if (swap > 0) trade.simpleExecution.otherFees = swap;
            }
            if (Array.isArray(trade.fills) && trade.fills.length > 0) {
              const hasExit = trade.fills.some((f: any) => String(f.type || '').toUpperCase() === 'EXIT');
              if (!hasExit) {
                const totalEntry = trade.fills
                  .filter((f: any) => String(f.type || '').toUpperCase() === 'ENTRY')
                  .reduce((sum: number, f: any) => sum + (Number(f.quantity) || 0), 0);
                trade.fills.push({
                  fillId: targetExitFillId,
                  timestamp: trade.exitTime || new Date(),
                  type: 'EXIT',
                  price: exitPriceFinal,
                  quantity: totalEntry || trade.simpleExecution?.quantity || volume,
                  fee: 0,
                } as any);
                trade.markModified('fills');
              }
            }
            const recalced = InstrumentService.computeTradeCalculations({
              ...trade.toObject(),
              broker: account.broker,
              positionModel: 'HEDGING',
            });
            trade.calculated = recalced;
            trade.markModified('calculated');
            trade.markModified('simpleExecution');
            await trade.save();

            results.push({ ticket: ticketStr, status: 'ALREADY_CLOSED', id: trade._id });
            processedCount++;
            continue;
          }

          // Legitimate close or partial close
          const fillQty = Math.min(volume, remainingOpenQty > 0 ? remainingOpenQty : volume);
          const isFullyClosed = totalExitQty + fillQty >= totalEntryQty;

          trade.status = isFullyClosed ? 'CLOSED' : 'OPEN';
          trade.exitTime = item.close_time ? new Date(item.close_time) : new Date();
          if (trade.simpleExecution) {
            trade.simpleExecution.exitPrice = exitPriceFinal;
            if (commission > 0) trade.simpleExecution.brokerage = commission;
            if (swap > 0) trade.simpleExecution.otherFees = swap;
          }

          trade.fills.push({
            fillId: targetExitFillId,
            timestamp: trade.exitTime,
            type: 'EXIT',
            price: exitPriceFinal,
            quantity: fillQty,
            fee: commission > 0 ? Number((commission / 2).toFixed(2)) : 0,
          } as any);

          const sanitizedAfter = sanitizeTradeFills(trade.fills);
          trade.fills = sanitizedAfter.fills as any;
          trade.markModified('fills');

          const rawMfePrice = item.mfe_price !== undefined ? parseFloat(item.mfe_price) : undefined;
          const rawMaePrice = item.mae_price !== undefined ? parseFloat(item.mae_price) : undefined;
          const rawPeakProfit = item.peak_profit !== undefined ? parseFloat(item.peak_profit) : (item.mfe_pnl !== undefined ? parseFloat(item.mfe_pnl) : undefined);
          const rawMaxDrawdown = item.max_drawdown !== undefined ? parseFloat(item.max_drawdown) : (item.mae_pnl !== undefined ? parseFloat(item.mae_pnl) : undefined);

          const openDate = trade.entryTime || (item.open_time ? new Date(item.open_time) : new Date());
          const closeDate = trade.exitTime || (item.close_time ? new Date(item.close_time) : new Date());

          const prevExcursion = trade.calculated?.excursion;
          const recalced = InstrumentService.computeTradeCalculations({
            ...trade.toObject(),
            broker: account.broker,
            positionModel: 'HEDGING',
          });

          const mt5Excursion = computeMt5LiveExcursion({
            direction: trade.direction,
            entryPrice: trade.simpleExecution?.entryPrice || entryPrice,
            exitPrice: exitPriceFinal,
            initialStopLoss: trade.risk?.initialStopLoss || stopLoss,
            volume: trade.simpleExecution?.quantity || volume,
            contractMultiplier: trade.simpleExecution?.contractMultiplier || spec.multiplier,
            mfePrice: Number.isFinite(rawMfePrice) ? rawMfePrice : undefined,
            maePrice: Number.isFinite(rawMaePrice) ? rawMaePrice : undefined,
            peakProfit: Number.isFinite(rawPeakProfit) ? rawPeakProfit : undefined,
            maxDrawdown: Number.isFinite(rawMaxDrawdown) ? rawMaxDrawdown : undefined,
            netPnL: recalced.netPnL,
            openTime: openDate,
            closeTime: closeDate,
          });

          trade.calculated = {
            ...recalced,
            excursion: (rawMfePrice !== undefined || rawMaePrice !== undefined || rawPeakProfit !== undefined || !prevExcursion || prevExcursion.status !== 'COMPUTED')
              ? mt5Excursion
              : prevExcursion,
          };
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
          let updated = false;
          if (stopLoss && trade.risk?.currentStopLoss !== stopLoss) {
            trade.risk = trade.risk || {};
            trade.risk.currentStopLoss = stopLoss;
            trade.markModified('risk');
            updated = true;
          }
          if (item.mfe_price !== undefined || item.peak_profit !== undefined) {
            trade.calculated = trade.calculated || ({} as any);
            const peakLtp = parseFloat(item.mfe_price);
            const peakPnL = parseFloat(item.peak_profit);
            trade.calculated.liveMfeSummary = {
              peakLtp: Number.isFinite(peakLtp) ? peakLtp : trade.calculated?.liveMfeSummary?.peakLtp,
              peakFloatingNetPnL: Number.isFinite(peakPnL) ? peakPnL : trade.calculated?.liveMfeSummary?.peakFloatingNetPnL,
              peakTimestamp: new Date(),
            };
            trade.markModified('calculated');
            updated = true;
          }
          if (updated) {
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
            executionMode: 'SIMPLE',
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

    if (processedCount > 0) {
      await AccountService.recalculateAccountBalances(account._id, account.userId).catch(() => {});
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

    const userHasFyers = async (userId: string): Promise<boolean> => {
      const accs = await TradingAccount.find({ userId }).lean();
      return accs.some(
        (a) =>
          (a.broker || '').toUpperCase() === 'FYERS' ||
          a.profile?.executionAdapterKey === 'FYERS'
      );
    };

    const createLoginUrl = async (req: any, reply: any) => {
      if (!(await userHasFyers(req.user.id))) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'CAPABILITY_NOT_SUPPORTED',
            message: 'No active trading account is configured with the FYERS execution adapter.',
          },
        });
      }

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
      if (!(await userHasFyers(req.user.id))) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'CAPABILITY_NOT_SUPPORTED',
            message: 'No active trading account is configured with the FYERS execution adapter.',
          },
        });
      }
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
          ? ` and live balance (${fundsResult.brokerBalance.toFixed(2)})`
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
      if (!(await userHasFyers(req.user.id))) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'CAPABILITY_NOT_SUPPORTED',
            message: 'No active trading account is configured with the FYERS execution adapter.',
          },
        });
      }
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
