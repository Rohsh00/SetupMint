import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, Trade, TradingAccount, Strategy } from '../db/models/index.js';
import { PatternRecognitionService } from '../services/pattern-recognition.service.js';

async function main() {
  await connectDatabase();
  console.log('=== RUNNING AUTO-CLASSIFICATION ON KOMALTRADER TRADES (4H TREND + 5M SETUP) ===\n');

  const user = await User.findOne({ email: 'komaltrader@gmail.com' });
  if (!user) {
    throw new Error('User komaltrader@gmail.com not found!');
  }

  const trades = await Trade.find({ userId: user._id }).sort({ entryTime: 1 });
  console.log(`Found ${trades.length} total trades for ${user.name} (${user.email})\n`);

  let classifiedCount = 0;
  let failedCount = 0;

  for (const t of trades) {
    try {
      const res = await PatternRecognitionService.classifyTrade(t._id, user._id);
      classifiedCount++;
      console.log(
        `[OK] Trade ${t._id} (${t.symbol} ${t.direction}):` +
        `\n     4H Trend: ${res.htfTrend} | 5M Pattern: ${res.pattern} (${res.patternType})` +
        `\n     Matched Strategy: "${res.strategyName}"` +
        `\n     Matched Variant:  [${res.variantKey || 'NONE'}] ${res.variantName || ''}` +
        `\n     Confidence: ${(res.confidence * 100).toFixed(0)}%` +
        `\n     Reasoning: ${res.reasoning}\n`
      );
    } catch (err: any) {
      failedCount++;
      console.error(`[FAIL] Trade ${t._id} (${t.symbol}): ${err.message}\n`);
    }
  }

  console.log(`\n========================================================`);
  console.log(`SUMMARY: ${classifiedCount} / ${trades.length} trades classified successfully (${failedCount} failed).`);
  console.log(`========================================================\n`);

  await disconnectDatabase();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
