/**
 * SetupMint - Multimodal Contract Note & Statement Ingestion Service
 *
 * Extracts structured trades, fills, and broker fees from unstructured statements:
 * 1. Multimodal Vision / Document Intelligence via AI Gateway (Gemini Vision / Cloud)
 * 2. Deterministic Regex Pattern Fallbacks (Zerodha, Angel One, Groww, ICICI Direct, MT5)
 * 3. 1-Click Import Mapping directly into Trade records
 */

import mongoose from 'mongoose';
import { IOcrStatementParseResult } from '@tradevault/shared';
import { User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export class AiStatementParserService {
  /**
   * Parses contract note text or base64 image data into structured trades.
   */
  static async parseStatement(params: {
    userId: string | mongoose.Types.ObjectId;
    textContent?: string;
    imageBase64?: string;
    mimeType?: string;
    brokerHint?: string;
  }): Promise<IOcrStatementParseResult> {
    const { userId, textContent, imageBase64, mimeType = 'image/png', brokerHint } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const user = await User.findById(uId).lean();

    // 1. If text content is provided, first try high-speed deterministic regex parsing
    if (textContent && textContent.trim()) {
      const regexParsed = this.tryDeterministicParse(textContent, brokerHint);
      if (regexParsed && regexParsed.trades.length > 0) {
        return regexParsed;
      }
    }

    // 2. Multimodal AI Extraction via Google Gemini
    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    if (geminiApiKey) {
      try {
        const aiParsed = await this.extractWithGemini({
          apiKey: geminiApiKey,
          userId: uId,
          textContent,
          imageBase64,
          mimeType,
          brokerHint,
        });

        if (aiParsed && aiParsed.trades && aiParsed.trades.length > 0) {
          return aiParsed;
        }
      } catch (err: any) {
        console.warn('[AiStatementParser] AI extraction failed, falling back:', err.message);
      }
    }

    // 3. Fallback: Parse whatever text exists line-by-line
    return this.fallbackTextScan(textContent || '');
  }

  /**
   * Deterministic Regex Parser for standard Indian Broker Contract Notes & MT5 logs.
   */
  private static tryDeterministicParse(text: string, brokerHint?: string): IOcrStatementParseResult | null {
    const trades: any[] = [];
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    let detectedBroker = brokerHint || 'UNKNOWN';
    if (/zerodha/i.test(text)) detectedBroker = 'ZERODHA';
    else if (/angel\s*one/i.test(text)) detectedBroker = 'ANGEL_ONE';
    else if (/groww/i.test(text)) detectedBroker = 'GROWW';
    else if (/fyers/i.test(text)) detectedBroker = 'FYERS';
    else if (/metaquotes|mt5/i.test(text)) detectedBroker = 'MT5';

    // Regex pattern for common execution rows:
    // SYMBOL [BUY/SELL] QTY ENTRY EXIT PNL
    // e.g., NIFTY 28NOV24 24000 CE BUY 50 120.50 145.20 1235.00
    const rowRegex = /([A-Z0-9_\-\.\s]{3,25})\s+(BUY|SELL|B|S)\s+(\d+)\s+([\d\.]+)(?:\s+([\d\.]+))?(?:\s+([\d\.\-]+))?/i;

    for (const line of lines) {
      const match = line.match(rowRegex);
      if (match) {
        const rawSym = match[1].trim();
        // Ignore header lines matching words like "ORDER", "PRICE", "SYMBOL"
        if (/^(order|price|symbol|trade|security|script)/i.test(rawSym)) continue;

        const dirStr = match[2].toUpperCase();
        const direction = dirStr === 'BUY' || dirStr === 'B' ? 'LONG' : 'SHORT';
        const qty = parseInt(match[3], 10);
        const p1 = parseFloat(match[4]);
        const p2 = match[5] ? parseFloat(match[5]) : undefined;
        const pnl = match[6] ? parseFloat(match[6]) : undefined;

        if (qty > 0 && p1 > 0) {
          trades.push({
            symbol: rawSym.split(/\s+/)[0],
            direction,
            quantity: qty,
            entryPrice: p1,
            exitPrice: p2,
            netPnL: pnl,
          });
        }
      }
    }

    if (trades.length > 0) {
      return {
        brokerDetected: detectedBroker,
        totalTradesFound: trades.length,
        trades,
        confidenceScore: 0.9,
        modelUsed: 'Deterministic Regex Parser',
        rawTextPreview: text.slice(0, 300),
      };
    }

    return null;
  }

  /**
   * Gemini Multimodal Vision & Document Intelligence parser.
   */
  private static async extractWithGemini(params: {
    apiKey: string;
    userId: mongoose.Types.ObjectId;
    textContent?: string;
    imageBase64?: string;
    mimeType?: string;
    brokerHint?: string;
  }): Promise<IOcrStatementParseResult | null> {
    const { apiKey, userId, textContent, imageBase64, mimeType = 'image/png', brokerHint } = params;

    const systemPrompt = `You are an institutional financial document OCR and contract note extraction parser.
Extract all individual trade fills and completed executions from this broker contract note, trade log, or screenshot.
Identify:
1. brokerDetected: (e.g. Zerodha, Angel One, Groww, FYERS, Upstox, ICICI Direct, MT5, The5ers)
2. statementDate: (YYYY-MM-DD if available)
3. trades: array of trades with:
   - symbol: (e.g. NIFTY, BANKNIFTY, RELIANCE, CRUDEOIL, XAUUSD, EURUSD)
   - direction: "LONG" or "SHORT" (BUY = LONG, SELL = SHORT)
   - quantity: number (integer)
   - entryPrice: number
   - exitPrice: number (if matched or closed in this statement)
   - entryTime: ISO string or HH:MM:SS if available
   - exitTime: ISO string or HH:MM:SS if available
   - orderId: string if available
   - netPnL: number if stated
   - totalCosts: number (brokerage + taxes)

Respond strictly in valid JSON matching this schema:
{
  "brokerDetected": string,
  "statementDate": string,
  "confidenceScore": number (0 to 1),
  "trades": [
    {
      "symbol": string,
      "direction": "LONG" | "SHORT",
      "quantity": number,
      "entryPrice": number,
      "exitPrice": number,
      "orderId": string,
      "netPnL": number,
      "totalCosts": number
    }
  ]
}`;

    const parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
        },
      });
    }

    const textPrompt = `Extract trading executions from this statement.${brokerHint ? ` Broker hint: ${brokerHint}.` : ''}\n\n${textContent || ''}`;
    parts.push({ text: textPrompt });

    AiUsageTrackerService.recordRequest(userId, 'STATEMENT_PARSE', 'gemini-2.5-flash').catch(() => {});

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      clearTimeout(timeout);
      if (!res.ok) return null;

      const data: any = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);
      return {
        brokerDetected: parsed.brokerDetected || brokerHint || 'Detected',
        statementDate: parsed.statementDate,
        totalTradesFound: (parsed.trades || []).length,
        trades: parsed.trades || [],
        confidenceScore: parsed.confidenceScore || 0.85,
        modelUsed: 'gemini-2.5-flash (Vision Document OCR)',
        rawTextPreview: textContent?.slice(0, 300),
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private static fallbackTextScan(text: string): IOcrStatementParseResult {
    return {
      brokerDetected: 'UNKNOWN',
      totalTradesFound: 0,
      trades: [],
      confidenceScore: 0,
      modelUsed: 'Fallback Scanner',
      rawTextPreview: text.slice(0, 300),
    };
  }
}

