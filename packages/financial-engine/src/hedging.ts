import Decimal from 'decimal.js';
import { Direction, ITradeFill, TradeOutcome } from '@tradevault/shared';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface HedgedTicketMatchResult {
  entryTicket: string;
  exitTicket: string;
  matchedQuantity: Decimal;
  entryPrice: Decimal;
  exitPrice: Decimal;
  realizedGrossPnL: Decimal;
}

export interface HedgingSummary {
  totalEntryQuantity: Decimal;
  totalExitQuantity: Decimal;
  closedQuantity: Decimal;
  openQuantity: Decimal;
  weightedAvgEntryPrice: Decimal;
  weightedAvgExitPrice?: Decimal;
  realizedGrossPnL: Decimal;
  totalCosts: Decimal;
  realizedNetPnL: Decimal;
  isFullyClosed: boolean;
  isOpen: boolean;
  outcome: TradeOutcome;
  matches: HedgedTicketMatchResult[];
}

/**
 * Calculates execution for a Hedging position model where orders/fills track specific tickets.
 */
export function calculateHedgingExecution(
  direction: Direction,
  fills: ITradeFill[],
  contractMultiplier: number | string | Decimal = 1,
  precision = 2
): HedgingSummary {
  const dMultiplier = new Decimal(contractMultiplier);

  // Group fills by entry vs exit
  const entryFills = fills.filter((f) => f.type === 'ENTRY');
  const exitFills = fills.filter((f) => f.type === 'EXIT');

  let totalEntryQuantity = new Decimal(0);
  let totalEntryCostBasis = new Decimal(0);
  let totalExitQuantity = new Decimal(0);
  let totalExitGrossAmount = new Decimal(0);
  let totalCosts = new Decimal(0);
  let realizedGrossPnL = new Decimal(0);
  const matches: HedgedTicketMatchResult[] = [];

  for (const f of fills) {
    const fee = new Decimal(f.fee ?? 0)
      .plus(f.brokerage ?? 0)
      .plus(f.exchangeFee ?? 0)
      .plus(f.taxes ?? 0);
    totalCosts = totalCosts.plus(fee);
  }

  for (const entry of entryFills) {
    const qty = new Decimal(entry.quantity);
    const price = new Decimal(entry.price);
    totalEntryQuantity = totalEntryQuantity.plus(qty);
    totalEntryCostBasis = totalEntryCostBasis.plus(price.times(qty));
  }

  // Map exits to their ticket or chronological entries
  for (const exit of exitFills) {
    const exitQty = new Decimal(exit.quantity);
    const exitPrice = new Decimal(exit.price);
    totalExitQuantity = totalExitQuantity.plus(exitQty);
    totalExitGrossAmount = totalExitGrossAmount.plus(exitPrice.times(exitQty));

    // Match to entry fill
    const matchedEntry =
      entryFills.find((e) => e.fillId === exit.matchedEntryFillId || e.fillId === exit.fillId) ||
      entryFills[0];

    const entryPrice = matchedEntry ? new Decimal(matchedEntry.price) : exitPrice;

    let gross: Decimal;
    if (direction === 'LONG') {
      gross = exitPrice.minus(entryPrice).times(exitQty).times(dMultiplier);
    } else {
      gross = entryPrice.minus(exitPrice).times(exitQty).times(dMultiplier);
    }

    realizedGrossPnL = realizedGrossPnL.plus(gross);
    matches.push({
      entryTicket: matchedEntry ? matchedEntry.fillId : exit.fillId,
      exitTicket: exit.fillId,
      matchedQuantity: exitQty,
      entryPrice,
      exitPrice,
      realizedGrossPnL: gross,
    });
  }

  const closedQuantity = totalExitQuantity;
  const openQuantity = Decimal.max(0, totalEntryQuantity.minus(closedQuantity));
  const isFullyClosed = totalEntryQuantity.greaterThan(0) && openQuantity.isZero();
  const isOpen = openQuantity.greaterThan(0);

  const weightedAvgEntryPrice = totalEntryQuantity.greaterThan(0)
    ? totalEntryCostBasis.dividedBy(totalEntryQuantity)
    : new Decimal(0);

  const weightedAvgExitPrice = totalExitQuantity.greaterThan(0)
    ? totalExitGrossAmount.dividedBy(totalExitQuantity)
    : undefined;

  const realizedNetPnL = realizedGrossPnL.minus(totalCosts);

  let outcome: TradeOutcome = 'OPEN';
  if (isFullyClosed) {
    if (realizedNetPnL.greaterThan(0)) {
      outcome = 'WIN';
    } else if (realizedNetPnL.lessThan(0)) {
      outcome = 'LOSS';
    } else {
      outcome = 'BREAKEVEN';
    }
  }

  return {
    totalEntryQuantity,
    totalExitQuantity,
    closedQuantity,
    openQuantity,
    weightedAvgEntryPrice,
    weightedAvgExitPrice,
    realizedGrossPnL,
    totalCosts,
    realizedNetPnL,
    isFullyClosed,
    isOpen,
    outcome,
    matches,
  };
}

