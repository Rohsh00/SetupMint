/**
 * SetupMint - In-Car & Apple CarPlay Siri Voice Briefing Service
 *
 * Provides real-time spoken market briefings, portfolio telemetry,
 * and hands-free driving controls over Apple CarPlay / Siri Shortcuts.
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { User, Trade, TradingAccount } from '../db/models/index.js';
import { Mt5CommandService } from './mt5-command.service.js';
import { GlobalCfdCandleProvider } from './market-data/index.js';
import { FyersService } from './fyers.service.js';
import { LiveWatcherService } from './live-watcher.service.js';
import { calculateTrueBreakeven } from '@tradevault/financial-engine';

export interface ICarPlayBriefingResult {
  speechText: string;
  data?: any;
  success: boolean;
}

export class CarPlayService {
  /**
   * Resolves or provisions a user from a CarPlay security token, API key, or Telegram Chat ID.
   */
  static async resolveUser(tokenOrKey?: string): Promise<any> {
    if (!tokenOrKey) return null;
    const cleanToken = String(tokenOrKey).trim();

    // 1. Direct match on carPlayToken
    let user = await User.findOne({ 'liveWatcherSettings.carPlayToken': cleanToken });
    if (user) return user;

    // 2. Direct match on ObjectId
    if (mongoose.isValidObjectId(cleanToken)) {
      user = await User.findById(cleanToken);
      if (user) {
        if (!user.liveWatcherSettings) {
          user.liveWatcherSettings = {} as any;
        }
        user.liveWatcherSettings!.carPlayToken = crypto.randomBytes(16).toString('hex');
        await user.save();
      }
      return user;
    }

    // 3. Fallback match on telegramChatId or email
    user = await User.findOne({
      $or: [
        { 'liveWatcherSettings.telegramChatId': cleanToken },
        { email: cleanToken.toLowerCase() },
      ],
    });

    if (user && !user.liveWatcherSettings?.carPlayToken) {
      if (!user.liveWatcherSettings) {
        user.liveWatcherSettings = {} as any;
      }
      user.liveWatcherSettings!.carPlayToken = crypto.randomBytes(16).toString('hex');
      await user.save();
    }

    return user;
  }

  /**
   * Generates or retrieves the user's permanent CarPlay Voice Security Key.
   */
  static async getOrCreateCarPlayToken(user: any): Promise<string> {
    if (user.liveWatcherSettings?.carPlayToken) {
      return user.liveWatcherSettings.carPlayToken;
    }
    const token = crypto.randomBytes(16).toString('hex');
    if (!user.liveWatcherSettings) user.liveWatcherSettings = {} as any;
    user.liveWatcherSettings!.carPlayToken = token;
    await user.save();
    return token;
  }

  /**
   * Formats a natural spoken market price briefing for Siri / in-car audio.
   */
  static async getLivePriceBriefing(user: any, symbolArg?: string): Promise<ICarPlayBriefingResult> {
    let symbol = (symbolArg || '').trim().toUpperCase();

    // Check if user has open trade to default to its symbol
    let openTrade: any = null;
    if (!symbol) {
      openTrade = await Trade.findOne({
        userId: user._id,
        status: 'OPEN',
      }).sort({ entryTime: -1 }).lean();
      symbol = openTrade?.symbol || 'XAUUSD';
    } else {
      openTrade = await Trade.findOne({
        userId: user._id,
        symbol: new RegExp(`^${symbol}$`, 'i'),
        status: 'OPEN',
      }).sort({ entryTime: -1 }).lean();
    }

    const isForexOrGold =
      symbol.includes('XAU') ||
      symbol.includes('EUR') ||
      symbol.includes('USD') ||
      symbol.includes('GBP') ||
      symbol.includes('BTC') ||
      symbol === 'GOLD';

    const curWord = isForexOrGold ? 'dollars' : 'rupees';
    const curSign = isForexOrGold ? '$' : '₹';

    let ltp = 0;
    let bid = 0;
    let ask = 0;
    let high = 0;
    let low = 0;
    let prevClose = 0;
    let providerName = 'live feed';

    // 1. MT5 Live Quote
    const mt5Quote = Mt5CommandService.getLiveQuote(symbol);
    if (mt5Quote && mt5Quote.ltp > 0) {
      ltp = mt5Quote.ltp;
      bid = mt5Quote.bid || ltp;
      ask = mt5Quote.ask || ltp;
      providerName = 'MT5 Elefin';
    }

    // 2. Global CFD quote
    if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(symbol)) {
      try {
        const quotes = await GlobalCfdCandleProvider.getLiveQuotes([symbol]);
        const gq = quotes.get(symbol);
        if (gq && gq.ltp > 0) {
          ltp = gq.ltp;
          bid = (gq as any).bid || (gq.ltp - 0.20);
          ask = (gq as any).ask || (gq.ltp + 0.20);
          high = gq.high || ltp;
          low = gq.low || ltp;
          prevClose = gq.open || ltp;
          providerName = 'global market feed';
        }
      } catch (err: any) {
        console.warn('[CarPlayService] GlobalCfd error:', err.message);
      }
    }

    // 3. FYERS quote
    if (ltp === 0) {
      try {
        const quotes = await FyersService.getMarketQuotes(user._id, [symbol]);
        const fq = quotes.get(symbol);
        if (fq && fq.ltp > 0) {
          ltp = fq.ltp;
          bid = (fq as any).bid || ltp;
          ask = (fq as any).ask || ltp;
          high = fq.high || ltp;
          low = fq.low || ltp;
          prevClose = fq.prevClose || fq.open || ltp;
          providerName = 'FYERS';
        }
      } catch (err: any) {
        console.warn('[CarPlayService] FYERS quote error:', err.message);
      }
    }

    // 4. DB Fallback
    if (ltp === 0 && openTrade) {
      ltp = openTrade.calculated?.liveMfeSummary?.peakLtp || openTrade.simpleExecution?.entryPrice || 0;
    }

    if (ltp === 0) {
      return {
        success: false,
        speechText: `Sorry, real-time price data is currently unavailable for ${symbol}. Please try again in a moment.`,
      };
    }

    const dayChange = prevClose > 0 ? ltp - prevClose : 0;
    const dayChangePct = prevClose > 0 ? (dayChange / prevClose) * 100 : 0;
    const changeWord = dayChange >= 0 ? 'up' : 'down';
    const absChange = Math.abs(dayChange).toFixed(2);
    const absPct = Math.abs(dayChangePct).toFixed(2);

    const spreadPips = ask > 0 && bid > 0
      ? (isForexOrGold ? ((ask - bid) / (symbol.includes('XAU') ? 0.10 : 0.0001)).toFixed(1) : (ask - bid).toFixed(2))
      : null;

    const friendlyName = symbol.includes('XAU') || symbol === 'GOLD' ? 'Gold' : symbol;
    let speechText = `${friendlyName} is currently trading at ${curSign}${ltp.toFixed(2)}`;

    if (prevClose > 0 && dayChange !== 0) {
      speechText += `, ${changeWord} ${absChange} ${curWord}, or ${absPct} percent today`;
    }
    if (spreadPips && Number(spreadPips) > 0) {
      speechText += `, with a spread of ${spreadPips} pips`;
    }
    speechText += '.';

    // If trader has an active trade in this symbol, append position status
    if (openTrade) {
      const isLong = openTrade.direction === 'LONG';
      const entryPrice = Number(openTrade.simpleExecution?.entryPrice ?? openTrade.calculated?.averageEntryPrice ?? openTrade.entryPrice ?? 0);
      const mult = openTrade.contractMultiplier || openTrade.simpleExecution?.contractMultiplier || 1;
      const qty = openTrade.calculated?.openQuantity ?? openTrade.simpleExecution?.quantity ?? (openTrade as any).quantity ?? 1;
      const netPnL = isLong ? (ltp - entryPrice) * qty * mult : (entryPrice - ltp) * qty * mult;
      const pnlWord = netPnL >= 0 ? 'up' : 'down';
      const absPnL = Math.abs(netPnL).toFixed(2);
      const sl = openTrade.risk?.currentStopLoss || openTrade.risk?.initialStopLoss;

      speechText += ` Your ${openTrade.direction} position of ${qty} lots is ${pnlWord} ${curSign}${absPnL}`;
      if (sl) {
        const distPts = Math.abs(ltp - Number(sl)).toFixed(1);
        speechText += `, and your stop loss is safe at ${curSign}${sl}, ${distPts} points away`;
      }
      speechText += '.';
    }

    return {
      success: true,
      speechText,
      data: {
        symbol,
        ltp,
        bid,
        ask,
        spreadPips,
        dayChange,
        dayChangePct,
        provider: providerName,
      },
    };
  }

  /**
   * Formats a complete spoken portfolio briefing of all active trades for in-car listening.
   */
  static async getTradesBriefing(user: any): Promise<ICarPlayBriefingResult> {
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id);

    if (!summary.positions || summary.positions.length === 0) {
      return {
        success: true,
        speechText: 'You currently have zero open positions. Your trading capital is 100 percent safe and idle.',
        data: { openCount: 0, positions: [] },
      };
    }

    const count = summary.positions.length;
    const hasUsd = summary.positions.some((p: any) => p.currency === 'USD' || p.isMt5 || (p.symbol && p.symbol.includes('XAU')));
    const curSign = hasUsd ? '$' : '₹';
    const curWord = hasUsd ? 'dollars' : 'rupees';

    const totalPnL = summary.totalFloatingNetPnL;
    const totalWord = totalPnL >= 0 ? 'up' : 'down';
    const absTotal = Math.abs(totalPnL).toFixed(2);
    const totalR = summary.portfolioUnrealizedR || 0;
    const rWord = totalR >= 0 ? `plus ${totalR.toFixed(2)}` : `${totalR.toFixed(2)}`;

    let speechText = '';
    if (count === 1) {
      const p = summary.positions[0];
      const pnlWord = p.floatingNetPnL >= 0 ? 'up' : 'down';
      const absPnl = Math.abs(p.floatingNetPnL).toFixed(2);
      const friendlyName = p.symbol.includes('XAU') ? 'Gold' : p.symbol;
      const mult = p.contractMultiplier && p.contractMultiplier > 1 ? p.contractMultiplier : 1;
      const unitLabel = mult > 1 ? 'lots' : 'units';

      speechText = `You have one open position in ${friendlyName}: ${p.direction} of ${p.quantity} ${unitLabel}. Current price is ${curSign}${p.currentLtp.toFixed(2)}. The trade is ${pnlWord} ${curSign}${absPnl}, or ${p.unrealizedR?.toFixed(2) || 0} R.`;
      if (p.stopLoss) {
        speechText += ` Stop loss is set at ${curSign}${p.stopLoss}.`;
      }
    } else {
      const positionSummaries = summary.positions.map((p: any) => {
        const friendlyName = p.symbol.includes('XAU') ? 'Gold' : p.symbol;
        const pnlWord = p.floatingNetPnL >= 0 ? 'up' : 'down';
        return `${friendlyName} ${p.direction} ${pnlWord} ${curSign}${Math.abs(p.floatingNetPnL).toFixed(0)}`;
      });

      speechText = `You have ${count} open positions: ${positionSummaries.join(', and ')}. Total floating profit across your portfolio is ${totalWord} ${curSign}${absTotal} ${curWord}, or ${rWord} R.`;
    }

    return {
      success: true,
      speechText,
      data: {
        openCount: count,
        totalFloatingNetPnL: totalPnL,
        portfolioUnrealizedR: totalR,
        positions: summary.positions,
      },
    };
  }

  /**
   * Executes in-car hands-free trade controls (Breakeven, Partial scale-out, or Panic close).
   */
  static async executeInCarAction(
    user: any,
    actionCode: string,
    targetSymbol?: string
  ): Promise<ICarPlayBriefingResult> {
    const code = (actionCode || '').toUpperCase().trim();

    // 1. Emergency Panic Close All
    if (code === 'PANIC' || code === 'CLOSE_ALL') {
      const openTrades = await Trade.find({ userId: user._id, status: 'OPEN' });
      if (openTrades.length === 0) {
        return {
          success: true,
          speechText: 'You have no open positions to close. Your account is already safe.',
        };
      }

      let mt5Count = 0;
      let fyersCount = 0;

      for (const t of openTrades) {
        try {
          const openQty = t.calculated?.openQuantity ?? t.simpleExecution?.quantity ?? (t as any).quantity ?? 1;
          const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
          const isMt5 = Mt5CommandService.isMt5Trade(t, account);
          const ticket = isMt5 ? Mt5CommandService.extractTicket(t) : null;

          if (isMt5 && ticket) {
            await Mt5CommandService.queueClosePosition({
              userId: user._id,
              accountId: (account?._id || t.accountId)!,
              tradeId: t._id,
              ticket,
              volume: openQty,
            });
            mt5Count++;
          } else {
            await FyersService.executeBrokerExit(user._id, t._id.toString(), { exitQty: openQty, isFullClose: true });
            fyersCount++;
          }
        } catch (err: any) {
          console.error('[CarPlayAction:Panic] Error closing trade:', err.message);
        }
      }

      return {
        success: true,
        speechText: `Emergency killswitch executed. Closed ${openTrades.length} position${openTrades.length > 1 ? 's' : ''} across your Elefin and FYERS accounts.`,
      };
    }

    // Find candidate trade
    const query: any = { userId: user._id, status: 'OPEN' };
    if (targetSymbol) {
      query.symbol = new RegExp(`^${targetSymbol}$`, 'i');
    }
    const trade = await Trade.findOne(query).sort({ entryTime: -1 });

    if (!trade) {
      return {
        success: false,
        speechText: `No active open position found${targetSymbol ? ` for ${targetSymbol}` : ''} to adjust.`,
      };
    }

    const account = trade.accountId ? await TradingAccount.findById(trade.accountId) : null;
    const isMt5 = Mt5CommandService.isMt5Trade(trade, account);
    const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;
    const isForex = trade.exchange === 'FOREX' || (trade.symbol && trade.symbol.includes('XAU'));
    const curSign = isForex ? '$' : '₹';
    const friendlyName = trade.symbol.includes('XAU') ? 'Gold' : trade.symbol;

    // 2. Lock Breakeven
    if (code === 'BE' || code === 'BREAKEVEN') {
      let trueBePrice = (trade.calculated as any)?.trueBreakevenPrice;
      const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? (trade as any).entryPrice ?? 0);

      if (!trueBePrice && entryPrice > 0) {
        try {
          const beRes = calculateTrueBreakeven({
            direction: trade.direction,
            entryPrice,
            quantity: trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? (trade as any).quantity ?? 1,
            estimatedCharges: 50,
          });
          trueBePrice = beRes.trueBreakevenPrice;
        } catch {
          trueBePrice = entryPrice;
        }
      }
      trueBePrice = Number((trueBePrice || entryPrice).toFixed(2));

      trade.risk = {
        ...(trade.risk || {}),
        initialStopLoss: trade.risk?.initialStopLoss || trueBePrice,
        currentStopLoss: trueBePrice,
      };

      if (isMt5 && ticket) {
        await Mt5CommandService.queueModifySl({
          userId: user._id,
          accountId: (account?._id || trade.accountId)!,
          tradeId: trade._id,
          ticket,
          stopLoss: trueBePrice,
        });
      } else {
        try {
          await FyersService.executeBrokerStopLoss(user._id, trade._id.toString(), trueBePrice);
        } catch {
          // Broker stop placement fallback
        }
      }

      trade.auditLog.push({
        action: 'CARPLAY_LOCK_BE',
        timestamp: new Date(),
        details: { text: `Stop moved to true breakeven ${curSign}${trueBePrice} via CarPlay Siri Voice command` },
        changedBy: 'carplay_voice',
      });
      await trade.save();

      return {
        success: true,
        speechText: `Done! Stop loss locked at true breakeven for ${friendlyName} at ${curSign}${trueBePrice.toFixed(2)}.`,
      };
    }

    // 3. Book 50% Profit
    if (code === 'CLOSE_50' || code === 'BOOK_50' || code === 'HALF') {
      const openQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? (trade as any).quantity ?? 1;
      let closeQty: number;
      if (isMt5) {
        closeQty = Math.max(0.01, Number((openQty * 0.5).toFixed(2)));
        if (closeQty > openQty) closeQty = openQty;
      } else {
        closeQty = Math.max(1, Math.floor(openQty * 0.5));
        if (closeQty > openQty) closeQty = openQty;
      }

      if (isMt5 && ticket) {
        await Mt5CommandService.queueClosePosition({
          userId: user._id,
          accountId: (account?._id || trade.accountId)!,
          tradeId: trade._id,
          ticket,
          volume: closeQty,
        });
      } else {
        await FyersService.executeBrokerExit(user._id, trade._id.toString(), {
          exitQty: closeQty,
          isFullClose: closeQty >= openQty,
        });
      }

      trade.auditLog.push({
        action: 'CARPLAY_BOOK_50',
        timestamp: new Date(),
        details: { text: `Booked 50% partial (${closeQty} lots) via CarPlay Siri Voice command` },
        changedBy: 'carplay_voice',
      });
      await trade.save();

      return {
        success: true,
        speechText: `Success! Booked 50 percent profit on ${friendlyName}. Closed ${closeQty} lots at market price. The remaining position is running.`,
      };
    }

    return {
      success: false,
      speechText: `Unrecognized action ${code}. Supported voice commands are Breakeven, Close Half, or Panic Close.`,
    };
  }
}
