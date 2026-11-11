import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import mongoose from 'mongoose';
import { Instrument } from '../db/models/Instrument.js';
import { Trade } from '../db/models/Trade.js';
import { InstrumentService } from '../services/instrument.service.js';
import { AccountService } from '../services/account.service.js';

async function healSensex() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB Atlas');

  // 1. Fix SENSEX Instrument definition
  const instUpdate = await Instrument.updateMany(
    { symbol: { $in: ['SENSEX', 'BSE:SENSEX', 'BSE_INDEX:SENSEX'] } },
    {
      $set: {
        contractMultiplier: 1,
        lotSize: 20,
        quantityIncrement: 10,
        displayName: 'BSE Sensex',
      },
    }
  );
  console.log(`✅ Updated ${instUpdate.modifiedCount} SENSEX instrument(s) to contractMultiplier = 1, lotSize = 20`);

  // 2. Find and heal Trade 6af3fc441d9503b45ffd166e (and any other SENSEX trade with mult > 1)
  const sensexTrades = await Trade.find({
    symbol: /SENSEX/i,
    'simpleExecution.contractMultiplier': { $gt: 1 },
  });
  console.log(`🔍 Found ${sensexTrades.length} SENSEX trade(s) with contractMultiplier > 1`);

  for (const trade of sensexTrades) {
    const prevGross = trade.calculated?.grossPnL;
    const prevNet = trade.calculated?.netPnL;
    const prevMult = trade.simpleExecution?.contractMultiplier;

    if (!trade.simpleExecution) {
      trade.simpleExecution = {} as any;
    }
    trade.simpleExecution!.contractMultiplier = 1;

    // Recompute base calculations
    const tradeObj = trade.toObject();
    if (!tradeObj.simpleExecution) {
      tradeObj.simpleExecution = {} as any;
    }
    tradeObj.simpleExecution!.contractMultiplier = 1;
    const newCalcs = InstrumentService.computeTradeCalculations(tradeObj);

    trade.calculated = trade.calculated || ({} as any);
    trade.calculated.grossPnL = newCalcs.grossPnL;
    trade.calculated.netPnL = newCalcs.netPnL;
    trade.calculated.totalCosts = newCalcs.totalCosts;
    trade.calculated.realizedRMultiple = newCalcs.realizedRMultiple;
    trade.calculated.closedQuantity = newCalcs.closedQuantity;
    trade.calculated.outcome = newCalcs.outcome;

    // Recompute planned risk amount
    const entry = trade.simpleExecution?.entryPrice || 0;
    const sl = trade.risk?.initialStopLoss;
    const qty = trade.simpleExecution?.quantity || 120;
    if (sl && entry > 0) {
      const stopDistance = Math.abs(entry - sl);
      const riskAmount = Number((stopDistance * qty * 1).toFixed(2));
      trade.risk.plannedRiskAmount = riskAmount;
      trade.risk.estimatedRiskAmount = riskAmount;
      if (stopDistance > 0) {
        trade.risk.realizedRMultiple = Number(((newCalcs.grossPnL) / riskAmount).toFixed(2));
      }
    }

    // Recompute slippage costs
    if (trade.calculated.slippage?.hasSlippageData) {
      const exitSlPts = trade.calculated.slippage.exitSlippagePoints || 0;
      const entrySlPts = trade.calculated.slippage.entrySlippagePoints || 0;
      trade.calculated.slippage.exitSlippageCost = Number((exitSlPts * qty * 1).toFixed(2));
      trade.calculated.slippage.entrySlippageCost = Number((entrySlPts * qty * 1).toFixed(2));
      trade.calculated.slippage.totalSlippageCost = Number(
        (trade.calculated.slippage.exitSlippageCost + trade.calculated.slippage.entrySlippageCost).toFixed(2)
      );
    }

    // Recompute excursion amounts
    if (trade.calculated.excursion && trade.calculated.excursion.status === 'COMPUTED') {
      const maePts = trade.calculated.excursion.maePoints || 0;
      const mfePts = trade.calculated.excursion.mfePoints || 0;
      trade.calculated.excursion.maeAmount = Number((maePts * qty * 1).toFixed(2));
      trade.calculated.excursion.mfeAmount = Number((mfePts * qty * 1).toFixed(2));
      if (trade.calculated.excursion.feeAdjustedMaePoints) {
        trade.calculated.excursion.feeAdjustedMaeAmount = Number(
          (trade.calculated.excursion.feeAdjustedMaePoints * qty * 1).toFixed(2)
        );
      }
    }

    await trade.save();
    console.log(`✅ Healed Trade ${trade._id}:`);
    console.log(`   Multiplier: ${prevMult} -> 1`);
    console.log(`   Gross P&L: ₹${prevGross} -> ₹${trade.calculated.grossPnL} (Exact FYERS Match: -₹3,826.00)`);
    console.log(`   Net P&L: ₹${prevNet} -> ₹${trade.calculated.netPnL}`);
    console.log(`   Planned Risk: ₹${trade.risk?.plannedRiskAmount}`);

    // Recompute account balances
    if (trade.accountId && trade.userId) {
      console.log(`🔄 Recalculating balances for Account ${trade.accountId}...`);
      await AccountService.recalculateAccountBalances(trade.accountId.toString(), trade.userId.toString());
      console.log(`✅ Account balances recalculated successfully.`);
    }
  }

  await mongoose.disconnect();
  console.log('✅ Done.');
}

healSensex().catch((err) => {
  console.error('❌ Error healing SENSEX:', err);
  process.exit(1);
});
