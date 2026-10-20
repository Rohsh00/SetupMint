import sharp from 'sharp';
import { optimizeImage } from '../apps/api/src/storage/optimize-image.js';

async function runBenchmark() {
  console.log('Generating 2880x1800 Retina-style macOS chart screenshot...');

  // Build a realistic dark-mode trading chart SVG overlay
  const width = 2880;
  const height = 1800;

  // Generate candlesticks and gridlines
  let svgElements = '';

  // Gridlines
  for (let y = 100; y < height; y += 150) {
    svgElements += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#1e293b" stroke-width="2" stroke-dasharray="8,8" />\n`;
  }
  for (let x = 150; x < width; x += 200) {
    svgElements += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#1e293b" stroke-width="2" stroke-dasharray="8,8" />\n`;
  }

  // Candlesticks (green / red)
  const candleCount = 45;
  const candleWidth = 24;
  const step = Math.floor((width - 300) / candleCount);
  let currentPrice = 900;

  for (let i = 0; i < candleCount; i++) {
    const x = 150 + i * step;
    const delta = (Math.random() - 0.48) * 80;
    const open = currentPrice;
    const close = Math.min(Math.max(open + delta, 200), height - 200);
    const high = Math.min(open, close) - Math.random() * 40;
    const low = Math.max(open, close) + Math.random() * 40;
    const isBullish = close < open; // In SVG, lower y is higher price
    const color = isBullish ? '#10b981' : '#ef4444';
    const top = Math.min(open, close);
    const candleHeight = Math.max(Math.abs(close - open), 6);

    // Wick
    svgElements += `<line x1="${x + candleWidth / 2}" y1="${high}" x2="${x + candleWidth / 2}" y2="${low}" stroke="${color}" stroke-width="3" />\n`;
    // Body
    svgElements += `<rect x="${x}" y="${top}" width="${candleWidth}" height="${candleHeight}" fill="${color}" rx="2" />\n`;

    currentPrice = close;
  }

  // Price labels & watermark
  svgElements += `<text x="50" y="80" fill="#f8fafc" font-size="36" font-family="sans-serif" font-weight="bold">BANKNIFTY 5m · SetupMint Trade Journal (Retina 2x)</text>\n`;
  svgElements += `<text x="${width - 350}" y="80" fill="#10b981" font-size="36" font-family="sans-serif" font-weight="bold">48,250.60 +320.15 (+0.67%)</text>\n`;

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgElements}
    </svg>
  `);

  // Create base 2880x1800 dark slate image, composite SVG, and output PNG with embedded sRGB ICC profile
  const originalPngBuffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 }, // Slate 900
    },
  })
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .withMetadata()
    .png({ compressionLevel: 6 })
    .toBuffer();

  const originalSizeMB = (originalPngBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`Original 2880x1800 Retina PNG created: ${originalPngBuffer.length.toLocaleString()} bytes (${originalSizeMB} MB)`);

  console.log('Running optimizeImage()...');
  const t0 = Date.now();
  const result = await optimizeImage(originalPngBuffer, 'image/png', 'png');
  const durationMs = Date.now() - t0;

  const optSizeMB = (result.optimizedBytes / (1024 * 1024)).toFixed(2);
  const savingBytes = result.originalBytes - result.optimizedBytes;
  const savingPct = ((savingBytes / result.originalBytes) * 100).toFixed(2);

  console.log('\n--- Optimization Results ---');
  console.log(`Execution Time:     ${durationMs} ms`);
  console.log(`Was Optimized:      ${result.wasOptimized}`);
  console.log(`Target Format:      ${result.mimeType} (.${result.ext})`);
  console.log(`Original Size:      ${result.originalBytes.toLocaleString()} bytes (${originalSizeMB} MB)`);
  console.log(`Optimized Size:     ${result.optimizedBytes.toLocaleString()} bytes (${optSizeMB} MB)`);
  console.log(`Net Savings:        ${savingBytes.toLocaleString()} bytes (${savingPct}% smaller)`);

  // Verify decoded pixel dimensions
  const meta = await sharp(result.buffer).metadata();
  console.log(`Verified Dimensions: ${meta.width}x${meta.height} (lossless full scale, never downscaled)`);
  console.log(`Has ICC Profile:    ${Boolean(meta.icc)}`);
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
