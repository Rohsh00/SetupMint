import mongoose, { Document, Schema } from 'mongoose';
import {
  IPatternDetectionSettings,
  DEFAULT_PATTERN_DETECTION_SETTINGS,
  DEFAULT_EXCURSION_SETTINGS,
  ILiveWatcherSettings,
  DEFAULT_LIVE_WATCHER_SETTINGS,
} from '@tradevault/shared';

export interface IUserRiskSettings {
  maxDailyLoss?: number;
  maxDailyTrades?: number;
  maxOpenTrades?: number;
  maxRiskPerTradePercent?: number;
  revengeTradingMinutes?: number;
}

export interface IUserDoc extends Document {
  email: string;
  passwordHash: string;
  name: string;
  baseCurrency: string;
  theme: 'dark' | 'light' | 'system';
  defaultAccountScope?: string;
  riskSettings?: IUserRiskSettings;
  patternDetectionSettings?: IPatternDetectionSettings;
  liveWatcherSettings?: ILiveWatcherSettings;
  aiSettings?: {
    geminiApiKey?: string;
    enabled?: boolean;
    model?: string;
    provider?: 'GEMINI' | 'OLLAMA' | 'LOCAL_OPENAI';
    localEndpoint?: string;
    localModel?: string;
    autoAnalyzeTrades?: boolean;
    autoApplyTradeDetails?: boolean;
    dailyRequestLimit?: number;
    minuteRequestLimit?: number;
    tier?: string;
    scheduledMorningBriefingEnabled?: boolean;
    morningBriefingTime?: string;
    scheduledEodDebriefEnabled?: boolean;
    eodDebriefTime?: string;
    userTimezone?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    baseCurrency: {
      type: String,
      trim: true,
    },
    theme: {
      type: String,
      enum: ['dark', 'light', 'system'],
      default: 'dark',
    },
    defaultAccountScope: {
      type: String,
      default: 'ALL',
      trim: true,
    },
    riskSettings: {
      maxDailyLoss: { type: Number, default: 5000 },
      maxDailyTrades: { type: Number, default: 6 },
      maxOpenTrades: { type: Number, default: 3 },
      maxRiskPerTradePercent: { type: Number, default: 2.0 },
      revengeTradingMinutes: { type: Number, default: 30 },
    },
    patternDetectionSettings: {
      defaultHtf: { type: String, default: '240' },
      defaultLtf: { type: String, default: '5' },
      autoDetectOnImport: { type: Boolean, default: true },
      autoDetectMistakes: { type: Boolean, default: true },
      instrumentOverrides: {
        type: [
          {
            symbol: { type: String, required: true },
            htf: { type: String, required: true },
            ltf: { type: String, required: true },
            preferredStrategyId: { type: String },
            preferredStrategyName: { type: String },
          },
        ],
        default: DEFAULT_PATTERN_DETECTION_SETTINGS.instrumentOverrides,
      },
      excursionSettings: {
        gaveBackMinMfeR: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.gaveBackMinMfeR },
        gaveBackEfficiencyThreshold: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.gaveBackEfficiencyThreshold },
        earlyExitEfficiencyThreshold: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.earlyExitEfficiencyThreshold },
        stopTooTightReversalR: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.stopTooTightReversalR },
        stopTooTightCandleLookahead: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.stopTooTightCandleLookahead },
        stopTooTightMaxBreachBufferR: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.stopTooTightMaxBreachBufferR },
        entryQualityCandleCount: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.entryQualityCandleCount },
        postExitLookaheadMinutes: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.postExitLookaheadMinutes },
        adaptiveLookahead: { type: Boolean, default: DEFAULT_EXCURSION_SETTINGS.adaptiveLookahead },
        clampToSessionClose: { type: Boolean, default: DEFAULT_EXCURSION_SETTINGS.clampToSessionClose },
        optimalExitMinAdverseR: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.optimalExitMinAdverseR },
        optimalExitMaxRunBeyondR: { type: Number, default: DEFAULT_EXCURSION_SETTINGS.optimalExitMaxRunBeyondR },
      },
    },
    liveWatcherSettings: {
      defaultAutoExecute: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.defaultAutoExecute },
      defaultTargetMode: { type: String, default: DEFAULT_LIVE_WATCHER_SETTINGS.defaultTargetMode },
      t1MultipleR: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t1MultipleR },
      t1ExitRatio: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t1ExitRatio },
      t1TrailingAction: { type: String, default: DEFAULT_LIVE_WATCHER_SETTINGS.t1TrailingAction },
      t1TrailPoints: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t1TrailPoints },
      t2Enabled: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.t2Enabled },
      t2MultipleR: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t2MultipleR },
      t2ExitRatio: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t2ExitRatio },
      t2TrailingAction: { type: String, default: DEFAULT_LIVE_WATCHER_SETTINGS.t2TrailingAction },
      t2TrailPoints: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t2TrailPoints },
      isFreeRunner: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.isFreeRunner },
      t3MultipleR: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.t3MultipleR },
      dynamicTrailingEnabled: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTrailingEnabled },
      dynamicTriggerR: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTriggerR },
      dynamicTrailType: { type: String, default: DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTrailType },
      dynamicStepR: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.dynamicStepR },
      dynamicTrailPoints: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTrailPoints },
      givebackAutoExitEnabled: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.givebackAutoExitEnabled },
      givebackMinPeakR: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.givebackMinPeakR },
      givebackMaxPercent: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.givebackMaxPercent },
      misSquareOffEnabled: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.misSquareOffEnabled },
      misSquareOffTime: { type: String, default: DEFAULT_LIVE_WATCHER_SETTINGS.misSquareOffTime },
      scalperHotkeysEnabled: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.scalperHotkeysEnabled },
      soundAlertsEnabled: { type: Boolean, default: DEFAULT_LIVE_WATCHER_SETTINGS.soundAlertsEnabled },
      defaultRefreshIntervalSec: { type: Number, default: DEFAULT_LIVE_WATCHER_SETTINGS.defaultRefreshIntervalSec },
      paperExecutionMode: { type: Boolean, default: false },
      serverSideExecutionEnabled: { type: Boolean, default: true },
      executionAlgorithm: { type: String, default: 'PEGGED_CHASE' },
      maxSlippagePercent: { type: Number, default: 0.05 },
      maxSlippagePoints: { type: Number, default: 2 },
      spreadSurgeProtectionEnabled: { type: Boolean, default: true },
      spreadSurgeMultiplier: { type: Number, default: 2.0 },
      antiLoopProtectionEnabled: { type: Boolean, default: true },
      orderRateLimitPer5Sec: { type: Number, default: 3 },
      targetDistributionMode: { type: String, default: 'DEFENSIVE_50_30_20' },
      beCushionTicks: { type: Number, default: 2 },
      assetProfile: { type: String, default: 'INDEX_FUTURES' },
      openingBellFreezeEnabled: { type: Boolean, default: false },
      openingBellFreezeMinutes: { type: Number, default: 5 },
      macroNewsLockoutEnabled: { type: Boolean, default: true },
      scaleInEnabled: { type: Boolean, default: false },
      scaleInTriggerR: { type: Number, default: 1.5 },
      scaleInSizePercent: { type: Number, default: 25 },
      scaleInCondition: { type: String, default: 'AFTER_TRUE_BE' },
      telegramNotifyOnAutoExecution: { type: Boolean, default: true },
      telegramAlertsEnabled: { type: Boolean, default: false },
      telegramBotToken: { type: String },
      telegramChatId: { type: String },
      carPlayToken: { type: String },
      telegramAlertEvents: { type: Object, default: DEFAULT_LIVE_WATCHER_SETTINGS.telegramAlertEvents },
      lastDailyLossAlertDate: { type: String },
      lastDailyLossWarnDate: { type: String },
      lastMorningTokenAlertDate: { type: String },
      lastTokenExpiryAlertAt: { type: Number },
      lastEodDigestDate: { type: String },
      telegramAttachLiveChart: { type: Boolean, default: true },
      telegramChartTimeframe: { type: String, default: '5' },
      goldNewsReminderMinutes: { type: Number, default: 15 },
      goldNewsLeadTimesMinutes: { type: [Number], default: [15, 60] },
      goldNewsImpactFilter: { type: String, default: 'ALL_GOLD_MOVERS' },
      slippageGuardPercent: { type: Number, default: 0.5 },
      snoozeDefaultMin: { type: Number, default: 10 },
      quietHours: { type: Object },
      telegramAlertPolicies: { type: Object },
      hardDisciplineLockoutEnabled: { type: Boolean, default: false },
      hardDisciplineLockoutDurationMins: { type: Number, default: 60 },
      staleDataThresholdSeconds: { type: Number, default: 10 },
      requireHoldToConfirm: { type: Boolean, default: true },
      cardDensity: { type: String, enum: ['glance', 'standard', 'deep'], default: 'standard' },
      sortMode: { type: String, enum: ['urgency', 'entryTime'], default: 'urgency' },
      ladderViewMode: { type: String, enum: ['classic', 'vertical'], default: 'classic' },
      layoutPresets: {
        type: [
          {
            id: { type: String, required: true },
            name: { type: String, required: true },
            refreshIntervalSec: { type: Number, required: true },
            cardDensity: { type: String, enum: ['glance', 'standard', 'deep'], required: true },
            ladderViewMode: { type: String, enum: ['classic', 'vertical'], required: true },
            sortMode: { type: String, enum: ['urgency', 'entryTime'], required: true },
            scalperHotkeysEnabled: { type: Boolean, required: true },
            isBuiltIn: { type: Boolean, default: false },
          },
        ],
        default: DEFAULT_LIVE_WATCHER_SETTINGS.layoutPresets,
      },
      activePresetId: { type: String, default: 'positional' },
      displaySettings: {
        type: Object,
        default: DEFAULT_LIVE_WATCHER_SETTINGS.displaySettings,
      },
      telegramForexPresets: {
        goldDefaultLot: { type: Number, default: 0.10 },
        goldSlPoints: { type: Number, default: 35 },
        goldRrRatio: { type: Number, default: 2.0 },
        ethDefaultLot: { type: Number, default: 1.0 },
        ethSlPrice: { type: Number, default: 30 },
        ethRrRatio: { type: Number, default: 2.5 },
        defaultDollarRisk: { type: Number, default: 50 },
      },
      telegramPinnedCockpitMessageId: { type: Number },
      telegramPinnedCockpitChatId: { type: Schema.Types.Mixed },
      restrictTelegramTradeExecution: { type: Boolean, default: false },
      enforceTelegramOrderGuardrails: { type: Boolean, default: true },
      enforceAdaptiveDayRiskGuardrails: { type: Boolean, default: true },
    },
    aiSettings: {
      geminiApiKey: { type: String },
      enabled: { type: Boolean, default: true },
      model: { type: String, default: 'gemini-2.5-flash' },
      provider: { type: String, enum: ['GEMINI', 'OLLAMA', 'LOCAL_OPENAI'], default: 'GEMINI' },
      localEndpoint: { type: String, default: 'http://localhost:11434' },
      localModel: { type: String, default: 'llama3.3:8b' },
      autoAnalyzeTrades: { type: Boolean, default: true },
      autoApplyTradeDetails: { type: Boolean, default: false },
      dailyRequestLimit: { type: Number, default: 1500 },
      minuteRequestLimit: { type: Number, default: 15 },
      tier: { type: String, default: 'free' },
      scheduledMorningBriefingEnabled: { type: Boolean, default: true },
      morningBriefingTime: { type: String, default: '08:30' },
      scheduledEodDebriefEnabled: { type: Boolean, default: true },
      eodDebriefTime: { type: String, default: '18:00' },
      userTimezone: { type: String, default: 'Asia/Kolkata' },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        if (ret.liveWatcherSettings?.telegramBotToken) {
          ret.liveWatcherSettings.telegramBotToken = '••••••••';
        }
        if (ret.aiSettings?.geminiApiKey) {
          ret.aiSettings.geminiApiKey = '••••••••';
        }
        return ret;
      },
    },
  }
);

export const User = mongoose.model<IUserDoc>('User', UserSchema);
