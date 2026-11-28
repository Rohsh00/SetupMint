/**
 * SetupMint - Per-Trade AI & Chart Analyzer Copilot Service
 *
 * Provides deep multimodal technical and execution analysis for every trade:
 * 1. Multimodal Chart Perception (Gemini Flash Vision on uploaded or auto-generated charts)
 * 2. Candlestick Price Action & Excursion Telemetry (MAE, MFE, Slippage, Stop Moves)
 * 3. Automated Trade Journaling (1-click or automated population of thesis, confluences, mistakes, lessons)
 * 4. Deterministic Quant Engine fallback (100% Free, Offline, Zero-Cost)
 */

import mongoose from 'mongoose';
import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { ITradeAiAnalysis } from '@tradevault/shared';
import { Trade, Attachment, TradeCandleSnapshot, User, Strategy } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { getStorage } from '../storage/index.js';
import { detectHtfTrend4h, detectLtfSetup5m } from '@tradevault/financial-engine';
import { PatternRecognitionService } from './pattern-recognition.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class TradeAiAnalyzerService {
  /**
   * Analyzes an individual trade and its chart, returning structured AI analysis.
   * Optionally auto-applies the details directly into the trade document.
   */
  static async analyzeTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    options: { force?: boolean; autoApply?: boolean } = {}
  ): Promise<ITradeAiAnalysis> {
    const tId = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const [trade, user] = await Promise.all([
      Trade.findOne({ _id: tId, userId: uId }),
      User.findById(uId),
    ]);

    if (!trade) {
      throw new Error(`Trade ${tradeId} not found`);
    }

    // Return cached analysis if already present and not forcing
    if (!options.force && trade.aiAnalysis?.generatedAt) {
      if (options.autoApply && !trade.aiAnalysis.autoApplied) {
        await this.applyAnalysisToTrade(trade, trade.aiAnalysis);
      }
      return trade.aiAnalysis;
    }

    // 1. Gather Trade Execution Metrics
    const direction = trade.direction || 'LONG';
    const entryPrice = trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0;
    const exitPrice = trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice;
    const initialStop = trade.risk?.initialStopLoss;
    const plannedTarget = trade.risk?.plannedTarget;
    const realizedR = trade.calculated?.realizedRMultiple ?? trade.risk?.realizedRMultiple ?? 0;
    const grossPnL = trade.calculated?.grossPnL ?? 0;
    const netPnL = trade.calculated?.netPnL ?? 0;
    const holdingMins = trade.calculated?.holdingTimeMinutes ?? 0;
    const status = trade.status || 'CLOSED';
    const excursion = trade.calculated?.excursion;
    const slippage = trade.calculated?.slippage;
    const stopMoves = trade.calculated?.stopMoveSummary;

    // 2. Fetch Candlestick Price Action Context
    const candleSnapshots = await TradeCandleSnapshot.find({
      userId: uId,
      tradeId: tId,
    }).sort({ resolution: 1 }).lean();

    let candleContextStr = '';
    let candlesToAnalyze: any[] = [];
    if (candleSnapshots.length > 0) {
      // Prefer 5m snapshot, then 1m snapshot, then whatever resolution exists
      const preferredSnap =
        candleSnapshots.find((s) => s.resolution === '5') ||
        candleSnapshots.find((s) => s.resolution === '1') ||
        candleSnapshots[0];

      if (preferredSnap && preferredSnap.candles && preferredSnap.candles.length > 0) {
        const allCandles = preferredSnap.candles;
        const entrySec = trade.entryTime ? Math.floor(new Date(trade.entryTime).getTime() / 1000) : 0;
        const exitSec = trade.exitTime
          ? Math.floor(new Date(trade.exitTime).getTime() / 1000)
          : entrySec > 0
          ? entrySec + 3600
          : 0;

        let entryIdx = -1;
        let exitIdx = -1;

        for (let i = 0; i < allCandles.length; i++) {
          const cSec = allCandles[i].t < 1e11 ? allCandles[i].t : Math.floor(allCandles[i].t / 1000);
          if (entrySec > 0 && cSec <= entrySec) {
            entryIdx = i;
          }
          if (exitSec > 0 && cSec <= exitSec) {
            exitIdx = i;
          }
        }

        // If not found by timestamp, fall back to recent slice
        if (entryIdx < 0) entryIdx = Math.max(0, allCandles.length - 20);
        if (exitIdx < 0) exitIdx = Math.min(allCandles.length - 1, entryIdx + 10);

        const sliceStart = Math.max(0, entryIdx - 15);
        const sliceEnd = Math.min(allCandles.length, (exitIdx >= 0 ? exitIdx : entryIdx) + 10);
        candlesToAnalyze = allCandles.slice(sliceStart, sliceEnd);

        const resLabel = preferredSnap.resolution || '5';
        const formattedCandles = candlesToAnalyze.map((c, idx) => {
          const globalIdx = sliceStart + idx;
          const cSec = c.t < 1e11 ? c.t : Math.floor(c.t / 1000);
          const timeIso = new Date(cSec * 1000).toISOString().replace('T', ' ').substring(11, 16);
          const range = (c.h - c.l).toFixed(2);
          const change = (c.c - c.o).toFixed(2);
          let marker = '';
          if (globalIdx === entryIdx) {
            marker = ` [==> ENTRY: ${trade.direction} @ ${trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice}]`;
          } else if (globalIdx === exitIdx) {
            marker = ` [==> EXIT: Closed @ ${trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice}]`;
          }
          return `${timeIso} UTC | O:${c.o} H:${c.h} L:${c.l} C:${c.c} (rng:${range}, chg:${change})${marker}`;
        });

        candleContextStr =
          `Timeframe ${resLabel}m Candlestick Sequence (${candlesToAnalyze.length} bars centered around trade execution):\n` +
          formattedCandles.join('\n');
      }
    }

    // 3. Search for Chart Attachments (Images, including rasterized SVG auto-charts)
    let chartImageBase64: string | null = null;
    let chartImageMime: string | null = null;

    try {
      const attachments = await Attachment.find({
        userId: uId,
        tradeId: tId,
      }).sort({ createdAt: -1 }).lean();

      // Look for PNG, JPEG, WEBP images, or SVG auto-charts
      const imageAtt = attachments.find((a) =>
        ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'].includes(a.mimeType?.toLowerCase()) ||
        a.category === 'AUTO_CHART'
      );

      if (imageAtt && imageAtt.storedFilename) {
        const storage = getStorage();
        const stream = await storage.read(imageAtt.storedFilename);
        const buffer = await streamToBuffer(stream);

        if (buffer && buffer.length > 0) {
          const isSvg =
            imageAtt.mimeType?.toLowerCase() === 'image/svg+xml' ||
            imageAtt.storedFilename.toLowerCase().endsWith('.svg');

          if (isSvg) {
            try {
              // Convert SVG chart to crisp PNG for Gemini Vision
              const pngBuffer = await sharp(buffer)
                .png({ compressionLevel: 8 })
                .toBuffer();

              if (pngBuffer && pngBuffer.length <= 4 * 1024 * 1024) {
                chartImageBase64 = pngBuffer.toString('base64');
                chartImageMime = 'image/png';
              }
            } catch (svgErr: any) {
              console.warn(`[TradeAiAnalyzer] Failed to rasterize SVG chart to PNG:`, svgErr.message);
            }
          } else if (buffer.length <= 4 * 1024 * 1024) {
            chartImageBase64 = buffer.toString('base64');
            chartImageMime = imageAtt.mimeType;
          }
        }
      }
    } catch (attErr: any) {
      console.warn(`[TradeAiAnalyzer] Could not fetch chart attachment for vision:`, attErr.message);
    }

    // 4. Fetch User's Active Playbook Strategies
    const availableStrategies = await Strategy.find({ userId: uId, isActive: true }).lean();

    // 5. Build Deterministic Quant Analysis (Guaranteed 100% Free Fallback)
    const quantAnalysis = this.generateQuantAnalysis({
      trade,
      direction,
      entryPrice,
      exitPrice,
      initialStop,
      plannedTarget,
      realizedR,
      grossPnL,
      netPnL,
      holdingMins,
      status,
      excursion,
      slippage,
      stopMoves,
      candleContextStr,
      hasVisionImage: Boolean(chartImageBase64),
      availableStrategies,
    });

    // 6. Try Google Gemini Flash Multimodal Synthesis (if key configured)
    let activeKey = '';
    if (user?.aiSettings?.geminiApiKey) {
      activeKey = safeDecryptSecret(user.aiSettings.geminiApiKey) || '';
    }
    if (!activeKey && config.geminiApiKey) {
      activeKey = config.geminiApiKey;
    }

    let finalAnalysis = quantAnalysis;

    if (activeKey && user?.aiSettings?.enabled !== false) {
      try {
        const geminiResult = await this.synthesizeWithGemini({
          apiKey: activeKey,
          userId: uId,
          trade,
          quant: quantAnalysis,
          candleContextStr,
          chartImageBase64,
          chartImageMime,
          availableStrategies,
          preferredModel: user?.aiSettings?.model,
        });

        if (geminiResult) {
          finalAnalysis = geminiResult;
        }
      } catch (geminiErr: any) {
        console.warn(`[TradeAiAnalyzer] Gemini call failed, using quant engine:`, geminiErr.message);
      }
    }

    // 7. Save analysis to trade
    trade.aiAnalysis = finalAnalysis;

    // 8. Auto-Apply if requested or if user preference enabled
    const shouldAutoApply =
      options.autoApply === true ||
      (options.autoApply !== false && user?.aiSettings?.autoApplyTradeDetails === true);

    if (shouldAutoApply) {
      await this.applyAnalysisToTrade(trade, finalAnalysis, { overwrite: options.force === true });
    } else {
      await trade.save();
    }

    return finalAnalysis;
  }

  /**
   * Applies structured AI analysis into trade setup, strategy, thesis, psychology, and tags.
   */
  static async applyAnalysisToTrade(
    tradeOrId: any,
    userIdOrAnalysis?: any,
    analysisOrOptions?: any,
    maybeOptions?: any
  ): Promise<any> {
    let trade: any;
    let userId: mongoose.Types.ObjectId | undefined;
    let ai: ITradeAiAnalysis | undefined;
    let options: { overwrite?: boolean } = {};

    if (tradeOrId && tradeOrId._id) {
      trade = tradeOrId;
      userId = trade.userId;
    }

    if (typeof userIdOrAnalysis === 'string' || userIdOrAnalysis instanceof mongoose.Types.ObjectId) {
      userId = new mongoose.Types.ObjectId(userIdOrAnalysis);
    } else if (
      userIdOrAnalysis &&
      typeof userIdOrAnalysis === 'object' &&
      ('generatedAt' in userIdOrAnalysis || 'setupType' in userIdOrAnalysis || 'executionScore' in userIdOrAnalysis)
    ) {
      ai = userIdOrAnalysis;
    }

    if (analysisOrOptions && typeof analysisOrOptions === 'object') {
      if ('generatedAt' in analysisOrOptions || 'setupType' in analysisOrOptions || 'executionScore' in analysisOrOptions) {
        ai = analysisOrOptions;
      } else if ('overwrite' in analysisOrOptions) {
        options = analysisOrOptions;
      }
    }

    if (maybeOptions && typeof maybeOptions === 'object' && 'overwrite' in maybeOptions) {
      options = maybeOptions;
    }

    if (!trade) {
      const query: any = { _id: tradeOrId };
      if (userId) query.userId = userId;
      trade = await Trade.findOne(query);
    }

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (!userId && trade.userId) {
      userId = trade.userId;
    }

    if (!ai) {
      ai = trade.aiAnalysis;
    }

    if (!ai) {
      throw new Error('No AI analysis available for this trade to apply');
    }

    const overwrite = options?.overwrite === true;

    // 1. Update Strategy and Setup Variant
    const hasStrategy = Boolean(trade.strategyId);
    const hasVariant = Boolean(trade.setup?.variantKey && trade.setup?.variantStatus === 'CLASSIFIED');

    if (!hasStrategy || !hasVariant || overwrite) {
      let availableStrategies: any[] = [];
      try {
        if (Strategy && typeof Strategy.find === 'function' && trade.userId) {
          availableStrategies = (await Strategy.find({ userId: trade.userId, isActive: true }).lean()) || [];
        }
      } catch {
        availableStrategies = [];
      }

      let assignedStrategyId: mongoose.Types.ObjectId | undefined = trade.strategyId;
      let assignedStrategyName: string | undefined = trade.strategyName;
      let assignedVariantKey: string | undefined = trade.setup?.variantKey;

      // 1A. Check if AI analysis directly provided matched strategy/variant
      if (ai.matchedStrategyId || ai.matchedStrategyName) {
        const found = availableStrategies.find(
          (s) =>
            (ai.matchedStrategyId && String(s._id) === String(ai.matchedStrategyId)) ||
            (ai.matchedStrategyName && s.name.toLowerCase() === ai.matchedStrategyName.toLowerCase())
        );
        if (found) {
          assignedStrategyId = found._id;
          assignedStrategyName = found.name;
          if (ai.matchedVariantKey) {
            const v = found.variants?.find((v: any) => v.key.toUpperCase() === ai.matchedVariantKey!.toUpperCase());
            if (v) {
              assignedVariantKey = v.key;
            }
          }
        } else {
          // If no playbook doc in database matches, preserve the direct AI match
          if (ai.matchedStrategyName) assignedStrategyName = ai.matchedStrategyName;
          if (ai.matchedVariantKey) assignedVariantKey = ai.matchedVariantKey;
          if (ai.matchedStrategyId) {
            try {
              assignedStrategyId = new mongoose.Types.ObjectId(ai.matchedStrategyId);
            } catch {
              // Ignore invalid ObjectId format
            }
          }
        }
      }

      // 1B. Try PatternRecognitionService if candles or classification available
      if ((!assignedStrategyId || !assignedVariantKey) && trade._id && trade.userId) {
        try {
          const prResult = await PatternRecognitionService.classifyTrade(trade._id, trade.userId);
          if (prResult?.strategyId && prResult?.variantKey) {
            assignedStrategyId = new mongoose.Types.ObjectId(prResult.strategyId);
            assignedStrategyName = prResult.strategyName;
            assignedVariantKey = prResult.variantKey;
          }
          // PatternRecognitionService may have updated and saved the trade doc; reload to keep __v synchronized
          const freshDoc = await Trade.findById(trade._id);
          if (freshDoc) {
            trade = freshDoc;
          }
        } catch {
          // Fallback to text & direction matching below
        }
      }

      // 1C. Fallback matching against user's active strategies via setupType & direction
      if ((!assignedStrategyId || !assignedVariantKey) && availableStrategies.length > 0) {
        const direction = trade.direction || 'LONG';
        const setupText = (ai.setupType || '').toLowerCase();

        // Find strategy matching direction
        let bestStrategy = availableStrategies.find((s) => {
          const sName = s.name.toLowerCase();
          if (direction === 'LONG' && (sName.includes('bullish') || s.tags?.includes('Bullish'))) return true;
          if (direction === 'SHORT' && (sName.includes('bearish') || s.tags?.includes('Bearish'))) return true;
          return false;
        }) || availableStrategies[0];

        if (bestStrategy) {
          assignedStrategyId = bestStrategy._id;
          assignedStrategyName = bestStrategy.name;

          // Find variant matching setup keywords
          const variants = bestStrategy.variants || [];
          let bestVariant = variants.find((v: any) => {
            const vName = (v.name || '').toLowerCase();
            const vKey = (v.key || '').toLowerCase();
            if (setupText.includes('order block') && (vName.includes('order block') || vKey.includes('ob'))) return true;
            if (setupText.includes('sweep') && (vName.includes('sweep') || vKey.includes('sweep') || vKey.includes('ssl') || vKey.includes('bsl'))) return true;
            if (setupText.includes('breakout') && (vName.includes('breakout') || vKey.includes('bo'))) return true;
            if (setupText.includes('pullback') && (vName.includes('pullback') || vName.includes('retracement') || vKey.includes('eql') || vKey.includes('eqh'))) return true;
            return false;
          }) || variants[0];

          if (bestVariant) {
            assignedVariantKey = bestVariant.key;
          }
        }
      }

      if (assignedStrategyId) {
        trade.strategyId = assignedStrategyId;
        trade.strategyName = assignedStrategyName;
      }

      if (!trade.setup) {
        trade.setup = { variantStatus: 'UNCLASSIFIED' };
      }

      if (assignedVariantKey) {
        trade.setup.variantKey = assignedVariantKey;
        trade.setup.variantStatus = 'CLASSIFIED';
      } else if (ai.setupType) {
        trade.setup.variantKey = ai.setupType.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 30);
        trade.setup.variantStatus = 'CLASSIFIED';
      }

      if (!trade.setup.htfBias) {
        trade.setup.htfBias =
          ai.chartAnalysis?.trendBias ||
          (ai.marketStructure === 'TRENDING_UP' ? 'BULLISH' : ai.marketStructure === 'TRENDING_DOWN' ? 'BEARISH' : 'NEUTRAL');
      }
      if (!trade.setup.executionTimeframe) {
        trade.setup.executionTimeframe = '5m Confirmation';
      }
      if (!trade.setup.patternType && ai.setupType) {
        const allowedPatterns = ['EQUAL_LOWS', 'EQUAL_HIGHS', 'W', 'M', 'OTHER'];
        trade.setup.patternType = allowedPatterns.includes(ai.setupType) ? ai.setupType : 'OTHER';
      }
    }

    // 2. Update Thesis
    if (!trade.thesis) {
      trade.thesis = { confluences: [], customTechnicalLabels: [] };
    }

    if (!trade.thesis.entryRationale || trade.thesis.entryRationale.trim() === '' || overwrite) {
      trade.thesis.entryRationale =
        ai.entryReview?.summary ||
        `Entered ${trade.direction} on ${ai.setupType || trade.setup?.variantKey || 'technical pattern'}`;
    }

    if ((!trade.thesis.stopLossRationale || trade.thesis.stopLossRationale.trim() === '' || overwrite) && ai.riskManagement?.summary) {
      trade.thesis.stopLossRationale = ai.riskManagement.summary;
    }

    if ((!trade.thesis.exitRationale || trade.thesis.exitRationale.trim() === '' || overwrite) && ai.exitReview?.summary) {
      trade.thesis.exitRationale = ai.exitReview.summary;
    }

    if (ai.marketStructure) {
      trade.thesis.marketStructure = ai.marketStructure;
    }

    if (ai.chartAnalysis?.summary && (!trade.thesis.higherTimeframeContext || overwrite)) {
      trade.thesis.higherTimeframeContext = ai.chartAnalysis.summary;
    }

    // Merge confluences
    const existingConfluences = new Set(trade.thesis.confluences || []);
    if (Array.isArray(ai.chartAnalysis?.confluences)) {
      for (const conf of ai.chartAnalysis.confluences) {
        if (conf && typeof conf === 'string' && conf.trim()) {
          existingConfluences.add(conf.trim() as any);
        }
      }
    }
    trade.thesis.confluences = Array.from(existingConfluences);

    // 3. Update Psychology & Discipline
    if (!trade.psychology) {
      trade.psychology = { disciplineScore: 3, checklistCompleted: true, rulesFollowed: true, mistakes: [] };
    }

    if (ai.disciplineScore) {
      trade.psychology.disciplineScore = ai.disciplineScore;
    }

    if (!trade.psychology.lessonsLearned || trade.psychology.lessonsLearned.trim() === '' || overwrite) {
      trade.psychology.lessonsLearned = ai.lessonsLearned;
    }

    // Merge mistakes
    const existingMistakes = new Set(trade.psychology.mistakes || []);
    if (Array.isArray(ai.identifiedMistakes)) {
      for (const m of ai.identifiedMistakes) {
        if (m && typeof m === 'string' && m.trim()) {
          existingMistakes.add(m.trim());
        }
      }
    }
    trade.psychology.mistakes = Array.from(existingMistakes);

    // 4. Merge Tags
    const existingTags = new Set(trade.tags || []);
    if (ai.setupType) {
      existingTags.add(ai.setupType);
    }
    if (trade.strategyName) {
      existingTags.add(trade.strategyName);
    }
    if (trade.setup?.variantKey) {
      existingTags.add(trade.setup.variantKey);
    }
    if (Array.isArray(ai.suggestedTags)) {
      for (const tag of ai.suggestedTags) {
        if (tag && typeof tag === 'string' && tag.trim()) {
          existingTags.add(tag.trim());
        }
      }
    }
    trade.tags = Array.from(existingTags);

    // 5. Update aiAnalysis telemetry
    trade.aiAnalysis = {
      ...(trade.aiAnalysis ? (typeof trade.aiAnalysis.toObject === 'function' ? trade.aiAnalysis.toObject() : trade.aiAnalysis) : {}),
      ...ai,
      autoApplied: true,
      matchedStrategyId: trade.strategyId ? trade.strategyId.toString() : undefined,
      matchedStrategyName: trade.strategyName,
      matchedVariantKey: trade.setup?.variantKey,
    };

    trade.auditLog.push({
      action: 'AI_DETAILS_AUTO_APPLIED',
      timestamp: new Date(),
      changedBy: 'AI Copilot',
      details: {
        modelUsed: ai.modelUsed,
        setupType: ai.setupType,
        strategyName: trade.strategyName,
        variantKey: trade.setup?.variantKey,
        appliedAt: new Date().toISOString(),
      },
    });

    await trade.save();
    return trade;
  }

  /**
   * Deterministic Quantitative Chart & Trade Engine (Runs locally at $0 cost)
   */
  private static generateQuantAnalysis(ctx: {
    trade: any;
    direction: string;
    entryPrice: number;
    exitPrice?: number;
    initialStop?: number;
    plannedTarget?: number;
    realizedR: number;
    grossPnL: number;
    netPnL: number;
    holdingMins: number;
    status: string;
    excursion: any;
    slippage: any;
    stopMoves: any;
    candleContextStr: string;
    hasVisionImage: boolean;
    availableStrategies?: any[];
  }): ITradeAiAnalysis {
    const {
      direction,
      entryPrice,
      exitPrice,
      initialStop,
      plannedTarget,
      realizedR,
      excursion,
      slippage,
      stopMoves,
      holdingMins,
      hasVisionImage,
      candleContextStr,
    } = ctx;

    const mistakes: string[] = [];
    const confluences: string[] = [];
    const suggestedTags: string[] = [];

    // 1. Excursion & Slippage Analysis
    let entryRating: 'EXCELLENT' | 'GOOD' | 'CHASED' | 'EARLY' | 'LATE' = 'GOOD';
    const slipPts = slippage?.slippagePoints ?? 0;
    if (slipPts > 0) {
      entryRating = 'CHASED';
      mistakes.push(`Adverse execution slippage of ${slipPts.toFixed(2)} pts`);
    } else if (excursion?.entryQualityScore && excursion.entryQualityScore >= 80) {
      entryRating = 'EXCELLENT';
      confluences.push('Clean limit execution with minimal adverse heat');
    }

    // 2. Stop Loss & Risk Management
    let stopRating: 'OPTIMAL' | 'TOO_TIGHT' | 'TOO_WIDE' | 'NO_STOP' = 'OPTIMAL';
    if (!initialStop || initialStop === 0) {
      stopRating = 'NO_STOP';
      mistakes.push('No initial stop loss set at entry');
    } else if (stopMoves?.hasWidenedRisk) {
      mistakes.push(`Stop loss was widened during trade (${stopMoves.widenedCount} time(s))`);
      stopRating = 'TOO_WIDE';
    } else if (excursion?.stopEfficiency !== undefined && excursion.stopEfficiency < 0.2 && realizedR < 0) {
      stopRating = 'TOO_TIGHT';
      mistakes.push('Stop placed too tight inside normal market noise');
    }

    // 3. Exit & Profit Taking
    let exitRating: 'OPTIMAL' | 'PREMATURE' | 'GAVE_BACK' | 'TRAILED_OUT' | 'STOPPED_OUT' = 'OPTIMAL';
    const rLeft = excursion?.rLeftOnTable ?? 0;
    const peakMfeR = excursion?.mfeR ?? 0;

    if (realizedR < 0) {
      exitRating = 'STOPPED_OUT';
    } else if (peakMfeR >= 2.0 && realizedR <= 0.3) {
      exitRating = 'GAVE_BACK';
      mistakes.push(`Profit giveback: reached +${peakMfeR.toFixed(1)}R but exited at ${realizedR.toFixed(1)}R`);
    } else if (rLeft >= 1.5) {
      exitRating = 'PREMATURE';
      mistakes.push(`Premature exit: left +${rLeft.toFixed(1)}R on the table`);
    } else if (stopMoves && stopMoves.trailedCount > 0) {
      exitRating = 'TRAILED_OUT';
      confluences.push('Disciplined trailing stop lock');
    }

    // 4. Discipline Score (1 to 5)
    let discipline = 5;
    if (mistakes.length === 1) discipline = 4;
    else if (mistakes.length === 2) discipline = 3;
    else if (mistakes.length >= 3) discipline = 2;
    if (stopMoves?.hasWidenedRisk || stopRating === 'NO_STOP') discipline = Math.min(discipline, 2);

    // 5. Execution Score (1 to 10)
    let execScore = 7.5;
    if (realizedR >= 2.0) execScore += 1.5;
    else if (realizedR > 0) execScore += 0.5;
    else if (realizedR <= -1.0) execScore -= 1.5;
    if (entryRating === 'CHASED') execScore -= 1.0;
    if (exitRating === 'GAVE_BACK') execScore -= 1.5;
    execScore = Math.min(10, Math.max(1, Math.round(execScore * 10) / 10));

    // 6. Setup Type & Market Structure
    const setupType = ctx.trade.setup?.patternType || (direction === 'LONG' ? 'Bullish Pullback & Expansion' : 'Bearish Breakdown & Continuation');
    const marketStructure = direction === 'LONG' ? 'TRENDING_UP' : 'TRENDING_DOWN';

    suggestedTags.push(direction === 'LONG' ? 'Bullish Setup' : 'Bearish Setup');
    if (realizedR >= 2.0) suggestedTags.push('High-R Runner');
    if (discipline >= 4) suggestedTags.push('Disciplined Execution');

    // Match Strategy & Variant from Playbook
    let matchedStrategyName: string | undefined = ctx.trade.strategyName;
    let matchedStrategyId: string | undefined = ctx.trade.strategyId ? String(ctx.trade.strategyId) : undefined;
    let matchedVariantKey: string | undefined = ctx.trade.setup?.variantKey;

    if ((!matchedStrategyName || !matchedVariantKey) && ctx.availableStrategies && ctx.availableStrategies.length > 0) {
      const bestStrat =
        ctx.availableStrategies.find((s: any) => {
          const sName = (s.name || '').toLowerCase();
          if (direction === 'LONG' && (sName.includes('bullish') || s.tags?.includes('Bullish'))) return true;
          if (direction === 'SHORT' && (sName.includes('bearish') || s.tags?.includes('Bearish'))) return true;
          return false;
        }) || ctx.availableStrategies[0];

      if (bestStrat) {
        matchedStrategyId = String(bestStrat._id);
        matchedStrategyName = bestStrat.name;
        if (bestStrat.variants && bestStrat.variants.length > 0) {
          const v = bestStrat.variants.find((v: any) => {
            const vName = (v.name || '').toLowerCase();
            const vKey = (v.key || '').toLowerCase();
            const sType = setupType.toLowerCase();
            return sType.includes(vName) || sType.includes(vKey);
          }) || bestStrat.variants[0];
          matchedVariantKey = v?.key;
        }
      }
    }

    const keyLevels = [
      `Entry: ${entryPrice.toFixed(2)}`,
      initialStop ? `Initial SL: ${initialStop.toFixed(2)}` : 'No SL',
      plannedTarget ? `Target: ${plannedTarget.toFixed(2)}` : 'Discretionary Target',
    ];

    let lesson = 'Strictly honor the initial invalidation level and avoid giving back runners.';
    if (mistakes.length > 0) {
      lesson = `Primary correction: ${mistakes[0]}. Focus on patience at entry and systematic exit rules.`;
    } else if (realizedR > 1.5) {
      lesson = 'Flawless execution according to playbook. Replicate this patience across future setups.';
    }

    return {
      generatedAt: new Date().toISOString(),
      modelUsed: 'deterministic-quant-engine',
      setupType,
      matchedStrategyId,
      matchedStrategyName,
      matchedVariantKey,
      marketStructure,
      executionScore: execScore,
      disciplineScore: discipline,
      confidence: 85,
      chartAnalysis: {
        hasVisionImage,
        candleContext: candleContextStr,
        keyLevelsObserved: keyLevels,
        confluences,
        trendBias: direction === 'LONG' ? 'BULLISH' : 'BEARISH',
        summary: `Quant chart scan: ${direction} trade with ${holdingMins}m holding time. Realized ${realizedR.toFixed(2)}R.`,
      },
      entryReview: {
        rating: entryRating,
        summary: `Entry filled at ${entryPrice.toFixed(2)}${slipPts > 0 ? ` with ${slipPts.toFixed(2)} pts slippage` : ' with clean execution'}.`,
        slippagePoints: slipPts,
      },
      riskManagement: {
        stopPlacementRating: stopRating,
        summary: initialStop
          ? `Stop placed at ${initialStop.toFixed(2)} (${Math.abs(entryPrice - initialStop).toFixed(2)} pts risk).`
          : 'No formal stop loss defined at order placement.',
        riskRewardRatio: plannedTarget && initialStop ? Math.abs((plannedTarget - entryPrice) / (entryPrice - initialStop)) : undefined,
      },
      exitReview: {
        rating: exitRating,
        summary: exitPrice
          ? `Closed at ${exitPrice.toFixed(2)} with realized R of ${realizedR.toFixed(2)}R.`
          : 'Position currently open or managed discretionarily.',
        efficiencyPercent: excursion?.exitEfficiency ? Math.round(excursion.exitEfficiency * 100) : undefined,
        rLeftOnTable: rLeft,
      },
      identifiedMistakes: mistakes,
      suggestedTags,
      lessonsLearned: lesson,
      autoApplied: false,
    };
  }

  /**
   * Multimodal Gemini 2.5 Flash Synthesis (Charts + Price Action + Execution Data)
   */
  private static async synthesizeWithGemini(params: {
    apiKey: string;
    userId?: mongoose.Types.ObjectId;
    trade: any;
    quant: ITradeAiAnalysis;
    candleContextStr: string;
    chartImageBase64: string | null;
    chartImageMime: string | null;
    availableStrategies?: any[];
    preferredModel?: string;
  }): Promise<ITradeAiAnalysis | null> {
    const { apiKey, userId, trade, quant, candleContextStr, chartImageBase64, chartImageMime, availableStrategies, preferredModel } = params;

    const strategiesSummary =
      availableStrategies && availableStrategies.length > 0
        ? availableStrategies
            .map(
              (s: any) =>
                `- Strategy: "${s.name}" (Variants: ${s.variants?.map((v: any) => `"${v.name}" [key: ${v.key}]`).join(', ') || 'Standard'})`
            )
            .join('\n')
        : 'None configured';

    const systemPrompt = `You are SetupMint's Chief Trade Analyst and Institutional Chart Technician.
Analyze this individual trade and its chart thoroughly.
Return ONLY valid JSON matching this exact structure:
{
  "setupType": "Specific technical setup name (e.g. Liquidity Sweep & Retest, Morning Breakout, Mean Reversion to VWAP, Order Block Rejection)",
  "matchedStrategyName": "Exact name of matching strategy from user's playbook if applicable, or null",
  "matchedVariantKey": "Exact key of matching variant from user's playbook (e.g. BULL-SSL-EQL) if applicable, or null",
  "marketStructure": "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "VOLATILE",
  "executionScore": 1 to 10 (decimal allowed, e.g. 8.5),
  "disciplineScore": 1 to 5 (integer),
  "confidence": 0 to 100,
  "chartAnalysis": {
    "trendBias": "BULLISH" | "BEARISH" | "NEUTRAL",
    "keyLevelsObserved": ["Key level 1", "Key level 2"],
    "confluences": ["Technical confluence 1", "Technical confluence 2"],
    "summary": "2-sentence technical summary of the chart structure"
  },
  "entryReview": {
    "rating": "EXCELLENT" | "GOOD" | "CHASED" | "EARLY" | "LATE",
    "summary": "Detailed assessment of entry timing and price action trigger"
  },
  "riskManagement": {
    "stopPlacementRating": "OPTIMAL" | "TOO_TIGHT" | "TOO_WIDE" | "NO_STOP",
    "summary": "Assessment of stop loss placement relative to market structure"
  },
  "exitReview": {
    "rating": "OPTIMAL" | "PREMATURE" | "GAVE_BACK" | "TRAILED_OUT" | "STOPPED_OUT",
    "summary": "Assessment of exit timing and profit capture"
  },
  "identifiedMistakes": ["Specific mistake if any"],
  "suggestedTags": ["Tag 1", "Tag 2"],
  "lessonsLearned": "One high-impact, actionable lesson for future trades"
}`;

    const tradePrompt = `Analyze this trade:
Symbol: ${trade.symbol} (${trade.assetClass || 'EQUITY'})
Direction: ${trade.direction}
Entry Price: ${trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice}
Exit Price: ${trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice ?? 'STILL OPEN'}
Initial Stop: ${trade.risk?.initialStopLoss ?? 'NONE'}
Planned Target: ${trade.risk?.plannedTarget ?? 'NONE'}
Realized R: ${trade.calculated?.realizedRMultiple ?? trade.risk?.realizedRMultiple ?? 0}
Net PnL: ${trade.calculated?.netPnL ?? 0}
Holding Duration: ${trade.calculated?.holdingTimeMinutes ?? 0} minutes
Excursion Metrics: MAE=${trade.calculated?.excursion?.maeR ?? 0}R, MFE=${trade.calculated?.excursion?.mfeR ?? 0}R, Left On Table=${trade.calculated?.excursion?.rLeftOnTable ?? 0}R
Stop Moves: Widened=${trade.calculated?.stopMoveSummary?.widenedCount ?? 0}, Trailed=${trade.calculated?.stopMoveSummary?.trailedCount ?? 0}
Candle Context: ${candleContextStr || 'No raw snapshot'}

User's Playbook Strategies to Match:
${strategiesSummary}`;

    const parts: any[] = [];
    if (chartImageBase64 && chartImageMime) {
      parts.push({
        inlineData: {
          mimeType: chartImageMime,
          data: chartImageBase64,
        },
      });
      parts.push({
        text: `Inspect this trade chart image and the following trade telemetry to provide a professional post-trade analysis:\n${tradePrompt}`,
      });
    } else {
      parts.push({
        text: `Analyze the following trade execution and candlestick data:\n${tradePrompt}`,
      });
    }

    const candidateModels = [
      preferredModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ].filter(Boolean) as string[];

    for (const model of candidateModels) {
      if (userId) {
        AiUsageTrackerService.recordRequest(userId, 'TRADE_ANALYSIS', model).catch(() => {});
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);

        if (!response.ok) {
          if (response.status === 429 && userId) {
            AiUsageTrackerService.recordRateLimit(userId, 'TRADE_ANALYSIS', 'HTTP 429 Gemini Rate Limit Exceeded').catch(() => {});
          }
          continue;
        }

        const resJson: any = await response.json();
        const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        const p = JSON.parse(rawText);

        return {
          generatedAt: new Date().toISOString(),
          modelUsed: chartImageBase64 ? `${model} (Vision)` : model,
          setupType: String(p.setupType || quant.setupType),
          matchedStrategyId: quant.matchedStrategyId,
          matchedStrategyName: p.matchedStrategyName || quant.matchedStrategyName,
          matchedVariantKey: p.matchedVariantKey || quant.matchedVariantKey,
          marketStructure: ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE'].includes(p.marketStructure)
            ? p.marketStructure
            : quant.marketStructure,
          executionScore: Math.min(10, Math.max(1, Number(p.executionScore || quant.executionScore))),
          disciplineScore: Math.min(5, Math.max(1, Number(p.disciplineScore || quant.disciplineScore))),
          confidence: Math.min(100, Math.max(0, Number(p.confidence || 90))),
          chartAnalysis: {
            hasVisionImage: Boolean(chartImageBase64),
            candleContext: candleContextStr,
            keyLevelsObserved: Array.isArray(p.chartAnalysis?.keyLevelsObserved)
              ? p.chartAnalysis.keyLevelsObserved
              : quant.chartAnalysis.keyLevelsObserved,
            confluences: Array.isArray(p.chartAnalysis?.confluences)
              ? p.chartAnalysis.confluences
              : quant.chartAnalysis.confluences,
            trendBias: ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(p.chartAnalysis?.trendBias)
              ? p.chartAnalysis.trendBias
              : quant.chartAnalysis.trendBias,
            summary: String(p.chartAnalysis?.summary || quant.chartAnalysis.summary),
          },
          entryReview: {
            rating: p.entryReview?.rating || quant.entryReview.rating,
            summary: String(p.entryReview?.summary || quant.entryReview.summary),
            slippagePoints: quant.entryReview.slippagePoints,
          },
          riskManagement: {
            stopPlacementRating: p.riskManagement?.stopPlacementRating || quant.riskManagement.stopPlacementRating,
            summary: String(p.riskManagement?.summary || quant.riskManagement.summary),
            riskRewardRatio: quant.riskManagement.riskRewardRatio,
          },
          exitReview: {
            rating: p.exitReview?.rating || quant.exitReview?.rating || 'OPTIMAL',
            summary: String(p.exitReview?.summary || quant.exitReview?.summary || 'Session closed.'),
            efficiencyPercent: quant.exitReview?.efficiencyPercent,
            rLeftOnTable: quant.exitReview?.rLeftOnTable,
          },
          identifiedMistakes: Array.isArray(p.identifiedMistakes) ? p.identifiedMistakes : quant.identifiedMistakes,
          suggestedTags: Array.isArray(p.suggestedTags) ? p.suggestedTags : quant.suggestedTags,
          lessonsLearned: String(p.lessonsLearned || quant.lessonsLearned),
          autoApplied: false,
        };
      } catch {
        clearTimeout(timeout);
      }
    }

    return null;
  }
}
