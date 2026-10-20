import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { optimizeImage, MIN_SAVING_RATIO } from '../src/storage/optimize-image.js';

describe('Server-side Image Optimization Pipeline (optimizeImage)', () => {
  it('optimizes PNG losslessly: decodes to pixel-IDENTICAL raw RGBA data with identical dimensions', async () => {
    // Generate a test chart-like PNG with candlestick colors and shapes
    const width = 300;
    const height = 200;
    const svgOverlay = Buffer.from(`
      <svg width="${width}" height="${height}">
        <rect x="20" y="30" width="15" height="120" fill="#22c55e" />
        <rect x="60" y="50" width="15" height="90" fill="#ef4444" />
        <line x1="27" y1="10" x2="27" y2="170" stroke="#22c55e" stroke-width="2" />
        <line x1="67" y1="20" x2="67" y2="160" stroke="#ef4444" stroke-width="2" />
        <text x="100" y="50" font-family="monospace" font-size="14" fill="#ffffff">NIFTY 5m Bullish FVG</text>
      </svg>
    `);

    const inputPng = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 }, // Slate dark theme
      },
    })
      .composite([{ input: svgOverlay }])
      .png({ compressionLevel: 1 }) // Low compression to test optimization
      .toBuffer();

    const result = await optimizeImage(inputPng, 'image/png', '.png');

    expect(result.originalBytes).toBe(inputPng.length);
    expect(result.wasOptimized).toBe(true);
    expect(result.optimizedBytes).toBeLessThan(inputPng.length);
    expect(result.optimizedBytes).toBeLessThanOrEqual(Math.floor(inputPng.length * (1 - MIN_SAVING_RATIO)));
    expect(['image/webp', 'image/png']).toContain(result.mimeType);
    expect(['webp', 'png']).toContain(result.ext);

    // Verify metadata dimensions match exactly
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.width).toBe(width);
    expect(outMeta.height).toBe(height);

    // PROOF OF LOSSLESSNESS: Decode both input and output to raw RGBA buffers and compare
    const rawIn = await sharp(inputPng).ensureAlpha().raw().toBuffer();
    const rawOut = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
    expect(rawIn.length).toBe(width * height * 4);
    expect(rawOut.length).toBe(width * height * 4);
    expect(rawIn.equals(rawOut)).toBe(true);
  });

  it('guarantees output is never larger than input: returns original when saving < 10%', async () => {
    // A 1x1 fully compressed PNG where further 10% reduction is not possible
    const tinyPng = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();

    const result = await optimizeImage(tinyPng, 'image/png', '.png');

    // Either it saved >= 10% or it returned the exact original buffer
    if (!result.wasOptimized) {
      expect(result.buffer.equals(tinyPng)).toBe(true);
      expect(result.optimizedBytes).toBe(tinyPng.length);
      expect(result.originalBytes).toBe(tinyPng.length);
      expect(result.mimeType).toBe('image/png');
      expect(result.ext).toBe('png');
    } else {
      expect(result.optimizedBytes).toBeLessThanOrEqual(Math.floor(tinyPng.length * (1 - MIN_SAVING_RATIO)));
    }
  });

  it('preserves embedded ICC profile (e.g. Display P3 / sRGB) across optimization', async () => {
    const inputWithIcc = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 34, g: 197, b: 94, alpha: 1 },
      },
    })
      .withMetadata({ icc: 'srgb' })
      .png()
      .toBuffer();

    const inMeta = await sharp(inputWithIcc).metadata();
    expect(inMeta.icc).toBeDefined();

    const result = await optimizeImage(inputWithIcc, 'image/png', '.png');
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.icc).toBeDefined();
  });

  it('passes SVG images through completely unchanged without touching or parsing', async () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#0f172a"/><text x="20" y="40" fill="#22c55e">SetupMint Chart</text></svg>`;
    const svgBuffer = Buffer.from(svgContent, 'utf-8');

    const result = await optimizeImage(svgBuffer, 'image/svg+xml', '.svg');

    expect(result.wasOptimized).toBe(false);
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.ext).toBe('svg');
    expect(result.originalBytes).toBe(svgBuffer.length);
    expect(result.optimizedBytes).toBe(svgBuffer.length);
    expect(result.buffer.equals(svgBuffer)).toBe(true);
  });

  it('fails safely on corrupt or truncated buffer and returns original without throwing', async () => {
    const corruptBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0x00]);

    const result = await optimizeImage(corruptBuffer, 'image/png', '.png');

    expect(result.wasOptimized).toBe(false);
    expect(result.originalBytes).toBe(corruptBuffer.length);
    expect(result.optimizedBytes).toBe(corruptBuffer.length);
    expect(result.mimeType).toBe('image/png');
    expect(result.ext).toBe('png');
    expect(result.buffer.equals(corruptBuffer)).toBe(true);
  });

  it('optimizes JPEG input to high-quality WebP with identical pixel dimensions', async () => {
    const width = 180;
    const height = 120;
    const inputJpeg = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const result = await optimizeImage(inputJpeg, 'image/jpeg', '.jpg');

    if (result.wasOptimized) {
      expect(result.mimeType).toBe('image/webp');
      expect(result.ext).toBe('webp');
      expect(result.optimizedBytes).toBeLessThanOrEqual(Math.floor(inputJpeg.length * (1 - MIN_SAVING_RATIO)));

      const outMeta = await sharp(result.buffer).metadata();
      expect(outMeta.width).toBe(width);
      expect(outMeta.height).toBe(height);
    } else {
      expect(result.buffer.equals(inputJpeg)).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
    }
  });

  it('handles WebP input with lossless repack and keeps identical dimensions', async () => {
    const width = 120;
    const height = 80;
    const inputWebp = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 50, g: 150, b: 250, alpha: 1 },
      },
    })
      .webp({ lossless: true, effort: 1 }) // Low effort initially
      .toBuffer();

    const result = await optimizeImage(inputWebp, 'image/webp', '.webp');

    expect(result.mimeType).toBe('image/webp');
    expect(result.ext).toBe('webp');
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.width).toBe(width);
    expect(outMeta.height).toBe(height);
  });
});
