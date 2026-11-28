import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { User, Trade, TradingAccount } from '../src/db/models/index.js';
import { TradeAutoJournalService } from '../src/services/trade-auto-journal.service.js';
import { TradeAiAnalyzerService } from '../src/services/trade-ai-analyzer.service.js';

describe('TradeAutoJournalService - Zero-Click Post-Exit Journaling', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testAccountId: mongoose.Types.ObjectId;
  let testTradeId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    TradeAutoJournalService.resetForTests();
    TradeAutoJournalService.pacingDelayMs = 0;

    vi.spyOn(TradeAiAnalyzerService as any, 'synthesizeWithGemini').mockResolvedValue({
      modelUsed: 'gemini-2.5-flash',
      setupType: 'Bullish Order Block & Retest',
      matchedVariantKey: 'BULL_OB_RETEST',
      marketStructure: 'TRENDING_UP',
      executionScore: 9.0,
      disciplineScore: 5,
      confidence: 88,
      entryReview: { rating: 'EXCELLENT', summary: 'Entry aligned with order block.' },
      riskManagement: { stopPlacementRating: 'OPTIMAL', summary: 'Stop under support.' },
      exitReview: { rating: 'OPTIMAL', summary: 'Target met with high exit efficiency.' },
      identifiedMistakes: [],
      suggestedTags: ['A+ Setup'],
      lessonsLearned: 'Solid discipline maintained.',
      autoApplied: false,
    });

    testUserId = new mongoose.Types.ObjectId();
    testAccountId = new mongoose.Types.ObjectId();
    testTradeId = new mongoose.Types.ObjectId();

    await User.create({
      _id: testUserId,
      email: `autojournal-${Date.now()}@test.local`,
      passwordHash: 'dummyhash123',
      name: 'Auto Journal Trader',
      baseCurrency: 'USD',
      aiSettings: {
        enabled: true,
        autoAnalyzeTrades: true,
        autoApplyTradeDetails: true,
      },
    });

    await TradingAccount.create({
      _id: testAccountId,
      userId: testUserId,
      name: 'Test Account',
      broker: 'OTHER',
      accountType: 'DEMO',
      currency: 'USD',
    });

    await Trade.create({
      _id: testTradeId,
      userId: testUserId,
      accountId: testAccountId,
      symbol: 'XAUUSD',
      direction: 'LONG',
      assetClass: 'COMMODITY',
      marketSegment: 'MCX',
      exchange: 'MCX',
      currency: 'USD',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 3600000),
      exitTime: new Date(),
      simpleExecution: {
        entryPrice: 2650.0,
        exitPrice: 2665.0,
        quantity: 0.1,
      },
      risk: {
        initialStopLoss: 2645.0,
        plannedTarget: 2670.0,
        realizedRMultiple: 3.0,
        riskRuleViolations: [],
      },
      calculated: {
        netPnL: 150.0,
        realizedRMultiple: 3.0,
        excursion: {
          maxFavorableR: 3.5,
          maxAdverseR: 0.2,
          exitEfficiency: 85,
        },
      },
    });
  });

  afterEach(async () => {
    await TradeAutoJournalService.flush();
    TradeAutoJournalService.resetForTests();
    vi.restoreAllMocks();

    if (testUserId) {
      await User.deleteOne({ _id: testUserId });
      await TradingAccount.deleteOne({ _id: testAccountId });
      await Trade.deleteOne({ _id: testTradeId });
    }
  });

  it('directly processes closed trade and auto-populates setup, thesis, and psychology', async () => {
    await TradeAutoJournalService.processTradeDirect(testTradeId, testUserId);

    const updatedTrade = await Trade.findById(testTradeId);
    expect(updatedTrade).not.toBeNull();
    expect(updatedTrade?.aiAnalysis).toBeDefined();
    expect(updatedTrade?.aiAnalysis?.executionScore).toBeGreaterThanOrEqual(1);
    expect(updatedTrade?.aiAnalysis?.autoApplied).toBe(true);

    // Verify auto-applied details into trade record
    expect(updatedTrade?.thesis?.entryRationale).toContain('Entry filled at 2650.00');
    expect(updatedTrade?.psychology?.disciplineScore).toBe(5);
    expect(updatedTrade?.psychology?.lessonsLearned).toBeTruthy();
    expect(updatedTrade?.tags.length).toBeGreaterThan(0);
    expect(updatedTrade?.setup?.variantStatus).toBe('CLASSIFIED');
  });

  it('enqueues closed trade into asynchronous queue and processes with deduplication', async () => {
    TradeAutoJournalService.enqueueClosedTrade(testTradeId, testUserId);
    // Enqueue duplicate call - should be silently ignored by deduplication
    TradeAutoJournalService.enqueueClosedTrade(testTradeId, testUserId);

    await TradeAutoJournalService.flush();

    const updatedTrade = await Trade.findById(testTradeId);
    expect(updatedTrade).not.toBeNull();
    expect(updatedTrade?.aiAnalysis).toBeDefined();
    expect(updatedTrade?.aiAnalysis?.executionScore).toBeGreaterThanOrEqual(1);
    expect(updatedTrade?.aiAnalysis?.autoApplied).toBe(true);
    expect(updatedTrade?.thesis?.entryRationale).toBeTruthy();
  });
});
