import {
  CALIBRATION_MIN_AGREEMENT,
  DEFAULT_CHART_PADDING_CANDLES,
  HOLDOUT_FRACTION,
  MAX_CHART_PADDING_CANDLES,
  MAX_CHART_TIMEFRAMES_PER_REQUEST,
  MIN_RELIABLE_SAMPLE,
  MIN_HOLDOUT_SAMPLE,
} from './constants.js';

export type HelpKey =
  // What-If & Simulation Keys
  | 'analytics.whatIf.overlay'
  | 'analytics.whatIf.policies'
  | 'analytics.whatIf.ambiguous'
  | 'analytics.whatIf.censored'
  | 'analytics.whatIf.evaluable'
  | 'analytics.whatIf.holdout'
  | 'analytics.whatIf.verdicts'
  | 'analytics.whatIf.calibration'
  | 'analytics.whatIf.fillModel'
  | 'analytics.whatIf.slippage'
  | 'analytics.whatIf.rUnitBasis'
  | 'analytics.whatIf.excludeManagedStops'
  | 'analytics.whatIf.exclusions'
  | 'analytics.whatIf.multipleComparisons'

  // Metric Keys
  | 'metric.rMultiple'
  | 'metric.plannedRR'
  | 'metric.expectancy'
  | 'metric.profitFactor'
  | 'metric.winRateCredible'
  | 'metric.drawdown'
  | 'metric.mae'
  | 'metric.mfe'
  | 'metric.exitEfficiency'
  | 'metric.excursionFlags'
  | 'metric.gaveBackProfit'
  | 'metric.postStopReversals'
  | 'analytics.excursion.scatter'
  | 'metric.sampleReliability'

  // Trade Detail & Execution Keys
  | 'trade.fees.autoManual'
  | 'trade.chartGen.padding'
  | 'trade.stopMoves.audit'
  | 'trade.form.lotVsQty'
  | 'trade.form.multiplier'
  | 'trade.form.tickSize'
  | 'trade.form.sessionCodes'
  | 'trade.form.fifo'

  // Accounts, Balances & Imports Keys
  | 'account.balanceFormula'
  | 'account.reconcile'
  | 'account.driftTolerance'
  | 'account.pendingAdjustment'
  | 'account.archiveVsDelete'
  | 'import.undoBatch'
  | 'import.columnMapping'

  // Settings & System Keys
  | 'settings.fyersExpiry'
  | 'settings.angelOneFallback'
  | 'settings.riskGuardrails'
  | 'instrument.tradedOnly'
  | 'instrument.cascadeSpecs'
  | 'strategy.edgeVerdict'
  | 'strategy.invariantCheck'
  | 'journal.disciplineScore'
  | 'dashboard.reviewQueue'
  | 'review.weekly'
  | 'review.focusRule';

export interface IHelpEntry {
  title: string;
  summary: string; // <= 160 chars, plain language
  details?: string; // <= 400 chars
  formula?: string; // Plain text / LaTeX-free string
  example?: string; // Concrete INR example
  caveats?: string; // Exclusions, sample-size rules, what it does NOT mean
  seeAlso?: HelpKey[];
  docsAnchor?: string; // Path to docs section
}

export const HELP_CONTENT: Record<HelpKey, IHelpEntry> = {
  // --------------------------------------------------------------------------
  // WHAT-IF & SIMULATION
  // --------------------------------------------------------------------------
  'analytics.whatIf.overlay': {
    title: 'What-If Historical Overlay',
    summary: 'Tests hypothetical stops and targets on top of your actual trade duration using cached intraday candles.',
    details: 'This is an overlay on what actually happened between your entry and exit. It tests whether an additional stop or target level would have hit first. It never extends holding time past your real exit.',
    caveats: 'Not a predictive forecast. Assumes market liquidity was available at your simulated levels and does not model how you might have reacted differently.',
    seeAlso: ['analytics.whatIf.policies', 'analytics.whatIf.censored', 'analytics.whatIf.multipleComparisons'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#11-overlay-semantics',
  },

  'analytics.whatIf.policies': {
    title: 'Pessimistic vs. Optimistic Policies',
    summary: 'Accounts for unknown price order within candles. Pessimistic assumes worst sequence; Optimistic assumes best.',
    details: 'Intraday candles only show High and Low, not the order prices occurred. If both stop and target fall inside the same candle, Pessimistic triggers the stop first while Optimistic triggers the target first.',
    formula: 'Outcome Range = [Pessimistic R, Optimistic R]',
    caveats: 'When ambiguous trades exist, true performance lies within this range. If ambiguous trades count is zero, both policies yield identical results.',
    seeAlso: ['analytics.whatIf.ambiguous', 'analytics.whatIf.overlay'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#18-resolution-of-order',
  },

  'analytics.whatIf.ambiguous': {
    title: 'Ambiguous Trades',
    summary: 'Trades where candle data alone cannot determine whether your stop or target was touched first.',
    details: 'Occurs when both hypothetical levels are reached inside the same candle bar, or during partial entry/exit candles where price action occurred before entry or after exit.',
    example: 'In a 5-minute candle with low 98 and high 104, a stop at 98.5 and target at 103.5 were both touched, but candle data cannot prove which hit first.',
    caveats: 'A cell with zero ambiguous trades has exact execution order at candle resolution.',
    seeAlso: ['analytics.whatIf.policies', 'analytics.whatIf.evaluable'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#18-resolution-of-order',
  },

  'analytics.whatIf.censored': {
    title: 'Right-Censored Trades',
    summary: 'Trades excluded from a cell because their real exit stopped the test before a looser level could be observed.',
    details: 'If your real trade exited at your initial stop loss, testing a looser stop (e.g. 1.5R) requires prices after your actual exit. Because we do not observe post-exit prices, the trade is censored to avoid survivorship bias.',
    caveats: 'Censored trades are excluded from that specific cell to keep statistics honest. Evaluated count (nEval) varies by cell.',
    seeAlso: ['analytics.whatIf.evaluable', 'analytics.whatIf.rUnitBasis'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#110-right-censoring',
  },

  'analytics.whatIf.evaluable': {
    title: 'Evaluable Trade Count (nEval)',
    summary: 'Number of trades that could be conclusively simulated for this stop and target grid cell.',
    details: 'Equals eligible trades minus right-censored trades for that specific cell. Statistics like win rate and mean R are calculated strictly on these evaluable trades.',
    formula: 'nEval = nEligible - nCensored',
    caveats: `Cells with nEval < ${MIN_RELIABLE_SAMPLE} are statistically fragile and shown with muted opacity.`,
    seeAlso: ['analytics.whatIf.censored', 'analytics.whatIf.verdicts'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#110-right-censoring',
  },

  'analytics.whatIf.holdout': {
    title: 'Out-of-Sample Holdout Verification',
    summary: `Chronologically splits trades into In-Sample (first ${(1 - HOLDOUT_FRACTION) * 100}%) and Holdout (last ${HOLDOUT_FRACTION * 100}%) to prevent curve-fitting.`,
    details: 'A rule that works well on historical trades often fails in live markets. To guard against this, we test the same stop/target level on the recent holdout window.',
    caveats: `A cell holds out-of-sample only if the holdout verdict agrees in direction with in-sample and has at least ${MIN_HOLDOUT_SAMPLE} evaluable trades.`,
    seeAlso: ['analytics.whatIf.verdicts', 'analytics.whatIf.multipleComparisons'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#111-holdout-validation',
  },

  'analytics.whatIf.verdicts': {
    title: 'Robust Statistical Verdict',
    summary: 'Labels whether a stop/target grid cell meaningfully improves performance over your actual trading baseline.',
    details: 'Uses 10,000 paired bootstrap resamples (90% confidence interval of paired differences d = R_sim - R_actual). BETTER_ROBUST requires pessimistic lower bound > 0 and nEval >= 30. WORSE_ROBUST requires optimistic upper bound < 0.',
    caveats: 'INCONCLUSIVE means the data does not conclusively prove whether this rule helps or hurts, or sample size is below 30.',
    seeAlso: ['analytics.whatIf.holdout', 'analytics.whatIf.evaluable'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#19-paired-difference-and-verdict',
  },

  'analytics.whatIf.calibration': {
    title: 'Data-Quality Calibration Check',
    summary: 'Validates that replaying your actual initial stop reproduces your real stop hits with high fidelity.',
    details: `Replays trades that exited at or beyond their initial stop with stopR=1.0 and no target. Agreement measures the share of trades matching the real stop hit.`,
    caveats: `If agreement falls below ${Math.round(CALIBRATION_MIN_AGREEMENT * 100)}%, a warning banner is shown, indicating candle timestamp alignment or snapshot gaps.`,
    seeAlso: ['analytics.whatIf.overlay'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#112-calibration-gate',
  },

  'analytics.whatIf.fillModel': {
    title: 'Fill Model (Gap-Aware vs. At-Level)',
    summary: 'Determines whether prices that gap past your stop or target fill at the opening price or the level price.',
    details: 'In GAP_AWARE mode, if a candle opens beyond your stop, your exit fills at that worse open price, replicating market orders. In AT_LEVEL mode, fills are assumed at the exact level price.',
    caveats: 'Gap-aware is the realistic default for market stops in fast-moving or overnight sessions.',
    seeAlso: ['analytics.whatIf.slippage'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#17-gap-aware-fills',
  },

  'analytics.whatIf.slippage': {
    title: 'Slippage Ticks',
    summary: 'Adverse price ticks added to stop executions to simulate order book friction and execution delay.',
    details: 'For LONG trades, stop fill price decreases by slippage * tickSize. For SHORT trades, stop fill price increases. Target limit orders do not receive adverse slippage.',
    example: 'For NIFTY with tick size 0.05, 2 ticks of slippage adds ₹0.10 adverse price penalty on stop execution.',
    seeAlso: ['analytics.whatIf.fillModel', 'trade.form.tickSize'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#17-gap-aware-fills',
  },

  'analytics.whatIf.rUnitBasis': {
    title: 'R (Stop-Distance Basis)',
    summary: 'The standard R unit used across What-If, defined as initial stop distance in price points times quantity.',
    details: 'Unit risk equals |entryPrice - initialStopLoss|. One R equals unitRisk * quantity * multiplier. This isolates price geometry from portfolio cash budget sizing.',
    formula: '1 R = |Entry - Initial Stop| * Quantity * Multiplier',
    caveats: 'May differ from stored realizedRMultiple if your account cash risk budget differed from stop distance at entry.',
    seeAlso: ['metric.rMultiple'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#12-r-unit-basis',
  },

  'analytics.whatIf.excludeManagedStops': {
    title: 'Exclude Moved-Stop Trades',
    summary: 'Excludes trades where you manually trailed or widened your stop loss during the trade.',
    details: 'When a stop was moved during trade management, the real trade followed a dynamic path that a static overlay cannot replicate. Excluding them keeps the simulation clean.',
    caveats: 'Enabled by default. Disabling this includes managed trades but may overestimate rule impact.',
    seeAlso: ['trade.stopMoves.audit'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#14-eligibility',
  },

  'analytics.whatIf.exclusions': {
    title: 'Simulation Exclusion Reasons',
    summary: 'Why certain closed trades cannot be accurately evaluated by the candle-replay engine.',
    details: 'Exclusions: MULTI_FILL (scale-ins or partial exits), NO_STOP (no valid initial stop loss entered), NO_CANDLES (no cached snapshot), UNDERLYING_FALLBACK (options using spot proxy), MANAGED_STOP (stop was modified).',
    caveats: 'Check the data-quality card to see which trades were excluded and how to include more trades.',
    seeAlso: ['analytics.whatIf.evaluable'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#14-eligibility',
  },

  'analytics.whatIf.multipleComparisons': {
    title: 'Multiple Comparisons Caution',
    summary: 'Testing many stop and target combinations increases the chance of finding high returns purely by luck.',
    details: 'When testing a grid of 50+ combinations, a few cells will appear profitable by chance alone. Prefer broad clusters of positive cells that hold out-of-sample over an isolated peak.',
    caveats: 'Do not pick an isolated high cell. Seek stable plateaus.',
    seeAlso: ['analytics.whatIf.holdout', 'analytics.whatIf.verdicts'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#113-multiple-comparisons',
  },

  // --------------------------------------------------------------------------
  // METRICS & PERFORMANCE
  // --------------------------------------------------------------------------
  'metric.rMultiple': {
    title: 'R-Multiple',
    summary: 'Net profit or loss expressed as a multiple of initial risk taken.',
    details: 'Normalizes trades across different instruments, position sizes, and account balances by measuring return relative to initial risk.',
    formula: 'R-Multiple = Net P&L / Initial Risk Amount',
    example: 'Risking ₹1,000 to make ₹2,500 net profit produces an R-multiple of +2.50R.',
    caveats: 'Requires a valid stop loss and planned risk amount at entry.',
    seeAlso: ['analytics.whatIf.rUnitBasis', 'metric.expectancy'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#r-multiple',
  },

  'metric.plannedRR': {
    title: 'Planned Reward-to-Risk (R:R)',
    summary: 'The ratio of planned target distance to initial stop loss distance at trade entry.',
    details: 'Calculated before trade entry to ensure setups meet minimum strategy criteria before executing.',
    formula: 'Planned R:R = |Target - Entry| / |Entry - Stop Loss|',
    example: 'Buying at ₹100 with stop at ₹95 (5 pts risk) and target at ₹115 (15 pts reward) gives a 3.00 R:R.',
    caveats: 'Measures planned intent, not actual realized outcome.',
    seeAlso: ['metric.rMultiple'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#reward-to-risk',
  },

  'metric.expectancy': {
    title: 'Mathematical Expectancy (in R)',
    summary: 'The average amount of R you expect to win or lose on every trade over a large sample.',
    details: 'Combines win rate, average win size, and average loss size into a single expected value per trade.',
    formula: 'Expectancy = (Win Rate * Avg Win R) - (Loss Rate * Avg Loss R)',
    example: 'With 50% win rate, 2R average win, and 1R average loss, Expectancy = (0.50 * 2) - (0.50 * 1) = +0.50R.',
    caveats: `Unreliable with small samples. Requires at least ${MIN_RELIABLE_SAMPLE} closed trades for statistical validity.`,
    seeAlso: ['metric.profitFactor', 'metric.winRateCredible'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#expectancy',
  },

  'metric.profitFactor': {
    title: 'Profit Factor',
    summary: 'Gross winning profits divided by absolute gross losing amounts.',
    details: 'Measures strategy efficiency. A profit factor above 1.50 represents a solid edge; above 2.00 is exceptional.',
    formula: 'Profit Factor = Gross Profits / Gross Losses',
    example: '₹1,50,000 in gross wins divided by ₹75,000 in gross losses yields a Profit Factor of 2.00.',
    caveats: 'If there are zero losses in the scope, Profit Factor is capped at 999.99 by convention to avoid division by zero.',
    seeAlso: ['metric.expectancy'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#profit-factor',
  },

  'metric.winRateCredible': {
    title: 'Win Rate & Credible Interval',
    summary: 'Percentage of winning trades alongside Bayesian credible bounds based on sample size.',
    details: 'Raw win rate can be deceptive on small samples (e.g. 4 wins out of 5 trades is 80%, but carries wide uncertainty). The credible interval reveals the true statistical range.',
    formula: 'Win Rate % = (Winning Trades / Total Closed Trades) * 100',
    example: '45 wins out of 75 closed trades yields a 60.0% win rate.',
    caveats: 'Sample size directly narrows the interval. Do not judge strategies on fewer than 30 trades.',
    seeAlso: ['metric.sampleReliability', 'strategy.edgeVerdict'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#win-rate-intervals',
  },

  'metric.drawdown': {
    title: 'Maximum Drawdown',
    summary: 'The largest peak-to-trough decline in portfolio equity before a new peak is reached.',
    details: 'Measures capital vulnerability and emotional stress. Displayed both in base currency (₹) and percentage of peak equity.',
    formula: 'Drawdown % = (Peak Equity - Trough Equity) / Peak Equity * 100',
    caveats: 'Drawdown is path-dependent and may worsen before recovering.',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#drawdown',
  },

  'metric.mae': {
    title: 'Maximum Adverse Excursion (MAE)',
    summary: 'The deepest unrealized loss or adverse price dip experienced while the trade was open.',
    details: 'Shows how close price came to hitting your stop loss. Consistently low MAE on winners indicates precise entries; high MAE suggests entering too early.',
    formula: 'MAE (LONG) = Entry Price - Lowest Low; MAE (SHORT) = Highest High - Entry Price',
    example: 'Buying at ₹500, dipping to ₹492 before rising to target ₹520 has an MAE of 8 points.',
    seeAlso: ['metric.mfe', 'metric.exitEfficiency'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#mae-mfe',
  },

  'metric.mfe': {
    title: 'Maximum Favorable Excursion (MFE)',
    summary: 'The peak unrealized profit or maximum favorable price reach before the trade exited.',
    details: 'Shows the maximum potential the trade offered. Comparing realized exit price against MFE highlights whether you captured the move or left money on the table.',
    formula: 'MFE (LONG) = Highest High - Entry Price; MFE (SHORT) = Entry Price - Lowest Low',
    example: 'Shorting at ₹200, dropping to ₹180 before exiting has an MFE of 20 points.',
    seeAlso: ['metric.mae', 'metric.exitEfficiency'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#mae-mfe',
  },

  'metric.exitEfficiency': {
    title: 'Exit Efficiency',
    summary: 'Percentage of the maximum favorable price move (MFE) captured at your actual exit.',
    details: 'Measures how well you timed your exit relative to the best available price during the trade.',
    formula: 'Exit Efficiency = (Exit Price - Entry Price) / (Peak MFE Price - Entry Price) * 100',
    example: 'Capturing 30 points of profit on a trade whose peak favorable move reached 40 points gives 75% efficiency.',
    caveats: 'Trades with zero MFE (no favorable move) return N/A (not applicable), avoiding artificial 100% inflation on flat trades. Trades with favorable runs ending in losses return 0%.',
    seeAlso: ['metric.mfe'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#exit-efficiency',
  },

  'metric.excursionFlags': {
    title: 'Excursion Analytical Flags',
    summary: 'Automated behavioural tags identifying execution patterns from candle excursion data.',
    details: 'Flags: GAVE_BACK_PROFIT (hit >=1.0R MFE but surrendered >50% peak gain), EXITED_EARLY (closed before full move while price ran >2x realized), STOP_TOO_TIGHT_EVIDENCE (stopped out before price reversed to +1R target territory without deep breach).',
    seeAlso: ['metric.mae', 'metric.mfe'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#excursion-flags',
  },

  'metric.gaveBackProfit': {
    title: 'Gave Back Profit Rate',
    summary: 'Percentage of evaluated trades that achieved significant favorable excursion (>=1.0R peak run) but surrendered >50% of profits before closing.',
    details: 'Highlights premature profit giveback and trailing stop inefficiencies. Planned runners and trailing stops that exit according to rule are excluded from false penalties.',
    formula: 'Gave Back Profit % = (Count of Trades with GAVE_BACK_PROFIT Flag / Total Evaluated Trades) * 100',
    example: 'A trade reaching +2.5R peak unrealized gain that reverses and closes at +0.2R triggers the gave-back profit metric.',
    seeAlso: ['metric.mfe', 'metric.exitEfficiency'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#mae-mfe',
  },

  'metric.postStopReversals': {
    title: 'Post-Stop Reversals (Stop Too Tight)',
    summary: 'Percentage of stopped-out trades where market price reversed and subsequently reached original profit targets.',
    details: 'Pinpoints stop-hunting or placing stop losses inside standard market noise / volatility bands. If high (>20%), consider widening stops to structural swing levels or ATR multiples.',
    formula: 'Reversal After Stop % = (Count of Stopped Trades Reversing to Target / Total Trades with Stops) * 100',
    example: 'Buying NIFTY at 22,000 with SL at 21,980. Price dips to 21,975, stops you out, then rallies to 22,100.',
    seeAlso: ['metric.mae', 'analytics.whatIf.calibration'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#mae-mfe',
  },

  'analytics.excursion.scatter': {
    title: 'MAE vs. MFE Scatter Matrix',
    summary: '2D mapping of trade drawdown (X-axis) against trade peak profit potential (Y-axis).',
    details: 'Top-Left Quadrant: Clean winners with low drawdown (<0.5R) and large runs. Top-Right: Rollercoaster trades that took high heat before winning. Bottom-Right: Heavy losers with zero favorable traction.',
    seeAlso: ['metric.mae', 'metric.mfe', 'metric.exitEfficiency'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#mae-mfe',
  },

  'metric.sampleReliability': {
    title: 'Sample Size Reliability',
    summary: 'Statistical confidence indicator based on the number of completed trades.',
    details: `Samples below 10 trades are labeled INSUFFICIENT; between 10 and ${MIN_RELIABLE_SAMPLE - 1} are LOW; and ${MIN_RELIABLE_SAMPLE}+ are statistically RELIABLE.`,
    caveats: 'Never adjust strategy rules based on fewer than 30 trade samples.',
    seeAlso: ['strategy.edgeVerdict'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#sample-size-rules',
  },

  // --------------------------------------------------------------------------
  // TRADE DETAIL & EXECUTION
  // --------------------------------------------------------------------------
  'trade.fees.autoManual': {
    title: 'Statutory Charges (Auto vs. Manual)',
    summary: 'Indicates whether brokerage, STT/CTT, exchange turnover, SEBI, and GST were calculated automatically.',
    details: 'AUTO fees use official SEBI/Exchange rate formulas for your asset class and broker flat rate (default ₹20/leg). MANUAL mode preserves user-entered or contract note charges.',
    caveats: 'Click "Reset to auto" to recalculate exact statutory charges from the regulatory schedule.',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#statutory-charges',
  },

  'trade.chartGen.padding': {
    title: 'Execution Chart Candle Padding',
    summary: `Number of historical candles displayed before trade entry and after trade exit (default ${DEFAULT_CHART_PADDING_CANDLES}, max ${MAX_CHART_PADDING_CANDLES}).`,
    details: `Allows visual inspection of pre-entry market structure and post-exit follow-through across up to ${MAX_CHART_TIMEFRAMES_PER_REQUEST} concurrent timeframes.`,
    caveats: 'Large padding values on older trades may be clamped if broker history limits are reached.',
    docsAnchor: 'docs/FILE_STORAGE_AND_ATTACHMENTS.md#automated-chart-generation',
  },

  'trade.stopMoves.audit': {
    title: 'Stop-Loss Modification Audit',
    summary: 'Tracks whether manual stop-loss adjustments reduced risk (trailed) or increased risk (widened).',
    details: 'Trailing stops favorably locks in profit or lowers risk. Widening stops violates discipline by increasing potential loss beyond the initial plan.',
    caveats: 'Widening risk penalizes your trade discipline score.',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#stop-loss-moves',
  },

  'trade.form.lotVsQty': {
    title: 'Lots vs. Quantity (Shares/Units)',
    summary: 'Quantity is the total number of traded shares or units, which equals lots multiplied by market lot size.',
    details: 'For Indian F&O contracts, entering lot count automatically computes total quantity based on the instrument specification.',
    example: 'For NIFTY (lot size 25), 2 lots = 50 total quantity.',
    seeAlso: ['trade.form.multiplier'],
    docsAnchor: 'docs/DATABASE_SCHEMA.md#instruments',
  },

  'trade.form.multiplier': {
    title: 'Contract Multiplier',
    summary: 'Point value multiplier applied to price differences when calculating gross derivative P&L.',
    details: 'For standard equities and futures this is 1.0. For select commodity or currency contracts, it scales tick values.',
    formula: 'Gross P&L = (Exit Price - Entry Price) * Quantity * Multiplier',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#gross-pnl',
  },

  'trade.form.tickSize': {
    title: 'Instrument Tick Size',
    summary: 'The minimum allowable price fluctuation for orders on the exchange.',
    details: 'For NSE equities and index derivatives, standard tick size is ₹0.05. Stops, targets, and simulated executions round to this increment.',
    seeAlso: ['analytics.whatIf.slippage'],
    docsAnchor: 'docs/DATABASE_SCHEMA.md#instruments',
  },

  'trade.form.sessionCodes': {
    title: 'Trading Session Codes',
    summary: 'Classifies trade timing into market market segments: NSE_REGULAR, MCX_EVENING, or OFF_HOURS.',
    details: 'NSE_REGULAR covers 09:15 to 15:30 IST. MCX_EVENING covers commodity trading up to 23:30/23:55 IST. Enables session-based edge breakdown.',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#trading-sessions',
  },

  'trade.form.fifo': {
    title: 'FIFO Execution Matching',
    summary: 'Matches multiple buy and sell fills on a First-In-First-Out basis to compute realized P&L.',
    details: 'When scaling into positions or exiting in parts, earlier entries are matched against earlier exits to compute tax-accurate cost basis and net profit.',
    caveats: 'Exiting more quantity than entered triggers an excess-exit validation error.',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#fifo-execution',
  },

  // --------------------------------------------------------------------------
  // ACCOUNTS, BALANCES & IMPORTS
  // --------------------------------------------------------------------------
  'account.balanceFormula': {
    title: 'Authoritative Account Balance Formula',
    summary: 'Current balance is computed from initial capital, closed trade net profits, deposits, withdrawals, and adjustments.',
    details: 'Direct manual edits to account balances are disabled to preserve double-entry audit integrity. Balance is always recomputed from underlying records.',
    formula: 'Current = Initial Balance + Sum(Closed Trade Net P&L) + Deposits - Withdrawals + Adjustments',
    example: 'Starting with ₹1,00,000, adding ₹25,000 net profits and withdrawing ₹10,000 results in ₹1,15,000 current balance.',
    caveats: 'Direct manual balance edits are prohibited; record explicit transactions or adjustments instead.',
    seeAlso: ['account.reconcile', 'account.pendingAdjustment'],
    docsAnchor: 'docs/DATABASE_SCHEMA.md#account-balance-invariants',
  },

  'account.reconcile': {
    title: 'Reconcile Account Balance',
    summary: 'Recalculates the ledger balance directly from all closed trades, cash transfers, and adjustments.',
    details: 'Ensures account balance exactly equals the mathematical sum of its parts. Safe to run at any time.',
    docsAnchor: 'docs/DATABASE_SCHEMA.md#account-balance-invariants',
  },

  'account.driftTolerance': {
    title: 'Broker Balance Drift Tolerance',
    summary: 'Discrepancy threshold between your journal balance and broker live cash balance that triggers an adjustment.',
    details: 'Minor intraday drift often arises from unbilled taxes or pending settlements. Drifts exceeding ₹1.00 suggest a review adjustment.',
    seeAlso: ['account.pendingAdjustment'],
    docsAnchor: 'docs/FYERS_INTEGRATION.md#funds-synchronization',
  },

  'account.pendingAdjustment': {
    title: 'Pending Broker Adjustment',
    summary: 'Suggested adjustment to synchronize journal cash with verified broker funds.',
    details: 'Confirming logs an audit-tracked cash adjustment to align balances. Rejecting dismisses the suggestion without altering account ledger history.',
    seeAlso: ['account.driftTolerance', 'account.balanceFormula'],
    docsAnchor: 'docs/FYERS_INTEGRATION.md#funds-synchronization',
  },

  'account.archiveVsDelete': {
    title: 'Archiving vs. Deleting Accounts',
    summary: 'Accounts with historical trade records are archived rather than deleted to protect trading history.',
    details: 'Deleting an account with trades archives it (status: ARCHIVED). This hides it from daily dropdowns while preserving tax, analytics, and P&L history.',
    caveats: 'Only accounts with zero linked trades can be permanently deleted.',
    docsAnchor: 'docs/DATABASE_SCHEMA.md#trading-accounts',
  },

  'import.undoBatch': {
    title: 'Undo CSV Import Batch',
    summary: 'Atomically rolls back an entire CSV tradebook import batch and deletes imported records.',
    details: 'Removes all trades created in that import session and recalculates account balances in a single transaction. Previews exact count before deletion.',
    caveats: 'Irreversible action. Any edits made to imported trades since import will be removed.',
    docsAnchor: 'docs/API_REFERENCE.md#import-undo',
  },

  'import.columnMapping': {
    title: 'Column Mapping Presets',
    summary: 'Remembers which CSV header corresponds to symbol, price, quantity, date, and order type.',
    details: 'SetupMint auto-detects Zerodha, FYERS, Angel One, and Upstox formats. Custom spreadsheets can save mapping presets for one-click future imports.',
    docsAnchor: 'docs/API_REFERENCE.md#csv-import',
  },

  // --------------------------------------------------------------------------
  // SETTINGS & SYSTEM CONCEPTS
  // --------------------------------------------------------------------------
  'settings.fyersExpiry': {
    title: 'Daily FYERS Token Expiry (06:30 IST)',
    summary: 'Indian broker security mandates that API access tokens expire daily at 06:30 AM IST.',
    details: 'Log in once each morning via Settings or the top navigation bar to refresh your session for automated tradebook sync and live market data.',
    docsAnchor: 'docs/FYERS_INTEGRATION.md#daily-session-lifecycle',
  },

  'settings.angelOneFallback': {
    title: 'Angel One SmartAPI Market Data Fallback',
    summary: 'Secondary historical candle provider used when FYERS history is unavailable or unauthenticated.',
    details: 'SmartAPI is strictly market-data-only; zero trading capabilities or order execution permissions are used. Governed by a daily API request budget.',
    docsAnchor: 'docs/AI_CONTEXT.md#market-data-fallback-chain',
  },

  'settings.riskGuardrails': {
    title: 'Portfolio Risk Guardrails',
    summary: 'Automated warnings and alerts when daily loss or per-trade risk limits are approached.',
    details: 'Guardrails notify you when a single trade exceeds your max capital risk percentage or when cumulative daily losses breach your threshold.',
    caveats: 'Advisory guidance designed to curb emotional overtrading; does not lock broker order placement.',
    docsAnchor: 'docs/DATABASE_SCHEMA.md#trading-accounts',
  },

  'instrument.tradedOnly': {
    title: 'Traded-Only Instrument Invariant',
    summary: 'The instruments list contains only symbols and underlyings you have personally traded or custom-created.',
    details: 'SetupMint does not clutter your workspace with global catalogs. Traded underlyings are auto-created on-demand when logging trades.',
    docsAnchor: 'docs/DATABASE_SCHEMA.md#instruments',
  },

  'instrument.cascadeSpecs': {
    title: 'Cascade Specs to Historical Trades',
    summary: 'Updates lot size, tick size, or multiplier on existing closed trades for this instrument.',
    details: 'When enabled, modifying instrument specifications recalculates gross P&L, fees, and account balance reconciliation across all linked trades in one transaction.',
    docsAnchor: 'docs/DATABASE_SCHEMA.md#instruments',
  },

  'strategy.edgeVerdict': {
    title: 'Statistical Edge Verdict',
    summary: 'Validates whether a strategy exhibits a statistically proven edge over random chance.',
    details: 'Verdict: LIKELY_EDGE (90% bootstrap confidence interval / 5th percentile lower bound of win rate > 50% and positive expectancy), NO_EDGE_NEGATIVE (statistically unprofitable), or UNPROVEN (insufficient trades).',
    caveats: `Requires at least ${MIN_RELIABLE_SAMPLE} closed trades before a strategy can be confirmed as having an edge.`,
    seeAlso: ['metric.expectancy', 'metric.sampleReliability'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#statistical-edge-validation',
  },

  'strategy.invariantCheck': {
    title: 'Parent/Child Invariant Check',
    summary: 'Validates that performance metrics across child setup variants sum exactly to parent strategy metrics.',
    details: 'Guarantees that trade counts, win rates, and net P&L across all variants mathematically reconcile with the parent playbook without orphaned trades.',
    docsAnchor: 'docs/DATABASE_SCHEMA.md#parent-strategy-variants',
  },

  'journal.disciplineScore': {
    title: 'Discipline Score & Penalties',
    summary: 'Daily rating starting at 100%, penalized by behavioural mistakes like chasing or moving stop loss.',
    details: 'Reinforces process over outcome. A winning day with poor discipline receives a low score, highlighting rule violations.',
    formula: 'Score = 100 - Sum(Mistake Penalties)',
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#discipline-scoring',
  },

  'dashboard.reviewQueue': {
    title: 'Trade Review Queue Criteria',
    summary: 'Highlights closed trades requiring post-trade journaling, mistake tagging, or chart attachment.',
    details: 'Trades appear here if they are unreviewed, lack mistake reflection tags on losses, or have missing execution chart screenshots.',
    docsAnchor: 'docs/ROUTES_AND_PAGES.md#dashboard',
  },

  'review.weekly': {
    title: 'Weekly Review Report',
    summary: 'Synthesizes an entire trading week into one structured review with KPI deltas, mistakes, and discipline trends.',
    details: 'Calculates reconciled net P&L, expectancy, R-multiples, setup reliability via empirical-Bayes shrunk expectancy, and session distributions without floating-point error.',
    seeAlso: ['review.focusRule', 'metric.expectancy', 'journal.disciplineScore'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#weekly-review-aggregation',
  },

  'review.focusRule': {
    title: 'Weekly Focus Rule',
    summary: 'A single rule chosen for the upcoming week based on objective priority: daily loss breaches, mistake costs, or setup edge.',
    details: 'Evaluated deterministically the following week against closed trades to verify adherence and build consistency.',
    seeAlso: ['review.weekly', 'settings.riskGuardrails'],
    docsAnchor: 'docs/TRADING_CALCULATIONS.md#focus-rule-suggestions',
  },
};
