import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Trade, User } from '../db/models/index.js';
import { TradeAiAnalyzerService } from '../services/trade-ai-analyzer.service.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await connectDatabase();

  const user = await User.findOne({ email: 'komal@gmail.com' });
  if (!user) {
    console.error('User komal@gmail.com not found');
    await disconnectDatabase();
    process.exit(1);
  }

  const weekStart = new Date('2026-11-22T00:00:00.000Z');
  const trades = await Trade.find({
    userId: user._id,
    entryTime: { $gte: weekStart },
    status: 'CLOSED',
    symbol: { $in: ['XAUUSD', 'ETHUSD'] },
  }).sort({ entryTime: 1 });

  console.log(`Found ${trades.length} closed Forex/CFD trades for Komal this week.`);

  const targets = trades.filter((t) => !t.aiAnalysis || !t.aiAnalysis.autoApplied);
  console.log(`Targeting ${targets.length} trades for AI analysis & auto-application.`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const trade = targets[i];
    const tradeNum = i + 1;
    console.log(
      `\n[${tradeNum}/${targets.length}] Analyzing trade ${trade._id} (${trade.symbol} ${trade.direction}, Net PnL: ${trade.calculated?.netPnL})...`
    );

    try {
      const result = await TradeAiAnalyzerService.analyzeTrade(trade._id, user._id.toString(), {
        force: true,
        autoApply: true,
      });

      console.log(
        `  ✅ [${result.modelUsed}] Setup: ${result.setupType} | Structure: ${result.marketStructure} | Exec Score: ${result.executionScore} | Disc: ${result.disciplineScore}`
      );
      console.log(`     Entry Rationale: ${result.entryReview?.summary?.substring(0, 80)}...`);
      successCount++;
    } catch (err: any) {
      console.error(`  ❌ Error analyzing trade ${trade._id}:`, err.message);
      errorCount++;
    }

    // Wait 2.5s between requests to respect Gemini free-tier rate limits
    if (i < targets.length - 1) {
      await sleep(2500);
    }
  }

  console.log(`\n========================================`);
  console.log(`Completed batch analysis!`);
  console.log(`Successfully analyzed & applied: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
  console.log(`========================================\n`);

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal batch analyze error:', err);
  process.exit(1);
});
