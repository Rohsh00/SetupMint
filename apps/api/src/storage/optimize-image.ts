import sharp from 'sharp';

export interface OptimizedImageResult {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  originalBytes: number;
  optimizedBytes: number;
  wasOptimized: boolean;
}

export const MIN_SAVING_RATIO = 0.10; // At least 10% smaller

interface Candidate {
  buffer: Buffer;
  mimeType: string;
  ext: string;
}

function cleanExtension(ext: string, fallbackMime: string): string {
  const clean = (ext || '').trim().replace(/^\./, '').toLowerCase();
  if (clean) {
    if (clean === 'jpeg') return 'jpg';
    return clean;
  }
  if (fallbackMime === 'image/jpeg') return 'jpg';
  if (fallbackMime === 'image/webp') return 'webp';
  if (fallbackMime === 'image/svg+xml') return 'svg';
  return 'png';
}

/**
 * Optimizes chart screenshots server-side prior to storage in Cloudflare R2.
 *
 * Rules:
 * - image/svg+xml: pass through untouched.
 * - image/png: lossless WebP + lossless PNG repack in parallel; pick smallest if >= 10% saving.
 * - image/jpeg: webp (q: 90, effort: 6, smartSubsample: true) if >= 10% saving.
 * - image/webp: lossless WebP repack if >= 10% saving.
 * - Applies .rotate() and .keepIccProfile() to preserve EXIF orientation and Display P3 profiles.
 * - Never downscales or resizes.
 * - Safe try/catch: on any failure, returns the original buffer without throwing.
 */
export async function optimizeImage(
  input: Buffer,
  mimeType: string,
  fallbackExt: string = ''
): Promise<OptimizedImageResult> {
  const cleanFallback = cleanExtension(fallbackExt, mimeType);
  const originalBytes = input?.length || 0;

  // Edge cases: empty or non-image
  if (!input || originalBytes === 0) {
    return {
      buffer: input,
      mimeType,
      ext: cleanFallback,
      originalBytes,
      optimizedBytes: originalBytes,
      wasOptimized: false,
    };
  }

  // SVGs pass through unchanged
  if (mimeType === 'image/svg+xml') {
    return {
      buffer: input,
      mimeType: 'image/svg+xml',
      ext: 'svg',
      originalBytes,
      optimizedBytes: originalBytes,
      wasOptimized: false,
    };
  }

  try {
    const candidates: Candidate[] = [];

    if (mimeType === 'image/png') {
      // Primary case: lossless WebP candidate & lossless PNG repack candidate in parallel
      const [webpResult, pngResult] = await Promise.allSettled([
        sharp(input, { failOn: 'error' })
          .rotate()
          .keepIccProfile()
          .webp({ lossless: true, effort: 6 })
          .toBuffer(),
        sharp(input, { failOn: 'error' })
          .rotate()
          .keepIccProfile()
          .png({ compressionLevel: 9, effort: 10, palette: false })
          .toBuffer(),
      ]);

      if (webpResult.status === 'fulfilled') {
        candidates.push({
          buffer: webpResult.value,
          mimeType: 'image/webp',
          ext: 'webp',
        });
      }
      if (pngResult.status === 'fulfilled') {
        candidates.push({
          buffer: pngResult.value,
          mimeType: 'image/png',
          ext: 'png',
        });
      }
    } else if (mimeType === 'image/jpeg') {
      // JPEG: WebP with high quality (90) and smart subsampling
      const webpBuf = await sharp(input, { failOn: 'error' })
        .rotate()
        .keepIccProfile()
        .webp({ quality: 90, effort: 6, smartSubsample: true })
        .toBuffer();

      candidates.push({
        buffer: webpBuf,
        mimeType: 'image/webp',
        ext: 'webp',
      });
    } else if (mimeType === 'image/webp') {
      // WebP: Try lossless repack
      const webpBuf = await sharp(input, { failOn: 'error' })
        .rotate()
        .keepIccProfile()
        .webp({ lossless: true, effort: 6 })
        .toBuffer();

      candidates.push({
        buffer: webpBuf,
        mimeType: 'image/webp',
        ext: 'webp',
      });
    }

    if (candidates.length === 0) {
      return {
        buffer: input,
        mimeType,
        ext: cleanFallback,
        originalBytes,
        optimizedBytes: originalBytes,
        wasOptimized: false,
      };
    }

    // Sort candidates by size ascending (smallest first)
    candidates.sort((a, b) => a.buffer.length - b.buffer.length);
    const best = candidates[0];

    // Only swap if it is at least 10% smaller than the original input
    const maxAllowedBytes = Math.floor(originalBytes * (1 - MIN_SAVING_RATIO));

    if (best.buffer.length <= maxAllowedBytes) {
      return {
        buffer: best.buffer,
        mimeType: best.mimeType,
        ext: best.ext,
        originalBytes,
        optimizedBytes: best.buffer.length,
        wasOptimized: true,
      };
    }

    // Not enough savings; keep original
    return {
      buffer: input,
      mimeType,
      ext: cleanFallback,
      originalBytes,
      optimizedBytes: originalBytes,
      wasOptimized: false,
    };
  } catch {
    // Fail-safe: an upload must never fail because optimization failed
    return {
      buffer: input,
      mimeType,
      ext: cleanFallback,
      originalBytes,
      optimizedBytes: originalBytes,
      wasOptimized: false,
    };
  }
}
