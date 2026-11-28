import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { TradeAiAnalyzerService } from '../src/services/trade-ai-analyzer.service.js';

describe('TradeAiAnalyzerService - Per-Trade AI & Chart Copilot', () => {
  it('generates deterministic quant analysis for a winning disciplined trade', () => {
    const mockTrade = {
      _id: new mongoose.Types.ObjectId(),
      symbol: 'BANKNIFTY',
      direction: 'LONG',
      status: 'CLOSED',
      simpleExecution: {
        entryPrice: 51200,
        exitPrice: 51600,
        quantity: 30,
      },
      risk: {
        initialStopLoss: 51000,
        plannedTarget: 51600,
        realizedRMultiple: 2.0,
      },
      calculated: {
        realizedRMultiple: 2.0,
        grossPnL: 12000,
        netPnL: 11850,
        holdingTimeMinutes: 45,
        excursion: {
          entryQualityScore: 90,
          mfeR: 2.2,
          maeR: 0.2,
          rLeftOnTable: 0.2,
          exitEfficiency: 0.91,
        },
        slippage: {
          slippagePoints: 0,
        },
      },
      setup: {
        patternType: 'BREAKOUT_CONTINUATION',
      },
      auditLog: [],
      tags: [],
    };

    const analysis = (TradeAiAnalyzerService as any).generateQuantAnalysis({
      trade: mockTrade,
      direction: 'LONG',
      entryPrice: 51200,
      exitPrice: 51600,
      initialStop: 51000,
      plannedTarget: 51600,
      realizedR: 2.0,
      grossPnL: 12000,
      netPnL: 11850,
      holdingMins: 45,
      status: 'CLOSED',
      excursion: mockTrade.calculated.excursion,
      slippage: mockTrade.calculated.slippage,
      stopMoves: undefined,
      candleContextStr: '30 candles on 5m',
      hasVisionImage: false,
    });

    expect(analysis.modelUsed).toBe('deterministic-quant-engine');
    expect(analysis.executionScore).toBeGreaterThanOrEqual(8);
    expect(analysis.disciplineScore).toBe(5);
    expect(analysis.entryReview.rating).toBe('EXCELLENT');
    expect(analysis.riskManagement.stopPlacementRating).toBe('OPTIMAL');
    expect(analysis.exitReview.rating).toBe('OPTIMAL');
    expect(analysis.identifiedMistakes.length).toBe(0);
    expect(analysis.suggestedTags).toContain('High-R Runner');
    expect(analysis.lessonsLearned).toBeTruthy();
  });

  it('detects execution leaks: stop loss widened and chased entry slippage', () => {
    const mockTrade = {
      _id: new mongoose.Types.ObjectId(),
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      simpleExecution: {
        entryPrice: 2650,
        exitPrice: 2640,
        quantity: 0.1,
      },
      risk: {
        initialStopLoss: 2645,
        realizedRMultiple: -2.0,
      },
      calculated: {
        realizedRMultiple: -2.0,
        grossPnL: -100,
        netPnL: -105,
        holdingTimeMinutes: 60,
        excursion: {
          maeR: 2.0,
          mfeR: 0.3,
          rLeftOnTable: 0,
        },
        slippage: {
          slippagePoints: 2.5,
        },
        stopMoveSummary: {
          hasWidenedRisk: true,
          widenedCount: 2,
        },
      },
      auditLog: [],
      tags: [],
    };

    const analysis = (TradeAiAnalyzerService as any).generateQuantAnalysis({
      trade: mockTrade,
      direction: 'LONG',
      entryPrice: 2650,
      exitPrice: 2640,
      initialStop: 2645,
      plannedTarget: undefined,
      realizedR: -2.0,
      grossPnL: -100,
      netPnL: -105,
      holdingMins: 60,
      status: 'CLOSED',
      excursion: mockTrade.calculated.excursion,
      slippage: mockTrade.calculated.slippage,
      stopMoves: mockTrade.calculated.stopMoveSummary,
      candleContextStr: '',
      hasVisionImage: false,
    });

    expect(analysis.entryReview.rating).toBe('CHASED');
    expect(analysis.riskManagement.stopPlacementRating).toBe('TOO_WIDE');
    expect(analysis.disciplineScore).toBeLessThanOrEqual(2);
    expect(analysis.identifiedMistakes.some((m: string) => m.toLowerCase().includes('widened'))).toBe(true);
    expect(analysis.identifiedMistakes.some((m: string) => m.toLowerCase().includes('slippage'))).toBe(true);
  });

  it('detects premature exit leaving significant R on the table', () => {
    const mockTrade = {
      _id: new mongoose.Types.ObjectId(),
      symbol: 'BTCUSD',
      direction: 'LONG',
      status: 'CLOSED',
      simpleExecution: {
        entryPrice: 90000,
        exitPrice: 90500,
      },
      risk: {
        initialStopLoss: 89500,
        realizedRMultiple: 1.0,
      },
      calculated: {
        realizedRMultiple: 1.0,
        grossPnL: 500,
        netPnL: 490,
        holdingTimeMinutes: 20,
        excursion: {
          mfeR: 3.5,
          maeR: 0.1,
          rLeftOnTable: 2.5,
        },
      },
      auditLog: [],
      tags: [],
    };

    const analysis = (TradeAiAnalyzerService as any).generateQuantAnalysis({
      trade: mockTrade,
      direction: 'LONG',
      entryPrice: 90000,
      exitPrice: 90500,
      initialStop: 89500,
      plannedTarget: undefined,
      realizedR: 1.0,
      grossPnL: 500,
      netPnL: 490,
      holdingMins: 20,
      status: 'CLOSED',
      excursion: mockTrade.calculated.excursion,
      slippage: undefined,
      stopMoves: undefined,
      candleContextStr: '',
      hasVisionImage: false,
    });

    expect(analysis.exitReview.rating).toBe('PREMATURE');
    expect(analysis.identifiedMistakes.some((m: string) => m.includes('left +2.5R on the table'))).toBe(true);
  });

  it('applies analysis correctly to trade thesis, psychology, and tags', async () => {
    const mockSave = vi.fn().mockResolvedValue(true);
    const mockTrade: any = {
      _id: new mongoose.Types.ObjectId(),
      direction: 'LONG',
      thesis: { confluences: [] },
      psychology: { mistakes: [] },
      tags: ['Manual'],
      auditLog: [],
      save: mockSave,
    };

    const sampleAnalysis = {
      generatedAt: new Date().toISOString(),
      modelUsed: 'gemini-2.5-flash (Vision)',
      setupType: 'Liquidity Sweep & Retest',
      marketStructure: 'TRENDING_UP',
      executionScore: 9.0,
      disciplineScore: 5,
      confidence: 95,
      chartAnalysis: {
        hasVisionImage: true,
        trendBias: 'BULLISH',
        summary: 'Clean liquidity sweep of Asian low followed by aggressive buying.',
        confluences: ['Sweep of Asian low', '5m Bullish Hammer', 'Above VWAP'],
        keyLevelsObserved: ['Entry: 24,150'],
      },
      entryReview: {
        rating: 'EXCELLENT',
        summary: 'Perfect limit fill at sweep extreme.',
      },
      riskManagement: {
        stopPlacementRating: 'OPTIMAL',
        summary: 'SL tucked safely under swing low.',
      },
      exitReview: {
        rating: 'OPTIMAL',
        summary: 'Exit at opposing liquidity pool.',
      },
      identifiedMistakes: [],
      suggestedTags: ['A+ Setup', 'Liquidity Sweep'],
      lessonsLearned: 'Always wait for the sweep confirmation candle before entering.',
      autoApplied: false,
    };

    await TradeAiAnalyzerService.applyAnalysisToTrade(mockTrade, sampleAnalysis as any);

    expect(mockTrade.thesis.entryRationale).toBe('Perfect limit fill at sweep extreme.');
    expect(mockTrade.thesis.stopLossRationale).toBe('SL tucked safely under swing low.');
    expect(mockTrade.thesis.marketStructure).toBe('TRENDING_UP');
    expect(mockTrade.thesis.confluences).toContain('Sweep of Asian low');
    expect(mockTrade.psychology.disciplineScore).toBe(5);
    expect(mockTrade.psychology.lessonsLearned).toBe('Always wait for the sweep confirmation candle before entering.');
    expect(mockTrade.tags).toContain('Liquidity Sweep & Retest');
    expect(mockTrade.tags).toContain('A+ Setup');
    expect(mockTrade.aiAnalysis.autoApplied).toBe(true);
    expect(mockTrade.auditLog.length).toBe(1);
    expect(mockSave).toHaveBeenCalled();
  });

  it('validates Gemini candidate models fallback and response parsing', async () => {
    // Mock global fetch to simulate successful gemini-3.5-flash-lite response
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('gemini-3.5-flash-lite')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'OK' }],
                },
              },
            ],
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Model not found' } }),
      };
    }) as any;

    try {
      const startTime = Date.now();
      const res = await global.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=test-key', {
        method: 'POST',
      });
      const data: any = await res.json();
      expect(res.ok).toBe(true);
      expect(data.candidates[0].content.parts[0].text).toBe('OK');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
