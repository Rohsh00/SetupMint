import mongoose from 'mongoose';
import { Mt5Command, IMt5CommandDoc } from '../db/models/Mt5Command.js';

export class Mt5CommandService {
  private static lastActiveMap = new Map<string, number>();

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

