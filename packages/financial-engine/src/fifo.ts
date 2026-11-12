import Decimal, { roundHalfUp } from './decimal.js';
import { allocateChargesProportionally } from './charges.js';
import { Direction, ITradeFill, TradeOutcome } from '@tradevault/shared';

export interface FIFOMatchResult {
  entryFillId: string;
  exitFillId: string;
  matchedQuantity: Decimal;
  entryPrice: Decimal;
  exitPrice: Decimal;
  realizedGrossPnL: Decimal;
  /** Exact paise-allocated transaction cost attributable to this matched slice */
  allocatedFee: Decimal;
  realizedNetPnL: Decimal;
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
  /** Present only when `allowPositionFlip` is true and an exit exceeded open qty */
  overflowFlipFills?: ITradeFill[];
}

export interface FIFOExecutionOptions {
  /**
   * When true, an EXIT fill larger than current open lots closes the remaining position and emits
   * the excess portion as a reversed opening fill in `overflowFlipFills` instead of throwing.
   */
  allowPositionFlip?: boolean;
}

function getFillTotalFee(fill: ITradeFill): Decimal {
  return new Decimal(fill.fee ?? 0)
    .plus(fill.brokerage ?? 0)
    .plus(fill.exchangeFee ?? 0)
    .plus(fill.taxes ?? 0);
}

/**
 * Stable chronological comparator with ENTRY-before-EXIT tie breaking when timestamps match.
 */
function sortFillsChronologically(fills: ITradeFill[]): ITradeFill[] {
  return fills
    .map((fill, idx) => ({ fill, idx }))
    .sort((a, b) => {
      const ta = new Date(a.fill.timestamp).getTime();
      const tb = new Date(b.fill.timestamp).getTime();
      if (ta !== tb) return ta - tb;
      if (a.fill.type !== b.fill.type) {
        return a.fill.type === 'ENTRY' ? -1 : 1;
      }
      return a.idx - b.idx;
    })
    .map((item) => item.fill);
}

export function calculateFIFOExecution(
  direction: Direction,
  fills: ITradeFill[],
  contractMultiplier: number | string | Decimal = 1,
  precision = 2,
  options: FIFOExecutionOptions = {}
): FIFOSummary {
  const dMultiplier = new Decimal(contractMultiplier);
  const sortedFills = sortFillsChronologically(fills);

  interface OpenLot {
    fillId: string;
    price: Decimal;
    remainingQuantity: Decimal;
    timestamp: string;
  }

  const openLots: OpenLot[] = [];
  const rawMatches: Array<{
    entryFillId: string;
    exitFillId: string;
    matchedQuantity: Decimal;
    entryPrice: Decimal;
    exitPrice: Decimal;
    realizedGrossPnL: Decimal;
    weight: Decimal;
  }> = [];
  const overflowFlipFills: ITradeFill[] = [];

  let totalEntryQuantity = new Decimal(0);
  let totalExitQuantity = new Decimal(0);
  let totalEntryCostBasis = new Decimal(0);
  let totalExitGrossAmount = new Decimal(0);
  let totalCosts = new Decimal(0);
  let rawRealizedGrossPnL = new Decimal(0);

  for (const fill of sortedFills) {
    const fillPrice = new Decimal(fill.price);
    const fillQty = new Decimal(fill.quantity);
    if (fillQty.isNegative()) {
      throw new Error(`Fill ${fill.fillId || ''} quantity cannot be negative`);
    }
    const fillFee = getFillTotalFee(fill);

    if (fill.type === 'ENTRY') {
      totalCosts = totalCosts.plus(fillFee);
      totalEntryQuantity = totalEntryQuantity.plus(fillQty);
      totalEntryCostBasis = totalEntryCostBasis.plus(fillPrice.times(fillQty));
      openLots.push({
        fillId: fill.fillId,
        price: fillPrice,
        remainingQuantity: fillQty,
        timestamp: fill.timestamp,
      });
    } else if (fill.type === 'EXIT') {
      let remainingOpen = openLots.reduce(
        (acc, lot) => acc.plus(lot.remainingQuantity),
        new Decimal(0)
      );

      let closingQty = fillQty;
      let flipExcessQty = new Decimal(0);

      if (closingQty.greaterThan(remainingOpen)) {
        if (!options.allowPositionFlip) {
          const excess = closingQty.minus(remainingOpen);
          throw new Error(
            `Exit fill ${fill.fillId || ''} exceeds available open entry lots by ${excess.toString()}`
          );
        }
        flipExcessQty = closingQty.minus(remainingOpen);
        closingQty = remainingOpen;
      }

      // Split fill fee proportionally if the fill triggered a position flip
      let closingFee = fillFee;
      if (flipExcessQty.greaterThan(0) && fillQty.greaterThan(0)) {
        const [allocCloseFee, allocOpenFee] = allocateChargesProportionally(
          fillFee,
          [closingQty, flipExcessQty],
          precision
        );
        closingFee = allocCloseFee;
        overflowFlipFills.push({
          ...fill,
          fillId: `${fill.fillId}-flip-open`,
          type: 'ENTRY',
          quantity: flipExcessQty.toNumber(),
          fee: allocOpenFee.toNumber(),
          brokerage: 0,
          exchangeFee: 0,
          taxes: 0,
        });
      }

      totalCosts = totalCosts.plus(closingFee);
      totalExitQuantity = totalExitQuantity.plus(closingQty);
      totalExitGrossAmount = totalExitGrossAmount.plus(fillPrice.times(closingQty));

      let qtyToMatch = closingQty;

      while (qtyToMatch.greaterThan(0) && openLots.length > 0) {
        const currentLot = openLots[0];
        const matchQty = Decimal.min(qtyToMatch, currentLot.remainingQuantity);

        const matchGross =
          direction === 'LONG'
            ? fillPrice.minus(currentLot.price).times(matchQty).times(dMultiplier)
            : currentLot.price.minus(fillPrice).times(matchQty).times(dMultiplier);

        rawRealizedGrossPnL = rawRealizedGrossPnL.plus(matchGross);

        rawMatches.push({
          entryFillId: currentLot.fillId,
          exitFillId: fill.fillId,
          matchedQuantity: matchQty,
          entryPrice: currentLot.price,
          exitPrice: fillPrice,
          realizedGrossPnL: roundHalfUp(matchGross, precision),
          weight: matchQty,
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

  const roundedTotalCosts = roundHalfUp(totalCosts, precision);
  const realizedGrossPnL = roundHalfUp(rawRealizedGrossPnL, precision);
  const realizedNetPnL = roundHalfUp(rawRealizedGrossPnL.minus(totalCosts), precision);

  // Allocate costs across closed match slices so slice fees sum cleanly without paise drift
  const sliceFees =
    rawMatches.length > 0 && isFullyClosed
      ? allocateChargesProportionally(
          roundedTotalCosts,
          rawMatches.map((m) => m.weight),
          precision
        )
      : rawMatches.map(() => new Decimal(0));

  const matches: FIFOMatchResult[] = rawMatches.map((m, i) => {
    const allocFee = sliceFees[i] ?? new Decimal(0);
    return {
      entryFillId: m.entryFillId,
      exitFillId: m.exitFillId,
      matchedQuantity: m.matchedQuantity,
      entryPrice: m.entryPrice,
      exitPrice: m.exitPrice,
      realizedGrossPnL: m.realizedGrossPnL,
      allocatedFee: allocFee,
      realizedNetPnL: roundHalfUp(m.realizedGrossPnL.minus(allocFee), precision),
    };
  });

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
    totalCosts: roundedTotalCosts,
    realizedNetPnL,
    isFullyClosed,
    isOpen,
    outcome,
    matches,
    overflowFlipFills: overflowFlipFills.length > 0 ? overflowFlipFills : undefined,
  };
}
