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
  private static readonly MT5_QUOTE_TTL_MS = 45000; // 45 seconds

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
    // Also map XAUUSD if symbol is e.g. XAUUSDm, XAUUSDpro, GOLD
    if (cleanSym.includes('XAU') || cleanSym === 'GOLD') {
      Mt5CommandService.quoteMap.set('XAUUSD', entry);
      if (accIdStr) {
        Mt5CommandService.quoteMap.set(`${accIdStr}:XAUUSD`, entry);
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
    if (!quote && (cleanSym.includes('XAU') || cleanSym === 'GOLD')) {
      quote = accIdStr ? Mt5CommandService.quoteMap.get(`${accIdStr}:XAUUSD`) : Mt5CommandService.quoteMap.get('XAUUSD');
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
      if (typeof tag === 'string' && tag.startsWith('MT5_TICKET_')) {
        const num = parseInt(tag.replace('MT5_TICKET_', ''), 10);
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
   * Queues a market close position command for MT5 EA.
   */
  static async queueClosePosition(params: {
    userId: string | mongoose.Types.ObjectId;
    accountId: string | mongoose.Types.ObjectId;
    tradeId?: string | mongoose.Types.ObjectId;
    ticket: number;
    volume?: number;
  }): Promise<IMt5CommandDoc> {
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
      stopLoss: c.stopLoss ?? 0,
      takeProfit: c.takeProfit ?? 0,
      volume: c.volume ?? 0,
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
      await Mt5Command.updateOne(
        { _id: r.commandId },
        {
          $set: {
            status: r.status === 'SUCCESS' ? 'EXECUTED' : 'FAILED',
            resultMessage: r.message,
            executedAt: new Date(),
          },
        }
      );
    }
  }
}

