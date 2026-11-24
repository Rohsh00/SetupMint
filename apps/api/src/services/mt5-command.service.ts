import mongoose from 'mongoose';
import { Mt5Command, IMt5CommandDoc } from '../db/models/Mt5Command.js';

export interface Mt5LiveQuote {
  symbol: string;
  bid: number;
  ask: number;
  ltp: number;
  timestamp: Date;
  accountId: string;
}

export interface Mt5PositionQuote {
  ticket: string;
  symbol: string;
  curPrice: number;
  bid: number;
  ask: number;
  profit: number;
  timestamp: Date;
  accountId: string;
}

export class Mt5CommandService {
  private static lastActiveMap = new Map<string, number>();
  private static quoteMap = new Map<string, Mt5LiveQuote>();
  private static positionQuoteMap = new Map<string, Mt5PositionQuote>();
  private static missingTicketMap = new Map<string, { count: number; firstSeenAt: number }>();
  private static accountWebhookLockMap = new Map<string, Promise<void>>();
  private static readonly MT5_QUOTE_TTL_MS = 45000; // 45 seconds

  /**
   * Serializes MT5 webhook state mutations per trading account so concurrent
   * OnTradeTransaction + OnTimer requests for the same ticket cannot race past
   * findOne() and create duplicate Trade documents.
   */
  static async withAccountWebhookLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    const key = String(accountId || '').trim();
    if (!key) return fn();
    const prev = Mt5CommandService.accountWebhookLockMap.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((res) => {
      release = res;
    });
    const tail = prev.then(() => next, () => next);
    Mt5CommandService.accountWebhookLockMap.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (Mt5CommandService.accountWebhookLockMap.get(key) === tail) {
        Mt5CommandService.accountWebhookLockMap.delete(key);
      }
    }
  }

  /**
   * Tracks a trade ticket that is missing from an active MT5 positions snapshot.
   * Returns true ONLY if the ticket has been missing for at least requiredCount consecutive snapshots
   * AND at least minDurationMs time (default: 5 consecutive snapshots across >= 15 seconds).
   * This prevents transient glitches during order modification (like setting Stop Loss on mobile)
   * from erroneously auto-closing open positions.
   */
  static recordMissingTicket(ticket: string, minDurationMs: number = 15000, requiredCount: number = 5): boolean {
    const tStr = String(ticket).trim();
    if (!tStr) return false;
    const now = Date.now();
    const existing = Mt5CommandService.missingTicketMap.get(tStr);
    if (!existing) {
      Mt5CommandService.missingTicketMap.set(tStr, { count: 1, firstSeenAt: now });
      return false;
    }
    existing.count += 1;
    const elapsed = now - existing.firstSeenAt;
    return existing.count >= requiredCount && elapsed >= minDurationMs;
  }

  /**
   * Clears the missing tracking state for a ticket when it appears active.
   */
  static clearMissingTicket(ticket: string): void {
    const tStr = String(ticket).trim();
    if (tStr) {
      Mt5CommandService.missingTicketMap.delete(tStr);
    }
  }

  /**
   * Records a live symbol quote (bid, ask, ltp) pushed from MT5 EA.
   */
  static recordQuote(
    accountId: string | mongoose.Types.ObjectId,
    quote: { symbol: string; bid?: number; ask?: number; ltp?: number; timestamp?: Date }
  ): void {
    if (!quote || !quote.symbol) return;
    const cleanSym = quote.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const ltp =
      quote.ltp && quote.ltp > 0
        ? quote.ltp
        : quote.bid && quote.bid > 0
        ? quote.bid
        : quote.ask && quote.ask > 0
        ? quote.ask
        : 0;
    if (ltp <= 0) return;

    const accIdStr = accountId ? accountId.toString() : '';
    const entry: Mt5LiveQuote = {
      symbol: cleanSym,
      bid: quote.bid && quote.bid > 0 ? quote.bid : ltp,
      ask: quote.ask && quote.ask > 0 ? quote.ask : ltp,
      ltp,
      timestamp: quote.timestamp || new Date(),
      accountId: accIdStr,
    };

    Mt5CommandService.quoteMap.set(cleanSym, entry);
    if (accIdStr) {
      Mt5CommandService.quoteMap.set(`${accIdStr}:${cleanSym}`, entry);
    }

    // Canonical alias mappings for common symbols (handles broker suffixes like XAUUSDm, ETHUSD.pro, etc.)
    const aliases: string[] = [];
    if (cleanSym.includes('XAU') || cleanSym === 'GOLD') aliases.push('XAUUSD');
    if (cleanSym.includes('ETH')) aliases.push('ETHUSD');
    if (cleanSym.includes('BTC')) aliases.push('BTCUSD');
    if (cleanSym.includes('US30') || cleanSym.includes('DOW')) aliases.push('US30');
    if (cleanSym.includes('NAS') || cleanSym.includes('USTEC') || cleanSym.includes('NDX')) aliases.push('NAS100');

    for (const alias of aliases) {
      Mt5CommandService.quoteMap.set(alias, entry);
      if (accIdStr) {
        Mt5CommandService.quoteMap.set(`${accIdStr}:${alias}`, entry);
      }
    }
  }

  /**
   * Records position-level live current price, bid, ask, and profit reported from MT5 EA.
   */
  static recordPositionQuote(
    ticket: string | number,
    data: {
      curPrice: number;
      bid?: number;
      ask?: number;
      profit?: number;
      symbol?: string;
      accountId: string | mongoose.Types.ObjectId;
      timestamp?: Date;
    }
  ): void {
    const tStr = String(ticket).trim();
    if (!tStr || !data || typeof data.curPrice !== 'number' || data.curPrice <= 0) return;

    const accIdStr = data.accountId ? data.accountId.toString() : '';
    const sym = data.symbol ? data.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const entry: Mt5PositionQuote = {
      ticket: tStr,
      symbol: sym,
      curPrice: data.curPrice,
      bid: data.bid && data.bid > 0 ? data.bid : data.curPrice,
      ask: data.ask && data.ask > 0 ? data.ask : data.curPrice,
      profit: data.profit || 0,
      timestamp: data.timestamp || new Date(),
      accountId: accIdStr,
    };

    Mt5CommandService.positionQuoteMap.set(tStr, entry);
  }

  /**
   * Retrieves active live quote for a symbol reported by MT5 EA (within TTL).
   */
  static getLiveQuote(symbol: string, accountId?: string | mongoose.Types.ObjectId): Mt5LiveQuote | null {
    if (!symbol) return null;
    const cleanSym = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const accIdStr = accountId ? accountId.toString() : undefined;
    const now = Date.now();

    let quote = accIdStr ? Mt5CommandService.quoteMap.get(`${accIdStr}:${cleanSym}`) : undefined;
    if (!quote) quote = Mt5CommandService.quoteMap.get(cleanSym);

    // Check alias fallbacks
    if (!quote) {
      let alias = '';
      if (cleanSym.includes('XAU') || cleanSym === 'GOLD') alias = 'XAUUSD';
      else if (cleanSym.includes('ETH')) alias = 'ETHUSD';
      else if (cleanSym.includes('BTC')) alias = 'BTCUSD';
      else if (cleanSym.includes('US30') || cleanSym.includes('DOW')) alias = 'US30';
      else if (cleanSym.includes('NAS') || cleanSym.includes('USTEC') || cleanSym.includes('NDX')) alias = 'NAS100';

      if (alias) {
        quote = accIdStr ? Mt5CommandService.quoteMap.get(`${accIdStr}:${alias}`) : Mt5CommandService.quoteMap.get(alias);
      }
    }

    if (quote && now - quote.timestamp.getTime() <= Mt5CommandService.MT5_QUOTE_TTL_MS) {
      return quote;
    }
    return null;
  }

  /**
   * Retrieves active position-level live quote for a ticket (within TTL).
   */
  static getPositionQuote(ticket: string | number): Mt5PositionQuote | null {
    const tStr = String(ticket).trim();
    if (!tStr) return null;
    const quote = Mt5CommandService.positionQuoteMap.get(tStr);
    if (quote && Date.now() - quote.timestamp.getTime() <= Mt5CommandService.MT5_QUOTE_TTL_MS) {
      return quote;
    }
    return null;
  }

  /**
   * Records a heartbeat / webhook check-in from the MT5 EA bridge.
   */
  static recordHeartbeat(accountId: string | mongoose.Types.ObjectId): void {
    if (!accountId) return;
    Mt5CommandService.lastActiveMap.set(accountId.toString(), Date.now());
  }

  /**
   * Checks whether the MT5 EA bridge has checked in within the last 60 seconds.
   */
  static getLastActive(accountId: string | mongoose.Types.ObjectId): { isActive: boolean; secondsAgo: number | null } {
    if (!accountId) return { isActive: false, secondsAgo: null };
    const ts = Mt5CommandService.lastActiveMap.get(accountId.toString());
    if (!ts) return { isActive: false, secondsAgo: null };
    const secondsAgo = Math.round((Date.now() - ts) / 1000);
    return { isActive: secondsAgo <= 60, secondsAgo };
  }

  /**
   * Queues an on-demand history fetch command for the MT5 EA bridge.
   */
  static async queueFetchHistory(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
  }): Promise<IMt5CommandDoc> {
    // Supersede any pending fetch commands
    await Mt5Command.updateMany(
      {
        accountId: params.accountId,
        action: 'FETCH_HISTORY',
        status: 'PENDING',
      },
      { $set: { status: 'FAILED', resultMessage: 'Superseded by newer history fetch request' } }
    );

    const cmd = await Mt5Command.create({
      userId: params.userId,
      accountId: params.accountId,
      ticket: 0,
      action: 'FETCH_HISTORY',
      status: 'PENDING',
    });

    return cmd;
  }

  /**
   * Queues an on-demand chart screenshot capture command for the MT5 EA bridge.
   */
  static async queueCaptureScreenshot(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
    tradeId?: string | mongoose.Types.ObjectId;
    ticket?: number;
    symbol?: string;
  }): Promise<IMt5CommandDoc> {
    const cmd = await Mt5Command.create({
      userId: params.userId,
      accountId: params.accountId,
      tradeId: params.tradeId,
      ticket: params.ticket || 0,
      symbol: params.symbol,
      action: 'CAPTURE_SCREENSHOT',
      status: 'PENDING',
    });

    return cmd;
  }
  /**
   * Checks whether a trade belongs to an MT5 / Elefin account.
   */
  static isMt5Trade(trade: any, account?: any): boolean {
    if (!trade) return false;
    const tags = Array.isArray(trade.tags) ? trade.tags : [];
    if (tags.some((t: string) => t.includes('MT5') || t.includes('ELEFIN'))) return true;
    if (trade.importBatchId?.startsWith('MT5_')) return true;
    const broker = account?.broker || trade.broker || '';
    if (typeof broker === 'string' && (/elefin/i.test(broker) || /mt5/i.test(broker))) return true;
    return false;
  }

  /**
   * Extracts the numeric MT5 order ticket from a trade record.
   */
  static extractTicket(trade: any): number | null {
    if (!trade) return null;
    const tags = Array.isArray(trade.tags) ? trade.tags : [];
    for (const tag of tags) {
      if (typeof tag === 'string' && tag.toUpperCase().startsWith('MT5_TICKET_')) {
        const num = parseInt(tag.toUpperCase().replace('MT5_TICKET_', ''), 10);
        if (!isNaN(num) && num > 0) return num;
      }
    }
    if (typeof trade.importBatchId === 'string' && trade.importBatchId.startsWith('MT5_')) {
      const num = parseInt(trade.importBatchId.replace('MT5_', ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }
    if (Array.isArray(trade.fills) && trade.fills.length > 0) {
      for (const f of trade.fills) {
        if (typeof f.fillId === 'string' && f.fillId.startsWith('mt5_')) {
          const parts = f.fillId.split('_');
          if (parts[1]) {
            const num = parseInt(parts[1], 10);
            if (!isNaN(num) && num > 0) return num;
          }
        }
      }
    }
    return null;
  }

  /**
   * Queues a Stop Loss / Take Profit modification command for MT5 EA.
   */
  static async queueModifySl(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
    tradeId?: string | mongoose.Types.ObjectId;
    ticket: number;
    stopLoss: number;
    takeProfit?: number;
  }): Promise<IMt5CommandDoc> {
    // Supersede any pending modify commands for the same ticket
    await Mt5Command.updateMany(
      {
        accountId: params.accountId,
        ticket: params.ticket,
        action: 'MODIFY_SL',
        status: { $in: ['PENDING', 'SENT'] },
      },
      { $set: { status: 'FAILED', resultMessage: 'Superseded by newer Stop Loss command' } }
    );

    const cmd = await Mt5Command.create({
      userId: params.userId,
      accountId: params.accountId,
      tradeId: params.tradeId,
      ticket: params.ticket,
      action: 'MODIFY_SL',
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      status: 'PENDING',
    });

    return cmd;
  }

  /**
   * Queues a modify Take Profit (or remove TP) command for MT5 EA.
   * If takeProfit is 0, MT5 clears the take profit completely (Runner Mode).
   */
  static async queueModifyTp(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
    tradeId?: string | mongoose.Types.ObjectId;
    ticket: number;
    takeProfit: number;
    stopLoss?: number;
  }): Promise<IMt5CommandDoc> {
    // Supersede any pending modify TP commands for the same ticket
    await Mt5Command.updateMany(
      {
        accountId: params.accountId,
        ticket: params.ticket,
        action: 'MODIFY_TP',
        status: { $in: ['PENDING', 'SENT'] },
      },
      { $set: { status: 'FAILED', resultMessage: 'Superseded by newer Take Profit command' } }
    );

    const cmd = await Mt5Command.create({
      userId: params.userId,
      accountId: params.accountId,
      tradeId: params.tradeId,
      ticket: params.ticket,
      action: 'MODIFY_TP',
      takeProfit: params.takeProfit,
      stopLoss: params.stopLoss,
      status: 'PENDING',
    });

    return cmd;
  }

  /**
   * Queues a market close position command for MT5 EA.
   */
  static async queueClosePosition(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
    tradeId?: string | mongoose.Types.ObjectId;
    ticket: number;
    volume?: number;
  }): Promise<IMt5CommandDoc> {
    if (params.volume === 2) {
      console.error('[CRITICAL_TRACE_MT5_CLOSE_2]', new Error().stack);
    }
    const cmd = await Mt5Command.create({
      userId: params.userId,
      accountId: params.accountId,
      tradeId: params.tradeId,
      ticket: params.ticket,
      action: 'CLOSE_POSITION',
      volume: params.volume,
      status: 'PENDING',
    });

    return cmd;
  }

  /**
   * Queues a market or pending entry order command for the MT5 EA bridge.
   */
  static async queueOpenOrder(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
    symbol: string;
    side: 'BUY' | 'SELL';
    volume: number;
    stopLoss?: number;
    takeProfit?: number;
    price?: number;
    orderType?: 'MARKET' | 'LIMIT' | 'STOP';
    comment?: string;
  }): Promise<IMt5CommandDoc> {
    const cmd = await Mt5Command.create({
      userId: params.userId,
      accountId: params.accountId,
      ticket: 0,
      action: 'OPEN_ORDER',
      symbol: params.symbol.toUpperCase().trim(),
      side: params.side,
      volume: params.volume,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      price: params.price,
      orderType: params.orderType || 'MARKET',
      comment: params.comment || 'SetupMint-Telegram',
      status: 'PENDING',
    });

    return cmd;
  }

  /**
   * Retrieves pending commands for an account and formats them for MT5 webhook response.
   */
  static async getPendingCommandsForAccount(accountId: string | mongoose.Types.ObjectId): Promise<any[]> {
    const commands = await Mt5Command.find({
      accountId,
      status: 'PENDING',
    }).sort({ createdAt: 1 }).limit(10);

    if (commands.length === 0) return [];

    // Mark as SENT so they aren't duplicated while MT5 processes them
    const ids = commands.map((c) => c._id);
    await Mt5Command.updateMany({ _id: { $in: ids } }, { $set: { status: 'SENT' } });

    return commands.map((c) => ({
      commandId: c._id.toString(),
      action: c.action,
      ticket: c.ticket,
      symbol: c.symbol ?? '',
      side: c.side ?? '',
      orderType: c.orderType ?? 'MARKET',
      price: c.price ?? 0,
      stopLoss: c.stopLoss ?? 0,
      takeProfit: c.takeProfit ?? 0,
      volume: c.volume ?? 0,
      comment: c.comment ?? '',
    }));
  }

  /**
   * Updates command status when reported back from MT5 EA.
   */
  static async processCommandResults(
    results: Array<{ commandId: string; status: 'SUCCESS' | 'FAILED'; message?: string }>
  ): Promise<void> {
    if (!Array.isArray(results) || results.length === 0) return;
    for (const r of results) {
      if (!r.commandId || !mongoose.isValidObjectId(r.commandId)) continue;
      const cmd = await Mt5Command.findById(r.commandId);
      if (!cmd) continue;

      cmd.status = r.status === 'SUCCESS' ? 'EXECUTED' : 'FAILED';
      cmd.resultMessage = r.message;
      cmd.executedAt = new Date();
      await cmd.save();

      // Dispatch instant Telegram execution notification to trader if command was OPEN_ORDER
      if (cmd.action === 'OPEN_ORDER') {
        try {
          const { User } = await import('../db/models/User.js');
          const user = await User.findById(cmd.userId);
          if (user) {
            const { TelegramAlertService } = await import('./telegram-alert.service.js');
            const { safeDecryptSecret } = await import('./crypto.service.js');
            const rawToken = user.liveWatcherSettings?.telegramBotToken;
            const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
            const chatId = user.liveWatcherSettings?.telegramPinnedCockpitChatId || user.liveWatcherSettings?.telegramChatId;

            // Clear submenu so live cockpit flips to active positions immediately
            TelegramAlertService.clearSubmenu(cmd.userId);

            if (botToken && chatId) {
              if (r.status === 'SUCCESS') {
                const { Trade } = await import('../db/models/Trade.js');
                const ticketMatch = (r.message || '').match(/Ticket\s*#?(\d+)/i);
                const ticket = ticketMatch ? ticketMatch[1] : (cmd.ticket ? String(cmd.ticket) : '');

                const existingTrade = ticket ? await Trade.findOne({ userId: cmd.userId, tags: `MT5_TICKET_${ticket}` }).lean() : null;
                const tradeObj = existingTrade || {
                  _id: cmd.tradeId || new mongoose.Types.ObjectId(),
                  userId: cmd.userId,
                  accountId: cmd.accountId,
                  symbol: cmd.symbol || 'XAUUSD',
                  direction: cmd.side === 'BUY' ? 'LONG' : 'SHORT',
                  quantity: cmd.volume || 0.10,
                  entryPrice: cmd.requestedPrice || 0,
                  tags: ticket ? [`MT5_TICKET_${ticket}`] : [],
                  risk: {
                    initialStopLoss: cmd.stopLoss,
                    currentStopLoss: cmd.stopLoss,
                    plannedTarget: cmd.takeProfit,
                  },
                  simpleExecution: {
                    quantity: cmd.volume || 0.10,
                    entryPrice: cmd.requestedPrice || 0,
                  },
                };

                await TelegramAlertService.notifyTradeOpened(user, tradeObj, cmd.stopLoss);
              } else {
                const failText =
                  `❌ <b>MT5 ORDER REJECTED BY BROKER</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `<pre>\n` +
                  `Symbol : ${cmd.symbol || 'XAUUSD'}\n` +
                  `Side   : ${cmd.side || 'BUY'}\n` +
                  `Volume : ${(cmd.volume || 0.10).toFixed(2)} Lots\n` +
                  `Reason : ${r.message || 'Execution failed on MT5'}\n` +
                  `</pre>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `<i>Please check broker connectivity or margin.</i>`;
                await TelegramAlertService.sendMessage(botToken, chatId, failText);
              }
            }
          }
        } catch (err: any) {
          console.warn('[Mt5CommandService] Execution dispatch error:', err?.message || err);
        }
      } else if (r.status === 'FAILED') {
        // Non-trading utility commands: do NOT dispatch broker trade rejection alert to Telegram
        if (cmd.action === 'CAPTURE_SCREENSHOT' || cmd.action === 'FETCH_HISTORY') {
          return;
        }

        // Dispatch instant failure alert for CLOSE_POSITION, MODIFY_SL, MODIFY_TP
        const isHarmlessNoChange = (r.message || '').includes('no changes') && (cmd.action === 'MODIFY_TP' || cmd.action === 'MODIFY_SL');
        if (!isHarmlessNoChange) {
          try {
            const { User } = await import('../db/models/User.js');
            const user = await User.findById(cmd.userId);
            if (user) {
              const { TelegramAlertService } = await import('./telegram-alert.service.js');
              const { safeDecryptSecret } = await import('./crypto.service.js');
              const rawToken = user.liveWatcherSettings?.telegramBotToken;
              const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
              const chatId = user.liveWatcherSettings?.telegramPinnedCockpitChatId || user.liveWatcherSettings?.telegramChatId;

              if (botToken && chatId) {
                let sym = cmd.symbol;
                if (!sym && cmd.tradeId) {
                  const { Trade } = await import('../db/models/Trade.js');
                  const t = await Trade.findById(cmd.tradeId).lean();
                  if (t) sym = t.symbol;
                }
                if (!sym && cmd.ticket) {
                  const { Trade } = await import('../db/models/Trade.js');
                  const t = await Trade.findOne({ tags: `MT5_TICKET_${cmd.ticket}` }).lean();
                  if (t) sym = t.symbol;
                }
                sym = sym || 'Position';

                let actionDesc = 'Order Execution';
                if (cmd.action === 'CLOSE_POSITION') {
                  actionDesc = cmd.volume ? `Close Partial (${cmd.volume.toFixed(2)} Lots)` : 'Close Position';
                } else if (cmd.action === 'MODIFY_SL') {
                  actionDesc = `Modify Stop Loss (${cmd.stopLoss})`;
                } else if (cmd.action === 'MODIFY_TP') {
                  actionDesc = cmd.takeProfit ? `Modify Take Profit (${cmd.takeProfit})` : 'Clear Take Profit (Runner)';
                }

                // If position was already closed on terminal, surface as informational rather than rejection
                const isAlreadyClosed = (r.message || '').includes('already closed') || (r.message || '').includes('not found');
                if (isAlreadyClosed && cmd.action === 'CLOSE_POSITION') {
                  const infoText =
                    `ℹ️ <b>POSITION ALREADY CLOSED</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `<pre>\n` +
                    `Symbol : ${sym}\n` +
                    `Action : ${actionDesc}\n` +
                    (cmd.ticket ? `Ticket : #${cmd.ticket}\n` : '') +
                    `Status : Position is already closed on MT5\n` +
                    `</pre>`;
                  await TelegramAlertService.sendMessage(botToken, chatId, infoText);
                  return;
                }

                const failText =
                  `🚨 <b>BROKER EXECUTION REJECTED</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `<pre>\n` +
                  `Symbol : ${sym}\n` +
                  `Action : ${actionDesc}\n` +
                  (cmd.ticket ? `Ticket : #${cmd.ticket}\n` : '') +
                  `Reason : ${r.message || 'Execution failed on MT5 Bridge'}\n` +
                  `</pre>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `<i>Please manage or close directly on your terminal.</i>`;

                await TelegramAlertService.sendMessage(botToken, chatId, failText);
              }
            }
          } catch (err: any) {
            console.warn('[Mt5CommandService] Rejection dispatch error:', err?.message || err);
          }
        }
      } else if (r.status === 'SUCCESS' && cmd.action === 'CLOSE_POSITION' && cmd.volume && cmd.volume > 0) {
        // Dispatch confirmation for partial position harvest
        try {
          const { User } = await import('../db/models/User.js');
          const user = await User.findById(cmd.userId);
          if (user) {
            const { TelegramAlertService } = await import('./telegram-alert.service.js');
            const { safeDecryptSecret } = await import('./crypto.service.js');
            const rawToken = user.liveWatcherSettings?.telegramBotToken;
            const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
            const chatId = user.liveWatcherSettings?.telegramPinnedCockpitChatId || user.liveWatcherSettings?.telegramChatId;

            if (botToken && chatId) {
              let sym = cmd.symbol;
              if (!sym && cmd.ticket) {
                const { Trade } = await import('../db/models/Trade.js');
                const t = await Trade.findOne({ tags: `MT5_TICKET_${cmd.ticket}` }).lean();
                if (t) sym = t.symbol;
              }
              const okText =
                `✅ <b>BROKER PARTIAL EXIT CONFIRMED</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `<pre>\n` +
                `Symbol : ${sym || 'Position'}\n` +
                `Closed : ${cmd.volume.toFixed(2)} Lots\n` +
                (cmd.ticket ? `Ticket : #${cmd.ticket}\n` : '') +
                `Status : Executed on Broker\n` +
                `</pre>`;
              await TelegramAlertService.sendMessage(botToken, chatId, okText);
              await TelegramAlertService.updatePinnedCockpitMessage(user);
            }
          }
        } catch (err: any) {
          console.warn('[Mt5CommandService] Success dispatch error:', err?.message || err);
        }
      }
    }
  }
}

