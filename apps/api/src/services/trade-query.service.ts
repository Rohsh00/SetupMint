import mongoose from 'mongoose';
import { ExtendedTradeFilter, buildDateRangeClause } from '@tradevault/shared';

const WEEKDAY_TO_MONGO_DAY: Record<string, number> = {
  sunday: 1,
  sun: 1,
  monday: 2,
  mon: 2,
  tuesday: 3,
  tue: 3,
  wednesday: 4,
  wed: 4,
  thursday: 5,
  thu: 5,
  friday: 6,
  fri: 6,
  saturday: 7,
  sat: 7,
};

/**
 * Authoritative query builder translating ExtendedTradeFilter into a MongoDB filter object.
 * Enforces strict tenant isolation by always injecting { userId }.
 */
export function buildTradeMongooseFilter(
  filterInput: (Partial<ExtendedTradeFilter> & { accountIds?: Array<string | mongoose.Types.ObjectId> }) = {},
  userId: string | mongoose.Types.ObjectId
): mongoose.FilterQuery<any> {
  const filter: mongoose.FilterQuery<any> = {
    userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
  };

  const {
    accountId,
    accountIds,
    symbol,
    assetClass,
    direction,
    status,
    outcome,
    strategyId,
    templateId,
    session,
    startDate,
    endDate,
    date,
    dateRange,
    tags,
    variantKey,
    variantStatus,
    entryModel,
    search,
    emotion,
    mistakeTag,
    disciplineScore,
    netPnLMin,
    netPnLMax,
    mfeRMin,
    mfeRMax,
    maeRMin,
    maeRMax,
    holdingTimeMin,
    holdingTimeMax,
    excursionFlag,
    excursionFlags,
    killZone,
    weekday,
    quantityMin,
    quantityMax,
  } = filterInput as any;

  if (Array.isArray(accountIds)) {
    filter.accountId = {
      $in: accountIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)),
    };
  } else if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    filter.accountId = new mongoose.Types.ObjectId(accountId);
  }
  const andClauses: any[] = [];

  if (symbol) {
    const escaped = symbol.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    andClauses.push({
      $or: [
        { symbol: new RegExp(`^${escaped}$`, 'i') },
        { underlying: new RegExp(`^${escaped}$`, 'i') },
        { symbol: new RegExp(`^${escaped}(?:\\d|[-_\\s]|$)`, 'i') },
      ],
    });
  }
  if (assetClass) {
    filter.assetClass = assetClass;
  }
  if (direction) {
    filter.direction = direction;
  }
  if (status) {
    filter.status = status;
  }
  if (outcome) {
    filter['calculated.outcome'] = outcome;
  }

  if (strategyId) {
    if (mongoose.Types.ObjectId.isValid(strategyId)) {
      filter.strategyId = new mongoose.Types.ObjectId(strategyId);
    } else if (strategyId.toLowerCase() === 'unclassified' || strategyId.toLowerCase() === 'none') {
      andClauses.push({
        $or: [{ strategyId: { $exists: false } }, { strategyId: null }],
      });
    }
  }
  if (templateId) {
    filter.templateId = templateId;
  }
  if (session) {
    filter.session = session;
  }
  if (variantKey) {
    if (variantKey.toUpperCase() === 'UNASSIGNED') {
      andClauses.push({
        $or: [
          { 'setup.variantKey': { $exists: false } },
          { 'setup.variantKey': null },
          { 'setup.variantKey': '' },
        ],
      });
    } else {
      filter['setup.variantKey'] = variantKey;
    }
  }
  if (variantStatus) {
    filter['setup.variantStatus'] = variantStatus;
  }
  if (entryModel) {
    filter['setup.entryModel'] = entryModel;
  }

  // Date filtering: single exact date, range, or delimited string
  // All normalized to inclusive IST trading day boundaries on tradeDate
  if (date) {
    const cleanDate = typeof date === 'string' && date.includes('T') ? date.split('T')[0] : date;
    const clause = buildDateRangeClause({ startDate: cleanDate, endDate: cleanDate });
    if (clause.tradeDate) {
      filter.tradeDate = clause.tradeDate;
    }
  } else if (startDate || endDate) {
    const cleanStart = typeof startDate === 'string' && startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const cleanEnd = typeof endDate === 'string' && endDate.includes('T') ? endDate.split('T')[0] : endDate;
    const clause = buildDateRangeClause({ startDate: cleanStart, endDate: cleanEnd });
    if (clause.tradeDate) {
      filter.tradeDate = clause.tradeDate;
    }
  } else if (dateRange && dateRange.includes('..')) {
    const [start, end] = dateRange.split('..');
    const cleanStart = start && start.includes('T') ? start.split('T')[0] : start;
    const cleanEnd = end && end.includes('T') ? end.split('T')[0] : end;
    const clause = buildDateRangeClause({
      startDate: cleanStart || undefined,
      endDate: cleanEnd || undefined,
    });
    if (clause.tradeDate) {
      filter.tradeDate = clause.tradeDate;
    }
  }

  if (tags) {
    const tagList = tags.split(',').map((t: string) => t.trim());
    filter.tags = { $in: tagList };
  }

  if (search) {
    andClauses.push({
      $or: [
        { symbol: new RegExp(search, 'i') },
        { underlying: new RegExp(search, 'i') },
        { instrumentName: new RegExp(search, 'i') },
        { tradeTitle: new RegExp(search, 'i') },
        { 'psychology.notes': new RegExp(search, 'i') },
        { 'thesis.entryRationale': new RegExp(search, 'i') },
      ],
    });
  }

  // Psychology filters
  if (emotion) {
    const upperEmo = emotion.toUpperCase().trim();
    if (upperEmo === 'NEUTRAL') {
      andClauses.push({
        $or: [
          { 'psychology.emotionBefore': { $in: ['NEUTRAL', 'neutral', null] } },
          { 'psychology.emotionBefore': { $exists: false } },
          { 'psychology.emotionDuring': 'NEUTRAL' },
          { 'psychology.emotionAfter': 'NEUTRAL' },
          { 'psychology.emotionalState': 'NEUTRAL' },
          { 'psychology.emotion': 'NEUTRAL' },
        ],
      });
    } else {
      andClauses.push({
        $or: [
          { 'psychology.emotionBefore': new RegExp(`^${upperEmo}$`, 'i') },
          { 'psychology.emotionDuring': new RegExp(`^${upperEmo}$`, 'i') },
          { 'psychology.emotionAfter': new RegExp(`^${upperEmo}$`, 'i') },
          { 'psychology.emotionalState': new RegExp(`^${upperEmo}$`, 'i') },
          { 'psychology.emotion': new RegExp(`^${upperEmo}$`, 'i') },
        ],
      });
    }
  }
  if (mistakeTag) {
    const upperMistake = mistakeTag.toUpperCase().trim();
    const booleanFieldMap: Record<string, string> = {
      REVENGE_TRADING: 'psychology.revengeTrading',
      OVERTRADING: 'psychology.overtrading',
      PREMATURE_EXIT: 'psychology.prematureExit',
      STOP_MOVED: 'psychology.stopLossMoved',
      SIZE_VIOLATION: 'psychology.positionSizeViolation',
    };
    const booleanField = booleanFieldMap[upperMistake];
    if (booleanField) {
      andClauses.push({
        $or: [
          { 'psychology.mistakes': mistakeTag },
          { 'psychology.mistakes': upperMistake },
          { [booleanField]: true },
        ],
      });
    } else {
      filter['psychology.mistakes'] = mistakeTag;
    }
  }
  if (disciplineScore !== undefined && !isNaN(disciplineScore)) {
    andClauses.push({
      $or: [
        { 'psychology.disciplineScore': disciplineScore },
        { 'psychology.disciplineRating': disciplineScore },
      ],
    });
  }

  // Numerical Range Filters
  if (netPnLMin !== undefined || netPnLMax !== undefined) {
    const range: Record<string, number> = {};
    if (netPnLMin !== undefined && !isNaN(netPnLMin)) {
      range.$gte = netPnLMin;
    }
    if (netPnLMax !== undefined && !isNaN(netPnLMax)) {
      range.$lte = netPnLMax;
    }
    if (Object.keys(range).length > 0) {
      filter['calculated.netPnL'] = range;
    }
  }

  if (mfeRMin !== undefined || mfeRMax !== undefined) {
    const range: Record<string, number> = {};
    if (mfeRMin !== undefined && !isNaN(mfeRMin)) {
      range.$gte = mfeRMin;
    }
    if (mfeRMax !== undefined && !isNaN(mfeRMax)) {
      range.$lte = mfeRMax;
    }
    if (Object.keys(range).length > 0) {
      filter['calculated.excursion.mfeR'] = range;
    }
  }

  if (maeRMin !== undefined || maeRMax !== undefined) {
    const range: Record<string, number> = {};
    if (maeRMin !== undefined && !isNaN(maeRMin)) {
      range.$gte = maeRMin;
    }
    if (maeRMax !== undefined && !isNaN(maeRMax)) {
      range.$lte = maeRMax;
    }
    if (Object.keys(range).length > 0) {
      filter['calculated.excursion.maeR'] = range;
    }
  }

  if (holdingTimeMin !== undefined || holdingTimeMax !== undefined) {
    const range: Record<string, number> = {};
    if (holdingTimeMin !== undefined && !isNaN(holdingTimeMin)) {
      range.$gte = holdingTimeMin;
    }
    if (holdingTimeMax !== undefined && !isNaN(holdingTimeMax)) {
      range.$lte = holdingTimeMax;
    }
    if (Object.keys(range).length > 0) {
      filter['calculated.holdingTimeMinutes'] = range;
    }
  }

  if (quantityMin !== undefined || quantityMax !== undefined) {
    const range: Record<string, number> = {};
    if (quantityMin !== undefined && !isNaN(quantityMin)) {
      range.$gte = quantityMin;
    }
    if (quantityMax !== undefined && !isNaN(quantityMax)) {
      range.$lte = quantityMax;
    }
    if (Object.keys(range).length > 0) {
      filter.quantity = range;
    }
  }

  const resolvedExcursionFlag = excursionFlag || excursionFlags;
  if (resolvedExcursionFlag) {
    if (Array.isArray(resolvedExcursionFlag)) {
      filter['calculated.excursion.excursionFlags'] = { $in: resolvedExcursionFlag };
    } else {
      filter['calculated.excursion.excursionFlags'] = resolvedExcursionFlag;
    }
  }

  // Kill-Zone filter based on entryTime / tradeDate
  if (killZone) {
    const kzUpper = String(killZone).toUpperCase().trim();
    const timeField = { $ifNull: ['$entryTime', '$tradeDate'] };
    const utcMinutes = {
      $add: [
        { $multiply: [{ $hour: { date: timeField, timezone: 'UTC' } }, 60] },
        { $minute: { date: timeField, timezone: 'UTC' } },
      ],
    };
    const istMinutes = {
      $add: [
        { $multiply: [{ $hour: { date: timeField, timezone: 'Asia/Kolkata' } }, 60] },
        { $minute: { date: timeField, timezone: 'Asia/Kolkata' } },
      ],
    };

    if (kzUpper === 'LONDON_OPEN') {
      andClauses.push({
        $expr: { $and: [{ $gte: [utcMinutes, 420] }, { $lt: [utcMinutes, 600] }] },
      });
    } else if (kzUpper === 'NY_OPEN') {
      andClauses.push({
        $expr: { $and: [{ $gte: [utcMinutes, 720] }, { $lt: [utcMinutes, 900] }] },
      });
    } else if (kzUpper === 'LONDON_CLOSE') {
      andClauses.push({
        $expr: { $and: [{ $gte: [utcMinutes, 900] }, { $lt: [utcMinutes, 1020] }] },
      });
    } else if (kzUpper === 'LONDON_MIDDAY') {
      andClauses.push({
        $expr: { $and: [{ $gte: [utcMinutes, 600] }, { $lt: [utcMinutes, 720] }] },
      });
    } else if (kzUpper === 'NY_AFTERNOON') {
      andClauses.push({
        $expr: { $and: [{ $gte: [utcMinutes, 1020] }, { $lt: [utcMinutes, 1260] }] },
      });
    } else if (kzUpper === 'ASIA_SESSION') {
      andClauses.push({
        $expr: { $and: [{ $gte: [utcMinutes, 0] }, { $lt: [utcMinutes, 420] }] },
      });
    } else if (kzUpper === 'NSE_OPENING') {
      andClauses.push({
        $expr: { $and: [{ $gte: [istMinutes, 555] }, { $lt: [istMinutes, 615] }] },
      });
    } else if (kzUpper === 'NSE_MIDDAY') {
      andClauses.push({
        $expr: { $and: [{ $gte: [istMinutes, 615] }, { $lt: [istMinutes, 810] }] },
      });
    } else if (kzUpper === 'NSE_POWER_HOUR') {
      andClauses.push({
        $expr: { $and: [{ $gte: [istMinutes, 810] }, { $lte: [istMinutes, 930] }] },
      });
    } else if (kzUpper === 'MCX_EVENING') {
      andClauses.push({
        $expr: { $and: [{ $gte: [istMinutes, 1020] }, { $lte: [istMinutes, 1435] }] },
      });
    }
  }

  // Weekday filter in IST (matching calculateDashboardMetrics / Weekly Review day boundaries)
  if (weekday) {
    const mongoDay = WEEKDAY_TO_MONGO_DAY[weekday.toLowerCase().trim()];
    if (mongoDay) {
      andClauses.push({
        $expr: { $eq: [{ $dayOfWeek: { date: '$tradeDate', timezone: 'Asia/Kolkata' } }, mongoDay] },
      });
    }
  }

  if (andClauses.length > 0) {
    if (filter.$and) {
      filter.$and.push(...andClauses);
    } else {
      filter.$and = andClauses;
    }
  }

  return filter;
}
