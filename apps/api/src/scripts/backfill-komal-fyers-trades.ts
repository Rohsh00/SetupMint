import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, Instrument, Trade, TradingAccount } from '../db/models/index.js';
import { InstrumentService } from '../services/instrument.service.js';
import { parseFyersSymbol } from '../services/fyers.service.js';
import { AccountService } from '../services/account.service.js';

async function main() {
  const isLive = process.argv.includes('--yes');
  console.log('========================================================');
  console.log('   Komal Trader FYERS Trades & Instruments Backfill     ');
  console.log(`   Mode: ${isLive ? 'LIVE WRITE' : 'DRY RUN (Preview)'}`);
  console.log('========================================================\n');

  await connectDatabase();
  const user = await User.findOne({ email: 'komaltrader@gmail.com' });
  if (!user) {
    console.error('User komaltrader@gmail.com not found!');
    await disconnectDatabase();
    return;
  }

  const trades = await Trade.find({ userId: user._id }).sort({ tradeDate: 1 });
  console.log(`Found ${trades.length} trades for ${user.email} (${user._id}).\n`);

  let updatedCount = 0;

  for (const t of trades) {
    const rawSym = t.symbol;
    const parsed = parseFyersSymbol(rawSym);

    // Prefer existing valid instrument linkage, or resolve by normalized underlying
    let inst: any;
    if (t.instrumentId) {
      inst = await Instrument.findOne({ _id: t.instrumentId, userId: user._id });
    }
    if (!inst) {
      inst = await Instrument.findOne({ userId: user._id, symbol: parsed.underlying });
    }
    if (!inst) {
      if (isLive) {
        inst = await InstrumentService.ensureForTrade(user._id, {
          symbol: parsed.underlying,
          assetClass: t.assetClass || parsed.assetClass,
          exchange: t.exchange || parsed.exchange,
          marketSegment: t.marketSegment || parsed.marketSegment,
          currency: t.currency || 'INR',
        });
      } else {
        inst = { _id: 'preview_inst_id', symbol: parsed.underlying, displayName: parsed.underlying, contractMultiplier: 1 };
      }
    }

    const newFormattedSymbol = parsed.formattedSymbol || t.symbol;
    const newTitle = parsed.isDerivative
      ? parsed.optionType && parsed.strikePrice
        ? `${inst.displayName || parsed.underlying} ${parsed.strikePrice} ${parsed.optionType === 'CALL' ? 'CE' : 'PE'}`
        : `${inst.displayName || parsed.underlying} FUT`
      : (inst.displayName || parsed.underlying);

    const needsUpdate =
      !t.instrumentId ||
      t.instrumentId.toString() !== inst._id.toString() ||
      !t.underlying ||
      t.underlying !== inst.symbol ||
      t.symbol !== newFormattedSymbol ||
      (!t.optionType && parsed.optionType) ||
      (!t.strikePrice && parsed.strikePrice) ||
      (!t.tradeTitle && newTitle) ||
      (t.simpleExecution && inst.contractMultiplier && t.simpleExecution.contractMultiplier !== inst.contractMultiplier);

    if (needsUpdate) {
      console.log(`Trade ${t._id}:`);
      console.log(`  Raw Symbol:     "${rawSym}" -> Formatted: "${newFormattedSymbol}"`);
      console.log(`  Underlying:     "${t.underlying || 'NONE'}" -> "${inst.symbol}"`);
      console.log(`  Instrument:     "${t.instrumentName || 'NONE'}" -> "${inst.displayName}" (${inst._id})`);
      console.log(`  Option Details: Opt: ${parsed.optionType || 'NONE'}, Strike: ${parsed.strikePrice || 'NONE'}`);
      console.log(`  Title:          "${t.tradeTitle || 'NONE'}" -> "${t.tradeTitle || newTitle}"`);
      console.log(`  Multiplier:     ${t.simpleExecution?.contractMultiplier || 1} -> ${inst.contractMultiplier || 1}`);

      if (isLive) {
        t.instrumentId = inst._id;
        t.underlying = inst.symbol;
        t.instrumentName = inst.displayName;
        t.symbol = newFormattedSymbol;
        if (!t.tradeTitle || t.tradeTitle === rawSym) {
          t.tradeTitle = newTitle;
        }
        if (parsed.optionType) t.optionType = parsed.optionType;
        if (parsed.strikePrice) t.strikePrice = parsed.strikePrice;
        if (t.simpleExecution && inst.contractMultiplier) {
          t.simpleExecution.contractMultiplier = inst.contractMultiplier;
        }
        await t.save();
      }
      updatedCount++;
    }
  }

  console.log(`\n========================================================`);
  console.log(`Summary: ${updatedCount} / ${trades.length} trades updated.`);
  if (!isLive) {
    console.log(`Re-run with --yes to write changes to Atlas database.`);
  } else {
    // Recalculate account balances
    const accounts = await TradingAccount.find({ userId: user._id });
    for (const acc of accounts) {
      await AccountService.recalculateAccountBalances(acc._id, user._id);
    }
    console.log(`All account balances recalculated successfully.`);
  }
  console.log(`========================================================\n`);

  await disconnectDatabase();
}

main().catch(console.error);
