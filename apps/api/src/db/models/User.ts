import mongoose, { Document, Schema } from 'mongoose';
import {
  IPatternDetectionSettings,
  DEFAULT_PATTERN_DETECTION_SETTINGS,
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
      default: 'INR',
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
      telegramAlertsEnabled: { type: Boolean, default: false },
      telegramBotToken: { type: String },
      telegramChatId: { type: String },
      telegramAlertEvents: { type: Object, default: DEFAULT_LIVE_WATCHER_SETTINGS.telegramAlertEvents },
      telegramAttachLiveChart: { type: Boolean, default: true },
      telegramChartTimeframe: { type: String, default: '5' },
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
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        if (ret.liveWatcherSettings?.telegramBotToken) {
          ret.liveWatcherSettings.telegramBotToken = '••••••••';
        }
        return ret;
      },
    },
  }
);

export const User = mongoose.model<IUserDoc>('User', UserSchema);
