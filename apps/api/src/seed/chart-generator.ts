import mongoose from 'mongoose';
import { Attachment, IAttachmentDoc } from '../db/models/Attachment.js';
import { getStorage } from '../storage/index.js';

export interface GeneratedChartSpec {
  tradeSymbol: string;
  category: 'SETUP' | 'ENTRY' | 'EXIT' | 'REVIEW' | 'AUTO_CHART';
  timeframe: string;
  description: string;
  themeColor: 'emerald' | 'rose' | 'blue' | 'amber';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
}

export class ChartGenerator {
  /**
   * Generates a sleek, dark-themed TradingView-style SVG chart and persists directly to cloud storage (R2/S3) and DB.
   */
  static async createSyntheticChart(
    userId: mongoose.Types.ObjectId,
    tradeId: mongoose.Types.ObjectId,
    spec: GeneratedChartSpec
  ): Promise<IAttachmentDoc> {
    const filename = `demo_chart_${tradeId.toString()}_${spec.category.toLowerCase()}_${Date.now()}.svg`;

    const isBullish = spec.themeColor === 'emerald' || spec.themeColor === 'blue';
    const mainColor = isBullish ? '#10b981' : '#f43f5e';
    const stopColor = '#ef4444';
    const targetColor = '#10b981';

    const svgContent = `<svg width="800" height="450" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${mainColor}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${mainColor}" stop-opacity="0.0"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="800" height="450" fill="url(#bg)" />

  <!-- Grid lines -->
  <line x1="60" y1="90" x2="740" y2="90" stroke="#1e293b" stroke-width="1" stroke-dasharray="4" />
  <line x1="60" y1="170" x2="740" y2="170" stroke="#1e293b" stroke-width="1" stroke-dasharray="4" />
  <line x1="60" y1="250" x2="740" y2="250" stroke="#1e293b" stroke-width="1" stroke-dasharray="4" />
  <line x1="60" y1="330" x2="740" y2="330" stroke="#1e293b" stroke-width="1" stroke-dasharray="4" />

  <!-- Header & Symbol -->
  <text x="70" y="45" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#f8fafc">${spec.tradeSymbol} • ${spec.timeframe} • FYERS</text>
  <rect x="360" y="30" width="70" height="22" rx="4" fill="${mainColor}" fill-opacity="0.2" />
  <text x="395" y="45" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="${mainColor}" text-anchor="middle">${spec.category}</text>
  <text x="730" y="45" font-family="system-ui, sans-serif" font-size="12" fill="#64748b" text-anchor="end">SetupMint Demo Journal</text>

  <!-- Candlesticks Simulation -->
  <!-- Candle 1 -->
  <line x1="120" y1="200" x2="120" y2="310" stroke="#64748b" stroke-width="1.5" />
  <rect x="110" y="220" width="20" height="70" fill="#f43f5e" rx="2" />
  <!-- Candle 2 -->
  <line x1="170" y1="230" x2="170" y2="340" stroke="#64748b" stroke-width="1.5" />
  <rect x="160" y="250" width="20" height="80" fill="#f43f5e" rx="2" />
  <!-- Candle 3 (Support wick / Reversal) -->
  <line x1="220" y1="280" x2="220" y2="370" stroke="#64748b" stroke-width="1.5" />
  <rect x="210" y="290" width="20" height="30" fill="#10b981" rx="2" />
  <!-- Candle 4 (Momentum expansion) -->
  <line x1="270" y1="210" x2="270" y2="310" stroke="#64748b" stroke-width="1.5" />
  <rect x="260" y="220" width="20" height="75" fill="#10b981" rx="2" />
  <!-- Candle 5 (Entry Candle) -->
  <line x1="320" y1="170" x2="320" y2="250" stroke="#64748b" stroke-width="1.5" />
  <rect x="310" y="180" width="20" height="60" fill="#10b981" rx="2" />
  <!-- Candle 6 -->
  <line x1="370" y1="150" x2="370" y2="210" stroke="#64748b" stroke-width="1.5" />
  <rect x="360" y="160" width="20" height="40" fill="#f43f5e" rx="2" />
  <!-- Candle 7 -->
  <line x1="420" y1="120" x2="420" y2="180" stroke="#64748b" stroke-width="1.5" />
  <rect x="410" y="130" width="20" height="45" fill="#10b981" rx="2" />
  <!-- Candle 8 (Target hit) -->
  <line x1="470" y1="90" x2="470" y2="150" stroke="#64748b" stroke-width="1.5" />
  <rect x="460" y="100" width="20" height="40" fill="#10b981" rx="2" />

  <!-- Price Levels -->
  <!-- Target line -->
  <line x1="60" y1="100" x2="740" y2="100" stroke="${targetColor}" stroke-width="2" stroke-dasharray="6,4" />
  <rect x="670" y="88" width="70" height="24" rx="4" fill="${targetColor}" />
  <text x="705" y="104" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">TP: ${spec.targetPrice}</text>

  <!-- Entry line -->
  <line x1="60" y1="210" x2="740" y2="210" stroke="#38bdf8" stroke-width="2" />
  <rect x="670" y="198" width="70" height="24" rx="4" fill="#0284c7" />
  <text x="705" y="214" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">ENT: ${spec.entryPrice}</text>

  <!-- Stop loss line -->
  <line x1="60" y1="320" x2="740" y2="320" stroke="${stopColor}" stroke-width="2" stroke-dasharray="6,4" />
  <rect x="670" y="308" width="70" height="24" rx="4" fill="${stopColor}" />
  <text x="705" y="324" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">SL: ${spec.stopPrice}</text>

  <!-- Footer description -->
  <rect x="60" y="390" width="680" height="35" rx="6" fill="#1e293b" fill-opacity="0.8" />
  <text x="80" y="412" font-family="system-ui, sans-serif" font-size="12" fill="#cbd5e1">${spec.description}</text>
</svg>`;

    const svgBuffer = Buffer.from(svgContent, 'utf-8');
    const storage = getStorage();

    // Persist to cloud storage
    await storage.save(filename, svgBuffer, 'image/svg+xml');

    const doc = await Attachment.create({
      userId,
      tradeId,
      originalName: `${spec.tradeSymbol}_${spec.category}_${spec.timeframe}.svg`,
      storedFilename: filename,
      mimeType: 'image/svg+xml',
      sizeBytes: svgBuffer.length,
      category: spec.category,
      description: spec.description,
      timeframe: spec.timeframe,
    });

    return doc;
  }
}
