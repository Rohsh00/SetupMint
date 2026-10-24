# SetupMint — Database Schema Specification

This document provides the exhaustive specification for all MongoDB collections and Mongoose ODM models in **SetupMint**, grounded directly in the source models located under [`apps/api/src/db/models/`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/).

---

## 1. Schema Overview

SetupMint defines 15 core Mongoose models:
1. `User` — Trader identity, password hash, preferences, and discipline risk guardrails.
2. `Session` — Stateful authentication tokens with SHA-256 token hashing, sliding renewal, absolute cap, and exact MongoDB TTL expiration (`expireAfterSeconds: 0`).
3. `TradingAccount` — Segregated multi-broker ledgers with exact `Decimal128` balance fields.
4. `AccountTransaction` — Capital deposits, withdrawals, transfers, and adjustments.
5. `Trade` — Master trade ledger recording execution fills, risk metrics, SMC thesis, psychology, excursion analytics, and audit logs.
6. `Instrument` — Multi-asset instrument catalog with contract multipliers and lot sizes.
7. `Strategy` — Discretionary strategy playbooks with rules, invalidation, and checklists.
8. `DailyJournal` — Daily session reviews, market biases, and reflection ratings.
9. `Attachment` — Metadata for chart screenshots stored in private Cloudflare R2 bucket.
10. `BrokerIntegration` — Broker connectivity status and sync history logs.
11. `BrokerImportMapping` — Saved per-broker CSV column mappings, unique per `userId+broker+importKind`.
12. `AuditLog` — General audit trail entries for administrative tracking.
13. `TradeTemplate` — Market-based, rule-driven trade setup templates with dynamic SL/target formulas and trade performance aggregation.
14. `BrokerFundsSnapshot` — Immutable FYERS fund-limit snapshots with exact `Decimal128` balances.
15. `TradeCandleSnapshot` — Cached 1m/5m FYERS historical candlestick snapshots during trade lifecycles for excursion calculation.

---

## 2. Model Specifications

### 2.1 User Model (`User.ts`)
- **Collection Name:** `users`
- **File:** [`apps/api/src/db/models/User.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/User.ts)

| Field Name | Type | Required | Default | Indexes / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Unique user identifier |
| `email` | `String` | **Yes** | — | Unique, lowercase, trim | User login email address |
| `passwordHash` | `String` | **Yes** | — | — | Bcrypt hashed password (cost: 10) |
| `name` | `String` | **Yes** | — | Trim | User display name |
| `baseCurrency` | `String` | No | `'INR'` | Trim | Account baseline reporting currency |
| `theme` | `String` | No | `'dark'` | Enum: `['dark', 'light', 'system']` | User interface color theme |
| `riskSettings` | `Object` | No | Embedded | Subdocument | User discipline & risk guardrails |
| `riskSettings.maxDailyLoss` | `Number` | No | `5000` | — | Max allowable daily loss amount (INR) |
| `riskSettings.maxDailyTrades` | `Number` | No | `6` | — | Max allowed trades per calendar day |
| `riskSettings.maxOpenTrades` | `Number` | No | `3` | — | Max concurrent active positions |
| `riskSettings.maxRiskPerTradePercent` | `Number` | No | `2.0` | — | Max risk % of account equity per trade |
| `riskSettings.revengeTradingMinutes` | `Number` | No | `30` | — | Lookback window (minutes) after loss |
| `createdAt` | `Date` | Auto | Current Time | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | Current Time | — | Mongoose timestamp |

---

### 2.2 Session Model (`Session.ts`)
- **Collection Name:** `sessions`
- **File:** [`apps/api/src/db/models/Session.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/Session.ts)

| Field Name | Type | Required | Default | Indexes / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Session identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Associated user ID |
| `tokenHash` | `String` | No (Auto) | — | Unique, Sparse, Indexed | SHA-256 hex hash of the presented 64-char hex random token |
| `token` | `String` | No | — | Sparse | Legacy plaintext token (auto-migrated and upgraded to `tokenHash` on first access) |
| `expiresAt` | `Date` | **Yes** | — | **TTL Index (`expireAfterSeconds: 0`)** | Auto-purged by MongoDB background thread exactly when `expiresAt` is reached |
| `absoluteExpiresAt` | `Date` | No | — | — | Hard session cap from session creation (default 365 days); session terminates once reached |
| `lastUsedAt` | `Date` | No | Current Time | — | Last activity timestamp (used to calculate remaining idle lifetime and trigger renewal) |
| `userAgent` | `String` | No | — | — | Client user-agent string |
| `ipAddress` | `String` | No | — | — | Client IP address |
| `createdAt` | `Date` | Auto | Current Time | — | Session creation timestamp |

---

### 2.3 TradingAccount Model (`TradingAccount.ts`)
- **Collection Name:** `tradingaccounts`
- **File:** [`apps/api/src/db/models/TradingAccount.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/TradingAccount.ts)

| Field Name | Type | Required | Default | Indexes / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Account identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Account owner ID |
| `name` | `String` | **Yes** | — | Trim, Compound unique (`userId` + `name`) | Account display name |
| `broker` | `String` | **Yes** | — | Trim | Broker name (e.g. FYERS, Zerodha) |
| `accountNumber` | `String` | No | — | Trim | Broker account/client ID |
| `accountType` | `String` | No | `'EQUITY'` | Enum: `['EQUITY', 'COMMODITY', 'FUTURES_OPTIONS', 'FOREX', 'CRYPTO', 'PROP_FIRM', 'DEMO', 'OTHER']` | Segment classification |
| `baseCurrency` | `String` | No | `'INR'` | Trim | Account currency |
| `initialBalance` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | Starting capital balance |
| `currentBalance` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | Current authoritative balance |
| `realizedPnL` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | Cumulative net realized P&L |
| `totalDeposits` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | Cumulative cash deposits |
| `totalWithdrawals`| `Decimal128` | No | `0.00` | Exact 128-bit decimal | Cumulative cash withdrawals |
| `totalAdjustments` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | Cumulative signed adjustments |
| `brokerLink` | `Object` | No | — | Embedded subdocument | Optional FYERS account link |
| `brokerLink.broker` | `String` | No | — | Enum: `['FYERS']` | Linked broker |
| `brokerLink.clientId` | `String` | No | — | Trim | FYERS client ID |
| `brokerLink.linkedAt` | `Date` | No | — | — | Link timestamp |
| `status` | `String` | No | `'ACTIVE'` | Enum: `['ACTIVE', 'ARCHIVED']`, Indexed | Lifecycle status |
| `riskRules` | `Object` | No | — | Embedded subdocument | Account-level risk parameters |
| `riskRules.maxDailyLoss` | `Number` | No | — | — | Max allowable daily loss limit |
| `riskRules.maxRiskPerTradePercent` | `Number` | No | — | — | Max risk % per position |
| `riskRules.maxOpenTrades` | `Number` | No | — | — | Max concurrent open positions |
| `notes` | `String` | No | — | — | User notes |

**Compound Indexes:**
- `{ userId: 1, name: 1 }` (Unique constraint)

---

### 2.4 AccountTransaction Model (`AccountTransaction.ts`)
- **Collection Name:** `accounttransactions`
- **File:** [`apps/api/src/db/models/AccountTransaction.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/AccountTransaction.ts)

| Field Name | Type | Required | Default | Indexes / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Transaction identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Transaction owner ID |
| `accountId` | `ObjectId` | **Yes** | — | Ref: `'TradingAccount'`, Indexed | Target trading account |
| `type` | `String` | **Yes** | — | Enum: `['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'ADJUSTMENT']` | Transaction classification |
| `amount` | `Decimal128` | **Yes** | — | Exact 128-bit decimal | Monetary transaction amount |
| `currency` | `String` | No | `'INR'` | — | Transaction currency |
| `date` | `Date` | **Yes** | — | Indexed | Effective date |
| `notes` | `String` | No | — | — | User notes |
| `source` | `String` | No | `'MANUAL'` | Enum: `['MANUAL', 'BROKER_LEDGER_IMPORT', 'BROKER_SYNC']` | Transaction origin |
| `status` | `String` | No | `'CONFIRMED'` | Enum: `['CONFIRMED', 'PENDING_REVIEW', 'REJECTED']` | Reconciliation status; legacy missing values are treated as confirmed |
| `idempotencyKey` | `String` | No | — | Partial unique index | SHA-256 duplicate-prevention key |
| `importBatchId` | `String` | No | — | Indexed | Import batch identifier for undo |

**Compound Indexes:**
- `{ userId: 1, accountId: 1, date: -1 }`
- `{ userId: 1, accountId: 1, idempotencyKey: 1 }` (Unique, partial on string keys)
- `{ userId: 1, accountId: 1, importBatchId: 1 }`

---

### 2.5 Trade Model (`Trade.ts`)
- **Collection Name:** `trades`
- **File:** [`apps/api/src/db/models/Trade.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/Trade.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Trade identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Trade owner ID |
| `accountId` | `ObjectId` | **Yes** | — | Ref: `'TradingAccount'`, Indexed | Associated trading account |
| `instrumentId` | `ObjectId` | No | — | Ref: `'Instrument'` | Linked underlying instrument ID |
| `underlying` | `String` | No | — | Uppercase, trim, Indexed | Normalized underlying ticker (e.g. NIFTY) |
| `symbol` | `String` | **Yes** | — | Uppercase, trim, Indexed | Traded contract or symbol (e.g. NIFTY24OCT24500CE) |
| `instrumentName` | `String` | No | — | — | Long description name |
| `assetClass` | `String` | **Yes** | — | Enum: `['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX']`, Indexed | Asset class category |
| `exchange` | `String` | **Yes** | — | — | Exchange code (NSE, MCX, etc.) |
| `marketSegment` | `String` | **Yes** | — | Enum: `['NSE_EQ', 'NSE_FNO', 'BSE_EQ', 'MCX', 'FOREX', 'CRYPTO', 'US_EQUITY', 'CME', 'OTHER']` | Market segment |
| `currency` | `String` | No | `'INR'` | — | Quote currency |
| `direction` | `String` | **Yes** | — | Enum: `['LONG', 'SHORT']`, Indexed | Trade side |
| `status` | `String` | No | `'CLOSED'` | Enum: `['PLANNED', 'OPEN', 'CLOSED', 'CANCELLED']`, Indexed | Trade lifecycle status |
| `optionType` | `String` | No | — | Enum: `['CALL', 'PUT']` | Options type |
| `strikePrice` | `Number` | No | — | — | Options strike price |
| `expiryDate` | `Date` | No | — | — | Derivatives expiry date |
| `strategyId` | `ObjectId` | No | — | Ref: `'Strategy'`, Indexed | Associated playbook ID |
| `strategyName` | `String` | No | — | — | Denormalized strategy name |
| `tags` | `[String]` | No | `[]` | Indexed | Custom search tags |
| `tradeDate` | `Date` | **Yes** | — | Indexed | Primary trade session date |
| `timeZone` | `String` | No | `'Asia/Kolkata'` | — | Session timezone |
| `entryTime` | `Date` | **Yes** | — | — | First entry timestamp |
| `exitTime` | `Date` | No | — | — | Final exit timestamp |
| `session` | `String` | No | — | Enum: `['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS']` | Market trading session |
| `tradeTitle` | `String` | No | — | — | Optional custom title |
| `externalBrokerOrderRef` | `String` | No | — | — | External broker order ID |
| `importBatchId` | `String` | No | — | Indexed | Unique batch ID for bulk CSV import tracking and undo |
| `templateId` | `String` | No | — | Indexed | Linked setup template identifier (built-in ID or custom TradeTemplate `_id`) |
| `executionMode` | `String` | No | `'SIMPLE'` | Enum: `['SIMPLE', 'ADVANCED']` | Execution mode |

#### Embedded Subdocuments in Trade:

##### A. `simpleExecution`
- `entryPrice` (`Number`): Simple execution entry price.
- `exitPrice` (`Number`, optional): Simple execution exit price.
- `quantity` (`Number`): Total trade quantity.
- `contractMultiplier` (`Number`, default `1`): Multiplier per point move.
- `brokerage` (`Number`, default `0`): Brokerage fee.
- `exchangeFees` (`Number`, default `0`): Exchange turnover fees.
- `regulatoryFees` (`Number`, default `0`): SEBI & stamp duty charges.
- `taxes` (`Number`, default `0`): STT/CTT and GST charges.
- `otherFees` (`Number`, default `0`): Miscellaneous fees.
- `explicitAdjustments` (`Number`, default `0`): Explicit manual P&L adjustments.
- `adjustmentsReason` (`String`, optional): Reason for adjustments.

##### B. `fills` (Array of Execution Fills)
- `fillId` (`String`, required): Unique fill identifier.
- `type` (`String`, enum: `['ENTRY', 'EXIT']`, required): Execution direction.
- `price` (`Number`, required): Execution price.
- `quantity` (`Number`, required): Execution quantity.
- `timestamp` (`Date`, required): Timestamp of fill execution.
- `fee` (`Number`, default `0`): Fee attributable to fill.
- `brokerage` (`Number`, default `0`): Brokerage.
- `exchangeFee` (`Number`, default `0`): Exchange fee.
- `taxes` (`Number`, default `0`): Taxes.
- `notes` (`String`): Fill notes.

##### C. `risk` (Pre-Trade Risk Management)
- `plannedEntryPrice` (`Number`)
- `initialStopLoss` (`Number`)
- `plannedTarget` (`Number`)
- `riskBudgetAmount` (`Number`)
- `riskPercentage` (`Number`)
- `suggestedQuantity` (`Number`)
- `actualQuantity` (`Number`)
- `estimatedRiskAmount` (`Number`)
- `riskAsPercentOfEquity` (`Number`)
- `plannedRewardRiskRatio` (`Number`)
- `realizedRMultiple` (`Number`)
- `riskRuleViolations` (`[String]`)

##### D. `thesis` (Technical Confluences & Structure)
- `preMarketBias` (`String`, enum: `['BULLISH', 'BEARISH', 'NEUTRAL']`)
- `marketStructure` (`String`, enum: `['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE']`)
- `entryRationale` (`String`)
- `entryConfirmation` (`String`)
- `stopLossRationale` (`String`)
- `targetRationale` (`String`)
- `exitRationale` (`String`)
- `invalidationConditions` (`String`)
- `higherTimeframeContext` (`String`)
- `confluences` (`[String]`): 51 standardized confluences across 4 distinct categories:
  - **LIQUIDITY:** `BUY_SIDE_LIQUIDITY_SWEEP`, `SELL_SIDE_LIQUIDITY_SWEEP`, `EQUAL_HIGHS`, `EQUAL_LOWS`, `PREV_DAY_HIGH_SWEEP`, `PREV_DAY_LOW_SWEEP`, `PREV_WEEK_HIGH_SWEEP`, `PREV_WEEK_LOW_SWEEP`, `ASIAN_RANGE_SWEEP`, `SESSION_HIGH_LOW_SWEEP`, `STOP_HUNT`, `INDUCEMENT`, `TRENDLINE_LIQUIDITY`, `LIQUIDITY_VOID`, `LIQUIDITY_POOL_TARGET`, `LIQUIDITY_GRAB_REJECTION`
  - **SUPPORT / RESISTANCE:** `HTF_SUPPORT`, `HTF_RESISTANCE`, `SUPPORT_RESISTANCE_FLIP`, `SUPPORT_RETEST`, `RESISTANCE_RETEST`, `DEMAND_ZONE`, `SUPPLY_ZONE`, `KEY_LEVEL_REJECTION`, `ROUND_NUMBER_LEVEL`, `PREV_DAY_HIGH_LOW_LEVEL`, `OPENING_RANGE_LEVEL`, `VWAP_LEVEL`, `FAKE_BREAKOUT_RECLAIM`, `DOUBLE_TOP_BOTTOM`, `RANGE_HIGH_LOW_REJECTION`, `OI_WALL_CE`, `OI_WALL_PE`
  - **CONFIRMATION / STRUCTURE:** `BOS`, `CHOCH`, `FVG`, `ORDER_BLOCK`, `LIQUIDITY_SWEEP`, `MARKET_STRUCTURE_SHIFT`, `DISPLACEMENT`, `BREAKER_BLOCK`, `MITIGATION_BLOCK`, `PREMIUM_ZONE_ENTRY`, `DISCOUNT_ZONE_ENTRY`, `LTF_CONFIRMATION_CANDLE`, `VOLUME_SPIKE_AT_LEVEL`
  - **INDICATORS / OTHER:** `EMA_CROSS`, `RSI_DIVERGENCE`, `VWAP_BOUNCE`, `OPENING_RANGE_BREAKOUT`, `VOLUME_PROFILE`
- `customTechnicalLabels` (`[String]`)

##### E. `psychology` (Behavioral & Discipline Metrics)
- `emotionBefore` (`String`, enum: 23 standardized emotions):
  - **Positive:** `CALM`, `CONFIDENT`, `PATIENT`, `FOCUSED`, `DISCIPLINED`, `RELIEVED`
  - **Neutral:** `NEUTRAL`, `BORED`, `UNCERTAIN`
  - **Negative:** `ANXIOUS`, `FEARFUL`, `GREEDY`, `FRUSTRATED`, `HESITANT`, `IMPATIENT`, `FOMO`, `OVERCONFIDENT`, `STRESSED`, `TILTED`, `REVENGEFUL`, `REGRETFUL`, `DOUBTFUL_OF_LEVEL`, `FEAR_OF_STOP_HUNT`
- `emotionDuring` (`String`, enum: same 23 standardized emotions)
- `emotionAfter` (`String`, enum: same 23 standardized emotions)
- `confidenceScore` (`Number`, min 1, max 5)
- `disciplineScore` (`Number`, default `4`, min 1, max 5)
- `checklistCompleted` (`Boolean`, default `true`)
- `rulesFollowed` (`Boolean`, default `true`)
- `mistakes` (`[String]`): 29 standardized mistake tags across 4 categories:
  - **Liquidity / Level:** `ENTERED_BEFORE_SWEEP`, `NO_LIQUIDITY_TAKEN`, `NO_CONFIRMATION_AFTER_SWEEP`, `TRADED_INTO_HTF_LEVEL`, `TRADED_MID_RANGE`, `STOP_INSIDE_LIQUIDITY_POOL`, `STOP_TOO_TIGHT`, `TARGET_NOT_AT_LIQUIDITY`, `NO_LIQUIDITY_TARGET`, `IGNORED_HTF_BIAS`, `COUNTER_TREND_NO_SWEEP`, `FAKE_BREAKOUT_CHASE`
  - **Execution / Timing:** `EARLY_ENTRY`, `LATE_ENTRY`, `FOMO_ENTRY`, `CHASED_MARKET`, `PREMATURE_EXIT`, `BREAKEVEN_TOO_EARLY`
  - **Risk / Discipline:** `STOP_MOVED`, `SIZE_VIOLATION`, `ADDED_TO_LOSER`, `REVENGE_TRADING`, `OVERTRADING`
  - **Session / Context:** `TRADED_OUTSIDE_SESSION`, `TRADED_NEWS_EVENT`
- `revengeTrading` (`Boolean`, default `false`)
- `overtrading` (`Boolean`, default `false`)
- `prematureExit` (`Boolean`, default `false`)
- `stopLossMoved` (`Boolean`, default `false`)
- `positionSizeViolation` (`Boolean`, default `false`)
- `lessonsLearned` (`String`)
- `notes` (`String`)

##### F. `setup` (Setup Variant & Execution Context)
- `variantKey` (`String`, optional): Identifier of the child setup variant (e.g. `'BULL-SSL-EQL'`, `'VAR-01'`, `'PULLBACK-A'`).
- `variantStatus` (`String`, enum: `['CLASSIFIED', 'UNCLASSIFIED', 'NOT_APPLICABLE']`, default `'UNCLASSIFIED'`): Classification lifecycle status.
- `alsoMatches` (`[String]`, default `[]`): Secondary matching variant keys.
- `htfBias` (`String`, optional, enum: `['BULLISH', 'BEARISH', 'NEUTRAL']`): Higher timeframe directional bias.
- `executionTimeframe` (`String`, optional): Execution chart timeframe (e.g. `'5m'`).
- `liquiditySide` (`String`, optional, enum: `['SELL_SIDE', 'BUY_SIDE', 'NONE']`): Swept liquidity pool side.
- `patternType` (`String`, optional, enum: `['EQUAL_LOWS', 'EQUAL_HIGHS', 'W', 'M', 'OTHER']`): Structural pattern type.
- `secondLegStatus` (`String`, optional, enum: `['SWEPT', 'UNSWEPT', 'NOT_APPLICABLE']`): W/M second leg relation to first leg.
- `liquidityLevel` (`Number`, optional): Sweep price level.
- `sweepExtreme` (`Number`, optional): Maximum penetration beyond sweep level.
- `entryModel` (`String`, optional, enum: `['CONFIRMATION_CANDLE', 'RETEST', 'OTHER']`): Trigger execution mechanism.

##### G. `calculated` (Authoritative Deterministic Metrics)
- `grossPnL` (`Number`, default `0`)
- `totalCosts` (`Number`, default `0`)
- `netPnL` (`Number`, default `0`)
- `realizedRMultiple` (`Number`, optional)
- `holdingTimeMinutes` (`Number`, optional)
- `outcome` (`String`, enum: `['WIN', 'LOSS', 'BREAKEVEN', 'OPEN', 'CANCELLED']`, default `'BREAKEVEN'`, Indexed)
- `closedQuantity` (`Number`, default `0`)
- `openQuantity` (`Number`, default `0`)
- `averageEntryPrice` (`Number`, default `0`)
- `averageExitPrice` (`Number`, optional)
- `excursion` (`Object`, optional):
  - `status` (`String`, enum: `['PENDING', 'COMPUTED', 'UNAVAILABLE', 'ERROR']`, default `'PENDING'`)
  - `computedAt` (`Date`)
  - `source` (`String`, default `'FYERS_HISTORY'`)
  - `resolution` (`String`, e.g. `'1'`, `'5'`)
  - `failureReason` (`String`)
  - `maePoints` (`Number`)
  - `mfePoints` (`Number`)
  - `maeAmount` (`Number`)
  - `mfeAmount` (`Number`)
  - `maeR` (`Number`)
  - `mfeR` (`Number`)
  - `exitEfficiency` (`Number`)
  - `stopEfficiency` (`Number`)
  - `stopHit` (`Boolean`)
  - `reversedAfterStopHit` (`Boolean`)
  - `timeToMfeMinutes` (`Number`)
  - `timeToMaeMinutes` (`Number`)
  - `candleCount` (`Number`)
  - `excursionFlags` (`[String]`, enum: `['GAVE_BACK_PROFIT', 'STOP_TOO_TIGHT_EVIDENCE', 'STOP_TOO_LOOSE_EVIDENCE', 'EXITED_EARLY', 'HELD_INTO_REVERSAL']`)
- `stopMoveSummary` (`Object`, optional):
  - `totalMoves` (`Number`, default `0`)
  - `widenedCount` (`Number`, default `0`)
  - `trailedCount` (`Number`, default `0`)
  - `initialStop` (`Number`, optional)
  - `finalStop` (`Number`, optional)
  - `netRiskChangePoints` (`Number`, default `0`)
  - `hasWidenedRisk` (`Boolean`, default `false`)
  - `detectedAt` (`Date`)

##### H. `stopLossMoveEvents`
Array of historical stop-loss order modifications detected from FYERS orderbook or manual timeline:
- `previousStop` (`Number`, required): Prior stop price level.
- `newStop` (`Number`, required): Updated stop price level.
- `changePoints` (`Number`, default `0`): Absolute price difference.
- `changePercent` (`Number`, default `0`): Percentage adjustment relative to previous stop.
- `moveType` (`String`, enum: `['TRAILED_FAVORABLY', 'WIDENED_RISK', 'UNCHANGED']`, required): Favorable trail vs risk expansion.
- `movedAt` (`Date`, required): Timestamp of order modification.
- `orderId` (`String`, optional): FYERS order number or client ID.
- `orderType` (`Number`, optional): Broker order type code (3 = SL-M, 4 = SL-L).
- `reason` (`String`, optional): Order trigger message or user tag.

##### I. `screenshotIds` & `auditLog`
- `screenshotIds` (`[ObjectId]`, ref: `'Attachment'`): Associated chart screenshots (including automated SVG execution charts).
- `auditLog`: Array of `{ action: String, timestamp: Date, changedBy: String, details: Mixed }`.

**Compound Indexes:**
- `{ userId: 1, tradeDate: -1 }`
- `{ userId: 1, accountId: 1, tradeDate: -1 }`
- `{ userId: 1, 'calculated.netPnL': -1 }`
- `{ userId: 1, templateId: 1 }`
- `{ userId: 1, strategyId: 1, 'setup.variantKey': 1, tradeDate: -1 }`
- `{ userId: 1, 'calculated.excursion.status': 1 }`
- `{ userId: 1, 'calculated.stopMoveSummary.hasWidenedRisk': 1 }`

---

### 2.6 Instrument Model (`Instrument.ts`)
- **Collection Name:** `instruments`
- **File:** [`apps/api/src/db/models/Instrument.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/Instrument.ts)

SetupMint implements a strict **One-Instrument-Per-Underlying** architecture. Global presets and static catalogs are not stored in the database. Instruments belong exclusively to individual users and represent base underlying assets (e.g. `NIFTY`, `BANKNIFTY`, `CRUDEOIL`, `RELIANCE`). Derivative-specific parameters (expiry date, option type, strike price) are stored at the individual trade level.

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Instrument identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Owning user ID |
| `symbol` | `String` | **Yes** | — | Uppercase, trim, Indexed | Normalized underlying ticker (e.g. `NIFTY`) |
| `displayName` | `String` | **Yes** | — | Trim | Human-readable name (e.g. `Nifty 50 Index`) |
| `assetClass` | `String` | **Yes** | — | Enum, Indexed | Instrument category (`EQUITY`, `FUTURES`, `OPTIONS`, `COMMODITY`, `FOREX`, `CRYPTO`, `INDEX`) |
| `exchange` | `String` | **Yes** | — | Trim | Exchange identifier (`NSE`, `MCX`, `BSE`, etc.) |
| `marketSegment` | `String` | **Yes** | — | Enum | Market segment (`NSE_EQ`, `NSE_FNO`, `MCX`, etc.) |
| `quoteCurrency` | `String` | No | `'INR'` | — | Pricing currency |
| `contractMultiplier` | `Number` | **Yes** | `1` | Positive | Point value multiplier |
| `lotSize` | `Number` | **Yes** | `1` | Positive | Minimum order lot size |
| `tickSize` | `Number` | **Yes** | `0.05` | Positive | Minimum price variation |
| `quantityIncrement` | `Number` | **Yes** | `1` | Positive | Increment step size |
| `pricePrecision` | `Number` | **Yes** | `2` | Non-negative integer | Decimal display precision |
| `isActive` | `Boolean` | No | `true` | Indexed | Active flag |
| `source` | `String` | No | `'CUSTOM'` | Enum: `['AUTO', 'CUSTOM']` | Creation origin (`AUTO` if created on first trade, `CUSTOM` if created manually) |
| `needsReview` | `Boolean` | No | `false` | Indexed | Set to `true` when auto-created with unknown fallback specs; cleared when user edits |
| `description` | `String` | No | — | — | Optional description |

**Compound Indexes:**
- `{ userId: 1, symbol: 1 }` (Unique: `true`) — Guarantees exactly one instrument per underlying symbol per user.

---

### 2.7 Strategy Model (`Strategy.ts`)
- **Collection Name:** `strategies`
- **File:** [`apps/api/src/db/models/Strategy.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/Strategy.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Strategy identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Strategy owner ID |
| `name` | `String` | **Yes** | — | Trim, Compound unique | Strategy name |
| `description` | `String` | No | `''` | — | Detailed explanation |
| `assetClasses` | `[String]` | No | `[]` | Enum array | Target asset classes |
| `timeframes` | `[String]` | No | `[]` | — | Execution timeframes |
| `entryRules` | `[String]` | No | `[]` | — | Step-by-step entry triggers |
| `stopLossRules` | `[String]` | No | `[]` | — | Stop placement rules |
| `targetRules` | `[String]` | No | `[]` | — | Take profit criteria |
| `invalidationCriteria`| `[String]` | No | `[]` | — | Invalidation conditions |
| `checklist` | `[String]` | No | `[]` | — | Pre-trade checklist items |
| `minRiskReward` | `Number` | No | `1.5` | Non-negative | Minimum acceptable R:R |
| `tags` | `[String]` | No | `[]` | — | Custom labels |
| `notes` | `String` | No | — | — | Free-form strategy notes |
| `isActive` | `Boolean` | No | `true` | Indexed | Active status |
| `variants` | `[StrategyVariant]` | No | `[]` | Max 12, unique `key` per strategy (Zod) | User-defined child setup variants |

#### Embedded Subdocument: `StrategyVariant` (`_id: false`)

Child variants are **fully user-defined**. The application contains no hardcoded variant keys, names, or required setup criteria.

| Field Name | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `key` | `String` | **Yes** | — | Custom identifier, trimmed and uppercased (1–60 chars), e.g. `VAR-01`, `ORB-5M` |
| `name` | `String` | **Yes** | — | Display name |
| `description` | `String` | No | `''` | Variant thesis |
| `isActive` | `Boolean` | No | `true` | `false` = archived (hidden from journal selector, kept in analytics) |
| `sortOrder` | `Number` | No | `0` | Display order |
| `expected` | `Mixed` | No | `{}` | Optional, free-form matching criteria (e.g. `direction`, `patternType`, or any custom key) used only for suggestions |
| `entryRules` / `stopLossRules` / `targetRules` / `invalidationCriteria` / `checklist` | `[String]` | No | — | Variant-specific rules appended to the parent's rules |
| `minRiskReward` | `Number \| null` | No | `null` | Overrides parent `minRiskReward` when set |

**Referential integrity:** A variant referenced by any trade (`setup.variantKey`) cannot be removed via `PUT /api/v1/strategies/:id` — the API returns `409 VARIANT_IN_USE`. Archive it instead.

**Compound Indexes:**
- `{ userId: 1, name: 1 }` (Unique constraint)

---

### 2.8 DailyJournal Model (`DailyJournal.ts`)
- **Collection Name:** `dailyjournals`
- **File:** [`apps/api/src/db/models/DailyJournal.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/DailyJournal.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Journal entry identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Journal owner ID |
| `date` | `String` | **Yes** | — | Format: `'YYYY-MM-DD'` | Trading session date string |
| `marketConditions` | `String` | No | — | — | Session macro conditions |
| `marketBias` | `String` | No | — | Enum: `['BULLISH', 'BEARISH', 'NEUTRAL']` | Daily trading bias |
| `bestTradeId` | `ObjectId` | No | — | Ref: `'Trade'` | Best trade of the session |
| `worstTradeId` | `ObjectId` | No | — | Ref: `'Trade'` | Worst trade of the session |
| `mistakes` | `[String]` | No | `[]` | — | List of mistakes made |
| `emotionalState` | `String` | No | — | — | Predominant daily emotion |
| `disciplineRating` | `Number` | No | — | Min 1, max 5 | Daily discipline score |
| `lessonsLearned` | `String` | No | — | — | Key takeaways |
| `nextDayPlan` | `String` | No | — | — | Tomorrow's action plan |
| `notes` | `String` | No | — | — | General daily notes |

**Compound Indexes:**
- `{ userId: 1, date: 1 }` (Unique constraint: exactly one journal entry per user per date)

---

### 2.9 Attachment Model (`Attachment.ts`)
- **Collection Name:** `attachments`
- **File:** [`apps/api/src/db/models/Attachment.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/Attachment.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Attachment identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Attachment owner ID |
| `tradeId` | `ObjectId` | No | — | Ref: `'Trade'`, Indexed | Linked trade record |
| `originalName` | `String` | **Yes** | — | — | Original uploaded filename |
| `storedFilename` | `String` | **Yes** | — | Unique | Server UUID filename on disk |
| `mimeType` | `String` | **Yes** | — | Validated magic bytes | `image/png`, `image/jpeg`, `image/webp` |
| `sizeBytes` | `Number` | **Yes** | — | Max 10MB | File size in bytes |
| `category` | `String` | No | `'ENTRY'` | Enum: `['SETUP', 'ENTRY', 'EXIT', 'REVIEW', 'OTHER', 'BEFORE_ENTRY', 'ANNOTATED', 'ATTACHMENT']` | Screenshot trade phase |
| `description` | `String` | No | — | — | Caption or description |
| `timeframe` | `String` | No | — | — | Chart timeframe (e.g. 5m, 1h) |
| `chartTimestamp`| `String` | No | — | — | Timestamp on the chart |

**Compound Indexes:**
- `{ userId: 1, tradeId: 1 }`
- `{ tradeId: 1, category: 1 }`

---

### 2.10 BrokerIntegration Model (`BrokerIntegration.ts`)
- **Collection Name:** `brokerintegrations`
- **File:** [`apps/api/src/db/models/BrokerIntegration.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/BrokerIntegration.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Record identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Owner user ID |
| `broker` | `String` | **Yes** | `'FYERS'` | Enum: `['FYERS']` | Broker identifier |
| `status` | `String` | No | `'DISABLED'` | Enum: `['DISABLED', 'IDLE', 'SYNCING', 'ERROR']` | Integration status |
| `appId` | `String` | No | — | — | FYERS registered App ID |
| `secretKey` | `String` | No | — | AES-256-GCM encrypted | FYERS app secret |
| `accessToken` | `String` | No | — | AES-256-GCM encrypted | Daily FYERS access token |
| `refreshToken` | `String` | No | — | AES-256-GCM encrypted | Stored refresh token (exchange not enabled) |
| `clientId` | `String` | No | — | Trim | FYERS client ID |
| `linkedAccountId` | `ObjectId` | No | — | Ref: `'TradingAccount'` | Primary linked account |
| `tokenExpiresAt` | `Date` | No | — | — | Next 06:30 IST token expiry |
| `authCodeExpiresAt` | `Date` | No | — | — | Legacy-compatible token expiry |
| `oauthStateHash` | `String` | No | — | Indexed | SHA-256 hash of OAuth state nonce |
| `oauthStateExpiresAt` | `Date` | No | — | — | OAuth state TTL (10 minutes) |
| `autoSyncEnabled` | `Boolean` | No | `true` | — | Automatic trade sync preference |
| `lastSyncAt` | `Date` | No | — | — | Timestamp of last trade sync attempt |
| `lastFundsSyncAt` | `Date` | No | — | — | Timestamp of last funds sync |
| `fundsSyncError` | `String` | No | — | — | Last funds sync error |
| `syncHistory` | `Array` | No | `[]` | Embedded subdocuments | Bounded log of past sync runs |

**Compound Indexes:**
- `{ userId: 1, broker: 1 }` (Unique constraint)

**Serialization:** `secretKey`, `accessToken`, `refreshToken`, and `oauthStateHash` are removed by `toJSON`/`toObject` transforms.

---

### 2.11 BrokerImportMapping Model (`BrokerImportMapping.ts`)
- **Collection Name:** `brokerimportmappings`
- **File:** [`apps/api/src/db/models/BrokerImportMapping.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/BrokerImportMapping.ts)

| Field Name | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Primary Key | Mapping document ID |
| `userId` | `ObjectId` | **Yes** | Ref: `'User'`, Indexed | Owning user |
| `broker` | `String` | **Yes** | Enum: `['ZERODHA', 'FYERS', 'ANGEL_ONE', 'UPSTOX', 'CUSTOM']` | Target broker identifier |
| `importKind` | `String` | **Yes** | `'TRADES'`, Enum: `['TRADES', 'CASH_FLOWS']` | Mapping type |
| `name` | `String` | **Yes** | Trim | Display title for saved preset |
| `mapping` | `Map<String>` | **Yes** | Key-value pairs | CSV column header to model field mapping |
| `createdAt` | `Date` | Auto | Timestamp | Document creation timestamp |
| `updatedAt` | `Date` | Auto | Timestamp | Document update timestamp |

**Compound Indexes:**
- `{ userId: 1, broker: 1, importKind: 1 }` (Unique constraint — one mapping per user, broker, and import kind)

The legacy `{ userId: 1, broker: 1 }` unique index must be dropped by `npm run accounts:backfill -- --yes`.

---

### 2.12 AuditLog Model (`AuditLog.ts`)
- **Collection Name:** `auditlogs`
- **File:** [`apps/api/src/db/models/AuditLog.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/AuditLog.ts)

| Field Name | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Primary Key | Audit log ID |
| `userId` | `ObjectId` | **Yes** | Ref: `'User'`, Indexed | User performing action |
| `entityType` | `String` | **Yes** | Indexed | e.g. `'Trade'`, `'TradingAccount'` |
| `entityId` | `String` | **Yes** | Indexed | ID of affected entity |
| `action` | `String` | **Yes** | — | e.g. `'CREATED'`, `'UPDATED'`, `'DELETED'` |
| `diff` | `Mixed` | No | — | Before/after state snapshot |
| `ipAddress` | `String` | No | — | Client IP address |
| `userAgent` | `String` | No | — | Client User-Agent |
| `createdAt` | `Date` | Auto | Timestamp | Timestamp of audit entry |

---

### 2.13 TradeTemplate Model (`TradeTemplate.ts`)
- **Collection Name:** `tradetemplates`
- **File:** [`apps/api/src/db/models/TradeTemplate.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/TradeTemplate.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Custom template identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Owner user ID |
| `name` | `String` | **Yes** | — | Trim, Compound unique (`userId` + `name`) | Template display name (e.g. "Opening Range Breakout") |
| `description` | `String` | No | `''` | — | Setup description and context |
| `group` | `String` | No | `'CUSTOM'` | Enum: `['FNO', 'STOCKS', 'FOREX_GOLD', 'CRYPTO', 'MCX', 'PRICE_ACTION', 'CUSTOM']`, Indexed | Setup market category |
| `markets` | `[String]` | **Yes** | — | Array of `['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX']` | Compatible asset classes |
| `direction` | `String` | No | — | Enum: `['LONG', 'SHORT']` | Fixed directional bias (if directional) |
| `strategyName` | `String` | No | — | Trim | Target playbook strategy name (auto-links to Strategy) |
| `slRule` | `Object` | **Yes** | — | Subdocument: `{ type, value?, manualHint? }` | Mathematical stop-loss rule |
| `slRule.type` | `String` | **Yes** | — | Enum: `['PERCENT', 'POINTS', 'PREMIUM_PERCENT', 'MANUAL']` | SL calculation mode |
| `slRule.value` | `Number` | No | — | Required for `PERCENT`, `POINTS`, `PREMIUM_PERCENT` | Numeric SL parameter |
| `slRule.manualHint`| `String` | No | — | For `MANUAL` (e.g. "Below trigger candle low") | Manual entry guidance |
| `minRR` | `Number` | No | `1.5` | Minimum planned Risk:Reward ratio | Target calculation multiplier |
| `titlePattern` | `String` | **Yes** | — | Trim, supports `{symbol}` and `{side}` tokens | Auto-generated trade title pattern |
| `tags` | `[String]` | No | `[]` | — | Prefilled search tags |
| `confluences` | `[String]` | No | `[]` | — | Technical confluence labels (e.g. `BOS`, `ORB_15M`) |
| `checklist` | `[String]` | No | `[]` | — | Quality checklist verification items |
| `timeWindow` | `Object` | No | — | Subdocument: `{ start: String, end: String }` | Active execution window (HH:mm in market local time) |
| `expiryDayOnly` | `Boolean` | No | `false` | — | Restricts or prioritizes ranking on market expiry days |
| `session` | `String` | No | — | Enum: `['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS']` | Target trading session |
| `isFavorite` | `Boolean` | No | `false` | Indexed | User pinned favorite flag |
| `usageCount` | `Number` | No | `0` | — | Cumulative times applied to trades |
| `lastUsedAt` | `Date` | No | — | — | Timestamp of most recent application |
| `clonedFromId` | `String` | No | — | — | Upstream template ID if cloned from built-in |
| `createdAt` | `Date` | Auto | Current Time | — | Creation timestamp |
| `updatedAt` | `Date` | Auto | Current Time | — | Update timestamp |

**Compound Indexes:**
- `{ userId: 1, name: 1 }` (Unique constraint)
- `{ userId: 1, isFavorite: 1 }`
- `{ userId: 1, group: 1 }`

---

### 2.14 BrokerFundsSnapshot Model (`BrokerFundsSnapshot.ts`)
- **Collection Name:** `brokerfundssnapshots`
- **File:** [`apps/api/src/db/models/BrokerFundsSnapshot.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/BrokerFundsSnapshot.ts)

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Snapshot identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Owner user ID |
| `accountId` | `ObjectId` | **Yes** | — | Ref: `'TradingAccount'`, Indexed | Linked account |
| `broker` | `String` | **Yes** | — | Enum: `['FYERS']` | Broker identifier |
| `clientId` | `String` | **Yes** | — | Trim | FYERS client ID |
| `fetchedAt` | `Date` | **Yes** | — | — | Time the snapshot was fetched |
| `totalBalance` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | FYERS Total Balance |
| `clearBalance` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | FYERS Clear Balance |
| `availableBalance` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | FYERS Available Balance |
| `realizedPnL` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | FYERS Realized P&L |
| `utilizedAmount` | `Decimal128` | No | `0.00` | Exact 128-bit decimal | FYERS Utilized Amount |
| `fundLimits` | `Array` | No | `[]` | Embedded subdocuments | Raw normalized FYERS fund limits |
| `createdAt` | `Date` | Auto | Timestamp | — | Document creation timestamp |
| `updatedAt` | `Date` | Auto | Timestamp | — | Document update timestamp |

**Compound Indexes:**
- `{ userId: 1, accountId: 1, fetchedAt: -1 }`

---

### 2.15 TradeCandleSnapshot Model (`TradeCandleSnapshot.ts`)
- **Collection Name:** `trade_candle_snapshots`
- **File:** [`apps/api/src/db/models/TradeCandleSnapshot.ts`](file:///Users/komal/projects/Trading%20Vault/apps/api/src/db/models/TradeCandleSnapshot.ts)

Stores immutable, cached historical 1-minute and 5-minute candlestick snapshots fetched from FYERS API v3 during the trade lifecycle (from trade entry time to exit time) to enable pure, reproducible excursion analytics (MAE, MFE, Exit Efficiency).

| Field Name | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Auto | Generated | Primary Key | Snapshot identifier |
| `userId` | `ObjectId` | **Yes** | — | Ref: `'User'`, Indexed | Owning trader ID |
| `tradeId` | `ObjectId` | **Yes** | — | Ref: `'Trade'`, Indexed | Evaluated trade identifier |
| `symbol` | `String` | **Yes** | — | Trim | FYERS-formatted symbol (e.g. `NSE:SBIN-EQ`, `NSE:NIFTY24OCT24500CE`) |
| `resolution` | `String` | **Yes** | `'1'` | Enum: `['1', '5']` | Candle resolution timeframe (`'1'` for <= 4h, `'5'` for longer) |
| `candles` | `Array` | No | `[]` | Embedded subdocuments | Array of `{ t: Number, o: Number, h: Number, l: Number, c: Number, v: Number }` |
| `fetchedAt` | `Date` | No | `Date.now` | — | Timestamp of FYERS history API response |
| `createdAt` | `Date` | Auto | Timestamp | — | Document creation timestamp |
| `updatedAt` | `Date` | Auto | Timestamp | — | Document update timestamp |

**Compound Indexes:**
- `{ userId: 1, tradeId: 1, resolution: 1 }` (Unique constraint)

