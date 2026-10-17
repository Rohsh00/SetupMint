import Decimal from 'decimal.js';
import { Direction, ITradeFill, TradeOutcome } from '@tradevault/shared';

export interface FIFOMatchResult {
  entryFillId: string;
  exitFillId: string;
  matchedQuantity: Decimal;
  entryPrice: Decimal;
  exitPrice: Decimal;
  realizedGrossPnL: Decimal;
}

export interface FIFOSummary {
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
  matches: FIFOMatchResult[];
}

export function calculateFIFOExecution(
  direction: Direction,
  fills: ITradeFill[],
  contractMultiplier: number | string | Decimal = 1,
  precision = 2
): FIFOSummary {
  const dMultiplier = new Decimal(contractMultiplier);

  // Sort fills chronologically
  const sortedFills = [...fills].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  interface OpenLot {
    fillId: string;
    price: Decimal;
    remainingQuantity: Decimal;
    timestamp: string;
  }

  const openLots: OpenLot[] = [];
  const matches: FIFOMatchResult[] = [];

  let totalEntryQuantity = new Decimal(0);
  let totalExitQuantity = new Decimal(0);
  let totalEntryCostBasis = new Decimal(0);
  let totalExitGrossAmount = new Decimal(0);
  let totalCosts = new Decimal(0);
  let realizedGrossPnL = new Decimal(0);

  for (const fill of sortedFills) {
    const fillPrice = new Decimal(fill.price);
    const fillQty = new Decimal(fill.quantity);
    const fillFee = new Decimal(
      (fill.fee ?? 0) + (fill.brokerage ?? 0) + (fill.exchangeFee ?? 0) + (fill.taxes ?? 0)
    );
    totalCosts = totalCosts.plus(fillFee);

    if (fill.type === 'ENTRY') {
      totalEntryQuantity = totalEntryQuantity.plus(fillQty);
      totalEntryCostBasis = totalEntryCostBasis.plus(fillPrice.times(fillQty));
      openLots.push({
        fillId: fill.fillId,
        price: fillPrice,
        remainingQuantity: fillQty,
        timestamp: fill.timestamp,
      });
    } else if (fill.type === 'EXIT') {
      totalExitQuantity = totalExitQuantity.plus(fillQty);
      totalExitGrossAmount = totalExitGrossAmount.plus(fillPrice.times(fillQty));

      let qtyToMatch = fillQty;

      while (qtyToMatch.greaterThan(0) && openLots.length > 0) {
        const currentLot = openLots[0];
        const matchQty = Decimal.min(qtyToMatch, currentLot.remainingQuantity);

        let matchGross: Decimal;
        if (direction === 'LONG') {
          matchGross = fillPrice.minus(currentLot.price).times(matchQty).times(dMultiplier);
        } else {
          matchGross = currentLot.price.minus(fillPrice).times(matchQty).times(dMultiplier);
        }

        realizedGrossPnL = realizedGrossPnL.plus(matchGross);

        matches.push({
          entryFillId: currentLot.fillId,
          exitFillId: fill.fillId,
          matchedQuantity: matchQty,
          entryPrice: currentLot.price,
          exitPrice: fillPrice,
          realizedGrossPnL: matchGross,
        });

        qtyToMatch = qtyToMatch.minus(matchQty);
        currentLot.remainingQuantity = currentLot.remainingQuantity.minus(matchQty);

        if (currentLot.remainingQuantity.isZero()) {
          openLots.shift();
        }
      }
    }
  }

  const closedQuantity = totalExitQuantity;
  const openQuantity = totalEntryQuantity.minus(totalExitQuantity);
  const isFullyClosed = totalEntryQuantity.greaterThan(0) && openQuantity.isZero();
  const isOpen = openQuantity.greaterThan(0);

  const weightedAvgEntryPrice = totalEntryQuantity.greaterThan(0)
    ? totalEntryCostBasis.dividedBy(totalEntryQuantity)
    : new Decimal(0);

  const weightedAvgExitPrice = totalExitQuantity.greaterThan(0)
    ? totalExitGrossAmount.dividedBy(totalExitQuantity)
    : undefined;

  const realizedNetPnL = realizedGrossPnL.minus(totalCosts);

  let outcome: TradeOutcome = 'BREAKEVEN';
  if (!isFullyClosed && !totalExitQuantity.greaterThan(0)) {
    outcome = 'OPEN';
  } else if (realizedNetPnL.greaterThan(0)) {
    outcome = 'WIN';
  } else if (realizedNetPnL.lessThan(0)) {
    outcome = 'LOSS';
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
