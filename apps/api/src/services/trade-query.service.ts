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
  filterInput: Partial<ExtendedTradeFilter> = {},
  userId: string | mongoose.Types.ObjectId
): mongoose.FilterQuery<any> {
  const filter: mongoose.FilterQuery<any> = {
    userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
  };

  const {
    accountId,
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
    weekday,
  } = filterInput;

  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    filter.accountId = new mongoose.Types.ObjectId(accountId);
  }
  if (symbol) {
    filter.symbol = new RegExp(symbol.trim(), 'i');
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
  const andClauses: any[] = [];

  if (strategyId) {
    if (mongoose.Types.ObjectId.isValid(strategyId)) {
      filter.strategyId = new mongoose.Types.ObjectId(strategyId);
    } else if (strategyId === 'unclassified') {
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
    filter['setup.variantKey'] = variantKey;
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
    const clause = buildDateRangeClause({ startDate: date, endDate: date });
    if (clause.tradeDate) {
      filter.tradeDate = clause.tradeDate;
    }
  } else if (startDate || endDate) {
    const clause = buildDateRangeClause({ startDate, endDate });
    if (clause.tradeDate) {
      filter.tradeDate = clause.tradeDate;
    }
  } else if (dateRange && dateRange.includes('..')) {
    const [start, end] = dateRange.split('..');
    const clause = buildDateRangeClause({
      startDate: start || undefined,
      endDate: end || undefined,
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
    andClauses.push({
      $or: [
        { 'psychology.emotionBefore': emotion },
        { 'psychology.emotionDuring': emotion },
        { 'psychology.emotionAfter': emotion },
        { 'psychology.emotionalState': emotion },
        { 'psychology.emotion': emotion },
      ],
    });
  }
  if (mistakeTag) {
    filter['psychology.mistakes'] = mistakeTag;
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
    filter['calculated.netPnL'] = {};
    if (netPnLMin !== undefined && !isNaN(netPnLMin)) {
      filter['calculated.netPnL'].$gte = netPnLMin;
    }
    if (netPnLMax !== undefined && !isNaN(netPnLMax)) {
      filter['calculated.netPnL'].$lte = netPnLMax;
    }
  }

  if (mfeRMin !== undefined || mfeRMax !== undefined) {
    filter['calculated.excursion.mfeR'] = {};
    if (mfeRMin !== undefined && !isNaN(mfeRMin)) {
      filter['calculated.excursion.mfeR'].$gte = mfeRMin;
    }
    if (mfeRMax !== undefined && !isNaN(mfeRMax)) {
      filter['calculated.excursion.mfeR'].$lte = mfeRMax;
    }
  }

  if (maeRMin !== undefined || maeRMax !== undefined) {
    filter['calculated.excursion.maeR'] = {};
    if (maeRMin !== undefined && !isNaN(maeRMin)) {
      filter['calculated.excursion.maeR'].$gte = maeRMin;
    }
    if (maeRMax !== undefined && !isNaN(maeRMax)) {
      filter['calculated.excursion.maeR'].$lte = maeRMax;
    }
  }

  if (holdingTimeMin !== undefined || holdingTimeMax !== undefined) {
    filter['calculated.holdingTimeMinutes'] = {};
    if (holdingTimeMin !== undefined && !isNaN(holdingTimeMin)) {
      filter['calculated.holdingTimeMinutes'].$gte = holdingTimeMin;
    }
    if (holdingTimeMax !== undefined && !isNaN(holdingTimeMax)) {
      filter['calculated.holdingTimeMinutes'].$lte = holdingTimeMax;
    }
  }

  if (excursionFlag) {
    filter['calculated.excursion.excursionFlags'] = excursionFlag;
  }

  // Weekday filter
  if (weekday) {
    const mongoDay = WEEKDAY_TO_MONGO_DAY[weekday.toLowerCase().trim()];
    if (mongoDay) {
      filter.$expr = { $eq: [{ $dayOfWeek: '$tradeDate' }, mongoDay] };
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
