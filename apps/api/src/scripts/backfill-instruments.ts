import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Instrument, Trade, User } from '../db/models/index.js';
import { InstrumentService } from '../services/instrument.service.js';

export async function runBackfill(options?: {
  isLive?: boolean;
  targetUserId?: string;
  skipConnect?: boolean;
}) {
  const isLive = options?.isLive ?? process.argv.includes('--yes');
  const targetUserId = options?.targetUserId;

  console.log('========================================================');
  console.log('   SetupMint Instruments Backfill & Migration Script   ');
  console.log('========================================================');
  if (!isLive) {
    console.log('\n[DRY RUN MODE] No changes will be written to the database.');
    console.log('To execute this backfill, re-run with --yes:');
    console.log('  npm run instruments:backfill -- --yes\n');
    console.log('REMINDER: Run npm run db:backup first before executing migrations.\n');
  } else {
    console.log('\n[LIVE EXECUTION MODE] Applying changes to database.\n');
  }

  if (!options?.skipConnect) {
    await connectDatabase();
  }

  try {
    const userQuery = targetUserId ? { _id: targetUserId } : {};
    const users = await User.find(userQuery);
    console.log(`Found ${users.length} users to inspect.`);

    let totalCreated = 0;
    let totalTradesLinked = 0;
    let totalDuplicatesMerged = 0;
    let totalDeleted = 0;
    let totalRetained = 0;

    // Phase 1: Clean up global preset documents (userId null or undefined)
    const globalPresets = await Instrument.find({
      $or: [{ userId: null }, { userId: { $exists: false } }],
    });
    console.log(`\nFound ${globalPresets.length} global preset documents (userId: null).`);
    for (const gp of globalPresets) {
      console.log(`  [DELETE GLOBAL PRESET] ${gp.symbol} (${gp._id})`);
      if (isLive) {
        await Instrument.deleteOne({ _id: gp._id });
      }
      totalDeleted++;
    }

    // Phase 2: Per-user trade inspection and instrument harmonization
    for (const user of users) {
      const userId = user._id;
      console.log(`\n--- Processing User: ${user.email} (${userId}) ---`);

      // 1. Check for duplicate instruments { userId, symbol }
      const userInstruments = await Instrument.find({ userId });
      const symbolMap = new Map<string, any[]>();
      for (const inst of userInstruments) {
        const list = symbolMap.get(inst.symbol) || [];
        list.push(inst);
        symbolMap.set(inst.symbol, list);
      }

      const activeInstrumentBySymbol = new Map<string, any>();

      for (const [sym, list] of symbolMap.entries()) {
        if (list.length > 1) {
          // Keep CUSTOM if any, otherwise the first
          list.sort((a, b) => {
            if (a.source === 'CUSTOM' && b.source !== 'CUSTOM') return -1;
            if (b.source === 'CUSTOM' && a.source !== 'CUSTOM') return 1;
            return a.createdAt.getTime() - b.createdAt.getTime();
          });
          const keep = list[0];
          activeInstrumentBySymbol.set(sym, keep);
          const duplicates = list.slice(1);

          for (const dup of duplicates) {
            console.log(`  [MERGE DUPLICATE] Reassigning trades from duplicate ${sym} (${dup._id}) to primary (${keep._id})`);
            if (isLive) {
              await Trade.updateMany(
                { userId, instrumentId: dup._id },
                { $set: { instrumentId: keep._id, underlying: keep.symbol } }
              );
              await Instrument.deleteOne({ _id: dup._id });
            }
            totalDuplicatesMerged++;
            totalDeleted++;
          }
        } else {
          activeInstrumentBySymbol.set(sym, list[0]);
        }
      }

      // 2. Inspect trades for user
      const trades = await Trade.find({ userId });
      console.log(`  User has ${trades.length} trades.`);

      // Group distinct underlyings from trades
      const tradesByUnderlying = new Map<string, any[]>();
      for (const t of trades) {
        const underlying = InstrumentService.normalizeUnderlying(t.symbol);
        const list = tradesByUnderlying.get(underlying) || [];
        list.push(t);
        tradesByUnderlying.set(underlying, list);
      }

      // Ensure instrument exists for each traded underlying
      for (const [underlying, tradeList] of tradesByUnderlying.entries()) {
        let inst = activeInstrumentBySymbol.get(underlying);

        if (!inst) {
          const sampleTrade = tradeList[0];
          console.log(`  [CREATE MISSING INSTRUMENT] Creating instrument for traded underlying "${underlying}" (sample: ${sampleTrade.symbol})`);
          if (isLive) {
            inst = await InstrumentService.ensureForTrade(userId, sampleTrade);
            activeInstrumentBySymbol.set(underlying, inst);
          } else {
            inst = { _id: 'preview_id', symbol: underlying, displayName: underlying };
          }
          totalCreated++;
        }

        // Check trades missing instrumentId or having outdated instrumentId
        for (const t of tradeList) {
          const needsLink =
            !t.instrumentId ||
            (isLive && t.instrumentId.toString() !== inst._id.toString()) ||
            !t.underlying ||
            t.underlying !== underlying;

          if (needsLink) {
            console.log(`  [LINK TRADE] Trade ${t._id} (${t.symbol}) -> Instrument ${underlying}`);
            if (isLive) {
              await Trade.updateOne(
                { _id: t._id },
                {
                  $set: {
                    instrumentId: inst._id,
                    underlying,
                    ...(t.instrumentName ? {} : { instrumentName: inst.displayName }),
                  },
                }
              );
            }
            totalTradesLinked++;
          }
        }
      }

      // 3. Delete untraded AUTO / seeded instruments with 0 trades
      // (NEVER delete source: 'CUSTOM' instruments created by user)
      const currentInstruments = isLive ? await Instrument.find({ userId }) : userInstruments;

      for (const inst of currentInstruments) {
        const tradeCount = await Trade.countDocuments({ userId, instrumentId: inst._id });

        if (tradeCount === 0) {
          if (inst.source === 'CUSTOM') {
            console.log(`  [RETAIN CUSTOM] Retaining 0-trade custom instrument: ${inst.symbol}`);
            totalRetained++;
          } else {
            console.log(`  [DELETE UNUSED AUTO/SEEDED] ${inst.symbol} (source: ${inst.source || 'SEEDED'}, trades: 0)`);
            if (isLive) {
              await Instrument.deleteOne({ _id: inst._id });
            }
            totalDeleted++;
          }
        } else {
          totalRetained++;
        }
      }
    }

    console.log('\n========================================================');
    console.log('                 Backfill Summary                       ');
    console.log('========================================================');
    console.log(`Mode:                     ${isLive ? 'LIVE APPLIED' : 'DRY RUN (Simulated)'}`);
    console.log(`Users Processed:          ${users.length}`);
    console.log(`Instruments Created:      ${totalCreated}`);
    console.log(`Trades Linked / Updated:  ${totalTradesLinked}`);
    console.log(`Duplicates Merged:        ${totalDuplicatesMerged}`);
    console.log(`Instruments Deleted:      ${totalDeleted}`);
    console.log(`Instruments Retained:     ${totalRetained}`);
    console.log('========================================================\n');

    return {
      mode: isLive ? 'LIVE' : 'DRY_RUN',
      usersProcessed: users.length,
      totalCreated,
      totalTradesLinked,
      totalDuplicatesMerged,
      totalDeleted,
      totalRetained,
    };
  } finally {
    if (!options?.skipConnect) {
      await disconnectDatabase();
    }
  }
}

// Direct CLI execution
if (process.argv[1]?.includes('backfill-instruments.ts') || process.argv[1]?.includes('backfill-instruments.js')) {
  runBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}
