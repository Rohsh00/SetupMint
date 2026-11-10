import Decimal from 'decimal.js';

export interface ISanitizeFillsResult<T = any> {
  fills: T[];
  hasChanges: boolean;
  duplicateCount: number;
  originalTotalExits: number;
  sanitizedTotalExits: number;
  totalEntries: number;
}

/**
 * Sanitizes and deduplicates execution fills.
 * Protects against:
 * 1. Duplicate fillIds from repeated webhook syncs.
 * 2. Identical duplicate EXIT fills (same price, quantity, and timestamp).
 * 3. Oversold / excess exits where total exit quantity exceeds total entry quantity.
 */
export function sanitizeTradeFills<T extends {
  fillId?: string;
  type?: 'ENTRY' | 'EXIT' | string;
  price?: number | string | Decimal;
  quantity?: number | string | Decimal;
  timestamp?: string | Date | any;
  fee?: number | string;
  [key: string]: any;
}>(rawFills: any[]): ISanitizeFillsResult<T> {
  if (!Array.isArray(rawFills) || rawFills.length === 0) {
    return {
      fills: [],
      hasChanges: false,
      duplicateCount: 0,
      originalTotalExits: 0,
      sanitizedTotalExits: 0,
      totalEntries: 0,
    };
  }

  let hasChanges = false;
  let duplicateCount = 0;

  // Safely extract plain fields even if fills are Mongoose subdocuments with _doc
  const fills = rawFills.map((f: any) => {
    const raw = typeof f?.toObject === 'function'
      ? f.toObject()
      : (f?._doc ? { ...f._doc } : { ...f });

    return {
      ...raw,
      fillId: raw.fillId ? String(raw.fillId).trim() : `fill_${Math.random().toString(36).slice(2, 8)}`,
      type: String(raw.type || '').toUpperCase().trim(),
      price: Number(raw.price) || 0,
      quantity: Number(raw.quantity) || 0,
      timestamp: raw.timestamp,
    } as T;
  });

  const totalEntries = fills
    .filter((f) => f.type === 'ENTRY')
    .reduce((sum, f) => sum + (Number(f.quantity) || 0), 0);

  const originalTotalExits = fills
    .filter((f) => f.type === 'EXIT')
    .reduce((sum, f) => sum + (Number(f.quantity) || 0), 0);

  // Step 1: Remove exact duplicate fillIds (preserving the first occurrence)
  const seenFillIds = new Set<string>();
  const idDeduplicated: T[] = [];
  for (const fill of fills) {
    const id = fill.fillId ? String(fill.fillId).trim() : '';
    if (id) {
      if (seenFillIds.has(id)) {
        hasChanges = true;
        duplicateCount++;
        continue;
      }
      seenFillIds.add(id);
    }
    idDeduplicated.push(fill);
  }

  // Step 2: Separate entries and exits, remove identical duplicate EXIT fills
  const entries: T[] = [];
  const exits: T[] = [];

  for (const fill of idDeduplicated) {
    if (fill.type === 'ENTRY') {
      entries.push(fill);
    } else if (fill.type === 'EXIT') {
      exits.push(fill);
    } else {
      // Keep any other fill type as is
      entries.push(fill);
    }
  }

  const uniqueExits: T[] = [];
  for (const exit of exits) {
    const exitPrice = Number(exit.price) || 0;
    const exitQty = Number(exit.quantity) || 0;
    const exitTime = exit.timestamp ? new Date(exit.timestamp).getTime() : 0;

    const isIdentical = uniqueExits.some((existing) => {
      const existingPrice = Number(existing.price) || 0;
      const existingQty = Number(existing.quantity) || 0;
      const existingTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;

      const priceMatch = Math.abs(existingPrice - exitPrice) < 0.0001;
      const qtyMatch = Math.abs(existingQty - exitQty) < 0.0001;
      // Timestamp within 5 seconds of each other
      const timeMatch =
        exitTime > 0 && existingTime > 0
          ? Math.abs(existingTime - exitTime) <= 5000
          : true;

      return priceMatch && qtyMatch && timeMatch;
    });

    if (isIdentical) {
      hasChanges = true;
      duplicateCount++;
      continue;
    }
    uniqueExits.push(exit);
  }

  // Step 3: Guard against oversold / excess exits
  // If total exit quantity exceeds total entry quantity, cap or prune excess exits
  let sanitizedExits: T[] = [];
  if (totalEntries > 0) {
    let cumExitQty = 0;
    for (const exit of uniqueExits) {
      const exitQty = Number(exit.quantity) || 0;
      if (cumExitQty >= totalEntries) {
        // Already fully exited: discard any further exits
        hasChanges = true;
        duplicateCount++;
        continue;
      }

      if (cumExitQty + exitQty > totalEntries) {
        // Exceeds total entry: cap this exit to remaining entry quantity
        const remainingAllowed = Number((totalEntries - cumExitQty).toFixed(6));
        if (remainingAllowed > 0) {
          sanitizedExits.push({
            ...exit,
            quantity: remainingAllowed,
          });
          cumExitQty = totalEntries;
          hasChanges = true;
        } else {
          hasChanges = true;
          duplicateCount++;
        }
      } else {
        sanitizedExits.push(exit);
        cumExitQty += exitQty;
      }
    }
  } else {
    sanitizedExits = uniqueExits;
  }

  // Recombine entries and sanitized exits preserving chronological order
  const finalFills = [...entries, ...sanitizedExits].sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tA - tB;
  });

  const sanitizedTotalExits = finalFills
    .filter((f) => f.type === 'EXIT')
    .reduce((sum, f) => sum + (Number(f.quantity) || 0), 0);

  return {
    fills: finalFills,
    hasChanges,
    duplicateCount,
    originalTotalExits,
    sanitizedTotalExits,
    totalEntries,
  };
}
